// Which mode a Figma run is in, as a pure function of what the open file has.
// ZERO imports, `export const`/`export function` only. It is inlined into the
// generated compose script (references/figma-compose.md) by build-figma-checks.mjs,
// so it must run in both Node and the Figma plugin sandbox, and reuse none of the
// top-level names it is inlined with.
//
// Spec: docs/specs/2026-10-30-design-modes.md (Q3)
//
// detectMode(signals) → { mode, libraryDetected, reason }
//   signals: {
//     manifestFileKey,     // design-system.json's figma.fileKey, or null
//     openFileKey,         // figma_get_status's currentFileKey, never figma.fileKey
//     libraryCollections,  // enabled library variable collections
//     remoteInstances,     // instances of library components on the loaded pages
//     localVariables, localSets,
//     forced,              // 'b' | 'c' | null: the user asked to ignore the system or library
//   }

const DESIGN_MODE_RANK = { a: 3, b: 2, c: 1 };

const DESIGN_MODE_REASONS = {
  a: 'Mode a: building from this file\'s throughline design system. Every value is bound to the system, and the screen is recorded for drift.',
  b: 'Mode b: building from the connected library first, then this file\'s own components and variables. A raw value is allowed only where no variable holds it, and each one is listed; text styles come from this file only; no drift tracking.',
  bLocal: 'Mode b: no library is connected, so building from this file\'s own components and variables. A raw value is allowed only where no variable holds it, and each one is listed; no drift tracking.',
  c: 'Mode c: this file has no design system, library or variables, so screens are built from frames to auto-layout standards. Nothing is bound to variables, and no gaps or drift are recorded.',
  cLowered: 'Mode c: ignoring this file\'s system, library and variables as you asked, so screens are built from frames to auto-layout standards. Nothing is bound to variables, and no gaps or drift are recorded.',
};

export function detectMode(signals) {
  const s = signals || {};
  const count = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
  const libraryDetected = count(s.libraryCollections) + count(s.remoteInstances) > 0;
  let detected;
  if (s.manifestFileKey && s.openFileKey && s.manifestFileKey === s.openFileKey) detected = 'a';
  else if (libraryDetected || count(s.localVariables) + count(s.localSets) > 0) detected = 'b';
  else detected = 'c';

  let mode = detected;
  let note = '';
  if (s.forced === 'b' || s.forced === 'c') {
    if (DESIGN_MODE_RANK[s.forced] < DESIGN_MODE_RANK[detected]) {
      mode = s.forced;
      note = ` (lowered from mode ${detected} because you asked)`;
    } else if (s.forced !== detected) {
      note = ` (you asked for mode ${s.forced}, but a mode can only be lowered, never raised, so this stays mode ${detected})`;
    }
  }
  let base = DESIGN_MODE_REASONS[mode];
  if (mode === 'b' && !libraryDetected) base = DESIGN_MODE_REASONS.bLocal;
  if (mode === 'c' && detected !== 'c') base = DESIGN_MODE_REASONS.cLowered;
  return { mode, libraryDetected: mode === 'b' && libraryDetected, reason: base.replace(/^Mode (\w):/, `Mode $1${note}:`) };
}
