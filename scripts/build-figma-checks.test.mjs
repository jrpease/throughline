import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFigmaChecks } from './build-figma-checks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, 'lib', name), 'utf8');
const sources = () => ({
  statesSource: read('component-states.mjs'),
  contrastSource: read('contrast.mjs'),
  checkerSource: read('figma-checks.mjs'),
  readerSource: read('figma-checks-read.figma.js'),
});
const snippetOf = (md) => md.slice(md.lastIndexOf('```js') + '```js'.length, md.lastIndexOf('```'));

test('build: inlines all four sources, no module syntax survives', () => {
  const md = buildFigmaChecks(sources());
  assert.match(md, /function resolveArchetype\(/);
  assert.match(md, /function withTable\(/);
  assert.match(md, /function contrastRatio\(/);
  assert.match(md, /const AA_NON_TEXT = 3;/);
  assert.match(md, /async function runFigmaChecks\(/);
  assert.match(md, /const \{ checkSpec, checkBuilt \} = withTable\(\{ resolveArchetype, BASELINE_STATES, STATE_SYNONYMS, normalizeName, contrastRatio, composite, parseHex, AA_NON_TEXT \}\);/);
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
