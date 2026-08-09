// Pure layout planner for the component doc card's Usage band.
// ZERO imports, `export const`/`export function` only — this module is inlined
// verbatim into the generated Figma snippet (references/doc-card-builder.md) by
// build-doc-card-builder.mjs, so it must run in both Node and the Figma plugin
// sandbox. build-doc-card-builder.mjs enforces the no-imports rule.
//
// Layout contract: docs/superpowers/specs/2026-08-09-doc-card-layout-and-voice-design.md

// Single source of truth for the doc-card layout version. Imported by
// docs-check.mjs and embedded (via inlining) into the generated builder snippet.
export const DOC_CARD_RENDERER_VERSION = '2';

// columnUnit = clamp(round(bodyFontSize × 30), 280, 480) px.
// 30 ≈ 60ch × ~0.5em average glyph width for UI text faces. Layout chrome, not
// a design value — the one documented exception to the no-hardcoded-px rule.
export function columnUnit(bodyFontSize) {
  return Math.min(480, Math.max(280, Math.round(bodyFontSize * 30)));
}

// cardWidth = max(specimenWidth, 3 units) rounded UP to a whole unit.
export function cardColumns(specimenWidth, unit) {
  return Math.max(3, Math.ceil(specimenWidth / unit));
}
