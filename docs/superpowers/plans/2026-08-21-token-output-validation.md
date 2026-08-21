# Token Output Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a validator that catches generated native token output which is wrong but passes today's checks, and wire it in as a live gate.

**Architecture:** One zero-dependency Node script, `scripts/validate-token-output.mjs`, exporting pure functions and guarded by a `main()` CLI — the exact shape of `scripts/validate-crosswalk.mjs`. It flattens the DTCG source (dual-node aware, unlike the crosswalk flattener), parses `(symbol, value)` pairs out of the generated Swift/Kotlin, and evaluates four rules. It is then installed into the user's repo as an npm script and referenced from `token-sync-layer`'s verification step, replacing wording that let four real failures through.

**Tech Stack:** Node ≥20 ESM, zero dependencies, `node:test` + `node:assert/strict`, `parseArgs` from `node:util`.

**Spec:** `docs/superpowers/specs/2026-08-21-token-output-validation-design.md`

## Global Constraints

- **Zero dependencies.** `scripts/` is "canonical, vetted, **zero-dependency** Node (ESM)" per `scripts/README.md`. Only `node:` built-ins.
- **Node ≥20** (`package.json` `engines`).
- **Test runner is `node --test`** (`.github/workflows/ci.yml:17`). Tests are co-located as `<script>.test.mjs`.
- **Module guard.** Every script ends with `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();` so importing it in tests does not execute it.
- **Exit codes:** `0` pass, `1` validation failure, `2` usage error.
- **Do not modify `scripts/validate-crosswalk.mjs`.** Its `flattenDtcg` has the same dual-node hole, but fixing it is explicitly out of scope (spec, Risks) — it is a separate gate with its own tests.
- **CI must stay green:** `node --test`, `node ci/validate-plugin.mjs`, `node ci/validate-skills.mjs`.

---

### Task 1: DTCG flattening and alias resolution

The crosswalk flattener stops descending as soon as a node has a `$value`, so a dual-node token (`text.sm` carrying both `$value: "14px"` and a `lineHeight` child) loses its child. Those children are exactly the tokens most likely to be wrong, so this validator needs its own walker.

**Files:**
- Create: `scripts/validate-token-output.mjs`
- Test: `scripts/validate-token-output.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `flattenDtcg(obj, prefix?, out?) -> { [dotPath: string]: rawValue }` and `resolveValue(name, flat, seen?) -> leafValue` (throws on missing/circular).

- [ ] **Step 1: Write the failing test**

Create `scripts/validate-token-output.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenDtcg, resolveValue } from './validate-token-output.mjs';

// text.sm is a DUAL-NODE token: it carries its own $value AND a child.
const dtcg = {
  text: {
    sm: {
      $value: '14px',
      $type: 'dimension',
      lineHeight: { $value: '20px', $type: 'dimension' },
    },
  },
  typography: {
    body: { lineHeight: { $value: '{text.sm.lineHeight}', $type: 'dimension' } },
  },
};

test('flattenDtcg yields a dual-node parent AND its child', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(flat['text.sm'], '14px');
  assert.equal(flat['text.sm.lineHeight'], '20px');
});

test('flattenDtcg skips $-prefixed meta keys', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(flat['text.sm.$type'], undefined);
});

test('resolveValue follows an alias into a dual-node child', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(resolveValue('typography.body.lineHeight', flat), '20px');
});

test('resolveValue throws on a missing token', () => {
  assert.throws(() => resolveValue('nope', {}), /not found/);
});

test('resolveValue throws on a circular reference', () => {
  assert.throws(() => resolveValue('a', { a: '{b}', b: '{a}' }), /circular/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/validate-token-output.test.mjs`
Expected: FAIL — `Cannot find module './validate-token-output.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/validate-token-output.mjs`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/validate-token-output.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-token-output.mjs scripts/validate-token-output.test.mjs
git commit -m "feat: dual-node-aware DTCG flatten and resolve for token output validation"
```

---

### Task 2: Extract declarations and magnitudes from generated native source

**Files:**
- Modify: `scripts/validate-token-output.mjs`
- Test: `scripts/validate-token-output.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `extractDeclarations(text, platform) -> [{ symbol, value }]` and `magnitudeOf(value) -> number | null` (null when the value is not a dimension emission).

- [ ] **Step 1: Write the failing test**

Append to `scripts/validate-token-output.test.mjs`:

```js
import { extractDeclarations, magnitudeOf } from './validate-token-output.mjs';

const SWIFT = `
public enum Tokens {
    public static let textSm = CGFloat(224.00)
    public static let colorBgCanvas = UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)
    // a comment, not a declaration
}
`;

const KOTLIN = `
object Tokens {
  val textSm = 224.00.dp
  val colorBgCanvas = Color(0xffffffff)
}
`;

test('extractDeclarations reads Swift static let declarations', () => {
  const decls = extractDeclarations(SWIFT, 'ios-swift');
  assert.deepEqual(decls, [
    { symbol: 'textSm', value: 'CGFloat(224.00)' },
    { symbol: 'colorBgCanvas', value: 'UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)' },
  ]);
});

test('extractDeclarations reads Kotlin val declarations', () => {
  const decls = extractDeclarations(KOTLIN, 'android-kotlin');
  assert.deepEqual(decls.map((d) => d.symbol), ['textSm', 'colorBgCanvas']);
});

test('extractDeclarations throws on an unknown platform', () => {
  assert.throws(() => extractDeclarations(SWIFT, 'flutter'), /unknown platform/);
});

test('magnitudeOf reads CGFloat, dp/sp, and bare numerics', () => {
  assert.equal(magnitudeOf('CGFloat(224.00)'), 224);
  assert.equal(magnitudeOf('224.00.dp'), 224);
  assert.equal(magnitudeOf('16.sp'), 16);
  assert.equal(magnitudeOf('1.1'), 1.1);
  assert.equal(magnitudeOf('-0.03'), -0.03);
});

test('magnitudeOf returns null for non-dimension values', () => {
  assert.equal(magnitudeOf('UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)'), null);
  assert.equal(magnitudeOf('Color(0xffffffff)'), null);
  assert.equal(magnitudeOf('24px'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/validate-token-output.test.mjs`
Expected: FAIL — `extractDeclarations is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/validate-token-output.mjs`:

```js
// Declaration patterns per platform. Coupled to the ios-swift/enum.swift and
// compose/object output formats; a different format needs a different pattern,
// which surfaces as a zero-match failure rather than a silent pass.
const DECL = {
  'ios-swift': /^\s*(?:public\s+)?static\s+let\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/,
  'android-kotlin': /^\s*val\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/,
};

export function extractDeclarations(text, platform) {
  const re = DECL[platform];
  if (!re) throw new Error(`unknown platform "${platform}"`);
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(re);
    if (m) out.push({ symbol: m[1], value: m[2] });
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/validate-token-output.test.mjs`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-token-output.mjs scripts/validate-token-output.test.mjs
git commit -m "feat: extract declarations and magnitudes from generated native source"
```

---

### Task 3: The four rules and the validate orchestrator

**Files:**
- Modify: `scripts/validate-token-output.mjs`
- Test: `scripts/validate-token-output.test.mjs`

**Interfaces:**
- Consumes: `flattenDtcg`, `resolveValue` (Task 1); `extractDeclarations`, `magnitudeOf` (Task 2).
- Produces: `normalizeKey(s) -> string`, `expectedMagnitude(sourceValue) -> { magnitude } | { skip }`, `findModeCollisions(sources) -> [{ path, defs }]`, and `validate({ sources, output, platform, minMatch }) -> { total, matched, matchRate, failures, collisions, ok }` where `sources` is `[{ file, dtcg }]`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/validate-token-output.test.mjs`:

```js
import { normalizeKey, expectedMagnitude, findModeCollisions, validate } from './validate-token-output.mjs';

test('normalizeKey collapses camelCase, snake_case, kebab-case, and dot paths', () => {
  assert.equal(normalizeKey('color.bg.canvas'), 'colorbgcanvas');
  assert.equal(normalizeKey('colorBgCanvas'), 'colorbgcanvas');
  assert.equal(normalizeKey('color_bg_canvas'), 'colorbgcanvas');
  assert.equal(normalizeKey('color-bg-canvas'), 'colorbgcanvas');
});

test('expectedMagnitude applies the authored unit, never a fixed factor', () => {
  assert.deepEqual(expectedMagnitude('14px'), { magnitude: 14 });
  assert.deepEqual(expectedMagnitude('1rem'), { magnitude: 16 });
  assert.deepEqual(expectedMagnitude('1.1'), { magnitude: 1.1 });
});

test('expectedMagnitude skips units with no native equivalent', () => {
  assert.ok(expectedMagnitude('100%').skip);
  assert.ok(expectedMagnitude('-0.03em').skip);
  assert.ok(expectedMagnitude('#ffffff').skip);
});

test('findModeCollisions flags a path defined twice with different values', () => {
  const sources = [
    { file: 'mobile.json', dtcg: { spacing: { grid: { columns: { $value: '{spacing.space.1}' } } } } },
    { file: 'desktop.json', dtcg: { spacing: { grid: { columns: { $value: '{spacing.space.3}' } } } } },
  ];
  const c = findModeCollisions(sources);
  assert.equal(c.length, 1);
  assert.equal(c[0].path, 'spacing.grid.columns');
});

test('findModeCollisions ignores a path repeated with the SAME value', () => {
  const same = { spacing: { grid: { columns: { $value: '4px' } } } };
  assert.deepEqual(findModeCollisions([{ file: 'a', dtcg: same }, { file: 'b', dtcg: same }]), []);
});

const SRC = [{ file: 't.json', dtcg: {
  text: { sm: { $value: '14px', $type: 'dimension' } },
  leading: { tight: { $value: '1.1', $type: 'dimension' } },
} }];

test('unit-fidelity catches the x16 scaling bug', () => {
  const r = validate({ sources: SRC, output: 'static let textSm = CGFloat(224.00)', platform: 'ios-swift' });
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].rule, 'unit-fidelity');
  assert.equal(r.ok, false);
});

test('unit-fidelity passes a correctly emitted px value', () => {
  const r = validate({ sources: SRC, output: 'static let textSm = CGFloat(14.00)', platform: 'ios-swift' });
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

test('unit-fidelity never scales a unitless ratio', () => {
  const ok = validate({ sources: SRC, output: 'static let leadingTight = CGFloat(1.1)', platform: 'ios-swift' });
  assert.deepEqual(ok.failures, []);
  const bad = validate({ sources: SRC, output: 'static let leadingTight = CGFloat(17.6)', platform: 'ios-swift' });
  assert.equal(bad.failures[0].rule, 'unit-fidelity');
});

test('no-foreign-syntax catches leaked color-mix', () => {
  const out = 'static let textSm = color-mix(in srgb, UIColor(red: 1, green: 1, blue: 1, alpha: 1) 4%, transparent)';
  const r = validate({ sources: SRC, output: out, platform: 'ios-swift' });
  assert.ok(r.failures.some((f) => f.rule === 'no-foreign-syntax'));
});

test('no-bare-units catches unresolved aliases, including negative magnitudes', () => {
  const r = validate({ sources: SRC, output: 'static let textSm = 24px', platform: 'ios-swift' });
  assert.ok(r.failures.some((f) => f.rule === 'no-bare-units'));
  const neg = validate({ sources: SRC, output: 'static let textSm = -0.03em', platform: 'ios-swift' });
  assert.ok(neg.failures.some((f) => f.rule === 'no-bare-units'));
});

test('zero matches fails rather than passing vacuously', () => {
  const r = validate({ sources: SRC, output: 'static let somethingElse = CGFloat(14.00)', platform: 'ios-swift' });
  assert.equal(r.matched, 0);
  assert.equal(r.ok, false);
});

test('a match rate below the floor fails', () => {
  const out = ['static let textSm = CGFloat(14.00)', 'static let unknownA = CGFloat(1)', 'static let unknownB = CGFloat(2)'].join('\n');
  assert.equal(validate({ sources: SRC, output: out, platform: 'ios-swift', minMatch: 0.5 }).ok, false);
  assert.equal(validate({ sources: SRC, output: out, platform: 'ios-swift', minMatch: 0.3 }).ok, true);
});

test('a mode collision fails even when every declaration is correct', () => {
  const sources = [
    { file: 'mobile.json', dtcg: { text: { sm: { $value: '14px' } } } },
    { file: 'desktop.json', dtcg: { text: { sm: { $value: '16px' } } } },
  ];
  const r = validate({ sources, output: 'static let textSm = CGFloat(16.00)', platform: 'ios-swift' });
  assert.equal(r.collisions.length, 1);
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/validate-token-output.test.mjs`
Expected: FAIL — `normalizeKey is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/validate-token-output.mjs`:

```js
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
    matched += 1;

    let source;
    try {
      source = resolveValue(path, flat);
    } catch {
      continue;
    }
    const expected = expectedMagnitude(source);
    if (expected.skip) continue;
    const actual = magnitudeOf(value);
    if (actual === null) continue;
    if (Math.abs(actual - expected.magnitude) > 0.001) {
      failures.push({ rule: 'unit-fidelity', symbol, token: path, source, emitted: value, expected: expected.magnitude, actual });
    }
  }

  const matchRate = decls.length ? matched / decls.length : 0;
  const ok = failures.length === 0 && collisions.length === 0 && matched > 0 && matchRate >= minMatch;
  return { total: decls.length, matched, matchRate, failures, collisions, minMatch, ok };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/validate-token-output.test.mjs`
Expected: PASS, 24 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-token-output.mjs scripts/validate-token-output.test.mjs
git commit -m "feat: four validation rules and the validate orchestrator"
```

---

### Task 4: CLI, reporting, and exit codes

**Files:**
- Modify: `scripts/validate-token-output.mjs`
- Test: `scripts/validate-token-output.test.mjs`

**Interfaces:**
- Consumes: `validate` (Task 3).
- Produces: `formatReport(result) -> string[]` and a `main()` CLI guarded by the module check. Exit `0` pass, `1` validation failure, `2` usage error.

- [ ] **Step 1: Write the failing test**

Append to `scripts/validate-token-output.test.mjs`:

```js
import { formatReport } from './validate-token-output.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('formatReport states the match rate and every failure', () => {
  const lines = formatReport({
    total: 2, matched: 1, matchRate: 0.5, minMatch: 0.5, collisions: [],
    failures: [{ rule: 'unit-fidelity', symbol: 'textSm', token: 'text.sm', source: '14px', emitted: 'CGFloat(224.00)', expected: 14, actual: 224 }],
    ok: false,
  }).join('\n');
  assert.match(lines, /1\/2/);
  assert.match(lines, /unit-fidelity/);
  assert.match(lines, /textSm/);
  assert.match(lines, /224/);
});

function runCli(args) {
  try {
    const stdout = execFileSync('node', ['scripts/validate-token-output.mjs', ...args], { encoding: 'utf8' });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

test('CLI exits 2 when required arguments are missing', () => {
  assert.equal(runCli([]).code, 2);
});

test('CLI exits 1 on a real failure and 0 on clean output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vto-'));
  const src = join(dir, 'text.json');
  writeFileSync(src, JSON.stringify({ text: { sm: { $value: '14px', $type: 'dimension' } } }));

  const bad = join(dir, 'Bad.swift');
  writeFileSync(bad, 'public static let textSm = CGFloat(224.00)\n');
  assert.equal(runCli(['--source', src, '--output', bad, '--platform', 'ios-swift']).code, 1);

  const good = join(dir, 'Good.swift');
  writeFileSync(good, 'public static let textSm = CGFloat(14.00)\n');
  assert.equal(runCli(['--source', src, '--output', good, '--platform', 'ios-swift']).code, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/validate-token-output.test.mjs`
Expected: FAIL — `formatReport is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/validate-token-output.mjs`:

```js
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
      lines.push(f.rule === 'unit-fidelity'
        ? `  - [${f.rule}] ${f.symbol}: source ${f.source} expects ${f.expected}, emitted ${f.emitted} (${f.actual})`
        : `  - [${f.rule}] ${f.symbol}: ${f.emitted}`);
    }
  }
  if (r.matched === 0) {
    lines.push(`\nNo emitted symbol matched any source token — the adapter's naming convention does not line up, so nothing was actually verified.`);
  } else if (r.matchRate < r.minMatch) {
    lines.push(`\nMatch rate ${pct}% is below the ${(r.minMatch * 100).toFixed(0)}% floor — most output went unchecked.`);
  }
  return lines;
}

function main() {
  const { values } = parseArgs({
    options: {
      source: { type: 'string', multiple: true },
      output: { type: 'string' },
      platform: { type: 'string' },
      'min-match': { type: 'string' },
    },
  });
  if (!values.source?.length || !values.output || !values.platform) {
    console.error('usage: validate-token-output.mjs --source <a.json> [--source <b.json>...] --output <Tokens.swift|Tokens.kt> --platform <ios-swift|android-kotlin> [--min-match <ratio>]');
    process.exit(2);
  }
  const sources = values.source.map((file) => ({ file, dtcg: JSON.parse(readFileSync(file, 'utf8')) }));
  const output = readFileSync(values.output, 'utf8');
  const minMatch = values['min-match'] === undefined ? 0.5 : Number(values['min-match']);

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
```

- [ ] **Step 4: Run the full suite**

Run: `node --test && node ci/validate-plugin.mjs && node ci/validate-skills.mjs`
Expected: all PASS, 28 tests in this file

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-token-output.mjs scripts/validate-token-output.test.mjs
git commit -m "feat: validate-token-output CLI with reporting and exit codes"
```

---

### Task 5: Verify against the real probe fixture

The unit tests use small hand-built fixtures. This task proves the validator catches the actual failures on the actual token source that motivated it. It is a manual verification step producing no committed code — but if it does not reproduce the four findings, the implementation is wrong.

**Files:**
- No files changed. Uses `~/Dev/zygarden-frontend` (read-only, via `git show`).

**Interfaces:**
- Consumes: the finished CLI (Task 4).
- Produces: confirmation only.

- [ ] **Step 1: Build the fixture from the branch**

```bash
mkdir -p /tmp/vto-fixture/tokens
cd ~/Dev/zygarden-frontend
for f in $(git ls-tree -r --name-only feature/apply-brandguide-styles -- libs/shared/util-tokens/src/tokens); do
  git show feature/apply-brandguide-styles:$f > /tmp/vto-fixture/tokens/$(basename $f)
done
ls /tmp/vto-fixture/tokens | wc -l   # expect 15
```

- [ ] **Step 2: Generate the known-bad native output**

```bash
cd /tmp/vto-fixture && npm init -y >/dev/null && npm i style-dictionary@^4 --silent
cat > build.mjs <<'EOF'
import SD from 'style-dictionary';
const PRIMS = ['color-primitives','spacing-primitives','radius-primitives','stroke-primitives',
  'text-primitives','typography-primitives','leading-primitives','radius-semantic','stroke-semantic'];
const sd = new SD({
  source: [...PRIMS.map((p) => `tokens/${p}.json`), 'tokens/color-semantic.light.json',
           'tokens/spacing-semantic.mobile.json', 'tokens/typography-semantic.mobile.json'],
  platforms: { ios: { transformGroup: 'ios-swift', buildPath: 'out/', options: { outputReferences: false },
    files: [{ destination: 'Tokens.swift', format: 'ios-swift/enum.swift', options: { className: 'Tokens' } }] } },
  log: { verbosity: 'silent', warnings: 'disabled' },
});
await sd.buildPlatform('ios');
EOF
node build.mjs
```

- [ ] **Step 3: Run the validator against it**

```bash
cd ~/Dev/throughline
node scripts/validate-token-output.mjs \
  --source /tmp/vto-fixture/tokens/text-primitives.json \
  --source /tmp/vto-fixture/tokens/spacing-primitives.json \
  --source /tmp/vto-fixture/tokens/typography-semantic.mobile.json \
  --output /tmp/vto-fixture/out/Tokens.swift \
  --platform ios-swift
```

Expected: exit `1`, with `unit-fidelity` failures reporting `source 14px expects 14, emitted CGFloat(224.00)`, plus `no-bare-units` failures on the `LineHeight` symbols.

- [ ] **Step 4: Confirm the collision rule fires on the naive source list**

```bash
node scripts/validate-token-output.mjs \
  --source /tmp/vto-fixture/tokens/spacing-semantic.mobile.json \
  --source /tmp/vto-fixture/tokens/spacing-semantic.desktop.json \
  --output /tmp/vto-fixture/out/Tokens.swift \
  --platform ios-swift
```

Expected: exit `1`, reporting a `spacing.grid.columns` mode collision between the two files.

- [ ] **Step 5: Clean up**

```bash
rm -rf /tmp/vto-fixture
```

No commit — this task changes no files.

---

### Task 6: Wire the validator into the sync skill and register it

**Files:**
- Modify: `skills/token-sync-layer/SKILL.md:150-151` (Step 3 verification) and Step 4
- Modify: `scripts/README.md` (script table)

**Interfaces:**
- Consumes: the finished CLI (Task 4).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the blind verification criteria**

In `skills/token-sync-layer/SKILL.md`, find this text inside the Step 3 "Execution model" paragraph:

```
each produces its
platform's files and verifies them (the config builds, the expected files
appear, references resolve for web / flatten for native)
```

Replace with:

```
each produces its
platform's files and verifies them (for web: the config builds, the expected
files appear, references resolve; for native: `tokens:validate-output` passes —
"the config builds" is not verification, it is the condition under which all
four known native failure modes ship silently)
```

- [ ] **Step 2: Add the native build + validation requirement to Step 3**

In `skills/token-sync-layer/SKILL.md`, immediately after the paragraph beginning "Install and configure Style Dictionary v4", add:

```markdown
**Native targets build once per mode, and are validated.** A single build over
the whole token directory silently drops a mode — Style Dictionary dedupes by
dot-path, so a light and a dark definition of the same token collapse to
whichever file sorted last. Configure one build per mode combination with an
explicit source file list, then run `tokens:validate-output` against each
generated file with that same list. See
`${CLAUDE_PLUGIN_ROOT}/references/sync-adapters.md`.
```

- [ ] **Step 3: Add the install step**

In `skills/token-sync-layer/SKILL.md`, in Step 4 after the sentence ending "any future app consume them.", add:

```markdown
**Install the output validator.** Copy
`${CLAUDE_PLUGIN_ROOT}/scripts/validate-token-output.mjs` into
`packages/tokens/scripts/` and register it so it stays a live gate on every
future sync rather than a one-time check:

```json
"tokens:validate-output": "node scripts/validate-token-output.mjs"
```

Invoke it once per native output file, passing the same `--source` list that
file's build used.
```

- [ ] **Step 4: Register the script in the table**

In `scripts/README.md`, add this row to the table after the `guard-token-removal.mjs` row:

```markdown
| `validate-token-output.mjs` | Assert generated native token output matches its DTCG source: authored-unit fidelity, no leaked CSS syntax, no bare unit literals, no mode collisions. Fails on zero matches so it can never pass vacuously. | `tokens:validate-output` |
```

- [ ] **Step 5: Verify CI and commit**

```bash
node --test && node ci/validate-plugin.mjs && node ci/validate-skills.mjs
git add skills/token-sync-layer/SKILL.md scripts/README.md
git commit -m "feat: wire tokens:validate-output into the sync skill and register it"
```

---

### Task 7: Correct the adapter reference and the README roadmap

**Files:**
- Modify: `references/sync-adapters.md:27-48` (Tier 1 table and following paragraph), plus a new section
- Modify: `README.md:208` (roadmap bullet)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Demote `ios-swift` out of Tier 1**

In `references/sync-adapters.md`, delete this table row:

```
| `ios-swift` | Swift enum / asset catalog | light/dark asset variants | flattened | `Color.backgroundPrimary` |
```

Change the line above the table from `Five built-in adapters ship` to `Four built-in adapters ship`.

- [ ] **Step 2: Rewrite the paragraph that justified five**

Replace the paragraph beginning "These five were chosen for coverage" through "fully supported via Tier 2." with:

```markdown
These four were chosen for coverage of this plugin's web-first, design-led
audience: three React framework adapters (shadcn — the dominant new-project
choice; standalone Tailwind — for the large Tailwind-without-shadcn population;
MUI — the enterprise/Material standard), plus the universal `vanilla-css`
escape hatch (plain CSS custom properties, no framework). Everything else —
Ant Design, Chakra, HeroUI, iOS/Swift, Android/Kotlin, Flutter, React Native,
etc. — is fully supported via Tier 2.

**`ios-swift` was curated and is not any more.** Run against a real DTCG source
it emitted every dimension at ×16 the authored value (valid, compiling Swift),
leaked `color-mix()` expressions, and left dual-node aliases as bare `px`
literals — the same failures as the generated `android-kotlin` adapter, in the
same counts. The tier did not predict quality, so the badge came off. Native
targets go through the Tier 2 protocol, and `tokens:validate-output` is what
now decides whether an adapter can be trusted. Re-promotion is available to any
adapter that passes it against a real source.
```

- [ ] **Step 3: Add the constraints section**

In `references/sync-adapters.md`, immediately before the `## Brownfield value transforms` heading, add:

```markdown
## What adapters cannot express

These are all legal in a real DTCG source and all silently unsupported. An
adapter that meets one emits wrong output without failing, which is why
`tokens:validate-output` exists.

- **CSS expressions in a value** — `color-mix(in srgb, {color.brand.500} 12%,
  transparent)` is a runtime CSS construct. Flattening it for native means
  computing the blend; Style Dictionary does not do colour math, and resolves
  only the inner reference, leaving the function wrapper in the output.
- **Dual-node tokens** — a node carrying both a `$value` and children (`text.sm`
  with `$value: "14px"` plus a `text.sm.lineHeight` child). Style Dictionary's
  resolver will not traverse into one, so every alias to the child fails to
  resolve and emits as a bare literal.
- **`%` and `em` dimensions** — parent-relative or container-relative, so there
  is no build-time native magnitude.
- **A third mode axis** — this reference models theme (`.dark` /
  `[data-theme]`) and brand (`[data-brand]`). A viewport axis carrying its own
  spacing and type scales is common and has no mapping here; on native it is
  size classes and resource qualifiers, resolved by a different mechanism
  entirely.

**Native dimension transforms must read the authored unit.** The stock
`ios-swift` and `compose` transform groups assume `rem` input and multiply by
16. Against a `px`-authored source that silently produces output at sixteen
times scale which compiles and ships. Emit 1:1 for `px` and unitless ratios;
×16 only for `rem`.
```

- [ ] **Step 4: Split the README roadmap bullet**

In `README.md`, replace line 208 (the bullet beginning `- **One library, many platforms**`) with:

```markdown
- **Token fan-out to more platforms** — the DTCG token source is platform-neutral, and web targets are in daily use. Native targets (iOS/Swift, Android/Kotlin) currently generate through the Tier 2 protocol and are **validated per build, not assumed** — `tokens:validate-output` checks generated native output against its source, because the stock transforms have been measured emitting wrong-but-compiling values.
- **Native component code generation** — producing a SwiftUI view or a Compose composable the way Storybook components are produced for React. This does not exist yet; it is a separate, larger effort than token fan-out, and the two were previously described as one roadmap item.
```

- [ ] **Step 5: Verify CI and commit**

```bash
node --test && node ci/validate-plugin.mjs && node ci/validate-skills.mjs
git add references/sync-adapters.md README.md
git commit -m "docs: demote ios-swift from Tier 1, document adapter limits, split platform roadmap bullet"
```

---

## Self-Review

**Spec coverage.** Every spec decision maps to a task: Decision 1 → Tasks 1–4; Decision 2 (unit table) → Task 3 `expectedMagnitude`; Decision 3 (source list + collision rule) → Task 3 `findModeCollisions` and Task 4 CLI `--source` multiple; Decision 4 (normalized key) → Task 3 `normalizeKey`; Decision 5 (dual-node resolver) → Task 1; Decision 6 (zero matches fails) → Task 3 `ok` and Task 4 report; Decision 7 (unmatched informational) → Task 3 `continue` on unmatched; Decision 8 (install as gate) → Task 6; Decision 9 (Tier 1 demotion) → Task 7; Decision 10 (what adapters cannot express) → Task 7 Step 3. The spec's four documented failure modes each have both a unit test (Task 3) and a real-fixture check (Task 5). The README change is Task 7 Step 4.

**Placeholder scan.** No TBD/TODO. Every code step carries runnable code; every doc step carries exact replacement text rather than a description of it.

**Type consistency.** `flattenDtcg` and `resolveValue` (Task 1) keep the signatures Task 3 calls. `extractDeclarations` returns `{ symbol, value }` in Task 2 and is destructured as `{ symbol, value }` in Task 3. `magnitudeOf` returns `number | null` and Task 3 tests `=== null`. `expectedMagnitude` returns `{ magnitude }` or `{ skip }` and Task 3 tests `.skip` then reads `.magnitude`. `validate` returns the same object shape `formatReport` consumes in Task 4, including `minMatch`, which Task 4's test fixture supplies.

**One deviation worth naming:** Task 5 commits nothing. It is a verification gate rather than a deliverable, kept as its own task because a reviewer should be able to reject the implementation on it independently of the code review.
