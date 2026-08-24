# Native adapter configuration (GENERATED)

> **GENERATED FILE — do not edit by hand.** Source: `scripts/lib/sd-native.mjs`,
> which is unit-tested in Node and installed into the consumer's repo.
> Regenerate with `node scripts/build-native-adapter-config.mjs`; CI gates
> freshness with `--check`.

The Style Dictionary configuration a native adapter (`ios-swift`,
`android-kotlin`, or any generated native target) needs in order to emit
**correct** output from a real DTCG token source.

**Why this exists.** The stock `ios-swift` and `compose` transform groups
produce output that compiles and is wrong. Run against a real source, the stock
configuration emitted every `px`-authored dimension at ×16 its authored value,
leaked `color-mix()` expressions into Swift, and left dual-node aliases as bare
`px` literals — all at exit `0`. None of that is a Style Dictionary limitation.
All of it is configuration.

**You do not need to copy any of this.** It ships as
`${CLAUDE_PLUGIN_ROOT}/scripts/lib/sd-native.mjs`. Install it beside
`lib/dtcg.mjs` and `lib/native-literal.mjs` and call it:

```js
import StyleDictionary from 'style-dictionary';
import { registerNativeTransforms, nativePlatform, nativeSources }
  from './scripts/lib/sd-native.mjs';

registerNativeTransforms(StyleDictionary);

for (const mode of ['light', 'dark']) {
  const sd = new StyleDictionary({
    source: nativeSources(sourcesFor(mode)),
    preprocessors: ['dtcg/resolve-dual-node'],
    platforms: {
      ios: nativePlatform({ platform: 'ios-swift', buildPath: `out/${mode}/` }),
    },
  });
  await sd.buildAllPlatforms();
}
```

The sections below are the module's own source, inlined so the configuration
stays reviewable. Pair this with `${CLAUDE_PLUGIN_ROOT}/references/sync-adapters.md`,
which covers the adapter contract itself.

## Imports

`node:fs` plus the siblings `lib/dtcg.mjs` and `lib/native-literal.mjs` this
plugin already installs — nothing else. Style Dictionary is passed in as a
parameter, never imported, which is what keeps this module installable into a
consumer's repo.

```js
import { readFileSync } from 'node:fs';
import { flattenDtcg, resolveValue, findModeCollisions } from './dtcg.mjs';
import { isValidLiteral, GRAMMAR, CSS_CONSTRUCT } from './native-literal.mjs';
```

## 1. Read the authored unit

**This replaces `size/swift/remToCGFloat` and the `size/compose/*` transforms,
and it is the single most important piece.** Those assume every dimension is
authored in `rem` and multiply by 16. Against a `px`-authored source that
silently produces output at sixteen times scale which compiles and ships.

```js
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
```

## 2. Compute `color-mix()` to a literal

A CSS expression has no native equivalent, and Style Dictionary does no colour
math. Native adapters resolve to literals; for a `color-mix` that means
actually computing the blend. Register this **before** the platform's colour
transform, so the colour transform receives a valid hex8 rather than a CSS
function.

```js
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
```

## 3. Resolve aliases and hoist dual-node children

Style Dictionary's resolver will not traverse into a node that carries both a
`$value` and children, and its collector stops there too. The dual-node pattern
is invalid DTCG — the Design Tokens Format Module's 30 July 2026 draft, §6.1,
requires tools to report it as an error, and §6.2's `$root` is the sanctioned
way to pair a value with children. Figma-derived sources emit it anyway:
`text.sm` holds `$value: "14px"` *and* a `text.sm.lineHeight` child. So every
alias to such a child fails to resolve, and the child is never emitted at all.

Both are fixed before Style Dictionary sees the tree.

```js
// Resolve aliases and hoist dual-node children, before Style Dictionary sees
// the tree.
//
// Two distinct SD limitations, both caused by a node carrying BOTH a $value and
// children — invalid DTCG: the Format Module's 30 July 2026 draft, §6.1,
// requires tools to report this as an error; §6.2's $root is the sanctioned
// way to pair a value with children. Common in Figma-derived sources anyway,
// where text.sm holds $value "14px" plus a text.sm.lineHeight child:
//
//   1. The resolver will not traverse into such a node, so every alias to the
//      child fails to resolve and emits as a bare literal.
//   2. The collector also stops there, so the child is never emitted at all.
//
// Resolving here also handles references embedded inside an expression, which
// SD's whole-value matcher misses. Pre-resolving costs nothing on native
// targets: they set outputReferences: false, so references flatten regardless.
//
// Marks a node whose AUTHORED $value was a whole-value reference, so the hoist
// can decline to override the type DTCG 5.2.2 rule 1 already determined from the
// referent. A WeakSet keyed on the node object, rather than a property written
// onto it, holds structural idempotency exactly: structuredClone drops the
// membership along with the rest of the identity, so preprocess(preprocess(x))
// is deepEqual to preprocess(x) with no leak question to manage.
const WAS_REF = new WeakSet();
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
        WAS_REF.add(val);
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
//
// Collisions are COLLECTED, not thrown here: the walk has to continue to report
// every one, and the recursion is depth-first, so throwing from a frame would
// report one subtree. preprocess throws once, after the whole tree is walked.
//
// On collision the assignment is SKIPPED. Continuing to overwrite while
// collecting means later detections are computed against a tree already
// corrupted — the enclosing loop's Object.entries snapshot still holds the
// detached node, and its own children then hoist out of a subtree no longer
// reachable.
//
// hoisted in node walks the prototype chain, so a camel-joined name matching
// an inherited Object.prototype member (toString, valueOf, ...) reported a
// collision against a sibling that does not exist. Object.hasOwn checks the
// tree's own keys only.
function hoistDualNodes(node, collisions, prefix = []) {
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$') || !val || typeof val !== 'object') continue;
    hoistDualNodes(val, collisions, [...prefix, key]);
    if ('$value' in val) {
      for (const [childKey, childVal] of Object.entries(val)) {
        if (childKey.startsWith('$') || !childVal || typeof childVal !== 'object') continue;
        const hoisted = key + childKey[0].toUpperCase() + childKey.slice(1);
        if (Object.hasOwn(node, hoisted)) {
          const existingNode = node[hoisted];
          const isGroup = existingNode !== null && typeof existingNode === 'object' && !('$value' in existingNode);
          collisions.push({
            from: [...prefix, key, childKey].join('.'),
            onto: [...prefix, hoisted].join('.'),
            isGroup,
            existing: isGroup
              ? undefined
              : existingNode && typeof existingNode === 'object'
                ? existingNode.$value
                : existingNode,
          });
          continue;
        }
        // The dual node is the child's closest $type-bearing ancestor as
        // authored; after the hoist it is a sibling, so the type is lost unless
        // it travels. Excluded for a reference-valued child — DTCG 5.2.2 gives
        // it the referent's type, which outranks inheritance.
        if (!('$type' in childVal) && '$type' in val && !WAS_REF.has(childVal)) {
          childVal.$type = val.$type;
        }
        node[hoisted] = childVal;
        delete val[childKey];
      }
    }
  }
  return node;
}

export function preprocess(dict) {
  const collisions = [];
  const out = hoistDualNodes(
    resolveInPlace(structuredClone(dict), flattenDtcg(dict)),
    collisions,
  );
  if (collisions.length) {
    const shown = collisions
      .slice(0, 5)
      .map((c) => `  ${c.from} -> ${c.onto}` + (c.isGroup ? ' (a group)' : ` (would overwrite ${JSON.stringify(c.existing)})`))
      .join('\n');
    const more = collisions.length > 5 ? `\n  ...and ${collisions.length - 5} more` : '';
    throw new Error(
      `${collisions.length} hoisted token name(s) collide with an existing sibling.\n` +
        "A dual node's child is renamed to a camel-joined sibling, and that name is taken.\n" +
        'Hoisting would silently discard one of the two. Rename the child or the sibling.\n' +
        `${shown}${more}`,
    );
  }
  return out;
}
```

## 4. Assemble the platform from the stock list

Build the transform list from Style Dictionary's **stock group**, replacing only
the rem-assuming size transforms. A hand-picked list silently drops whatever it
forgets — three real defects arose exactly that way.

**Two Android-only unit limitations remain, and are not fixed here.** Style
Dictionary's Compose transforms select on `$type`, and DTCG's type set does not
line up with what they expect:

- **Font sizes emit as `dp`, not `sp`.** DTCG has no `fontSize` type — it types
  font sizes as `dimension` — while `size/unit-aware/compose-sp` filters on
  `$type === "fontSize"`. On spec-compliant input it never fires and every font
  size falls through to `dp`, which does not respect the user's font-scale
  accessibility setting. Measured on a real 322-token source: zero `.sp` in the
  Kotlin output.
- **A unitless ratio emits as `dp`.** `leading.normal: "1.5"`, typed
  `dimension`, emits `1.50.dp`. The magnitude is faithful; the unit is
  semantically wrong.

Both are Android-only. `size/unit-aware/swift` filters `dimension || fontSize`,
so iOS handles dimension-typed font sizes correctly, and `CGFloat(1.50)` carries
no unit to be wrong about. `tokens:validate-output` passes in both cases: it
checks magnitude, not unit.

```js
// Build each platform's transform list from Style Dictionary's STOCK group,
// replacing only the rem-assuming size transforms and inserting the color-mix
// computation ahead of the colour transform. A hand-picked list silently drops
// whatever it forgets; three real defects arose that way, including Compose
// font sizes rendered in dp instead of sp.
//
// That last one is only half fixed, and the half that remains is load-bearing:
// the sp transform below gates on $type === 'fontSize', but DTCG has no
// fontSize type — it types font sizes as dimension — so on a spec-compliant
// source the sp branch never fires and Android font sizes still emit as dp.
// Android-only; size/unit-aware/swift filters dimension || fontSize and is
// correct. Same class as a unitless ratio (leading.normal: "1.5") emitting as
// 1.50.dp. Both are measured, not theoretical — see
// docs/superpowers/notes/2026-08-21-native-config-e2e-results.md.
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
      'value/swift-string-literal',
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
      'value/kotlin-string-literal',
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

// A CSS function has no native form. Quoting it would produce a string that
// compiles and means nothing — the exact failure class this module exists to
// prevent, and worse than the bare value, which at least fails to compile.
// Leave it bare so the filter drops it.
//
// No \s* before the paren: CSS function notation forbids whitespace between
// the name and the open paren, and a real font family can legitimately
// contain one — "Helvetica (Regular)". Requiring the paren immediately after
// the identifier is what tells that apart from linear-gradient(, calc(,
// var(, and color-mix(.
const CSS_FUNCTION = /^[A-Za-z][A-Za-z0-9-]*\(/;

// Did the transforms leave a value with no native form at all?
//
// A different question from nativeFilter's, which is about the AUTHORED
// value. This reads the TRANSFORMED $value. A value that already parses as a
// literal passes outright. A value that does not is dropped only if it is
// ALSO shaped like a CSS function call — a linear-gradient, say, which has no
// native rendering whatsoever. Everything else invalid but not function-shaped
// stays and fails loudly at compile time: duration ("200ms"), cubicBezier
// ("0.5,0,1,1"), and, on Kotlin, content and asset, which have no stock
// quoting transform there. Silently dropping those would hide a forgotten
// $type behind a shorter output file instead of a build failure.
//
// A CSS_CONSTRUCT match is exempt from the drop even though it fails
// isValidLiteral: calc(...) and var(...) are unrescued but valid identifiers,
// and an unrescued color-mix(...) variant is a rescue this module's own
// color-mix transform simply did not match — none of those are "no native
// form", they are unimplemented rescues. Dropping them here would make
// no-foreign-syntax in validate-token-output.mjs unreachable, so they are
// kept and left to fail loudly there instead.
export function hasNativeForm(token, platform) {
  const grammar = GRAMMAR[platform];
  if (!grammar) {
    throw new Error(`unknown native platform "${platform}" (expected ${Object.keys(GRAMMAR).join(' or ')})`);
  }
  const v = String(token.$value).trim();
  return isValidLiteral(v, grammar) || CSS_CONSTRUCT.test(v) || !CSS_FUNCTION.test(v);
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
    // Carried here, not left to the caller: authored() reads the ORIGINAL
    // $value, so without this preprocessor every aliased dimension still holds
    // an unresolved {spacing.space.4}, no size transform fires, and the build
    // emits bare px literals. preprocess is idempotent, so a project that also
    // declares it at top level is harmless.
    preprocessors: ['dtcg/resolve-dual-node'],
    buildPath,
    options: { outputReferences: false },
    files: [
      {
        destination: preset.destination,
        format: preset.format,
        options: fileOptions,
        filter: (token) => nativeFilter(token) && hasNativeForm(token, platform),
      },
    ],
  };
}
```

## 5. Guard the per-mode source list

Style Dictionary deduplicates by dot-path, so one build over both a light and a
dark definition of the same token keeps whichever file sorts last and drops the
other mode with no diagnostic. Pass every build's sources through
`nativeSources`, which returns them, so the check cannot be skipped by
forgetting it.

```js
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
//
// An unexpanded glob is the failure that actually lands here, and a raw ENOENT
// on the literal string "tokens/*.json" reads as a crash rather than a
// diagnosis. Name the path and what was expected.
const EXPECTED = 'nativeSources takes explicit file paths for ONE mode — never a glob, never a directory.';

function readTokenFile(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`cannot read token source "${file}": ${err.message}\n${EXPECTED}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`token source "${file}" is not valid JSON: ${err.message}\n${EXPECTED}`);
  }
}

export function nativeSources(paths) {
  const parsed = paths.map((file) => ({ file, dtcg: readTokenFile(file) }));
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
```

## 6. Register with Style Dictionary

One call. Style Dictionary is a parameter, never an import, which is what lets
this module install into a consumer's `packages/tokens/scripts/lib/`.

```js
// Register everything with a Style Dictionary instance. SD is a parameter, not
// an import, so this module stays zero-dependency and installable.
const authored = (token) => magnitude(token.original?.$value ?? token.$value);
const isDimension = (token) => token.$type === 'dimension';
const isFontSize = (token) => token.$type === 'fontSize';
const hasMagnitude = (token) => authored(token) !== null;

// Quote string-valued tokens no stock transform covers.
//
// Style Dictionary quotes by $type: content/swift/literal and
// asset/swift/literal handle $type content and asset. A $type: fontFamily token
// matches neither and emits bare — `public static let f = Nunito Sans`, which
// is not Swift. There is no stock transform for it.
const QUOTED_TYPES = new Set(['fontFamily', 'string']);

// A DTCG fontFamily may be a list; join it into one native string.
function stringValue(token) {
  const v = Array.isArray(token.$value) ? token.$value.join(', ') : token.$value;
  return typeof v === 'string' ? v : null;
}

// DTCG permits fontWeight as a keyword ("bold") as well as a number. The
// keyword form emits as a bare identifier and hits the identical failure;
// "400" already emits as a valid native integer and must stay untouched.
function isQuotable(token) {
  const v = stringValue(token);
  if (v === null) return false;
  if (CSS_FUNCTION.test(v)) return false;
  if (QUOTED_TYPES.has(token.$type)) return true;
  return token.$type === 'fontWeight' && Number.isNaN(Number(v.trim()));
}

const escapeCommon = (s) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');

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

  // Two transforms rather than one platform-sniffing transform, because the
  // escaping genuinely differs: "$foo" is template interpolation in Kotlin, so
  // a literal $ must be escaped there and must NOT be in Swift, where \$ is not
  // a valid escape at all.
  StyleDictionary.registerTransform({
    name: 'value/swift-string-literal',
    type: 'value',
    transitive: true,
    filter: isQuotable,
    transform: (token) => `"${escapeCommon(stringValue(token))}"`,
  });

  StyleDictionary.registerTransform({
    name: 'value/kotlin-string-literal',
    type: 'value',
    transitive: true,
    filter: isQuotable,
    transform: (token) => `"${escapeCommon(stringValue(token)).replace(/\$/g, '\\$')}"`,
  });
}
```

## Verify, always

Configuration this specific is exactly what regresses unnoticed, because every
failure mode above produces output that compiles. Run `tokens:validate-output`
against each generated file with the same source list that file's build used,
and treat it as a gate rather than a spot check:

```
node scripts/validate-token-output.mjs \
  --source tokens/color-primitives.json --source tokens/text-primitives.json \
  --output out/light/Tokens.swift --platform ios-swift --min-match 1
```

A clean run reports 100% of emitted symbols matched with zero rule failures.
Anything less means the configuration drifted — so **pass `--min-match 1`**.
The flag's default is `0.5`, which is a floor against wholly unparseable output
rather than the gate this doc describes; without it a 60% match rate exits `0`.
See `${CLAUDE_PLUGIN_ROOT}/scripts/README.md`.

"Matched" means an emitted symbol's name resolved to a source token. Numeric
magnitudes are additionally compared; colour and string values are matched by
name only, and no rule checks that the output compiles.
