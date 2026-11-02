import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectMode } from './design-mode.mjs';

const none = { manifestFileKey: null, openFileKey: 'OPEN', libraryCollections: 0, remoteInstances: 0, localVariables: 0, localSets: 0, forced: null };

test('design-mode.mjs has no import statements', () => {
  const src = readFileSync(new URL('./design-mode.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import\b/m);
});

test('mode a only when design-system.json names the open file', () => {
  const r = detectMode({ ...none, manifestFileKey: 'OPEN', localVariables: 40, localSets: 12 });
  assert.equal(r.mode, 'a');
  assert.equal(r.libraryDetected, false);
  assert.match(r.reason, /^Mode a:/);
});

test('a file using a library, with no system collection keys recorded, is mode b', () => {
  const r = detectMode({ ...none, manifestFileKey: 'SYSTEM', remoteInstances: 1 });
  assert.equal(r.mode, 'b');
  assert.equal(r.libraryDetected, true);
  assert.match(r.reason, /connected library/);
});

test('enabled library variables alone make mode b', () => {
  assert.equal(detectMode({ ...none, libraryCollections: 3 }).mode, 'b');
});

test('a file with only its own parts is mode b with no library', () => {
  const r = detectMode({ ...none, localSets: 2 });
  assert.equal(r.mode, 'b');
  assert.equal(r.libraryDetected, false);
  assert.match(r.reason, /no library is connected/);
});

test('nothing at all is mode c', () => {
  const r = detectMode(none);
  assert.equal(r.mode, 'c');
  assert.match(r.reason, /^Mode c:/);
});

test('a null manifest key never matches', () => {
  assert.equal(detectMode({ ...none, openFileKey: null, localSets: 1 }).mode, 'b');
});

test('forcing lowers the mode and says so', () => {
  const r = detectMode({ ...none, manifestFileKey: 'OPEN', localSets: 1, forced: 'b' });
  assert.equal(r.mode, 'b');
  assert.match(r.reason, /lowered from mode a/);
  const c = detectMode({ ...none, remoteInstances: 4, forced: 'c' });
  assert.equal(c.mode, 'c');
  assert.equal(c.libraryDetected, false);
  assert.match(c.reason, /ignoring this file's system, library and variables as you asked/);
  assert.doesNotMatch(c.reason, /has no design system/);
});

test('forcing up is refused', () => {
  const r = detectMode({ ...none, forced: 'b' });
  assert.equal(r.mode, 'c');
  assert.match(r.reason, /only be lowered, never raised/);
});

test('mode b with a library says where text styles come from', () => {
  const r = detectMode({ ...none, remoteInstances: 1 }).reason;
  assert.match(r, /text styles come from the library where the run sees them in use, else from this file/);
  assert.doesNotMatch(r, /from this file only/);
});

const lib = (key, library = 'Zygarden Design System') => ({ library, key });
const consumerSignals = {
  ...none, manifestFileKey: 'SYSTEM', systemCollectionKeys: ['k1', 'k2'],
  libraryCollectionKeys: [lib('other', 'Icons'), lib('k2')],
};

test('a consumer file of the repo\'s system is mode a', () => {
  const r = detectMode(consumerSignals);
  assert.equal(r.mode, 'a');
  assert.equal(r.consumer, true);
  assert.equal(r.systemLibrary, 'Zygarden Design System');
  assert.equal(r.libraryDetected, true);
  assert.deepEqual(r.askSystem, []);
  assert.match(r.reason, /^Mode a: building from Zygarden Design System, this repo's throughline system/);
  assert.match(r.reason, /drift isn't tracked for this file yet/);
});

test('the system file itself is not a consumer', () => {
  const r = detectMode({ ...consumerSignals, manifestFileKey: 'OPEN' });
  assert.equal(r.mode, 'a');
  assert.equal(r.consumer, false);
  assert.equal(r.systemLibrary, null);
  assert.equal(r.libraryDetected, false);
  assert.match(r.reason, /^Mode a: building from this file's throughline design system/);
});

test('recorded keys that match no connected collection leave the file mode b', () => {
  const r = detectMode({ ...consumerSignals, systemCollectionKeys: ['nope'] });
  assert.equal(r.mode, 'b');
  assert.equal(r.consumer, false);
  assert.deepEqual(r.askSystem, []);
});

test('with no keys recorded, a connected library is asked about, names sorted', () => {
  const r = detectMode({ ...consumerSignals, systemCollectionKeys: null, libraryCollectionKeys: [lib('a', 'Zeta'), lib('b', 'Alpha'), lib('c', 'Zeta')] });
  assert.equal(r.mode, 'b');
  assert.deepEqual(r.askSystem, ['Alpha', 'Zeta']);
  assert.deepEqual(detectMode({ ...consumerSignals, systemCollectionKeys: [] }).askSystem, ['Icons', 'Zygarden Design System']);
});

test('no ask without design-system.json, or in the system file', () => {
  assert.deepEqual(detectMode({ ...consumerSignals, manifestFileKey: null, systemCollectionKeys: null }).askSystem, []);
  assert.deepEqual(detectMode({ ...consumerSignals, manifestFileKey: 'OPEN', systemCollectionKeys: null }).askSystem, []);
});

test('no ask when a mode was forced', () => {
  const base = { ...consumerSignals, systemCollectionKeys: null };
  assert.deepEqual(detectMode({ ...base, forced: 'b' }).askSystem, []);
  assert.deepEqual(detectMode({ ...base, forced: 'c' }).askSystem, []);
});

test('a consumer can be forced down to b or c', () => {
  const b = detectMode({ ...consumerSignals, forced: 'b' });
  assert.equal(b.mode, 'b');
  assert.equal(b.consumer, false);
  assert.equal(b.libraryDetected, true);
  assert.match(b.reason, /lowered from mode a/);
  const c = detectMode({ ...consumerSignals, forced: 'c' });
  assert.equal(c.mode, 'c');
  assert.equal(c.consumer, false);
});

test('library collection keys count as library collections', () => {
  assert.equal(detectMode({ ...none, libraryCollectionKeys: [lib('x')] }).mode, 'b');
});
