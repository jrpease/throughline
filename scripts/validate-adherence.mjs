// Code adherence gate: does the code using this design system still use it?
//
// Same shape as validate-token-output.mjs — pure extract/validate/formatReport
// plus a thin CLI — one layer further out. That gate checks generated token
// output against its source; this one checks hand-written or generated APP code
// against the system's own records.
//
// Spec: docs/superpowers/specs/2026-08-31-code-adherence-gate-design.md
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { walk, normalizeName } from './lib/source-scan.mjs';
import { flattenDtcg, resolveValue } from './lib/dtcg.mjs';

// Named imports from one package, alias included: `{ Card as Panel }`.
const IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
// An opening JSX tag on a capitalised name, with its attribute text.
const ELEMENT = /<([A-Z][A-Za-z0-9]*)\b([^>]*?)\/?>/g;
// One attribute: name="literal" or name={expression}. The capture is undefined
// for the expression form, which is how a blind spot stays visible.
const ATTR = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{)/g;
// Hex only. Decision 4: a token authored rgb()/hsl() and a literal written the
// same way are counted uncomparable rather than normalised into each other.
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

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

export function extract(text, pkg) {
  const imported = new Map();
  for (const m of text.matchAll(IMPORT)) {
    if (m[2] !== pkg) continue;
    for (const part of m[1].split(',')) {
      const [declared, local] = part.trim().split(/\s+as\s+/);
      if (declared) imported.set((local ?? declared).trim(), declared.trim());
    }
  }

  const usages = [];
  for (const el of text.matchAll(ELEMENT)) {
    const declared = imported.get(el[1]);
    if (!declared) continue;
    const line = lineOf(text, el.index);
    for (const a of el[2].matchAll(ATTR)) {
      usages.push({ component: declared, attr: a[1], value: a[2] ?? a[3] ?? null, line });
    }
  }

  const literals = [];
  for (const h of text.matchAll(HEX)) {
    const value = normalizeHex(h[0]);
    if (value) literals.push({ value, line: lineOf(text, h.index) });
  }

  return { imported, usages, literals };
}

// value -> the token paths that hold it. Repeatable --tokens, because a real
// system spans mode files with different values for one path, which is why
// findModeCollisions exists at all; here every file simply contributes, and a
// value held by more than one token names all of them.
//
// resolveValue throws on an unknown path and on a cycle. A gate that reports
// must not die mid-report, so every resolution is wrapped and a token that
// cannot be resolved is skipped.
export function buildTokenValues(dicts) {
  const out = new Map();
  for (const dict of dicts) {
    const flat = flattenDtcg(dict);
    for (const path of Object.keys(flat)) {
      let resolved;
      try {
        resolved = resolveValue(path, flat);
      } catch {
        continue;
      }
      const hex = normalizeHex(resolved);
      if (!hex) continue;
      if (!out.has(hex)) out.set(hex, []);
      out.get(hex).push(path);
    }
  }
  return out;
}

export function validate({
  built = [],
  index = { components: [] },
  tokenValues = new Map(),
  files = [],
  skip = [],
}) {
  const off = new Set(skip);
  const builtKeys = new Map(built.map((n) => [normalizeName(n), n]));
  const records = new Map((index.components ?? []).map((c) => [normalizeName(c.name), c]));

  const failures = [];
  const advisories = [];
  const stats = {
    usages: 0,
    literals: 0,
    files: files.length,
    axisMatched: 0,
    axisUnmatched: 0,
    dynamic: 0,
    knownComponents: new Set(),
    undocumented: new Set(),
  };

  for (const { path, usages, literals } of files) {
    for (const u of usages) {
      stats.usages += 1;
      const key = normalizeName(u.component);
      const declaredName = builtKeys.get(key);

      if (!declaredName) {
        if (!off.has('unknown-component')) {
          failures.push({ rule: 'unknown-component', component: u.component, file: path, line: u.line });
        }
        continue;
      }
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
        failures.push({ rule: 'token-exists-for-literal', value: l.value, tokens, file: path, line: l.line });
      }
    }
  }

  // Decision 7 applied to the scan itself, not just to each rule. Every rule can
  // be individually satisfied while the walk found no code — wrong --root, a
  // --package specifier the app does not import under, an app directory that is
  // empty. That run reported a clean pass having read nothing, which is the
  // green light every other rule here exists to prevent.
  if (stats.usages === 0 && stats.literals === 0) {
    failures.push({ rule: 'nothing-scanned', files: stats.files });
  }

  // Decision 7, per rule. A rule with nothing to work on has verified nothing,
  // and a green run that verified nothing is the failure class this project
  // keeps filing issues about. A rule the caller switched off is absent, not
  // inert.
  if (!off.has('token-exists-for-literal') && tokenValues.size === 0) {
    failures.push({ rule: 'colour-rule-inert' });
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

  return { ok: failures.length === 0, failures, advisories, stats, skipped: [...off] };
}

export function formatReport(r) {
  const s = r.stats;
  const lines = [
    `tokens:validate-adherence — ${s.usages} usages, ${s.literals} colour literals, ${s.files} files`,
    `  components:   ${s.knownComponents.size} referenced, ${s.undocumented.size} undocumented`,
    `  variant axes: ${s.axisMatched} of ${s.axisMatched + s.axisUnmatched} literal attributes matched a declared axis`,
    `  not read:     ${s.dynamic} of ${s.usages} attributes are expressions, not literals`,
  ];
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
      } else if (f.rule === 'nothing-scanned') {
        lines.push(
          `  - [${f.rule}] ${f.files} file(s) yielded no component reference and no colour literal, so this run verified nothing. Check --root points at the consuming app, and that --package is the specifier that app actually imports from.`,
        );
      } else if (f.rule === 'colour-rule-inert') {
        lines.push(
          `  - [${f.rule}] no token file yielded a comparable hex value, so nothing was checked against. Pass --tokens, or --skip token-exists-for-literal if this system has no colour tokens.`,
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
  const tokenValues = buildTokenValues((values.tokens ?? []).map((f) => read(f, 'a token source')));

  const files = [];
  let walked;
  try {
    walked = [...walk(values.root, { fileFilter: /\.(tsx?|jsx?|mjs|cjs|css|scss|sass|vue|svelte)$/ })];
  } catch (e) {
    console.error(`cannot scan --root ${values.root}: ${e.message}`);
    process.exit(2);
  }
  for (const path of walked) {
    const { usages, literals } = extract(readFileSync(path, 'utf8'), values.package);
    if (usages.length || literals.length) files.push({ path, usages, literals });
  }

  const r = validate({
    built: manifest.components?.built ?? [],
    index,
    tokenValues,
    files,
    skip: values.skip,
  });
  for (const line of formatReport(r)) console.log(line);
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
