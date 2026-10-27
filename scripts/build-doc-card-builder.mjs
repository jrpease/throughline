// Generates references/doc-card-builder.md — the canonical figma_execute
// snippet that renders a doc card — by inlining the pure planner
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
  '# Doc-card builder (GENERATED)',
  '',
  '> **GENERATED FILE — do not edit by hand.** Sources: `scripts/lib/doc-card-plan.mjs`',
  '> (the pure planner, unit-tested in Node) + `scripts/lib/doc-card-render.figma.js`',
  '> (the Figma renderer). Regenerate with `node scripts/build-doc-card-builder.mjs`;',
  '> CI gates freshness with `--check`.',
  '',
  'The canonical `figma_execute` snippet that renders a component doc card from',
  'its `.doc.json` record: a `_Doc/Header` kit instance, a `Band: Specimen` band',
  'around the live component set, then one band per section (`Band: Usage` in',
  'renderer 5). Every card is identical by construction — never hand-build a',
  'band. The builder owns the bands and the header\'s title, summary and date; it',
  'moves the specimen into its band but never rebuilds it. The header\'s `Status`',
  'variant has its own owner, finalize, through `--status` below; the builder sets',
  'it only when it first creates a header.',
  '',
  '## How to call it',
  '',
  'Render one card:',
  '',
  '```sh',
  'node scripts/doc-card-payload.mjs design-system/docs/components/<Name>.doc.json --out <scratch>/payload.js',
  '```',
  '',
  'It writes the complete `figma_execute` body (record, fingerprint, the fourteen',
  'role lookups and four text-style lookups by recorded name, the snippet and the',
  'call) and prints `expectedRecordHash` to stderr. Pass the file\'s contents as',
  'the `code` unchanged. It opens with the two slots the snippet reads,',
  '`const RECORD = <the parsed .doc.json>;` and',
  '`const CANONICAL_FP = \'<canonicalFingerprint(RECORD)>\';`, then the snippet,',
  'the lookups and the call. The card is found by its tag (shared plugin data',
  '`throughline` / `docCard` = the component name). A card no v5 render has',
  'touched yet (every v4 card) has no tag: add `--node-id <card frame id>` once,',
  'and the render tags it.',
  '',
  'Set a card\'s status (finalize):',
  '',
  '```sh',
  'node scripts/doc-card-payload.mjs design-system/docs/components/<Name>.doc.json --status stable --out <scratch>/payload.js',
  '```',
  '',
  'That payload only sets the header\'s `Status` variant (`draft` / `beta` /',
  '`stable` / `deprecated`) on the tagged card.',
  '',
  'What the render needs, and what to do when it isn\'t recorded yet:',
  '',
  '1. **`figma.fileKey`** in `design-system.json`.',
  '2. **`figma.docCardVariables`**, fourteen roles, each resolved **by the',
  '   recorded name** — never re-derived or substituted. A name that doesn\'t',
  '   resolve to exactly one variable throws: the token was renamed or removed.',
  '   - `textDefault`, `textMuted` (text), `tonePositive`, `toneNegative`,',
  '     `toneCaution` (Do / Don\'t / caution tones, also the Unreviewed',
  '     chip), `border`, `spacePadding`, `spaceRowGap`, `spaceBlockGap`,',
  '     `spaceItemGap` (band padding, gaps between blocks, columns and items),',
  '     `surfaceBand`, `surfaceHeader`, `textOnHeader`, `radiusBand`.',
  '   - A project with the v4 nine recorded fills in only the last five: pick',
  '     each once and write it back. The header is where the card carries the',
  '     brand, and it must stand apart from the card frame it sits on. Before',
  '     suggesting `surfaceHeader` and `textOnHeader`, look at how the file\'s',
  '     existing artboards set their headers off from the artboard fill (a brand',
  '     surface with its paired text, e.g. `surface/brand-primary-default` with',
  '     `text/on-brand-primary`, or a raised neutral with brand text) and suggest',
  '     a pairing in that pattern whose surface differs from the card\'s fill.',
  '     Check the pair reads and confirm both with the user; never default to an',
  '     inverse or neutral surface without asking. The render refuses a header',
  '     whose fill matches the card\'s. `textOnHeader` also colours the status chip.',
  '   - A project with nothing recorded and a card **not yet migrated to v5** can',
  '     recover the nine v4 roles from that card, by resolving each bound variable',
  '     id back to its name (`figma.variables.getVariableByIdAsync(id)`):',
  '     `spacePadding` ← the `Usage` frame\'s `paddingLeft`; `spaceRowGap` ← its',
  '     `itemSpacing`; `spaceBlockGap` ← a `Usage Row *` frame\'s `itemSpacing`;',
  '     `spaceItemGap` ← a `Block: *` frame\'s `itemSpacing`; `border` ← a',
  '     `Row Divider` frame\'s `fills[0].boundVariables.color`; `tonePositive` /',
  '     `toneNegative` ← the first TEXT child of `Block: Do` / `Block: Don\'t`,',
  '     same property; `textMuted` ← the first TEXT child of any other block;',
  '     `textDefault` ← the second child of `Block: Overview`. Migrated cards',
  '     have none of these nodes. With no card to read, choose by judgement —',
  '     that establishes the project\'s rhythm.',
  '3. **`figma.docCardTextStyles`**: `title`, `bandTitle`, `body`, `caption`,',
  '   resolved by recorded name the same way. Pick once and write back;',
  '   `Body/Default` is the suggested `body`.',
  '4. **`components.meta[<Name>].status`**: the header\'s first `Status`. A value',
  '   outside the four options stops the render and names it.',
  '5. **`figma.docKit`**: `null` until the first render draws the kit',
  '   (`_Doc/Header`, `_Doc/Band header`) on a `Documentation Kit` page. When the',
  '   summary says `kitDrawn: true`, write `figma.docKit = { fileKey }` back.',
  '   After that the kit belongs to designers: the builder only sets its',
  '   properties by name and never redraws it. To get a deleted kit back, set',
  '   `figma.docKit` to `null`.',
  '',
  'Then:',
  '',
  '- Pass an explicit `timeout` (30000 suits one card; the first render also',
  '  draws the kit, so start with a small card). Render cards one call at a time,',
  '  never batched.',
  '- Check `summary.recordHash` equals the `expectedRecordHash` the script printed.',
  '  A mismatch means the payload changed on the way in.',
  '- Stamp the manifest from the summary, never from a re-read:',
  '  `surfaces.docCard = { src: summary.fingerprint, recordHash:',
  '  summary.recordHash, render: summary.render, renderer:',
  '  summary.rendererVersion }`.',
  '',
  '## The snippet',
  '',
  '```js',
].join('\n');

const FOOTER = [
  '```',
  '',
  'Layout contract and rationale:',
  '`docs/specs/2026-10-15-doc-card-v5.md`.',
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
    try { onDisk = readFileSync(OUT, 'utf8'); } catch { /* missing counts as drift */ }
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
