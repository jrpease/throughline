# Native Adapter Config Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the verified Style Dictionary native configuration as an installable, tested module (`scripts/lib/sd-native.mjs`) so a native token sync produces correct output with no manual configuration.

**Architecture:** A zero-dependency module that takes the `StyleDictionary` constructor as a parameter rather than importing it, exporting pure helpers (unit-aware magnitude, `color-mix` computation, DTCG preprocessing, platform-config assembly) plus one registration side effect. `references/native-adapter-config.md` becomes generated from the module's own source via marker-sliced interleaving, gated by `--check` in CI, so code and doc cannot diverge.

**Tech Stack:** Node ≥20 ESM, `node:test`, `node:assert/strict`, `node:fs`, `node:util` `parseArgs`. Style Dictionary v4.4.0 is a *consumer* of this module, never a dependency of it.

**Spec:** `docs/superpowers/specs/2026-08-21-native-adapter-config-module-design.md`

## Global Constraints

- **`scripts/` is a zero-dependency zone.** `node:` built-ins only. No npm packages, ever. Style Dictionary is passed in as an argument.
- **Never check out or modify `~/Dev/zygarden-frontend`.** Read it only via `git show <branch>:<path>`. The branch is `feature/apply-brandguide-styles`, not `main`.
- **ESM throughout.** `.mjs`, `import`/`export`, no CommonJS.
- **Tests use `node:test` + `node:assert/strict`.** Run with `node --test`. Every `*.mjs` in `scripts/` has a sibling `*.test.mjs`.
- **CLI exit codes** (where a script has a CLI): `0` success, `1` validation failure, `2` bad arguments.
- **Module guard idiom** for anything with a CLI: `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();`
- **Do not modify `docs/superpowers/specs/` or `docs/superpowers/plans/`.** They are the historical record.
- **Transform lists are stock-minus-the-broken-one.** Derive each platform's list from Style Dictionary's stock group, replacing only the rem-assuming size transforms and inserting `value/color-mix-to-hex8` before the colour transform. Never hand-pick.
- **Commit after every task.** Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).

---

### Task 1: Move `findModeCollisions` into the shared DTCG library

`sd-native.mjs` needs the collision check, and it must not import the validator (that would be a cycle: the validator will keep re-exporting for its own test surface). `lib/dtcg.mjs` is already the shared DTCG reader installed alongside both validators, and `flattenDtcg`/`resolveValue` were extracted there for exactly this reason.

**Files:**
- Modify: `scripts/lib/dtcg.mjs` (append)
- Modify: `scripts/validate-token-output.mjs:10-13` (import) and `:86-105` (delete local definition)
- Test: `scripts/lib/dtcg.test.mjs` (append)

**Interfaces:**
- Consumes: `flattenDtcg(obj)` from `scripts/lib/dtcg.mjs`.
- Produces: `findModeCollisions(sources)` exported from `scripts/lib/dtcg.mjs`. `sources` is `Array<{ file: string, dtcg: object }>`. Returns `Array<{ path: string, defs: Array<{ file: string, value: unknown }> }>` — empty when there are no collisions.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/dtcg.test.mjs`. Also add `findModeCollisions` to the existing import on line 3, so it reads:

```js
import { flattenDtcg, resolveValue, findModeCollisions } from './dtcg.mjs';
```

```js
test('findModeCollisions reports a path defined differently across files', () => {
  const collisions = findModeCollisions([
    { file: 'light.json', dtcg: { color: { bg: { $value: '#ffffff' } } } },
    { file: 'dark.json', dtcg: { color: { bg: { $value: '#000000' } } } },
  ]);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].path, 'color.bg');
  assert.deepEqual(
    collisions[0].defs.map((d) => d.file),
    ['light.json', 'dark.json'],
  );
});

test('findModeCollisions ignores a path repeated with an identical value', () => {
  const collisions = findModeCollisions([
    { file: 'a.json', dtcg: { color: { bg: { $value: '#ffffff' } } } },
    { file: 'b.json', dtcg: { color: { bg: { $value: '#ffffff' } } } },
  ]);
  assert.deepEqual(collisions, []);
});

test('findModeCollisions returns empty for a single source', () => {
  const collisions = findModeCollisions([
    { file: 'only.json', dtcg: { color: { bg: { $value: '#ffffff' } } } },
  ]);
  assert.deepEqual(collisions, []);
});

test('findModeCollisions sees dual-node children', () => {
  const collisions = findModeCollisions([
    { file: 'a.json', dtcg: { text: { sm: { $value: '14px', lineHeight: { $value: '20px' } } } } },
    { file: 'b.json', dtcg: { text: { sm: { $value: '14px', lineHeight: { $value: '24px' } } } } },
  ]);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].path, 'text.sm.lineHeight');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/dtcg.test.mjs`
Expected: FAIL — `SyntaxError: The requested module './dtcg.mjs' does not provide an export named 'findModeCollisions'`

- [ ] **Step 3: Move the function into `scripts/lib/dtcg.mjs`**

Append verbatim to the end of `scripts/lib/dtcg.mjs`:

```js
// A token path defined in more than one source file with differing values means
// the build's source list spans modes. Style Dictionary dedupes these silently,
// dropping one whole mode — 864 such collisions produced a light-only build from
// a dark-default system.
export function findModeCollisions(sources) {
  const seen = new Map();
  for (const { file, dtcg } of sources) {
    for (const [path, value] of Object.entries(flattenDtcg(dtcg))) {
      if (!seen.has(path)) seen.set(path, []);
      seen.get(path).push({ file, value });
    }
  }
  const collisions = [];
  for (const [path, defs] of seen) {
    const distinct = new Set(defs.map((d) => JSON.stringify(d.value)));
    if (defs.length > 1 && distinct.size > 1) collisions.push({ path, defs });
  }
  return collisions;
}
```

- [ ] **Step 4: Delete the original and import it instead**

In `scripts/validate-token-output.mjs`, change the import (currently line 10) and re-export (currently line 13):

```js
import { flattenDtcg, resolveValue, findModeCollisions } from './lib/dtcg.mjs';

// Re-exported so consumers (and the test file) keep one import surface.
export { flattenDtcg, resolveValue, findModeCollisions };
```

Then **delete** the whole `export function findModeCollisions(sources) { ... }` block from `validate-token-output.mjs`, including its four-line comment above it. Leave `const FOREIGN = ...` and everything after it untouched.

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: PASS, with 4 more tests than before and zero failures. `validate-token-output.test.mjs` must still pass unchanged — it imports `findModeCollisions` from `validate-token-output.mjs`, which now re-exports it.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/dtcg.mjs scripts/lib/dtcg.test.mjs scripts/validate-token-output.mjs
git commit -m "refactor: move findModeCollisions into the shared DTCG library

sd-native.mjs needs the mode-collision check and must not import the
validator. lib/dtcg.mjs is where flattenDtcg and resolveValue already
live for the same reason. validate-token-output.mjs re-exports it, so
its public surface and test file are unchanged."
```

---

### Task 2: The pure core of `sd-native.mjs`

Unit-aware magnitude, `color-mix` computation, and DTCG preprocessing. All pure, all directly testable without Style Dictionary present.

**Files:**
- Create: `scripts/lib/sd-native.mjs`
- Test: `scripts/lib/sd-native.test.mjs`

**Interfaces:**
- Consumes: `flattenDtcg(obj)`, `resolveValue(name, flat)` from `scripts/lib/dtcg.mjs`.
- Produces:
  - `magnitude(authored)` → `number | null`. `null` means "no build-time native magnitude".
  - `colorMixToHex8(value)` → `string | null` (`#rrggbbaa`).
  - `preprocess(dict)` → a new token tree, aliases resolved and dual-node children hoisted. Does not mutate `dict`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/sd-native.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { magnitude, colorMixToHex8, preprocess } from './sd-native.mjs';

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: FAIL — `Cannot find module .../scripts/lib/sd-native.mjs`

- [ ] **Step 3: Write the module**

Create `scripts/lib/sd-native.mjs`:

```js
// Style Dictionary native configuration, as code rather than prose.
//
// The stock ios-swift and compose transform groups emit every px-authored
// dimension at x16 its value, in Swift and Kotlin that compile. This module is
// the verified replacement. Zero dependencies: Style Dictionary is passed in,
// never imported, so this file installs into a user's packages/tokens/scripts/
// alongside lib/dtcg.mjs.
//
// references/native-adapter-config.md is GENERATED from this file by
// scripts/build-native-adapter-config.mjs. Edit the code here, then regenerate.
import { readFileSync } from 'node:fs';
import { flattenDtcg, resolveValue, findModeCollisions } from './dtcg.mjs';

// @doc-section unit-aware
// Read the magnitude from the AUTHORED value's own unit.
//
// The stock size/swift/remToCGFloat and size/compose/rem* transforms assume rem
// and multiply by 16. Against a px-authored source that emits text.sm: "14px"
// as CGFloat(224.00) — valid, compiling, and sixteen times too large.
//
// iOS points and Android dp both map 1:1 to CSS px by convention. A unitless
// dimension is a ratio and is never scaled. % and em are container- or
// parent-relative, so there is genuinely no build-time native magnitude.
export function magnitude(authored) {
  const m = String(authored).trim().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]*)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (m[2] === 'px' || m[2] === '') return n;
  if (m[2] === 'rem') return n * 16;
  return null;
}
// @doc-section-end unit-aware

// @doc-section color-mix
// Compute a color-mix() against transparent to a literal hex8.
//
// A CSS expression has no native equivalent and Style Dictionary does no colour
// math, so it resolves the inner reference and leaves the function wrapper in
// the output. Against `transparent` in srgb the result is the inner colour at
// the stated alpha.
const MIX = /^color-mix\(in srgb,\s*(#[0-9a-fA-F]{6})\s+([\d.]+)%,\s*transparent\)$/;

export function colorMixToHex8(value) {
  const m = String(value).trim().match(MIX);
  if (!m) return null;
  const alpha = Math.round((Number(m[2]) / 100) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${m[1]}${alpha}`.toLowerCase();
}
// @doc-section-end color-mix

// @doc-section preprocess
// Resolve aliases and hoist dual-node children, before Style Dictionary sees
// the tree.
//
// Two distinct SD limitations, both caused by a node carrying BOTH a $value and
// children — legal DTCG, and common in Figma-derived sources, where text.sm
// holds $value "14px" plus a text.sm.lineHeight child:
//
//   1. The resolver will not traverse into such a node, so every alias to the
//      child fails to resolve and emits as a bare literal.
//   2. The collector also stops there, so the child is never emitted at all.
//
// Resolving here also handles references embedded inside an expression, which
// SD's whole-value matcher misses. Pre-resolving costs nothing on native
// targets: they set outputReferences: false, so references flatten regardless.
const WHOLE_REF = /^\{[^}]+\}$/;

function interpolate(value, flat) {
  return value.replace(/\{([^}]+)\}/g, (whole, ref) => {
    try {
      return String(resolveValue(ref, flat));
    } catch {
      return whole;
    }
  });
}

function resolveInPlace(node, flat, prefix = []) {
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (!val || typeof val !== 'object') continue;
    const path = [...prefix, key];
    if ('$value' in val && typeof val.$value === 'string') {
      if (WHOLE_REF.test(val.$value)) {
        try {
          val.$value = resolveValue(path.join('.'), flat);
        } catch {
          /* leave an unresolvable reference in place for SD to report */
        }
      } else {
        val.$value = interpolate(val.$value, flat);
      }
    }
    resolveInPlace(val, flat, path);
  }
  return node;
}

// text.sm.lineHeight becomes text.smLineHeight, which name/camel renders as
// textSmLineHeight — the identical symbol the un-hoisted path would produce.
function hoistDualNodes(node) {
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$') || !val || typeof val !== 'object') continue;
    hoistDualNodes(val);
    if ('$value' in val) {
      for (const [childKey, childVal] of Object.entries(val)) {
        if (childKey.startsWith('$') || !childVal || typeof childVal !== 'object') continue;
        node[key + childKey[0].toUpperCase() + childKey.slice(1)] = childVal;
        delete val[childKey];
      }
    }
  }
  return node;
}

export function preprocess(dict) {
  return hoistDualNodes(resolveInPlace(structuredClone(dict), flattenDtcg(dict)));
}
// @doc-section-end preprocess
```

Note: `readFileSync` and `findModeCollisions` are imported now but first used in Task 3. If your linter objects, leave them — Task 3 adds the consumer in the same file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: PASS, zero failures.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/lib/sd-native.test.mjs
git commit -m "feat: add the pure core of the native Style Dictionary config

Unit-aware magnitude read from the authored value rather than assumed to
be rem, color-mix computed to a literal hex8, and a preprocessor that
resolves aliases into dual-node children and hoists those children so
they are emitted at all.

Style Dictionary is not imported. These are plain functions."
```

---

### Task 3: Platform assembly, the source guard, and registration

The half that eliminates transcription: the platform config object, the mode guard positioned in the data path, and the one call that registers everything with Style Dictionary.

**Files:**
- Modify: `scripts/lib/sd-native.mjs` (append)
- Test: `scripts/lib/sd-native.test.mjs` (append)

**Interfaces:**
- Consumes: `magnitude`, `colorMixToHex8`, `preprocess` from Task 2; `findModeCollisions` from Task 1.
- Produces:
  - `nativeFilter(token)` → `boolean`. False for web-only units.
  - `nativePlatform({ platform, buildPath, className, packageName })` → a Style Dictionary platform config object. `platform` is `'ios-swift'` or `'android-kotlin'`. `className` defaults to `'Tokens'`. `packageName` is **required** for `android-kotlin`, ignored for `ios-swift`.
  - `nativeSources(paths)` → the same `paths` array. Throws on mode collision.
  - `registerNativeTransforms(StyleDictionary)` → `undefined`. Registers one preprocessor named `dtcg/resolve-dual-node` and four transforms.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/sd-native.test.mjs`. Extend the import on line 3 to:

```js
import {
  magnitude,
  colorMixToHex8,
  preprocess,
  nativeFilter,
  nativePlatform,
  nativeSources,
  registerNativeTransforms,
} from './sd-native.mjs';
```

and add these imports at the top of the file:

```js
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
```

Tests:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: FAIL — `does not provide an export named 'nativePlatform'`

- [ ] **Step 3: Append the implementation to `scripts/lib/sd-native.mjs`**

```js
// @doc-section platform
// Build each platform's transform list from Style Dictionary's STOCK group,
// replacing only the rem-assuming size transforms and inserting the color-mix
// computation ahead of the colour transform. A hand-picked list silently drops
// whatever it forgets; three real defects arose that way, including Compose
// font sizes rendered in dp instead of sp.
//
// Stock, from SD 4.4.0:
//   ios-swift: attribute/cti name/camel color/UIColorSwift
//              content/swift/literal asset/swift/literal size/swift/remToCGFloat
//   compose:   attribute/cti name/camel color/composeColor
//              size/compose/em size/compose/remToSp size/compose/remToDp
const PLATFORMS = {
  'ios-swift': {
    transforms: [
      'attribute/cti',
      'name/camel',
      'value/color-mix-to-hex8',
      'color/UIColorSwift',
      'content/swift/literal',
      'asset/swift/literal',
      'size/unit-aware/swift',
    ],
    destination: 'Tokens.swift',
    format: 'ios-swift/enum.swift',
  },
  'android-kotlin': {
    transforms: [
      'attribute/cti',
      'name/camel',
      'value/color-mix-to-hex8',
      'color/composeColor',
      'size/unit-aware/compose-dp',
      'size/unit-aware/compose-sp',
    ],
    destination: 'Tokens.kt',
    format: 'compose/object',
  },
};

// % and em are container- or parent-relative, so there is no build-time native
// magnitude. Filter on the AUTHORED value, not on $type — a "100%" token may be
// typed string rather than dimension.
const WEB_ONLY_UNIT = /^-?[\d.]+(%|em)$/;

export function nativeFilter(token) {
  return !WEB_ONLY_UNIT.test(String(token.original?.$value ?? token.$value).trim());
}

export function nativePlatform({ platform, buildPath, className = 'Tokens', packageName }) {
  const preset = PLATFORMS[platform];
  if (!preset) {
    throw new Error(
      `unknown native platform "${platform}" (expected ${Object.keys(PLATFORMS).join(' or ')})`,
    );
  }
  if (platform === 'android-kotlin' && !packageName) {
    throw new Error(
      'android-kotlin requires a packageName: the compose/object template emits ' +
        '`package ${packageName ?? ""}`, so omitting it produces a bare "package " ' +
        'line, which is not valid Kotlin',
    );
  }
  const fileOptions = platform === 'android-kotlin' ? { className, packageName } : { className };
  return {
    transforms: [...preset.transforms],
    buildPath,
    options: { outputReferences: false },
    files: [
      {
        destination: preset.destination,
        format: preset.format,
        options: fileOptions,
        filter: nativeFilter,
      },
    ],
  };
}
// @doc-section-end platform

// @doc-section sources
// Guard the source list for ONE mode, and return it so it can only be used
// through this call.
//
// Style Dictionary deduplicates by dot-path, so a build whose sources contain
// both a light and a dark definition of the same token keeps whichever file
// sorts last and drops the other mode with no diagnostic. Wrapping the value
// the build already needs makes the check unskippable: omitting it means
// deleting a call whose return value is consumed.
//
//   source: nativeSources(sourcesForThisMode)
export function nativeSources(paths) {
  const parsed = paths.map((file) => ({
    file,
    dtcg: JSON.parse(readFileSync(file, 'utf8')),
  }));
  const collisions = findModeCollisions(parsed);
  if (collisions.length === 0) return paths;

  const shown = collisions
    .slice(0, 5)
    .map((c) => `  ${c.path}: ${c.defs.map((d) => d.file).join(' vs ')}`)
    .join('\n');
  const more = collisions.length > 5 ? `\n  ...and ${collisions.length - 5} more` : '';
  throw new Error(
    `${collisions.length} token path(s) are defined differently across this build's sources.\n` +
      'Style Dictionary keeps whichever file sorts last, silently dropping a whole mode.\n' +
      'Build once per mode, passing an explicit source list for that mode only.\n' +
      `${shown}${more}`,
  );
}
// @doc-section-end sources

// @doc-section register
// Register everything with a Style Dictionary instance. SD is a parameter, not
// an import, so this module stays zero-dependency and installable.
const authored = (token) => magnitude(token.original?.$value ?? token.$value);
const isDimension = (token) => token.$type === 'dimension';
const isFontSize = (token) => token.$type === 'fontSize';
const hasMagnitude = (token) => authored(token) !== null;

export function registerNativeTransforms(StyleDictionary) {
  StyleDictionary.registerPreprocessor({
    name: 'dtcg/resolve-dual-node',
    preprocessor: preprocess,
  });

  StyleDictionary.registerTransform({
    name: 'value/color-mix-to-hex8',
    type: 'value',
    transitive: true,
    filter: (token) => colorMixToHex8(token.$value) !== null,
    transform: (token) => colorMixToHex8(token.$value),
  });

  // Stock size/swift/remToCGFloat filters dimension OR fontSize; match it.
  StyleDictionary.registerTransform({
    name: 'size/unit-aware/swift',
    type: 'value',
    transitive: true,
    filter: (token) => (isDimension(token) || isFontSize(token)) && hasMagnitude(token),
    transform: (token) => `CGFloat(${authored(token).toFixed(2)})`,
  });

  // Compose distinguishes dp from sp by $type, and sp is what respects the
  // user's font-scale accessibility setting. One .dp transform for both would
  // silently defeat that.
  StyleDictionary.registerTransform({
    name: 'size/unit-aware/compose-dp',
    type: 'value',
    transitive: true,
    filter: (token) => isDimension(token) && hasMagnitude(token),
    transform: (token) => `${authored(token).toFixed(2)}.dp`,
  });

  StyleDictionary.registerTransform({
    name: 'size/unit-aware/compose-sp',
    type: 'value',
    transitive: true,
    filter: (token) => isFontSize(token) && hasMagnitude(token),
    transform: (token) => `${authored(token).toFixed(2)}.sp`,
  });
}
// @doc-section-end register
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: PASS, 30 tests.

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: PASS, zero failures.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/lib/sd-native.test.mjs
git commit -m "feat: add platform assembly, the source guard, and registration

nativePlatform builds each transform list from Style Dictionary's stock
group with only the rem-assuming size transforms replaced, which fixes
three defects a hand-picked list had: Compose font sizes emitted in dp
rather than sp, a Swift filter narrower than the transform it replaces,
and two dropped Swift literal transforms.

nativeSources wraps the source list the build already consumes, so the
mode-collision check cannot be skipped by forgetting to call it."
```

---

### Task 4: Generate `native-adapter-config.md` from the module

**Files:**
- Create: `scripts/build-native-adapter-config.mjs`
- Create: `scripts/build-native-adapter-config.test.mjs`
- Modify: `references/native-adapter-config.md` (becomes generated output)
- Modify: `.github/workflows/ci.yml:25` (add a step after the doc-card check)

**Interfaces:**
- Consumes: the `// @doc-section <id>` / `// @doc-section-end <id>` markers placed in `scripts/lib/sd-native.mjs` by Tasks 2 and 3. Ids, in order: `unit-aware`, `color-mix`, `preprocess`, `platform`, `sources`, `register`.
- Produces: `sliceSections(source)` → `Map<string, string>` of id to the source text between a marker pair, exclusive of the marker lines. `render(sections)` → the full Markdown string. CLI: bare writes the file; `--check` exits `1` if the file on disk differs from the render.

- [ ] **Step 1: Write the failing tests**

Create `scripts/build-native-adapter-config.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sliceSections } from './build-native-adapter-config.mjs';

test('sliceSections extracts the text between a marker pair', () => {
  const sections = sliceSections(
    ['before', '// @doc-section alpha', 'const a = 1;', '// @doc-section-end alpha', 'after'].join('\n'),
  );
  assert.equal(sections.get('alpha'), 'const a = 1;');
});

test('sliceSections extracts several sections in order', () => {
  const sections = sliceSections(
    [
      '// @doc-section one',
      'A',
      '// @doc-section-end one',
      '',
      '// @doc-section two',
      'B',
      '// @doc-section-end two',
    ].join('\n'),
  );
  assert.deepEqual([...sections.keys()], ['one', 'two']);
  assert.equal(sections.get('two'), 'B');
});

test('sliceSections throws on an unclosed section', () => {
  assert.throws(
    () => sliceSections(['// @doc-section alpha', 'x'].join('\n')),
    /unclosed/i,
  );
});

test('sliceSections throws when an end marker does not match the open one', () => {
  assert.throws(
    () => sliceSections(['// @doc-section alpha', 'x', '// @doc-section-end beta'].join('\n')),
    /beta/,
  );
});

test('sliceSections throws on a duplicate section id', () => {
  assert.throws(
    () =>
      sliceSections(
        [
          '// @doc-section alpha',
          'x',
          '// @doc-section-end alpha',
          '// @doc-section alpha',
          'y',
          '// @doc-section-end alpha',
        ].join('\n'),
      ),
    /duplicate/i,
  );
});

test('the checked-in reference doc is up to date with the module', async () => {
  const { render, sliceSections: slice, SOURCE, OUT } = await import('./build-native-adapter-config.mjs');
  const { readFileSync } = await import('node:fs');
  assert.equal(readFileSync(OUT, 'utf8'), render(slice(readFileSync(SOURCE, 'utf8'))));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/build-native-adapter-config.test.mjs`
Expected: FAIL — `Cannot find module .../scripts/build-native-adapter-config.mjs`

- [ ] **Step 3: Write the generator**

Create `scripts/build-native-adapter-config.mjs`:

```js
// Generates references/native-adapter-config.md from scripts/lib/sd-native.mjs.
// The prose lives here, keyed by section id; the code is sliced out of the
// module's real source between @doc-section markers and interleaved beneath its
// prose. Mirrors build-doc-card-builder.mjs: run bare to write, --check to gate
// CI. Zero dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = join(REPO_ROOT, 'scripts', 'lib', 'sd-native.mjs');
export const OUT = join(REPO_ROOT, 'references', 'native-adapter-config.md');

const OPEN = /^\s*\/\/\s*@doc-section\s+(\S+)\s*$/;
const CLOSE = /^\s*\/\/\s*@doc-section-end\s+(\S+)\s*$/;

export function sliceSections(source) {
  const sections = new Map();
  let open = null;
  let buffer = [];
  for (const line of source.split('\n')) {
    const closeMatch = line.match(CLOSE);
    if (closeMatch) {
      if (!open) throw new Error(`@doc-section-end ${closeMatch[1]} with no open section`);
      if (closeMatch[1] !== open) {
        throw new Error(`@doc-section-end ${closeMatch[1]} does not close ${open}`);
      }
      sections.set(open, buffer.join('\n').trim());
      open = null;
      buffer = [];
      continue;
    }
    const openMatch = line.match(OPEN);
    if (openMatch) {
      if (open) throw new Error(`unclosed @doc-section ${open}`);
      if (sections.has(openMatch[1])) throw new Error(`duplicate @doc-section ${openMatch[1]}`);
      open = openMatch[1];
      continue;
    }
    if (open) buffer.push(line);
  }
  if (open) throw new Error(`unclosed @doc-section ${open}`);
  return sections;
}

// Section id -> the prose that introduces it. Order here is the doc's order.
const PROSE = [
  ['unit-aware', `## 1. Read the authored unit

**This replaces \`size/swift/remToCGFloat\` and the \`size/compose/*\` transforms,
and it is the single most important piece.** Those assume every dimension is
authored in \`rem\` and multiply by 16. Against a \`px\`-authored source that
silently produces output at sixteen times scale which compiles and ships.`],
  ['color-mix', `## 2. Compute \`color-mix()\` to a literal

A CSS expression has no native equivalent, and Style Dictionary does no colour
math. Native adapters resolve to literals; for a \`color-mix\` that means
actually computing the blend. Register this **before** the platform's colour
transform, so the colour transform receives a valid hex8 rather than a CSS
function.`],
  ['preprocess', `## 3. Resolve aliases and hoist dual-node children

Style Dictionary's resolver will not traverse into a node that carries both a
\`$value\` and children, and its collector stops there too. The dual-node pattern
is legal DTCG and common in Figma-derived sources: \`text.sm\` holds
\`$value: "14px"\` *and* a \`text.sm.lineHeight\` child. So every alias to such a
child fails to resolve, and the child is never emitted at all.

Both are fixed before Style Dictionary sees the tree.`],
  ['platform', `## 4. Assemble the platform from the stock list

Build the transform list from Style Dictionary's **stock group**, replacing only
the rem-assuming size transforms. A hand-picked list silently drops whatever it
forgets — three real defects arose exactly that way, including Compose font
sizes rendered in \`dp\` instead of \`sp\`, which defeats the user's font-scale
accessibility setting.`],
  ['sources', `## 5. Guard the per-mode source list

Style Dictionary deduplicates by dot-path, so one build over both a light and a
dark definition of the same token keeps whichever file sorts last and drops the
other mode with no diagnostic. Pass every build's sources through
\`nativeSources\`, which returns them, so the check cannot be skipped by
forgetting it.`],
  ['register', `## 6. Register with Style Dictionary

One call. Style Dictionary is a parameter, never an import, which is what lets
this module install into a consumer's \`packages/tokens/scripts/lib/\`.`],
];

const HEADER = `# Native adapter configuration (GENERATED)

> **GENERATED FILE — do not edit by hand.** Source: \`scripts/lib/sd-native.mjs\`,
> which is unit-tested in Node and installed into the consumer's repo.
> Regenerate with \`node scripts/build-native-adapter-config.mjs\`; CI gates
> freshness with \`--check\`.

The Style Dictionary configuration a native adapter (\`ios-swift\`,
\`android-kotlin\`, or any generated native target) needs in order to emit
**correct** output from a real DTCG token source.

**Why this exists.** The stock \`ios-swift\` and \`compose\` transform groups
produce output that compiles and is wrong. Run against a real source, the stock
configuration emitted every \`px\`-authored dimension at ×16 its authored value,
leaked \`color-mix()\` expressions into Swift, and left dual-node aliases as bare
\`px\` literals — all at exit \`0\`. None of that is a Style Dictionary limitation.
All of it is configuration.

**You do not need to copy any of this.** It ships as
\`\${CLAUDE_PLUGIN_ROOT}/scripts/lib/sd-native.mjs\`. Install it beside
\`lib/dtcg.mjs\` and call it:

\`\`\`js
import StyleDictionary from 'style-dictionary';
import { registerNativeTransforms, nativePlatform, nativeSources }
  from './scripts/lib/sd-native.mjs';

registerNativeTransforms(StyleDictionary);

for (const mode of ['light', 'dark']) {
  const sd = new StyleDictionary({
    source: nativeSources(sourcesFor(mode)),
    preprocessors: ['dtcg/resolve-dual-node'],
    platforms: {
      ios: nativePlatform({ platform: 'ios-swift', buildPath: \`out/\${mode}/\` }),
    },
  });
  await sd.buildAllPlatforms();
}
\`\`\`

The sections below are the module's own source, inlined so the configuration
stays reviewable. Pair this with \`\${CLAUDE_PLUGIN_ROOT}/references/sync-adapters.md\`,
which covers the adapter contract itself.
`;

const FOOTER = `## Verify, always

Configuration this specific is exactly what regresses unnoticed, because every
failure mode above produces output that compiles. Run \`tokens:validate-output\`
against each generated file with the same source list that file's build used,
and treat it as a gate rather than a spot check:

\`\`\`
node scripts/validate-token-output.mjs \\
  --source tokens/color-primitives.json --source tokens/text-primitives.json \\
  --output out/light/Tokens.swift --platform ios-swift
\`\`\`

A clean run reports 100% of emitted symbols matched with zero rule failures.
Anything less means the configuration drifted — see
\`\${CLAUDE_PLUGIN_ROOT}/scripts/README.md\`.
`;

export function render(sections) {
  const declared = PROSE.map(([id]) => id);
  for (const id of declared) {
    if (!sections.has(id)) throw new Error(`@doc-section ${id} is declared in PROSE but missing from ${SOURCE}`);
  }
  for (const id of sections.keys()) {
    if (!declared.includes(id)) throw new Error(`@doc-section ${id} exists in ${SOURCE} but has no prose entry`);
  }
  const body = PROSE.map(([id, prose]) => `${prose}\n\n\`\`\`js\n${sections.get(id)}\n\`\`\`\n`).join('\n');
  return `${HEADER}\n${body}\n${FOOTER}`;
}

function main() {
  const check = process.argv.includes('--check');
  const rendered = render(sliceSections(readFileSync(SOURCE, 'utf8')));
  if (!check) {
    writeFileSync(OUT, rendered);
    console.log(`wrote ${OUT}`);
    return;
  }
  const current = readFileSync(OUT, 'utf8');
  if (current === rendered) {
    console.log('references/native-adapter-config.md is up to date');
    return;
  }
  console.error(
    'references/native-adapter-config.md is stale.\n' +
      'Run: node scripts/build-native-adapter-config.mjs',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Generate the doc**

Run: `node scripts/build-native-adapter-config.mjs`
Expected: prints `wrote .../references/native-adapter-config.md`. The file is now fully replaced by generated content.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test scripts/build-native-adapter-config.test.mjs`
Expected: PASS, 6 tests — including the freshness test, which now compares the file you just wrote against a fresh render.

- [ ] **Step 6: Verify `--check` behaves both ways**

```bash
node scripts/build-native-adapter-config.mjs --check ; echo "clean exit=$?"
printf '\n<!-- drift -->\n' >> references/native-adapter-config.md
node scripts/build-native-adapter-config.mjs --check ; echo "dirty exit=$?"
node scripts/build-native-adapter-config.mjs
node scripts/build-native-adapter-config.mjs --check ; echo "restored exit=$?"
```

Expected: `clean exit=0`, then `dirty exit=1` with the stale message on stderr, then `restored exit=0`.

- [ ] **Step 7: Add the CI step**

In `.github/workflows/ci.yml`, after the existing `Check doc-card builder is up to date` step, add:

```yaml
      - name: Check native adapter config doc is up to date
        run: node scripts/build-native-adapter-config.mjs --check
```

- [ ] **Step 8: Run the full suite**

Run: `node --test`
Expected: PASS, zero failures.

- [ ] **Step 9: Commit**

```bash
git add scripts/build-native-adapter-config.mjs scripts/build-native-adapter-config.test.mjs references/native-adapter-config.md .github/workflows/ci.yml
git commit -m "feat: generate native-adapter-config.md from the module

The configuration existed twice: as prose an agent transcribes and, after
Tasks 2 and 3, as tested code. Generation removes the second copy's
ability to disagree with the first. Prose lives in the generator keyed by
section id; code is sliced out of the module between @doc-section markers
and interleaved beneath it, so each fragment keeps the explanation that
makes it reviewable. --check gates CI, matching build-doc-card-builder."
```

---

### Task 5: End-to-end verification against a real source

**This task is a gate, not a feature.** Unit tests prove the functions behave; they cannot prove Style Dictionary consumes them. Everything before this is unproven until this passes, and Task 6's tier promotion is conditional on it.

**Files:**
- Create: nothing in the repo. All work happens in a scratch directory.
- Create: `docs/superpowers/notes/2026-08-21-native-config-e2e-results.md` (the recorded result)

**Interfaces:**
- Consumes: `registerNativeTransforms`, `nativePlatform`, `nativeSources` from `scripts/lib/sd-native.mjs`; `scripts/validate-token-output.mjs`; `scripts/lib/dtcg.mjs`.
- Produces: a pass/fail verdict that gates Task 6.

**Constraint reminder:** `~/Dev/zygarden-frontend` must never be checked out or modified. Read every file with `git show feature/apply-brandguide-styles:<path>`.

- [ ] **Step 1: Set up the scratch harness**

```bash
SCRATCH=/private/tmp/claude-501/-Users-jordansstudio-Dev-throughline/b59cc929-88f6-466d-9d33-dc0a62ed86d8/scratchpad/e2e
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH/tokens" "$SCRATCH/scripts/lib"
cd "$SCRATCH"
npm init -y >/dev/null
npm i style-dictionary@4 >/dev/null 2>&1
node -p "JSON.parse(require('fs').readFileSync('node_modules/style-dictionary/package.json','utf8')).version"
```

Expected: prints `4.4.0` or later.

- [ ] **Step 2: Copy the module in exactly as a consumer would**

```bash
THROUGHLINE=/Users/jordansstudio/Dev/throughline
cp "$THROUGHLINE/scripts/lib/sd-native.mjs" "$SCRATCH/scripts/lib/"
cp "$THROUGHLINE/scripts/lib/dtcg.mjs" "$SCRATCH/scripts/lib/"
cp "$THROUGHLINE/scripts/validate-token-output.mjs" "$SCRATCH/scripts/"
ls -1 "$SCRATCH/scripts" "$SCRATCH/scripts/lib"
```

Expected: `validate-token-output.mjs`, `dtcg.mjs`, `sd-native.mjs`. Copying rather than symlinking is deliberate — it proves the install list in Task 6 is complete.

- [ ] **Step 3: Extract the zygarden token source read-only**

```bash
ZY=~/Dev/zygarden-frontend
BR=feature/apply-brandguide-styles
git -C "$ZY" ls-tree -r --name-only "$BR" -- libs/shared/util-tokens | grep '\.json$'
```

Then, for each path printed, write it into `$SCRATCH/tokens/` preserving only the basename:

```bash
for p in $(git -C "$ZY" ls-tree -r --name-only "$BR" -- libs/shared/util-tokens | grep '\.json$'); do
  git -C "$ZY" show "$BR:$p" > "$SCRATCH/tokens/$(basename "$p")"
done
ls -1 "$SCRATCH/tokens" | wc -l
```

Expected: 15 files. `git -C` never changes the working directory of that repo; nothing is checked out.

- [ ] **Step 4: Determine the per-mode source split**

```bash
cd "$SCRATCH"
grep -l -i 'dark' tokens/*.json
grep -l -i 'light' tokens/*.json
```

Use the result to build two explicit lists: every file that is mode-neutral (primitives), plus the one light file for the light build, plus the one dark file for the dark build. If a file's role is ambiguous, inspect its top-level keys with `node -p "Object.keys(require('./tokens/<name>.json'))"` rather than guessing from the filename.

- [ ] **Step 5: Write the build script**

Create `$SCRATCH/build.mjs`:

```js
import StyleDictionary from 'style-dictionary';
import { registerNativeTransforms, nativePlatform, nativeSources } from './scripts/lib/sd-native.mjs';

registerNativeTransforms(StyleDictionary);

// Replace these two lists with the split determined in Step 4.
const MODES = {
  light: ['tokens/<neutral...>.json', 'tokens/<light>.json'],
  dark: ['tokens/<neutral...>.json', 'tokens/<dark>.json'],
};

const TARGETS = {
  'ios-swift': (mode) => nativePlatform({ platform: 'ios-swift', buildPath: `out/${mode}/ios/` }),
  'android-kotlin': (mode) =>
    nativePlatform({
      platform: 'android-kotlin',
      buildPath: `out/${mode}/android/`,
      packageName: 'com.zygarden.tokens',
    }),
};

for (const [mode, sources] of Object.entries(MODES)) {
  for (const [name, make] of Object.entries(TARGETS)) {
    const sd = new StyleDictionary({
      source: nativeSources(sources),
      preprocessors: ['dtcg/resolve-dual-node'],
      platforms: { [name]: make(mode) },
    });
    await sd.buildAllPlatforms();
    console.log(`built ${name} / ${mode}`);
  }
}
```

- [ ] **Step 6: Build**

```bash
cd "$SCRATCH" && node build.mjs
```

Expected: four `built ...` lines, no throw. **If `nativeSources` throws a mode-collision error, that is the guard working** — go back to Step 4 and fix the per-mode split; do not weaken the guard.

- [ ] **Step 7: Validate all four outputs**

One invocation per output. Build the `--source` flags with a bash **array** — a
bare `$SRC` string collapses into a single argument, and the validator correctly
rejects it with exit `2`:

```bash
cd "$SCRATCH"

run() {                     # run <platform> <outfile> <source...>
  local platform=$1 out=$2; shift 2
  local args=(); for f in "$@"; do args+=(--source "$f"); done
  node scripts/validate-token-output.mjs "${args[@]}" --output "$out" --platform "$platform"
  echo "exit=$?"
}

# Substitute the per-mode lists determined in Step 4.
LIGHT=(tokens/<neutral...>.json tokens/<light>.json)
DARK=(tokens/<neutral...>.json tokens/<dark>.json)

run ios-swift      out/light/ios/Tokens.swift  "${LIGHT[@]}"
run ios-swift      out/dark/ios/Tokens.swift   "${DARK[@]}"
run android-kotlin out/light/android/Tokens.kt "${LIGHT[@]}"
run android-kotlin out/dark/android/Tokens.kt  "${DARK[@]}"
```

Each `--source` list must be the same one that output's build used. Validating a
light build against the dark source list produces meaningless failures.

- [ ] **Step 8: Judge the result against the bar**

| Target | Bar |
|---|---|
| `ios-swift`, light | 196/196 matched, 0 rule failures, exit 0 |
| `ios-swift`, dark | 196/196 matched, 0 rule failures, exit 0 |
| `android-kotlin`, light | 0 rule failures, exit 0, match rate consistent with iOS |
| `android-kotlin`, dark | 0 rule failures, exit 0, match rate consistent with iOS |

**If iOS does not reproduce 196/196 with zero rule failures, stop.** The module is wrong; report the discrepancy and do not proceed to Task 6. A divergence between the two platforms on the same source is itself a finding worth reporting.

- [ ] **Step 9: Spot-check the two bugs this exists to prevent**

```bash
cd "$SCRATCH"
grep -n 'textSm\b' out/light/ios/Tokens.swift | head -3
grep -n 'color-mix' out/light/ios/Tokens.swift | wc -l
grep -n '\.sp\b' out/light/android/Tokens.kt | head -3
```

Expected: the Swift dimension is its authored px magnitude, **not** ×16 (a `14px` token emits `CGFloat(14.00)`, never `CGFloat(224.00)`); zero `color-mix` occurrences; and if the source has any `fontSize`-typed token, it emits `.sp` rather than `.dp`. If the source has no `fontSize` tokens, record that the `sp` path was not exercised rather than claiming it was.

- [ ] **Step 10: Record the result**

Create `docs/superpowers/notes/2026-08-21-native-config-e2e-results.md` containing: the Style Dictionary version, the number of source files and the per-mode split used, the four validator reports verbatim, the spot-check output from Step 9, and an explicit note of anything the run did **not** exercise.

- [ ] **Step 11: Commit**

```bash
cd /Users/jordansstudio/Dev/throughline
git add docs/superpowers/notes/2026-08-21-native-config-e2e-results.md
git commit -m "test: record end-to-end verification of the native config module

Four builds (ios-swift and android-kotlin, light and dark) from zygarden's
real DTCG source through style-dictionary 4.4.0, validated with
tokens:validate-output. Unit tests prove the functions behave; only this
proves Style Dictionary consumes them."
```

---

### Task 6: Wire the skill, the docs, and the tier promotion

**Do not start this task until Task 5 has passed.** The tier promotion asserts a verified capability; making that claim without the evidence is the exact overclaim that caused the demotion.

**Files:**
- Modify: `skills/token-sync-layer/SKILL.md:49-53` (curated list), Step 3 (~`:138-178`), Step 4 install block (~`:186-196`)
- Modify: `references/sync-adapters.md:29` (count), `:32-37` (Tier 1 table), `:39-45` (rationale), `:47-54` (demotion paragraph)
- Modify: `README.md:208`
- Modify: `scripts/README.md` (script table + install paragraph)

**Interfaces:**
- Consumes: `registerNativeTransforms`, `nativePlatform`, `nativeSources` from `scripts/lib/sd-native.mjs`; the Task 5 verdict.
- Produces: no code. Documentation and skill instructions only.

- [ ] **Step 1: Add the `ios-swift` row to the Tier 1 table**

In `references/sync-adapters.md`, change line 29 from `Four built-in adapters ship` to `Five built-in adapters ship`, and append this row to the table that ends at line 37:

```
| `ios-swift` | Swift enum constants (`Tokens.swift`) | one build per mode, one output directory per mode | flattened | `Tokens.textSm` |
```

The `Modes via` column must say what the module implements. Do **not** write "asset-catalog light/dark variants" — asset catalogs are unimplemented and unvalidated (#38), and re-documenting them is the overclaim that caused the demotion.

- [ ] **Step 2: Rewrite the selection rationale**

Replace lines 39-45 (the paragraph beginning `These four were chosen`) with:

```markdown
Four of the five cover this plugin's web-first, design-led audience: three React
framework adapters (shadcn — the dominant new-project choice; standalone
Tailwind — for the large Tailwind-without-shadcn population; MUI — the
enterprise/Material standard), plus the universal `vanilla-css` escape hatch
(plain CSS custom properties, no framework). `ios-swift` is the one native
member, and it is curated because its configuration ships as tested code rather
than as advice — see `${CLAUDE_PLUGIN_ROOT}/references/native-adapter-config.md`.
Everything else — Ant Design, Chakra, HeroUI, Android/Kotlin, Flutter, React
Native, etc. — is fully supported via Tier 2.
```

Note the removal of `iOS/Swift` from that trailing list, and that `Android/Kotlin` stays in it.

- [ ] **Step 3: Replace the demotion paragraph**

Replace lines 47-54 (the paragraph beginning `**`ios-swift` was curated and is not any more.**`) with:

```markdown
**`ios-swift` was demoted, and has been restored.** Run against a real DTCG
source under the *stock* transform group it emitted px-authored dimensions at
×16 their authored value (valid, compiling Swift), leaked `color-mix()`
expressions, and left dual-node aliases as bare `px` literals. The tier badge
claimed a confidence the stock configuration had not earned, so it came off.

The cause was the transform group, not the adapter concept. That configuration
now ships as tested code at
`${CLAUDE_PLUGIN_ROOT}/scripts/lib/sd-native.mjs`, is installed into the
consumer's repo, and is verified end to end against a real source. The badge is
back on that basis.

`android-kotlin` uses the same module and stays Tier 2: its remaining unknowns
are on the consumption side — Compose `dp`/`sp` behaviour against a real Compose
app, resource-qualifier conventions, package layout — which building tokens does
not exercise. `tokens:validate-output` remains what decides whether any adapter
can be trusted, and re-promotion is available to any adapter that passes it
against a real source.
```

- [ ] **Step 4: Add `ios-swift` to the skill's curated list**

In `skills/token-sync-layer/SKILL.md`, change the two bullets at lines 49-53 to:

```markdown
- **Curated (Tier 1):** `shadcn`, `tailwind`, `mui`, `vanilla-css`, `ios-swift`.
  Vetted presets — high confidence.
- **Generated (Tier 2):** any other framework (Ant Design, Chakra, HeroUI,
  Android/Kotlin, Flutter, etc.). The skill generates an adapter and
  verifies it against a real component before trusting it.
```

- [ ] **Step 5: Replace Step 3's transcribe instruction with the call**

In `skills/token-sync-layer/SKILL.md`, replace the paragraph beginning `**Native targets need the configuration in` and the one beginning `**Native targets build once per mode, and are validated.**` with:

````markdown
**Native targets import the shipped configuration; they do not transcribe it.**
Copy `${CLAUDE_PLUGIN_ROOT}/scripts/lib/sd-native.mjs` into
`packages/tokens/scripts/lib/` (see Step 4) and call it. The stock `ios-swift`
and `compose` transform groups emit every `px`-authored dimension at ×16 its
value — valid, compiling, silently wrong — and mishandle `color-mix()` and
dual-node DTCG the same way. Never build a native platform from a stock
`transformGroup`.

```js
import StyleDictionary from 'style-dictionary';
import { registerNativeTransforms, nativePlatform, nativeSources }
  from './scripts/lib/sd-native.mjs';

registerNativeTransforms(StyleDictionary);

for (const mode of MODES) {                     // e.g. ['light', 'dark']
  const sd = new StyleDictionary({
    source: nativeSources(sourcesFor(mode)),    // guards against a mode collapse
    preprocessors: ['dtcg/resolve-dual-node'],
    platforms: {
      ios: nativePlatform({ platform: 'ios-swift', buildPath: `ios/${mode}/` }),
      // android also requires packageName:
      // android: nativePlatform({ platform: 'android-kotlin',
      //   buildPath: `android/${mode}/`, packageName: 'com.example.tokens' }),
    },
  });
  await sd.buildAllPlatforms();
}
```

**One build per mode combination, and never a glob.** Style Dictionary dedupes
by dot-path, so a single build over the whole token directory collapses light
and dark into whichever file sorted last, silently dropping a mode. Passing each
mode's sources through `nativeSources` turns that into a thrown error naming the
colliding paths. Then run `tokens:validate-output` against each generated file
with that same source list. See
`${CLAUDE_PLUGIN_ROOT}/references/native-adapter-config.md`.
````

- [ ] **Step 6: Add the module to the install list**

In `skills/token-sync-layer/SKILL.md` Step 4, change the `**Install the output validator.**` paragraph so it names all three files as one set:

```markdown
**Install the native token toolkit — all three files, as a set.** Copy
`${CLAUDE_PLUGIN_ROOT}/scripts/validate-token-output.mjs` into
`packages/tokens/scripts/`, and both
`${CLAUDE_PLUGIN_ROOT}/scripts/lib/dtcg.mjs` and
`${CLAUDE_PLUGIN_ROOT}/scripts/lib/sd-native.mjs` into
`packages/tokens/scripts/lib/`. `sd-native.mjs` imports `dtcg.mjs` and the
validator imports it too, so copying any of them without the others breaks at
import. Then register the gate so it stays live on every future sync:
```

- [ ] **Step 7: Correct the README's Tier 2 claim**

In `README.md`, on line 208, replace `Native targets (iOS/Swift, Android/Kotlin) currently generate through the Tier 2 protocol and are **validated per build, not assumed**` with:

```
Native targets are **validated per build, not assumed** — iOS/Swift is a curated adapter whose Style Dictionary configuration ships as tested code, and Android/Kotlin uses the same configuration through the Tier 2 protocol
```

Leave the rest of that bullet unchanged.

- [ ] **Step 8: Update `scripts/README.md`**

Add a row to the script table, immediately after the `lib/dtcg.mjs` row:

```
| `lib/sd-native.mjs` | The Style Dictionary native configuration as code: unit-aware dimension transforms, `color-mix` computation, dual-node preprocessing, platform assembly, and a per-mode source guard. Style Dictionary is a parameter, never an import. | copied alongside `validate-token-output.mjs` |
```

Then update the `token-sync-layer` sentence in the "How the skill installs these" section to:

```markdown
`token-sync-layer` copies `validate-token-output.mjs`, `lib/dtcg.mjs`, **and**
`lib/sd-native.mjs`, and wires `"tokens:validate-output"`. All three travel
together: `sd-native.mjs` and the validator both import `lib/dtcg.mjs`, so
installing any one of them alone breaks at import time.
```

- [ ] **Step 9: Verify no stale claim survives**

```bash
cd /Users/jordansstudio/Dev/throughline
grep -rn "Four built-in\|curated four\|is not any more" references/ skills/ README.md
grep -rn "iOS/Swift" references/sync-adapters.md skills/token-sync-layer/SKILL.md
```

Expected: the first command prints nothing. The second must not show iOS/Swift listed under any Tier 2 enumeration.

- [ ] **Step 10: Run every gate**

```bash
node --test
node ci/validate-plugin.mjs
node ci/validate-skills.mjs
node scripts/adapters/generate.mjs --check
node scripts/build-doc-card-builder.mjs --check
node scripts/build-native-adapter-config.mjs --check
```

Expected: all six pass. If `scripts/adapters/generate.mjs --check` fails, the skill edits changed generated adapter output — run `node scripts/adapters/generate.mjs` and include the regenerated files in the commit.

- [ ] **Step 11: Commit**

```bash
git add skills/token-sync-layer/SKILL.md references/sync-adapters.md README.md scripts/README.md adapters/
git commit -m "docs: import the native config instead of transcribing it; restore ios-swift to Tier 1

Step 3 of token-sync-layer now shows the import-and-call loop rather than
pointing at 80 lines of prose to copy, and Step 4 installs all three
files as one set — sd-native.mjs and the validator both import dtcg.mjs,
so any subset breaks at import.

ios-swift returns to Tier 1 on the strength of the end-to-end run: its
configuration now ships as tested code. The restored row states the
per-mode build the module implements, not the asset-catalog mechanism the
pre-demotion row claimed and that is still unimplemented. android-kotlin
uses the same module and stays Tier 2."
```

---

## Self-Review

**Spec coverage.** Decision 1 → Tasks 2, 3. Decision 2 → Task 3 Step 3 (`StyleDictionary` as parameter). Decision 3 → the pure/side-effecting split across Tasks 2 and 3. Decision 4 → Task 1 (the move) plus Task 3 (`nativeSources`). Decision 5 → Task 4. Decision 6 → Task 5. Decision 7 → Task 6 Steps 1-4, 7. Decision 8 → Task 3's `PLATFORMS['android-kotlin']` and the `packageName` throw. Decision 9 → Task 3's transform lists and the four registered transforms. Every Files entry in the spec maps to a task step.

**Type consistency.** `nativeSources(paths: string[]) → string[]`, `nativePlatform({ platform, buildPath, className, packageName }) → object`, `magnitude(authored) → number|null`, `colorMixToHex8(value) → string|null`, `preprocess(dict) → object`, `findModeCollisions(sources: {file,dtcg}[]) → {path,defs}[]`, `sliceSections(source: string) → Map<string,string>`, `render(sections: Map) → string`. Transform names are identical in Task 3's tests, Task 3's implementation, and Task 6's documentation: `value/color-mix-to-hex8`, `size/unit-aware/swift`, `size/unit-aware/compose-dp`, `size/unit-aware/compose-sp`, preprocessor `dtcg/resolve-dual-node`.

**Known soft spot.** Task 5 Steps 4 and 5 cannot name zygarden's per-mode file split, because it depends on the contents of a repo this plan must not check out. Step 4 gives the commands that determine it and an explicit fallback (inspect top-level keys rather than guess from filenames), and Step 6 states that a thrown collision means fix the split rather than weaken the guard. That is a decision the executor makes from observed data, not a placeholder.
