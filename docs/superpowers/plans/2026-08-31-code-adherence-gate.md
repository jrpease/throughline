# Code Adherence Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A zero-dependency gate that reads a design system's own records and fails a build when consuming code has drifted from it — a component that does not exist, a variant value outside the declared set, or a colour literal the system already has a token for.

**Architecture:** `scripts/validate-adherence.mjs`, in the shape of `validate-token-output.mjs`: pure `extract` / `validate` / `formatReport` plus a thin CLI. Extraction is regex over source files, sharing a walker with the two scanners that already do this (`grep-color-usage.mjs`, `guard-token-removal.mjs`) rather than becoming a third copy of it. Vocabulary comes from `design-system/docs/index.json` and `design-system.json`; token values come from `dtcg/tokens.json` through `flattenDtcg` + `resolveValue`.

**Tech Stack:** Node ≥20, ESM, `node:test` + `node:assert/strict`. Zero dependencies — stdlib only, no lockfile, no `node_modules`.

**Spec:** `docs/superpowers/specs/2026-08-31-code-adherence-gate-design.md`
**Measurement:** `docs/superpowers/notes/2026-08-31-adherence-convention-measurement.md`

**Two PRs.** Task 1 ships alone — it changes an exported signature in a script that installs into user repos, so it has a different blast radius from the gate. Tasks 2–6 are the gate.

## Global Constraints

- **Zero dependencies.** Never add an import outside `node:*` and this repo's own files.
- **Run the suite as bare `node --test` from the repo root.** Never `node --test scripts/` — a pathed invocation errors on Node ≥21.
- **This gate touches no gated generator.** `sd-native.mjs` is not involved, so `build-native-adapter-config.mjs` does not need regenerating. If a task strays into that file, stop — it is out of scope.
- **Exit codes, exactly as `validate-token-output.mjs`:** `2` for any CLI or IO problem, `1` when `!ok`, `0` otherwise.
- **Advisories never gate.** `advisories` must not appear in the `ok` expression. Per-rule inertness failures are `failures`, not advisories.
- **Every enabled rule must have had something to check.** A rule with no input fails the run and names itself. This is Decision 7 and it is the difference between a gate and a green light.
- **Never report a literal that has no token.** Decision 3. A noisy gate gets switched off.
- **Hex on both sides or no comparison.** A non-hex token value or source literal is counted as `uncomparable-colour`, never compared, never guessed at.
- **`resolveValue` throws** on unknown paths and cycles. Wrap every call. A gate that reports must not die mid-report.
- **Normalise component names on both sides.** `components.built` holds display names (`"Select Menu"`); code uses `<SelectMenu>`. Measured, and it fails correct code without this.
- **Match the house comment style.** Explain *why*, cite issue numbers and spec sections, state limits rather than hiding them. Terse code, dense rationale.

---

# PR 1 — the shared walker

### Task 1: Extract `lib/source-scan.mjs` and repoint both scanners

`grep-color-usage.mjs:39-50` and `guard-token-removal.mjs:15-25` define byte-identical `DEFAULT_EXCLUDES` arrays, and byte-identical `walk` generators **except** the file-extension filter, which sits inside the loop (`SOURCE_EXT.test(full)` at `grep-color-usage.mjs:60` vs `/\.tsx?$/.test(full)` at `guard-token-removal.mjs:33`). A third copy is exactly what #57 was filed for.

Both `export` `walk`, and `guard-token-removal.mjs` is copied into consumer repos by `token-crosswalk-builder`, so this is a public-API change plus a copy-list change — which is why it ships alone.

**Files:**
- Create: `scripts/lib/source-scan.mjs`
- Create: `scripts/lib/source-scan.test.mjs`
- Modify: `scripts/grep-color-usage.mjs` (`:39-50`, `:51`, `:53-63`)
- Modify: `scripts/guard-token-removal.mjs` (`:15-25`, `:26-38`)
- Modify: `skills/token-crosswalk-builder/SKILL.md:72-77` (copy list)
- Modify: `scripts/README.md` (crosswalk install prose, ~`:60-70`)

**Interfaces:**
- Produces: `walk(root, { excludes, fileFilter })`, `DEFAULT_EXCLUDES`, `SOURCE_EXT`, `normalizeName` — all exported from `scripts/lib/source-scan.mjs`.
- `walk`'s second parameter becomes an **options object**. The old positional `walk(root, excludes)` is gone; both call sites move.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/source-scan.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walk, DEFAULT_EXCLUDES, SOURCE_EXT, normalizeName } from './source-scan.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'scan-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'src', 'a.tsx'), '');
  writeFileSync(join(root, 'src', 'b.css'), '');
  writeFileSync(join(root, 'src', 'c.md'), '');
  writeFileSync(join(root, 'node_modules', 'd.tsx'), '');
  return root;
}

test('walk applies the caller file filter, not a built-in one', () => {
  const root = fixture();
  const tsx = [...walk(root, { fileFilter: /\.tsx?$/ })].map((f) => f.split('/').pop());
  assert.deepEqual(tsx, ['a.tsx']);
  const src = [...walk(root, { fileFilter: SOURCE_EXT })].map((f) => f.split('/').pop()).sort();
  assert.deepEqual(src, ['a.tsx', 'b.css']);
});

test('walk excludes node_modules by default', () => {
  const files = [...walk(fixture(), { fileFilter: /\.tsx?$/ })];
  assert.equal(files.some((f) => f.includes('node_modules')), false);
});

test('DEFAULT_EXCLUDES is one array, not two that agree today', () => {
  assert.ok(DEFAULT_EXCLUDES.some((re) => re.test('/x/node_modules/y')));
  assert.ok(DEFAULT_EXCLUDES.some((re) => re.test('/x/dist/y')));
});

// The display-name problem, measured: components.built holds "Select Menu"
// while the code exports <SelectMenu>.
test('normalizeName folds display names onto code identifiers', () => {
  assert.equal(normalizeName('Select Menu'), normalizeName('SelectMenu'));
  assert.equal(normalizeName('select_menu'), normalizeName('SelectMenu'));
  assert.notEqual(normalizeName('SelectMenu'), normalizeName('SelectMenuItem'));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test`
Expected: FAIL — `scripts/lib/source-scan.mjs` does not exist.

- [ ] **Step 3: Write the module**

Create `scripts/lib/source-scan.mjs`:

```js
// Walking a consumer's source tree, shared by every gate that scans one.
//
// grep-color-usage.mjs and guard-token-removal.mjs each carried their own copy
// of this — identical excludes, and a walk that differed only in which file
// extensions it yielded. The duplication was the shape #57 was filed for: two
// definitions of one rule, agreeing today, with nothing keeping them in step.
//
// The file filter is the caller's, not a built-in: a colour scan wants
// stylesheets and a symbol guard does not, and neither should have to fork the
// walker to say so.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_EXCLUDES = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)generated(\/|$)/,
  /\.generated\./,
  /\.test\./,
  /\.spec\./,
  /(^|\/)__tests__(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)\.next(\/|$)/,
];

// Every text file a design system's values can hide in.
export const SOURCE_EXT = /\.(scss|sass|css|tsx?|jsx?|mjs|cjs|vue|svelte|html|svg)$/;

export function* walk(root, { excludes = DEFAULT_EXCLUDES, fileFilter = SOURCE_EXT } = {}) {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (excludes.some((re) => re.test(full))) continue;
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full, { excludes, fileFilter });
    else if (fileFilter.test(full)) yield full;
  }
}

// A design system records a component's DISPLAY name — a real manifest holds
// "Select Menu" — while the code exports <SelectMenu>. Nothing in the schema
// says `name` is a code identifier, and nothing should be changed to make it
// one: a display name is right for a doc surface. So the comparison normalises,
// the same way validate-token-output.mjs already folds adapter naming
// conventions onto each other.
export const normalizeName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
```

- [ ] **Step 4: Watch it pass**

Run: `node --test`
Expected: the four new tests pass; everything else still passes.

- [ ] **Step 5: Repoint `grep-color-usage.mjs`**

Delete its `DEFAULT_EXCLUDES` (`:39-50`), its `SOURCE_EXT` (`:51`) and its `walk` (`:53-63`). Add to its imports:

```js
import { walk, DEFAULT_EXCLUDES, SOURCE_EXT } from './lib/source-scan.mjs';
```

Re-export both constants so its own public surface is unchanged — `design-system-audit` reads them:

```js
export { DEFAULT_EXCLUDES, SOURCE_EXT };
```

In `grepColorUsage` (`:81`), change the walk call to `walk(root, { excludes, fileFilter: SOURCE_EXT })`.

- [ ] **Step 6: Repoint `guard-token-removal.mjs`**

Delete its `DEFAULT_EXCLUDES` (`:15-25`) and `walk` (`:26-38`). Add:

```js
import { walk, DEFAULT_EXCLUDES } from './lib/source-scan.mjs';
export { DEFAULT_EXCLUDES };
```

In `guard` (`:52`), call `walk(root, { excludes, fileFilter: /\.tsx?$/ })` — the `.ts`/`.tsx` scope is this script's own contract and stays with it.

- [ ] **Step 7: Update the copy lists — this is the step that breaks consumers if skipped**

`guard-token-removal.mjs` now imports `lib/source-scan.mjs`, and it ships into user repos. Add to `skills/token-crosswalk-builder/SKILL.md` after `:73`:

```
- `lib/source-scan.mjs` → `packages/tokens/scripts/lib/source-scan.mjs` (required by
  `guard-token-removal.mjs`)
```

And to `scripts/README.md`'s crosswalk install prose, add `lib/source-scan.mjs` to the copied list.

- [ ] **Step 8: Verify nothing regressed**

```
node --test
node ci/validate-skills.mjs
node -e "import('./scripts/grep-color-usage.mjs').then(m=>console.log(typeof m.walk, m.DEFAULT_EXCLUDES.length))"
node -e "import('./scripts/guard-token-removal.mjs').then(m=>console.log(typeof m.guard, m.DEFAULT_EXCLUDES.length))"
```

Expected: suite green; both scripts still export what they exported.

- [ ] **Step 9: Commit and open PR 1**

Commit message states what it is: a duplicate removed before a third copy was made, and a public-API change to a script that ships to consumers.

---

# PR 2 — the gate

### Task 2: `extract` — read usages and literals out of source

The fragile, ecosystem-specific half. Kept separate from the rules so an ESLint rule or a TypeScript AST walk can drive the same rules later without redesigning what adherence means.

**Files:**
- Create: `scripts/validate-adherence.mjs`
- Create: `scripts/validate-adherence.test.mjs`

**Interfaces:**
- Produces: `extract(text, pkg)` → `{ imported: Map<local, declared>, usages, literals }`.
  `usages` are `{ component, attr, value, line }` where `value` is `null` for a non-literal attribute. `literals` are `{ value, line }` — normalised hex.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `scripts/validate-adherence.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract, normalizeHex } from './validate-adherence.mjs';

const SRC = `
import { Button, Card as Panel } from '@acme/ui';
import { Other } from 'somewhere-else';

export function Page() {
  return (
    <Button variant="ghost" size="lg" onClick={fn} label="Go">
      <Panel variant="elevated" />
      <Other variant="nope" />
      <div style={{ color: '#3B82F6' }} />
    </Button>
  );
}
`;

test('extract reads only components imported from the system package', () => {
  const { imported } = extract(SRC, '@acme/ui');
  assert.deepEqual([...imported.entries()].sort(), [['Button', 'Button'], ['Panel', 'Card']]);
});

test('extract resolves an import alias back to the declared name', () => {
  const { usages } = extract(SRC, '@acme/ui');
  const panel = usages.find((u) => u.attr === 'variant' && u.value === 'elevated');
  assert.equal(panel.component, 'Card', 'reported under the name the system knows');
});

test('extract ignores a component from another package', () => {
  const { usages } = extract(SRC, '@acme/ui');
  assert.equal(usages.some((u) => u.value === 'nope'), false);
});

test('extract marks a non-literal attribute rather than dropping it', () => {
  const { usages } = extract(SRC, '@acme/ui');
  const click = usages.find((u) => u.attr === 'onClick');
  assert.equal(click.value, null, 'seen, unreadable — the blind spot is reported, not hidden');
});

test('extract finds hex literals with their line numbers', () => {
  const { literals } = extract(SRC, '@acme/ui');
  assert.equal(literals.length, 1);
  assert.equal(literals[0].value, '#3b82f6');
  assert.equal(literals[0].line, 11);
});

test('normalizeHex folds the spellings of one colour together', () => {
  assert.equal(normalizeHex('#ABC'), '#aabbcc');
  assert.equal(normalizeHex('#AABBCC'), '#aabbcc');
  assert.equal(normalizeHex('#aabbccff'), '#aabbcc');
  assert.equal(normalizeHex('#aabbcc80'), '#aabbcc80', 'a real alpha is not stripped');
  assert.equal(normalizeHex('rgb(1,2,3)'), null, 'non-hex is uncomparable, not guessed');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write `extract`**

Create `scripts/validate-adherence.mjs` with the header, the regexes and `extract`:

```js
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
```

- [ ] **Step 4: Watch it pass**

Run: `node --test`
Expected: the six extraction tests pass.

---

### Task 3: `validate` — the rules, and per-rule inertness

**Files:**
- Modify: `scripts/validate-adherence.mjs`
- Modify: `scripts/validate-adherence.test.mjs`

**Interfaces:**
- Consumes: `extract` from Task 2.
- Produces: `validate({ built, index, tokenValues, files, skip })` → `{ ok, failures, advisories, stats }`.
  `files` is `[{ path, usages, literals }]`. `tokenValues` is `Map<normalisedHex, string[]>` — value to candidate token paths.
- Produces: `buildTokenValues(dicts)` → that Map.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/validate-adherence.test.mjs`:

```js
import { validate, buildTokenValues } from './validate-adherence.mjs';

const INDEX = { components: [
  { name: 'Button', variants: { variant: { primary: '', ghost: '' }, size: { sm: '', lg: '' } }, states: { disabled: '' } },
  { name: 'Select Menu', variants: { size: { sm: '' } }, states: {} },
] };
const BUILT = ['Button', 'Select Menu', 'Spinner'];
const TOKENS = buildTokenValues([{ color: { brand: { $value: '#3B82F6', $type: 'color' } } }]);
const file = (usages = [], literals = []) => [{ path: 'a.tsx', usages, literals }];

test('a variant value outside the declared set fails', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'variant', value: 'tertiary', line: 3 }]) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.failures.map((f) => f.rule), ['unknown-variant-value']);
});

test('a declared variant value passes', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'variant', value: 'ghost', line: 3 }]) });
  assert.deepEqual(r.failures, []);
});

// Measured: components.built holds "Select Menu"; the code writes <SelectMenu>.
test('a display name in the manifest matches the code identifier', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS,
    files: file([{ component: 'SelectMenu', attr: 'size', value: 'sm', line: 1 }]) });
  assert.deepEqual(r.failures, [], 'correct code must not fail on a display name');
});

test('a component not in the manifest fails', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS,
    files: file([{ component: 'Invented', attr: 'variant', value: 'x', line: 1 }]) });
  assert.deepEqual(r.failures.map((f) => f.rule), ['unknown-component']);
});

test('a built component with no doc record is an advisory, not a failure', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS,
    files: file([{ component: 'Spinner', attr: 'size', value: 'lg', line: 1 }]) });
  assert.deepEqual(r.failures, []);
  assert.ok(r.advisories.some((a) => a.rule === 'undocumented-component'));
});

test('a declared state name is not reported as unmodelled', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'disabled', value: 'true', line: 1 }]) });
  assert.equal(r.advisories.some((a) => a.rule === 'unmodelled-prop'), false);
});

test('an attribute matching no axis is an advisory and does not gate', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'variant', value: 'ghost', line: 1 },
                 { component: 'Button', attr: 'label', value: 'Go', line: 1 }]) });
  assert.equal(r.ok, true);
  assert.ok(r.advisories.some((a) => a.rule === 'unmodelled-prop'));
});

test('a literal with a token fails; one without is silent', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'variant', value: 'ghost', line: 1 }],
                [{ value: '#3b82f6', line: 2 }, { value: '#123456', line: 3 }]) });
  assert.deepEqual(r.failures.map((f) => f.rule), ['token-exists-for-literal']);
  assert.match(r.failures[0].tokens.join(','), /color\.brand/);
});

test('an aliased token resolves through the chain', () => {
  const t = buildTokenValues([{ base: { blue: { $value: '#3B82F6', $type: 'color' } },
                               brand: { primary: { $value: '{base.blue}', $type: 'color' } } }]);
  assert.ok(t.get('#3b82f6').includes('brand.primary'));
});

test('an unresolvable or circular reference is skipped, not thrown on', () => {
  assert.doesNotThrow(() => buildTokenValues([{ a: { x: { $value: '{nope.missing}', $type: 'color' } },
                                                b: { y: { $value: '{c.z}', $type: 'color' } },
                                                c: { z: { $value: '{b.y}', $type: 'color' } } }]));
});

test('a non-hex token value is counted uncomparable, not compared', () => {
  const t = buildTokenValues([{ c: { x: { $value: 'rgb(1,2,3)', $type: 'color' } } }]);
  assert.equal(t.size, 0);
});

// Decision 7 — per rule, not once globally.
test('no comparable token value fails as colour-rule-inert', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: new Map(),
    files: file([{ component: 'Button', attr: 'variant', value: 'ghost', line: 1 }]) });
  assert.ok(r.failures.some((f) => f.rule === 'colour-rule-inert'));
});

test('known components and zero axis matches fails as variant-rule-inert', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'label', value: 'Go', line: 1 }]) });
  assert.ok(r.failures.some((f) => f.rule === 'variant-rule-inert'));
});

test('a skipped rule is neither run nor inert', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS, skip: ['unknown-variant-value'],
    files: file([{ component: 'Button', attr: 'label', value: 'Go', line: 1 }]) });
  assert.equal(r.failures.some((f) => f.rule === 'variant-rule-inert'), false);
});

// A Vue or Svelte repo gets the colour rule only. It must not fail for having
// no component references.
test('colour-only scanning passes with no component usages at all', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS, skip: ['unknown-variant-value', 'unknown-component'],
    files: file([], [{ value: '#123456', line: 1 }]) });
  assert.equal(r.ok, true);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test`
Expected: FAIL — `validate` and `buildTokenValues` are not exported.

- [ ] **Step 3: Write `buildTokenValues` and `validate`**

Append to `scripts/validate-adherence.mjs`:

```js
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

export function validate({ built = [], index = { components: [] }, tokenValues = new Map(), files = [], skip = [] }) {
  const off = new Set(skip);
  const builtKeys = new Map(built.map((n) => [normalizeName(n), n]));
  const records = new Map((index.components ?? []).map((c) => [normalizeName(c.name), c]));

  const failures = [];
  const advisories = [];
  const stats = { usages: 0, literals: 0, files: files.length, axisMatched: 0, axisUnmatched: 0, dynamic: 0, knownComponents: new Set(), undocumented: new Set() };

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
          failures.push({ rule: 'unknown-variant-value', component: declaredName, attr: u.attr,
            value: u.value, declared: Object.keys(axis), file: path, line: u.line });
        }
      } else if (Object.keys(record.states ?? {}).includes(u.attr)) {
        stats.axisMatched += 1;
      } else {
        stats.axisUnmatched += 1;
        advisories.push({ rule: 'unmodelled-prop', component: declaredName, attr: u.attr,
          axes: Object.keys(record.variants ?? {}), file: path, line: u.line });
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

  // Decision 7, per rule. A rule with nothing to work on has verified nothing,
  // and a green run that verified nothing is the failure class this project
  // keeps filing issues about. A rule the caller switched off is absent, not
  // inert.
  if (!off.has('token-exists-for-literal') && tokenValues.size === 0) {
    failures.push({ rule: 'colour-rule-inert' });
  }
  if (!off.has('unknown-variant-value') && stats.knownComponents.size > 0 && stats.axisMatched === 0) {
    failures.push({ rule: 'variant-rule-inert', axes: [...records.values()].flatMap((r) => Object.keys(r.variants ?? {})) });
  }

  return { ok: failures.length === 0, failures, advisories, stats, skipped: [...off] };
}
```

- [ ] **Step 4: Watch them pass**

Run: `node --test`
Expected: all Task 3 tests green.

---

### Task 4: `formatReport`

**Files:**
- Modify: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`

**Interfaces:**
- Consumes: a result from `validate`.
- Produces: `formatReport(r)` → `string[]`, like `validate-token-output.mjs`.

- [ ] **Step 1: Write the failing tests**

```js
import { formatReport } from './validate-adherence.mjs';

test('the headline carries the dynamic proportion, not just the advisories', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'variant', value: 'ghost', line: 1 },
                 { component: 'Button', attr: 'size', value: null, line: 2 }]) });
  const text = formatReport(r).join('\n');
  assert.match(text, /1 of 2 attributes are expressions/, 'the blind spot is a proportion, not a list');
});

test('an unknown value names the declared set', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'variant', value: 'tertiary', line: 3 }]) });
  assert.match(formatReport(r).join('\n'), /declared values for "variant" are primary, ghost/);
});

test('an unmodelled prop names the axes the system does model', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'variant', value: 'ghost', line: 1 },
                 { component: 'Button', attr: 'label', value: 'Go', line: 2 }]) });
  assert.match(formatReport(r).join('\n'), /models this component's axes as variant, size/);
});

test('an inert rule says which rule and why', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: new Map(), files: file() });
  assert.match(formatReport(r).join('\n'), /colour-rule-inert/);
  assert.match(formatReport(r).join('\n'), /--tokens/);
});
```

- [ ] **Step 2: Run and watch fail, then write it**

```js
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
        lines.push(`  - [${f.rule}] ${f.component} ${f.attr}="${f.value}" at ${f.file}:${f.line} — declared values for "${f.attr}" are ${f.declared.join(', ')}`);
      } else if (f.rule === 'token-exists-for-literal') {
        lines.push(`  - [${f.rule}] ${f.value} at ${f.file}:${f.line} — ${f.tokens.join(', ')} resolve${f.tokens.length === 1 ? 's' : ''} to exactly this value`);
      } else if (f.rule === 'unknown-component') {
        lines.push(`  - [${f.rule}] <${f.component}> at ${f.file}:${f.line} — not in design-system.json components.built`);
      } else if (f.rule === 'colour-rule-inert') {
        lines.push(`  - [${f.rule}] no token file yielded a comparable hex value, so nothing was checked against. Pass --tokens, or --skip token-exists-for-literal if this system has no colour tokens.`);
      } else if (f.rule === 'variant-rule-inert') {
        lines.push(`  - [${f.rule}] components were found but no attribute matched a declared axis, so this rule verified nothing. The system declares ${f.axes.join(', ')}. Either the records and the code disagree about names, or this system's axes are conceptual — --skip unknown-variant-value if so.`);
      }
    }
  }

  if (r.advisories.length) {
    lines.push(`\n${r.advisories.length} advisory note(s) — reported, not gating:`);
    for (const a of r.advisories) {
      if (a.rule === 'unmodelled-prop') {
        lines.push(`  - [${a.rule}] ${a.component} "${a.attr}" at ${a.file}:${a.line} — no declared axis or state of that name; the system models this component's axes as ${a.axes.join(', ') || '(none)'}`);
      } else if (a.rule === 'undocumented-component') {
        lines.push(`  - [${a.rule}] ${a.component} — built, but has no doc record, so its variants cannot be checked. Run docs:digest after documenting it.`);
      } else if (a.rule === 'dynamic-value') {
        lines.push(`  - [${a.rule}] ${a.component} ${a.attr}={…} at ${a.file}:${a.line} — not a literal, so its value could not be read`);
      }
    }
  }
  return lines;
}
```

---

### Task 5: CLI, and wire it into the install

**Files:**
- Modify: `scripts/validate-adherence.mjs` (CLI), `scripts/README.md`
- Modify: `skills/storybook-chromatic-builder/SKILL.md`, `commands/document-component.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the CLI**

```js
function main() {
  let values;
  try {
    ({ values } = parseArgs({ options: {
      root: { type: 'string' }, system: { type: 'string' }, package: { type: 'string' },
      tokens: { type: 'string', multiple: true }, skip: { type: 'string', multiple: true, default: [] },
    } }));
  } catch (e) { console.error(e.message); process.exit(2); }

  if (!values.root || !values.system || !values.package) {
    console.error('usage: validate-adherence.mjs --root <dir> --system <dir> --package <specifier> --tokens <file> [--tokens <file>...] [--skip <rule>]');
    process.exit(2);
  }

  const read = (p, what) => {
    try { return JSON.parse(readFileSync(p, 'utf8')); }
    catch (e) { console.error(`cannot read ${what} at ${p}: ${e.message}`); process.exit(2); }
  };

  const manifest = read(join(values.system, 'design-system.json'), 'the manifest');
  const index = read(join(values.system, 'design-system/docs/index.json'),
    'the docs index (run docs:digest first)');
  const tokenValues = buildTokenValues((values.tokens ?? []).map((f) => read(f, 'a token source')));

  const files = [];
  for (const path of walk(values.root, { fileFilter: /\.(tsx?|jsx?|mjs|cjs|css|scss|sass|vue|svelte)$/ })) {
    const { usages, literals } = extract(readFileSync(path, 'utf8'), values.package);
    if (usages.length || literals.length) files.push({ path, usages, literals });
  }

  const r = validate({ built: manifest.components?.built ?? [], index, tokenValues, files, skip: values.skip });
  for (const line of formatReport(r)) console.log(line);
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 2: Add the install row to `scripts/README.md`**

Add `validate-adherence.mjs` to the top table, and a row to the **documentation scripts install-as-a-set** table at `:34-40`:

| `validate-adherence.mjs` | `"adherence:check": "node scripts/validate-adherence.mjs --root ../../apps --system ../.. --package <specifier> --tokens dtcg/tokens.json"` |
| `lib/source-scan.mjs` | — (imported by the above) |

Every path is explicit because cwd is the package holding the script. `--system` has no default: defaulting it to `--root` resolves to a path that does not exist.

- [ ] **Step 3: Name both installers**

`scripts/README.md:29-32` already says `storybook-chromatic-builder` and `/document-component` install the same set. Add the two files to the lists in `skills/storybook-chromatic-builder/SKILL.md` (Step 1) and `commands/document-component.md`, and register the npm script in both.

- [ ] **Step 4: Verify**

```
node --test
node ci/validate-skills.mjs
node scripts/validate-adherence.mjs           # expect exit 2 + usage
```

---

### Task 6: End-to-end against a real app, then the changelog

Every gate in this project verified only at the unit layer has been wrong about what it emits. Fixtures prove the rules; only a real repo proves the extraction.

**Files:**
- Create: `docs/superpowers/notes/2026-08-31-adherence-gate-e2e.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run it clean against `~/Dev/throughline-sample`**

```
node scripts/validate-adherence.mjs --root ~/Dev/throughline-sample/apps \
  --system ~/Dev/throughline-sample --package <the ui package name> \
  --tokens ~/Dev/throughline-sample/packages/tokens/dtcg/tokens.json
```

Read the package specifier out of that repo's `packages/ui/package.json`; do not guess it. Record the headline verbatim, and confirm `<SelectMenu>` does **not** appear as `unknown-component` — that is the measured bug this gate would otherwise ship with.

- [ ] **Step 2: Prove it can fail**

Copy the app to a scratch directory, inject three defects — a `variant="tertiary"`, an invented `<Nonexistent />`, and a hex equal to a real token's value — and run again. All three must be named, with correct files and line numbers. **A gate that has never failed is not a gate.**

- [ ] **Step 3: Record the run**

Write the note: harness, package specifier, the clean headline, the three injected defects and the exact output for each, and the axis-coverage ratio — which is the number that decides whether phase 4 is needed.

- [ ] **Step 4: Changelog**

Under `## [Unreleased]`, an `### Added` entry. State that it is a new gate, that it is not wired into any existing script automatically, and that a system whose records and code disagree about axis names will see `variant-rule-inert` and should read the report rather than skip the rule.

- [ ] **Step 5: Full gate set, then open PR 2**

```
node --test
node ci/validate-plugin.mjs
node ci/validate-skills.mjs
node scripts/adapters/generate.mjs --check
node scripts/build-doc-card-builder.mjs --check
node scripts/build-native-adapter-config.mjs --check
```
