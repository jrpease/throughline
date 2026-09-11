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

import { normalizeKey, expectedMagnitude, findModeCollisions, findNormalizationCollisions, validate } from './validate-token-output.mjs';

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

// #36. Two distinct source paths reducing to one symbol name is not merely a
// matching problem. Measured through Style Dictionary on this exact pair: the
// build emits `val colorBgCanvas` twice and kotlinc rejects the file with
// "conflicting declarations". Before this, the second path silently overwrote
// the first, so the loser went unchecked AND every symbol on that key was
// compared against whichever path sorted last — which reported a unit-fidelity
// failure naming a token that was correct.
const COLLIDING = [
  {
    file: 'a',
    dtcg: {
      color: { bg: { canvas: { $value: '4px', $type: 'dimension' } } },
      colorBg: { canvas: { $value: '9px', $type: 'dimension' } },
    },
  },
];

test('findNormalizationCollisions groups paths that reduce to one key', () => {
  const c = findNormalizationCollisions(['color.bg.canvas', 'colorBg.canvas', 'space.md']);
  assert.equal(c.length, 1);
  assert.equal(c[0].key, 'colorbgcanvas');
  assert.deepEqual(c[0].paths, ['color.bg.canvas', 'colorBg.canvas']);
});

test('findNormalizationCollisions is quiet on paths that stay distinct', () => {
  assert.deepEqual(findNormalizationCollisions(['color.bg.canvas', 'color.bg.raised']), []);
});

test('a name collision fails the run instead of misreporting a correct token', () => {
  const r = validate({
    sources: COLLIDING,
    output: 'object Tokens {\n  val colorBgCanvas = 4.00.dp\n  val colorBgCanvas = 9.00.dp\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  assert.equal(r.ok, false, 'the emitted file declares one name twice and will not compile');
  assert.equal(r.normalizationCollisions.length, 1);
  assert.deepEqual(r.normalizationCollisions[0].paths, ['color.bg.canvas', 'colorBg.canvas']);
  assert.deepEqual(
    r.failures.filter((f) => f.rule === 'unit-fidelity'),
    [],
    'the old code reported unit-fidelity here, naming color.bg.canvas, which is correct at 4px',
  );
  assert.equal(r.matched, 0, 'an ambiguous key matches no determinate token');
});

// The silent direction, and the one the issue was filed for. When the output
// carries only the winner's symbol, main matched it, checked it, passed, and
// never looked at color.bg.canvas at all — a green run with a token unverified.
// Measured on a349453: ok true, matched 1, zero failures.
test('a collision is not a green run with one token quietly unchecked', () => {
  const r = validate({
    sources: COLLIDING,
    output: 'object Tokens {\n  val colorBgCanvas = 9.00.dp\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  assert.equal(r.ok, false, 'was true before #36, with color.bg.canvas never checked');
  assert.equal(r.failures.length, 0, 'the collision is the finding, not a rule failure');
  assert.equal(r.normalizationCollisions.length, 1);
});

test('the collision report does not blame the naming convention', () => {
  const r = validate({
    sources: COLLIDING,
    output: 'object Tokens {\n  val colorBgCanvas = 4.00.dp\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  const text = formatReport(r).join('\n');
  assert.match(text, /name collision/);
  assert.doesNotMatch(text, /naming convention does not line up/);
});

test('a collision does not disturb the tokens around it', () => {
  const r = validate({
    sources: [
      {
        file: 'a',
        dtcg: {
          color: { bg: { canvas: { $value: '4px', $type: 'dimension' } } },
          colorBg: { canvas: { $value: '9px', $type: 'dimension' } },
          space: { md: { $value: '8px', $type: 'dimension' } },
        },
      },
    ],
    output: 'object Tokens {\n  val colorBgCanvas = 4.00.dp\n  val spaceMd = 8.00.dp\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  assert.equal(r.matched, 1, 'space.md still matches and is still checked');
  assert.equal(r.normalizationCollisions.length, 1);
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

// #52. A unitless dimension is invalid DTCG (8.2.1). The emitted output is
// correct under the ratio reading, so this is reported and does NOT gate.
test('unitless-dimension is reported as an advisory', () => {
  const r = validate({ sources: SRC, output: 'static let leadingTight = 1.1', platform: 'ios-swift' });
  assert.equal(r.advisories.length, 1);
  assert.equal(r.advisories[0].rule, 'unitless-dimension');
  assert.equal(r.advisories[0].token, 'leading.tight');
});

test('unitless-dimension does not fail the gate', () => {
  const r = validate({ sources: SRC, output: 'static let leadingTight = 1.1', platform: 'ios-swift' });
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

test('unitless-dimension ignores a unitless non-dimension', () => {
  const sources = [{ file: 't.json', dtcg: {
    w: { bold: { $value: '700', $type: 'fontWeight' } },
    ratio: { golden: { $value: '1.618', $type: 'number' } },
  } }];
  const r = validate({ sources, output: 'static let wBold = 700\nstatic let ratioGolden = 1.618', platform: 'ios-swift' });
  assert.deepEqual(r.advisories, []);
  assert.equal(r.ok, true);
});

test('unitless-dimension ignores a dimension that carries a unit', () => {
  const r = validate({ sources: SRC, output: 'static let textSm = CGFloat(14.00)', platform: 'ios-swift' });
  assert.deepEqual(r.advisories, []);
});

test('unitless-dimension fires on a type inherited from a group', () => {
  const sources = [{ file: 't.json', dtcg: {
    leading: { $type: 'dimension', normal: { $value: '1.5' } },
  } }];
  const r = validate({ sources, output: 'static let leadingNormal = 1.5', platform: 'ios-swift' });
  assert.equal(r.advisories.length, 1);
  assert.equal(r.advisories[0].token, 'leading.normal');
});

// A typed alias restates $type on the reference node itself (zygarden authors
// every alias this way). `source` is the RESOLVED referent value; flagging on
// that alone would advise both the alias and its referent for the same
// problem. Only the referent — the token the author would actually edit —
// should be flagged.
test('unitless-dimension does not double-fire on a typed alias — only the referent is named', () => {
  const sources = [{ file: 't.json', dtcg: {
    spacing: { space4: { $value: '1.5', $type: 'dimension' } },
    alias: { spacing4: { $value: '{spacing.space4}', $type: 'dimension' } },
  } }];
  const out = 'static let spacingSpace4 = 1.5\nstatic let aliasSpacing4 = 1.5';
  const r = validate({ sources, output: out, platform: 'ios-swift' });
  assert.equal(r.advisories.length, 1);
  assert.equal(r.advisories[0].token, 'spacing.space4');
});

// #71, and the §6.2 limit this test was left pinned to record. The gate read
// the raw source, where hoistDualNodes' $type carry has not run — so a
// unitless, untyped child of a dimension-typed dual node was a dimension to the
// build and a nothing here. It emitted a bare 1.5, a Double where a Dp belongs,
// and passed every rule clean.
//
// The issue framed the only fix as pointing the gate at the PREPROCESSED tree,
// and rejected it: the gate would stop checking output against what the author
// actually wrote. flattenPipelineTypes keeps that property — it reads the raw
// source and MODELS the carry instead of applying it.
test('unitless-dimension sees the hoist carry', () => {
  const sources = [{ file: 't.json', dtcg: {
    leading: { base: { $value: '16px', $type: 'dimension', normal: { $value: '1.5' } } },
  } }];
  const r = validate({ sources, output: 'static let leadingBaseNormal = 1.5', platform: 'ios-swift' });
  assert.deepEqual(
    r.advisories.filter((a) => a.rule === 'unitless-dimension').map((a) => a.token),
    ['leading.base.normal'],
  );
});

// #72. #69 stopped the advisory double-firing by skipping any whole-value
// reference, which is right when the base carries its own $type. Where it does
// not, the base never fires (untyped) and the alias was skipped (a reference),
// so a genuine unitless dimension was reported NOWHERE. The skip is now
// conditional on the referent being dimension-typed in its own right.
// #58. A node with both a $value and children is invalid DTCG (§6.1); §6.2's
// $root is the sanctioned spelling. Advisory and never gating: every
// Figma-derived source has dozens, so failing would make the gate useless on day
// one for exactly the people this targets.
// #57.1. native-literal.mjs promised the build and the gate could not drift
// apart, and the gate held an independent copy of the same alternation. The
// promise is now enforced: one list, two anchorings derived from it, so adding a
// construct name cannot teach the filter something the gate does not know.
test('the gate and the build read one list of CSS construct names', () => {
  assert.equal(
    CSS_CONSTRUCT_ANYWHERE.source.includes(CSS_CONSTRUCT_NAMES.join('|')),
    true,
    'the unanchored form is built from the shared list',
  );
  assert.equal(CSS_CONSTRUCT.source, `^(?:${CSS_CONSTRUCT_NAMES.join('|')})\\s*\\(`);
});

// #57.2. The build's exemption is anchored and the gate's is not, deliberately:
// a nested construct cannot be told apart from one inside linear-gradient(),
// which has no native form at any depth. So it is dropped — but NAMED, which is
// what changed. Before, the only trace was a count.
test('a token dropped for having no native form is named, not just counted', () => {
  const sources = [{ file: 't.json', dtcg: {
    brand: {
      lead: { $value: 'color-mix(in srgb, #fff 50%, #000)', $type: 'color' },
      nested: { $value: 'rgba(var(--brand), 0.5)', $type: 'color' },
    },
  } }];
  const r = validate({
    sources,
    output: 'object Tokens {\n  val brandLead = color-mix(in srgb, #fff 50%, #000)\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  assert.deepEqual(r.unemittedPaths, ['brand.nested']);
  assert.match(formatReport(r).join('\n'), /brand\.nested/);
});

// #57.4. no-foreign-syntax already names the cause. "The token was never
// actually compared" beside it points at the symptom and reads as a second,
// unrelated defect.
test('a foreign-syntax value does not also report unverifiable-dimension', () => {
  const sources = [{ file: 't.json', dtcg: { space: { four: { $value: '1rem', $type: 'dimension' } } } }];
  const r = validate({
    sources,
    output: 'object Tokens {\n  val spaceFour = calc(1rem + 2px)\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  assert.deepEqual(r.failures.map((f) => f.rule), ['no-foreign-syntax']);
});

test('a dual node is reported as non-conforming, without failing the run', () => {
  const sources = [{ file: 't.json', dtcg: {
    text: { sm: { $value: '14px', $type: 'dimension', lineHeight: { $value: '20px', $type: 'dimension' } } },
  } }];
  const r = validate({ sources, output: 'static let textSm = 14', platform: 'ios-swift', minMatch: 0 });
  const dual = r.advisories.filter((a) => a.rule === 'dual-node');
  assert.equal(dual.length, 1, 'one advisory for the finding, not one per node');
  assert.deepEqual(dual[0].paths, ['text.sm']);
  assert.equal(r.failures.length, 0, 'the build still handles this shape');
});

test('a source with no dual node says nothing about them', () => {
  const sources = [{ file: 't.json', dtcg: { text: { sm: { $value: '14px', $type: 'dimension' } } } }];
  const r = validate({ sources, output: 'static let textSm = 14', platform: 'ios-swift', minMatch: 0 });
  assert.deepEqual(r.advisories.filter((a) => a.rule === 'dual-node'), []);
});

test('the dual-node advisory names $root and says the build still works', () => {
  const sources = [{ file: 't.json', dtcg: {
    text: { sm: { $value: '14px', $type: 'dimension', lineHeight: { $value: '20px', $type: 'dimension' } } },
  } }];
  const r = validate({ sources, output: 'static let textSm = 14', platform: 'ios-swift', minMatch: 0 });
  const text = formatReport(r).join('\n');
  assert.match(text, /\$root/);
  assert.match(text, /keep handling it/);
});

test('an untyped base behind a typed alias is reported, on the base', () => {
  const sources = [{ file: 't.json', dtcg: {
    base: { ratio: { $value: '1.5' } },
    alias: { ratio: { $value: '{base.ratio}', $type: 'dimension' } },
  } }];
  const r = validate({ sources, output: 'static let aliasRatio = 1.5', platform: 'ios-swift' });
  assert.deepEqual(
    r.advisories.map((a) => a.token),
    ['base.ratio'],
    'attributed to the token whose $type the author has to change',
  );
});

// #69's de-duplication, kept: where the referent IS dimension-typed it reports
// on its own symbol, so the alias stays silent rather than doubling it.
test('a typed base behind a typed alias is still reported only once', () => {
  const sources = [{ file: 't.json', dtcg: {
    base: { ratio: { $value: '1.5', $type: 'dimension' } },
    alias: { ratio: { $value: '{base.ratio}', $type: 'dimension' } },
  } }];
  const r = validate({
    sources,
    output: 'static let aliasRatio = 1.5\nstatic let baseRatio = 1.5',
    platform: 'ios-swift',
  });
  assert.deepEqual(r.advisories.map((a) => a.token), ['base.ratio']);
});

test('a reference chain is followed to the token that needs fixing', () => {
  const sources = [{ file: 't.json', dtcg: {
    base: { ratio: { $value: '1.5' } },
    mid: { ratio: { $value: '{base.ratio}' } },
    alias: { ratio: { $value: '{mid.ratio}', $type: 'dimension' } },
  } }];
  const r = validate({ sources, output: 'static let aliasRatio = 1.5', platform: 'ios-swift' });
  assert.deepEqual(r.advisories.map((a) => a.token), ['base.ratio']);
});

test('a circular reference is survived rather than thrown on', () => {
  const sources = [{ file: 't.json', dtcg: {
    a: { x: { $value: '{b.y}', $type: 'dimension' } },
    b: { y: { $value: '{a.x}' } },
  } }];
  assert.doesNotThrow(() =>
    validate({ sources, output: 'static let aX = 1.5', platform: 'ios-swift' }),
  );
});

test('formatReport renders the advisory and names the fix', () => {
  const r = validate({ sources: SRC, output: 'static let leadingTight = 1.1', platform: 'ios-swift' });
  const text = formatReport(r).join('\n');
  assert.match(text, /unitless-dimension/);
  assert.match(text, /leadingTight/);
  assert.match(text, /"number"/);
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

// A documented token ($description) emits an inline trailing comment under
// ios-swift/enum.swift. A commented value must still be checked, not counted
// as verified while never actually being compared.
test('extractDeclarations strips a trailing // comment from the value', () => {
  const [d] = extractDeclarations('public static let textSm = CGFloat(224.00) // Small body text', 'ios-swift');
  assert.equal(d.value, 'CGFloat(224.00)');
});

test('extractDeclarations strips a trailing /** ... */ comment from the value', () => {
  const [d] = extractDeclarations('public static let textSm = CGFloat(224.00) /** Small body text */', 'ios-swift');
  assert.equal(d.value, 'CGFloat(224.00)');
});

test('extractDeclarations does not damage a value that legitimately contains // with no preceding whitespace', () => {
  const [d] = extractDeclarations('static let urlToken = "https://example.com"', 'ios-swift');
  assert.equal(d.value, '"https://example.com"');
});

test('a trailing // comment does not defeat unit-fidelity', () => {
  const r = validate({ sources: SRC, output: 'static let textSm = CGFloat(224.00) // Small body text', platform: 'ios-swift' });
  assert.ok(r.failures.some((f) => f.rule === 'unit-fidelity'));
  assert.equal(r.ok, false);
});

test('a trailing /** ... */ comment does not defeat unit-fidelity', () => {
  const r = validate({ sources: SRC, output: 'static let textSm = CGFloat(224.00) /** Small body text */', platform: 'ios-swift' });
  assert.ok(r.failures.some((f) => f.rule === 'unit-fidelity'));
  assert.equal(r.ok, false);
});

const COLOR_SRC = [{ file: 'c.json', dtcg: { color: { bg: { canvas: { $value: '#ffffff', $type: 'color' } } } } }];

test('a colour token does not trigger unverifiable-dimension', () => {
  const r = validate({ sources: COLOR_SRC, output: 'static let colorBgCanvas = UIColor(red: 1, green: 1, blue: 1, alpha: 1)', platform: 'ios-swift' });
  assert.ok(!r.failures.some((f) => f.rule === 'unverifiable-dimension'));
});

test('an unreadable dimension emission produces unverifiable-dimension rather than counting as matched-and-checked', () => {
  const r = validate({ sources: SRC, output: 'static let textSm = someUnknownWrapper(14)', platform: 'ios-swift' });
  assert.ok(r.failures.some((f) => f.rule === 'unverifiable-dimension'));
  assert.equal(r.ok, false);
});

// The match-rate denominator only sees lines DECL could parse. Unparsed
// declaration-shaped lines and unemitted source tokens must be surfaced.
const UNPARSED_OUT = `
public enum Tokens {
    internal static let textSm = CGFloat(14.00)
    internal static let textMd = CGFloat(16.00)
    internal static let textLg = CGFloat(18.00)
}
`;

test('several unparsed declaration-shaped lines report a non-zero unparsedLines count', () => {
  const r = validate({ sources: SRC, output: UNPARSED_OUT, platform: 'ios-swift' });
  assert.equal(r.total, 0);
  assert.equal(r.unparsedLines, 3);
});

const MANY_SRC = [{ file: 't2.json', dtcg: {
  text: { sm: { $value: '14px' }, md: { $value: '16px' }, lg: { $value: '18px' } },
} }];

test('source tokens absent from the output report a non-zero unemittedTokens count', () => {
  const r = validate({ sources: MANY_SRC, output: 'static let textSm = CGFloat(14.00)', platform: 'ios-swift' });
  assert.equal(r.unemittedTokens, 2);
});

test('a clean matched run reports neither unparsedLines nor unemittedTokens', () => {
  const out = 'static let textSm = CGFloat(14.00)\nstatic let leadingTight = CGFloat(1.1)';
  const r = validate({ sources: SRC, output: out, platform: 'ios-swift' });
  assert.equal(r.unparsedLines, 0);
  assert.equal(r.unemittedTokens, 0);
});

import { formatReport } from './validate-token-output.mjs';
import { CSS_CONSTRUCT, CSS_CONSTRUCT_ANYWHERE, CSS_CONSTRUCT_NAMES } from './lib/native-literal.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('formatReport states the match rate and every failure', () => {
  const lines = formatReport({
    total: 2, matched: 1, matchRate: 0.5, minMatch: 0.5, collisions: [],
    failures: [{ rule: 'unit-fidelity', symbol: 'textSm', token: 'text.sm', source: '14px', emitted: 'CGFloat(224.00)', expected: 14, actual: 224 }],
    ok: false,
  }).join('\n');
  assert.match(lines, /1\/2/);
  assert.match(lines, /unit-fidelity/);
  assert.match(lines, /textSm/);
  assert.match(lines, /224/);
});

test('formatReport renders an unverifiable-dimension failure', () => {
  const lines = formatReport({
    total: 1, matched: 1, matchRate: 1, minMatch: 0.5, collisions: [],
    failures: [{ rule: 'unverifiable-dimension', symbol: 'textSm', token: 'text.sm', source: '14px', emitted: 'someUnknownWrapper(14)' }],
    ok: false,
  }).join('\n');
  assert.match(lines, /unverifiable-dimension/);
  assert.match(lines, /textSm/);
});

test('formatReport prints unparsedLines and unemittedTokens only when non-zero', () => {
  const zero = formatReport({
    total: 1, matched: 1, matchRate: 1, minMatch: 0.5, collisions: [], failures: [], ok: true,
    unparsedLines: 0, unemittedTokens: 0,
  }).join('\n');
  assert.doesNotMatch(zero, /unparsed line/);
  assert.doesNotMatch(zero, /had no matching emitted symbol/);

  const nonzero = formatReport({
    total: 1, matched: 1, matchRate: 1, minMatch: 0.5, collisions: [], failures: [], ok: true,
    unparsedLines: 2, unemittedTokens: 3,
  }).join('\n');
  assert.match(nonzero, /2 unparsed line/);
  assert.match(nonzero, /3 source token\(s\) had no matching emitted symbol/);
});

function runCli(args) {
  try {
    const stdout = execFileSync('node', ['scripts/validate-token-output.mjs', ...args], { encoding: 'utf8' });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

test('CLI exits 2 when required arguments are missing', () => {
  assert.equal(runCli([]).code, 2);
});

test('CLI exits 1 on a real failure and 0 on clean output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vto-'));
  const src = join(dir, 'text.json');
  writeFileSync(src, JSON.stringify({ text: { sm: { $value: '14px', $type: 'dimension' } } }));

  const bad = join(dir, 'Bad.swift');
  writeFileSync(bad, 'public static let textSm = CGFloat(224.00)\n');
  assert.equal(runCli(['--source', src, '--output', bad, '--platform', 'ios-swift']).code, 1);

  const good = join(dir, 'Good.swift');
  writeFileSync(good, 'public static let textSm = CGFloat(14.00)\n');
  assert.equal(runCli(['--source', src, '--output', good, '--platform', 'ios-swift']).code, 0);
});

test('CLI exits 2 on an unreadable --source file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vto-'));
  const good = join(dir, 'Good.swift');
  writeFileSync(good, 'public static let textSm = CGFloat(14.00)\n');
  assert.equal(runCli(['--source', '/nonexistent/file.json', '--output', good, '--platform', 'ios-swift']).code, 2);
});

test('CLI exits 2 on a non-numeric --min-match', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vto-'));
  const src = join(dir, 'text.json');
  writeFileSync(src, JSON.stringify({ text: { sm: { $value: '14px', $type: 'dimension' } } }));
  const good = join(dir, 'Good.swift');
  writeFileSync(good, 'public static let textSm = CGFloat(14.00)\n');
  assert.equal(runCli(['--source', src, '--output', good, '--platform', 'ios-swift', '--min-match', 'abc']).code, 2);
});

const srcOf = (dtcg) => [{ file: 'a.json', dtcg }];
const rules = (r) => r.failures.map((f) => f.rule);

test('invalid-literal catches an unquoted string value', () => {
  const r = validate({
    sources: srcOf({ typography: { fontFamily: { Web: { $value: 'Nunito Sans', $type: 'fontFamily' } } } }),
    output: 'public static let typographyFontFamilyWeb = Nunito Sans',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(rules(r), ['invalid-literal']);
  assert.equal(r.ok, false);
});

test('invalid-literal catches a raw CSS function', () => {
  const r = validate({
    sources: srcOf({ gradient: { brand: { $value: 'linear-gradient(90deg, #fff 0%)', $type: 'string' } } }),
    output: 'public static let gradientBrand = linear-gradient(90deg, #fff 0%)',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(rules(r), ['invalid-literal']);
});

// Reporting one symbol under three rules is noise. The specific rules win.
test('invalid-literal is suppressed when a more specific rule fired', () => {
  const bare = validate({
    sources: srcOf({ text: { sm: { $value: '14px', $type: 'dimension' } } }),
    output: 'public static let textSm = 14px',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.ok(rules(bare).includes('no-bare-units'));
  assert.equal(rules(bare).includes('invalid-literal'), false);

  const foreign = validate({
    sources: srcOf({ c: { a: { $value: '#fff', $type: 'color' } } }),
    output: 'public static let ca = calc(1rem + 2px)',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(rules(foreign), ['no-foreign-syntax']);
});

// Placement: the rule runs before the name-match `continue`, so a symbol that
// resolves to no source token cannot escape a validity check by being unnamed.
test('invalid-literal fires on a symbol that matches no source token', () => {
  const r = validate({
    sources: srcOf({ unrelated: { $value: '1px', $type: 'dimension' } }),
    output: 'public static let mysterySymbol = Nunito Sans',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(rules(r), ['invalid-literal']);
});

test('valid native output produces no invalid-literal failure', () => {
  const r = validate({
    sources: srcOf({ text: { sm: { $value: '14px', $type: 'dimension' } } }),
    output: 'public static let textSm = CGFloat(14.00)',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

// #52 is now closed — the pipeline itself no longer emits `.dp` for a
// unitless dimension — but the validator's magnitude checks are unit-agnostic
// and never depended on that shape: they check magnitude and literal
// validity against whatever the OUTPUT actually is, not what the current
// pipeline would produce. Pins that tolerance.
test('a unitless ratio manually emitted as .dp still passes — the validator only checks magnitude', () => {
  const r = validate({
    sources: srcOf({ leading: { normal: { $value: '1.5', $type: 'dimension' } } }),
    output: 'val leadingNormal = 1.50.dp',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

// A quoted string this branch's own transform produced compiles fine, whatever
// text it contains — a value the grammar accepts as a literal is not foreign
// syntax.
test('no-foreign-syntax does not fire on a quoted string containing "calc("', () => {
  const r = validate({
    sources: srcOf({ s: { hint: { $value: 'width: calc(100% - 2rem)', $type: 'string' } } }),
    output: 'public static let sHint = "width: calc(100% - 2rem)"',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

// Bare, unquoted calc(...) is not a valid literal, so it must still fire.
test('no-foreign-syntax still fires on a bare, unquoted calc(...)', () => {
  const r = validate({
    sources: srcOf({ c: { a: { $value: '#fff', $type: 'color' } } }),
    output: 'public static let ca = calc(1rem + 2px)',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(rules(r), ['no-foreign-syntax']);
});

test('formatReport renders an invalid-literal failure with the stop position', () => {
  const lines = formatReport({
    total: 1, matched: 1, matchRate: 1, minMatch: 0.5, collisions: [], ok: false,
    failures: [{
      rule: 'invalid-literal', symbol: 'fontFamilyBase', emitted: 'Nunito Sans',
      platform: 'ios-swift', offset: 7, rest: 'Sans',
    }],
  }).join('\n');
  assert.match(lines, /invalid-literal/);
  assert.match(lines, /fontFamilyBase/);
  assert.match(lines, /ios-swift/);
  assert.match(lines, /offset 7/);
  assert.match(lines, /quoted/);
});

const roleSources = () => [
  {
    file: 'tokens.json',
    dtcg: {
      text: { base: { $type: 'dimension', $value: '16px' }, huge: { $type: 'dimension', $value: '96px' } },
      tracking: { widest: { $type: 'dimension', $value: '0.15em' }, tight: { $type: 'dimension', $value: '-0.03em' } },
      typography: {
        body: {
          fontSize: { $type: 'dimension', $value: '{text.base}' },
          letterSpacing: { $type: 'dimension', $value: '{tracking.tight}' },
        },
      },
    },
  },
];

test('an unreferenced sibling is advised even though nothing emitted it', () => {
  const r = validate({
    sources: roleSources(),
    output: 'object Tokens {\n  val textBase = 16.00.sp\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  const advised = r.advisories.filter((a) => a.rule === 'unreferenced-text-sibling').map((a) => a.token);
  assert.ok(advised.includes('tracking.widest'), 'dropped from output entirely — the case that matters');
  assert.ok(advised.includes('text.huge'));
  assert.ok(
    r.advisories.every((a) => a.rule !== 'unreferenced-text-sibling' || !('symbol' in a)),
    'these advisories name a token path, not a symbol',
  );
});

test('an advisory is never a failure', () => {
  const r = validate({
    sources: roleSources(),
    output: 'object Tokens {\n  val textBase = 16.00.sp\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  assert.ok(r.advisories.length > 0, 'the fixture must actually produce advisories');
  assert.deepEqual(r.failures, [], 'advisories are reported, not gating');
  // Asserted on failures rather than on r.ok: ok also folds in the match rate,
  // so a green assertion there could be green for an unrelated reason.
});

test('a token referenced by both roles is advised as ambiguous', () => {
  const sources = roleSources();
  sources[0].dtcg.space = { pad: { $type: 'dimension', $value: '{text.base}' } };
  const r = validate({
    sources,
    output: 'object Tokens {\n  val textBase = 16.00.dp\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  const a = r.advisories.find((x) => x.rule === 'ambiguous-text-role');
  assert.ok(a, 'both-roles is reported, not silently declined');
  assert.equal(a.token, 'text.base');
  assert.deepEqual(a.otherLeaves, ['pad']);
});

test('formatReport renders a symbol-less advisory without printing undefined', () => {
  const r = validate({
    sources: roleSources(),
    output: 'object Tokens {\n  val textBase = 16.00.sp\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  const text = formatReport(r).join('\n');
  assert.ok(text.includes('tracking.widest'));
  assert.ok(!/undefined/.test(text), 'a missing symbol must never reach the report');
});

import { normalizeBlock, extractCustomProperties } from './validate-token-output.mjs';

test('extractCustomProperties strips a leading doc comment and a trailing inline comment', () => {
  const css = '/**\n * Do not edit directly.\n */\n\n:root {\n  --a: 1px;\n  --b: var(--a); /* note */\n}\n';
  const r = extractCustomProperties(css);
  assert.deepEqual(r.declarations, [
    { block: ':root', name: '--a', value: '1px' },
    { block: ':root', name: '--b', value: 'var(--a)' },
  ]);
  assert.equal(r.unparsed, 0);
});

test('extractCustomProperties reads a plain selector, an attribute selector, and a media-nested block', () => {
  const css = ':root {\n  --a: 1px;\n}\n[data-theme="light"] {\n  --a: 2px;\n}\n@media (min-width: 768px) {\n  :root {\n    --a: 3px;\n  }\n}\n';
  const r = extractCustomProperties(css);
  assert.deepEqual(
    r.declarations.map((d) => d.block),
    [':root', '[data-theme="light"]', '@media (min-width: 768px) :root'],
  );
});

test('extractCustomProperties joins a multi-selector block under one normalized block name', () => {
  const css = '@layer base {\n  :root,\n  .light {\n    --x: 2px;\n  }\n}\n';
  const r = extractCustomProperties(css);
  assert.equal(r.declarations.length, 1);
  assert.equal(r.declarations[0].block, '@layer base :root, .light');
});

test('extractCustomProperties reads a Tailwind @theme block', () => {
  const css = '@theme inline {\n  --color-bg: var(--background);\n}\n';
  const r = extractCustomProperties(css);
  assert.equal(r.declarations[0].block, '@theme inline');
});

test('extractCustomProperties keeps an unresolved reference brace in the value, not as a nested block', () => {
  const css = ':root {\n  --lh: {text.xs.lineHeight};\n  --c: red;\n}\n';
  const r = extractCustomProperties(css);
  assert.deepEqual(
    r.declarations.map((d) => d.value),
    ['{text.xs.lineHeight}', 'red'],
  );
});

test('extractCustomProperties reads a quoted string value containing a semicolon and a brace', () => {
  const css = ':root { --f: "a;b}"; --g: 1px; }';
  const r = extractCustomProperties(css);
  assert.deepEqual(
    r.declarations.map((d) => d.value),
    ['"a;b}"', '1px'],
  );
});

test('extractCustomProperties counts a non-custom-property declaration as unparsed', () => {
  const css = ':root { color: red; --a: 1px; }';
  const r = extractCustomProperties(css);
  assert.equal(r.declarations.length, 1);
  assert.equal(r.unparsed, 1);
});

test('extractCustomProperties ignores a declaration outside any block', () => {
  const r = extractCustomProperties('--a: 1px;\n');
  assert.deepEqual(r.declarations, []);
  assert.equal(r.unparsed, 0);
});

test('normalizeBlock collapses whitespace and normalizes comma spacing', () => {
  assert.equal(normalizeBlock('  :root ,\n .dark '), ':root, .dark');
});

import { cssMagnitude, webUnitFidelity } from './validate-token-output.mjs';

function web(dtcg, css, extra) {
  return validate({ sources: [{ file: 'a.json', dtcg }], output: css, platform: 'vanilla-css', minMatch: 0, ...extra });
}

test('cssMagnitude reads a unit or a bare number, and rejects the rest', () => {
  assert.deepEqual(cssMagnitude('1rem'), { n: 1, unit: 'rem' });
  assert.deepEqual(cssMagnitude(16), { n: 16, unit: '' });
  assert.equal(cssMagnitude('var(--a)'), null);
  assert.equal(cssMagnitude('#fff'), null);
  assert.equal(cssMagnitude('16vh'), null);
});

test('webUnitFidelity is true for a matching px/rem/number/fontWeight pair', () => {
  const t = (a, b, type) => webUnitFidelity(cssMagnitude(a), cssMagnitude(b), type);
  assert.equal(t('16px', '16px', 'dimension'), true);
  assert.equal(t('16px', '1rem', 'dimension'), true);
  assert.equal(t(16, '1rem', 'dimension'), true);
  assert.equal(t(16, '16px', 'dimension'), true);
  assert.equal(t('1.5', '1.5', 'number'), true);
  assert.equal(t(700, '700', 'fontWeight'), true);
  assert.equal(t('-0.03em', '-0.03em', 'dimension'), true);
  assert.equal(t('50%', '50%', 'dimension'), true);
  assert.equal(t('0px', '0', 'dimension'), true);
  assert.equal(t('24px', '24.0005px', 'dimension'), true);
  assert.equal(t('1.1', '1.1', 'dimension'), true);
});

test('webUnitFidelity is false for a mismatched unit or magnitude', () => {
  const t = (a, b, type) => webUnitFidelity(cssMagnitude(a), cssMagnitude(b), type);
  assert.equal(t(16, '16rem', 'dimension'), false);
  assert.equal(t('1.1', '1.1rem', 'dimension'), false);
  assert.equal(t('1.5', '1.5px', 'number'), false);
  assert.equal(t('-0.03em', '-0.48px', 'dimension'), false);
  assert.equal(t('50%', '0.5', 'dimension'), false);
  assert.equal(t('16px', '16', 'dimension'), false);
});

test('a clean web output passes', () => {
  const dtcg = {
    space: { 4: { $type: 'dimension', $value: '16px' } },
    gap: { md: { $type: 'dimension', $value: '{space.4}' } },
    color: { ink: { $type: 'color', $value: '#111111' } },
    lh: { body: { $type: 'number', $value: 1.5 } },
  };
  const css = ':root {\n  --space-4: 1rem;\n  --gap-md: var(--space-4);\n  --color-ink: #111111;\n  --lh-body: 1.5;\n}\n';
  const r = web(dtcg, css);
  assert.deepEqual(r.failures, []);
  assert.equal(r.matched, 4);
  assert.equal(r.matchRate, 1);
  assert.equal(r.ok, true);
});

test('no-foreign-syntax and no-bare-units do not run on web output', () => {
  const dtcg = {
    a: { $type: 'dimension', $value: '24px' },
    b: { $type: 'color', $value: 'color-mix(in srgb, {color.ink} 10%, transparent)' },
    color: { ink: { $type: 'color', $value: '#111' } },
  };
  const css = ':root { --a: 24px; --b: color-mix(in srgb, var(--color-ink) 10%, transparent); --color-ink: #111; }';
  const r = web(dtcg, css);
  assert.deepEqual(rules(r), []);
});

test('unit-fidelity catches 16rem emitted for a 16px source', () => {
  const dtcg = { space: { 4: { $type: 'dimension', $value: '16' } } };
  const r = web(dtcg, ':root { --space-4: 16rem; }');
  assert.deepEqual(rules(r), ['unit-fidelity']);
});

const SPACE = {
  space: { 4: { $type: 'dimension', $value: '16px' } },
  gap: { md: { $type: 'dimension', $value: '{space.4}' } },
};

test('reference-fidelity fires when the emitted var() names a different token than the source references', () => {
  const css = ':root { --space-4: 16px; --space-8: 32px; --gap-md: var(--space-8); }';
  const r = web(SPACE, css);
  assert.deepEqual(rules(r), ['reference-fidelity']);
});

test('composite references pass regardless of shorthand order', () => {
  const dtcg = {
    font: {
      family: { body: { $type: 'fontFamily', $value: 'Inter' } },
      size: { md: { $type: 'dimension', $value: '16px' } },
      weight: { regular: { $type: 'fontWeight', $value: 400 } },
    },
    type: {
      body: {
        $type: 'typography',
        $value: {
          fontFamily: '{font.family.body}',
          fontSize: '{font.size.md}',
          fontWeight: '{font.weight.regular}',
          lineHeight: 1.5,
        },
      },
    },
  };
  const css =
    ':root { --font-family-body: Inter; --font-size-md: 16px; --font-weight-regular: 400; --type-body: var(--font-weight-regular) var(--font-size-md)/1.5 var(--font-family-body); }';
  const r = web(dtcg, css);
  assert.deepEqual(rules(r), []);
});

test('dangling-reference fires when the emitted var() names nothing the output declares', () => {
  const r = web(SPACE, ':root { --gap-md: var(--space-4); }');
  assert.equal(r.failures.length, 1);
  assert.deepEqual(r.failures[0], { rule: 'dangling-reference', symbol: '--gap-md', reference: '--space-4' });
});

test('a source-written var() is not dangling', () => {
  const dtcg = { font: { sans: { $type: 'fontFamily', $value: 'var(--font-inter)' } } };
  const r = web(dtcg, ':root { --font-sans: var(--font-inter); }');
  assert.deepEqual(rules(r), []);
});

test('no-unresolved-reference fires on a {reference} left raw in the output', () => {
  const dtcg = {
    text: { xs: { $type: 'dimension', $value: '12px', lineHeight: { $type: 'dimension', $value: '16px' } } },
    t: { lh: { $type: 'dimension', $value: '{text.xs.lineHeight}' } },
  };
  const r = web(dtcg, ':root { --text-xs: 12px; --t-lh: {text.xs.lineHeight}; }');
  assert.deepEqual(rules(r), ['no-unresolved-reference']);
  assert.ok(r.advisories.some((a) => a.rule === 'dual-node'));
});

test('invalid-value fires on a JavaScript value leaked into CSS, but not on a quoted string', () => {
  const objDtcg = { shadow: { card: { $type: 'shadow', $value: { color: '#000', offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px' } } } };
  const objR = web(objDtcg, ':root { --shadow-card: [object Object]; }');
  assert.deepEqual(rules(objR), ['invalid-value']);

  const strDtcg = { s: { flag: { $type: 'string', $value: 'undefined' } } };
  const strR = web(strDtcg, ':root { --s-flag: "undefined"; }');
  assert.deepEqual(rules(strR), []);
});

test('the alias layer is counted on shadcn/tailwind but not on vanilla-css', () => {
  const dtcg = { color: { bg: { $type: 'color', $value: '#fff' } } };
  const css = ':root { --color-bg: #fff; --background: var(--color-bg); }';

  const shadcn = validate({ sources: [{ file: 'a.json', dtcg }], output: css, platform: 'shadcn', minMatch: 0 });
  assert.equal(shadcn.aliases, 1);
  assert.equal(shadcn.matchRate, 1);

  const vanilla = validate({ sources: [{ file: 'a.json', dtcg }], output: css, platform: 'vanilla-css', minMatch: 0 });
  assert.equal(vanilla.aliases, 0);
  assert.equal(vanilla.matchRate, 0.5);

  const dangling = validate({
    sources: [{ file: 'a.json', dtcg }],
    output: ':root { --color-bg: #fff; --background: var(--nope); }',
    platform: 'shadcn',
    minMatch: 0,
  });
  assert.equal(dangling.aliases, 0);
  assert.ok(rules(dangling).includes('dangling-reference'));
});

test('blocks: no --block throws naming every block, a selected block is checked, an unknown one throws', () => {
  const css = ':root { --a: 1px; }\n.dark { --a: 2px; }\n';
  const dtcg = { a: { $type: 'dimension', $value: '2px' } };

  assert.throws(() => web(dtcg, css), /pass --block with one of: ":root" \(1\), ".dark" \(1\)/);

  const dark = web(dtcg, css, { block: ' .dark ' });
  assert.deepEqual(dark.failures, []);
  assert.equal(dark.block, '.dark');

  const root = web(dtcg, css, { block: ':root' });
  assert.deepEqual(rules(root), ['unit-fidelity']);

  assert.throws(() => web(dtcg, css, { block: '.nope' }), /no block ".nope"/);
});

test('later declarations of the same custom property win', () => {
  const dtcg = { a: { $type: 'dimension', $value: '16px' } };
  const r = web(dtcg, ':root { --a: 16rem; }\n:root { --a: 16px; }\n');
  assert.deepEqual(r.failures, []);
  assert.equal(r.total, 1);
});

test('unemittedPaths is computed against every declared name, not just the selected block', () => {
  const dtcg = {
    a: { $type: 'dimension', $value: '1px' },
    b: { $type: 'dimension', $value: '2px' },
    c: { $type: 'dimension', $value: '3px' },
  };
  const css = ':root { --a: 1px; }\n.dark { --b: 2px; }\n';
  const r = web(dtcg, css, { block: ':root' });
  assert.deepEqual(r.unemittedPaths, ['c']);
});

test('a mode collision carries over to the web path', () => {
  const r = validate({
    sources: [
      { file: 'mobile.json', dtcg: { a: { $type: 'dimension', $value: '1px' } } },
      { file: 'desktop.json', dtcg: { a: { $type: 'dimension', $value: '2px' } } },
    ],
    output: ':root { --a: 1px; }',
    platform: 'vanilla-css',
    minMatch: 0,
  });
  assert.equal(r.collisions.length, 1);
  assert.equal(r.ok, false);
});

test('text-role advisories do not run on the web path', () => {
  const r = validate({
    sources: roleSources(),
    output: ':root { --text-base: 16px; }',
    platform: 'vanilla-css',
    minMatch: 0,
  });
  assert.ok(
    r.advisories.every((a) => a.rule !== 'unreferenced-text-sibling' && a.rule !== 'ambiguous-text-role'),
  );
});

test('platform mui throws rather than being read as native or web', () => {
  assert.throws(
    () => validate({ sources: [{ file: 'a.json', dtcg: {} }], output: '', platform: 'mui', minMatch: 0 }),
    /mui is not supported/,
  );
});
