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
import { flattenDtcg, resolveValue } from './dtcg.mjs';

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
