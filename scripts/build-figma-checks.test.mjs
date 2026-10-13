import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFigmaChecks, buildFigmaAdherence } from './build-figma-checks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, 'lib', name), 'utf8');
const sources = () => ({
  statesSource: read('component-states.mjs'),
  contrastSource: read('contrast.mjs'),
  checkerSource: read('figma-checks.mjs'),
  variablesSource: read('figma-variables-read.figma.js'),
  readerSource: read('figma-checks-read.figma.js'),
});
const adherenceSources = () => ({
  checkerSource: read('figma-adherence.mjs'),
  variablesSource: read('figma-variables-read.figma.js'),
  readerSource: read('figma-adherence-read.figma.js'),
});
const snippetOf = (md) => md.slice(md.lastIndexOf('```js') + '```js'.length, md.lastIndexOf('```'));

test('build: inlines all five sources, no module syntax survives', () => {
  const md = buildFigmaChecks(sources());
  assert.match(md, /function resolveArchetype\(/);
  assert.match(md, /function withTable\(/);
  assert.match(md, /function contrastRatio\(/);
  assert.match(md, /const AA_NON_TEXT = 3;/);
  assert.match(md, /async function variableColors\(/);
  assert.match(md, /async function runFigmaChecks\(/);
  assert.match(md, /const \{ checkSpec, checkBuilt, checkExisting \} = withTable\(\{ resolveArchetype, BASELINE_STATES, STATE_SYNONYMS, normalizeName, contrastRatio, composite, parseHex, AA_NON_TEXT \}\);/);
  assert.ok(!/^\s*(import|export)\b/m.test(snippetOf(md)), 'snippet must contain no import/export lines');
});

test('build: refuses a source that has imports (the inlinability guard)', () => {
  assert.throws(() => buildFigmaChecks({ ...sources(), checkerSource: "import { x } from 'node:fs';\nexport function f() {}\n" }), /import-free/);
  assert.throws(() => buildFigmaChecks({ ...sources(), statesSource: "import { x } from 'node:fs';\n" }), /import-free/);
  assert.throws(() => buildFigmaChecks({ ...sources(), contrastSource: "import { x } from 'node:fs';\n" }), /import-free/);
  assert.throws(() => buildFigmaChecks({ ...sources(), readerSource: 'export const x = 1;\n' }), /import-free/);
});

test('build: the generated markdown carries the do-not-edit warning and the slot instructions', () => {
  const md = buildFigmaChecks(sources());
  assert.match(md, /GENERATED FILE — do not edit by hand/);
  assert.match(md, /const EXPECT =/);
  assert.match(md, /const MODE =/);
  assert.match(md, /return await runFigmaChecks\(EXPECT, MODE\);/);
});

test('build: output is deterministic', () => {
  assert.equal(buildFigmaChecks(sources()), buildFigmaChecks(sources()));
});

test('generated reference on disk is in sync with the sources', () => {
  const onDisk = readFileSync(join(HERE, '..', 'references', 'figma-checks.md'), 'utf8');
  assert.equal(onDisk, buildFigmaChecks(sources()), 'run: node scripts/build-figma-checks.mjs');
});

test('the inlined snippet runs: spec mode reports the missing state without touching figma', async () => {
  const code = snippetOf(buildFigmaChecks(sources()));
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const figma = new Proxy({}, { get() { throw new Error('figma must not be used in spec mode'); } });
  const run = new AsyncFunction('figma', `${code}\nreturn await runFigmaChecks({ name: 'Chip', matrix: { state: ['default', 'hover', 'focus', 'active', 'disabled'] }, uiFramework: 'shadcn' }, 'spec');`);
  const result = await run(figma);
  assert.equal(result.pass, false);
  const check = result.checks.find((c) => c.name === 'state-baseline');
  assert.equal(check.result, 'fail');
  assert.match(check.detail, /selected/);
});

test('adherence build: inlines its three sources, no module syntax survives', () => {
  const md = buildFigmaAdherence(adherenceSources());
  assert.match(md, /function checkScreens\(/);
  assert.match(md, /async function variableColors\(/);
  assert.match(md, /async function runScreenGate\(/);
  assert.match(md, /GENERATED FILE — do not edit by hand/);
  assert.match(md, /const TARGET =/);
  assert.ok(!/^\s*(import|export)\b/m.test(snippetOf(md)), 'snippet must contain no import/export lines');
});

test('adherence build: refuses an importing source, and is deterministic', () => {
  assert.throws(() => buildFigmaAdherence({ ...adherenceSources(), checkerSource: "import { x } from 'node:fs';\n" }), /import-free/);
  assert.throws(() => buildFigmaAdherence({ ...adherenceSources(), variablesSource: 'export const x = 1;\n' }), /import-free/);
  assert.equal(buildFigmaAdherence(adherenceSources()), buildFigmaAdherence(adherenceSources()));
});

test('generated adherence reference on disk is in sync with the sources', () => {
  const onDisk = readFileSync(join(HERE, '..', 'references', 'figma-adherence.md'), 'utf8');
  assert.equal(onDisk, buildFigmaAdherence(adherenceSources()), 'run: node scripts/build-figma-checks.mjs');
});

// A fake Figma holding one page, one screen and one raw white rectangle, and one
// white colour variable: the screen reader and checker run end to end.
function fakeFigma() {
  const mixed = Symbol('mixed');
  const rect = { id: '1:3', name: 'Box', type: 'RECTANGLE', visible: true, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }], strokes: [], cornerRadius: 0 };
  const screen = { id: '1:2', name: 'Home', type: 'FRAME', visible: true, fills: [], strokes: [], cornerRadius: 0, layoutMode: 'NONE', children: [rect] };
  const page = { name: 'Templates', children: [screen], loadAsync: async () => {}, findOne: () => null };
  const white = { id: 'v1', name: 'color/bg/canvas', variableCollectionId: 'c1', valuesByMode: { m: { r: 1, g: 1, b: 1, a: 1 } } };
  return {
    mixed,
    fileKey: 'TEST',
    root: { children: [page] },
    variables: {
      getLocalVariablesAsync: async (type) => (type === 'COLOR' ? [white] : []),
      getVariableCollectionByIdAsync: async () => ({ modes: [{ modeId: 'm', name: 'Default' }], defaultModeId: 'm' }),
      getVariableByIdAsync: async () => null,
    },
  };
}

test('the inlined adherence snippet runs: a raw white fill fails naming the variable', async () => {
  const code = snippetOf(buildFigmaAdherence(adherenceSources()));
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const run = new AsyncFunction('figma', `${code}\nreturn await runScreenGate({ page: 'Templates' }, []);`);
  const result = await run(fakeFigma());
  assert.equal(result.pass, false);
  assert.deepEqual(result.failures.map((f) => f.rule).sort(), ['dimension-rule-inert', 'raw-colour']);
  const colour = result.failures.find((f) => f.rule === 'raw-colour');
  assert.equal(colour.detail, 'fill #ffffff: bind color/bg/canvas');
  assert.equal(colour.path, 'Templates / Home / Box');
  assert.equal(colour.link, 'https://www.figma.com/design/TEST?node-id=1-3');
});
