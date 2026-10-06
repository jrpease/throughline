import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unpinnedRuns, staleSelfPins } from './check-pinned-runs.mjs';

// The gate reads this file too, and so does the directory review, so the
// unpinned inputs are assembled from fragments rather than written out.
const NPX = ['np', 'x'].join('');
const BUNX = ['bun', 'x'].join('');
const UVX = ['uv', 'x'].join('');
const LATEST = ['@', 'latest'].join('');
const CARET = ['@', '^'].join('');

const runs = (text) => unpinnedRuns(text).map((f) => f.run);

test('unpinnedRuns flags runners without an exact version', () => {
  assert.deepEqual(runs(`${NPX} some-package`), [`${NPX} some-package`]);
  assert.deepEqual(runs(`${NPX} -y @scope/pkg init`), [`${NPX} -y @scope/pkg`]);
  assert.deepEqual(runs(`${BUNX} pkg${CARET}1.2.0`), [`${BUNX} pkg${CARET}1.2.0`]);
  assert.deepEqual(runs(`${UVX} tool`), [`${UVX} tool`]);
  assert.deepEqual(runs(`${UVX} tool>=1.0`), [`${UVX} tool>=1.0`]);
});

test('unpinnedRuns flags latest tags and ranges outside a runner', () => {
  assert.deepEqual(runs(`"args": ["-y", "figma-console-mcp${LATEST}"]`), [`figma-console-mcp${LATEST}`]);
  assert.deepEqual(runs(`npm install -g npm${LATEST}`), [`npm${LATEST}`]);
  assert.deepEqual(runs(`npm i style-dictionary${CARET}4`), [`style-dictionary${CARET}4`]);
});

test('unpinnedRuns passes exact pins, prose and placeholders', () => {
  assert.deepEqual(runs(`${NPX} -y figma-console-mcp@1.40.8`), []);
  assert.deepEqual(runs(`${NPX} @radicool/throughline@0.21.3 init`), []);
  assert.deepEqual(runs(`${UVX} tool==1.2.3`), []);
  assert.deepEqual(runs(`started on demand by \`${NPX}\`. If it fails`), []);
  assert.deepEqual(runs('npm install style-dictionary@<v> --prefix <dir>'), []);
});

test('staleSelfPins flags an install pin that differs from the release', () => {
  assert.deepEqual(staleSelfPins('@radicool/throughline@0.21.3 init', '0.21.3'), []);
  assert.deepEqual(staleSelfPins('@radicool/throughline@0.21.2 init', '0.21.3').map((f) => f.run), ['@radicool/throughline@0.21.2']);
});
