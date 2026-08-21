# Native adapter configuration

The Style Dictionary configuration a native adapter (`ios-swift`, `android-kotlin`,
or any generated native target) needs in order to emit **correct** output from a
real DTCG token source.

**Why this file exists.** The stock `ios-swift` and `compose` transform groups
produce output that compiles and is wrong. Run against a real source, the stock
configuration emitted every `px`-authored dimension at ×16 its authored value,
leaked `color-mix()` expressions into Swift, and left dual-node aliases as bare
`px` literals — all at exit `0`. None of that is a Style Dictionary limitation.
All of it is configuration, and the four pieces below fix it.

Verified: with this configuration, `tokens:validate-output` reports **196/196
emitted symbols matched, zero rule failures**, on both the light and dark builds
of a real 322-token DTCG source. The same source under the stock configuration
produced roughly half-wrong output.

Pair this with `${CLAUDE_PLUGIN_ROOT}/references/sync-adapters.md`, which covers
the adapter contract itself.

## The four pieces

### 1. Preprocessor — resolve aliases, including into dual-node children

Style Dictionary's resolver will not traverse into a node that carries both a
`$value` and children. The dual-node pattern is legal DTCG and common in
Figma-derived sources: `text.sm` holds `$value: "14px"` *and* a
`text.sm.lineHeight` child. Every alias to such a child fails to resolve.

Resolve aliases yourself, before Style Dictionary sees them. This also handles
references embedded inside an expression, which SD's whole-value matcher misses.

The dual-node-aware `flattenDtcg` and `resolveValue` this needs already ship at
`${CLAUDE_PLUGIN_ROOT}/scripts/lib/dtcg.mjs` — import them rather than rewriting.

```js
import { flattenDtcg, resolveValue } from './lib/dtcg.mjs';

function interpolate(value, flat) {
  return value.replace(/\{([^}]+)\}/g, (m, ref) => {
    try { return String(resolveValue(ref, flat)); } catch { return m; }
  });
}

function resolveInPlace(node, flat, prefix = []) {
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (!val || typeof val !== 'object') continue;
    const path = [...prefix, key];
    if ('$value' in val && typeof val.$value === 'string') {
      val.$value = /^\{[^}]+\}$/.test(val.$value)
        ? resolveValue(path.join('.'), flat)
        : interpolate(val.$value, flat);
    }
    resolveInPlace(val, flat, path);
  }
  return node;
}
```

Pre-resolving costs nothing on native targets: they set
`outputReferences: false` anyway, so references flatten to literals regardless.

### 2. Preprocessor — hoist dual-node children so they get emitted

Resolving aliases fixes the *references*. The children themselves still never
become tokens, because SD's collector also stops at the first `$value` — so
`text.sm.lineHeight` is never emitted as its own constant.

Move each dual-node child to a sibling key. `text.sm.lineHeight` becomes
`text.smLineHeight`, which `name/camel` renders as `textSmLineHeight` — the
identical symbol name the un-hoisted path would have produced.

```js
function hoistDualNodes(node) {
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$') || !val || typeof val !== 'object') continue;
    hoistDualNodes(val);
    if ('$value' in val) {
      for (const [ck, cv] of Object.entries(val)) {
        if (ck.startsWith('$') || !cv || typeof cv !== 'object') continue;
        node[key + ck[0].toUpperCase() + ck.slice(1)] = cv;
        delete val[ck];
      }
    }
  }
  return node;
}

StyleDictionary.registerPreprocessor({
  name: 'dtcg/resolve-dual-node',
  preprocessor: (dict) =>
    hoistDualNodes(resolveInPlace(structuredClone(dict), flattenDtcg(dict))),
});
```

### 3. Transform — compute `color-mix()` to a literal

A CSS expression has no native equivalent, and Style Dictionary does no colour
math. `sync-adapters.md` says native adapters resolve to literals; for a
`color-mix` that means actually computing the blend. Against `transparent` in
`srgb` the result is the inner colour at the stated alpha.

```js
const MIX = /^color-mix\(in srgb,\s*(#[0-9a-fA-F]{6})\s+([\d.]+)%,\s*transparent\)$/;

StyleDictionary.registerTransform({
  name: 'value/color-mix-to-hex8', type: 'value', transitive: true,
  filter: (t) => typeof t.$value === 'string' && MIX.test(t.$value),
  transform: (t) => {
    const [, hex, pct] = t.$value.match(MIX);
    const a = Math.round((Number(pct) / 100) * 255).toString(16).padStart(2, '0');
    return `${hex}${a}`;
  },
});
```

Register it **before** the platform's colour transform, so the colour transform
receives a valid hex8 rather than a CSS function.

### 4. Transform — read the authored unit

**This replaces `size/swift/remToCGFloat` and the `size/compose/*` transforms,
and it is the single most important change here.** Those assume every dimension
is authored in `rem` and multiply by 16. Against a `px`-authored source that
silently produces output at sixteen times scale which compiles and ships.

Read the unit from `token.original.$value` and branch on it. iOS points and
Android dp both map 1:1 to CSS px by convention; a unitless dimension is a ratio
and is never scaled.

```js
function magnitude(orig) {
  const m = String(orig).trim().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]*)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (m[2] === 'px' || m[2] === '') return n;   // px 1:1; unitless ratio unscaled
  if (m[2] === 'rem') return n * 16;
  return null;                                   // % / em: no native equivalent
}

const isDim = (t) => magnitude(t.original?.$value ?? t.$value) !== null;

StyleDictionary.registerTransform({
  name: 'size/unit-aware/swift', type: 'value', transitive: true,
  filter: (t) => t.$type === 'dimension' && isDim(t),
  transform: (t) => `CGFloat(${magnitude(t.original?.$value ?? t.$value).toFixed(2)})`,
});

StyleDictionary.registerTransform({
  name: 'size/unit-aware/compose', type: 'value', transitive: true,
  filter: (t) => t.$type === 'dimension' && isDim(t),
  transform: (t) => `${magnitude(t.original?.$value ?? t.$value).toFixed(2)}.dp`,
});
```

## Assembling the platform

Build the transform list explicitly rather than using a stock `transformGroup`,
so the unit-aware transform replaces the rem-assuming one instead of running
alongside it.

```js
platforms: {
  ios: {
    transforms: [
      'attribute/cti', 'name/camel',
      'value/color-mix-to-hex8', 'color/UIColorSwift',
      'size/unit-aware/swift',
    ],
    buildPath: `out/${theme}-${viewport}/`,
    options: { outputReferences: false },
    files: [{
      destination: 'Tokens.swift',
      format: 'ios-swift/enum.swift',
      options: { className: 'Tokens' },
      filter: nativeFilter,
    }],
  },
}
```

**Filter web-only units out.** `%` and `em` are container- or parent-relative,
so there is no build-time native magnitude. Filter on the authored value, not on
`$type` — a `100%` token may be typed `string`, not `dimension`:

```js
const nativeFilter = (t) =>
  !/^-?[\d.]+(%|em)$/.test(String(t.original?.$value ?? t.$value).trim());
```

**One build per mode combination.** Style Dictionary deduplicates by dot-path,
so a light and a dark definition of the same token collapse to whichever file
sorted last — silently dropping a whole mode. Pass an explicit source list per
mode; never glob the token directory. See `sync-adapters.md`.

## Verify, always

Configuration this specific is exactly what regresses unnoticed, because every
failure mode above produces output that compiles. Run
`tokens:validate-output` against each generated file with the same `--source`
list that file's build used, and treat it as a gate rather than a spot check:

```
node scripts/validate-token-output.mjs \
  --source tokens/color-primitives.json --source tokens/text-primitives.json \
  ... \
  --output out/light-mobile/Tokens.swift --platform ios-swift
```

A clean run reports 100% of emitted symbols matched with zero rule failures.
Anything less means the configuration drifted — see
`${CLAUDE_PLUGIN_ROOT}/scripts/README.md`.
