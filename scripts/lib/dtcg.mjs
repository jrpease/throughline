// Shared DTCG reading: flatten a token tree to dot-paths, resolve {alias} chains.
// Zero dependencies. Consumed by validate-crosswalk.mjs and validate-token-output.mjs,
// and copied alongside both when a skill installs either gate.

const REF = /^\{([^}]+)\}$/;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

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

// Read this project's $extensions namespace off a node, refusing a shape that
// cannot hold one.
//
// A DTCG $extensions namespace key may hold ANY JSON value, so a source that
// authored ours as a string is CONFORMANT input this module does not handle —
// not malformed input. That distinction is why it gets a diagnostic rather than
// a shrug: the module's contract is that it consumes conformant DTCG.
//
// Before #62 the three places that read this namespace all hit the `in`
// operator on a primitive and threw a bare TypeError naming no token, no path
// and no value — out of step with every other diagnostic here. nativeSources
// names the colliding path and both files; the hoist-collision throw names both
// paths and the value it would overwrite; nativePlatform names the unknown
// platform and the expected set.
export function extNamespace(node, path) {
  const ext = node.$extensions;
  if (ext === undefined) return undefined;
  if (!isPlainObject(ext)) {
    throw new Error(
      `token "${path}" has a $extensions that is ${JSON.stringify(ext)}, not an object.\n` +
        'DTCG 5.4 makes $extensions a map of namespace keys. Remove it, or give it the shape ' +
        `{ "${EXT_NS}": { "nativeUnit": "text" } }.`,
    );
  }
  const ns = ext[EXT_NS];
  if (ns === undefined) return undefined;
  if (!isPlainObject(ns)) {
    throw new Error(
      `token "${path}" has $extensions["${EXT_NS}"] set to ${JSON.stringify(ns)}, not an object.\n` +
        `The namespace holds named settings, so a bare value cannot be read. Write ` +
        `{ "nativeUnit": ${JSON.stringify(ns)} } if that is the setting you meant.`,
    );
  }
  return ns;
}

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

// DTCG 5.2.2 PLUS the one repair this pipeline applies on top of it, so that
// anything reasoning about what the build emits reads the same types the build
// used. flattenDtcgTypes is the spec; this is the spec as this build resolves it.
//
// The repair is hoistDualNodes' $type carry. A dual node is a token, not a group
// (DTCG 6.1), so it is not its children's inheritance source and 5.2.2 gives an
// untyped child of one no type at all. The hoist then makes that child a sibling
// of the dual node, which destroys the last relationship it had — so where NO
// enclosing group supplies a type, the hoist stamps the dual node's own. That is
// a repair for what the hoist broke, not a reading of the source, which is why
// it does not belong in flattenDtcgTypes.
//
// It has to be modelled somewhere, though, because two things that reason about
// types could not see it: classification, which runs before the hoist and so
// declined a child the pipeline goes on to type (#89), and the unitless-dimension
// advisory, which reads the raw source (#71). Both were silent on shapes the
// build handles.
//
// The conditions mirror hoistDualNodes exactly — an untyped TOKEN child (#67
// restricted it to those), a dual node that has a $type, no enclosing group type,
// and a value that is not a whole-value reference. That last one is why this must
// run on the RAW tree: resolveInPlace rewrites a reference to its literal, and
// the WeakSet the hoist consults for it does not survive into a fresh call.
//
// Keyed on pre-hoist paths, like flattenDtcgTypes, because every consumer of this
// map runs before the hoist or reports against source paths.
export function flattenPipelineTypes(dict) {
  const types = flattenDtcgTypes(dict);
  (function walk(node, prefix, groupType) {
    const inherited = '$value' in node ? groupType : (node.$type ?? groupType);
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('$') || !isPlainObject(val)) continue;
      const path = [...prefix, key];
      if ('$value' in val && '$type' in val && inherited === undefined) {
        for (const [childKey, childVal] of Object.entries(val)) {
          if (childKey.startsWith('$') || !isPlainObject(childVal)) continue;
          if ('$value' in childVal && !('$type' in childVal) && !REF.test(String(childVal.$value).trim())) {
            types[[...path, childKey].join('.')] = val.$type;
          }
        }
      }
      walk(val, path, inherited);
    }
  })(dict, [], undefined);
  return types;
}

// Collect nodes carrying BOTH a $value and child tokens or groups.
//
// This shape is invalid DTCG. Format Module, Draft Community Group Report of
// 30 July 2026, §6.1: "The presence of a $value property definitively identifies
// an object as a token. If an object contains both $value and child
// tokens/groups, this creates an invalid structure where the object cannot be
// both a token and a group simultaneously. Tools MUST report this as an error."
// The prohibition is deliberate rather than an oversight — §6.2 defines $root as
// the sanctioned way for a group to carry a base value alongside children, which
// is exactly what a dual node is reaching for.
//
// Collecting them is NOT a step towards rejecting them. Figma-derived sources
// emit dual nodes by the dozen, hoistDualNodes exists precisely to handle them,
// and refusing them would make this tool useless against the sources it targets.
// That behaviour is unchanged. What was missing is telling the author their
// source is non-conforming, which nothing did — so someone hand-authoring
// text.sm with both a value and a lineHeight child had no way to learn that
// $root is the blessed spelling.
//
// Lives here because flattenDtcg already walks this tree and already descends
// into dual nodes on purpose, so the knowledge is present and only the reporting
// was absent.
export function findDualNodes(obj, prefix = [], out = []) {
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$') || !isPlainObject(val)) continue;
    const path = [...prefix, key];
    if ('$value' in val && Object.entries(val).some(([k, v]) => !k.startsWith('$') && isPlainObject(v))) {
      out.push(path.join('.'));
    }
    findDualNodes(val, path, out);
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

// Deep merge in list order, later source winning — the same later-wins rule
// validate-token-output.mjs already applies when it flattens a source list, and
// what Style Dictionary hands preprocess as one dict.
//
// Each source is cloned on the way in. Merging the caller's own objects would
// mutate the token trees it still holds, and the validator reads them again.

function mergeInto(target, src) {
  for (const [key, val] of Object.entries(src)) {
    if (isPlainObject(val) && isPlainObject(target[key])) mergeInto(target[key], val);
    else target[key] = val;
  }
  return target;
}

export function mergeDtcg(dicts) {
  const out = {};
  for (const dict of dicts) mergeInto(out, structuredClone(dict));
  return out;
}

// A dimension primitive states no typographic role: text.base: "16px" is a font
// size only to a human, so it emitted as dp, and an em letterSpacing primitive
// was dropped from native output entirely. #51 sources the role from the member
// names DTCG §9.8 fixes, which reaches the semantic tokens and not the
// primitives they reference. This reaches the primitives, structurally.
//
// Reads the UNRESOLVED tree: preprocess resolves aliases in place, so by
// transform time the graph is gone. Nothing needs carrying, because the
// inference is applied during preprocessing and only the $extensions stamp
// survives — see sd-native.mjs's applyTextRoleGraph.
//
// A referrer whose leaf name is NOT typographic is counter-evidence, not
// neutral. A dimension referenced by something that is not a typographic member
// is a length, which is exactly what the dp default already asserts about it.
// Treating it as neutral would let one stray fontSize reference convert a whole
// spacing ramp.
//
// Single-pass and deliberately not transitive: a chain through an intermediate
// whose own leaf name states no role is declined at the second hop, because
// that intermediate is itself counter-evidence. Only whole-value references
// count; a reference embedded in an expression is resolved by resolveInPlace
// but is not evidence of a role.
export function textRoleGraph(dict) {
  const edges = [];
  (function walk(node, prefix) {
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('$') || !isPlainObject(val)) continue;
      const path = [...prefix, key];
      if (typeof val.$value === 'string') {
        const m = REF.exec(val.$value.trim());
        if (m) edges.push({ to: m[1], leaf: key });
      }
      walk(val, path);
    }
  })(dict, []);

  const referrers = new Map();
  for (const edge of edges) {
    if (!referrers.has(edge.to)) referrers.set(edge.to, []);
    referrers.get(edge.to).push(edge);
  }

  const typographic = new Set();
  const ambiguous = [];
  for (const [path, rs] of referrers) {
    const textLeaves = [...new Set(rs.filter((r) => TEXT_UNIT_NAMES.has(r.leaf)).map((r) => r.leaf))];
    if (textLeaves.length === 0) continue;
    const otherLeaves = [...new Set(rs.filter((r) => !TEXT_UNIT_NAMES.has(r.leaf)).map((r) => r.leaf))];
    if (otherLeaves.length) ambiguous.push({ path, textLeaves, otherLeaves });
    else typographic.add(path);
  }

  // A primitive nothing references has no structural signal at all, so it is
  // never inferred. Reported instead, where its group holds one that was: that
  // is the strongest hint available without guessing, and a silent gap is the
  // failure this module exists to prevent. A token whose source already stamps
  // nativeUnit is closed and is not reported.
  const inferredGroups = new Set([...typographic].map((p) => p.split('.').slice(0, -1).join('.')));
  // DTCG 5.2.2, not the token's own literal $type: a source that declares
  // $type once on the group and not on each token is legal DTCG, and gating on
  // val.$type made this walk blind to it — so the advisory that exists to name
  // a silent gap was itself silent on the shape where the whole pipeline goes
  // quiet (#85).
  const types = flattenDtcgTypes(dict);
  const unreferencedSiblings = [];
  (function walk(node, prefix) {
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('$') || !isPlainObject(val)) continue;
      const path = [...prefix, key];
      const dotted = path.join('.');
      const group = prefix.join('.');
      if (
        '$value' in val &&
        types[dotted] === 'dimension' &&
        TEXT_ROLE_UNIT.test(String(val.$value).trim()) &&
        !referrers.has(dotted) &&
        !('nativeUnit' in (extNamespace(val, dotted) ?? {})) &&
        inferredGroups.has(group)
      ) {
        unreferencedSiblings.push({ path: dotted, group });
      }
      walk(val, path);
    }
  })(dict, []);

  return { typographic, ambiguous, unreferencedSiblings };
}
