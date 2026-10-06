import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unpinnedRuns, staleSelfPins } from './check-pinned-runs.mjs';

const runs = (text) => unpinnedRuns(text).map((f) => f.run);

test('unpinnedRuns flags runners without an exact version', () => {
  assert.deepEqual(runs('npx some-package'), ['npx some-package']);
  assert.deepEqual(runs('npx -y @scope/pkg init'), ['npx -y @scope/pkg']);
  assert.deepEqual(runs('bunx pkg@^1.2.0'), ['bunx pkg@^1.2.0']);
  assert.deepEqual(runs('uvx tool'), ['uvx tool']);
  assert.deepEqual(runs('uvx tool>=1.0'), ['uvx tool>=1.0']);
});

test('unpinnedRuns flags @latest and ranges outside a runner', () => {
  assert.deepEqual(runs('"args": ["-y", "figma-console-mcp@latest"]'), ['figma-console-mcp@latest']);
  assert.deepEqual(runs('npm install -g npm@latest'), ['npm@latest']);
  assert.deepEqual(runs('npm i style-dictionary@^4'), ['style-dictionary@^4']);
});

test('unpinnedRuns passes exact pins, prose and placeholders', () => {
  assert.deepEqual(runs('npx -y figma-console-mcp@1.40.8'), []);
  assert.deepEqual(runs('npx @radicool/throughline@0.21.3 init'), []);
  assert.deepEqual(runs('uvx tool==1.2.3'), []);
  assert.deepEqual(runs('started on demand by `npx`. If it fails'), []);
  assert.deepEqual(runs('npm install style-dictionary@<v> --prefix <dir>'), []);
});

test('staleSelfPins flags an install pin that differs from the release', () => {
  assert.deepEqual(staleSelfPins('npx @radicool/throughline@0.21.3 init', '0.21.3'), []);
  assert.deepEqual(staleSelfPins('npx @radicool/throughline@0.21.2 init', '0.21.3').map((f) => f.run), ['@radicool/throughline@0.21.2']);
});
