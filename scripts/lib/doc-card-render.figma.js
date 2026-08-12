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

  // The header band's record-derived content is written further below (after
  // the Usage band rebuild), but its shape is validated here — before ANY
  // mutation — so a shape mismatch throws with the card untouched. The
  // builder owns this content: the status write-back only fires on a status
  // change, so a re-voiced component that is already `stable` would otherwise
  // keep its original blurb and date forever. The status chip itself is NOT
  // touched — the finalize write-back still owns it.
  //
  // The header band's own name is unreliable (`Header` on Button, `Frame` on
  // the other 12 cards measured), so it is located structurally instead — the
  // card's child FRAME that is neither the `Usage` band nor the specimen nor
  // an ancestor of it.
  const headerBand = card.children.find((n) =>
    n.type === 'FRAME'
    && n.name !== 'Usage'
    && n.id !== specimen.id
    && !n.findOne((d) => d.id === specimen.id));
  if (!headerBand) {
    throw new Error('renderDocCard: no header band found — expected a child frame holding the component name, description, status chip and date');
  }

  // Two accepted header shapes (figma-component-standards.md "The header"):
  // legacy cards carry a `Status Pill` descendant plus a label/value date
  // frame; to-spec cards (built by /new-component per the written standard)
  // carry `Status`/`Status Label` plus a `Last Updated` TEXT node. Neither is
  // going away, so both are located structurally rather than by fixed
  // child-index, resolving to the same three anchors below.
  const titleRow = headerBand.children[0];
  const hasStatusAnchor = !!(titleRow && titleRow.type === 'FRAME'
    && titleRow.findOne((d) => d.name === 'Status Pill' || d.name === 'Status'));

  // Date anchor. To-spec: a direct TEXT child of the header band named
  // `Last Updated` — that node IS the value. Legacy: a FRAME child whose
  // first child is TEXT reading exactly "Last updated"; the value is that
  // frame's other TEXT child, found by elimination against the label rather
  // than assumed by index.
  let dateValue = headerBand.children.find((n) => n.type === 'TEXT' && n.name === 'Last Updated');
  if (!dateValue) {
    const legacyDateFrame = headerBand.children.find((n) =>
      n.type === 'FRAME' && n.children[0] && n.children[0].type === 'TEXT'
      && n.children[0].characters === 'Last updated');
    if (legacyDateFrame) {
      const dateLabel = legacyDateFrame.children[0];
      dateValue = legacyDateFrame.children.find((n) => n !== dateLabel && n.type === 'TEXT');
    }
  }

  // Description anchor: the header band's own bare description TEXT node — a
  // direct TEXT child that is neither the title row nor the resolved date
  // node. Not assumed by fixed index: the to-spec shape's child count can
  // differ from the legacy 3-child shape.
  //
  // A node already named `Header Description` (a prior run's rename) is
  // unambiguous by construction, so it wins outright. Failing that the
  // candidates must resolve to EXACTLY ONE: picking the first of several
  // would, on a header that also exposes its component-name TEXT as a direct
  // child, overwrite that name with the summary and then rename it — wrong,
  // destructive, and self-perpetuating on every later run. A visible date
  // LABEL sibling (the "Last updated" caption, distinct from the value node
  // resolved above) is excluded rather than counted, so the to-spec shape
  // that carries one is still accepted instead of being falsely rejected.
  const named = headerBand.children.find((n) => n.type === 'TEXT' && n.name === 'Header Description');
  const descCandidates = headerBand.children.filter((n) =>
    n !== titleRow && n.type === 'TEXT' && n !== dateValue
    && n.name !== 'Last Updated' && n.characters !== 'Last updated');
  const headerDescCandidate = named || (descCandidates.length === 1 ? descCandidates[0] : null);
  const descAmbiguous = !named && descCandidates.length > 1;

  const missingAnchors = [];
  if (!hasStatusAnchor) missingAnchors.push('status (title row must contain a descendant named "Status Pill" or "Status")');
  if (!headerDescCandidate) {
    missingAnchors.push(descAmbiguous
      ? 'description (found ' + descCandidates.length + ' candidate TEXT children, cannot tell which is the description — name the right one "Header Description" by hand and re-run)'
      : 'description (a bare TEXT child distinct from the title row and the date node)');
  }
  if (!dateValue) missingAnchors.push('date (either a "Last Updated" TEXT child, or a FRAME child whose first TEXT child reads "Last updated")');
  if (missingAnchors.length) {
    throw new Error('renderDocCard: header band does not match either accepted shape — missing anchor(s): '
      + missingAnchors.join('; ')
      + ' — refusing to guess which node to write; see "The header" in figma-component-standards.md for the two accepted shapes');
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

  // The header band's record-derived content — its shape (status, description,
  // and date anchors) was already validated above, before the Usage band
  // rebuild.

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

  // Self-migrating: the anchor resolved above already preferred a node named
  // `Header Description` over a positional match, so renaming here makes
  // every later run deterministic by name rather than by position.
  const headerDesc = headerDescCandidate;
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

  // Single source for the header date: record.updatedAt (via plan.header —
  // see figma-component-standards.md "Last updated"). `dateValue` was
  // resolved above, before the Usage rebuild, under either header shape.
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
