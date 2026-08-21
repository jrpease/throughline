// Native token output validator: assert generated Swift/Kotlin matches its DTCG source.
// Catches output that compiles but is wrong. Zero dependencies.
//
// Usage:
//   node validate-token-output.mjs --source a.json --source b.json \
//     --output Tokens.swift --platform ios-swift [--min-match 0.5]
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const REF = /^\{([^}]+)\}$/;

// Flatten nested DTCG groups into { "dot.path": rawValue }.
// Unlike validate-crosswalk.mjs's flattenDtcg, a node carrying BOTH a $value and
// children yields its own value AND is descended into — the dual-node pattern
// (text.sm has $value "14px" plus a lineHeight child). Stopping at the first
// $value silently drops those children.
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

// Declaration patterns per platform. Coupled to the ios-swift/enum.swift and
// compose/object output formats; a different format needs a different pattern,
// which surfaces as a zero-match failure rather than a silent pass.
const DECL = {
  'ios-swift': /^\s*(?:public\s+)?static\s+let\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/,
  'android-kotlin': /^\s*val\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/,
};

// Style Dictionary's ios-swift/enum.swift format emits an inline trailing
// comment for any token carrying a $description ("... /** Small body text */").
// Strip a TRAILING comment only — a value that legitimately contains "//"
// inside a string literal must survive untouched.
const TRAILING_COMMENT = /\s+(\/\*\*?[\s\S]*\*\/|\/\/.*)$/;

export function extractDeclarations(text, platform) {
  const re = DECL[platform];
  if (!re) throw new Error(`unknown platform "${platform}"`);
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(re);
    if (m) out.push({ symbol: m[1], value: m[2].replace(TRAILING_COMMENT, '').trim() });
  }
  return out;
}

// Known dimension wrappers. Multi-argument constructors (colors) never match,
// so they are exempt from unit-fidelity by construction.
const MAGNITUDE = [
  /^CGFloat\(\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)$/,
  /^(-?(?:\d+(?:\.\d+)?|\.\d+))\.(?:dp|sp)$/,
  /^(-?(?:\d+(?:\.\d+)?|\.\d+))$/,
];

export function magnitudeOf(value) {
  for (const re of MAGNITUDE) {
    const m = value.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

// Adapters name tokens differently (color.bg.canvas -> colorBgCanvas -> color_bg_canvas).
// Lowercase and strip every non-alphanumeric so all conventions compare equal.
export function normalizeKey(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

const UNIT = /^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]*)$/;

// Expected native magnitude for an authored source value. iOS points and Android
// dp both map 1:1 to CSS px by convention; rem is root-relative at a 16px root;
// a unitless dimension is a ratio and is never scaled. % and em have no native
// equivalent, so they are skipped here and caught by no-bare-units if emitted raw.
export function expectedMagnitude(sourceValue) {
  if (typeof sourceValue === 'number') return { magnitude: sourceValue };
  if (typeof sourceValue !== 'string') return { skip: 'non-scalar' };
  const m = sourceValue.trim().match(UNIT);
  if (!m) return { skip: 'not-a-dimension' };
  const n = Number(m[1]);
  switch (m[2]) {
    case 'px':
    case '':
      return { magnitude: n };
    case 'rem':
      return { magnitude: n * 16 };
    case '%':
    case 'em':
      return { skip: 'not-expressible' };
    default:
      return { skip: 'not-a-dimension' };
  }
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

const FOREIGN = /(?:color-mix|calc|var)\s*\(/;
const BARE_UNIT = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)$/;

// Lines that are obviously not a would-be token declaration: braces-only,
// comments, imports/package/annotations, or the container declarations
// (enum/object/class) themselves. Anything else that DECL failed to match is
// a genuine unparsed line, not noise — conservatively under-count rather than
// over-count (a false "unparsed" is noise the brief warns against).
const STRUCTURAL_PREFIX = /^(\/\/|\/\*|\*|import\b|package\b|@)/;
const STRUCTURAL_CONTAINS = /\b(enum|object|class)\s/;

// Non-blank output lines DECL could not parse and that aren't structural —
// the denominator's blind spot. Made visible, not enforced (Decision 6 only
// covers zero matches).
function countUnparsedLines(text, declRe) {
  let count = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (declRe.test(line)) continue;
    if (/^[{}]+$/.test(trimmed)) continue;
    if (STRUCTURAL_PREFIX.test(trimmed)) continue;
    if (STRUCTURAL_CONTAINS.test(trimmed)) continue;
    count += 1;
  }
  return count;
}

export function validate({ sources, output, platform, minMatch = 0.5 }) {
  const collisions = findModeCollisions(sources);

  const flat = {};
  for (const { dtcg } of sources) Object.assign(flat, flattenDtcg(dtcg));

  const byKey = new Map();
  for (const path of Object.keys(flat)) byKey.set(normalizeKey(path), path);

  const decls = extractDeclarations(output, platform);
  const failures = [];
  let matched = 0;

  for (const { symbol, value } of decls) {
    if (FOREIGN.test(value)) failures.push({ rule: 'no-foreign-syntax', symbol, emitted: value });
    if (BARE_UNIT.test(value)) failures.push({ rule: 'no-bare-units', symbol, emitted: value });

    const path = byKey.get(normalizeKey(symbol));
    if (!path) continue;

    let source;
    try {
      source = resolveValue(path, flat);
    } catch {
      continue;
    }
    matched += 1;

    const expected = expectedMagnitude(source);
    if (expected.skip) continue;
    const actual = magnitudeOf(value);
    if (actual === null) {
      failures.push({ rule: 'unverifiable-dimension', symbol, token: path, source, emitted: value });
      continue;
    }
    if (Math.abs(actual - expected.magnitude) > 0.001) {
      failures.push({ rule: 'unit-fidelity', symbol, token: path, source, emitted: value, expected: expected.magnitude, actual });
    }
  }

  const matchRate = decls.length ? matched / decls.length : 0;
  const ok = failures.length === 0 && collisions.length === 0 && matched > 0 && matchRate >= minMatch;

  const unparsedLines = countUnparsedLines(output, DECL[platform]);
  const emittedKeys = new Set(decls.map((d) => normalizeKey(d.symbol)));
  let unemittedTokens = 0;
  for (const key of byKey.keys()) if (!emittedKeys.has(key)) unemittedTokens += 1;

  return { total: decls.length, matched, matchRate, failures, collisions, minMatch, ok, unparsedLines, unemittedTokens };
}

export function formatReport(r) {
  const lines = [];
  const pct = (r.matchRate * 100).toFixed(0);
  lines.push(`tokens:validate-output — ${r.matched}/${r.total} emitted symbols matched a source token (${pct}%)`);
  if (r.collisions.length) {
    lines.push(`\n${r.collisions.length} mode collision(s) — the source list spans modes:`);
    for (const c of r.collisions) {
      lines.push(`  - ${c.path}: ${c.defs.map((d) => `${d.file}=${JSON.stringify(d.value)}`).join(', ')}`);
    }
  }
  if (r.failures.length) {
    lines.push(`\n${r.failures.length} rule failure(s):`);
    for (const f of r.failures) {
      lines.push(
        f.rule === 'unit-fidelity'
          ? `  - [${f.rule}] ${f.symbol}: source ${f.source} expects ${f.expected}, emitted ${f.emitted} (${f.actual})`
          : f.rule === 'unverifiable-dimension'
            ? `  - [${f.rule}] ${f.symbol}: source ${f.source} has a dimension magnitude but emitted ${f.emitted} could not be read — the token was never actually compared`
            : `  - [${f.rule}] ${f.symbol}: ${f.emitted}`,
      );
    }
  }
  if (r.matched === 0) {
    lines.push(`\nNo emitted symbol matched any source token — the adapter's naming convention does not line up, so nothing was actually verified. A likely cause is a declaration form the DECL pattern does not match (e.g. a different accessControl such as "internal static let ...").`);
  } else if (r.matchRate < r.minMatch) {
    lines.push(`\nMatch rate ${pct}% is below the ${(r.minMatch * 100).toFixed(0)}% floor — most output went unchecked.`);
  }
  if (r.unparsedLines) {
    lines.push(`\n${r.unparsedLines} unparsed line(s) — declaration-shaped lines the extractor could not read; they count in neither the numerator nor the denominator above.`);
  }
  if (r.unemittedTokens) {
    lines.push(`\n${r.unemittedTokens} source token(s) had no matching emitted symbol.`);
  }
  return lines;
}

function main() {
  let values;
  try {
    const parsed = parseArgs({
      options: {
        source: { type: 'string', multiple: true },
        output: { type: 'string' },
        platform: { type: 'string' },
        'min-match': { type: 'string' },
      },
    });
    values = parsed.values;
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  if (!values.source?.length || !values.output || !values.platform) {
    console.error('usage: validate-token-output.mjs --source <a.json> [--source <b.json>...] --output <Tokens.swift|Tokens.kt> --platform <ios-swift|android-kotlin> [--min-match <ratio>]');
    process.exit(2);
  }

  const sources = [];
  for (const file of values.source) {
    try {
      sources.push({ file, dtcg: JSON.parse(readFileSync(file, 'utf8')) });
    } catch (e) {
      console.error(`error reading or parsing ${file}: ${e.message}`);
      process.exit(2);
    }
  }

  let output;
  try {
    output = readFileSync(values.output, 'utf8');
  } catch (e) {
    console.error(`error reading output file ${values.output}: ${e.message}`);
    process.exit(2);
  }

  let minMatch;
  try {
    minMatch = values['min-match'] === undefined ? 0.5 : Number(values['min-match']);
    if (!Number.isFinite(minMatch)) {
      throw new Error(`--min-match must be a finite number, got "${values['min-match']}"`);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  let r;
  try {
    r = validate({ sources, output, platform: values.platform, minMatch });
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  for (const line of formatReport(r)) console.log(line);
  if (!r.ok) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
