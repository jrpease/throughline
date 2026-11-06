import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPayload, extractSnippet, isRoleSpec, pickRoleVariable } from './doc-card-payload.mjs';
import { canonicalFingerprint } from './lib/doc-record.mjs';
import { planDocCard, fnv1a } from './lib/doc-card-plan.mjs';

const BUILDER_MD = readFileSync(new URL('../references/doc-card-builder.md', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const RECORD = {
  name: 'Badge',
  summary: 'Labels a status, count, or category.',
  description: 'A short label.',
  whenToUse: ['Show a status'],
  whenNotToUse: ['Long text — use a Callout'],
  dos: ['Keep it short'],
  donts: ["Don't rely on colour alone"],
  variants: { tone: { neutral: 'Default.', success: 'Positive outcome.' } },
  states: { default: 'Resting.' },
  accessibility: { role: 'status', keyboard: [], notes: ['Not focusable'] },
  status: 'stable',
  updatedAt: '2026-07-15',
  provenance: { description: 'ai-inferred' },
};

const MANIFEST = {
  figma: {
    fileKey: 'OCiZiGpsJ4ncPD8r205BjC',
    docCardVariables: {
      textDefault: 'color/text/primary', textMuted: 'color/text/secondary',
      tonePositive: 'color/success/default', toneNegative: 'color/danger/default',
      border: 'color/border/default', spacePadding: 'space/inset/lg',
      spaceRowGap: 'space/gap/xl', spaceBlockGap: 'space/gap/lg', spaceItemGap: 'space/gap/sm',
      surfaceBand: 'color/surface/default', surfaceHeader: 'color/surface/inverse',
      textOnHeader: 'color/text/inverse', radiusBand: 'radius/lg', toneCaution: 'color/warning/default',
    },
    docCardTextStyles: { title: 'Heading/H1', bandTitle: 'Heading/H3', body: 'Body/Default', caption: 'Body/Small' },
    docKit: null,
  },
  components: { meta: { Badge: { status: 'stable' } } },
};

const build = (over = {}) => buildPayload({ record: RECORD, manifest: MANIFEST, builderMarkdown: BUILDER_MD, ...over });
const withFigma = (patch) => ({ ...MANIFEST, figma: { ...MANIFEST.figma, ...patch } });

test('extractSnippet returns the generated builder code, fences excluded', () => {
  const snippet = extractSnippet(BUILDER_MD);
  assert.match(snippet, /async function renderDocCard\(/);
  assert.match(snippet, /async function setDocCardStatus\(/);
  assert.match(snippet, /function planDocCard\(/);
  assert.doesNotMatch(snippet, /```/);
});

test('buildPayload fills both slots, every role and style name, and the call by component name', () => {
  const { code, fingerprint, componentName } = build();
  assert.equal(componentName, 'Badge');
  assert.equal(fingerprint, canonicalFingerprint(RECORD));
  assert.ok(code.startsWith(`const RECORD = ${JSON.stringify(RECORD)};\nconst CANONICAL_FP = '${fingerprint}';\n`));
  assert.ok(code.includes(extractSnippet(BUILDER_MD)));
  for (const name of Object.values(MANIFEST.figma.docCardVariables)) assert.ok(code.includes(JSON.stringify(name)), name);
  for (const name of Object.values(MANIFEST.figma.docCardTextStyles)) assert.ok(code.includes(JSON.stringify(name)), name);
  assert.ok(code.includes('const ARGS = {"componentName":"Badge","nodeId":null,"fileKey":"OCiZiGpsJ4ncPD8r205BjC","docKitFileKey":null,"status":"stable"};'));
  assert.match(code, /return await renderDocCard\(\{ \.\.\.ARGS, record: RECORD, vars, textStyles \}\)/);
  assert.doesNotMatch(code, /getNodeByIdAsync\('/);
});

test('--node-id and a recorded kit reach the renderer', () => {
  const { code } = build({ nodeId: '12:354', manifest: withFigma({ docKit: { fileKey: 'OCiZiGpsJ4ncPD8r205BjC' } }) });
  assert.ok(code.includes('"nodeId":"12:354"'));
  assert.ok(code.includes('"docKitFileKey":"OCiZiGpsJ4ncPD8r205BjC"'));
});

test('the payload compiles as a figma_execute body (top-level await + return)', () => {
  assert.doesNotThrow(() => new AsyncFunction('figma', build().code));
  assert.doesNotThrow(() => new AsyncFunction('figma', build({ status: 'stable' }).code));
});

test('expectedRecordHash is the hash the renderer computes for this record', () => {
  assert.equal(build().expectedRecordHash, fnv1a(JSON.stringify(planDocCard(RECORD))));
});

test('--status emits a payload that only sets the header status', () => {
  const result = build({ status: 'Beta' });
  assert.equal(result.status, 'beta');
  assert.match(result.code, /return await setDocCardStatus\(\{ componentName: "Badge", status: 'beta' \}\);\n$/);
  assert.doesNotMatch(result.code, /await renderDocCard\(/);
  assert.doesNotMatch(result.code, /const RECORD =/);
  assert.throws(() => build({ status: 'final' }), /status "final" is not one of/);
});

test('buildPayload refuses without a complete mapping', () => {
  assert.throws(() => build({ manifest: {} }), /no figma\.docCardVariables/);
  const partial = withFigma({ docCardVariables: { ...MANIFEST.figma.docCardVariables, border: '' } });
  assert.throws(() => build({ manifest: partial }), /missing role\(s\): border/);
  const nineOnly = withFigma({ docCardVariables: { ...MANIFEST.figma.docCardVariables, toneCaution: undefined } });
  assert.throws(() => build({ manifest: nineOnly }), /missing role\(s\): toneCaution/);
  assert.throws(() => build({ manifest: withFigma({ docCardTextStyles: null }) }), /docCardTextStyles is missing: title, bandTitle, body, caption/);
  assert.throws(() => build({ manifest: withFigma({ fileKey: null }) }), /no figma\.fileKey/);
});

test('buildPayload rejects a malformed node id', () => {
  assert.throws(() => build({ nodeId: 'Badge' }), /--node-id must look like/);
});

// #191: Zygarden names spacing/space/6 in both a primitive and a semantic collection.
const TWIN_VARS = [
  { id: 'V:1', name: 'spacing/space/6', collection: 'Spacing Primitives' },
  { id: 'V:2', name: 'spacing/space/6', collection: 'Spacing Semantic' },
  { id: 'V:3', name: 'color/text/primary', collection: 'Color / Semantic' },
];

test('a role is a non-empty name or a { collection, name } pair', () => {
  assert.equal(isRoleSpec('color/text/primary'), true);
  assert.equal(isRoleSpec({ collection: 'Spacing Semantic', name: 'spacing/space/6' }), true);
  for (const bad of ['', null, undefined, {}, { name: 'x' }, { collection: 'C' }, { collection: '', name: 'x' }]) {
    assert.equal(isRoleSpec(bad), false, JSON.stringify(bad));
  }
});

test('a bare name resolves when it is unique, and names the collections when it is not', () => {
  assert.equal(pickRoleVariable(TWIN_VARS, 'textDefault', 'color/text/primary').id, 'V:3');
  assert.throws(
    () => pickRoleVariable(TWIN_VARS, 'spacePadding', 'spacing/space/6'),
    /docCardVariables\.spacePadding "spacing\/space\/6" resolves to 2 variables, not exactly one; it is in "Spacing Primitives" and "Spacing Semantic", so record it as \{ "collection"/,
  );
});

test('a collection-qualified role picks the variable in that collection', () => {
  assert.equal(pickRoleVariable(TWIN_VARS, 'spacePadding', { collection: 'Spacing Semantic', name: 'spacing/space/6' }).id, 'V:2');
  assert.equal(pickRoleVariable(TWIN_VARS, 'spacePadding', { collection: 'Spacing Primitives', name: 'spacing/space/6' }).id, 'V:1');
  // A collection name with "/" in it is matched whole.
  assert.equal(pickRoleVariable(TWIN_VARS, 'textDefault', { collection: 'Color / Semantic', name: 'color/text/primary' }).id, 'V:3');
  assert.throws(
    () => pickRoleVariable(TWIN_VARS, 'spacePadding', { collection: 'Spacing Tokens', name: 'spacing/space/6' }),
    /"spacing\/space\/6" in collection "Spacing Tokens" resolves to 0 variables, not exactly one$/,
  );
  // Figma allows two collections with the same name; the pair can't tell them apart.
  const sameNamed = [{ id: 'A', name: 'gap', collection: 'Spacing' }, { id: 'B', name: 'gap', collection: 'Spacing' }];
  assert.throws(() => pickRoleVariable(sameNamed, 'spaceItemGap', { collection: 'Spacing', name: 'gap' }),
    /resolves to 2 variables, not exactly one; two collections are both called "Spacing", so rename one of them in Figma/);
});

test('the payload accepts a qualified role and resolves it in Figma by collection', async () => {
  const roles = { ...MANIFEST.figma.docCardVariables, spacePadding: { collection: 'Spacing Semantic', name: 'spacing/space/6' } };
  const { code } = build({ manifest: withFigma({ docCardVariables: roles }) });
  assert.doesNotThrow(() => new AsyncFunction('figma', code));
  // Run the payload against a stub file holding the twin: it must pick V:2 and
  // get as far as the text styles, which the stub doesn't have.
  const collections = [{ id: 'C:p', name: 'Spacing Primitives' }, { id: 'C:s', name: 'Spacing Semantic' }, { id: 'C:o', name: 'Other' }];
  const others = Object.values(MANIFEST.figma.docCardVariables).filter((n) => n !== MANIFEST.figma.docCardVariables.spacePadding)
    .map((name, i) => ({ id: 'O:' + i, name, variableCollectionId: 'C:o' }));
  const all = [
    { id: 'V:1', name: 'spacing/space/6', variableCollectionId: 'C:p' },
    { id: 'V:2', name: 'spacing/space/6', variableCollectionId: 'C:s' },
    ...others,
  ];
  const fetched = [];
  const figma = {
    variables: {
      getLocalVariablesAsync: async () => all,
      getLocalVariableCollectionsAsync: async () => collections,
      getVariableByIdAsync: async (id) => { fetched.push(id); return { id }; },
    },
    getLocalTextStylesAsync: async () => [],
  };
  await assert.rejects(new AsyncFunction('figma', code)(figma), /docCardTextStyles\.title "Heading\/H1" resolves to 0 text styles/);
  assert.ok(fetched.includes('V:2'));
  assert.ok(!fetched.includes('V:1'));
});
