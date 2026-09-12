import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AA_NORMAL_TEXT,
  CONTRAST_PAIRS,
  contrastRatio,
  parseHex,
  composite,
} from './contrast.mjs';

test('contrastRatio: black on white is 21', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 1e-9);
});

test('contrastRatio: identical colours is 1', () => {
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
});

test('contrastRatio: the discriminating pair straddling the threshold, both sides', () => {
  assert.ok(contrastRatio('#767676', '#ffffff') >= 4.5);
  assert.ok(contrastRatio('#777777', '#ffffff') < 4.5);
});

test('contrastRatio: symmetric under argument order', () => {
  const forward = contrastRatio('#1d4ed8', '#ffffff');
  const backward = contrastRatio('#ffffff', '#1d4ed8');
  assert.equal(forward, backward);
});

test('parseHex: 3-digit shorthand is not accepted', () => {
  assert.equal(parseHex('#abc'), null);
});

test('parseHex: 8-digit hex carries alpha', () => {
  const parsed = parseHex('#00000080');
  assert.ok(Math.abs(parsed.a - 0.502) < 0.001);
});

test('composite: half-transparent white over black averages to grey', () => {
  const result = composite('#ffffff80', '#000000');
  const channel = parseInt(result.slice(1, 3), 16);
  assert.ok(Math.abs(channel - 128) <= 1);
});

test('composite: fully transparent foreground returns the background unchanged', () => {
  assert.equal(composite('#ffffff00', '#123456'), '#123456');
});

test('composite: fully opaque foreground returns the foreground unchanged', () => {
  assert.equal(composite('#ffffffff', '#000000'), '#ffffff');
});

test('CONTRAST_PAIRS: has 8 entries, all at AA_NORMAL_TEXT, none touching disabled, all with a why', () => {
  assert.equal(CONTRAST_PAIRS.length, 8);
  for (const pair of CONTRAST_PAIRS) {
    assert.equal(pair.threshold, AA_NORMAL_TEXT);
    assert.ok(!pair.fg.toLowerCase().includes('disabled'));
    assert.ok(typeof pair.why === 'string' && pair.why.length > 0);
  }
});
