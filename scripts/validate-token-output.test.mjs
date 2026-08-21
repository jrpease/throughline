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

import { normalizeKey, expectedMagnitude, findModeCollisions, validate } from './validate-token-output.mjs';

test('normalizeKey collapses camelCase, snake_case, kebab-case, and dot paths', () => {
  assert.equal(normalizeKey('color.bg.canvas'), 'colorbgcanvas');
  assert.equal(normalizeKey('colorBgCanvas'), 'colorbgcanvas');
  assert.equal(normalizeKey('color_bg_canvas'), 'colorbgcanvas');
  assert.equal(normalizeKey('color-bg-canvas'), 'colorbgcanvas');
});

test('expectedMagnitude applies the authored unit, never a fixed factor', () => {
  assert.deepEqual(expectedMagnitude('14px'), { magnitude: 14 });
  assert.deepEqual(expectedMagnitude('1rem'), { magnitude: 16 });
  assert.deepEqual(expectedMagnitude('1.1'), { magnitude: 1.1 });
});

test('expectedMagnitude skips units with no native equivalent', () => {
  assert.ok(expectedMagnitude('100%').skip);
  assert.ok(expectedMagnitude('-0.03em').skip);
  assert.ok(expectedMagnitude('#ffffff').skip);
});

test('findModeCollisions flags a path defined twice with different values', () => {
  const sources = [
    { file: 'mobile.json', dtcg: { spacing: { grid: { columns: { $value: '{spacing.space.1}' } } } } },
    { file: 'desktop.json', dtcg: { spacing: { grid: { columns: { $value: '{spacing.space.3}' } } } } },
  ];
  const c = findModeCollisions(sources);
  assert.equal(c.length, 1);
  assert.equal(c[0].path, 'spacing.grid.columns');
});

test('findModeCollisions ignores a path repeated with the SAME value', () => {
  const same = { spacing: { grid: { columns: { $value: '4px' } } } };
  assert.deepEqual(findModeCollisions([{ file: 'a', dtcg: same }, { file: 'b', dtcg: same }]), []);
});

const SRC = [{ file: 't.json', dtcg: {
  text: { sm: { $value: '14px', $type: 'dimension' } },
  leading: { tight: { $value: '1.1', $type: 'dimension' } },
} }];

test('unit-fidelity catches the x16 scaling bug', () => {
  const r = validate({ sources: SRC, output: 'static let textSm = CGFloat(224.00)', platform: 'ios-swift' });
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].rule, 'unit-fidelity');
  assert.equal(r.ok, false);
});

test('unit-fidelity passes a correctly emitted px value', () => {
  const r = validate({ sources: SRC, output: 'static let textSm = CGFloat(14.00)', platform: 'ios-swift' });
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

test('unit-fidelity never scales a unitless ratio', () => {
  const ok = validate({ sources: SRC, output: 'static let leadingTight = CGFloat(1.1)', platform: 'ios-swift' });
  assert.deepEqual(ok.failures, []);
  const bad = validate({ sources: SRC, output: 'static let leadingTight = CGFloat(17.6)', platform: 'ios-swift' });
  assert.equal(bad.failures[0].rule, 'unit-fidelity');
});

test('no-foreign-syntax catches leaked color-mix', () => {
  const out = 'static let textSm = color-mix(in srgb, UIColor(red: 1, green: 1, blue: 1, alpha: 1) 4%, transparent)';
  const r = validate({ sources: SRC, output: out, platform: 'ios-swift' });
  assert.ok(r.failures.some((f) => f.rule === 'no-foreign-syntax'));
});

test('no-bare-units catches unresolved aliases, including negative magnitudes', () => {
  const r = validate({ sources: SRC, output: 'static let textSm = 24px', platform: 'ios-swift' });
  assert.ok(r.failures.some((f) => f.rule === 'no-bare-units'));
  const neg = validate({ sources: SRC, output: 'static let textSm = -0.03em', platform: 'ios-swift' });
  assert.ok(neg.failures.some((f) => f.rule === 'no-bare-units'));
});

test('zero matches fails rather than passing vacuously', () => {
  const r = validate({ sources: SRC, output: 'static let somethingElse = CGFloat(14.00)', platform: 'ios-swift' });
  assert.equal(r.matched, 0);
  assert.equal(r.ok, false);
});

test('a match rate below the floor fails', () => {
  const out = ['static let textSm = CGFloat(14.00)', 'static let unknownA = CGFloat(1)', 'static let unknownB = CGFloat(2)'].join('\n');
  assert.equal(validate({ sources: SRC, output: out, platform: 'ios-swift', minMatch: 0.5 }).ok, false);
  assert.equal(validate({ sources: SRC, output: out, platform: 'ios-swift', minMatch: 0.3 }).ok, true);
});

test('a mode collision fails even when every declaration is correct', () => {
  const sources = [
    { file: 'mobile.json', dtcg: { text: { sm: { $value: '14px' } } } },
    { file: 'desktop.json', dtcg: { text: { sm: { $value: '16px' } } } },
  ];
  const r = validate({ sources, output: 'static let textSm = CGFloat(16.00)', platform: 'ios-swift' });
  assert.equal(r.collisions.length, 1);
  assert.equal(r.ok, false);
});

test('a dangling alias does not inflate matched count', () => {
  const sources = [{ file: 't.json', dtcg: { a: { b: { $value: '{c.d}' } } } }];
  const r = validate({ sources, output: 'static let aB = CGFloat(999.00)', platform: 'ios-swift' });
  assert.equal(r.matched, 0);
  assert.equal(r.ok, false);
});

test('unit-fidelity handles rem-authored tokens emitting ×16 correctly (guards against over-correction)', () => {
  const sources = [{ file: 't.json', dtcg: {
    spacing: { base: { $value: '1rem', $type: 'dimension' } },
  } }];
  const r = validate({ sources, output: 'static let spacingBase = CGFloat(16.00)', platform: 'ios-swift' });
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});
