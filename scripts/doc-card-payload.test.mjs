import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPayload, extractSnippet } from './doc-card-payload.mjs';
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
