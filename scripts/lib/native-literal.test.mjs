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

// #70. Swift and Kotlin disagree about numeric literals in opposite directions,
// so one shared NUMBER cannot describe both without over- or under-accepting.
//
// Swift measured with `swiftc -parse` on this machine: `.5` and `-.5` are
// rejected ("it must be written '0.5'"), while `0100` and `00` compile.
// Kotlin measured with `kotlinc` 2.4.10: `0100` and `00` are rejected with
// "leading zeros are not allowed in integer literals", while `.5` and `-.5`
// compile. Both agree with the spec's IntegerLiteral and DoubleLiteral rules.
test('rejects a leading-dot float on Swift, where it does not compile', () => {
  assert.equal(isValidLiteral('.5', SWIFT), false);
  assert.equal(isValidLiteral('-.5', SWIFT), false);
  assert.equal(isValidLiteral('.25', SWIFT), false);
});

test('accepts a leading-dot float on Kotlin, where the grammar permits it', () => {
  assert.ok(isValidLiteral('.5', KOTLIN));
  assert.ok(isValidLiteral('-.5', KOTLIN));
});

test('rejects a leading-zero integer on Kotlin, where it does not parse', () => {
  assert.equal(isValidLiteral('0100', KOTLIN), false);
  assert.equal(isValidLiteral('00', KOTLIN), false);
  assert.equal(isValidLiteral('-0100', KOTLIN), false);
});

test('accepts a leading-zero integer on Swift, where it compiles', () => {
  assert.ok(isValidLiteral('0100', SWIFT));
  assert.ok(isValidLiteral('00', SWIFT));
});

// The shapes both platforms agree on must not move.
test('#70 does not narrow what both platforms already accepted', () => {
  for (const g of [SWIFT, KOTLIN]) {
    assert.ok(isValidLiteral('0', g), 'bare zero');
    assert.ok(isValidLiteral('0.5', g), 'zero-prefixed float');
    assert.ok(isValidLiteral('-0.5', g), 'negative float');
    assert.ok(isValidLiteral('1.5', g), '#52 bare ratio');
    assert.ok(isValidLiteral('0xFF', g), 'hex — compiles on both');
    assert.ok(isValidLiteral('400', g), 'plain integer');
  }
  assert.ok(isValidLiteral('0xffffffff', KOTLIN), 'Color() argument');
  assert.ok(isValidLiteral('16.00.dp', KOTLIN), 'unit suffix still parses');
});
