import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setWorkspace, initCache, mergeCache, missingKeys, tokensFrom, systemKeysFrom, withCollectionKeys, cacheFileFor, WORKSPACE_FILE, CACHE_FILE, SYSTEM_CACHE_FILE } from './design-workspace.mjs';
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
  const later = { collections: [{ ...named.collections[0], variables: [...named.collections[0].variables, { key: 'v10' }] }] };
  assert.deepEqual(missingKeys(mergeCache(partial, entries), later), ['v9', 'v10'], 'a variable added since cache init');
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

test('the cache lives under design-system/ when the directory holds design-system.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ws-'));
  assert.equal(cacheFileFor(dir), CACHE_FILE);
  writeFileSync(join(dir, 'design-system.json'), '{}');
  assert.equal(cacheFileFor(dir), SYSTEM_CACHE_FILE);
  const listFile = join(dir, 'list.json');
  writeFileSync(listFile, JSON.stringify(list));
  const r = cli('cache', 'init', '--dir', dir, '--from', listFile);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /design-system\/library-cache\.json/);
  assert.equal(existsSync(join(dir, SYSTEM_CACHE_FILE)), true);
  assert.equal(existsSync(join(dir, 'design')), false);
  assert.notEqual(cli('cache', 'get', '--dir', dir).stdout.trim(), 'null');
});

test('skipped keys are kept out of missing until they merge, and init clears them', () => {
  const listed = { collections: [{ ...list.collections[0], variables: [{ key: 'v1' }, { key: 'v9' }] }] };
  let cache = initCache(listed, 'x');
  assert.equal(cache.skipped, undefined);
  cache = mergeCache(cache, { entries: [], skipped: [{ key: 'v9', name: 'color/odd' }, { key: 'v1', name: 'color/bg/canvas' }] });
  assert.deepEqual(cache.skipped, ['v1', 'v9']);
  assert.deepEqual(missingKeys(cache), []);
  cache = mergeCache(cache, { entries: [entries.entries[0]] });
  assert.deepEqual(cache.skipped, ['v9']);
  assert.deepEqual(missingKeys(cache), []);
  assert.equal(initCache(listed, 'y').skipped, undefined);
  assert.deepEqual(missingKeys(initCache(listed, 'y')), ['v1', 'v9']);
  assert.throws(() => mergeCache(cache, { entries: [], skipped: 'v1' }), /skipped must be/);
});

test('cache missing --from a malformed list exits 1 with a reason', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ws-'));
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{"nope": 1}');
  const r = cli('cache', 'missing', '--dir', dir, '--from', bad);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /expected \{ collections: \[\.\.\.\] \} from library-list/);
  assert.doesNotMatch(r.stderr, /TypeError/);
});

const signalsOut = {
  signals: {
    manifestFileKey: 'SYS', openFileKey: 'SYS',
    libraryCollectionKeys: [{ library: 'Icons', key: 'i1' }, { library: 'Zygarden Design System', key: 'z2' }, { library: 'Zygarden Design System', key: 'z1' }],
  },
  localCollectionKeys: ['c2', 'c1', 'c1'],
};

test('system keys: the system file\'s own keys, or one library\'s', () => {
  assert.deepEqual(systemKeysFrom(signalsOut), ['c1', 'c2']);
  const consumer = { ...signalsOut, signals: { ...signalsOut.signals, openFileKey: 'PRODUCT' } };
  assert.throws(() => systemKeysFrom(consumer), /not the system file/);
  assert.deepEqual(systemKeysFrom(consumer, 'Zygarden Design System'), ['z1', 'z2']);
  assert.throws(() => systemKeysFrom(consumer, 'Nope'), /no connected library named Nope; connected: Icons, Zygarden Design System/);
  assert.throws(() => systemKeysFrom({ nope: 1 }), /signals/);
  assert.deepEqual(withCollectionKeys({ a: 1 }, ['k']), { a: 1, figma: { collectionKeys: ['k'] } });
});

test('cli: system keys writes figma.collectionKeys and leaves field order alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ws-'));
  const from = join(dir, 'signals.json');
  writeFileSync(from, JSON.stringify(signalsOut));
  assert.equal(cli('system', 'keys', '--dir', dir, '--from', from).status, 1);
  const manifest = { schemaVersion: 5, user: { codingLevel: 'comfortable' }, figma: { mechanism: null, fileKey: 'SYS', connected: true }, zeta: true };
  writeFileSync(join(dir, 'design-system.json'), JSON.stringify(manifest, null, 2) + '\n');
  const r = cli('system', 'keys', '--dir', dir, '--from', from);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /recorded 2 collection keys/);
  assert.doesNotMatch(r.stdout, /rewritten/);
  const text =readFileSync(join(dir, 'design-system.json'), 'utf8');
  assert.equal(text, JSON.stringify({ ...manifest, figma: { ...manifest.figma, collectionKeys: ['c1', 'c2'] } }, null, 2) + '\n');
  assert.equal(cli('system', 'keys', '--dir', dir, '--from', from, '--library', 'Icons').status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'design-system.json'), 'utf8')).figma.collectionKeys, ['i1']);
  writeFileSync(join(dir, 'design-system.json'), JSON.stringify(manifest) + '\n');
  assert.match(cli('system', 'keys', '--dir', dir, '--from', from).stdout, /rewritten in two-space JSON/);
  assert.equal(cli('system', 'keys', '--dir', dir, '--from', from, '--library', 'Nope').status, 1);
  assert.equal(cli('system', 'keys', '--dir', dir, '--from', from, '--library', 'Icons', '--library', 'X').status, 2);
  assert.equal(cli('system', 'keys', '--dir', dir).status, 2);
  assert.equal(existsSync(join(dir, 'design')), false);
});
