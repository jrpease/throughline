// Shared DTCG reading: flatten a token tree to dot-paths, resolve {alias} chains.
// Zero dependencies. Consumed by validate-crosswalk.mjs and validate-token-output.mjs,
// and copied alongside both when a skill installs either gate.

const REF = /^\{([^}]+)\}$/;

// The typographic member names DTCG §9.8 fixes at MUST level, the unit gate a
// text-role dimension must pass, and this project's $extensions namespace.
//
// They live here rather than in sd-native.mjs because textRoleGraph below and
// sd-native.mjs's preprocess apply the identical rules, and sd-native.mjs
// already imports this file — so the reverse import would be a cycle. Their
// full rationale stays at the point of use in sd-native.mjs, which is what the
// generated references/native-adapter-config.md renders.
export const TEXT_UNIT_NAMES = new Set(['fontSize', 'letterSpacing', 'lineHeight']);
export const TEXT_ROLE_UNIT = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)$/;
export const EXT_NS = 'com.radicool.throughline';

// Flatten nested DTCG groups into { "dot.path": rawValue }. Skips $-prefixed meta keys.
//
// A node carrying BOTH a $value and children yields its own value AND is descended
// into — the dual-node pattern, where `text.sm` has `$value: "14px"` plus a
// `text.sm.lineHeight` child. Stopping at the first $value drops those children,
// which makes every alias to one unresolvable: the crosswalk gate reported them as
// "missing from the DTCG source" though they exist, and the output validator could
// not check them at all.
export function flattenDtcg(obj, prefix = [], out = {}) {
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    if (!val || typeof val !== 'object') continue;
    const path = [...prefix, key];
    if ('$value' in val) out[path.join('.')] = val.$value;
    flattenDtcg(val, path, out);
  }
  return out;
}

// Flatten nested DTCG groups into { "dot.path": effectiveType }, applying the
// $type resolution of DTCG 5.2.2: a token's own $type wins, otherwise the
// nearest ancestor GROUP's. A node carrying a $value is a token, not a group
// (DTCG 6.1), so it is not an inheritance source for its children — the same
// rule hoistDualNodes computes as `inherited`, and the two must agree or two
// functions in this codebase disagree about the type of the same tree.
//
// Separate from flattenDtcg rather than folded into it: that function has four
// consumers and both validators re-export it, so its return shape is fixed.
//
// LIMIT, stated rather than hidden: this reads the RAW source, so it cannot see
// the $type carry hoistDualNodes applies during preprocessing. An untyped child
// of a dimension-typed dual node with no enclosing group type is a dimension to
// the pipeline and undefined here. Reference-derived typing (5.2.2 rule 1) is
// likewise not resolved — an alias is undefined, but its referent is typed, and
// the referent is the token an author edits.
export function flattenDtcgTypes(obj, prefix = [], out = {}, groupType = undefined) {
  const inherited = '$value' in obj ? groupType : (obj.$type ?? groupType);
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    if (!val || typeof val !== 'object') continue;
    const path = [...prefix, key];
    if ('$value' in val) out[path.join('.')] = val.$type ?? inherited;
    flattenDtcgTypes(val, path, out, inherited);
  }
  return out;
}

// Follow {alias} chains to a leaf literal. Throws on missing or circular refs.
export function resolveValue(name, flat, seen = new Set()) {
  if (!(name in flat)) throw new Error(`token "${name}" not found in DTCG source`);
  const val = flat[name];
  if (typeof val === 'string') {
    const m = val.match(REF);
    if (m) {
      if (seen.has(name)) throw new Error(`circular reference at "${name}"`);
      seen.add(name);
      return resolveValue(m[1], flat, seen);
    }
  }
  return val;
}

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
