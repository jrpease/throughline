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

// A fake Figma holding one page and one screen: a raw white rectangle, a card
// with an unbound 8 px radius, a 50% black scrim, and an instance whose own fill
// was overridden to raw white. One white colour variable and one ALL_SCOPES
// radius variable. No figma.fileKey: the links come from TARGET.
function fakeFigma() {
  const mixed = Symbol('mixed');
  const solid = (r, g, b, opacity) => ({ type: 'SOLID', visible: true, color: { r, g, b }, ...(opacity === undefined ? {} : { opacity }) });
  const rect = { id: '1:3', name: 'Box', type: 'RECTANGLE', visible: true, fills: [solid(1, 1, 1)], strokes: [], cornerRadius: 0 };
  const card = { id: '1:4', name: 'Card', type: 'RECTANGLE', visible: true, fills: [], strokes: [], cornerRadius: 8 };
  const scrim = { id: '1:5', name: 'Scrim', type: 'RECTANGLE', visible: true, fills: [solid(0, 0, 0, 0.5)], strokes: [], cornerRadius: 0 };
  const instance = {
    id: '1:6', name: 'Button', type: 'INSTANCE', visible: true, fills: [solid(1, 1, 1)], strokes: [],
    overrides: [{ id: '1:6', overriddenFields: ['fills'] }], findOne: () => null,
  };
  const screen = { id: '1:2', name: 'Home', type: 'FRAME', visible: true, fills: [], strokes: [], cornerRadius: 0, layoutMode: 'NONE', children: [rect, card, scrim, instance] };
  const page = { name: '  Templates', children: [screen], loadAsync: async () => {}, findOne: () => null };
  const white = { id: 'v1', name: 'color/bg/canvas', variableCollectionId: 'c1', valuesByMode: { m: { r: 1, g: 1, b: 1, a: 1 } } };
  const radius = { id: 'v2', name: 'radius/md', scopes: ['ALL_SCOPES'], variableCollectionId: 'c1', valuesByMode: { m: 8 } };
  return {
    mixed,
    root: { children: [page] },
    variables: {
      getLocalVariablesAsync: async (type) => (type === 'COLOR' ? [white] : [radius]),
      getVariableCollectionByIdAsync: async () => ({ modes: [{ modeId: 'm', name: 'Default' }], defaultModeId: 'm' }),
      getVariableByIdAsync: async () => null,
    },
  };
}

test('the inlined adherence snippet runs end to end against a fake Figma', async () => {
  const code = snippetOf(buildFigmaAdherence(adherenceSources()));
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const run = new AsyncFunction('figma', `${code}\nreturn await runScreenGate({ page: 'Templates', fileKey: 'TEST' }, []);`);
  const result = await run(fakeFigma());
  assert.equal(result.pass, false);
  assert.deepEqual(
    result.failures.map((f) => `${f.rule} | ${f.path} | ${f.detail}`),
    [
      'raw-colour | Templates / Home / Box | fill #ffffff: bind color/bg/canvas',
      'raw-colour | Templates / Home / Button | fill #ffffff: bind color/bg/canvas',
      'raw-dimension | Templates / Home / Card | radius-all 8: bind radius/md',
    ],
  );
  assert.equal(result.failures[0].link, 'https://www.figma.com/design/TEST?node-id=1-3');
  assert.deepEqual(result.advisories.map((a) => a.detail), ['fill #00000080: no colour variable has this value']);
});
