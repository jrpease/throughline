import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenDtcg, resolveValue } from './dtcg.mjs';

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
