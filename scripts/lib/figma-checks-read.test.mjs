// The reader only runs inside Figma, so this evaluates the assembled snippet
// from references/figma-checks.md against stub nodes. It covers which variants
// the reader treats as focus variants (and so reads strokes from).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const md = readFileSync(new URL('../../references/figma-checks.md', import.meta.url), 'utf8');
const start = md.indexOf('```js', md.indexOf('## The snippet')) + '```js'.length;
const code = md.slice(start, md.lastIndexOf('```'));
const AsyncFunction = (async () => {}).constructor;
const figma = { variables: { getLocalVariablesAsync: async () => [], getVariableByIdAsync: async () => null } };

const variant = (state) => ({
  type: 'COMPONENT',
  variantProperties: { State: state },
  strokes: [],
  strokeWeight: 1,
  strokeAlign: 'INSIDE',
  effects: [],
  children: [],
});

async function readState(state) {
  const run = new AsyncFunction('figma', 'set', `${code}\nreturn await readSet(set, {});`);
  const snapshot = await run(figma, { type: 'COMPONENT_SET', variantGroupProperties: {}, children: [variant(state)] });
  return snapshot.children[0];
}

test('reader: Focus and Focused are read as focus variants', async () => {
  for (const state of ['Focus', 'Focused']) assert.equal((await readState(state)).strokeAlign, 'INSIDE', state);
});

test('reader: focus-visible, hover+focus and Hover are not read', async () => {
  for (const state of ['focus-visible', 'hover+focus', 'Hover']) {
    assert.equal((await readState(state)).strokeAlign, undefined, state);
  }
});
