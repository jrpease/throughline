import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocCardBuilder } from './build-doc-card-builder.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const realPlanner = () => readFileSync(join(HERE, 'lib', 'doc-card-plan.mjs'), 'utf8');
const realRenderer = () => readFileSync(join(HERE, 'lib', 'doc-card-render.figma.js'), 'utf8');

test('build: inlines the planner with export keywords stripped, no module syntax survives', () => {
  const md = buildDocCardBuilder({ plannerSource: realPlanner(), rendererSource: realRenderer() });
  assert.match(md, /function planDocCard\(/);
  assert.match(md, /const DOC_CARD_RENDERER_VERSION = '2'/);
  assert.match(md, /async function renderDocCard\(/);
  const snippet = md.slice(md.indexOf('```js'), md.lastIndexOf('```'));
  assert.ok(!/^\s*(import|export)\b/m.test(snippet), 'snippet must contain no import/export lines');
});

test('build: refuses a planner that has imports (the inlinability guard)', () => {
  assert.throws(
    () => buildDocCardBuilder({
      plannerSource: "import { x } from 'node:fs';\nexport function planDocCard() {}\n",
      rendererSource: realRenderer(),
    }),
    /import-free/,
  );
});

test('build: the generated markdown carries the do-not-edit warning and the slot instructions', () => {
  const md = buildDocCardBuilder({ plannerSource: realPlanner(), rendererSource: realRenderer() });
  assert.match(md, /GENERATED FILE — do not edit by hand/);
  assert.match(md, /const RECORD =/);
  assert.match(md, /const CANONICAL_FP =/);
  assert.match(md, /spaceItemGap/); // the vars contract is documented
});

test('build: output is deterministic', () => {
  const args = { plannerSource: realPlanner(), rendererSource: realRenderer() };
  assert.equal(buildDocCardBuilder(args), buildDocCardBuilder(args));
});

test('generated reference on disk is in sync with the sources', () => {
  const expected = buildDocCardBuilder({ plannerSource: realPlanner(), rendererSource: realRenderer() });
  const onDisk = readFileSync(join(HERE, '..', 'references', 'doc-card-builder.md'), 'utf8');
  assert.equal(onDisk, expected, 'run: node scripts/build-doc-card-builder.mjs');
});
