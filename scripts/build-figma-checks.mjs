// Generates the two canonical figma_execute snippets by inlining tested Node
// modules above their Figma readers:
//   references/figma-checks.md — the Figma stop conditions (COMPONENT_SET
//     assertion, state matrix, focus ring, focus-ring contrast): the state table
//     (lib/component-states.mjs), the contrast maths (lib/contrast.mjs) and the pure
//     checker (lib/figma-checks.mjs), then lib/figma-variables-read.figma.js and the
//     reader (lib/figma-checks-read.figma.js).
//   references/figma-adherence.md — the screen adherence gate: the pure checker
//     (lib/figma-adherence.mjs), then lib/figma-variables-read.figma.js and the
//     screen reader (lib/figma-adherence-read.figma.js).
// Mirrors build-doc-card-builder.mjs: run bare to write both, run with --check to
// gate CI on both. Zero dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATES = join(REPO_ROOT, 'scripts', 'lib', 'component-states.mjs');
const CONTRAST = join(REPO_ROOT, 'scripts', 'lib', 'contrast.mjs');
const CHECKER = join(REPO_ROOT, 'scripts', 'lib', 'figma-checks.mjs');
const READER = join(REPO_ROOT, 'scripts', 'lib', 'figma-checks-read.figma.js');
const VARIABLES = join(REPO_ROOT, 'scripts', 'lib', 'figma-variables-read.figma.js');
const ADHERENCE = join(REPO_ROOT, 'scripts', 'lib', 'figma-adherence.mjs');
const ADHERENCE_READER = join(REPO_ROOT, 'scripts', 'lib', 'figma-adherence-read.figma.js');
const OUT = join(REPO_ROOT, 'references', 'figma-checks.md');
const ADHERENCE_OUT = join(REPO_ROOT, 'references', 'figma-adherence.md');

const BIND = 'const { checkSpec, checkBuilt, checkExisting } = withTable({ resolveArchetype, BASELINE_STATES, STATE_SYNONYMS, normalizeName, contrastRatio, composite, parseHex, AA_NON_TEXT });';

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
  '   - `const MODE = \'spec\'`, `\'built\'` or `\'existing\'`.',
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
  '5. `\'existing\'` checks a set already in the library, read-only: the first',
  '   COMPONENT_SET whose name matches `name` ignoring case and punctuation. Add',
  '   `page` to `EXPECT` (the page holding the components) so only that page is',
  '   loaded; without it every page loads in turn, which on a large file can stall',
  '   the bridge. `matrix` is not needed. There is no spec to copy `controlLayer` and',
  '   `surfaces` from, so the caller names them: `surfaces` as for a build, and',
  '   `controlLayer` for a wrapped control whose ring sits on an inner layer (without',
  '   it, a correct ring on an inner layer reads as missing). It runs the state,',
  '   focus-ring and focus-contrast checks against the set\'s own variants, not the',
  '   structural check. A set whose focus state is drawn some other way, such as an',
  '   INSIDE stroke, fails the focus-ring check and skips contrast. It throws when no',
  '   set has that name.',
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

const ADHERENCE_HEADER = [
  '# Figma screen adherence gate (GENERATED)',
  '',
  '> **GENERATED FILE — do not edit by hand.** Sources: `scripts/lib/figma-adherence.mjs`',
  '> (the pure checker, unit-tested in Node), `scripts/lib/figma-variables-read.figma.js`',
  '> (colour-variable resolution) + `scripts/lib/figma-adherence-read.figma.js` (the',
  '> screen reader). Regenerate with `node scripts/build-figma-checks.mjs`; CI gates',
  '> freshness with `--check`.',
  '',
  'The canonical `figma_execute` snippet that checks Figma screens against the design',
  'system, read-only. It fails a frame detached from a component, a raw colour that a',
  'colour variable has (opacity included), and a raw gap, padding or corner radius',
  'that a spacing or radius variable has, naming the variable to bind. A number',
  'variable counts by its scope (`GAP`, `CORNER_RADIUS`), or, left at `ALL_SCOPES`,',
  'by a name that says spacing or radius. A raw value no variable has is an',
  'advisory, not a failure. A rule that had nothing to compare against fails by name',
  '(`nothing-scanned`, `colour-rule-inert`, `dimension-rule-inert`). The script is the',
  'rule; do not re-write it by hand.',
  '',
  '## How to call it',
  '',
  '1. Paste the snippet below into `figma_execute`, with the two slots filled above it:',
  '   - `const TARGET = { page, screens, fileKey }` — `page` is the page name (an exact',
  '     match, or else the one page whose name matches once leading and trailing',
  '     spaces are trimmed); `screens` is an optional list of screen names (top-level',
  '     frames, or frames directly inside a top-level section), and without it every',
  '     screen on the page is read; `fileKey` is `figma.fileKey` from',
  '     `design-system.json`, used for the links.',
  '   - `const SKIP = []` — rule names to switch off (`detached-component`,',
  '     `raw-colour`, `raw-dimension`); a skipped rule\'s inert check is skipped too.',
  '2. End the script with `return await runScreenGate(TARGET, SKIP);` and pass',
  '   `timeout: 30000`.',
  '3. Read the result, `{ pass, failures, advisories, counts, skipped }`. Each failure',
  '   and advisory has `rule`, `path`, `detail` and a `link` to the node. Report every',
  '   failure with its link. Never edit the file to make it pass.',
  '4. Only the named page is loaded, and tokens are the file\'s local variables. A file',
  '   whose variables all come from a published library fails as inert.',
  '',
  '```js',
  'const TARGET = { page: \'Templates\', fileKey: \'<figma.fileKey>\' };',
  'const SKIP = [];',
  '// … the generated snippet …',
  'return await runScreenGate(TARGET, SKIP);',
  '```',
  '',
  '## The snippet',
  '',
  '```js',
].join('\n');

const FOOTER = ['```', ''].join('\n');

const stripExports = (src) =>
  src.replace(/^export const /gm, 'const ').replace(/^export function /gm, 'function ');

function assertInlinable(sources) {
  for (const [name, src] of sources) {
    if (/^\s*(import|export)\b/m.test(src)) {
      throw new Error(`${name} must stay import-free (only top-level \`export const\`/\`export function\` allowed) — it is inlined into the Figma snippet where no module system exists`);
    }
  }
}

export function buildFigmaChecks({ statesSource, contrastSource, checkerSource, variablesSource, readerSource }) {
  const states = stripExports(statesSource);
  const contrast = stripExports(contrastSource);
  const checker = stripExports(checkerSource);
  assertInlinable([['component-states.mjs', states], ['contrast.mjs', contrast], ['figma-checks.mjs', checker], ['figma-variables-read.figma.js', variablesSource], ['figma-checks-read.figma.js', readerSource]]);
  return `${HEADER}\n${states}\n${contrast}\n${checker}\n${BIND}\n\n${variablesSource}\n${readerSource}${FOOTER}`;
}

export function buildFigmaAdherence({ checkerSource, variablesSource, readerSource }) {
  const checker = stripExports(checkerSource);
  assertInlinable([['figma-adherence.mjs', checker], ['figma-variables-read.figma.js', variablesSource], ['figma-adherence-read.figma.js', readerSource]]);
  return `${ADHERENCE_HEADER}\n${checker}\n${variablesSource}\n${readerSource}${FOOTER}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = buildFigmaChecks({
    statesSource: readFileSync(STATES, 'utf8'),
    contrastSource: readFileSync(CONTRAST, 'utf8'),
    checkerSource: readFileSync(CHECKER, 'utf8'),
    variablesSource: readFileSync(VARIABLES, 'utf8'),
    readerSource: readFileSync(READER, 'utf8'),
  });
  const adherence = buildFigmaAdherence({
    checkerSource: readFileSync(ADHERENCE, 'utf8'),
    variablesSource: readFileSync(VARIABLES, 'utf8'),
    readerSource: readFileSync(ADHERENCE_READER, 'utf8'),
  });
  const outputs = [
    [OUT, result, 'references/figma-checks.md', 'figma checks'],
    [ADHERENCE_OUT, adherence, 'references/figma-adherence.md', 'figma adherence'],
  ];
  if (process.argv.includes('--check')) {
    let stale = false;
    for (const [path, content, label, what] of outputs) {
      let onDisk = null;
      try { onDisk = readFileSync(path, 'utf8'); } catch { /* missing counts as drift */ }
      if (onDisk !== content) {
        console.error(`✗ ${label} out of date; run: node scripts/build-figma-checks.mjs`);
        stale = true;
      } else {
        console.log(`✓ ${what} in sync`);
      }
    }
    if (stale) process.exit(1);
  } else {
    for (const [path, content, label] of outputs) {
      writeFileSync(path, content);
      console.log(`✓ wrote ${label}`);
    }
  }
}
