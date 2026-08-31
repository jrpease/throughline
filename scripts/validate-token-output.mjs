// Native token output validator: assert generated Swift/Kotlin matches its DTCG source.
// Catches output that compiles but is wrong. Zero dependencies.
//
// Usage:
//   node validate-token-output.mjs --source a.json --source b.json \
//     --output Tokens.swift --platform ios-swift [--min-match 0.5]
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  flattenDtcg,
  flattenDtcgTypes,
  flattenPipelineTypes,
  findDualNodes,
  resolveValue,
  findModeCollisions,
  textRoleGraph,
  mergeDtcg,
  EXT_NS,
} from './lib/dtcg.mjs';
import { parseLiteral, isValidLiteral, GRAMMAR, CSS_CONSTRUCT_ANYWHERE } from './lib/native-literal.mjs';

// Re-exported so consumers (and the test file) keep one import surface.
export { flattenDtcg, flattenDtcgTypes, resolveValue, findModeCollisions };

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

// Two source paths that normalize to one key, e.g. color.bg.canvas and
// colorBg.canvas -> colorbgcanvas. Same map-and-compare shape as
// findModeCollisions, keyed on the normalized form instead of the raw path.
//
// This is not only a matching problem, which is why it gates rather than
// advises. Measured through Style Dictionary on that exact pair: the build
// emits `val colorBgCanvas` TWICE and kotlinc rejects the file with
// "conflicting declarations". The source is ambiguous for native output, and
// the emitted file does not compile.
//
// Before this, the second path silently overwrote the first in byKey, with a
// consequence in each direction: the loser was never checked at all, and every
// emitted symbol sharing the key was compared against whichever path happened
// to sort last — which reported a unit-fidelity failure naming a token that was
// correct. A wrong diagnosis is worse than none, because it sends the author to
// the wrong file.
export function findNormalizationCollisions(paths) {
  const byKey = new Map();
  for (const path of paths) {
    const key = normalizeKey(path);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(path);
  }
  return [...byKey]
    .filter(([, ps]) => ps.length > 1)
    .map(([key, ps]) => ({ key, paths: ps }));
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

// Unanchored: matches this text anywhere in the value, including inside a
// quoted string. That is deliberate for the bare case — an unrescued
// calc(...)/var(...)/color-mix(...) leaks CSS syntax wherever it sits — but it
// means a well-formed quoted literal whose TEXT happens to contain "calc(" or
// "var(" (e.g. a $type: string value describing CSS) would also match. The
// isValidLiteral gate below is what tells those apart: a value the grammar
// accepts as a literal is not foreign syntax, whatever text it contains.
//
// That holds for Swift. It does NOT hold unconditionally for Kotlin (#57):
// `${...}` inside a Kotlin string is executable code, and the grammar accepts an
// unescaped `$`, so `"${calc(1)}"` parses as a valid literal and is exempted
// here. The exemption also covers a small set of values that are well-formed
// literals AND named-foreign — calc(2), var(1), and on Kotlin calc(2.dp) — which
// are kept, pass every rule, and do not compile. None is producible CSS, and
// this was shipped knowingly when the gate was added; it is written down so the
// next person meets it as a decision rather than a surprise.
// Imported, not redeclared (#57). This was an independent copy of the same
// alternation, while native-literal.mjs's comment promised the build and the
// gate could not drift apart. Adding a fourth construct name there would have
// taught the output filter to keep something this rule had never been taught to
// name — recreating exactly the unreachable-rule defect #56 fixed.
const FOREIGN = CSS_CONSTRUCT_ANYWHERE;
const BARE_UNIT = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)$/;

// #52. A unitless value is a ratio, not a measurement: DTCG 8.2.1 requires a
// dimension to carry a unit, and 8.7's `number` is the type for a multiplier.
// Distinct from BARE_UNIT, which requires a unit SUFFIX and so never matches
// this — which is exactly why the shape passed the gate silently before.
const UNITLESS = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const DIMENSIONAL = new Set(['dimension', 'fontSize']);

// A token whose RAW authored $value is itself a whole-value reference is not
// flagged: its referent is (per DTCG 5.2.2, an alias takes the referent's
// type), and `source` above is already the RESOLVED value, so testing it
// alone would flag both the alias and its referent for the same problem.
const WHOLE_REF = /^\{[^}]+\}$/;

// Follow whole-value references to the token an advisory's fix belongs on.
// Stops at the first path that is not a whole-value reference, at an
// unresolvable one, and on a cycle — this reports, so it must never throw.
function referentOf(path, flat, seen = new Set()) {
  const raw = String(flat[path] ?? '').trim();
  if (!WHOLE_REF.test(raw)) return path;
  const next = raw.slice(1, -1);
  if (seen.has(path) || !(next in flat)) return path;
  seen.add(path);
  return referentOf(next, flat, seen);
}

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

  const types = {};
  // The PIPELINE's types, not the spec's alone (#71). flattenDtcgTypes reads the
  // raw source, where hoistDualNodes' $type carry has not run — so a unitless,
  // untyped child of a dimension-typed dual node was a dimension to the build
  // and a nothing to this gate, which is the silent case this rule most exists
  // to catch.
  //
  // The issue framed the only fix as running this gate against the PREPROCESSED
  // tree, and rejected it, because the gate would stop checking emitted output
  // against what the author actually wrote. flattenPipelineTypes is a third
  // option that keeps that property: it reads the raw source and MODELS the
  // carry rather than applying it. The gate still reads what the author wrote.
  for (const { dtcg } of sources) Object.assign(types, flattenPipelineTypes(dtcg));

  // Collided keys are deliberately LEFT OUT of byKey. A symbol whose key is
  // ambiguous then matches nothing, so it falls through to `continue` before any
  // source comparison and is not counted as matched — which is the truth: it did
  // not match a determinate token. That removes the false unit-fidelity failure
  // without a special case in the loop below. The literal, foreign-syntax and
  // bare-unit rules still run on it, because none of them reads the source.
  const normalizationCollisions = findNormalizationCollisions(Object.keys(flat));
  const collided = new Set(normalizationCollisions.map((c) => c.key));

  const byKey = new Map();
  for (const path of Object.keys(flat)) {
    const key = normalizeKey(path);
    if (!collided.has(key)) byKey.set(key, path);
  }

  const decls = extractDeclarations(output, platform);
  const failures = [];
  const advisories = [];
  let matched = 0;

  for (const { symbol, value } of decls) {
    // The two specific rules diagnose better than "not a valid literal", so
    // they win; invalid-literal is the general net underneath them. Reporting
    // one symbol under all three would be noise.
    const foreign = FOREIGN.test(value) && !isValidLiteral(value, GRAMMAR[platform]);
    const bare = BARE_UNIT.test(value);
    if (foreign) failures.push({ rule: 'no-foreign-syntax', symbol, emitted: value });
    if (bare) failures.push({ rule: 'no-bare-units', symbol, emitted: value });
    if (!foreign && !bare) {
      // Before the name-match `continue` below: a symbol that resolves to no
      // source token must not escape a validity check by being unnamed.
      const parsed = parseLiteral(value, GRAMMAR[platform]);
      if (!parsed.ok) {
        failures.push({
          rule: 'invalid-literal',
          symbol,
          emitted: value,
          platform,
          offset: parsed.offset,
          rest: parsed.rest,
        });
      }
    }

    const path = byKey.get(normalizeKey(symbol));
    if (!path) continue;

    let source;
    try {
      source = resolveValue(path, flat);
    } catch {
      continue;
    }
    matched += 1;

    // Advisory, not a failure: the emitted value is correct under the ratio
    // reading this build applies, so it compiles and its magnitude matches.
    // What is wrong is the SOURCE's $type, which only the author can settle.
    //
    // An alias is skipped only when its REFERENT is itself dimension-typed, so
    // the referent's own symbol reports it — that is #69's de-duplication, kept.
    // A blanket skip on any whole-value reference (#72) meant an untyped base
    // behind a typed alias was reported nowhere: the base is not dimension-typed
    // so it never fires, and the alias was skipped for being a reference. The
    // advisory is attributed to the referent either way, because that is the
    // token whose $type or unit the author has to change.
    const aliased = WHOLE_REF.test(String(flat[path]).trim());
    const target = aliased ? referentOf(path, flat) : path;
    if (
      UNITLESS.test(String(source).trim()) &&
      DIMENSIONAL.has(types[path]) &&
      !(aliased && DIMENSIONAL.has(types[target]))
    ) {
      advisories.push({ rule: 'unitless-dimension', symbol, token: target, source, emitted: value });
    }

    const expected = expectedMagnitude(source);
    if (expected.skip) continue;
    const actual = magnitudeOf(value);
    if (actual === null) {
      // no-foreign-syntax already explains why the magnitude could not be read,
      // and names the actual cause. "The token was never actually compared" beside
      // it is a red herring pointing at the symptom (#57). Same suppression the
      // three literal rules already apply to each other.
      if (!foreign) {
        failures.push({ rule: 'unverifiable-dimension', symbol, token: path, source, emitted: value });
      }
      continue;
    }
    if (Math.abs(actual - expected.magnitude) > 0.001) {
      failures.push({ rule: 'unit-fidelity', symbol, token: path, source, emitted: value, expected: expected.magnitude, actual });
    }
  }

  // A SOURCE-side pass, deliberately not part of the loop above. That loop
  // iterates emitted declarations, and the token this advisory exists for is
  // the one that was never emitted at all — an em letterSpacing whose role
  // nothing states is filtered out of native output, so it has no symbol to
  // hang a note on.
  //
  // Merged rather than unioned across sources: the graph must describe the
  // build that actually ran, and a build merges with the later source winning.
  // A union would call a token referenced when this build did not reach it,
  // under-reporting the gap in the one direction that matters.
  // #58. A node carrying both a $value and children is invalid DTCG (§6.1, and
  // §6.2 defines $root as the sanctioned spelling), and nothing told the author
  // so. ADVISORY, not a failure, and deliberately: every Figma-derived source
  // has dozens — the real one this is validated against has 13 — so failing on
  // it would make the gate useless on day one for exactly the people this tool
  // targets. The build keeps handling them; the author now learns the shape is
  // non-conforming and what to write instead.
  //
  // One advisory for the whole finding rather than one per node. It is a single
  // structural fact about the source, and thirteen near-identical lines would
  // bury the rest of the report.
  //
  // Read per source file, not from the merged dict: a merge can conceal a dual
  // node whose children come from one file and whose $value comes from another,
  // and the author fixes this file by file.
  const dualNodes = [...new Set(sources.flatMap((s) => findDualNodes(s.dtcg)))];
  if (dualNodes.length) advisories.push({ rule: 'dual-node', paths: dualNodes });

  const graph = textRoleGraph(mergeDtcg(sources.map((s) => s.dtcg)));
  for (const { path, group } of graph.unreferencedSiblings) {
    advisories.push({ rule: 'unreferenced-text-sibling', token: path, group });
  }
  for (const { path, textLeaves, otherLeaves } of graph.ambiguous) {
    advisories.push({ rule: 'ambiguous-text-role', token: path, textLeaves, otherLeaves });
  }

  const matchRate = decls.length ? matched / decls.length : 0;
  const ok =
    failures.length === 0 &&
    collisions.length === 0 &&
    normalizationCollisions.length === 0 &&
    matched > 0 &&
    matchRate >= minMatch;

  const unparsedLines = countUnparsedLines(output, DECL[platform]);
  // NAMED, not just counted (#57). A token with no native form is filtered out
  // of native output, and a nested construct like rgba(var(--brand), 0.5) is one
  // of them — the filter's exemption is anchored, deliberately, because the
  // module cannot tell a rescuable outer function from linear-gradient(). Before
  // this the only trace such a token left was a number, which is the same
  // silence this release exists to remove everywhere else.
  const emittedKeys = new Set(decls.map((d) => normalizeKey(d.symbol)));
  const unemittedPaths = [];
  for (const [key, path] of byKey) if (!emittedKeys.has(key)) unemittedPaths.push(path);
  const unemittedTokens = unemittedPaths.length;

  return { total: decls.length, matched, matchRate, failures, advisories, collisions, normalizationCollisions, minMatch, ok, unparsedLines, unemittedTokens, unemittedPaths };
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
  if (r.normalizationCollisions?.length) {
    lines.push(
      `\n${r.normalizationCollisions.length} name collision(s) — distinct source paths that reduce to one symbol name:`,
    );
    for (const c of r.normalizationCollisions) {
      lines.push(`  - ${c.key}: ${c.paths.join(' vs ')}`);
    }
    lines.push(
      `\nThese emit the same symbol name, so the generated file declares it more than once and will not compile. They are also excluded from matching above, because there is no way to tell which source token an emitted symbol came from. Rename one side in source.`,
    );
  }
  if (r.failures.length) {
    lines.push(`\n${r.failures.length} rule failure(s):`);
    for (const f of r.failures) {
      lines.push(
        f.rule === 'invalid-literal'
          ? `  - [${f.rule}] ${f.symbol}: emitted \`${f.emitted}\` is not a valid ${f.platform} literal — parsing stopped at offset ${f.offset} (${JSON.stringify(f.rest.slice(0, 30))})`
          : f.rule === 'unit-fidelity'
            ? `  - [${f.rule}] ${f.symbol}: source ${f.source} expects ${f.expected}, emitted ${f.emitted} (${f.actual})`
            : f.rule === 'unverifiable-dimension'
              ? `  - [${f.rule}] ${f.symbol}: source ${f.source} has a dimension magnitude but emitted ${f.emitted} could not be read — the token was never actually compared`
              : `  - [${f.rule}] ${f.symbol}: ${f.emitted}`,
      );
    }
    if (r.failures.some((f) => f.rule === 'invalid-literal')) {
      lines.push(
        `\nAn invalid-literal value will not compile. A string value must be quoted — add its $type to the quoting transform in lib/sd-native.mjs. A CSS construct such as linear-gradient() has no native form and should be filtered out of native builds instead.`,
      );
    }
  }
  // The naming-convention diagnosis is wrong when collisions are what removed
  // the tokens, and a confident wrong cause sends the author to the wrong file.
  // Name the collisions instead, and only then fall back to the convention.
  const collisionNote = r.normalizationCollisions?.length
    ? ` The ${r.normalizationCollisions.length} name collision(s) above were excluded from matching, which may be the whole of it — resolve those first.`
    : '';
  if (r.matched === 0) {
    lines.push(
      r.normalizationCollisions?.length
        ? `\nNo emitted symbol matched any source token, so nothing was actually verified.${collisionNote}`
        : `\nNo emitted symbol matched any source token — the adapter's naming convention does not line up, so nothing was actually verified. A likely cause is a declaration form the DECL pattern does not match (e.g. a different accessControl such as "internal static let ...").`,
    );
  } else if (r.matchRate < r.minMatch) {
    lines.push(`\nMatch rate ${pct}% is below the ${(r.minMatch * 100).toFixed(0)}% floor — most output went unchecked.${collisionNote}`);
  }
  if (r.unparsedLines) {
    lines.push(`\n${r.unparsedLines} unparsed line(s) — declaration-shaped lines the extractor could not read; they count in neither the numerator nor the denominator above.`);
  }
  if (r.advisories?.length) {
    lines.push(`\n${r.advisories.length} advisory note(s) — reported, not gating:`);
    for (const a of r.advisories) {
      if (a.rule === 'unreferenced-text-sibling') {
        lines.push(
          `  - [${a.rule}] ${a.token}: nothing references it, so no typographic role could be inferred — but tokens in "${a.group}" were. It emits as a length, or is dropped entirely if its unit is em. On Compose, stamping $extensions["${EXT_NS}"].nativeUnit = "text" on it in source settles it; on Swift there is no sp/dp distinction to settle, and a stamped em still would not emit there. Leave it as is if it is not a text value.`,
        );
        continue;
      }
      if (a.rule === 'dual-node') {
        const shown = a.paths.slice(0, 5).join(', ');
        const more = a.paths.length > 5 ? `, ...and ${a.paths.length - 5} more` : '';
        lines.push(
          `  - [${a.rule}] ${a.paths.length} node(s) carry both a $value and child tokens: ${shown}${more}. DTCG §6.1 makes that invalid — an object cannot be both a token and a group — and §6.2 defines $root as the way a group carries a base value alongside children. The build handles this shape and will keep handling it; nothing here is broken. Rewrite them as $root only if you want the source to conform.`,
        );
        continue;
      }
      if (a.rule === 'ambiguous-text-role') {
        lines.push(
          `  - [${a.rule}] ${a.token}: referenced both by typographic member(s) [${a.textLeaves.join(', ')}] and by [${a.otherLeaves.join(', ')}], so no role was inferred rather than a role being guessed. Stamp $extensions["${EXT_NS}"].nativeUnit in source to settle it.`,
        );
        continue;
      }
      lines.push(
        `  - [${a.rule}] ${a.symbol}: source ${JSON.stringify(a.source)} for ${a.token} is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted ${a.emitted}, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.`,
      );
    }
  }
  if (r.unemittedTokens) {
    const paths = r.unemittedPaths ?? [];
    const shown = paths.slice(0, 10).join(', ');
    const more = paths.length > 10 ? `, ...and ${paths.length - 10} more` : '';
    lines.push(
      `\n${r.unemittedTokens} source token(s) had no matching emitted symbol${paths.length ? `: ${shown}${more}` : ''}.` +
        ' A value with no native form is filtered out of native output rather than emitted broken — a CSS construct nested inside another function is the common case.',
    );
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
