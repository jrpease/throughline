// Generates references/doc-card-builder.md — the canonical figma_execute
// snippet that renders a doc card's Usage band — by inlining the pure planner
// (lib/doc-card-plan.mjs) above the Figma renderer template
// (lib/doc-card-render.figma.js). Mirrors the adapters generate.mjs idiom:
// run bare to write, run with --check to gate CI. Zero dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLANNER = join(REPO_ROOT, 'scripts', 'lib', 'doc-card-plan.mjs');
const RENDERER = join(REPO_ROOT, 'scripts', 'lib', 'doc-card-render.figma.js');
const OUT = join(REPO_ROOT, 'references', 'doc-card-builder.md');

const HEADER = [
  '# Doc-card Usage-band builder (GENERATED)',
  '',
  '> **GENERATED FILE — do not edit by hand.** Sources: `scripts/lib/doc-card-plan.mjs`',
  '> (the pure planner, unit-tested in Node) + `scripts/lib/doc-card-render.figma.js`',
  '> (the Figma renderer). Regenerate with `node scripts/build-doc-card-builder.mjs`;',
  '> CI gates freshness with `--check`.',
  '',
  'The canonical `figma_execute` snippet that renders a component doc card\'s',
  '`Usage` band from its `.doc.json` record. Every card is identical by',
  'construction — never hand-build the usage body. The builder owns the `Usage`',
  'band and the header\'s record-derived content (its short description and date);',
  'it reads the specimen and never writes it. The status chip keeps its own owner',
  '— the finalize write-back in `references/figma-component-standards.md`.',
  '',
  '## How to call it',
  '',
  '1. Load the record and compute its canonical fingerprint in Node',
  '   (`canonicalFingerprint` in `scripts/lib/doc-record.mjs`).',
  '2. Read `figma.docCardVariables` from `design-system.json`.',
  '   - If present, resolve each of the nine roles to a Variable object **by',
  '     the recorded name** — do not re-derive, do not substitute a similar',
  '     name. Look each name up via `figma_get_variables`, then in the script',
  '     fetch it as a Variable object with',
  '     `figma.variables.getVariableByIdAsync(id)`. If a recorded name no',
  '     longer resolves to exactly one variable in the file, **throw** rather',
  '     than guess — the token was renamed or removed, and silently picking a',
  '     neighbour is how cards drift apart.',
  '   - If the field is absent (a project\'s first doc-card render), resolve',
  '     the nine roles once, **write the mapping back to `design-system.json`**',
  '     as `figma.docCardVariables`, then render. Every later render reads it.',
  '   The nine roles: `textDefault`, `textMuted` (text colors), `tonePositive`,',
  '   `toneNegative` (Do/Don\'t eyebrow colors — success/danger roles), `border`',
  '   (row dividers), `spacePadding`, `spaceRowGap`, `spaceBlockGap`,',
  '   `spaceItemGap` (spacing roles: band padding, row gap, block gutter,',
  '   within-block gap).',
  '3. Find the body text style: `(await figma.getLocalTextStylesAsync())',
  '   .find((s) => s.name === \'Body/Default\')`. Missing variables or style =',
  '   the builder throws (bind-or-throw — the gap is in the token set; fix it',
  '   there, never hardcode around it).',
  '4. Prepend the two slots, then the snippet below, then the call:',
  '',
  '```js',
  'const RECORD = /* the parsed .doc.json object */;',
  'const CANONICAL_FP = \'/* canonicalFingerprint(RECORD), 16 hex chars */\';',
  '// … the generated snippet …',
  'const card = await figma.getNodeByIdAsync(cardNodeId);',
  'const summary = await renderDocCard({ card, record: RECORD, vars, bodyTextStyle });',
  '```',
  '',
  '5. Pass an explicit `timeout` (30000 is right for one card; the ~30s',
  '   `figma_execute` ceiling fits a single card comfortably — render cards one',
  '   call at a time, never batched).',
  '6. Verify from the returned summary — `rowsRendered`, `blocksCreated`,',
  '   `cardWidth` — not from a screenshot, then stamp the manifest from it:',
  '   `surfaces.docCard = { src: summary.fingerprint, render: summary.renderHash,',
  '   renderer: summary.rendererVersion }`. Never re-read the card to stamp.',
  '',
  '## The snippet',
  '',
  '```js',
].join('\n');

const FOOTER = [
  '```',
  '',
  'Layout contract and rationale:',
  '`docs/superpowers/specs/2026-08-09-doc-card-layout-and-voice-design.md`.',
  '',
].join('\n');

export function buildDocCardBuilder({ plannerSource, rendererSource }) {
  const inlined = plannerSource
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ');
  for (const [name, src] of [['doc-card-plan.mjs', inlined], ['doc-card-render.figma.js', rendererSource]]) {
    if (/^\s*(import|export)\b/m.test(src)) {
      throw new Error(`${name} must stay import-free (only top-level \`export const\`/\`export function\` allowed in the planner) — it is inlined into the Figma snippet where no module system exists`);
    }
  }
  return `${HEADER}\n${inlined}\n${rendererSource}${FOOTER}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = buildDocCardBuilder({
    plannerSource: readFileSync(PLANNER, 'utf8'),
    rendererSource: readFileSync(RENDERER, 'utf8'),
  });
  if (process.argv.includes('--check')) {
    let onDisk = null;
    try { onDisk = readFileSync(OUT, 'utf8'); } catch (e) { /* missing counts as drift */ }
    if (onDisk !== result) {
      console.error('✗ references/doc-card-builder.md out of date; run: node scripts/build-doc-card-builder.mjs');
      process.exit(1);
    }
    console.log('✓ doc-card builder in sync');
  } else {
    writeFileSync(OUT, result);
    console.log('✓ wrote references/doc-card-builder.md');
  }
}
