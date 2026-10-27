// Assembles the complete figma_execute payload that renders one component doc
// card — the steps in "How to call it" in references/doc-card-builder.md — so
// the caller passes one file's contents instead of hand-splicing the record,
// fingerprint, variable and text-style lookups and generated snippet. Also
// prints the recordHash the render must return: the payload is pasted into the
// tool call, and a matching hash proves the record arrived intact.
//
//   node scripts/doc-card-payload.mjs <record.doc.json> [--node-id <id>]
//        [--status <value>] [--manifest design-system.json] [--out payload.js]
//
// The card is found by its tag (the component name, record.name); --node-id is
// only for a card that has never been rendered by v5. --status emits a payload
// that only sets the header's Status variant (finalize).
//
// Zero dependencies. Reads the generated snippet from ../references, which sits
// beside scripts/ both in the plugin and in an adapter install's .throughline/.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalFingerprint } from './lib/doc-record.mjs';
import { planDocCard, fnv1a, statusVariant } from './lib/doc-card-plan.mjs';

const BUILDER = join(dirname(fileURLToPath(import.meta.url)), '..', 'references', 'doc-card-builder.md');

const ROLES = [
  'textDefault', 'textMuted', 'tonePositive', 'toneNegative', 'border',
  'spacePadding', 'spaceRowGap', 'spaceBlockGap', 'spaceItemGap',
  'surfaceBand', 'surfaceHeader', 'textOnHeader', 'radiusBand', 'toneCaution',
];
const TEXT_STYLES = ['title', 'bandTitle', 'body', 'caption'];

// The text between "## The snippet"'s opening ```js fence and its closing fence.
export function extractSnippet(builderMarkdown) {
  const section = builderMarkdown.split('\n## The snippet\n')[1];
  if (!section) throw new Error('doc-card-builder.md has no "## The snippet" section');
  const start = section.indexOf('```js\n');
  const end = section.lastIndexOf('\n```');
  if (start === -1 || end <= start) throw new Error('doc-card-builder.md: snippet fence not found');
  return section.slice(start + '```js\n'.length, end + 1);
}

export function buildPayload({ record, manifest, builderMarkdown, nodeId = null, status = null }) {
  const componentName = record && record.name;
  if (typeof componentName !== 'string' || componentName === '') throw new Error('the record has no name');
  const snippet = extractSnippet(builderMarkdown);

  if (status !== null) {
    const value = statusVariant(status);
    return {
      code: [snippet, `return await setDocCardStatus({ componentName: ${JSON.stringify(componentName)}, status: '${value}' });`, ''].join('\n'),
      componentName,
      status: value,
    };
  }

  if (nodeId !== null && !/^\d+:\d+$/.test(nodeId)) throw new Error(`--node-id must look like "24:773", got "${nodeId}"`);
  const figmaConf = (manifest && manifest.figma) || {};
  const names = figmaConf.docCardVariables;
  if (!names) {
    throw new Error('design-system.json has no figma.docCardVariables — recover the nine v4 roles from an existing card '
      + 'and pick the five v5 ones ("How to call it" in references/doc-card-builder.md), write them back, then re-run');
  }
  const missing = ROLES.filter((r) => typeof names[r] !== 'string' || names[r] === '');
  if (missing.length) throw new Error('figma.docCardVariables is missing role(s): ' + missing.join(', '));
  const styles = figmaConf.docCardTextStyles;
  const missingStyles = TEXT_STYLES.filter((r) => !styles || typeof styles[r] !== 'string' || styles[r] === '');
  if (missingStyles.length) throw new Error('figma.docCardTextStyles is missing: ' + missingStyles.join(', '));
  if (typeof figmaConf.fileKey !== 'string' || figmaConf.fileKey === '') throw new Error('design-system.json has no figma.fileKey');

  const fingerprint = canonicalFingerprint(record);
  const roleNames = Object.fromEntries(ROLES.map((r) => [r, names[r]]));
  const styleNames = Object.fromEntries(TEXT_STYLES.map((r) => [r, styles[r]]));
  const meta = manifest.components && manifest.components.meta && manifest.components.meta[componentName];
  const args = {
    componentName,
    nodeId,
    fileKey: figmaConf.fileKey,
    docKitFileKey: (figmaConf.docKit && figmaConf.docKit.fileKey) || null,
    status: (meta && meta.status) || null,
  };
  const code = [
    `const RECORD = ${JSON.stringify(record)};`,
    `const CANONICAL_FP = '${fingerprint}';`,
    snippet,
    `const ROLE_NAMES = ${JSON.stringify(roleNames)};`,
    `const STYLE_NAMES = ${JSON.stringify(styleNames)};`,
    'const allVars = await figma.variables.getLocalVariablesAsync();',
    'const vars = {};',
    'for (const [role, name] of Object.entries(ROLE_NAMES)) {',
    '  const hits = allVars.filter((v) => v.name === name);',
    "  if (hits.length !== 1) throw new Error('docCardVariables.' + role + ' \"' + name + '\" resolves to ' + hits.length + ' variables, not exactly one');",
    '  vars[role] = await figma.variables.getVariableByIdAsync(hits[0].id);',
    '}',
    'const allStyles = await figma.getLocalTextStylesAsync();',
    'const textStyles = {};',
    'for (const [role, name] of Object.entries(STYLE_NAMES)) {',
    '  const hits = allStyles.filter((s) => s.name === name);',
    "  if (hits.length !== 1) throw new Error('docCardTextStyles.' + role + ' \"' + name + '\" resolves to ' + hits.length + ' text styles, not exactly one');",
    '  textStyles[role] = hits[0];',
    '}',
    `const ARGS = ${JSON.stringify(args)};`,
    'return await renderDocCard({ ...ARGS, record: RECORD, vars, textStyles });',
    '',
  ].join('\n');

  return {
    code,
    componentName,
    fingerprint,
    expectedRecordHash: fnv1a(JSON.stringify(planDocCard(record))),
  };
}

function parseArgs(argv) {
  const positional = [];
  const opts = { manifest: 'design-system.json', out: null, nodeId: null, status: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') opts.manifest = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--node-id') opts.nodeId = argv[++i];
    else if (a === '--status') opts.status = argv[++i];
    else positional.push(a);
  }
  if (positional.length !== 1) {
    throw new Error('usage: node scripts/doc-card-payload.mjs <record.doc.json> [--node-id <id>] [--status <value>] [--manifest design-system.json] [--out payload.js]');
  }
  return { recordPath: positional[0], ...opts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = buildPayload({
      record: JSON.parse(readFileSync(resolve(args.recordPath), 'utf8')),
      manifest: JSON.parse(readFileSync(resolve(args.manifest), 'utf8')),
      builderMarkdown: readFileSync(BUILDER, 'utf8'),
      nodeId: args.nodeId,
      status: args.status,
    });
    if (args.out) writeFileSync(resolve(args.out), result.code);
    else process.stdout.write(result.code);
    // Machine-readable trailer on stderr so stdout stays a clean payload.
    const { code, ...trailer } = result;
    console.error(JSON.stringify({ ...trailer, out: args.out }));
  } catch (err) {
    console.error('✗ ' + err.message);
    process.exit(1);
  }
}
