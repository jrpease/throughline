import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenDtcg, resolveValue } from './validate-token-output.mjs';

// text.sm is a DUAL-NODE token: it carries its own $value AND a child.
const dtcg = {
  text: {
    sm: {
      $value: '14px',
      $type: 'dimension',
      lineHeight: { $value: '20px', $type: 'dimension' },
    },
  },
  typography: {
    body: { lineHeight: { $value: '{text.sm.lineHeight}', $type: 'dimension' } },
  },
};

test('flattenDtcg yields a dual-node parent AND its child', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(flat['text.sm'], '14px');
  assert.equal(flat['text.sm.lineHeight'], '20px');
});

test('flattenDtcg skips $-prefixed meta keys', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(flat['text.sm.$type'], undefined);
});

test('resolveValue follows an alias into a dual-node child', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(resolveValue('typography.body.lineHeight', flat), '20px');
});

test('resolveValue throws on a missing token', () => {
  assert.throws(() => resolveValue('nope', {}), /not found/);
});

test('resolveValue throws on a circular reference', () => {
  assert.throws(() => resolveValue('a', { a: '{b}', b: '{a}' }), /circular/);
});

import { extractDeclarations, magnitudeOf } from './validate-token-output.mjs';

const SWIFT = `
public enum Tokens {
    public static let textSm = CGFloat(224.00)
    public static let colorBgCanvas = UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)
    // a comment, not a declaration
}
`;

const KOTLIN = `
object Tokens {
  val textSm = 224.00.dp
  val colorBgCanvas = Color(0xffffffff)
}
`;

test('extractDeclarations reads Swift static let declarations', () => {
  const decls = extractDeclarations(SWIFT, 'ios-swift');
  assert.deepEqual(decls, [
    { symbol: 'textSm', value: 'CGFloat(224.00)' },
    { symbol: 'colorBgCanvas', value: 'UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)' },
  ]);
});

test('extractDeclarations reads Kotlin val declarations', () => {
  const decls = extractDeclarations(KOTLIN, 'android-kotlin');
  assert.deepEqual(decls.map((d) => d.symbol), ['textSm', 'colorBgCanvas']);
});

test('extractDeclarations throws on an unknown platform', () => {
  assert.throws(() => extractDeclarations(SWIFT, 'flutter'), /unknown platform/);
});

test('magnitudeOf reads CGFloat, dp/sp, and bare numerics', () => {
  assert.equal(magnitudeOf('CGFloat(224.00)'), 224);
  assert.equal(magnitudeOf('224.00.dp'), 224);
  assert.equal(magnitudeOf('16.sp'), 16);
  assert.equal(magnitudeOf('1.1'), 1.1);
  assert.equal(magnitudeOf('-0.03'), -0.03);
});

test('magnitudeOf returns null for non-dimension values', () => {
  assert.equal(magnitudeOf('UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)'), null);
  assert.equal(magnitudeOf('Color(0xffffffff)'), null);
  assert.equal(magnitudeOf('24px'), null);
});
