// Assembles the complete figma_execute payload that renders one component doc
// card — steps 1–4 of "How to call it" in references/doc-card-builder.md — so
// the caller passes one file's contents instead of hand-splicing the record,
// fingerprint, variable lookups and generated snippet. Also prints the
// renderHash the render must return: the payload is pasted into the tool call,
// and a matching hash proves it arrived intact.
//
//   node scripts/doc-card-payload.mjs <record.doc.json> <cardNodeId>
//        [--manifest design-system.json] [--out payload.js] [--font-size 16]
//
// Zero dependencies. Reads the generated snippet from ../references, which sits
// beside scripts/ both in the plugin and in an adapter install's .throughline/.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalFingerprint } from './lib/doc-record.mjs';
import { planDocCard, fnv1a } from './lib/doc-card-plan.mjs';

const BUILDER = join(dirname(fileURLToPath(import.meta.url)), '..', 'references', 'doc-card-builder.md');

const ROLES = [
  'textDefault', 'textMuted', 'tonePositive', 'toneNegative', 'border',
  'spacePadding', 'spaceRowGap', 'spaceBlockGap', 'spaceItemGap',
];

// The text between "## The snippet"'s opening ```js fence and its closing fence.
export function extractSnippet(builderMarkdown) {
  const section = builderMarkdown.split('\n## The snippet\n')[1];
  if (!section) throw new Error('doc-card-builder.md has no "## The snippet" section');
  const start = section.indexOf('```js\n');
  const end = section.lastIndexOf('\n```');
  if (start === -1 || end <= start) throw new Error('doc-card-builder.md: snippet fence not found');
  return section.slice(start + '```js\n'.length, end + 1);
}

export function buildPayload({ record, cardNodeId, manifest, builderMarkdown, fontSize = 16 }) {
  if (!/^\d+:\d+$/.test(cardNodeId)) throw new Error(`cardNodeId must look like "24:773", got "${cardNodeId}"`);
  const names = manifest && manifest.figma && manifest.figma.docCardVariables;
  if (!names) {
    throw new Error('design-system.json has no figma.docCardVariables — recover the nine roles from an existing card '
      + '(step 2 of "How to call it" in references/doc-card-builder.md), write them back, then re-run');
  }
  const missing = ROLES.filter((r) => typeof names[r] !== 'string' || names[r] === '');
  if (missing.length) throw new Error('figma.docCardVariables is missing role(s): ' + missing.join(', '));

  const fingerprint = canonicalFingerprint(record);
  const roleNames = Object.fromEntries(ROLES.map((r) => [r, names[r]]));
  const code = [
    `const RECORD = ${JSON.stringify(record)};`,
    `const CANONICAL_FP = '${fingerprint}';`,
    extractSnippet(builderMarkdown),
    `const ROLE_NAMES = ${JSON.stringify(roleNames)};`,
    'const allVars = await figma.variables.getLocalVariablesAsync();',
    'const vars = {};',
    'for (const [role, name] of Object.entries(ROLE_NAMES)) {',
    '  const hits = allVars.filter((v) => v.name === name);',
    "  if (hits.length !== 1) throw new Error('docCardVariables.' + role + ' \"' + name + '\" resolves to ' + hits.length + ' variables, not exactly one');",
    '  vars[role] = await figma.variables.getVariableByIdAsync(hits[0].id);',
    '}',
    "const bodyTextStyle = (await figma.getLocalTextStylesAsync()).find((s) => s.name === 'Body/Default');",
    `const card = await figma.getNodeByIdAsync('${cardNodeId}');`,
    `if (!card) throw new Error('no node ${cardNodeId} in this file');`,
    'const summary = await renderDocCard({ card, record: RECORD, vars, bodyTextStyle });',
    'return { ...summary, bodyFontSize: bodyTextStyle.fontSize };',
    '',
  ].join('\n');

  return {
    code,
    fingerprint,
    fontSize,
    expectedRenderHash: fnv1a(JSON.stringify(planDocCard(record, { fontSize }))),
  };
}

function parseArgs(argv) {
  const positional = [];
  const opts = { manifest: 'design-system.json', out: null, fontSize: 16 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') opts.manifest = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--font-size') opts.fontSize = Number(argv[++i]);
    else positional.push(a);
  }
  if (positional.length !== 2 || !Number.isFinite(opts.fontSize)) {
    throw new Error('usage: node scripts/doc-card-payload.mjs <record.doc.json> <cardNodeId> [--manifest design-system.json] [--out payload.js] [--font-size 16]');
  }
  return { recordPath: positional[0], cardNodeId: positional[1], ...opts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = buildPayload({
      record: JSON.parse(readFileSync(resolve(args.recordPath), 'utf8')),
      cardNodeId: args.cardNodeId,
      manifest: JSON.parse(readFileSync(resolve(args.manifest), 'utf8')),
      builderMarkdown: readFileSync(BUILDER, 'utf8'),
      fontSize: args.fontSize,
    });
    if (args.out) writeFileSync(resolve(args.out), result.code);
    else process.stdout.write(result.code);
    // Machine-readable trailer on stderr so stdout stays a clean payload.
    console.error(JSON.stringify({
      fingerprint: result.fingerprint,
      expectedRenderHash: result.expectedRenderHash,
      fontSize: result.fontSize,
      out: args.out,
    }));
  } catch (err) {
    console.error('✗ ' + err.message);
    process.exit(1);
  }
}
