// Pure layout planner for the component doc card's Usage band.
// ZERO imports, `export const`/`export function` only — this module is inlined
// verbatim into the generated Figma snippet (references/doc-card-builder.md) by
// build-doc-card-builder.mjs, so it must run in both Node and the Figma plugin
// sandbox. build-doc-card-builder.mjs enforces the no-imports rule.
//
// Layout contract: docs/superpowers/specs/2026-08-09-doc-card-layout-and-voice-design.md

// Single source of truth for the doc-card layout version. Imported by
// docs-check.mjs and embedded (via inlining) into the generated builder snippet.
export const DOC_CARD_RENDERER_VERSION = '4';

// columnUnit = clamp(round(bodyFontSize × 30), 280, 480) px.
// 30 ≈ 60ch × ~0.5em average glyph width for UI text faces. Layout chrome, not
// a design value — the one documented exception to the no-hardcoded-px rule.
export function columnUnit(bodyFontSize) {
  return Math.min(480, Math.max(280, Math.round(bodyFontSize * 30)));
}

// columns = max(max blocks in any row, 3). Content alone decides: the grid
// never mints a column no row can fill, and never drops below the 3-unit floor.
// The specimen is deliberately NOT an input — the render widens the card, the
// card's hug propagates into FILL siblings including the specimen, so any
// specimen measurement is a value this render mutates and the next one reads.
export function cardColumns(maxBlocksPerRow) {
  return Math.max(3, maxBlocksPerRow);
}

function listBlock(eyebrow, items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return { type: 'list', name: `Block: ${eyebrow}`, eyebrow, items };
}

function definitionBlock(eyebrow, meanings) {
  const terms = Object.keys(meanings || {}).map((k) => ({ term: k, meaning: meanings[k] }));
  if (terms.length === 0) return null;
  return { type: 'definition', name: `Block: ${eyebrow}`, eyebrow, terms };
}

// The whole layout decision, as data. Rows keep canonical numbering (an absent
// row's number is skipped, never renumbered) so node names stay stable across
// sparse records. bodyTextStyle: only .fontSize is read — passing a full Figma
// TextStyle object is fine.
export function planDocCard(record, bodyTextStyle) {
  const unit = columnUnit(bodyTextStyle.fontSize);

  const row1 = [];
  if (typeof record.description === 'string' && record.description.trim() !== '') {
    row1.push({ type: 'prose', name: 'Block: Overview', eyebrow: 'Overview', text: record.description });
  }
  const whenTo = listBlock('When to use', record.whenToUse);
  if (whenTo) row1.push(whenTo);
  const whenNot = listBlock('When not to use', record.whenNotToUse);
  if (whenNot) row1.push(whenNot);

  const row2 = [];
  if (Array.isArray(record.dos) && record.dos.length) {
    row2.push({ type: 'list-tone', name: 'Block: Do', eyebrow: '✓ Do', tone: 'positive', items: record.dos });
  }
  if (Array.isArray(record.donts) && record.donts.length) {
    row2.push({ type: 'list-tone', name: "Block: Don't", eyebrow: "✕ Don't", tone: 'negative', items: record.donts });
  }

  const row3 = [];
  for (const axis of Object.keys(record.variants || {})) {
    const block = definitionBlock(`What each ${axis} means`, record.variants[axis]);
    if (block) row3.push(block);
  }
  const stateBlock = definitionBlock('What each state means', record.states);
  if (stateBlock) row3.push(stateBlock);
  const a11y = record.accessibility || {};
  // role is not rendered on the card — it lives in the description field / MDX.
  const a11yBlock = listBlock('Accessibility', [...(a11y.keyboard || []), ...(a11y.notes || [])]);
  if (a11yBlock) row3.push(a11yBlock);

  const rows = [
    { name: 'Usage Row 1', blocks: row1 },
    { name: 'Usage Row 2', blocks: row2 },
    { name: 'Usage Row 3', blocks: row3 },
  ].filter((r) => r.blocks.length > 0);

  const maxBlocksPerRow = rows.reduce((m, r) => Math.max(m, r.blocks.length), 0);
  const columns = cardColumns(maxBlocksPerRow);

  return {
    rendererVersion: DOC_CARD_RENDERER_VERSION,
    columnUnit: unit,
    columns,
    cardWidth: columns * unit,
    termColumn: Math.round(unit * 0.3),
    // The header band's record-derived content. Carried in the plan (not read
    // straight off the record by the renderer) so renderHash describes every
    // string the builder writes onto the card, header included. Always strings:
    // an undefined would drop the key from JSON.stringify and move the hash.
    header: {
      summary: typeof record.summary === 'string' ? record.summary : '',
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    },
    rows,
  };
}

// 32-bit FNV-1a — the render hash: fnv1a(JSON.stringify(plan)). Only ever
// compared against itself (the manifest's surfaces.docCard.render), so it does
// not need to match the sha256-based canonical fingerprint, which cannot run in
// the Figma sandbox. Lives here, not in the renderer, so Node can compute the
// hash a render should return (doc-card-payload.mjs) with the same code.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// When a header's title row has no node named `Status Pill`/`Status`, name the
// node that most likely IS the chip so the error can say what to rename. Never
// used to pick a node to write — the renderer still refuses to guess. A
// candidate is a FRAME below the title row whose only child is a TEXT node
// (the chip shape: a pill frame around its label). Exactly one candidate or
// no hint. Reads only type/name/id/characters/children, so it runs on Figma
// nodes and on plain test objects alike.
export function statusChipHint(titleRow) {
  if (!titleRow || titleRow.type !== 'FRAME') return null;
  const found = [];
  const walk = (node) => {
    for (const child of node.children || []) {
      if (child.type === 'FRAME' && child.children && child.children.length === 1
        && child.children[0].type === 'TEXT') {
        found.push({ id: child.id, name: child.name, label: child.children[0].characters });
      }
      walk(child);
    }
  };
  walk(titleRow);
  return found.length === 1 ? found[0] : null;
}
