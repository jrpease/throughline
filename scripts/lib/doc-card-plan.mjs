// Pure layout planner for the component doc card (v5: the documentation pilot
// layout — a kit header, a Specimen band, then one band per section).
// ZERO imports, `export const`/`export function` only — this module is inlined
// verbatim into the generated Figma snippet (references/doc-card-builder.md) by
// build-doc-card-builder.mjs, so it must run in both Node and the Figma plugin
// sandbox. build-doc-card-builder.mjs enforces the no-imports rule.
//
// Layout contract: docs/specs/2026-10-15-doc-card-v5.md

// Single source of truth for the doc-card layout version. Imported by
// docs-check.mjs and embedded (via inlining) into the generated builder snippet.
export const DOC_CARD_RENDERER_VERSION = '5';

// The card's floor: v4's three 480px columns, carried over (decision 16).
export const CARD_MIN_WIDTH = 1440;

// Card width = the floor, or the specimen set plus its band's padding, whichever
// is bigger — plus the card's own padding outside it. specimenWidth is the set's
// own width and nothing else: never the card's or a band's, which this render
// sets, so a measurement of them would ratchet on every render.
export function cardWidth({ specimenWidth, bandPad, cardPad }) {
  return Math.max(CARD_MIN_WIDTH, specimenWidth + 2 * bandPad) + 2 * cardPad;
}

export const STATUS_OPTIONS = ['draft', 'beta', 'stable', 'deprecated'];

// The header's Status variant for a manifest status. Case is folded; anything
// outside the four options throws rather than guessing (e.g. a legacy `final`).
export function statusVariant(value) {
  const v = typeof value === 'string' ? value.toLowerCase() : '';
  if (!STATUS_OPTIONS.includes(v)) {
    throw new Error('status "' + value + '" is not one of ' + STATUS_OPTIONS.join(' / ')
      + ' — fix components.meta[name].status in design-system.json, then re-run');
  }
  return v;
}

// The header against the card it sits on (decision 4). An exact match is
// refused; under 3:1 (WCAG's non-text bar) is a warning, since a light brand
// header on a white card is a real choice. Same math as lib/contrast.mjs,
// repeated because the planner must stay import-free.
export const HEADER_MIN_CONTRAST = 3;

export function headerContrast(headerHex, cardHex) {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(headerHex), lum(cardHex)];
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const verdict = headerHex.toLowerCase() === cardHex.toLowerCase() ? 'refuse'
    : ratio < HEADER_MIN_CONTRAST ? 'warn' : 'ok';
  return { ratio: Math.round(ratio * 100) / 100, verdict };
}

// A provenance value with no `user` or `imported` marker is unprotected: it was
// generated, not written or approved by a person (component-doc-schema.md's two
// tiers). A block with no provenance at all counts as unprotected.
export function isUnprotected(provenanceValue) {
  if (typeof provenanceValue !== 'string' || provenanceValue === '') return true;
  const parts = provenanceValue.split('+');
  return !parts.includes('user') && !parts.includes('imported');
}

function hasContent(value) {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return false;
}

// A band is Unreviewed when every record block it shows is unprotected.
export function bandUnreviewed(record, keys) {
  const provenance = record.provenance || {};
  return keys.filter((k) => hasContent(record[k])).every((k) => isUnprotected(provenance[k]));
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

const USAGE_KEYS = ['description', 'whenToUse', 'whenNotToUse', 'dos', 'donts', 'variants', 'states', 'accessibility'];

// The record-derived layout, as data. Everything here comes from the record, so
// fnv1a(JSON.stringify(plan)) is the recordHash Node predicts (decision 18).
// Axes, options and states keep record order: record order is display order.
export function planDocCard(record) {
  const str = (v) => (typeof v === 'string' ? v : '');

  const blocks = [];
  const whenTo = listBlock('When to use', record.whenToUse);
  if (whenTo) blocks.push(whenTo);
  const whenNot = listBlock('Use something else', record.whenNotToUse);
  if (whenNot) blocks.push(whenNot);
  const dos = Array.isArray(record.dos) ? record.dos : [];
  const donts = Array.isArray(record.donts) ? record.donts : [];
  if (dos.length || donts.length) {
    blocks.push({
      type: 'dosDonts', name: 'Block: Do and Don\'t',
      do: { eyebrow: '✓ Do', items: dos },
      dont: { eyebrow: '✕ Don\'t', items: donts },
    });
  }
  // Step 1 carry-over (decision 22): v4's meanings and accessibility stay on the
  // card as text until their own bands ship.
  for (const axis of Object.keys(record.variants || {})) {
    const block = definitionBlock(`What each ${axis} means`, record.variants[axis]);
    if (block) blocks.push(block);
  }
  const stateBlock = definitionBlock('What each state means', record.states);
  if (stateBlock) blocks.push(stateBlock);
  const a11y = record.accessibility || {};
  // role is not rendered on the card — it lives in the description field / MDX.
  const a11yBlock = listBlock('Accessibility', [...(a11y.keyboard || []), ...(a11y.notes || [])]);
  if (a11yBlock) blocks.push(a11yBlock);

  const lede = str(record.description);
  const bands = [];
  if (lede.trim() !== '' || blocks.length) {
    bands.push({
      name: 'Band: Usage', title: 'Usage', lede,
      unreviewed: bandUnreviewed(record, USAGE_KEYS), blocks,
    });
  }

  return {
    rendererVersion: DOC_CARD_RENDERER_VERSION,
    // Always strings: an undefined would drop the key from JSON.stringify and
    // move the hash.
    header: { title: str(record.name), summary: str(record.summary), updatedAt: str(record.updatedAt) },
    bands,
  };
}

// 32-bit FNV-1a — the record hash: fnv1a(JSON.stringify(plan)). Only ever
// compared against itself (the manifest's surfaces.docCard.recordHash), so it
// does not need to match the sha256-based canonical fingerprint, which cannot
// run in the Figma sandbox. Lives here, not in the renderer, so Node can compute
// the hash a render should return (doc-card-payload.mjs) with the same code.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
