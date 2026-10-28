// Figma plugin-API renderer for the doc card (v5). This file is NOT a Node
// module — build-doc-card-builder.mjs concatenates it after the inlined planner
// (doc-card-plan.mjs) into references/doc-card-builder.md, and the result runs
// inside figma_execute (dynamic-page mode). Constraints honored here (see
// references/figma-scripting.md): async APIs only, style set BEFORE
// .characters, fonts loaded up front, layoutSizing setters over resize(),
// bound paints seeded light-gray (never pure black).
//
// In-scope globals when assembled: planDocCard, cardWidth, statusVariant,
// STATUS_OPTIONS, CARD_MIN_WIDTH, DOC_CARD_RENDERER_VERSION, fnv1a (inlined
// planner) and the caller-filled slot CANONICAL_FP.
//
// Contract: docs/specs/2026-10-15-doc-card-v5.md (Plan, Step 1.3).

const REQUIRED_VARS = [
  'textDefault', 'textMuted', 'tonePositive', 'toneNegative', 'border',
  'spacePadding', 'spaceRowGap', 'spaceBlockGap', 'spaceItemGap',
  'surfaceBand', 'surfaceHeader', 'textOnHeader', 'radiusBand', 'toneCaution',
];
const REQUIRED_TEXT_STYLES = ['title', 'bandTitle', 'body', 'caption'];

const NS = 'throughline';
const KIT_PAGE = 'Documentation Kit';

// Bound paint, seeded with a light-gray approximation — a failed/late bind must
// never render pure black (reads as accidental dark mode).
function boundPaint(variable) {
  return figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.87 } }, 'color', variable,
  );
}

function bindPadding(node, variable) {
  for (const side of ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']) node.setBoundVariable(side, variable);
}

function bindRadius(node, variable) {
  for (const corner of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) node.setBoundVariable(corner, variable);
}

// A kit property is matched by the part of its key before '#' (variant keys
// have none). Zero or several matches throws, naming it (decision 21).
function propKey(defs, name, owner) {
  const keys = Object.keys(defs).filter((k) => k.split('#')[0] === name);
  if (keys.length !== 1) {
    throw new Error('renderDocCard: kit component "' + owner + '" has ' + keys.length + ' properties named "' + name
      + '" — the renderer sets kit properties by name and never edits the kit; restore exactly one "' + name + '" property');
  }
  return keys[0];
}

async function loadNodeFonts(root) {
  const texts = root.type === 'TEXT' ? [root] : root.findAll((n) => n.type === 'TEXT');
  for (const t of texts) {
    if (t.characters.length === 0) await figma.loadFontAsync(t.fontName);
    else for (const f of t.getRangeAllFontNames(0, t.characters.length)) await figma.loadFontAsync(f);
  }
}

function hexOf(c) {
  return '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

// A node's first visible solid fill as hex, a bound variable resolved in
// `consumer`'s mode; null when it has none.
async function solidHex(node, consumer) {
  const p = Array.isArray(node.fills) ? node.fills.find((f) => f.type === 'SOLID' && f.visible !== false) : null;
  if (!p) return null;
  const id = p.boundVariables && p.boundVariables.color && p.boundVariables.color.id;
  const v = id ? await figma.variables.getVariableByIdAsync(id) : null;
  return hexOf(v ? v.resolveForConsumer(consumer).value : p.color);
}

async function findTagged(key) {
  return figma.root.findAllWithCriteria({ sharedPluginData: { namespace: NS, keys: [key] } });
}

async function headerInstanceOf(card, kitHeader) {
  for (const child of card.children) {
    if (child.type !== 'INSTANCE') continue;
    const main = await child.getMainComponentAsync();  // .mainComponent throws in dynamic-page mode
    const set = main && main.parent;
    if (set && set.type === 'COMPONENT_SET'
      && (kitHeader ? set.id === kitHeader.id : set.getSharedPluginData(NS, 'docKit') === 'header')) {
      return child;
    }
  }
  return null;
}

async function renderDocCard({ componentName, nodeId, record, vars, textStyles, fileKey, docKitFileKey, status }) {
  // Bind-or-throw: a missing variable or style is a gap in the token set —
  // never fall back to a hex/px.
  for (const key of REQUIRED_VARS) {
    if (!vars || !vars[key]) throw new Error('renderDocCard: missing required variable "' + key + '" — record it in figma.docCardVariables');
  }
  for (const key of REQUIRED_TEXT_STYLES) {
    if (!textStyles || !textStyles[key]) throw new Error('renderDocCard: missing required text style "' + key + '" — record it in figma.docCardTextStyles');
  }
  if (!fileKey) throw new Error('renderDocCard: fileKey is required (design-system.json figma.fileKey)');

  // ── 1. Card ────────────────────────────────────────────────────────────────
  await figma.loadAllPagesAsync();
  const tagged = (await findTagged('docCard')).filter((n) => n.getSharedPluginData(NS, 'docCard') === componentName);
  if (tagged.length > 1) {
    throw new Error('renderDocCard: ' + tagged.length + ' cards are tagged "' + componentName + '" ('
      + tagged.map((n) => n.id).join(', ') + ') — remove the tag from all but one');
  }
  let card = tagged[0] || null;
  const wasTagged = !!card;
  if (!card) {
    if (!nodeId) {
      throw new Error('renderDocCard: no doc card is tagged "' + componentName
        + '" — pass --node-id <card frame id> once; the render tags it for next time');
    }
    card = await figma.getNodeByIdAsync(nodeId);
    if (!card) throw new Error('renderDocCard: no node ' + nodeId + ' in this file');
  }
  if (card.type !== 'FRAME' || card.layoutMode !== 'VERTICAL') {
    throw new Error('renderDocCard: the doc card must be a VERTICAL auto-layout frame; got ' + card.type + ' layoutMode=' + card.layoutMode);
  }
  // One component per doc card (decision 19).
  const sets = card.findAll((n) => n.type === 'COMPONENT_SET');
  const foreign = card.findChild((n) => n.name !== 'Usage' && n.name.startsWith('Usage'));
  if (sets.length > 1 || foreign) {
    throw new Error('renderDocCard: card ' + card.id + ' holds '
      + (foreign ? 'band "' + foreign.name + '"' : sets.length + ' component sets')
      + ' — one component per doc card; split this card so each component owns its own card before re-rendering');
  }
  if (sets.length === 0) throw new Error('renderDocCard: no COMPONENT_SET found inside card ' + card.id);
  const specimen = sets[0];
  if (specimen.name !== componentName) {
    throw new Error('renderDocCard: card ' + card.id + ' holds set "' + specimen.name + '", not "' + componentName + '"');
  }

  // ── 2. Shape ───────────────────────────────────────────────────────────────
  const taggedKit = await findTagged('docKit');
  let kitHeader = taggedKit.find((n) => n.type === 'COMPONENT_SET' && n.getSharedPluginData(NS, 'docKit') === 'header') || null;
  let kitBandHeader = taggedKit.find((n) => n.type === 'COMPONENT' && n.getSharedPluginData(NS, 'docKit') === 'bandHeader') || null;

  const headerInstance = await headerInstanceOf(card, kitHeader);
  let specimenHolder = null;
  let specimenBand = null;
  let legacyUsage = null;
  let legacyHeader = null;
  const legacyDividers = [];
  const ownedBands = [];
  const fingerprints = [];
  for (const child of card.children) {
    if (child === headerInstance) continue;
    if (child.id === specimen.id || (child.findOne && child.findOne((d) => d.id === specimen.id))) {
      specimenHolder = child;
      if (child.type === 'FRAME' && child.name === 'Band: Specimen') specimenBand = child;
    } else if (child.type === 'FRAME' && child.name.startsWith('Band: ')) ownedBands.push(child);
    else if (child.type === 'FRAME' && child.name === 'Usage') legacyUsage = child;
    else if (child.type === 'TEXT' && child.name === 'Doc Fingerprint') fingerprints.push(child);
    else if (child.name === 'Header Divider') legacyDividers.push(child);
    else if (child.type === 'FRAME' && !headerInstance && !legacyHeader) legacyHeader = child;
    else {
      throw new Error('renderDocCard: card ' + card.id + ' has an unexpected child "' + child.name + '" (' + child.type + ', '
        + child.id + ') — move it off the card or delete it, then re-run');
    }
  }

  // ── 3. Kit, found ──────────────────────────────────────────────────────────
  if (docKitFileKey) {
    const rootKey = figma.root.getSharedPluginData(NS, 'docKitFile');
    if (rootKey !== docKitFileKey) {
      throw new Error('renderDocCard: figma.docKit was drawn in file ' + docKitFileKey + ' but this file is tagged "'
        + (rootKey || '(untagged)') + '" — open the right file, or set figma.docKit to null to draw a kit here');
    }
    if (!kitHeader || !kitBandHeader) {
      throw new Error('renderDocCard: figma.docKit is recorded but the kit\'s '
        + [!kitHeader && '_Doc/Header', !kitBandHeader && '_Doc/Band header'].filter(Boolean).join(' and ')
        + ' is not in this file — set figma.docKit to null to have the next render draw a fresh kit');
    }
  } else if (kitHeader || kitBandHeader) {
    throw new Error('renderDocCard: a doc kit already exists in this file ('
      + [kitHeader, kitBandHeader].filter(Boolean).map((n) => n.id).join(', ')
      + ') but figma.docKit is null — record figma.docKit = { fileKey } to use it, or delete it to draw a fresh one');
  }
  if (kitHeader) {
    const defs = kitHeader.componentPropertyDefinitions;
    for (const name of ['Status', 'Title', 'Summary', 'Updated']) propKey(defs, name, '_Doc/Header');
    for (const name of ['Title', 'Lede', 'Unreviewed']) propKey(kitBandHeader.componentPropertyDefinitions, name, '_Doc/Band header');
  }
  // The header must stand apart from the card it sits on (decision 4), checked
  // in the card's own mode before anything is written.
  const cardFill = await solidHex(card, card);
  let contrast = null;
  if (cardFill) {
    const headerFill = kitHeader
      ? await solidHex(kitHeader.defaultVariant, card)
      : hexOf(vars.surfaceHeader.resolveForConsumer(card).value);
    if (headerFill) contrast = Object.assign({ header: headerFill, card: cardFill }, headerContrast(headerFill, cardFill));
    if (contrast && contrast.verdict === 'refuse') {
      throw new Error('renderDocCard: the header fill ' + headerFill + ' matches the fill of card ' + card.id
        + ' — the header must stand apart from the card (decision 4); '
        + (kitHeader ? 'restyle _Doc/Header in the kit' : 'pick a docCardVariables.surfaceHeader that differs from the card'));
    }
  }

  // ── 4. Status ──────────────────────────────────────────────────────────────
  const newStatus = headerInstance ? null : statusVariant(status);

  // ── 5. Plan ────────────────────────────────────────────────────────────────
  const plan = planDocCard(record);

  // Fonts, up front — before any text node exists.
  for (const key of REQUIRED_TEXT_STYLES) await figma.loadFontAsync(textStyles[key].fontName);

  const text = async (styleKey, chars, colorVar, name) => {
    const t = figma.createText();
    await t.setTextStyleIdAsync(textStyles[styleKey].id);  // style BEFORE characters
    t.characters = chars;
    t.fills = [boundPaint(colorVar)];
    if (name) t.name = name;
    return t;
  };
  const fillWidth = (parent, node) => {
    parent.appendChild(node);
    if (node.type === 'TEXT') node.textAutoResize = 'HEIGHT';
    node.layoutSizingHorizontal = 'FILL';
  };
  const autoFrame = (name, direction) => {
    const f = figma.createFrame();
    f.name = name;
    f.layoutMode = direction;
    f.fills = [];
    f.clipsContent = false;
    return f;
  };
  // An outline chip: no fill; outline and label in the tone (decisions 27, 28).
  const chip = async (name, label, toneVar) => {
    const c = autoFrame(name, 'HORIZONTAL');
    c.strokes = [boundPaint(toneVar)];
    c.strokeWeight = 1;
    bindRadius(c, vars.radiusBand);
    bindPadding(c, vars.spaceItemGap);
    c.layoutSizingHorizontal = 'HUG';
    c.layoutSizingVertical = 'HUG';
    c.appendChild(await text('caption', label, toneVar, 'Chip Label'));
    return c;
  };

  // ── 6. Kit, drawn (first render only) ──────────────────────────────────────
  let kitDrawn = false;
  if (!docKitFileKey) {
    let page = figma.root.children.find((p) => p.name === KIT_PAGE);
    if (!page) { page = figma.createPage(); page.name = KIT_PAGE; }

    const variants = [];
    for (const option of STATUS_OPTIONS) {
      const c = figma.createComponent();
      page.appendChild(c);
      c.name = 'Status=' + option;
      c.layoutMode = 'VERTICAL';
      c.fills = [boundPaint(vars.surfaceHeader)];
      bindRadius(c, vars.radiusBand);
      bindPadding(c, vars.spacePadding);
      c.setBoundVariable('itemSpacing', vars.spaceItemGap);
      c.resize(CARD_MIN_WIDTH, c.height);
      c.layoutSizingHorizontal = 'FIXED';
      c.layoutSizingVertical = 'HUG';
      const row = autoFrame('Title Row', 'HORIZONTAL');
      row.counterAxisAlignItems = 'CENTER';
      row.setBoundVariable('itemSpacing', vars.spaceItemGap);
      fillWidth(c, row);
      row.layoutSizingVertical = 'HUG';
      row.appendChild(await text('title', 'Component', vars.textOnHeader, 'Title'));
      row.appendChild(await chip('Status', option, vars.textOnHeader));  // tones vanish on a brand header (decision 27)
      fillWidth(c, await text('body', 'Summary', vars.textOnHeader, 'Summary'));
      c.appendChild(await text('caption', 'YYYY-MM-DD', vars.textOnHeader, 'Updated'));
      variants.push(c);
    }
    kitHeader = figma.combineAsVariants(variants, page);
    kitHeader.name = '_Doc/Header';
    kitHeader.layoutMode = 'VERTICAL';
    kitHeader.setBoundVariable('itemSpacing', vars.spaceRowGap);
    kitHeader.layoutSizingHorizontal = 'HUG';
    kitHeader.layoutSizingVertical = 'HUG';
    for (const [name, sample] of [['Title', 'Component'], ['Summary', 'Summary'], ['Updated', 'YYYY-MM-DD']]) {
      const key = kitHeader.addComponentProperty(name, 'TEXT', sample);
      for (const v of kitHeader.children) {
        const node = v.findOne((n) => n.type === 'TEXT' && n.name === name);
        node.componentPropertyReferences = { characters: key };
      }
    }

    const bh = figma.createComponent();
    page.appendChild(bh);
    bh.name = '_Doc/Band header';
    bh.layoutMode = 'VERTICAL';
    bh.fills = [];
    bh.setBoundVariable('itemSpacing', vars.spaceItemGap);
    bh.resize(CARD_MIN_WIDTH, bh.height);
    bh.layoutSizingHorizontal = 'FIXED';
    bh.layoutSizingVertical = 'HUG';
    const bhRow = autoFrame('Title Row', 'HORIZONTAL');
    bhRow.counterAxisAlignItems = 'CENTER';
    bhRow.setBoundVariable('itemSpacing', vars.spaceItemGap);
    fillWidth(bh, bhRow);
    bhRow.layoutSizingVertical = 'HUG';
    const bhTitle = await text('bandTitle', 'Band', vars.textDefault, 'Title');
    bhRow.appendChild(bhTitle);
    const unreviewedChip = await chip('Unreviewed', 'Unreviewed', vars.toneCaution);
    bhRow.appendChild(unreviewedChip);
    const bhLede = await text('body', 'Lede', vars.textMuted, 'Lede');
    fillWidth(bh, bhLede);
    bhTitle.componentPropertyReferences = { characters: bh.addComponentProperty('Title', 'TEXT', 'Band') };
    bhLede.componentPropertyReferences = { characters: bh.addComponentProperty('Lede', 'TEXT', 'Lede') };
    unreviewedChip.componentPropertyReferences = { visible: bh.addComponentProperty('Unreviewed', 'BOOLEAN', false) };
    bh.y = kitHeader.y + kitHeader.height + 64;
    kitBandHeader = bh;

    kitHeader.setSharedPluginData(NS, 'docKit', 'header');
    kitBandHeader.setSharedPluginData(NS, 'docKit', 'bandHeader');
    figma.root.setSharedPluginData(NS, 'docKitFile', fileKey);
    kitDrawn = true;
  }

  const headerDefs = kitHeader.componentPropertyDefinitions;
  const bandDefs = kitBandHeader.componentPropertyDefinitions;
  const H = {
    status: propKey(headerDefs, 'Status', '_Doc/Header'),
    title: propKey(headerDefs, 'Title', '_Doc/Header'),
    summary: propKey(headerDefs, 'Summary', '_Doc/Header'),
    updated: propKey(headerDefs, 'Updated', '_Doc/Header'),
  };
  const B = {
    title: propKey(bandDefs, 'Title', '_Doc/Band header'),
    lede: propKey(bandDefs, 'Lede', '_Doc/Band header'),
    unreviewed: propKey(bandDefs, 'Unreviewed', '_Doc/Band header'),
  };

  // ── 7. Mutate ──────────────────────────────────────────────────────────────
  if (!wasTagged) card.setSharedPluginData(NS, 'docCard', componentName);
  for (const fp of fingerprints) fp.remove();

  let header = headerInstance;
  const migrated = !headerInstance;
  if (!header) {
    header = kitHeader.defaultVariant.createInstance();
    card.insertChild(0, header);
    header.layoutSizingHorizontal = 'FILL';
    await loadNodeFonts(header);
    header.setProperties({ [H.status]: newStatus });
    if (legacyHeader) legacyHeader.remove();
    for (const d of legacyDividers) d.remove();
  }

  const padPx = vars.spacePadding.resolveForConsumer(card).value;

  // A band: the one shape every band shares (decision 14).
  const makeBand = async (name, title, lede, unreviewed) => {
    const band = autoFrame(name, 'VERTICAL');
    band.fills = [boundPaint(vars.surfaceBand)];
    bindRadius(band, vars.radiusBand);
    bindPadding(band, vars.spacePadding);
    band.setBoundVariable('itemSpacing', vars.spaceRowGap);
    card.appendChild(band);
    band.layoutSizingHorizontal = 'FILL';
    band.layoutSizingVertical = 'HUG';
    const bandHeader = kitBandHeader.createInstance();
    band.appendChild(bandHeader);
    bandHeader.layoutSizingHorizontal = 'FILL';
    await loadNodeFonts(bandHeader);
    bandHeader.setProperties({ [B.title]: title, [B.lede]: lede, [B.unreviewed]: unreviewed });
    if (!lede) {
      // An instance override, not a kit edit: hide the empty lede line.
      const ledeNode = bandHeader.findOne((n) => n.type === 'TEXT'
        && n.componentPropertyReferences && n.componentPropertyReferences.characters === B.lede);
      if (ledeNode) ledeNode.visible = false;
    }
    return band;
  };

  if (!specimenBand) {
    specimenBand = await makeBand('Band: Specimen', 'Specimen', '', false);
    card.insertChild(card.children.indexOf(header) + 1, specimenBand);
    specimenBand.appendChild(specimenHolder);  // moves it: the set keeps its id, instances stay attached
  }

  if (legacyUsage) legacyUsage.remove();
  for (const band of ownedBands) band.remove();

  // Width (decision 16): from the set's own width and the paddings only.
  const cardPad = (card.paddingLeft + card.paddingRight) / 2;
  const width = cardWidth({ specimenWidth: specimen.width, bandPad: padPx, cardPad });
  card.resize(width, card.height);
  card.counterAxisSizingMode = 'FIXED';  // VERTICAL frame: counter = width
  card.primaryAxisSizingMode = 'AUTO';   // height hugs — re-asserted after resize()
  const termWidth = Math.round((width - 2 * cardPad - 2 * padPx) / 3);

  const eyebrow = (parent, chars, colorVar) => text('caption', chars, colorVar).then((t) => fillWidth(parent, t));
  const bullets = async (parent, items) => {
    for (const item of items) fillWidth(parent, await text('body', '• ' + item, vars.textDefault));
  };

  const bandsRendered = [];
  for (const planned of plan.bands) {
    const band = await makeBand(planned.name, planned.title, planned.lede, planned.unreviewed);
    for (const block of planned.blocks) {
      const bf = autoFrame(block.name, block.type === 'dosDonts' ? 'HORIZONTAL' : 'VERTICAL');
      fillWidth(band, bf);
      bf.layoutSizingVertical = 'HUG';
      if (block.type === 'dosDonts') {
        bf.setBoundVariable('itemSpacing', vars.spaceBlockGap);
        for (const [side, toneVar] of [[block.do, vars.tonePositive], [block.dont, vars.toneNegative]]) {
          const col = autoFrame('Column: ' + side.eyebrow, 'VERTICAL');
          col.setBoundVariable('itemSpacing', vars.spaceItemGap);
          bf.appendChild(col);
          col.layoutSizingHorizontal = 'FILL';
          col.layoutSizingVertical = 'HUG';
          const rule = figma.createFrame();
          rule.name = 'Rule';
          rule.fills = [boundPaint(toneVar)];
          col.appendChild(rule);
          rule.resize(rule.width, 2);  // rule thickness: the one audit-3 exception (decision 28)
          rule.layoutSizingHorizontal = 'FILL';
          await eyebrow(col, side.eyebrow, toneVar);
          await bullets(col, side.items);
        }
        continue;
      }
      bf.setBoundVariable('itemSpacing', vars.spaceItemGap);
      await eyebrow(bf, block.eyebrow, vars.textMuted);
      if (block.type === 'list') await bullets(bf, block.items);
      else if (block.type === 'definition') {
        for (const pair of block.terms) {
          const row = autoFrame('Definition: ' + pair.term, 'HORIZONTAL');
          row.setBoundVariable('itemSpacing', vars.spaceItemGap);
          fillWidth(bf, row);
          row.layoutSizingVertical = 'HUG';
          const term = await text('body', pair.term, vars.textDefault);
          row.appendChild(term);
          term.textAutoResize = 'HEIGHT';
          term.resize(termWidth, term.height);
          term.layoutSizingHorizontal = 'FIXED';
          fillWidth(row, await text('body', pair.meaning, vars.textMuted));
        }
      }
    }
    bandsRendered.push(planned.name);
  }

  // Header content from the record; Status is never written here except at
  // creation above (finalize owns it, decision 15).
  await loadNodeFonts(header);
  header.setProperties({ [H.title]: plan.header.title, [H.summary]: plan.header.summary, [H.updated]: plan.header.updatedAt });

  // Metadata node — hidden, on the card frame (never inside an instance).
  const fp = await text('caption', CANONICAL_FP, vars.textMuted, 'Doc Fingerprint');
  fp.visible = false;
  card.appendChild(fp);

  return {
    rendererVersion: DOC_CARD_RENDERER_VERSION,
    recordHash: fnv1a(JSON.stringify(plan)),
    render: fnv1a(JSON.stringify({ plan, cardWidth: width, specimenWidth: specimen.width })),
    fingerprint: CANONICAL_FP,
    cardWidth: width,
    bandsRendered,
    kitDrawn,
    tagged: !wasTagged,
    migrated,
    headerContrast: contrast,
  };
}

// Finalize's status write (decision 24): find the card by its tag and set the
// header's Status variant. Changes nothing else.
async function setDocCardStatus({ componentName, status }) {
  const value = statusVariant(status);
  await figma.loadAllPagesAsync();
  const tagged = (await findTagged('docCard')).filter((n) => n.getSharedPluginData(NS, 'docCard') === componentName);
  if (tagged.length !== 1) {
    throw new Error('setDocCardStatus: ' + tagged.length + ' cards are tagged "' + componentName
      + '" — render the card once (with --node-id if it is untagged) before setting its status');
  }
  const header = await headerInstanceOf(tagged[0], null);
  if (!header) throw new Error('setDocCardStatus: card ' + tagged[0].id + ' has no _Doc/Header instance — render it first');
  const main = await header.getMainComponentAsync();
  const key = propKey(main.parent.componentPropertyDefinitions, 'Status', '_Doc/Header');
  header.setProperties({ [key]: value });
  return { componentName, status: value, card: tagged[0].id };
}
