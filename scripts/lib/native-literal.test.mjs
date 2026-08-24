import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLiteral, isValidLiteral, GRAMMAR } from './native-literal.mjs';

const SWIFT = GRAMMAR['ios-swift'];
const KOTLIN = GRAMMAR['android-kotlin'];

// Every distinct right-hand-side shape the current build emits, enumerated from
// four real generated files. These are the regression floor: if the grammar
// stops accepting one of these, real output starts failing the gate.
test('accepts every shape the current build emits', () => {
  assert.ok(isValidLiteral('CGFloat(14.00)', SWIFT));
  assert.ok(isValidLiteral('UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)', SWIFT));
  assert.ok(isValidLiteral('400', SWIFT));
  assert.ok(isValidLiteral('Color(0xffffffff)', KOTLIN));
  assert.ok(isValidLiteral('16.00.dp', KOTLIN));
  assert.ok(isValidLiteral('400', KOTLIN));
});

test('rejects the two shapes that are not valid native literals', () => {
  assert.equal(isValidLiteral('Nunito Sans', SWIFT), false);
  assert.equal(isValidLiteral('Nunito Sans', KOTLIN), false);
  assert.equal(isValidLiteral('linear-gradient(90deg, #77AE17 0%, #AFEF21 100%)', SWIFT), false);
  assert.equal(isValidLiteral('linear-gradient(90deg, #77AE17 0%, #AFEF21 100%)', KOTLIN), false);
});

// calc and var ARE valid identifiers, so a callee-name check alone would pass
// them. Their arguments are not literals, which is what rejects them.
test('rejects CSS functions whose callee is a valid identifier', () => {
  assert.equal(isValidLiteral('calc(1rem + 2px)', SWIFT), false);
  assert.equal(isValidLiteral('var(--x)', SWIFT), false);
  assert.equal(isValidLiteral('color-mix(in srgb, #fff 10%, transparent)', SWIFT), false);
});

test('rejects a bare dimension and trailing input', () => {
  assert.equal(isValidLiteral('14px', SWIFT), false);
  assert.equal(isValidLiteral('400 garbage', SWIFT), false);
  assert.equal(isValidLiteral('', SWIFT), false);
});

test('accepts strings, booleans, nested and zero-argument calls', () => {
  assert.ok(isValidLiteral('"Nunito Sans"', SWIFT));
  assert.ok(isValidLiteral('"with \\"escaped\\" quotes"', SWIFT));
  assert.ok(isValidLiteral('true', SWIFT));
  assert.ok(isValidLiteral('false', SWIFT));
  assert.ok(isValidLiteral('Outer(Inner(1), b: "x")', SWIFT));
  assert.ok(isValidLiteral('Empty()', SWIFT));
});

test('rejects an unterminated string and a raw newline inside one', () => {
  assert.equal(isValidLiteral('"unterminated', SWIFT), false);
  assert.equal(isValidLiteral('"two\nlines"', SWIFT), false);
});

// The grammar discriminates by platform rather than accepting a union.
test('units and numeric suffixes are android-kotlin only', () => {
  assert.equal(isValidLiteral('16.00.dp', SWIFT), false);
  assert.equal(isValidLiteral('1.50f', SWIFT), false);
  assert.ok(isValidLiteral('1.50f', KOTLIN));
  assert.ok(isValidLiteral('10L', KOTLIN));
});

// \$ escapes Kotlin's template interpolation and is not a valid Swift escape.
test('escape sets differ by platform', () => {
  assert.ok(isValidLiteral('"a\\$b"', KOTLIN));
  assert.equal(isValidLiteral('"a\\$b"', SWIFT), false);
});

// #51 will make .sp appear and #52 may make a bare ratio appear. A grammar that
// rejected them would turn those fixes into false failures.
test('accepts output the open issues will produce', () => {
  assert.ok(isValidLiteral('16.00.sp', KOTLIN), '#51');
  assert.ok(isValidLiteral('1.50.dp', KOTLIN), '#52 symptom must still pass');
  assert.ok(isValidLiteral('1.50.em', KOTLIN), '#52 candidate fix');
});

test('parseLiteral reports where parsing stopped', () => {
  const r = parseLiteral('linear-gradient(90deg)', SWIFT);
  assert.equal(r.ok, false);
  assert.equal(r.offset, 6);
  assert.match(r.rest, /^-gradient/);

  const s = parseLiteral('Nunito Sans', SWIFT);
  assert.equal(s.ok, false);
  assert.match(s.rest, /^Sans/);

  assert.deepEqual(parseLiteral('CGFloat(1)', SWIFT), { ok: true });
});
