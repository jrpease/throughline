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
function hoistDualNodes(node, collisions, prefix = [], groupType = undefined) {
  // The $type a plain member of THIS frame inherits, and the one a child
  // hoisted INTO it will inherit — the same value, because the hoist makes the
  // child a member of node. A node carrying a $value is a token, not a group
  // (DTCG 6.1), so it is not an inheritance source: look through it and keep
  // the chain from above. That also covers the nested case, where node is a
  // dual node and the child hoists past it on the next frame up anyway.
  const inherited = '$value' in node ? groupType : (node.$type ?? groupType);
  // Which hoisted names THIS pass has already claimed, and the authored path
  // of the child that claimed each one — a collision here is a second hoist
  // landing on a name no sibling ever authored. Local to this frame: node is
  // fixed per invocation, so collisions are always within one parent's key
  // space.
  const claimedBy = new Map();
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$') || !val || typeof val !== 'object') continue;
    hoistDualNodes(val, collisions, [...prefix, key], inherited);
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
        // The carry pays for what the hoist costs: the dual node is the
        // child's closest $type-bearing ancestor as authored, and after the
        // hoist it is a sibling, so that type is lost unless it travels.
        //
        // Two cases where nothing was lost, so nothing is carried. A
        // reference-valued child already has its referent's resolved type, and
        // DTCG 5.2.2 rule 1 ranks that above inheritance. And where an
        // enclosing GROUP supplies a type, that group was the child's
        // inheritance source all along — 5.2.2 inherits from the closest parent
        // group, and the dual node is a token — so it still is after the hoist,
        // and carrying would shadow it.
        //
        // The invariant, stated no wider than it holds: the hoist never
        // CHANGES a type DTCG inheritance already determines. Where it
        // determines none, the carry supplies the dual node's — a repair, not
        // a reading of the source. So an enclosing group wins even where its
        // type suits the child badly, because the hoist is not entitled to
        // improve on what the source says; but the carry firing at all is the
        // hoist saying something the source did not.
        if (
          !('$type' in childVal) &&
          '$type' in val &&
          !WAS_REF.has(childVal) &&
          inherited === undefined
        ) {
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
// level for the typography composite. Two of the five are dimension-valued:
// fontSize and letterSpacing. §9.8 types lineHeight as a NUMBER multiplier, so
// a source following the spec exactly emits no dimension-typed lineHeight and
// this rule never fires on one. Figma-derived sources — what this module
// targets — emit px line heights typed dimension, and those are the majority of
// the tokens the rule fixes on a real source. lineHeight is named here anyway
// because Compose's TextStyle takes TextUnit for all three, with no Dp
// overload, so a px line height must reach the sp branch to be usable at all.
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
// which compiles and renders 1.5sp text, trading a loud failure for a silent
// one. Since #52 a unitless value is declined by every size transform and
// emits bare, which is what DTCG 8.7 and 9.8 say a ratio is, so this gate is
// no longer the only thing standing between a ratio and 1.50.sp. It stays
// because the stamp is also the override's carrier, and stamping a ratio as
// text would still be a claim the source never made.
// em joins px and rem since #64: Compose's TextUnit has a real .em, so an
// em-valued letterSpacing is a text-role dimension like any other. It is still
// a unit — the gate's job is to exclude the UNITLESS value, whose role the
// source never stated.
const TEXT_ROLE_UNIT = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)$/;

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
      TEXT_ROLE_UNIT.test(String(val.$value).trim())
    ) {
      val.$extensions ??= {};
      val.$extensions[EXT_NS] ??= {};
      const ns = val.$extensions[EXT_NS];
      // A source that states the role itself wins — for a value that HAS a
      // unit. The override chooses between dp and sp; it does not manufacture
      // one, so a unitless value is declined by every size transform regardless
      // of what is stamped here (see isRatio, #52). Declining to overwrite IS
      // the feature: it costs no configuration parameter, and it is what makes
      // the pass idempotent.
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
// That last one is fixed for tokens whose role a DTCG source actually states:
// classifyTextUnits stamps fontSize, letterSpacing and lineHeight members, and
// the sp transform gates on the stamp rather than on a $type DTCG never emits.
// Two limits remain, both Android-only and both measured rather than
// theoretical — see docs/superpowers/notes/2026-08-21-native-config-e2e-results.md:
//
//   - A scale primitive carries no role. text.base: "16px" is a font size only
//     to a human, so it emits as dp. The semantic tokens referencing it are
//     correct, and those are what a consumer should reach for.
//   - An em-valued letterSpacing is filtered out of native output entirely,
//     rather than emitted as Compose's .em TextUnit.
//
// The third — a unitless ratio emitting as dp — is fixed by #52: no size
// transform claims a unitless value, so it emits bare on both platforms, and
// tokens:validate-output reports it as a unitless-dimension advisory.
//
// The lists below mirror Style Dictionary's stock groups, and nothing derives
// them at runtime — what runs stays deliberate and reviewable. But nothing is
// transcribed either: auditStockGroups checks at registration that every name
// in the live stock group is either run here or declined in writing, so a
// stock transform this config has never made a decision about is loud rather
// than silently dropped.
//
// Both groups were verified byte-identical in SD 4.4.0 and 5.5.2. The `ios`
// group was not — it renamed size/remToPt to size/remToFloat between them, and
// 5.x added seven transforms overall. The drift this guards against is real;
// it has simply not landed on the two groups we build from.
const PLATFORMS = {
  'ios-swift': {
    stockGroup: 'ios-swift',
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
    stockGroup: 'compose',
    transforms: [
      'attribute/cti',
      'name/camel',
      'value/color-mix-to-hex8',
      'color/composeColor',
      'size/unit-aware/compose-dp',
      'size/unit-aware/compose-sp',
      'size/unit-aware/compose-em',
      'value/kotlin-string-literal',
    ],
    destination: 'Tokens.kt',
    format: 'compose/object',
  },
};

// Stock transforms this config deliberately does NOT run. The reason is the
// point: an entry here is a decision on the record, where an absence from
// PLATFORMS is indistinguishable from an oversight.
//
// Keyed by transform name alone, with no platform qualifier. That is safe only
// because every name here is platform-prefixed, so no cross-platform collision
// is expressible. Declining an unprefixed name — a hypothetical shared
// "size/px" — would widen silently across both platforms and must convert this
// to a per-platform map.
const DECLINED_STOCK_TRANSFORMS = {
  'size/swift/remToCGFloat': 'rem-assuming — replaced by size/unit-aware/swift',
  'size/compose/remToDp': 'rem-assuming — replaced by size/unit-aware/compose-dp',
  'size/compose/remToSp': 'rem-assuming — replaced by size/unit-aware/compose-sp',
  'size/compose/em': 'rem-assuming — replaced by size/unit-aware/compose-em',
};

// Report every transform in a platform's live stock group that this config
// neither runs nor explicitly declined. Pure: it takes Style Dictionary's
// hooks.transformGroups and returns formatted warning strings, so the wording
// is what the tests assert and the caller is a bare loop.
//
// Warns, never throws. The dangerous direction is an ADDITION we never learned
// about, which is usually harmless and occasionally important — throwing would
// break a build over a change the consumer cannot fix. The fatal direction, a
// transform we run being removed, already makes Style Dictionary throw on an
// unknown transform name.
//
// Order is never compared: our lists are hand-ordered for our own reasons and
// do not inherit stock order. Removals are never reported: a declined name
// disappearing is a non-event.
export function auditStockGroups(transformGroups) {
  if (typeof transformGroups !== 'object' || transformGroups === null) {
    return [
      "throughline: could not read Style Dictionary's stock transform groups " +
        '(hooks.transformGroups is not an object), so this adapter cannot check ' +
        'whether its transform lists are still complete.',
    ];
  }
  const warnings = [];
  for (const [platform, preset] of Object.entries(PLATFORMS)) {
    const group = preset.stockGroup;
    if (!group || !Array.isArray(preset.transforms)) {
      warnings.push(
        `throughline: PLATFORMS['${platform}'] is incomplete — it needs both ` +
          'stockGroup and transforms — so its transform list cannot be checked ' +
          "against Style Dictionary's stock groups. This is a throughline " +
          'packaging defect — please report it.',
      );
      continue;
    }
    const stock = transformGroups[group];
    if (!Array.isArray(stock)) {
      warnings.push(
        `throughline: Style Dictionary has no "${group}" transform group, which ` +
          `PLATFORMS['${platform}'] mirrors. The stock group may have been ` +
          'renamed or removed. Upgrade @radicool/throughline, or report your ' +
          'Style Dictionary version.',
      );
      continue;
    }
    const unaccounted = stock.filter(
      (name) =>
        !preset.transforms.includes(name) &&
        !Object.hasOwn(DECLINED_STOCK_TRANSFORMS, name),
    );
    if (unaccounted.length) {
      const n = unaccounted.length;
      warnings.push(
        `throughline: Style Dictionary's "${group}" transform group has ${n} ` +
          `transform${n === 1 ? '' : 's'} this adapter neither runs nor declined: ` +
          `${unaccounted.join(', ')}. Native output may be incomplete. Upgrade ` +
          '@radicool/throughline, or report your Style Dictionary version. ' +
          `(Maintainer repair: add each to PLATFORMS['${platform}'].transforms, ` +
          'or to DECLINED_STOCK_TRANSFORMS with a reason.)',
      );
    }
  }
  return warnings;
}

// % and em are container- or parent-relative, so there is no build-time native
// magnitude. Filter on the AUTHORED value, not on $type — a "100%" token may be
// typed string rather than dimension.
const WEB_ONLY_UNIT = /^-?[\d.]+(%|em)$/;

// The em magnitude, which magnitude() deliberately does not return: em has no
// build-time px equivalent, so it is not a native LENGTH. It is a TextUnit.
const EM_VALUE = /^(-?(?:\d+(?:\.\d+)?|\.\d+))em$/;

export function nativeFilter(token, platform) {
  const v = String(token.original?.$value ?? token.$value).trim();
  if (!WEB_ONLY_UNIT.test(v)) return true;
  // One exception, and it is narrow. Compose has a real .em TextUnit, so an
  // em letterSpacing DOES have a native form there — unlike %, which has none
  // anywhere. It survives only where all three hold: the platform is Compose,
  // the value is em, and the token carries the text role. An em SPACING has no
  // TextUnit meaning and still drops.
  //
  // iOS is deliberately excluded rather than pending. Letter spacing there is
  // an NSAttributedString kern in points, which needs the font size the token
  // does not carry, so there is no value Swift could emit that would not be
  // wrong at some font size.
  return platform === 'android-kotlin' && EM_VALUE.test(v) && isTextUnit(token);
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
        filter: (token) => nativeFilter(token, platform) && hasNativeForm(token, platform),
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
// A unitless value is a ratio, not a measurement. DTCG 8.2.1 requires a
// dimension to carry a unit ("still required even if $value.value is 0"), 8.7's
// `number` is the type for a multiplier, and 9.8 types lineHeight as one — so a
// unitless dimension is malformed input, and appending dp/sp/CGFloat to it
// invents a unit the source never stated. Declining it emits the raw value,
// which is exactly what a correctly typed `number` already produces.
//
// Reads the ORIGINAL authored value, like authored(), and must: preprocess has
// already resolved references by transform time, and a value transform earlier
// in the chain may have rewritten $value.
const RATIO = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const isRatio = (token) => RATIO.test(String(token.original?.$value ?? token.$value).trim());
// The role preprocess stamped. $type cannot carry it — see classifyTextUnits.
const isTextUnit = (token) => token.$extensions?.[EXT_NS]?.nativeUnit === 'text';
const emMagnitude = (token) => {
  const m = String(token.original?.$value ?? token.$value)
    .trim()
    .match(EM_VALUE);
  return m ? Number(m[1]) : null;
};

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
    filter: (token) => (isDimension(token) || isFontSize(token)) && hasMagnitude(token) && !isRatio(token),
    transform: (token) => `CGFloat(${authored(token).toFixed(2)})`,
  });

  // sp is what respects the user's font-scale accessibility setting, and
  // Compose's TextStyle takes TextUnit — not Dp — for fontSize, lineHeight and
  // letterSpacing, so a Dp there does not even compile at the use site. One .dp
  // transform for both would silently defeat the first and loudly break the
  // second. The split is driven by the role classifyTextUnits stamped, plus
  // Style Dictionary's own $type: fontSize convention for sources that use it.
  StyleDictionary.registerTransform({
    name: 'size/unit-aware/compose-dp',
    type: 'value',
    transitive: true,
    filter: (token) => isDimension(token) && !isTextUnit(token) && hasMagnitude(token) && !isRatio(token),
    transform: (token) => `${authored(token).toFixed(2)}.dp`,
  });

  StyleDictionary.registerTransform({
    name: 'size/unit-aware/compose-sp',
    type: 'value',
    transitive: true,
    filter: (token) => (isTextUnit(token) || isFontSize(token)) && hasMagnitude(token) && !isRatio(token),
    transform: (token) => `${authored(token).toFixed(2)}.sp`,
  });

  // em is a THIRD text unit, not a variant of sp. Compose's .em is relative to
  // the font size at the use site, which is what an em letterSpacing means, so
  // it needs neither a magnitude nor a conversion. dp and sp both decline these
  // already — magnitude() returns null for em — so nothing contends.
  //
  // The parentheses are load-bearing. `-0.03.em` parses as `-(0.03.em)`, which
  // kotlinc 2.4.10 rejects with "unresolved reference 'unaryMinus'" unless
  // TextUnit defines that operator. `(-0.03).em` compiles either way, and
  // negatives are the common case: a tight letterSpacing is negative.
  StyleDictionary.registerTransform({
    name: 'size/unit-aware/compose-em',
    type: 'value',
    transitive: true,
    filter: (token) => (isTextUnit(token) || isFontSize(token)) && emMagnitude(token) !== null,
    transform: (token) => `(${emMagnitude(token).toFixed(2)}).em`,
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

  // Last, so every registration side effect has completed before anything is
  // printed. Fires once per REGISTRATION — typically once per process, not once
  // per build: the documented usage registers once and then constructs one
  // StyleDictionary per mode, and the stock groups cannot change between modes.
  //
  // The ?. chain is what turns a caller with no hooks into undefined, which
  // auditStockGroups reports as unreadable rather than silently skipping.
  for (const warning of auditStockGroups(StyleDictionary?.hooks?.transformGroups)) {
    console.warn(warning);
  }
}
// @doc-section-end register
