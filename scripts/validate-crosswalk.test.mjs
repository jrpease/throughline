import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenDtcg, resolveValue, validate } from './validate-crosswalk.mjs';

const dtcg = {
  color: {
    gray: {
      900: { $value: '#111827', $type: 'color' },
    },
    text: {
      primary: { $value: '{color.gray.900}', $type: 'color' },
    },
  },
};

test('flattenDtcg produces dot-path keys with raw $value', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(flat['color.gray.900'], '#111827');
  assert.equal(flat['color.text.primary'], '{color.gray.900}');
});

test('resolveValue follows alias chains to a leaf', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(resolveValue('color.text.primary', flat), '#111827');
  assert.equal(resolveValue('color.gray.900', flat), '#111827');
});

test('resolveValue throws on a missing token', () => {
  assert.throws(() => resolveValue('color.nope', {}), /not found/);
});

test('resolveValue throws on a circular reference', () => {
  const flat = { 'a': '{b}', 'b': '{a}' };
  assert.throws(() => resolveValue('a', flat), /circular/);
});

test('validate passes N/N when every resolved value matches', () => {
  const crosswalk = {
    version: 1,
    tokens: [
      { newToken: 'color.gray.900', newValue: '#111827', tier: 'primitive', figmaOld: 'grey/900', codeTokens: [], status: 'renamed', recommendedSemantic: null },
      { newToken: 'color.text.primary', newValue: '#111827', tier: 'semantic', figmaOld: 'Text/Default', codeTokens: [], status: 'renamed', recommendedSemantic: null },
    ],
  };
  const r = validate(crosswalk, dtcg);
  assert.equal(r.total, 2);
  assert.equal(r.passed, 2);
  assert.equal(r.mismatches.length, 0);
  assert.equal(r.missing.length, 0);
});

test('validate compares case-insensitively and trims', () => {
  const crosswalk = { version: 1, tokens: [
    { newToken: 'color.gray.900', newValue: '  #111827  ', tier: 'primitive', figmaOld: null, codeTokens: [], status: 'aligned', recommendedSemantic: null },
  ]};
  // newValue with surrounding whitespace must still match the trimmed source value
  const r = validate(crosswalk, { color: { gray: { 900: { $value: '#111827' } } } });
  assert.equal(r.passed, 1);
  const rUpper = validate({ version: 1, tokens: [
    { newToken: 'color.gray.900', newValue: '#EF4444', tier: 'primitive', figmaOld: null, codeTokens: [], status: 'aligned', recommendedSemantic: null },
  ]}, { color: { gray: { 900: { $value: '#ef4444' } } } });
  assert.equal(rUpper.passed, 1);
});

test('validate reports a mismatch', () => {
  const crosswalk = { version: 1, tokens: [
    { newToken: 'color.gray.900', newValue: '#000000', tier: 'primitive', figmaOld: null, codeTokens: [], status: 'drift-fix', recommendedSemantic: null },
  ]};
  const r = validate(crosswalk, dtcg);
  assert.equal(r.passed, 0);
  assert.equal(r.mismatches.length, 1);
  assert.equal(r.mismatches[0].token, 'color.gray.900');
  assert.equal(r.mismatches[0].expected, '#000000');
  assert.equal(r.mismatches[0].actual, '#111827');
});

test('validate reports a token missing from the DTCG source', () => {
  const crosswalk = { version: 1, tokens: [
    { newToken: 'color.ghost', newValue: '#fff', tier: 'primitive', figmaOld: null, codeTokens: [], status: 'added', recommendedSemantic: null },
  ]};
  const r = validate(crosswalk, dtcg);
  assert.deepEqual(r.missing, ['color.ghost']);
  assert.equal(r.passed, 0);
});
