import { test } from 'node:test';
import assert from 'node:assert/strict';
import { magnitude, colorMixToHex8, preprocess } from './sd-native.mjs';

test('magnitude treats px as 1:1', () => {
  assert.equal(magnitude('14px'), 14);
  assert.equal(magnitude('0px'), 0);
  assert.equal(magnitude('-2px'), -2);
});

test('magnitude treats a unitless value as an unscaled ratio', () => {
  assert.equal(magnitude('1.5'), 1.5);
  assert.equal(magnitude(1.5), 1.5);
});

test('magnitude scales rem by 16', () => {
  assert.equal(magnitude('1rem'), 16);
  assert.equal(magnitude('0.875rem'), 14);
});

test('magnitude returns null for units with no build-time native value', () => {
  assert.equal(magnitude('100%'), null);
  assert.equal(magnitude('1.5em'), null);
});

test('magnitude returns null for a non-numeric value', () => {
  assert.equal(magnitude('#ffffff'), null);
  assert.equal(magnitude('color-mix(in srgb, #fff 10%, transparent)'), null);
  assert.equal(magnitude(''), null);
});

test('colorMixToHex8 computes the blend against transparent', () => {
  // 12% of 255 = 30.6 -> 31 -> 0x1f
  assert.equal(colorMixToHex8('color-mix(in srgb, #3b82f6 12%, transparent)'), '#3b82f61f');
  assert.equal(colorMixToHex8('color-mix(in srgb, #000000 100%, transparent)'), '#000000ff');
  assert.equal(colorMixToHex8('color-mix(in srgb, #000000 0%, transparent)'), '#00000000');
});

test('colorMixToHex8 returns null for anything else', () => {
  assert.equal(colorMixToHex8('#ffffff'), null);
  assert.equal(colorMixToHex8('14px'), null);
  assert.equal(colorMixToHex8('color-mix(in oklch, #fff 10%, transparent)'), null);
});

test('preprocess resolves a plain alias to its leaf value', () => {
  const out = preprocess({
    color: {
      gray: { 900: { $value: '#111827', $type: 'color' } },
      text: { primary: { $value: '{color.gray.900}', $type: 'color' } },
    },
  });
  assert.equal(out.color.text.primary.$value, '#111827');
});

test('preprocess resolves an alias pointing into a dual-node child', () => {
  const out = preprocess({
    text: { sm: { $value: '14px', lineHeight: { $value: '20px' } } },
    typography: { body: { lineHeight: { $value: '{text.sm.lineHeight}' } } },
  });
  assert.equal(out.typography.body.lineHeight.$value, '20px');
});

test('preprocess hoists a dual-node child to a camel-joined sibling', () => {
  const out = preprocess({
    text: { sm: { $value: '14px', lineHeight: { $value: '20px' } } },
  });
  assert.equal(out.text.sm.$value, '14px');
  assert.equal(out.text.smLineHeight.$value, '20px');
  assert.equal(out.text.sm.lineHeight, undefined);
});

test('preprocess interpolates a reference embedded inside an expression', () => {
  const out = preprocess({
    color: { brand: { 500: { $value: '#3b82f6' } } },
    overlay: { $value: 'color-mix(in srgb, {color.brand.500} 12%, transparent)' },
  });
  assert.equal(out.overlay.$value, 'color-mix(in srgb, #3b82f6 12%, transparent)');
});

test('preprocess leaves an unresolvable reference in place rather than throwing', () => {
  const out = preprocess({ a: { $value: 'calc({nope.missing} * 2)' } });
  assert.equal(out.a.$value, 'calc({nope.missing} * 2)');
});

test('preprocess does not mutate its input', () => {
  const input = {
    text: { sm: { $value: '14px', lineHeight: { $value: '20px' } } },
  };
  preprocess(input);
  assert.equal(input.text.sm.lineHeight.$value, '20px');
  assert.equal(input.text.smLineHeight, undefined);
});
