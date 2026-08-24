import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  magnitude,
  colorMixToHex8,
  preprocess,
  nativeFilter,
  nativePlatform,
  nativeSources,
  registerNativeTransforms,
  hasNativeForm,
} from './sd-native.mjs';

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

test('nativeFilter rejects web-only units on the authored value', () => {
  assert.equal(nativeFilter({ original: { $value: '100%' }, $value: '100%' }), false);
  assert.equal(nativeFilter({ original: { $value: '1.5em' }, $value: '1.5em' }), false);
});

test('nativeFilter keeps everything with a native magnitude', () => {
  assert.equal(nativeFilter({ original: { $value: '14px' }, $value: '14px' }), true);
  assert.equal(nativeFilter({ original: { $value: '#ffffff' }, $value: '#ffffff' }), true);
  assert.equal(nativeFilter({ $value: '1.5' }), true);
});

test('nativePlatform emits the stock ios-swift list with the size transform replaced', () => {
  const p = nativePlatform({ platform: 'ios-swift', buildPath: 'out/light/' });
  assert.deepEqual(p.transforms, [
    'attribute/cti',
    'name/camel',
    'value/color-mix-to-hex8',
    'color/UIColorSwift',
    'content/swift/literal',
    'asset/swift/literal',
    'size/unit-aware/swift',
    'value/swift-string-literal',
  ]);
});

test('nativePlatform never emits a rem-assuming stock size transform', () => {
  for (const platform of ['ios-swift', 'android-kotlin']) {
    const p = nativePlatform({ platform, buildPath: 'o/', packageName: 'com.example' });
    for (const banned of [
      'size/swift/remToCGFloat',
      'size/compose/remToDp',
      'size/compose/remToSp',
      'size/compose/em',
    ]) {
      assert.ok(!p.transforms.includes(banned), `${platform} must not include ${banned}`);
    }
  }
});

test('nativePlatform computes color-mix before the platform colour transform', () => {
  for (const [platform, colourTransform] of [
    ['ios-swift', 'color/UIColorSwift'],
    ['android-kotlin', 'color/composeColor'],
  ]) {
    const p = nativePlatform({ platform, buildPath: 'o/', packageName: 'com.example' });
    assert.ok(
      p.transforms.indexOf('value/color-mix-to-hex8') < p.transforms.indexOf(colourTransform),
      `${platform}: color-mix must precede ${colourTransform}`,
    );
  }
});

test('nativePlatform gives Compose separate dp and sp transforms', () => {
  const p = nativePlatform({ platform: 'android-kotlin', buildPath: 'o/', packageName: 'com.example' });
  assert.ok(p.transforms.includes('size/unit-aware/compose-dp'));
  assert.ok(p.transforms.includes('size/unit-aware/compose-sp'));
  assert.ok(p.transforms.includes('value/kotlin-string-literal'));
});

test('nativePlatform flattens references and wires the format and filter', () => {
  const p = nativePlatform({ platform: 'ios-swift', buildPath: 'out/light/' });
  assert.equal(p.options.outputReferences, false);
  assert.equal(p.buildPath, 'out/light/');
  assert.equal(p.files.length, 1);
  assert.equal(p.files[0].destination, 'Tokens.swift');
  assert.equal(p.files[0].format, 'ios-swift/enum.swift');
  assert.equal(p.files[0].options.className, 'Tokens');
  assert.equal(typeof p.files[0].filter, 'function');
  assert.equal(p.files[0].filter({ original: { $value: '1.5em' }, $value: '1.5em' }), false);
});

test('nativePlatform targets Tokens.kt via compose/object for android', () => {
  const p = nativePlatform({
    platform: 'android-kotlin',
    buildPath: 'out/dark/',
    packageName: 'com.example.tokens',
  });
  assert.equal(p.files[0].destination, 'Tokens.kt');
  assert.equal(p.files[0].format, 'compose/object');
  assert.equal(p.files[0].options.packageName, 'com.example.tokens');
});

test('nativePlatform throws when android-kotlin has no packageName', () => {
  assert.throws(
    () => nativePlatform({ platform: 'android-kotlin', buildPath: 'o/' }),
    /packageName/,
  );
});

test('nativePlatform carries the dual-node preprocessor on every platform', () => {
  for (const [platform, extra] of [
    ['ios-swift', {}],
    ['android-kotlin', { packageName: 'com.example' }],
  ]) {
    const p = nativePlatform({ platform, buildPath: 'o/', ...extra });
    assert.deepEqual(p.preprocessors, ['dtcg/resolve-dual-node'], platform);
  }
});

test('nativePlatform throws on an unknown platform', () => {
  assert.throws(() => nativePlatform({ platform: 'flutter', buildPath: 'o/' }), /unknown native platform/);
});

test('nativeSources returns the paths unchanged when there is no collision', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdnative-'));
  const a = join(dir, 'primitives.json');
  const b = join(dir, 'light.json');
  writeFileSync(a, JSON.stringify({ color: { gray: { 900: { $value: '#111827' } } } }));
  writeFileSync(b, JSON.stringify({ color: { bg: { $value: '#ffffff' } } }));
  assert.deepEqual(nativeSources([a, b]), [a, b]);
});

test('nativeSources throws naming the colliding path and both files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdnative-'));
  const light = join(dir, 'light.json');
  const dark = join(dir, 'dark.json');
  writeFileSync(light, JSON.stringify({ color: { bg: { $value: '#ffffff' } } }));
  writeFileSync(dark, JSON.stringify({ color: { bg: { $value: '#000000' } } }));
  assert.throws(() => nativeSources([light, dark]), (err) => {
    assert.match(err.message, /color\.bg/);
    assert.match(err.message, /light\.json/);
    assert.match(err.message, /dark\.json/);
    return true;
  });
});

test('nativeSources names the path and the expectation on a missing file', () => {
  const missing = join(mkdtempSync(join(tmpdir(), 'sdnative-')), 'tokens/*.json');
  assert.throws(() => nativeSources([missing]), (err) => {
    assert.match(err.message, /cannot read token source/);
    assert.match(err.message, /tokens\/\*\.json/);
    assert.match(err.message, /never a glob/);
    return true;
  });
});

test('nativeSources names the file when its JSON does not parse', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdnative-'));
  const bad = join(dir, 'broken.json');
  writeFileSync(bad, '{ "color": ');
  assert.throws(() => nativeSources([bad]), (err) => {
    assert.match(err.message, /broken\.json" is not valid JSON/);
    return true;
  });
});

test('registerNativeTransforms registers the preprocessor and six transforms', () => {
  const preprocessors = [];
  const transforms = [];
  registerNativeTransforms({
    registerPreprocessor: (p) => preprocessors.push(p),
    registerTransform: (t) => transforms.push(t),
  });

  assert.deepEqual(preprocessors.map((p) => p.name), ['dtcg/resolve-dual-node']);
  assert.deepEqual(transforms.map((t) => t.name).sort(), [
    'size/unit-aware/compose-dp',
    'size/unit-aware/compose-sp',
    'size/unit-aware/swift',
    'value/color-mix-to-hex8',
    'value/kotlin-string-literal',
    'value/swift-string-literal',
  ]);
  for (const t of transforms) assert.equal(t.type, 'value');
});

test('the registered swift transform converts a px dimension 1:1', () => {
  const transforms = [];
  registerNativeTransforms({ registerPreprocessor: () => {}, registerTransform: (t) => transforms.push(t) });
  const swift = transforms.find((t) => t.name === 'size/unit-aware/swift');
  const token = { $type: 'dimension', $value: '14px', original: { $value: '14px' } };
  assert.equal(swift.filter(token), true);
  assert.equal(swift.transform(token), 'CGFloat(14.00)');
});

test('the registered compose transforms split sp from dp by $type', () => {
  const transforms = [];
  registerNativeTransforms({ registerPreprocessor: () => {}, registerTransform: (t) => transforms.push(t) });
  const dp = transforms.find((t) => t.name === 'size/unit-aware/compose-dp');
  const sp = transforms.find((t) => t.name === 'size/unit-aware/compose-sp');

  const dimension = { $type: 'dimension', $value: '16px', original: { $value: '16px' } };
  const fontSize = { $type: 'fontSize', $value: '14px', original: { $value: '14px' } };

  assert.equal(dp.filter(dimension), true);
  assert.equal(dp.filter(fontSize), false);
  assert.equal(dp.transform(dimension), '16.00.dp');

  assert.equal(sp.filter(fontSize), true);
  assert.equal(sp.filter(dimension), false);
  assert.equal(sp.transform(fontSize), '14.00.sp');
});

test('the registered swift transform also handles fontSize, matching stock', () => {
  const transforms = [];
  registerNativeTransforms({ registerPreprocessor: () => {}, registerTransform: (t) => transforms.push(t) });
  const swift = transforms.find((t) => t.name === 'size/unit-aware/swift');
  assert.equal(swift.filter({ $type: 'fontSize', $value: '14px', original: { $value: '14px' } }), true);
});

test('the registered size transforms skip a value with no native magnitude', () => {
  const transforms = [];
  registerNativeTransforms({ registerPreprocessor: () => {}, registerTransform: (t) => transforms.push(t) });
  const swift = transforms.find((t) => t.name === 'size/unit-aware/swift');
  assert.equal(swift.filter({ $type: 'dimension', $value: '100%', original: { $value: '100%' } }), false);
});

// Collect the transforms registerNativeTransforms registers, without needing
// a real Style Dictionary. Mirrors the fake used elsewhere in this file.
function collectTransforms() {
  const registered = new Map();
  registerNativeTransforms({
    registerPreprocessor() {},
    registerTransform(t) {
      registered.set(t.name, t);
    },
  });
  return registered;
}

test('the quoting transform quotes fontFamily and string types', () => {
  const t = collectTransforms().get('value/swift-string-literal');
  assert.ok(t.filter({ $type: 'fontFamily', $value: 'Nunito Sans' }));
  assert.ok(t.filter({ $type: 'string', $value: 'italic' }));
  assert.equal(t.transform({ $type: 'fontFamily', $value: 'Nunito Sans' }), '"Nunito Sans"');
});

test('the quoting transform leaves typed non-strings alone', () => {
  const t = collectTransforms().get('value/swift-string-literal');
  assert.equal(t.filter({ $type: 'dimension', $value: '14px' }), false);
  assert.equal(t.filter({ $type: 'color', $value: '#ffffff' }), false);
});

// DTCG permits a fontWeight keyword as well as a number. "400" already emits
// as a valid native integer and must stay untouched.
test('fontWeight is quoted only when it is a keyword', () => {
  const t = collectTransforms().get('value/swift-string-literal');
  assert.ok(t.filter({ $type: 'fontWeight', $value: 'bold' }));
  assert.equal(t.filter({ $type: 'fontWeight', $value: '400' }), false);
  assert.equal(t.filter({ $type: 'fontWeight', $value: 400 }), false);
});

test('a fontFamily list is joined into one native string', () => {
  const t = collectTransforms().get('value/swift-string-literal');
  const token = { $type: 'fontFamily', $value: ['Nunito Sans', 'sans-serif'] };
  assert.ok(t.filter(token));
  assert.equal(t.transform(token), '"Nunito Sans, sans-serif"');
});

// "$foo" is template interpolation in Kotlin, so a literal $ must be escaped
// there — and must NOT be in Swift, where \$ is not a valid escape.
test('Kotlin escapes the dollar sign and Swift does not', () => {
  const ts = collectTransforms();
  const token = { $type: 'string', $value: 'cost: $5' };
  assert.equal(ts.get('value/kotlin-string-literal').transform(token), '"cost: \\$5"');
  assert.equal(ts.get('value/swift-string-literal').transform(token), '"cost: $5"');
});

test('both quoting transforms escape backslashes, quotes and newlines', () => {
  const ts = collectTransforms();
  for (const name of ['value/swift-string-literal', 'value/kotlin-string-literal']) {
    const t = ts.get(name);
    assert.equal(t.transform({ $type: 'string', $value: 'a"b' }), '"a\\"b"', name);
    assert.equal(t.transform({ $type: 'string', $value: 'a\\b' }), '"a\\\\b"', name);
    assert.equal(t.transform({ $type: 'string', $value: 'a\nb' }), '"a\\nb"', name);
  }
});

// Distinct from nativeFilter: this reads the TRANSFORMED $value and asks
// whether it is a literal the language can parse, or at least not a CSS
// function call it has zero hope of rendering.
test('hasNativeForm keeps a valid literal and a CSS function nothing rescued drops', () => {
  assert.ok(hasNativeForm({ $value: 'CGFloat(14.00)' }, 'ios-swift'));
  assert.ok(hasNativeForm({ $value: '"Nunito Sans"' }, 'ios-swift'));
  assert.ok(hasNativeForm({ $value: 'Color(0xffffffff)' }, 'android-kotlin'));
  assert.ok(hasNativeForm({ $value: '16.00.dp' }, 'android-kotlin'));
  assert.equal(hasNativeForm({ $value: 'linear-gradient(90deg, #fff 0%)' }, 'ios-swift'), false);
});

// A value that is invalid but NOT shaped like a CSS function call — a bare
// identifier a forgotten $type left unquoted, say — must stay and fail loudly
// at compile time rather than vanish as a silent drop.
test('hasNativeForm keeps an invalid value that is not a CSS function', () => {
  assert.ok(hasNativeForm({ $value: 'Nunito Sans' }, 'ios-swift'));
  assert.ok(hasNativeForm({ $value: '200ms' }, 'ios-swift'));
  assert.ok(hasNativeForm({ $value: '0.5,0,1,1' }, 'android-kotlin'));
});

test('hasNativeForm throws on an unknown platform', () => {
  assert.throws(() => hasNativeForm({ $value: '14' }, 'flutter'), /unknown native platform/);
});

// A color-mix value is rescued by value/color-mix-to-hex8 and then by the
// colour transform, so by filter time it is a valid literal and survives.
// This is why the filter asks about the transformed value and needs no
// per-transform exemption list.
test('hasNativeForm does not drop a rescued color-mix token', () => {
  assert.ok(hasNativeForm({ $value: 'UIColor(red: 0.1, green: 0.2, blue: 0.3, alpha: 0.5)' }, 'ios-swift'));
});

// calc(...) and var(...) are unrescued but valid identifiers, and an
// unrescued color-mix(...) variant is a rescue this module's own transform
// simply did not match. None of those are "no native form" — dropping them
// here would make no-foreign-syntax in validate-token-output.mjs unreachable,
// so hasNativeForm must keep them and let that gate fail loudly instead.
test('hasNativeForm keeps an unrescued CSS construct instead of silently dropping it', () => {
  assert.ok(hasNativeForm({ $value: 'calc(1rem + 2px)' }, 'ios-swift'));
  assert.ok(hasNativeForm({ $value: 'var(--x)' }, 'ios-swift'));
  assert.ok(hasNativeForm({ $value: 'color-mix(in srgb, #aaa 50%, #bbb)' }, 'ios-swift'));
  // A gradient has no rescue and no name-diagnosed construct — still dropped.
  assert.equal(hasNativeForm({ $value: 'linear-gradient(90deg, #fff 0%)' }, 'ios-swift'), false);
});

test('nativePlatform composes the authored-unit filter with the literal filter', () => {
  const p = nativePlatform({ platform: 'ios-swift', buildPath: 'out/' });
  const f = p.files[0].filter;
  // dropped by nativeFilter — a web-only authored unit
  assert.equal(f({ original: { $value: '1.5em' }, $value: '1.5em' }), false);
  // dropped by hasNativeForm — a CSS function nothing rescued into a literal
  assert.equal(
    f({ original: { $value: 'linear-gradient(90deg, #fff 0%)' }, $value: 'linear-gradient(90deg, #fff 0%)' }),
    false,
  );
  // kept — transformed into a valid literal
  assert.equal(f({ original: { $value: '14px' }, $value: 'CGFloat(14.00)' }), true);
});

// The pipeline cannot produce a bare unquoted gradient for a $type: string
// token — the quoting transform runs first and either quotes it or leaves it
// alone for the filter to judge. This is the state that actually reaches the
// filter, and the one the Critical this test guards against would have shipped
// wrong: quoting the gradient into a validly-quoted, meaningless string.
test('a $type string gradient is left unquoted by the transform and dropped by the filter', () => {
  const t = collectTransforms().get('value/swift-string-literal');
  const token = { $type: 'string', $value: 'linear-gradient(90deg, #fff 0%)' };
  assert.equal(t.filter(token), false);

  const p = nativePlatform({ platform: 'ios-swift', buildPath: 'out/' });
  assert.equal(
    p.files[0].filter({ original: { $value: token.$value }, $value: token.$value }),
    false,
  );
});

// Guards against an over-broad CSS_FUNCTION refusal: an ordinary $type: string
// value must still be quoted and kept.
test('a $type string non-function value is still quoted and kept', () => {
  const t = collectTransforms().get('value/swift-string-literal');
  const token = { $type: 'string', $value: 'italic' };
  assert.ok(t.filter(token));
  assert.equal(t.transform(token), '"italic"');

  const p = nativePlatform({ platform: 'ios-swift', buildPath: 'out/' });
  assert.equal(
    p.files[0].filter({ original: { $value: token.$value }, $value: t.transform(token) }),
    true,
  );
});

// Regression: a legitimate font family can contain a space-then-paren —
// "Helvetica (Regular)" — which must not be mistaken for a CSS function call.
// CSS function notation forbids whitespace before the paren; a fontFamily
// with one is exactly the case CSS_FUNCTION's lack of \s* exists to admit.
test('a fontFamily containing a parenthesized suffix is quoted and kept, not mistaken for a CSS function', () => {
  const t = collectTransforms().get('value/swift-string-literal');
  const token = { $type: 'fontFamily', $value: 'Helvetica (Regular)' };
  assert.ok(t.filter(token));
  assert.equal(t.transform(token), '"Helvetica (Regular)"');

  const p = nativePlatform({ platform: 'ios-swift', buildPath: 'out/' });
  assert.equal(
    p.files[0].filter({ original: { $value: token.$value }, $value: t.transform(token) }),
    true,
  );
});

// A dual node's child is renamed to a camel-joined sibling. If that name is
// already taken, the pre-fix code overwrote it and a token vanished with no
// diagnostic — the same class as the mode collision nativeSources guards.
test('preprocess throws when a hoisted name collides with an authored token', () => {
  assert.throws(
    () =>
      preprocess({
        text: {
          sm: { $value: '14px', lineHeight: { $value: '20px' } },
          smLineHeight: { $value: '28px' },
        },
      }),
    (err) => {
      assert.match(err.message, /collide/i);
      assert.match(err.message, /text\.sm\.lineHeight/);
      assert.match(err.message, /text\.smLineHeight/);
      assert.match(err.message, /28px/);
      return true;
    },
  );
});

// A group, not a token — hoisting onto it would destroy a whole subtree.
test('preprocess throws when a hoisted name collides with an authored group', () => {
  assert.throws(
    () =>
      preprocess({
        text: {
          sm: { $value: '14px', lineHeight: { $value: '20px' } },
          smLineHeight: { bold: { $value: '28px' } },
        },
      }),
    (err) => {
      assert.match(err.message, /collide/i);
      assert.match(err.message, /\(a group\)/);
      return true;
    },
  );
});

// Neither name is authored: t.a.bC and t.aB.c both camel-join to t.aBC.
// The issue does not name this variant; it was found by probing.
test('preprocess throws when two hoists collide with each other', () => {
  assert.throws(
    () =>
      preprocess({
        t: {
          a: { $value: '1px', bC: { $value: '2px' } },
          aB: { $value: '3px', c: { $value: '4px' } },
        },
      }),
    /collide/i,
  );
});

// findModeCollisions exempts identical values because it is deduping across
// files. This is not a dedupe — two distinct authored tokens land on one name,
// and they may differ in $type or $description even with equal $value.
test('preprocess throws on collision even when the values are identical', () => {
  assert.throws(
    () =>
      preprocess({
        text: {
          sm: { $value: '14px', lineHeight: { $value: '20px' } },
          smLineHeight: { $value: '20px' },
        },
      }),
    /collide/i,
  );
});

// The recursion is depth-first, so the deepest frame finishes first. An
// implementation that throws per-frame reports one subtree and stops.
test('preprocess reports every collision, across depths, in one error', () => {
  assert.throws(
    () =>
      preprocess({
        outer: {
          a: { $value: '1px', b: { $value: '2px' } },
          aB: { $value: '3px' },
          nested: {
            c: { $value: '4px', d: { $value: '5px' } },
            cD: { $value: '6px' },
          },
        },
      }),
    (err) => {
      assert.match(err.message, /outer\.a\.b/);
      assert.match(err.message, /outer\.nested\.c\.d/);
      assert.match(err.message, /^2 hoisted token name/m);
      return true;
    },
  );
});

// The message truncates the shown list at 5 and tails with a count of the
// rest. Seven collisions is the smallest case that exercises the tail.
test('preprocess truncates a long collision list and reports the remainder', () => {
  const dict = {};
  for (let i = 0; i < 7; i++) {
    const letter = String.fromCharCode(97 + i);
    dict[`g${i}`] = { $value: '1px', [letter]: { $value: '2px' } };
    dict[`g${i}${letter.toUpperCase()}`] = { $value: '3px' };
  }
  assert.throws(
    () => preprocess(dict),
    (err) => {
      assert.match(err.message, /^7 hoisted token name/m);
      assert.match(err.message, /\.\.\.and 2 more/);
      return true;
    },
  );
});

// Regression: hoisted in node walked the prototype chain, so a camel-joined
// name matching an inherited Object.prototype member (toString, valueOf, ...)
// reported a collision against a sibling that does not exist.
test('a hoisted name matching an inherited Object.prototype member does not collide', () => {
  const out = preprocess({
    g: { to: { $value: '1px', string: { $value: '2px' } } },
  });
  assert.deepEqual(out, {
    g: { to: { $value: '1px' }, toString: { $value: '2px' } },
  });
});

// sd-native.mjs states in prose that preprocess is idempotent, and real builds
// rely on it (a project may declare the preprocessor at top level as well as on
// the platform). No test asserted it before this one.
test('preprocess is idempotent', () => {
  const input = {
    text: {
      sm: { $value: '14px', $type: 'dimension', lineHeight: { $value: '20px', $type: 'dimension' } },
    },
  };
  const once = preprocess(input);
  const twice = preprocess(once);
  assert.deepEqual(twice, once);
});
