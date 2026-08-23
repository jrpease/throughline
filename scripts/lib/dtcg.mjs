// Shared DTCG reading: flatten a token tree to dot-paths, resolve {alias} chains.
// Zero dependencies. Consumed by validate-crosswalk.mjs and validate-token-output.mjs,
// and copied alongside both when a skill installs either gate.

const REF = /^\{([^}]+)\}$/;

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
