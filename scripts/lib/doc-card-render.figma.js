// Figma plugin-API renderer for the doc-card Usage band. This file is NOT a
// Node module — build-doc-card-builder.mjs concatenates it after the inlined
// planner (doc-card-plan.mjs) into references/doc-card-builder.md, and the
// result runs inside figma_execute (dynamic-page mode). Constraints honored
// here (see references/figma-scripting.md): async APIs only, style/font set
// BEFORE .characters, fonts loaded up front, resize() sizing modes re-asserted,
// bound paints seeded light-gray (never pure black).
//
// In-scope globals when assembled: planDocCard, DOC_CARD_RENDERER_VERSION
// (inlined planner) and the caller-filled slots RECORD, CANONICAL_FP.

// 32-bit FNV-1a — the render hash. Only ever compared against itself (the
// manifest's surfaces.docCard.render), so it does not need to match the
// sha256-based canonical fingerprint, which cannot run in the Figma sandbox.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const REQUIRED_VARS = [
  'textDefault', 'textMuted', 'tonePositive', 'toneNegative', 'border',
  'spacePadding', 'spaceRowGap', 'spaceBlockGap', 'spaceItemGap',
];

// Bound paint, seeded with a light-gray approximation — a failed/late bind must
// never render pure black (reads as accidental dark mode).
function boundPaint(variable) {
  return figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.87 } }, 'color', variable,
  );
}

async function renderDocCard({ card, record, vars, bodyTextStyle }) {
  // Bind-or-throw: a missing variable or style is a gap in the token set —
  // never fall back to a hex/px.
  for (const key of REQUIRED_VARS) {
    if (!vars || !vars[key]) {
      throw new Error('renderDocCard: missing required variable "' + key
        + '" — resolve it via figma_get_variables / getVariableByIdAsync and pass the Variable object in vars');
    }
  }
  if (!bodyTextStyle) {
    throw new Error('renderDocCard: bodyTextStyle is required — find the "Body/Default" text style via getLocalTextStylesAsync');
  }

  // Three-band cards are VERTICAL auto-layout frames. Appending into anything
  // else preserves absolute position and mis-places the band — throw instead.
  if (card.layoutMode !== 'VERTICAL') {
    throw new Error('renderDocCard: the doc card must be a VERTICAL auto-layout frame (three-band card); got layoutMode=' + card.layoutMode);
  }

  // Fonts, up front — before any text node exists. Eyebrow chrome is Bold of
  // the body family; fall back to the body style's own font if no Bold exists.
  const bodyFont = bodyTextStyle.fontName;
  await figma.loadFontAsync(bodyFont);
  let eyebrowFont = { family: bodyFont.family, style: 'Bold' };
  try { await figma.loadFontAsync(eyebrowFont); } catch (e) { eyebrowFont = bodyFont; }

  // One component per doc card: a band like "Usage — Select Menu Item" means this
  // card documents multiple components. Rendering here would append a band we
  // don't own and silently accumulate — refuse and ask for the card to be split.
  // Checked before the specimen lookup so a multi-component card always gets
  // this error, never a possible "no COMPONENT_SET found" from the lookup below.
  const foreign = card.findChild((n) => n.name !== 'Usage' && n.name.startsWith('Usage'));
  if (foreign) {
    throw new Error('renderDocCard: card contains band "' + foreign.name
      + '" — one component per doc card; split this card so each component owns its own card before re-rendering');
  }

  // Structural contract only: the card must contain a COMPONENT_SET. It is
  // deliberately NOT measured — the render widens the card, the card's hug
  // propagates into FILL siblings including the specimen, so any specimen
  // measurement is a value this render mutates and the next one reads. (No
  // named "Specimen" band lookup: no real card has ever used one, so that
  // path never executed.)
  const specimen = card.findOne((n) => n.type === 'COMPONENT_SET');
  if (!specimen) {
    throw new Error('renderDocCard: no COMPONENT_SET found inside the card — the specimen band must contain the component set');
  }

  const plan = planDocCard(record, { fontSize: bodyTextStyle.fontSize });

  // Eyebrow chrome (derived, not bound — layout chrome like the column unit):
  // fontSize × 0.65 rounded, min 8; Bold; uppercase; letter-spacing +8%.
  const eyebrowSize = Math.max(8, Math.round(bodyTextStyle.fontSize * 0.65));

  // Idempotent + scoped: rebuild ONLY the Usage frame. The specimen is never touched
  // — recreating a component set detaches downstream instances. (The header's
  // record-derived content is written separately, below.)
  const existing = card.findChild((n) => n.name === 'Usage');
  if (existing) existing.remove();

  const eyebrowText = (chars, colorVar) => {
    const t = figma.createText();
    t.fontName = eyebrowFont;          // loaded above — set BEFORE .characters
    t.fontSize = eyebrowSize;
    t.letterSpacing = { value: 8, unit: 'PERCENT' };
    t.textCase = 'UPPER';
    t.characters = chars;
    t.fills = [boundPaint(colorVar)];
    return t;
  };

  const bodyText = async (chars, colorVar) => {
    const t = figma.createText();
    await t.setTextStyleIdAsync(bodyTextStyle.id);  // style BEFORE characters
    t.characters = chars;
    t.fills = [boundPaint(colorVar)];
    return t;
  };

  // Appends `t` to `parent` as a full-width, height-hugging text node.
  const fillWidth = (parent, t) => {
    parent.appendChild(t);
    t.textAutoResize = 'HEIGHT';
    t.layoutSizingHorizontal = 'FILL';
  };

  // Resolved px of the spacing tokens (mode-aware, resolved against the card).
  // The planner's cardWidth is the CONTENT-GRID width (columns × columnUnit);
  // the frame's outer width adds the band padding and the inter-block gutters
  // so the planned column count actually fits on one line.
  const padPx = vars.spacePadding.resolveForConsumer(card).value;
  const blockGapPx = vars.spaceBlockGap.resolveForConsumer(card).value;
  const usageWidth = plan.cardWidth + 2 * padPx + (plan.columns - 1) * blockGapPx;

  const usage = figma.createFrame();
  usage.name = 'Usage';
  usage.layoutMode = 'VERTICAL';
  usage.fills = [];
  usage.clipsContent = false;
  card.appendChild(usage);
  usage.resize(usageWidth, usage.height);
  usage.counterAxisSizingMode = 'FIXED';  // VERTICAL frame: counter = width
  usage.primaryAxisSizingMode = 'AUTO';   // height hugs — re-asserted after resize()
  usage.setBoundVariable('paddingLeft', vars.spacePadding);
  usage.setBoundVariable('paddingRight', vars.spacePadding);
  usage.setBoundVariable('paddingTop', vars.spacePadding);
  usage.setBoundVariable('paddingBottom', vars.spacePadding);
  usage.setBoundVariable('itemSpacing', vars.spaceRowGap);

  // Widen the card to fit (its own padding included). Card is VERTICAL (guarded
  // above): counter axis = width, so a hugging card needs no resize; a fixed
  // card is widened and its height sizing re-asserted after resize().
  const cardOuter = usageWidth + card.paddingLeft + card.paddingRight;
  if (card.counterAxisSizingMode !== 'AUTO' && card.width < cardOuter) {
    card.resize(cardOuter, card.height);
    card.primaryAxisSizingMode = 'AUTO';
  }

  const blocksCreated = [];
  let first = true;
  for (const row of plan.rows) {
    if (!first) {
      const divider = figma.createFrame();
      divider.name = 'Row Divider';
      divider.fills = [boundPaint(vars.border)];
      usage.appendChild(divider);
      divider.resize(divider.width, 1);
      divider.layoutSizingHorizontal = 'FILL';
    }
    first = false;

    const rowFrame = figma.createFrame();
    rowFrame.name = row.name;
    rowFrame.layoutMode = 'HORIZONTAL';
    rowFrame.layoutWrap = 'WRAP';
    rowFrame.fills = [];
    rowFrame.counterAxisAlignItems = 'MIN';  // top-aligned…
    rowFrame.primaryAxisAlignItems = 'MIN';  // …left-packed; never center/space-between
    usage.appendChild(rowFrame);
    rowFrame.layoutSizingHorizontal = 'FILL';
    rowFrame.layoutSizingVertical = 'HUG';
    rowFrame.setBoundVariable('itemSpacing', vars.spaceBlockGap);
    rowFrame.setBoundVariable('counterAxisSpacing', vars.spaceRowGap);

    for (const block of row.blocks) {
      const bf = figma.createFrame();
      bf.name = block.name;
      bf.layoutMode = 'VERTICAL';
      bf.fills = [];
      rowFrame.appendChild(bf);
      bf.resize(plan.columnUnit, bf.height);   // every block is exactly one unit wide
      bf.counterAxisSizingMode = 'FIXED';
      bf.primaryAxisSizingMode = 'AUTO';
      bf.setBoundVariable('itemSpacing', vars.spaceItemGap);

      const eyebrowColor = block.type === 'list-tone'
        ? (block.tone === 'positive' ? vars.tonePositive : vars.toneNegative)
        : vars.textMuted;
      const eb = eyebrowText(block.eyebrow, eyebrowColor);
      bf.appendChild(eb);
      eb.textAutoResize = 'HEIGHT';
      eb.layoutSizingHorizontal = 'FILL';

      if (block.type === 'prose') {
        fillWidth(bf, await bodyText(block.text, vars.textDefault));
      } else if (block.type === 'list' || block.type === 'list-tone') {
        for (const item of block.items) {
          fillWidth(bf, await bodyText('• ' + item, vars.textDefault));
        }
      } else if (block.type === 'definition') {
        for (const pair of block.terms) {
          const pf = figma.createFrame();
          pf.name = 'Definition: ' + pair.term;
          pf.layoutMode = 'HORIZONTAL';
          pf.fills = [];
          bf.appendChild(pf);
          pf.layoutSizingHorizontal = 'FILL';
          pf.layoutSizingVertical = 'HUG';
          pf.setBoundVariable('itemSpacing', vars.spaceItemGap);
          const term = await bodyText(pair.term, vars.textDefault);
          pf.appendChild(term);
          term.textAutoResize = 'HEIGHT';        // long terms wrap, never truncate
          term.resize(plan.termColumn, term.height);
          term.layoutSizingHorizontal = 'FIXED'; // fixed term column: 30% of the unit
          const meaning = await bodyText(pair.meaning, vars.textMuted);
          pf.appendChild(meaning);
          meaning.textAutoResize = 'HEIGHT';
          meaning.layoutSizingHorizontal = 'FILL';
        }
      }
      blocksCreated.push(block.name);
    }
  }

  // Metadata node — hidden, machine-read by the drift check's Figma-side pass.
  const fp = eyebrowText(CANONICAL_FP, vars.textMuted);
  fp.name = 'Doc Fingerprint';
  fp.visible = false;
  usage.appendChild(fp);

  // The header band's record-derived content. The builder owns this: the status
  // write-back only fires on a status change, so a re-voiced component that is
  // already `stable` would otherwise keep its original blurb and date forever.
  // The status chip is NOT touched — the finalize write-back still owns it.
  //
  // Measured against the live file (13/13 doc cards; see
  // .superpowers/sdd/2026-08-12-doc-card-dogfood-fixes/task-5-report.md): the
  // header band's own name is unreliable (`Header` on Button, `Frame` on the
  // other 12), so it is located structurally instead — the card's child FRAME
  // that is neither the `Usage` band nor the specimen nor an ancestor of it.
  const headerBand = card.children.find((n) =>
    n.type === 'FRAME'
    && n.name !== 'Usage'
    && n.id !== specimen.id
    && !n.findOne((d) => d.id === specimen.id));
  if (!headerBand) {
    throw new Error('renderDocCard: no header band found — expected a child frame holding the component name, description, status chip and date');
  }

  // Every header band has exactly 3 direct children in fixed order: [0] the
  // title-row FRAME (has a `Status Pill` descendant), [1] the bare
  // description TEXT — the target, with no deliberate name of its own — and
  // [2] a FRAME whose first child is TEXT reading exactly "Last updated".
  // There is NO node named `Last Updated` anywhere in the file. Assert both
  // anchors before trusting either target: a mis-identified node would
  // overwrite the component's name.
  const [titleRow, descCandidate, dateFrame] = headerBand.children;
  const hasStatusPill = !!(titleRow && titleRow.type === 'FRAME' && titleRow.findOne((d) => d.name === 'Status Pill'));
  const dateLabel = dateFrame && dateFrame.type === 'FRAME' ? dateFrame.children[0] : null;
  const shapeOk = headerBand.children.length === 3
    && hasStatusPill
    && descCandidate && descCandidate.type === 'TEXT'
    && dateLabel && dateLabel.type === 'TEXT' && dateLabel.characters === 'Last updated';
  if (!shapeOk) {
    throw new Error('renderDocCard: header band does not match the expected shape (a title row with a Status Pill descendant, a bare description text, and a "Last updated" frame) — refusing to guess which node to write; name the description node "Header Description" by hand and re-run if the header has genuinely changed shape');
  }

  // Load a text node's own fonts before writing, and never touch its style:
  // the header's type is card chrome, not part of this projection. A
  // zero-length node can't have mixed fonts (getRangeAllFontNames(0, 1) would
  // exceed the text and throw), so it takes its own path via .fontName.
  const writeChars = async (node, chars) => {
    const len = node.characters.length;
    if (len === 0) {
      await figma.loadFontAsync(node.fontName);
    } else {
      for (const f of node.getRangeAllFontNames(0, len)) await figma.loadFontAsync(f);
    }
    node.characters = chars;
  };

  // Self-migrating: prefer a node already named `Header Description` (a prior
  // run's rename) — type-checked, since `titleRow`/`dateFrame` are FRAMEs
  // that could be manually misnamed and would otherwise match first by child
  // order and blow up in writeChars mid-render — otherwise trust
  // `children[1]`, validated above, and rename it so every later run is
  // deterministic by name, not position.
  let headerDesc = headerBand.findChild((n) => n.type === 'TEXT' && n.name === 'Header Description') || descCandidate;
  if (headerDesc.name !== 'Header Description') headerDesc.name = 'Header Description';
  // record.summary is schema-required but the renderer never calls
  // validateRecord() itself — an unvalidated record's default ('') must not
  // silently blank a live card's description.
  if (plan.header.summary) await writeChars(headerDesc, plan.header.summary);
  // Re-assert the one-column clamp (figma-component-standards.md): the header
  // description never stretches across a wide matrix. Layout, not content —
  // re-applied on every render regardless of whether the text changed.
  headerDesc.textAutoResize = 'HEIGHT';
  headerDesc.resize(plan.columnUnit, headerDesc.height);
  headerDesc.layoutSizingHorizontal = 'FIXED';

  // The date value is `dateFrame`'s other child, found by elimination against
  // the label rather than assumed by index — only the label's identity (not
  // its position) was measured as invariant.
  const dateValue = dateFrame.children.find((n) => n !== dateLabel && n.type === 'TEXT');
  if (dateValue && plan.header.updatedAt) {
    await writeChars(dateValue, plan.header.updatedAt);
  }

  return {
    rendererVersion: DOC_CARD_RENDERER_VERSION,
    columnUnit: plan.columnUnit,
    columns: plan.columns,
    cardWidth: plan.cardWidth,
    rowsRendered: plan.rows.length,
    blocksCreated,
    headerWritten: true,
    fingerprint: CANONICAL_FP,
    renderHash: fnv1a(JSON.stringify(plan)),
  };
}
