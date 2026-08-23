import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenDtcg, resolveValue, findModeCollisions } from './dtcg.mjs';

// text.sm is a DUAL-NODE token: it carries its own $value AND a child.
const dtcg = {
  text: {
    sm: {
      $value: '14px',
      $type: 'dimension',
      lineHeight: { $value: '20px', $type: 'dimension' },
    },
  },
  color: {
    gray: { 900: { $value: '#111827', $type: 'color' } },
    text: { primary: { $value: '{color.gray.900}', $type: 'color' } },
  },
  typography: {
    body: { lineHeight: { $value: '{text.sm.lineHeight}', $type: 'dimension' } },
  },
};

test('flattenDtcg produces dot-path keys with raw $value', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(flat['color.gray.900'], '#111827');
  assert.equal(flat['color.text.primary'], '{color.gray.900}');
});

test('flattenDtcg yields a dual-node parent AND its child', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(flat['text.sm'], '14px');
  assert.equal(flat['text.sm.lineHeight'], '20px');
});

test('flattenDtcg skips $-prefixed meta keys', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(flat['text.sm.$type'], undefined);
  assert.equal(flat['text.sm.$value'], undefined);
});

test('resolveValue follows alias chains to a leaf', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(resolveValue('color.text.primary', flat), '#111827');
  assert.equal(resolveValue('color.gray.900', flat), '#111827');
});

test('resolveValue follows an alias into a dual-node child', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(resolveValue('typography.body.lineHeight', flat), '20px');
});

test('resolveValue throws on a missing token', () => {
  assert.throws(() => resolveValue('color.nope', {}), /not found/);
});

test('resolveValue throws on a circular reference', () => {
  assert.throws(() => resolveValue('a', { a: '{b}', b: '{a}' }), /circular/);
});

test('findModeCollisions reports a path defined differently across files', () => {
  const collisions = findModeCollisions([
    { file: 'light.json', dtcg: { color: { bg: { $value: '#ffffff' } } } },
    { file: 'dark.json', dtcg: { color: { bg: { $value: '#000000' } } } },
  ]);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].path, 'color.bg');
  assert.deepEqual(
    collisions[0].defs.map((d) => d.file),
    ['light.json', 'dark.json'],
  );
});

test('findModeCollisions ignores a path repeated with an identical value', () => {
  const collisions = findModeCollisions([
    { file: 'a.json', dtcg: { color: { bg: { $value: '#ffffff' } } } },
    { file: 'b.json', dtcg: { color: { bg: { $value: '#ffffff' } } } },
  ]);
  assert.deepEqual(collisions, []);
});

test('findModeCollisions returns empty for a single source', () => {
  const collisions = findModeCollisions([
    { file: 'only.json', dtcg: { color: { bg: { $value: '#ffffff' } } } },
  ]);
  assert.deepEqual(collisions, []);
});

test('findModeCollisions sees dual-node children', () => {
  const collisions = findModeCollisions([
    { file: 'a.json', dtcg: { text: { sm: { $value: '14px', lineHeight: { $value: '20px' } } } } },
    { file: 'b.json', dtcg: { text: { sm: { $value: '14px', lineHeight: { $value: '24px' } } } } },
  ]);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].path, 'text.sm.lineHeight');
});
