// Code adherence gate: does the code using this design system still use it?
//
// Same shape as validate-token-output.mjs — pure extract/validate/formatReport
// plus a thin CLI — one layer further out. That gate checks generated token
// output against its source; this one checks hand-written or generated APP code
// against the system's own records.
//
// Spec: docs/superpowers/specs/2026-08-31-code-adherence-gate-design.md
// Colour-rule narrowing (#123): docs/specs/2026-09-11-narrow-colour-rule.md
// Dimension rules (#39): docs/specs/2026-09-11-dimension-rules.md
// Component-rule narrowing (#120): docs/specs/2026-09-11-narrow-component-rule.md
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { join, dirname, relative, sep } from 'node:path';
import { walk, normalizeName } from './lib/source-scan.mjs';
import { flattenDtcg, flattenDtcgTypes, resolveValue } from './lib/dtcg.mjs';

// Named imports from one package, alias included: `{ Card as Panel }`.
const IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
// An opening JSX tag on a capitalised name, with an optional `.Member` chain
// and its attribute text, where a `<` straight after an identifier character
// is a type argument (`useState<Variant>`), not a tag.
const ELEMENT = /(?<![\w$.])<([A-Z][A-Za-z0-9]*)((?:\.[A-Za-z][A-Za-z0-9]*)*)\b([^>]*?)\/?>/g;
// One attribute: name="literal" or name={expression}. The capture is undefined
// for the expression form, which is how a blind spot stays visible.
const ATTR = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{)/g;
// Hex and opaque integer rgb()/rgba() are compared (see rgbToHex). hsl() and
// alpha below 1 are not.
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGB = /\brgba?\([^()]*\)/gi;

// Dimension rules (#39): docs/specs/2026-09-11-dimension-rules.md. A property
// name maps to its category once the punctuation is gone: lowercase, hyphens
// stripped, so `padding-inline-start` and `paddingInlineStart` are both
// `paddinginlinestart`.
const SPACING_SUFFIXES = [
  '',
  'top',
  'right',
  'bottom',
  'left',
  'inline',
  'block',
  'inlinestart',
  'inlineend',
  'blockstart',
  'blockend',
];
const RADIUS_CORNERS = ['', 'topleft', 'topright', 'bottomright', 'bottomleft', 'startstart', 'startend', 'endstart', 'endend'];
const PROPERTY_CATEGORIES = new Map();
for (const base of ['padding', 'margin']) {
  for (const suffix of SPACING_SUFFIXES) PROPERTY_CATEGORIES.set(base + suffix, 'spacing');
}
for (const name of ['gap', 'rowgap', 'columngap', 'gridgap', 'gridrowgap', 'gridcolumngap']) {
  PROPERTY_CATEGORIES.set(name, 'spacing');
}
for (const corner of RADIUS_CORNERS) {
  PROPERTY_CATEGORIES.set(`border${corner}radius`, 'radius');
}
PROPERTY_CATEGORIES.set('fontsize', 'font-size');
PROPERTY_CATEGORIES.set('lineheight', 'line-height');
PROPERTY_CATEGORIES.set('letterspacing', 'letter-spacing');
PROPERTY_CATEGORIES.set('fontweight', 'font-weight');

// `property: value`, value running to the next `;`, `{`, `}`, `,` or newline —
// that comma is what separates `{ fontSize: 13, marginTop: 16 }` into two
// declarations rather than one.
const DECLARATION = /(?<![\w$@.#-])([a-zA-Z][a-zA-Z-]*)\s*:\s*([^;{}\n,]*)/g;
// A bare, px, rem, em or % number, not abutting a word character, `.`, `#`,
// `$`, `%` or `(` on either side — that keeps it out of `#3b82f6` and `calc(`.
const VALUE_NUMBER = /(?<![\w.#$%-])-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)?(?![\w.%(-])/g;
// A Tailwind arbitrary value, including after a variant like `md:`. `tw-`
// prefixes are excluded by the lookbehind: the character right before the
// utility can't be a word character or `-`.
const TAILWIND =
  /(?<![\w-])(-?)(p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?|text|leading|tracking|font)-\[([^\]\s]+)\]/g;
const SCRIPT_FILE = /\.(tsx?|jsx?|mjs|cjs|vue|svelte)$/;

// One starting p, m, gap or space is spacing; rounded is radius; text, leading,
// tracking and font are the four type properties.
function tailwindCategory(utility) {
  if (utility.startsWith('p') || utility.startsWith('m') || utility.startsWith('gap') || utility.startsWith('space')) {
    return 'spacing';
  }
  if (utility.startsWith('rounded')) return 'radius';
  if (utility === 'text') return 'font-size';
  if (utility === 'leading') return 'line-height';
  if (utility === 'tracking') return 'letter-spacing';
  if (utility === 'font') return 'font-weight';
  return null;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// Every character but a newline becomes a space, so an index into the blanked
// text is the same line in the original.
const spaces = (s) => s.replace(/[^\n]/g, ' ');

// A hex inside a comment is not code: `var(--signal-500); /* #5B7FFF */` already
// uses the token. One pass, leftmost opener wins, so a `/*` inside a `//`
// comment cannot pair with a real `*/` lines later. `//` is not a comment in
// plain CSS, and after a `:` it is a URL. An unterminated `/*` is left alone,
// which errs toward flagging. Strings are not tracked; that would be a parser.
export function blankComments(text, path = '') {
  const re = path.endsWith('.css') ? /\/\*[\s\S]*?\*\//g : /\/\*[\s\S]*?\*\/|(?<!:)\/\/[^\n]*/g;
  return text.replace(re, spaces);
}

// In `mask: linear-gradient(#fff 0 0) content-box, ...` only alpha matters, so
// the value of a `mask` or `-webkit-mask` declaration is not a colour. The
// lookbehind keeps `--mask`, `$mask` and `.mask` flagging; `mask-image` and the
// other `mask-*` properties never match. CSS and SCSS only: `.sass` has no `;`
// to end the value, and in script a value ending at `}` could swallow a sibling
// property's real hex.
const MASK = /(?<![\w$@.#-])(?:-webkit-)?mask\s*:([^;{}]*)/g;
export function blankMasks(text, path = '') {
  if (!/\.s?css$/.test(path)) return text;
  return text.replace(MASK, (m, value) => m.slice(0, m.length - value.length) + spaces(value));
}

// `var(--space-4, 16px)` is correct code — the 16px is the token's fallback —
// and `calc()`, `clamp()`, `min()` and `max()` arguments are arithmetic, not
// scale steps. Every character between a `(` and its matching `)` becomes a
// space; an unclosed `(` blanks to the end of the value. Length is unchanged,
// so it stays safe to run before VALUE_NUMBER's index-based line lookup.
export function blankParens(value) {
  let depth = 0;
  let out = '';
  for (const ch of value) {
    if (ch === '(') {
      depth += 1;
      out += ' ';
    } else if (ch === ')' && depth > 0) {
      depth -= 1;
      out += ' ';
    } else if (depth > 0) {
      out += ' ';
    } else {
      out += ch;
    }
  }
  return out;
}

// The only false positives the dimension-rule prototype found were the
// `font-weight` descriptors inside `@font-face { … }`, which describe a font
// file, not a scale step. Blanked before dimensions are read, same shape as
// blankComments.
const FONT_FACE = /@font-face\s*\{[^}]*\}/g;
export function blankFontFaces(text) {
  return text.replace(FONT_FACE, spaces);
}

// #abc -> #aabbcc; #aabbccff -> #aabbcc (opaque alpha carries no information);
// a real alpha is kept, because two colours differing only in alpha are two
// colours. Anything not hex returns null and is never compared.
export function normalizeHex(value) {
  const v = String(value).trim().toLowerCase();
  if (!/^#[0-9a-f]{3,8}$/.test(v)) return null;
  let hex = v.slice(1);
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
  if (hex.length === 8 && hex.endsWith('ff')) hex = hex.slice(0, 6);
  if (hex.length !== 6 && hex.length !== 8) return null;
  return '#' + hex;
}

// rgb(59, 130, 246) -> #3b82f6. Only whole channels 0-255 and an opaque alpha
// (absent, 1, 1.0 or 100%) are comparable; anything else — percentages,
// var(), a real alpha — returns null and is never guessed at.
export function rgbToHex(value) {
  const m = String(value).trim().match(/^rgba?\(\s*([^()]*)\)$/i);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channels = parts.slice(0, 3);
  for (const c of channels) {
    if (!/^\d{1,3}$/.test(c) || Number(c) > 255) return null;
  }
  if (parts.length === 4 && !/^(1(\.0+)?|100%)$/.test(parts[3])) return null;
  const hex = channels.map((c) => Number(c).toString(16).padStart(2, '0')).join('');
  return normalizeHex('#' + hex);
}

export function extract(text, pkg, path = '') {
  const code = blankComments(text, path);

  const imported = new Map();
  for (const m of code.matchAll(IMPORT)) {
    if (m[2] !== pkg) continue;
    for (const part of m[1].split(',')) {
      const [declared, local] = part.trim().split(/\s+as\s+/);
      if (declared) imported.set((local ?? declared).trim(), declared.trim());
    }
  }

  const elements = [];
  const usages = [];
  for (const el of code.matchAll(ELEMENT)) {
    const declared = imported.get(el[1]);
    if (!declared) continue;
    // <Icons.Folder> is a member of something the system exports and is left
    // alone (#120).
    if (el[2]) continue;
    const line = lineOf(code, el.index);
    elements.push({ component: declared, line });
    for (const a of el[3].matchAll(ATTR)) {
      usages.push({ component: declared, attr: a[1], value: a[2] ?? a[3] ?? null, line });
    }
  }

  // Import, element and hex extraction all read comment-blanked text, and
  // only hex also has masks blanked.
  const colourText = blankMasks(code, path);
  const literals = [];
  for (const h of colourText.matchAll(HEX)) {
    const value = normalizeHex(h[0]);
    if (value) literals.push({ value, line: lineOf(colourText, h.index) });
  }
  for (const m of colourText.matchAll(RGB)) {
    const value = rgbToHex(m[0]);
    if (value) literals.push({ value, line: lineOf(colourText, m.index) });
  }

  return { imported, elements, usages, literals, dimensions: extractDimensions(text, path) };
}

// value -> the token paths that hold it. Repeatable --tokens, because a real
// system spans mode files with different values for one path, which is why
// findModeCollisions exists at all; here every file simply contributes, and a
// value held by more than one token names all of them.
//
// resolveValue throws on an unknown path and on a cycle. A gate that reports
// must not die mid-report, so every resolution is wrapped and a token that
// cannot be resolved is skipped, and counted by skippedColourTokens.
export function buildTokenValues(dicts) {
  const out = new Map();
  for (const t of resolvedTokens(dicts)) {
    if (!t.resolves) continue;
    const hex = normalizeHex(t.value) ?? rgbToHex(t.value);
    if (!hex) continue;
    if (!out.has(hex)) out.set(hex, []);
    out.get(hex).push(t.path);
  }
  return out;
}

// Every token in every --tokens file, resolved against all of them (#121). A
// semantic file aliases primitives in another file, and resolving each file
// alone skipped every one of those aliases. A file's own paths win over the
// pool, so two mode files defining one path differently each keep their own
// value; a path defined in several OTHER files resolves to the last one given.
// An alias that names no path in any file stays unresolvable. That includes a
// collection-relative `{canvas}` meaning `color-primitive.canvas`, which is an
// export quirk rather than DTCG, and is counted rather than guessed at.
//
// The `source` index is the dict a token came from, which is what lets a caller
// group a system's tokens by mode, since one --tokens file is one mode:
// scripts/verify-check.mjs reads it that way for the color-contrast rule.
export function* resolvedTokens(dicts) {
  const flats = dicts.map((d) => flattenDtcg(d));
  const pool = Object.assign({}, ...flats);
  for (const [i, dict] of dicts.entries()) {
    const flat = flats[i];
    const lookup = { ...pool, ...flat };
    const types = flattenDtcgTypes(dict);
    for (const path of Object.keys(flat)) {
      let value;
      try {
        value = resolveValue(path, lookup);
      } catch {
        yield { path, type: types[path], resolves: false, source: i };
        continue;
      }
      yield { path, type: types[path], resolves: true, value, source: i };
    }
  }
}

// Decision 4: a colour token the gate cannot compare is skipped AND counted, so
// the report shows the blind spot. Only tokens whose effective $type is `color`
// are counted — an untyped token that resolves to hex is still compared, but
// one that does not could be anything, and counting a font family as a skipped
// colour would bury the number that matters.
export function skippedColourTokens(dicts) {
  const skipped = { unresolvable: 0, nonHex: 0 };
  for (const t of resolvedTokens(dicts)) {
    if (t.type !== 'color') continue;
    if (!t.resolves) skipped.unresolvable += 1;
    else if (!(normalizeHex(t.value) ?? rgbToHex(t.value))) skipped.nonHex += 1;
  }
  return skipped;
}

// Dimension rules (#39): docs/specs/2026-09-11-dimension-rules.md. Same shape
// as buildTokenValues, one layer over: a token's category comes from the words
// in its path (DTCG's `dimension` type doesn't say what a length is for), and
// its raw value is canonicalised to a comparable string within that category
// before values across dicts are pooled.
export const DIMENSION_CATEGORIES = [
  'spacing',
  'radius',
  'font-size',
  'line-height',
  'letter-spacing',
  'font-weight',
];

// space/spacing/gap/inset/stack/gutter/padding/margin -> spacing; radius/rounded/
// corner -> radius; fontsize/text -> font-size; lineheight/leading -> line-height;
// letterspacing/tracking -> letter-spacing; fontweight -> font-weight. `size` and
// `weight` are ambiguous on their own — a typographic qualifier earlier in the
// path decides them, or they decide nothing.
const DIMENSION_WORDS = {
  space: 'spacing',
  spacing: 'spacing',
  gap: 'spacing',
  inset: 'spacing',
  stack: 'spacing',
  gutter: 'spacing',
  padding: 'spacing',
  margin: 'spacing',
  radius: 'radius',
  rounded: 'radius',
  corner: 'radius',
  fontsize: 'font-size',
  text: 'font-size',
  lineheight: 'line-height',
  leading: 'line-height',
  letterspacing: 'letter-spacing',
  tracking: 'letter-spacing',
  fontweight: 'font-weight',
};
const TYPOGRAPHIC_QUALIFIERS = new Set(['font', 'text', 'typography', 'type']);

export function dimensionCategory(path, type) {
  if (type !== undefined && type !== 'dimension' && type !== 'number' && type !== 'fontWeight') return null;
  if (type === 'fontWeight') return 'font-weight';

  const words = path
    .split('.')
    .flatMap((s) => s.toLowerCase().split(/[-_]/))
    .filter(Boolean);

  for (let i = words.length - 1; i >= 0; i--) {
    const word = words[i];
    if (word === 'size' || word === 'weight') {
      const qualified = words.slice(0, i).some((w) => TYPOGRAPHIC_QUALIFIERS.has(w));
      return qualified ? (word === 'size' ? 'font-size' : 'font-weight') : null;
    }
    if (word in DIMENSION_WORDS) return DIMENSION_WORDS[word];
  }
  return null;
}

// A dimension is comparable only within its own category, in one canonical
// unit per category: px (rem folds in at 16px per rem, per the system's own
// build), em standing alone, unitless line-height, and a whole-number
// font-weight string. `unitless` says what a bare number means for a length
// category — 'px' for a literal read from a script file's inline style, null
// everywhere else. Zero and percentages are never comparable, on either side.
export function canonicalDimension(raw, category, unitless) {
  let n;
  let unit;
  if (typeof raw === 'number') {
    n = raw;
    unit = '';
  } else if (typeof raw === 'string') {
    const m = raw.trim().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em|%)?$/);
    if (!m) return null;
    n = Number(m[1]);
    unit = m[2] ?? '';
  } else {
    return null;
  }

  if (!Number.isFinite(n) || n === 0 || unit === '%') return null;
  const r3 = (x) => {
    const rounded = Math.round(x * 1000) / 1000;
    return rounded === 0 ? 0 : rounded;
  };

  if (category === 'font-weight') {
    return unit === '' && Number.isInteger(n) && n > 0 && n <= 1000 ? String(n) : null;
  }
  if (category === 'line-height' && unit === '') return String(r3(n));
  if (unit === 'em') return `${r3(n)}em`;
  if (unit === 'rem') return `${r3(n * 16)}px`;
  if (unit === 'px') return `${r3(n)}px`;
  return unitless === 'px' ? `${r3(n)}px` : null;
}

// Same shape as buildTokenValues: every dict contributes, a value maps to the
// token paths that hold it, and a token that cannot be resolved is skipped
// rather than thrown on. One category per token — matching within a category
// only is the point, per the spec's measurement.
export function buildDimensionValues(dicts) {
  const out = new Map();
  for (const t of resolvedTokens(dicts)) {
    const category = dimensionCategory(t.path, t.type);
    if (!category || !t.resolves) continue;
    const value = canonicalDimension(t.value, category, 'px');
    if (!value) continue;
    if (!out.has(category)) out.set(category, new Map());
    const inner = out.get(category);
    if (!inner.has(value)) inner.set(value, []);
    inner.get(value).push(t.path);
  }
  return out;
}

// Same two shapes source is read: a `property: value` declaration in CSS,
// SCSS, inline styles or CSS in strings, and a Tailwind arbitrary value like
// `p-[16px]`. Comments and @font-face descriptors are blanked first, same as
// the colour rule; numbers inside parentheses are blanked per-declaration, so
// a var() fallback or a calc() argument is never read as a scale step.
export function extractDimensions(text, path = '') {
  const t = blankFontFaces(blankComments(text, path));
  const out = [];

  for (const m of t.matchAll(DECLARATION)) {
    const category = PROPERTY_CATEGORIES.get(m[1].toLowerCase().replace(/-/g, ''));
    if (!category) continue;
    const quoted = /^\s*['"`]/.test(m[2]);
    const v = blankParens(m[2].replace(/['"`]/g, ' '));
    for (const n of v.matchAll(VALUE_NUMBER)) {
      const value = canonicalDimension(n[0], category, SCRIPT_FILE.test(path) && !quoted ? 'px' : null);
      if (value) out.push({ category, written: n[0], value, line: lineOf(t, m.index) });
    }
  }

  for (const m of t.matchAll(TAILWIND)) {
    if (m[1] === '-' && m[3].startsWith('-')) continue;
    const category = tailwindCategory(m[2]);
    if (!category) continue;
    const value = canonicalDimension(m[1] + m[3], category, null);
    if (value) out.push({ category, written: `${m[1]}${m[2]}-[${m[3]}]`, value, line: lineOf(t, m.index) });
  }

  return out;
}

// The package that owns a --tokens file is not its own consumer. Walked from
// libs/ or packages/, the gate otherwise reads the token package's generated
// css/tokens.css and fails every primitive for duplicating itself. The owner is
// the nearest directory at or above the file holding a package.json. It is kept
// only when it sits strictly beneath --root: an owner that is the root, or
// contains it, is a single-package app, and excluding it would exclude the app.
export function tokenPackageDirs(tokenFiles, root) {
  const realRoot = realpathSync(root);
  const dirs = new Set();
  for (const file of tokenFiles) {
    let dir = dirname(realpathSync(file));
    while (!existsSync(join(dir, 'package.json'))) {
      const up = dirname(dir);
      if (up === dir) {
        dir = null;
        break;
      }
      dir = up;
    }
    if (dir && dir.startsWith(realRoot + sep)) dirs.add(dir);
  }
  return [...dirs];
}

// Component-rule narrowing (#120): docs/specs/2026-09-11-narrow-component-rule.md.
// `CardTitle` belongs to `Card`, and so does `ButtonX` — a part name only has to
// start with a built component's name and continue with another capital letter;
// it is not required to spell out a real word after it. The longest matching
// built name wins, so `ButtonGroupText` belongs to `ButtonGroup`, not `Button`.
export function partOwner(name, built) {
  if (!/^[A-Za-z0-9]+$/.test(name)) return null;
  const key = normalizeName(name);
  let best = null;
  let bestKey = '';
  for (const b of built) {
    const k = normalizeName(b);
    if (k === '' || k.length >= key.length || !key.startsWith(k) || !/[A-Z]/.test(name[k.length])) continue;
    if (k.length <= bestKey.length) continue;
    best = b;
    bestKey = k;
  }
  return best;
}

export function validate({
  built = [],
  index = { components: [] },
  tokenValues = new Map(),
  colourSkipped = { unresolvable: 0, nonHex: 0 },
  dimensionValues = new Map(),
  files = [],
  walked = files.length,
  excluded = [],
  skip = [],
}) {
  const off = new Set(skip);
  const builtKeys = new Map(built.map((n) => [normalizeName(n), n]));
  const records = new Map((index.components ?? []).map((c) => [normalizeName(c.name), c]));

  const failures = [];
  const advisories = [];
  const stats = {
    elements: 0,
    usages: 0,
    literals: 0,
    dimensions: 0,
    parts: new Map(),
    colourTokens: [...tokenValues.values()].reduce((n, paths) => n + paths.length, 0),
    colourSkipped,
    dimensionTokens: Object.fromEntries(
      DIMENSION_CATEGORIES.map((c) => [
        c,
        [...(dimensionValues.get(c)?.values() ?? [])].reduce((n, paths) => n + paths.length, 0),
      ]),
    ),
    files: walked,
    axisMatched: 0,
    axisUnmatched: 0,
    dynamic: 0,
    knownComponents: new Set(),
    undocumented: new Set(),
  };

  for (const { path, elements = [], usages, literals, dimensions = [] } of files) {
    for (const e of elements) {
      stats.elements += 1;
      if (off.has('unknown-component') || builtKeys.has(normalizeName(e.component))) continue;
      const owner = partOwner(e.component, built);
      if (owner) {
        if (!stats.parts.has(e.component)) stats.parts.set(e.component, owner);
        continue;
      }
      failures.push({ rule: 'unknown-component', component: e.component, file: path, line: e.line });
    }

    for (const u of usages) {
      stats.usages += 1;
      const key = normalizeName(u.component);
      const declaredName = builtKeys.get(key);

      // Existence is checked once per tag, above. An attribute on an unknown
      // component or a part is counted and nothing more.
      if (!declaredName) continue;
      stats.knownComponents.add(declaredName);

      const record = records.get(key);
      if (!record) {
        if (!stats.undocumented.has(declaredName)) {
          stats.undocumented.add(declaredName);
          advisories.push({ rule: 'undocumented-component', component: declaredName });
        }
        continue;
      }

      if (u.value === null) {
        stats.dynamic += 1;
        advisories.push({ rule: 'dynamic-value', component: declaredName, attr: u.attr, file: path, line: u.line });
        continue;
      }

      const axis = (record.variants ?? {})[u.attr];
      if (axis) {
        stats.axisMatched += 1;
        if (!off.has('unknown-variant-value') && !Object.keys(axis).includes(u.value)) {
          failures.push({
            rule: 'unknown-variant-value',
            component: declaredName,
            attr: u.attr,
            value: u.value,
            declared: Object.keys(axis),
            file: path,
            line: u.line,
          });
        }
      } else if (Object.keys(record.states ?? {}).includes(u.attr)) {
        stats.axisMatched += 1;
      } else {
        stats.axisUnmatched += 1;
        advisories.push({
          rule: 'unmodelled-prop',
          component: declaredName,
          attr: u.attr,
          axes: Object.keys(record.variants ?? {}),
          file: path,
          line: u.line,
        });
      }
    }

    for (const l of literals) {
      stats.literals += 1;
      if (off.has('token-exists-for-literal')) continue;
      const tokens = tokenValues.get(l.value);
      if (tokens) {
        // A path two mode files both resolve to this value is one name to reach
        // for, so it is named once.
        failures.push({
          rule: 'token-exists-for-literal',
          value: l.value,
          tokens: [...new Set(tokens)],
          file: path,
          line: l.line,
        });
      }
    }

    for (const d of dimensions) {
      stats.dimensions += 1;
      if (off.has('token-exists-for-dimension')) continue;
      const tokens = dimensionValues.get(d.category)?.get(d.value);
      if (tokens) {
        failures.push({
          rule: 'token-exists-for-dimension',
          category: d.category,
          written: d.written,
          value: d.value,
          tokens: [...new Set(tokens)],
          file: path,
          line: d.line,
        });
      }
    }
  }

  // Decision 7 applied to the scan itself, not just to each rule. Every rule can
  // be individually satisfied while the walk found no code — wrong --root, a
  // --package specifier the app does not import under, an app directory that is
  // empty. That run reported a clean pass having read nothing, which is the
  // green light every other rule here exists to prevent.
  if (stats.elements === 0 && stats.literals === 0 && stats.dimensions === 0) {
    failures.push({ rule: 'nothing-scanned', files: stats.files });
  }

  // Decision 7, per rule. A rule with nothing to work on has verified nothing,
  // and a green run that verified nothing is the failure class this project
  // keeps filing issues about. A rule the caller switched off is absent, not
  // inert.
  if (!off.has('token-exists-for-literal') && tokenValues.size === 0) {
    failures.push({ rule: 'colour-rule-inert' });
  }
  if (!off.has('token-exists-for-dimension') && dimensionValues.size === 0) {
    failures.push({ rule: 'dimension-rule-inert' });
  }
  if (!off.has('unknown-variant-value') && stats.knownComponents.size > 0 && stats.axisMatched === 0) {
    // `undocumented` rides along because it is often the real cause: an
    // undocumented component is skipped before any axis can match, so a run
    // that referenced nothing else lands here with a message about disagreeing
    // axis names that would send the reader looking in the wrong place.
    failures.push({
      rule: 'variant-rule-inert',
      axes: [...records.values()].flatMap((r) => Object.keys(r.variants ?? {})),
      undocumented: stats.undocumented.size,
    });
  }

  return { ok: failures.length === 0, failures, advisories, stats, skipped: [...off], excluded };
}

export function formatReport(r) {
  const s = r.stats;
  const dimensionTotal = DIMENSION_CATEGORIES.reduce((n, c) => n + s.dimensionTokens[c], 0);
  const lines = [
    `tokens:validate-adherence — ${s.elements} component references, ${s.literals} colour literals, ${s.dimensions} dimension literals, ${s.files} files`,
    `  components:   ${s.knownComponents.size} referenced, ${s.undocumented.size} undocumented`,
  ];
  if (s.parts.size > 0) {
    lines.push(
      `  parts:        ${[...s.parts].map(([p, o]) => `${p} (${o})`).join(', ')} — not in components.built, read as part of the built component each name starts with`,
    );
  }
  lines.push(
    `  variant axes: ${s.axisMatched} of ${s.axisMatched + s.axisUnmatched} literal attributes matched a declared axis`,
    `  not read:     ${s.dynamic} of ${s.usages} attributes are expressions, not literals`,
    `  colour:       ${s.colourTokens} token values comparable, ${s.colourSkipped.unresolvable} skipped as unresolvable, ${s.colourSkipped.nonHex} skipped as non-hex`,
    `  dimensions:   ${dimensionTotal} token values comparable — ${DIMENSION_CATEGORIES.map((c) => `${c} ${s.dimensionTokens[c]}`).join(', ')}`,
  );
  for (const e of r.excluded) {
    lines.push(`  excluded:     ${e.files} file(s) in ${e.dir}, the package that owns --tokens`);
  }
  if (r.skipped.length) lines.push(`  skipped:      ${r.skipped.join(', ')}`);

  if (r.failures.length) {
    lines.push(`\n${r.failures.length} rule failure(s):`);
    for (const f of r.failures) {
      if (f.rule === 'unknown-variant-value') {
        lines.push(
          `  - [${f.rule}] ${f.component} ${f.attr}="${f.value}" at ${f.file}:${f.line} — declared values for "${f.attr}" are ${f.declared.join(', ')}`,
        );
      } else if (f.rule === 'token-exists-for-literal') {
        lines.push(
          `  - [${f.rule}] ${f.value} at ${f.file}:${f.line} — ${f.tokens.join(', ')} resolve${f.tokens.length === 1 ? 's' : ''} to exactly this value`,
        );
      } else if (f.rule === 'unknown-component') {
        lines.push(
          `  - [${f.rule}] <${f.component}> at ${f.file}:${f.line} — not in design-system.json components.built`,
        );
      } else if (f.rule === 'token-exists-for-dimension') {
        lines.push(
          `  - [${f.rule}] ${f.category} ${f.written}${f.written === f.value ? '' : ` (${f.value})`} at ${f.file}:${f.line} — ${f.tokens.join(', ')} resolve${f.tokens.length === 1 ? 's' : ''} to exactly this value`,
        );
      } else if (f.rule === 'nothing-scanned') {
        lines.push(
          `  - [${f.rule}] ${f.files} file(s) yielded no component reference, colour literal or dimension literal, so this run verified nothing. Check --root points at the consuming app, and that --package is the specifier that app actually imports from.`,
        );
      } else if (f.rule === 'colour-rule-inert') {
        lines.push(
          `  - [${f.rule}] no token file yielded a comparable hex value, so nothing was checked against. Pass --tokens, or --skip token-exists-for-literal if this system has no colour tokens.`,
        );
      } else if (f.rule === 'dimension-rule-inert') {
        lines.push(
          `  - [${f.rule}] no token file yielded a comparable spacing, radius or type value, so nothing was checked against. Pass the --tokens file that holds them, or --skip token-exists-for-dimension if this system has none.`,
        );
      } else if (f.rule === 'variant-rule-inert') {
        // Lead with the undocumented count when there is one: it is the likeliest
        // cause, and the axis-name explanation sends the reader elsewhere.
        const cause = f.undocumented
          ? `${f.undocumented} referenced component(s) have no doc record, so their variants could not be checked — run docs:digest. `
          : '';
        lines.push(
          `  - [${f.rule}] components were found but no attribute matched a declared axis, so this rule verified nothing. ${cause}The system declares ${f.axes.join(', ') || '(no axes at all)'}. Either the records and the code disagree about names, or this system's axes are conceptual — --skip unknown-variant-value if so.`,
        );
      }
    }
  }

  if (r.advisories.length) {
    lines.push(`\n${r.advisories.length} advisory note(s) — reported, not gating:`);
    for (const a of r.advisories) {
      if (a.rule === 'unmodelled-prop') {
        lines.push(
          `  - [${a.rule}] ${a.component} "${a.attr}" at ${a.file}:${a.line} — no declared axis or state of that name; the system models this component's axes as ${a.axes.join(', ') || '(none)'}`,
        );
      } else if (a.rule === 'undocumented-component') {
        lines.push(
          `  - [${a.rule}] ${a.component} — built, but has no doc record, so its variants cannot be checked. Run docs:digest after documenting it.`,
        );
      } else if (a.rule === 'dynamic-value') {
        lines.push(
          `  - [${a.rule}] ${a.component} ${a.attr}={…} at ${a.file}:${a.line} — not a literal, so its value could not be read`,
        );
      }
    }
  }
  return lines;
}

function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        root: { type: 'string' },
        system: { type: 'string' },
        package: { type: 'string' },
        tokens: { type: 'string', multiple: true },
        skip: { type: 'string', multiple: true, default: [] },
      },
    }));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  if (!values.root || !values.system || !values.package) {
    console.error(
      'usage: validate-adherence.mjs --root <dir> --system <dir> --package <specifier> --tokens <file> [--tokens <file>...] [--skip <rule>]',
    );
    process.exit(2);
  }

  const read = (p, what) => {
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch (e) {
      console.error(`cannot read ${what} at ${p}: ${e.message}`);
      process.exit(2);
    }
  };

  const manifest = read(join(values.system, 'design-system.json'), 'the manifest');
  const index = read(
    join(values.system, 'design-system/docs/index.json'),
    'the docs index (run docs:digest first)',
  );
  const tokenDicts = (values.tokens ?? []).map((f) => read(f, 'a token source'));
  const tokenValues = buildTokenValues(tokenDicts);
  const colourSkipped = skippedColourTokens(tokenDicts);
  const dimensionValues = buildDimensionValues(tokenDicts);

  const files = [];
  let walked;
  try {
    walked = [...walk(values.root, { fileFilter: /\.(tsx?|jsx?|mjs|cjs|css|scss|sass|vue|svelte)$/ })];
  } catch (e) {
    console.error(`cannot scan --root ${values.root}: ${e.message}`);
    process.exit(2);
  }

  // Partitioned here rather than passed to walk, so the report can count what it
  // set aside. Paths are compared in real form: tmpdir and a symlinked checkout
  // would otherwise never match the realpath'd package dirs.
  const realRoot = realpathSync(values.root);
  const ownerDirs = tokenPackageDirs(values.tokens ?? [], values.root);
  const excludedCounts = new Map(ownerDirs.map((d) => [d, 0]));
  const scanned = [];
  for (const path of walked) {
    const real = join(realRoot, relative(values.root, path));
    const owner = ownerDirs.find((d) => real.startsWith(d + sep));
    if (owner) excludedCounts.set(owner, excludedCounts.get(owner) + 1);
    else scanned.push(path);
  }
  const excluded = [...excludedCounts]
    .filter(([, n]) => n > 0)
    .map(([dir, n]) => ({ dir: join(values.root, relative(realRoot, dir)), files: n }));

  for (const path of scanned) {
    const { elements, usages, literals, dimensions } = extract(readFileSync(path, 'utf8'), values.package, path);
    if (elements.length || usages.length || literals.length || dimensions.length) {
      files.push({ path, elements, usages, literals, dimensions });
    }
  }

  const r = validate({
    built: manifest.components?.built ?? [],
    index,
    tokenValues,
    colourSkipped,
    dimensionValues,
    files,
    walked: scanned.length,
    excluded,
    skip: values.skip,
  });
  for (const line of formatReport(r)) console.log(line);
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
