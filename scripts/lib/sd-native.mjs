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
// @doc-section imports
import { readFileSync } from 'node:fs';
import { flattenDtcg, resolveValue, findModeCollisions } from './dtcg.mjs';
import { isValidLiteral, GRAMMAR, CSS_CONSTRUCT } from './native-literal.mjs';
// @doc-section-end imports

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
  // Which hoisted names THIS pass has already claimed, and the authored path
  // of the child that claimed each one — a collision here is a second hoist
  // landing on a name no sibling ever authored. Local to this frame: node is
  // fixed per invocation, so collisions are always within one parent's key
  // space.
  const claimedBy = new Map();
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$') || !val || typeof val !== 'object') continue;
    hoistDualNodes(val, collisions, [...prefix, key]);
    if ('$value' in val) {
      for (const [childKey, childVal] of Object.entries(val)) {
        if (childKey.startsWith('$') || !childVal || typeof childVal !== 'object') continue;
        const hoisted = key + childKey[0].toUpperCase() + childKey.slice(1);
        const from = [...prefix, key, childKey].join('.');
        if (Object.hasOwn(node, hoisted)) {
          const existingNode = node[hoisted];
          const isGroup = existingNode !== null && typeof existingNode === 'object' && !('$value' in existingNode);
          collisions.push({
            from,
            onto: [...prefix, hoisted].join('.'),
            isGroup,
            claimant: claimedBy.get(hoisted),
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
        claimedBy.set(hoisted, from);
      }
    }
  }
  return node;
}

// Which native unit a dimension belongs in: Compose's Dp, or its TextUnit.
//
// $type cannot answer this. DTCG's type set has no fontSize — font sizes are
// dimension, and so are spacing, radius and stroke widths — so the stock
// size/compose/remToSp filter on $type === 'fontSize' never fires on a
// spec-compliant source and every font size falls through to dp.
//
// The role therefore comes from the one place a DTCG source states it: the
// member names the Format Module's 30 July 2026 draft, §9.8, fixes at MUST
// level for the typography composite. Three of the five are dimension-valued,
// and Compose's TextStyle takes TextUnit for all three with no Dp overload.
//
// The limit, stated rather than hidden: §9.8 puts those names inside a
// composite token's $value object, while Figma-derived sources put them as
// sibling tokens in a group. Reading them there mirrors the spec's vocabulary;
// it is not a guarantee the spec makes. A source naming its font size
// typography.body.size sets $extensions itself and is honoured below.
const TEXT_UNIT_NAMES = new Set(['fontSize', 'letterSpacing', 'lineHeight']);

// Reverse-DNS, per DTCG's $extensions convention. Exported because the
// transforms and their tests address the same key.
export const EXT_NS = 'com.radicool.throughline';

// px and rem only. magnitude() reads a bare number as an unscaled ratio, so a
// lineHeight authored "1.5" would otherwise be stamped and emit 1.50.sp —
// which compiles and renders 1.5sp text. That trades a loud failure (a Dp
// where a TextUnit is required) for a silent one, which is the failure class
// this module exists to prevent. A ratio keeps today's behaviour and stays the
// separate defect it already is.
const ABSOLUTE_UNIT = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem)$/;

// Runs AFTER resolveInPlace and BEFORE hoistDualNodes. Both halves matter.
//
// After resolution, because the unit is not in the authored text: a semantic
// font size is authored "{text.3xl}" and carries no unit at all. Reading the
// authored string would classify only the px-authored primitives — 13 of 39
// on a real source.
//
// Before the hoist, because the hoist consumes the leaf name:
// text.xs.lineHeight becomes text.xsLineHeight, and the name this rule matches
// on is gone. Matching a suffix against the camel-joined name instead would
// couple the rule to the hoist's naming scheme, and case-insensitively it
// false-positives on names like baselineHeight.
function classifyTextUnits(node) {
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$') || !val || typeof val !== 'object') continue;
    if (
      TEXT_UNIT_NAMES.has(key) &&
      '$value' in val &&
      val.$type === 'dimension' &&
      ABSOLUTE_UNIT.test(String(val.$value).trim())
    ) {
      val.$extensions ??= {};
      val.$extensions[EXT_NS] ??= {};
      const ns = val.$extensions[EXT_NS];
      // A source that states the role itself wins. This is the override, and
      // it costs no configuration parameter: declining to overwrite IS the
      // feature. It is also what makes the pass idempotent.
      if (!('nativeUnit' in ns)) ns.nativeUnit = 'text';
    }
    classifyTextUnits(val);
  }
  return node;
}

export function preprocess(dict) {
  const collisions = [];
  const out = hoistDualNodes(
    classifyTextUnits(resolveInPlace(structuredClone(dict), flattenDtcg(dict))),
    collisions,
  );
  if (collisions.length) {
    const shown = collisions
      .slice(0, 5)
      .map((c) => {
        const line = `  ${c.from} -> ${c.onto}`;
        if (c.isGroup) {
          return line + (c.claimant ? ` (a group, already claimed by the hoist of ${c.claimant})` : ' (a group)');
        }
        return c.claimant
          ? `${line} (already claimed by the hoist of ${c.claimant}, value ${JSON.stringify(c.existing)})`
          : `${line} (would overwrite ${JSON.stringify(c.existing)})`;
      })
      .join('\n');
    const more = collisions.length > 5 ? `\n  ...and ${collisions.length - 5} more` : '';
    throw new Error(
      `${collisions.length} hoisted token name(s) collide with an existing sibling or with a name an earlier hoist already claimed.\n` +
        "A dual node's child is renamed to a camel-joined sibling, and that name may already be taken — by an authored token or group, or by another dual node's child hoisted earlier in the same pass.\n" +
        'Hoisting would silently discard one of the two. Rename the child, the sibling, or whichever colliding child should keep the name.\n' +
        `${shown}${more}`,
    );
  }
  return out;
}
// @doc-section-end preprocess

// @doc-section platform
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
// @doc-section-end sources

// @doc-section register
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
// @doc-section-end register
