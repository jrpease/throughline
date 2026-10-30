import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setWorkspace, initCache, mergeCache, missingKeys, tokensFrom, WORKSPACE_FILE, CACHE_FILE } from './design-workspace.mjs';
import { serialize } from './gap-report.mjs';

const list = {
  collections: [
    { library: 'Zygarden Design System', key: 'SEM', name: 'Color Semantic' },
    { library: 'Zygarden Design System', key: 'SPC', name: 'Spacing Semantic' },
  ],
};
const modes = [{ id: '1:0', name: 'Dark' }, { id: '1:1', name: 'Light' }];
const entries = {
  entries: [
    { key: 'v1', name: 'color/bg/canvas', resolvedType: 'COLOR', kinds: ['colour'], values: { Dark: '#070a10', Light: '#FFFFFF' }, collection: { key: 'SEM', name: 'Color Semantic', modes } },
    { key: 'v2', name: 'space/inset/md', resolvedType: 'FLOAT', kinds: ['gap'], values: { Value: 16 }, collection: { key: 'SPC', name: 'Spacing Semantic', modes: [{ id: '2:0', name: 'Value' }] } },
    { key: 'v3', name: 'color/brand/glow', resolvedType: 'COLOR', kinds: ['colour'], values: { Dark: null, Light: '#ffcc00' }, collection: { key: 'SEM', name: 'Color Semantic', modes } },
  ],
};

test('workspace set keeps earlier libraries and adds new ones once', () => {
  let w = setWorkspace(null, { fileKey: 'F', libraries: ['https://a'], mode: 'b', at: '2026-10-30' });
  w = setWorkspace(w, { libraries: ['https://a', 'https://b'], at: '2026-10-31' });
  assert.deepEqual(w, { fileKey: 'F', libraries: ['https://a', 'https://b'], mode: 'b', at: '2026-10-31' });
});

test('init then merge places each variable in the library that holds its collection', () => {
  const cache = mergeCache(initCache(list, '2026-10-30'), entries);
  const lib = cache.libraries['Zygarden Design System'];
  assert.equal(cache.readAt, '2026-10-30');
  assert.deepEqual(lib.collections.SEM, { name: 'Color Semantic', modes, variables: [] });
  assert.deepEqual(lib.variables.v2, { name: 'space/inset/md', collection: 'SPC', resolvedType: 'FLOAT', kinds: ['gap'], values: { Value: 16 } });
});

test('missing: keys the list named that no merge filled, so a timed-out import is re-run', () => {
  const named = { collections: [{ ...list.collections[0], variables: [{ key: 'v1' }, { key: 'v3' }, { key: 'v9' }] }, { ...list.collections[1], variables: [{ key: 'v2' }] }] };
  const partial = mergeCache(initCache(named, '2026-10-30'), { entries: [entries.entries[0]] });
  assert.deepEqual(missingKeys(partial), ['v3', 'v9', 'v2']);
  assert.deepEqual(missingKeys(mergeCache(partial, entries)), ['v9']);
  assert.deepEqual(missingKeys(initCache(list, 'x')), []);
});

test('a later merge replaces one variable and leaves the rest', () => {
  let cache = mergeCache(initCache(list, '2026-10-30'), entries);
  cache = mergeCache(cache, { entries: [{ ...entries.entries[0], values: { Dark: '#000000', Light: '#ffffff' } }] });
  const vars = cache.libraries['Zygarden Design System'].variables;
  assert.equal(vars.v1.values.Dark, '#000000');
  assert.equal(vars.v2.values.Value, 16);
});

test('tokens: the gate table shape, lowercase hex, unresolved references counted', () => {
  const t = tokensFrom(mergeCache(initCache(list, '2026-10-30'), entries));
  assert.deepEqual(t.colours, { '#070a10': ['color/bg/canvas'], '#ffffff': ['color/bg/canvas'], '#ffcc00': ['color/brand/glow'] });
  assert.deepEqual(t.gap, { 16: ['space/inset/md'] });
  assert.deepEqual(t.radius, {});
  assert.equal(t.unresolved, 1);
});

test('malformed input is refused with a reason', () => {
  assert.throws(() => initCache({ nope: 1 }, 'x'), /library-list/);
  assert.throws(() => mergeCache(null, entries), /cache init first/);
  assert.throws(() => mergeCache(initCache(list, 'x'), { entries: [{ name: 'x' }] }), /malformed entry/);
  assert.throws(() => mergeCache(initCache({ collections: [] }, 'x'), entries), /re-run cache init/);
});

const script = fileURLToPath(new URL('./design-workspace.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('cli: workspace and cache round trip, files written sorted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ws-'));
  assert.equal(cli('workspace', 'get', '--dir', dir).stdout.trim(), 'null');
  assert.equal(cli('cache', 'get', '--dir', dir).stdout.trim(), 'null');
  assert.equal(cli('tokens', '--dir', dir).stdout.trim(), 'null');
  assert.equal(cli('workspace', 'set', '--dir', dir, '--file-key', 'F', '--library', 'https://a', '--mode', 'b').status, 0);
  assert.equal(JSON.parse(cli('workspace', 'get', '--dir', dir).stdout).fileKey, 'F');
  const listFile = join(dir, 'list.json');
  const importFile = join(dir, 'import.json');
  writeFileSync(listFile, JSON.stringify(list));
  writeFileSync(importFile, JSON.stringify(entries));
  assert.equal(cli('cache', 'init', '--dir', dir, '--from', listFile).status, 0);
  assert.equal(cli('cache', 'merge', '--dir', dir, '--from', importFile).status, 0);
  for (const f of [WORKSPACE_FILE, CACHE_FILE]) {
    const text = readFileSync(join(dir, f), 'utf8');
    assert.equal(text, serialize(JSON.parse(text)), f);
  }
  assert.deepEqual(JSON.parse(cli('tokens', '--dir', dir).stdout).gap, { 16: ['space/inset/md'] });
});

test('cli: exit codes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ws-'));
  assert.equal(cli('workspace', 'get').status, 2);
  assert.equal(cli('cache', 'nope', '--dir', dir).status, 2);
  assert.equal(cli('workspace', 'set', '--dir', dir, '--mode', 'z').status, 2);
  assert.equal(cli('cache', 'init', '--dir', dir).status, 2);
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{"collections": 3}');
  assert.equal(cli('cache', 'init', '--dir', dir, '--from', bad).status, 1);
  writeFileSync(bad, 'not json');
  assert.equal(cli('cache', 'merge', '--dir', dir, '--from', bad).status, 1);
});
