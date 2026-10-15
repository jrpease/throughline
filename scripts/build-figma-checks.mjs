// Generates the four canonical figma_execute snippets by inlining tested Node
// modules above their Figma readers:
//   references/figma-checks.md — the Figma stop conditions (COMPONENT_SET
//     assertion, state matrix, focus ring, focus-ring contrast): the state table
//     (lib/component-states.mjs), the contrast maths (lib/contrast.mjs) and the pure
//     checker (lib/figma-checks.mjs), then lib/figma-variables-read.figma.js and the
//     reader (lib/figma-checks-read.figma.js).
//   references/figma-adherence.md — the screen adherence gate: the pure checker
//     (lib/figma-adherence.mjs), then lib/figma-variables-read.figma.js and the
//     screen reader (lib/figma-adherence-read.figma.js).
//   references/figma-compose.md — screen composition: lib/figma-adherence.mjs (for
//     dimensionBuckets), the pure resolver (lib/figma-compose.mjs),
//     lib/figma-variables-read.figma.js, the reader (lib/figma-compose-read.figma.js),
//     then the writer (lib/figma-compose.figma.js).
//   references/figma-drift.md — the live drift pass, three snippets, no writer: the
//     variables snippet (lib/figma-variables-read.figma.js, then
//     lib/figma-drift-variables.figma.js), small because every token sync runs it;
//     the screens snippet (lib/figma-adherence.mjs, lib/figma-compose.mjs,
//     lib/figma-compose-read.figma.js, then lib/figma-drift-screens.figma.js); and
//     the components snippet (lib/figma-drift-components.figma.js alone).
// Mirrors build-doc-card-builder.mjs: run bare to write all four, run with --check
// to gate CI on all four. Zero dependencies.
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
const COMPOSE = join(REPO_ROOT, 'scripts', 'lib', 'figma-compose.mjs');
const COMPOSE_READER = join(REPO_ROOT, 'scripts', 'lib', 'figma-compose-read.figma.js');
const COMPOSE_WRITER = join(REPO_ROOT, 'scripts', 'lib', 'figma-compose.figma.js');
const DRIFT_VARIABLES = join(REPO_ROOT, 'scripts', 'lib', 'figma-drift-variables.figma.js');
const DRIFT_SCREENS = join(REPO_ROOT, 'scripts', 'lib', 'figma-drift-screens.figma.js');
const DRIFT_COMPONENTS = join(REPO_ROOT, 'scripts', 'lib', 'figma-drift-components.figma.js');
const OUT = join(REPO_ROOT, 'references', 'figma-checks.md');
const ADHERENCE_OUT = join(REPO_ROOT, 'references', 'figma-adherence.md');
const COMPOSE_OUT = join(REPO_ROOT, 'references', 'figma-compose.md');
const DRIFT_OUT = join(REPO_ROOT, 'references', 'figma-drift.md');

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
  '> (variable alias resolution) + `scripts/lib/figma-adherence-read.figma.js` (the',
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

const COMPOSE_HEADER = [
  '# Figma screen composition (GENERATED)',
  '',
  '> **GENERATED FILE — do not edit by hand.** Sources: `scripts/lib/figma-adherence.mjs`',
  '> (for `dimensionBuckets`), `scripts/lib/figma-compose.mjs` (the pure resolver,',
  '> unit-tested in Node), `scripts/lib/figma-variables-read.figma.js`,',
  '> `scripts/lib/figma-compose-read.figma.js` (the reader) +',
  '> `scripts/lib/figma-compose.figma.js` (the writer). Regenerate with',
  '> `node scripts/build-figma-checks.mjs`; CI gates freshness with `--check`.',
  '',
  'The canonical `figma_execute` snippet that composes a screen from the file\'s own',
  'component sets, variables and text styles. A screen is a short JSON description',
  'written only in those names (its shape is the `DESCRIPTION` comment in the',
  'snippet, at the top of the resolver).',
  'The whole description is checked before anything is written: an unknown component,',
  'property, option, variable or text style, a variable of the wrong kind, or a name',
  'already held by a screen a person made, comes back as a list of errors and the file',
  'is untouched. A component the file lacks is a `missing-component` error with the',
  'nearest names: report it as a gap, never draw a lookalike. Every value the script',
  'writes is bound to a variable. The script is the rule; do not re-write it by hand.',
  '',
  '## How to call it',
  '',
  '1. Paste the snippet below into `figma_execute` with `timeout: 30000`, and end it',
  '   with `return await runCompose(MODE, SPEC);`, one mode per call:',
  '   - `\'inventory\'`, `SPEC = { componentsPage, iconsPage }`: read-only. Returns',
  '     `{ summary }`: each set\'s properties and options and whether it has auto',
  '     layout, swap targets, variables by kind (colour, gap, radius), text styles and',
  '     modes. Plan only from these names.',
  '     `iconsPage` is optional; pass it when a swap property needs its targets.',
  '   - `\'build\'`, `SPEC = { componentsPage, iconsPage, description, fileKey }`:',
  '     returns `{ ok: false, errors }` with nothing written, or builds the screen into',
  '     a top-level frame `WIP: <screen>` on the description\'s page (created if',
  '     missing) and returns `{ ok: true, wipId, wipName, link, ms }`. A throw during',
  '     the write removes the `WIP:` frame (and a page the build created) before it',
  '     rethrows, so nothing is left half-built: report it as a composer bug.',
  '   - `\'finalize\'`, `SPEC = { page, screen, fileKey }`: renames `WIP: <screen>` to',
  '     `<screen>`, replacing a screen of that name only if throughline composed it.',
  '     Returns `{ id, link, replaced }`.',
  '   - `\'discard\'`, `SPEC = { page, screen }`: removes `WIP: <screen>`. Only when',
  '     the user asks.',
  '2. Between `build` and `finalize`, run the screen gate',
  '   (`references/figma-adherence.md`) with `screens: [\'WIP: <screen>\']`. Finalize',
  '   only a passing screen. A failure is a composer bug: report it and leave the',
  '   `WIP:` frame.',
  '3. Pages are found by exact name, or else the one page whose trimmed name matches.',
  '   Only the named pages are loaded. Components and variables are the file\'s local',
  '   ones.',
  '',
  '```js',
  'const MODE = \'build\';',
  'const SPEC = { componentsPage: \'Components\', iconsPage: \'Icons\', fileKey: \'<figma.fileKey>\', description: {',
  '  screen: \'Sign in\', page: \'Screens\', width: 390, modes: { \'Color / Semantic\': \'Light\' },',
  '  root: { layout: \'vertical\', gap: \'space/gap/md\', padding: \'space/inset/lg\', fill: \'color/bg/canvas\', children: [',
  '    { text: \'Sign in\', style: \'Heading/L\', color: \'color/text/primary\' },',
  '    { component: \'Input\', props: { placeholder: \'Email\' }, sizing: { horizontal: \'fill\' } },',
  '    { component: \'Button\', props: { label: \'Sign in\', hasTrailing: true, trailingIcon: \'icon/arrow-right\' } },',
  '  ] },',
  '} };',
  '// … the generated snippet …',
  'return await runCompose(MODE, SPEC);',
  '```',
  '',
  '## The snippet',
  '',
  '```js',
].join('\n');

const DRIFT_HEADER = [
  '# Figma drift (GENERATED)',
  '',
  '> **GENERATED FILE — do not edit by hand.** Sources: the variables snippet is',
  '> `scripts/lib/figma-variables-read.figma.js` + `scripts/lib/figma-drift-variables.figma.js`;',
  '> the screens snippet is `scripts/lib/figma-adherence.mjs` (for `dimensionBuckets`),',
  '> `scripts/lib/figma-compose.mjs` (the pure resolver),',
  '> `scripts/lib/figma-compose-read.figma.js` + `scripts/lib/figma-drift-screens.figma.js`;',
  '> the components snippet is `scripts/lib/figma-drift-components.figma.js` alone.',
  '> Regenerate with `node scripts/build-figma-checks.mjs`; CI gates freshness with `--check`.',
  '',
  'The canonical `figma_execute` snippets for the live half of `/throughline:drift`',
  'and the variable stamp `/throughline:sync-figma-tokens` takes. Both are read-only:',
  'they carry no writer and change nothing in the file. The comparison happens in',
  'Node, in `scripts/drift-check.mjs`. The scripts are the rule; do not re-write',
  'them by hand.',
  '',
  '## How to call it',
  '',
  'Paste a snippet into `figma_execute` with `timeout: 30000`, followed by its',
  'return line. Each is self-contained; never paste two together.',
  '',
  '- **Variables** (the short one): end it with `return await runDriftVariables();`.',
  '  Returns one line per local variable collection, `{ "<collection>": { variables, hash } }`:',
  '  its variable count and a fingerprint of every name, type and value in it (aliases',
  '  followed, colours as hex). Write the result to a file as returned and pass it to',
  '  `drift-check.mjs compare-figma --from <file>` (or `stamp-figma` after a sync).',
  '- **Screens**: declare `const SPEC = { entries };` above it and end it with',
  '  `return await runDriftScreens(SPEC);`. `entries` is the list of Figma entries',
  '  (`side: "figma"`) from `design-system/screens.json`, as stored. Returns',
  '  `{ screens: [{ screen, page, state, errors }] }`, `state` one of `clean`,',
  '  `broken` (the stored description no longer resolves against the components page',
  '  it was built from: `errors` say what), `gone` (no frame or page of that name) or',
  '  `released` (the frame is no longer marked as composed). Pages are found by exact',
  '  name, or else the one page whose trimmed name matches; only the pages named in',
  '  the entries are loaded.',
  '- **Components**: declare `const SPEC = { names };` above it (add `componentsPage`',
  '  when you know it) and end it with `return await runDriftComponents(SPEC);`.',
  '  `names` is `components.documented` from `drift-check.mjs check --json`. Returns',
  '  `{ page, components: { <name>: { axes: { <axis>: [options] } } | null } }`, `null`',
  '  when no component set on the page has that name. Without `componentsPage` it reads',
  '  the one page named like "Components" and throws naming the pages when there is',
  '  none or several. Write the result to a file and pass it to',
  '  `drift-check.mjs compare-components --from <file>`.',
  '',
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

export function buildFigmaCompose({ adherenceSource, composeSource, variablesSource, composeReaderSource, writerSource }) {
  const adherence = stripExports(adherenceSource);
  const compose = stripExports(composeSource);
  assertInlinable([['figma-adherence.mjs', adherence], ['figma-compose.mjs', compose], ['figma-variables-read.figma.js', variablesSource], ['figma-compose-read.figma.js', composeReaderSource], ['figma-compose.figma.js', writerSource]]);
  return `${COMPOSE_HEADER}\n${adherence}\n${compose}\n${variablesSource}\n${composeReaderSource}\n${writerSource}${FOOTER}`;
}

export function buildFigmaDrift({ adherenceSource, composeSource, variablesSource, composeReaderSource, driftVariablesSource, driftScreensSource, driftComponentsSource }) {
  const adherence = stripExports(adherenceSource);
  const compose = stripExports(composeSource);
  assertInlinable([['figma-adherence.mjs', adherence], ['figma-compose.mjs', compose], ['figma-variables-read.figma.js', variablesSource], ['figma-compose-read.figma.js', composeReaderSource], ['figma-drift-variables.figma.js', driftVariablesSource], ['figma-drift-screens.figma.js', driftScreensSource], ['figma-drift-components.figma.js', driftComponentsSource]]);
  return [
    DRIFT_HEADER,
    '## The variables snippet',
    '',
    `\`\`\`js\n${variablesSource}\n${driftVariablesSource}${FOOTER}`,
    '## The screens snippet',
    '',
    `\`\`\`js\n${adherence}\n${compose}\n${composeReaderSource}\n${driftScreensSource}${FOOTER}`,
    '## The components snippet',
    '',
    `\`\`\`js\n${driftComponentsSource}${FOOTER}`,
  ].join('\n');
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
  const compose = buildFigmaCompose({
    adherenceSource: readFileSync(ADHERENCE, 'utf8'),
    composeSource: readFileSync(COMPOSE, 'utf8'),
    variablesSource: readFileSync(VARIABLES, 'utf8'),
    composeReaderSource: readFileSync(COMPOSE_READER, 'utf8'),
    writerSource: readFileSync(COMPOSE_WRITER, 'utf8'),
  });
  const drift = buildFigmaDrift({
    adherenceSource: readFileSync(ADHERENCE, 'utf8'),
    composeSource: readFileSync(COMPOSE, 'utf8'),
    variablesSource: readFileSync(VARIABLES, 'utf8'),
    composeReaderSource: readFileSync(COMPOSE_READER, 'utf8'),
    driftVariablesSource: readFileSync(DRIFT_VARIABLES, 'utf8'),
    driftScreensSource: readFileSync(DRIFT_SCREENS, 'utf8'),
    driftComponentsSource: readFileSync(DRIFT_COMPONENTS, 'utf8'),
  });
  const outputs = [
    [OUT, result, 'references/figma-checks.md', 'figma checks'],
    [ADHERENCE_OUT, adherence, 'references/figma-adherence.md', 'figma adherence'],
    [COMPOSE_OUT, compose, 'references/figma-compose.md', 'figma compose'],
    [DRIFT_OUT, drift, 'references/figma-drift.md', 'figma drift'],
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
