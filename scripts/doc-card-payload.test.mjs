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
    docCardVariables: {
      textDefault: 'color/text/primary', textMuted: 'color/text/secondary',
      tonePositive: 'color/success/default', toneNegative: 'color/danger/default',
      border: 'color/border/default', spacePadding: 'space/inset/lg',
      spaceRowGap: 'space/gap/xl', spaceBlockGap: 'space/gap/lg', spaceItemGap: 'space/gap/sm',
    },
  },
};

const build = (over = {}) => buildPayload({ record: RECORD, cardNodeId: '12:354', manifest: MANIFEST, builderMarkdown: BUILDER_MD, ...over });

test('extractSnippet returns the generated builder code, fences excluded', () => {
  const snippet = extractSnippet(BUILDER_MD);
  assert.match(snippet, /async function renderDocCard\(/);
  assert.match(snippet, /function planDocCard\(/);
  assert.doesNotMatch(snippet, /```/);
});

test('buildPayload fills both slots, every role name, and the call', () => {
  const { code, fingerprint } = build();
  assert.equal(fingerprint, canonicalFingerprint(RECORD));
  assert.ok(code.startsWith(`const RECORD = ${JSON.stringify(RECORD)};\nconst CANONICAL_FP = '${fingerprint}';\n`));
  assert.ok(code.includes(extractSnippet(BUILDER_MD)));
  for (const name of Object.values(MANIFEST.figma.docCardVariables)) assert.ok(code.includes(JSON.stringify(name)), name);
  assert.match(code, /getNodeByIdAsync\('12:354'\)/);
  assert.match(code, /renderDocCard\(\{ card, record: RECORD, vars, bodyTextStyle \}\)/);
});

test('the payload compiles as a figma_execute body (top-level await + return)', () => {
  assert.doesNotThrow(() => new AsyncFunction('figma', build().code));
});

test('expectedRenderHash is the hash the renderer computes for this record', () => {
  assert.equal(build().expectedRenderHash, fnv1a(JSON.stringify(planDocCard(RECORD, { fontSize: 16 }))));
  // The font size only moves the hash through the clamped column unit.
  assert.equal(build({ fontSize: 20 }).expectedRenderHash, build().expectedRenderHash);
  assert.notEqual(build({ fontSize: 14 }).expectedRenderHash, build().expectedRenderHash);
});

test('buildPayload refuses without a complete docCardVariables mapping', () => {
  assert.throws(() => build({ manifest: {} }), /no figma\.docCardVariables/);
  const partial = { figma: { docCardVariables: { ...MANIFEST.figma.docCardVariables, border: '' } } };
  assert.throws(() => build({ manifest: partial }), /missing role\(s\): border/);
});

test('buildPayload rejects a malformed node id', () => {
  assert.throws(() => build({ cardNodeId: 'Badge' }), /cardNodeId must look like/);
});
