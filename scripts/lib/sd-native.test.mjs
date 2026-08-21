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
});

test('nativePlatform flattens references and wires the format and filter', () => {
  const p = nativePlatform({ platform: 'ios-swift', buildPath: 'out/light/' });
  assert.equal(p.options.outputReferences, false);
  assert.equal(p.buildPath, 'out/light/');
  assert.equal(p.files.length, 1);
  assert.equal(p.files[0].destination, 'Tokens.swift');
  assert.equal(p.files[0].format, 'ios-swift/enum.swift');
  assert.equal(p.files[0].options.className, 'Tokens');
  assert.equal(p.files[0].filter, nativeFilter);
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

test('registerNativeTransforms registers the preprocessor and four transforms', () => {
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
