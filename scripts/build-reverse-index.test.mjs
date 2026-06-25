import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReverseIndex } from './build-reverse-index.mjs';

test('maps each codeToken to its newToken', () => {
  const cw = { version: 1, tokens: [
    { newToken: 'color.text.primary', codeTokens: ['$text-default', 'text-grey-900'], newValue: '#111827', tier: 'semantic', figmaOld: null, status: 'renamed', recommendedSemantic: null },
  ]};
  const { index, conflicts } = buildReverseIndex(cw);
  assert.equal(index['$text-default'], 'color.text.primary');
  assert.equal(index['text-grey-900'], 'color.text.primary');
  assert.equal(conflicts.length, 0);
});

test('two code symbols can map to the same new token without conflict', () => {
  const cw = { version: 1, tokens: [
    { newToken: 'color.gray.900', codeTokens: ['$grey-900', '$gray-900'], newValue: '#111827', tier: 'primitive', figmaOld: null, status: 'renamed', recommendedSemantic: null },
  ]};
  const { conflicts } = buildReverseIndex(cw);
  assert.equal(conflicts.length, 0);
});

test('flags a code symbol mapping to two different new tokens', () => {
  const cw = { version: 1, tokens: [
    { newToken: 'color.gray.900', codeTokens: ['$x'], newValue: '#111827', tier: 'primitive', figmaOld: null, status: 'renamed', recommendedSemantic: null },
    { newToken: 'color.gray.800', codeTokens: ['$x'], newValue: '#1f2937', tier: 'primitive', figmaOld: null, status: 'renamed', recommendedSemantic: null },
  ]};
  const { conflicts } = buildReverseIndex(cw);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].codeToken, '$x');
  assert.deepEqual(conflicts[0].tokens, ['color.gray.900', 'color.gray.800']);
});

test('emits keys sorted longest-first (safe find-and-replace ordering)', () => {
  const cw = { version: 1, tokens: [
    { newToken: 'color.a', codeTokens: ['$blue'], newValue: '#1', tier: 'primitive', figmaOld: null, status: 'renamed', recommendedSemantic: null },
    { newToken: 'color.b', codeTokens: ['$blue-100'], newValue: '#2', tier: 'primitive', figmaOld: null, status: 'renamed', recommendedSemantic: null },
  ]};
  const { index } = buildReverseIndex(cw);
  assert.deepEqual(Object.keys(index), ['$blue-100', '$blue']);
});

test('skips rows with no codeTokens', () => {
  const cw = { version: 1, tokens: [
    { newToken: 'color.surface.raised', codeTokens: [], newValue: '#fff', tier: 'semantic', figmaOld: null, status: 'added', recommendedSemantic: null },
  ]};
  const { index } = buildReverseIndex(cw);
  assert.deepEqual(index, {});
});
