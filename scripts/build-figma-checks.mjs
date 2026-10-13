// Generates references/figma-checks.md — the canonical figma_execute snippet
// that runs the Figma stop conditions (COMPONENT_SET assertion, state matrix,
// focus ring, focus-ring contrast) — by inlining the state table
// (lib/component-states.mjs), the contrast maths (lib/contrast.mjs) and the
// pure checker (lib/figma-checks.mjs) above the Figma reader
// (lib/figma-checks-read.figma.js). Mirrors build-doc-card-builder.mjs: run
// bare to write, run with --check to gate CI. Zero dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATES = join(REPO_ROOT, 'scripts', 'lib', 'component-states.mjs');
const CONTRAST = join(REPO_ROOT, 'scripts', 'lib', 'contrast.mjs');
const CHECKER = join(REPO_ROOT, 'scripts', 'lib', 'figma-checks.mjs');
const READER = join(REPO_ROOT, 'scripts', 'lib', 'figma-checks-read.figma.js');
const OUT = join(REPO_ROOT, 'references', 'figma-checks.md');

const BIND = 'const { checkSpec, checkBuilt } = withTable({ resolveArchetype, BASELINE_STATES, STATE_SYNONYMS, normalizeName, contrastRatio, composite, parseHex, AA_NON_TEXT });';

const HEADER = [
  '# Figma stop-condition checks (GENERATED)',
  '',
  '> **GENERATED FILE — do not edit by hand.** Sources: `scripts/lib/component-states.mjs`',
  '> (the state table), `scripts/lib/contrast.mjs` (the WCAG contrast maths),',
  '> `scripts/lib/figma-checks.mjs` (the pure checker, unit-tested in Node) +',
  '> `scripts/lib/figma-checks-read.figma.js` (the Figma reader). Regenerate with',
  '> `node scripts/build-figma-checks.mjs`; CI gates freshness with `--check`.',
  '',
  'The canonical `figma_execute` snippet for the checks that can stop a component',
  'build: the COMPONENT_SET assertion against the full variant matrix, the state',
  'matrix, the focus ring, and the focus ring\'s contrast against the surfaces it',
  'sits on (WCAG 1.4.11, 3:1, in every mode). The script is the rule; do not re-write',
  'these checks by hand.',
  '',
  '## How to call it',
  '',
  '1. Paste the snippet below into `figma_execute`, with the two slots filled above it:',
  '   - `const EXPECT = { name, matrix, uiFramework, controlLayer, surfaces }` — `name` is the',
  '     component\'s real name; `matrix` is `{ axis: [values] }` for every axis of the',
  '     set; `uiFramework` is `project.uiFramework` from `design-system.json`;',
  '     `controlLayer` is the layer that is the actual control in a wrapped control,',
  '     copied from the architect\'s spec when it gives one (omit it otherwise);',
  '     `surfaces` is the list of colour-variable names of the page surfaces the',
  '     component sits on, copied from the architect\'s spec. Without it the',
  '     focus-contrast check is skipped. Surfaces are looked up among the file\'s',
  '     local variables only.',
  '   - `const MODE = \'spec\'` or `\'built\'`.',
  '2. End the script with `return await runFigmaChecks(EXPECT, MODE);` and pass',
  '   `timeout: 30000`.',
  '3. Read the result, `{ pass, checks: [{ name, result, detail }] }`. `result` is',
  '   `pass`, `fail` or `skip`; `pass` ignores skips. On `fail`, fix what each failing',
  '   check\'s `detail` names and run it again, within the ~3-pass budget; after that,',
  '   `BLOCKED` naming the failing checks\' `detail`. A `focus-contrast` fail is',
  '   the exception: return `BLOCKED` at once, naming its detail. A ring below 3:1 is',
  '   fixed by a token value, which no rebuild changes, and a missing surface is a',
  '   wrong name in the spec. Never edit a variable to make it pass.',
  '4. `\'spec\'` reads no node and runs before the first write. `\'built\'` reads the',
  '   COMPONENT_SET inside the frame named `WIP: <name>` on the current page and runs',
  '   in the self-verify loop. It throws only if that frame is missing; a frame with',
  '   no set, or a set Figma reports as conflicting, fails the structural check.',
  '',
  '```js',
  'const EXPECT = { name: \'Chip\', matrix: { state: [\'default\', \'hover\'] }, uiFramework: \'shadcn\' };',
  'const MODE = \'spec\';',
  '// … the generated snippet …',
  'return await runFigmaChecks(EXPECT, MODE);',
  '```',
  '',
  '## The snippet',
  '',
  '```js',
].join('\n');

const FOOTER = ['```', ''].join('\n');

const stripExports = (src) =>
  src.replace(/^export const /gm, 'const ').replace(/^export function /gm, 'function ');

export function buildFigmaChecks({ statesSource, contrastSource, checkerSource, readerSource }) {
  const states = stripExports(statesSource);
  const contrast = stripExports(contrastSource);
  const checker = stripExports(checkerSource);
  for (const [name, src] of [['component-states.mjs', states], ['contrast.mjs', contrast], ['figma-checks.mjs', checker], ['figma-checks-read.figma.js', readerSource]]) {
    if (/^\s*(import|export)\b/m.test(src)) {
      throw new Error(`${name} must stay import-free (only top-level \`export const\`/\`export function\` allowed) — it is inlined into the Figma snippet where no module system exists`);
    }
  }
  return `${HEADER}\n${states}\n${contrast}\n${checker}\n${BIND}\n\n${readerSource}${FOOTER}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = buildFigmaChecks({
    statesSource: readFileSync(STATES, 'utf8'),
    contrastSource: readFileSync(CONTRAST, 'utf8'),
    checkerSource: readFileSync(CHECKER, 'utf8'),
    readerSource: readFileSync(READER, 'utf8'),
  });
  if (process.argv.includes('--check')) {
    let onDisk = null;
    try { onDisk = readFileSync(OUT, 'utf8'); } catch { /* missing counts as drift */ }
    if (onDisk !== result) {
      console.error('✗ references/figma-checks.md out of date; run: node scripts/build-figma-checks.mjs');
      process.exit(1);
    }
    console.log('✓ figma checks in sync');
  } else {
    writeFileSync(OUT, result);
    console.log('✓ wrote references/figma-checks.md');
  }
}
