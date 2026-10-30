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

test('a consumer file of a throughline system is mode b', () => {
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

test('mode b with a library says text styles come from the file', () => {
  assert.match(detectMode({ ...none, remoteInstances: 1 }).reason, /text styles come from this file only/);
});
