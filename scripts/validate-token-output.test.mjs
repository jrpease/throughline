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

// §6.2: flattenDtcgTypes reads the RAW source, where hoistDualNodes' $type
// carry has not run yet. A unitless, untyped child of a dimension-typed dual
// node with no enclosing group $type is flipped from N.dp to bare by the
// size transforms (§5), but flattenDtcgTypes returns undefined for it here,
// so DIMENSIONAL.has(undefined) is false and the advisory does not fire.
// Recorded as a documented limit (spec §6.2), not desired behaviour — a
// future fix should flip this test rather than go unnoticed.
test('unitless-dimension misses the hoist carry — documented §6.2 limit', () => {
  const sources = [{ file: 't.json', dtcg: {
    leading: { base: { $value: '16px', $type: 'dimension', normal: { $value: '1.5' } } },
  } }];
  const r = validate({ sources, output: 'static let leadingBaseNormal = 1.5', platform: 'ios-swift' });
  assert.deepEqual(r.advisories, []);
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
