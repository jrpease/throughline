// Composing a screen in code: the inventory a composer may use, a check of its
// plan before any code is written, and the gate a composed file must pass. Run
// by /throughline:compose-code from the plugin (or .throughline/scripts).
//
//   node scripts/compose-code.mjs inventory --system <dir> --package <spec>
//   node scripts/compose-code.mjs check --system <dir> --package <spec> --plan <plan.json>
//   node scripts/compose-code.mjs gate --system <dir> --package <spec> --tokens <file>...
//        --plan <plan.json> --file <screen.tsx>
//
// PLAN: { screen, file, components: [{ name, variants?: { [axis]: value } }] }
//   `file` is resolved against the working directory.
//
// Exit: 0 ok, 1 errors or failures, 2 usage or unreadable input.
//
// Spec: docs/specs/2026-10-13-compose-code-screen.md
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { normalizeName } from './lib/source-scan.mjs';
import { nearestNames } from './lib/figma-compose.mjs';
import {
  extract, validate, formatReport, partOwner, blankComments,
  buildTokenValues, skippedColourTokens, buildDimensionValues,
} from './validate-adherence.mjs';

export const COMPOSED_MARKER = (screen) => `// Composed by throughline: ${screen}.`;
const MARKER_LINE = /^\/\/ Composed by throughline: (.*)\.$/;
const DIRECTIVE = /^(['"])use [a-z]+\1;?$/;

// The screen a file's marker names, '' for a file with no marker. The marker is
// line 1, or line 2 after a directive ('use client').
export function readMarker(text) {
  const lines = String(text).split('\n').map((l) => l.trim());
  const at = DIRECTIVE.test(lines[0] ?? '') ? 1 : 0;
  return lines[at]?.match(MARKER_LINE)?.[1] ?? '';
}

export function codeInventory({ manifest, index, pkg }) {
  const records = new Map((index?.components ?? []).map((c) => [normalizeName(c.name), c]));
  const components = (manifest?.components?.built ?? []).map((name) => {
    const r = records.get(normalizeName(name));
    if (!r) return { name, documented: false, variants: {}, states: [] };
    return {
      name,
      documented: true,
      summary: r.summary,
      whenToUse: r.whenToUse ?? [],
      whenNotToUse: r.whenNotToUse ?? [],
      variants: Object.fromEntries(Object.entries(r.variants ?? {}).map(([axis, values]) => [axis, Object.keys(values)])),
      states: Object.keys(r.states ?? {}),
    };
  });
  return { package: pkg, components };
}

const fold = (s) => normalizeName(s);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// existing: null (no file at plan.file) or the marker's screen name ('' unmarked).
export function checkPlan(plan, inventory, { existing = null } = {}) {
  const errors = [];
  const err = (kind, path, asked, extra = {}) => errors.push({ kind, path, asked, ...extra });

  if (!isObject(plan)) return { ok: false, errors: [{ kind: 'invalid', path: '', asked: plan }], plan: null };
  for (const key of Object.keys(plan)) {
    if (!['screen', 'file', 'components'].includes(key)) err('invalid', key, plan[key]);
  }
  if (typeof plan.screen !== 'string' || !plan.screen.trim()) err('invalid', 'screen', plan.screen);
  if (typeof plan.file !== 'string' || !plan.file.trim()) err('invalid', 'file', plan.file);
  if (!Array.isArray(plan.components)) err('invalid', 'components', plan.components);

  if (existing !== null && existing !== plan.screen) err('name-taken', 'file', plan.file, { marked: existing || null });

  const resolved = [];
  for (const [i, c] of (Array.isArray(plan.components) ? plan.components : []).entries()) {
    const path = `components[${i}]`;
    if (!isObject(c) || typeof c.name !== 'string') { err('invalid', path, c); continue; }
    for (const key of Object.keys(c)) if (!['name', 'variants'].includes(key)) err('invalid', `${path}.${key}`, c[key]);
    const found = inventory.components.find((x) => fold(x.name) === fold(c.name));
    if (!found) {
      err('missing-component', `${path}.name`, c.name, { nearest: nearestNames(c.name, inventory.components.map((x) => x.name)) });
      continue;
    }
    const variants = {};
    if (c.variants !== undefined && !isObject(c.variants)) err('invalid', `${path}.variants`, c.variants);
    for (const [axis, value] of Object.entries(isObject(c.variants) ? c.variants : {})) {
      const realAxis = Object.keys(found.variants).find((a) => fold(a) === fold(axis));
      if (!realAxis) { err('unknown-prop', `${path}.variants.${axis}`, axis); continue; }
      const realValue = found.variants[realAxis].find((v) => fold(v) === fold(value));
      if (!realValue) { err('unknown-option', `${path}.variants.${axis}`, value, { options: found.variants[realAxis] }); continue; }
      variants[realAxis] = realValue;
    }
    resolved.push({ name: found.name, variants });
  }

  const ok = errors.length === 0;
  return { ok, errors, plan: ok ? { screen: plan.screen, file: plan.file, components: resolved } : null };
}

// Default-scale Tailwind spacing, sizing and type-size utilities. Throughline's
// generated preset extends only colours, radius and font family, so these are
// Tailwind's own values, not tokens. 0 is allowed; arbitrary values (`-[…]`) are
// the gate's.
const SCALE_UTILITY =
  /(?<![\w-])(?:[\w-]+:)*-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|w|h|size|min-w|min-h|max-w|max-h|inset(?:-[xy])?|top|right|bottom|left|text|leading|tracking)-(?:0\.\d+|[1-9]\d*(?:\.\d+)?|px|xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g;
const NATIVE_CONTROL = /<(button|input|select|textarea)\b/g;

const lineOf = (text, i) => text.slice(0, i).split('\n').length;

export function gateFile({ file, text, plan, manifest, index, tokenDicts, pkg }) {
  const extracted = extract(text, pkg, file);
  const r = validate({
    built: manifest?.components?.built ?? [],
    index,
    tokenValues: buildTokenValues(tokenDicts),
    colourSkipped: skippedColourTokens(tokenDicts),
    dimensionValues: buildDimensionValues(tokenDicts),
    files: [{ path: file, ...extracted }],
    walked: 1,
  });

  // On one file, known components that set no variant prop are normal; the plan
  // check already validated every variant value against the same index.
  const failures = r.failures.filter((f) => f.rule !== 'variant-rule-inert');
  const advisories = [...r.advisories, ...r.failures.filter((f) => f.rule === 'variant-rule-inert')];

  for (const l of extracted.literals) failures.push({ rule: 'raw-value', written: l.value, file, line: l.line });
  for (const d of extracted.dimensions) failures.push({ rule: 'raw-value', written: d.written, file, line: d.line });

  const code = blankComments(text, file);
  for (const m of code.matchAll(SCALE_UTILITY)) failures.push({ rule: 'scale-utility', written: m[0], file, line: lineOf(code, m.index) });
  for (const m of code.matchAll(NATIVE_CONTROL)) failures.push({ rule: 'off-plan', written: `<${m[1]}>`, file, line: lineOf(code, m.index) });

  const planned = (plan?.components ?? []).map((c) => c.name);
  const plannedKeys = new Set(planned.map(fold));
  for (const e of extracted.elements) {
    if (plannedKeys.has(fold(e.component)) || partOwner(e.component, planned)) continue;
    failures.push({ rule: 'off-plan', written: `<${e.component}>`, file, line: e.line });
  }

  return { ...r, ok: failures.length === 0, failures, advisories };
}

const COMPOSER_RULES = {
  'raw-value': (f) => `${f.written} at ${f.file}:${f.line} — write a token variable, not a raw value`,
  'scale-utility': (f) => `${f.written} at ${f.file}:${f.line} — Tailwind's default scale, not a token; use a token variable (\`-[var(--…)]\`)`,
  'off-plan': (f) => `${f.written} at ${f.file}:${f.line} — not a planned system component; use one from the plan, or check the plan again`,
};

export function formatGateReport(r) {
  const own = r.failures.filter((f) => COMPOSER_RULES[f.rule]);
  const lines = formatReport({ ...r, failures: r.failures.filter((f) => !COMPOSER_RULES[f.rule]) });
  if (own.length) {
    lines.push(`\n${own.length} composer failure(s):`);
    for (const f of own) lines.push(`  - [${f.rule}] ${COMPOSER_RULES[f.rule](f)}`);
  }
  lines.push(r.ok ? '\ncompose-code gate: pass' : '\ncompose-code gate: FAIL');
  return lines;
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  let values;
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        system: { type: 'string' },
        package: { type: 'string' },
        tokens: { type: 'string', multiple: true, default: [] },
        plan: { type: 'string' },
        file: { type: 'string' },
      },
    }));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const usage = () => {
    console.error('usage: compose-code.mjs inventory|check|gate --system <dir> --package <spec> [--plan <file>] [--tokens <file>...] [--file <path>]');
    process.exit(2);
  };
  if (!['inventory', 'check', 'gate'].includes(mode) || !values.system || !values.package) usage();
  if (mode !== 'inventory' && !values.plan) usage();
  if (mode === 'gate' && (!values.file || values.tokens.length === 0)) usage();

  const read = (p, what, parse = true) => {
    try {
      const text = readFileSync(p, 'utf8');
      return parse ? JSON.parse(text) : text;
    } catch (e) {
      console.error(`cannot read ${what} at ${p}: ${e.message}`);
      process.exit(2);
    }
  };
  const manifest = read(join(values.system, 'design-system.json'), 'the manifest');
  const index = read(join(values.system, 'design-system/docs/index.json'), 'the docs index (run docs:digest first)');
  const inventory = codeInventory({ manifest, index, pkg: values.package });

  if (mode === 'inventory') {
    console.log(JSON.stringify(inventory, null, 2));
    return;
  }

  const plan = read(values.plan, 'the plan');
  if (mode === 'check') {
    const target = typeof plan?.file === 'string' ? resolve(plan.file) : null;
    const existing = target && existsSync(target) ? readMarker(read(target, 'the target file', false)) : null;
    const res = checkPlan(plan, inventory, { existing });
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  }

  const r = gateFile({
    file: values.file,
    text: read(values.file, 'the screen file', false),
    plan,
    manifest,
    index,
    tokenDicts: values.tokens.map((f) => read(f, 'a token source')),
    pkg: values.package,
  });
  for (const line of formatGateReport(r)) console.log(line);
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
