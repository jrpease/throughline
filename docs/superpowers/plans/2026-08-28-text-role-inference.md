# Text-Role Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Infer a typographic role for a dimension primitive from the reference graph — a token referenced only by `fontSize`/`letterSpacing`/`lineHeight` members is itself typographic — so `text.base` emits `sp` rather than `dp` and `em` letter-spacing primitives stop being dropped.

**Architecture:** A pure `textRoleGraph(dict)` in `scripts/lib/dtcg.mjs` reads whole-value reference edges off the **unresolved** source tree and returns three things: the referents to stamp, the ambiguous ones to report, and the unreferenced ones to advise about. `preprocess` calls it before resolving and applies the stamps to its clone, so nothing is carried into transform time. `validate-token-output.mjs` calls the same function to raise two non-gating advisories.

**Tech Stack:** Node ≥20, ESM, `node:test` + `node:assert/strict`. Zero dependencies — stdlib only, no lockfile, no `node_modules`.

**Spec:** `docs/superpowers/specs/2026-08-28-text-role-inference-design.md`

## Global Constraints

- **Zero dependencies.** Never add an import outside `node:*` and this repo's own files. No YAML/JSON5/lodash, no dev dependencies.
- **Run the suite as bare `node --test` from the repo root.** Never `node --test scripts/` — a pathed invocation errors on Node ≥21.
- **`scripts/lib/sd-native.mjs` is gated.** After ANY edit to it run `node scripts/build-native-adapter-config.mjs` to regenerate `references/native-adapter-config.md`, and commit the regenerated doc in the same commit. `--check` fails CI otherwise. `references/` ships in the published tarball.
- **Every line of `sd-native.mjs` must fall inside a `@doc-section` pair.** Blank lines and `//` comment lines may sit outside; any line with executable code may not. Each section id needs a matching entry in the generator's `PROSE` array.
- **The extension namespace is `com.radicool.throughline`.** Address it through the `EXT_NS` constant, never as a literal.
- **`TEXT_UNIT_NAMES` is exactly `{fontSize, letterSpacing, lineHeight}`** — DTCG §9.8's member names. Do not add to it.
- **`TEXT_ROLE_UNIT` is `/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)$/`** — px, rem, em. A unitless value must never be stamped.
- **Never overwrite an existing `nativeUnit`.** Guard every stamp with `if (!('nativeUnit' in ns))`. This is both the source escape hatch and the opt-out.
- **`preprocess` must stay idempotent:** `preprocess(preprocess(x))` `deepEqual` `preprocess(x)`.
- **Match the house comment style.** These modules explain *why*, cite issue numbers and spec sections, and state limits rather than hiding them. Terse code, dense rationale.

---

### Task 1: Move the three shared constants into `dtcg.mjs`

`textRoleGraph` (Task 2) lives in `dtcg.mjs` and needs all three. `sd-native.mjs` imports `dtcg.mjs`, so `dtcg.mjs` importing back would be a cycle. Move them down; leave the rationale comments where they are so the generated doc keeps them.

**Files:**
- Modify: `scripts/lib/dtcg.mjs` (add constants after the `REF` declaration, line 5)
- Modify: `scripts/lib/sd-native.mjs:13` (import), `:229`, `:231-233`, `:236-247` (comments and re-export)
- Test: `scripts/lib/dtcg.test.mjs`
- Regenerate: `references/native-adapter-config.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `TEXT_UNIT_NAMES: Set<string>`, `TEXT_ROLE_UNIT: RegExp`, `EXT_NS: string` — all exported from `scripts/lib/dtcg.mjs`. `EXT_NS` stays exported from `sd-native.mjs` too, via re-export.

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/dtcg.test.mjs`:

```js
test('the shared text-role constants live here, so textRoleGraph and sd-native cannot drift', () => {
  assert.deepEqual([...TEXT_UNIT_NAMES].sort(), ['fontSize', 'letterSpacing', 'lineHeight']);
  assert.equal(EXT_NS, 'com.radicool.throughline');
  for (const ok of ['16px', '1.5rem', '-0.03em', '.5px']) assert.ok(TEXT_ROLE_UNIT.test(ok), ok);
  for (const no of ['1.5', '16', '100%', '16dp', '']) assert.ok(!TEXT_ROLE_UNIT.test(no), no);
});
```

Add `TEXT_UNIT_NAMES, TEXT_ROLE_UNIT, EXT_NS` to that file's existing import from `./dtcg.mjs`.

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test scripts/lib/dtcg.test.mjs`
Expected: FAIL — the three names are not exported from `dtcg.mjs` yet.

- [ ] **Step 3: Add the constants to `dtcg.mjs`**

Insert directly after `const REF = /^\{([^}]+)\}$/;` (line 5):

```js
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
```

- [ ] **Step 4: Rewire `sd-native.mjs`**

Change line 13 from:

```js
import { flattenDtcg, resolveValue, findModeCollisions } from './dtcg.mjs';
```

to:

```js
import {
  flattenDtcg,
  resolveValue,
  findModeCollisions,
  TEXT_UNIT_NAMES,
  TEXT_ROLE_UNIT,
  EXT_NS,
} from './dtcg.mjs';
```

Then, keeping every existing comment line exactly as it stands:

- Delete only the line `const TEXT_UNIT_NAMES = new Set(['fontSize', 'letterSpacing', 'lineHeight']);` (line 229) and append to the comment block above it:

```js
// Defined in lib/dtcg.mjs and imported above, so textRoleGraph applies the
// identical set. Two definitions of this set would drift.
```

- Replace the line `export const EXT_NS = 'com.radicool.throughline';` (line 233) with:

```js
export { EXT_NS };
```

and append to its comment block above:

```js
// Defined in lib/dtcg.mjs and re-exported here: the transforms and their tests
// address this key through sd-native.mjs, and that surface does not move.
```

- Delete only the line `const TEXT_ROLE_UNIT = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)$/;` (line 247) and append to the comment block above it:

```js
// Defined in lib/dtcg.mjs and imported above, for the same reason as
// TEXT_UNIT_NAMES: textRoleGraph gates on it too.
```

All three comment blocks stay inside the `preprocess` `@doc-section`. `export { EXT_NS };` is executable and must stay inside it too.

- [ ] **Step 5: Run the tests**

Run: `node --test`
Expected: PASS, all of them. Nothing about behaviour changed — if any `sd-native` test fails, a constant moved to the wrong place.

- [ ] **Step 6: Regenerate the doc and check the gate**

```bash
node scripts/build-native-adapter-config.mjs
node scripts/build-native-adapter-config.mjs --check
git diff --stat references/native-adapter-config.md
```
Expected: `--check` exits 0. The doc diff shows the comment and import changes and nothing else.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/dtcg.mjs scripts/lib/dtcg.test.mjs scripts/lib/sd-native.mjs references/native-adapter-config.md
git commit -m "refactor: the text-role constants move to dtcg.mjs, where both consumers can reach them (#63)"
```

---

### Task 2: `textRoleGraph` and `mergeDtcg` in `dtcg.mjs`

The whole inference, as one pure function over an unresolved tree. No consumer yet — Tasks 3 and 4 wire it in.

**Files:**
- Modify: `scripts/lib/dtcg.mjs` (append both functions)
- Test: `scripts/lib/dtcg.test.mjs`

**Interfaces:**
- Consumes: `TEXT_UNIT_NAMES`, `TEXT_ROLE_UNIT`, `EXT_NS`, `REF` from Task 1.
- Produces:
  - `mergeDtcg(dicts: object[]) -> object` — deep merge, later dict wins, inputs never mutated.
  - `textRoleGraph(dict: object) -> { typographic: Set<string>, ambiguous: Array<{path, textLeaves, otherLeaves}>, unreferencedSiblings: Array<{path, group}> }`. All paths are dot-joined and **pre-hoist**.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/dtcg.test.mjs`:

```js
const graphFixture = () => ({
  text: {
    base: { $type: 'dimension', $value: '16px' },
    huge: { $type: 'dimension', $value: '96px' },
    stamped: { $type: 'dimension', $value: '72px', $extensions: { [EXT_NS]: { nativeUnit: 'text' } } },
    ratio: { $type: 'dimension', $value: '1.5' },
  },
  space: { md: { $type: 'dimension', $value: '8px' } },
  typography: {
    body: {
      fontSize: { $type: 'dimension', $value: '{text.base}' },
      lineHeight: { $type: 'dimension', $value: '{text.base}' },
    },
    gutter: { $type: 'dimension', $value: '{space.md}' },
  },
});

test('a referent whose referrers are all typographic is inferred typographic', () => {
  const g = textRoleGraph(graphFixture());
  assert.ok(g.typographic.has('text.base'));
  assert.ok(!g.typographic.has('space.md'), 'a gutter referrer states no typographic role');
  assert.deepEqual(g.ambiguous, []);
});

test('a referent with referrers on both sides is ambiguous, not inferred', () => {
  const dict = graphFixture();
  dict.space.pad = { $type: 'dimension', $value: '{text.base}' };
  const g = textRoleGraph(dict);
  assert.ok(!g.typographic.has('text.base'), 'counter-evidence declines the stamp');
  assert.equal(g.ambiguous.length, 1);
  assert.equal(g.ambiguous[0].path, 'text.base');
  assert.deepEqual(g.ambiguous[0].textLeaves.sort(), ['fontSize', 'lineHeight']);
  assert.deepEqual(g.ambiguous[0].otherLeaves, ['pad']);
});

test('an unreferenced sibling of an inferred token is advised, not inferred', () => {
  const g = textRoleGraph(graphFixture());
  const paths = g.unreferencedSiblings.map((u) => u.path);
  assert.ok(paths.includes('text.huge'), 'nothing references it, but its siblings are typographic');
  assert.ok(!paths.includes('text.stamped'), 'already closed by a source stamp');
  assert.ok(!paths.includes('text.ratio'), 'unitless — no size transform would claim it anyway');
  assert.ok(!paths.includes('space.md'), 'its group holds no inferred token');
  assert.equal(g.unreferencedSiblings.find((u) => u.path === 'text.huge').group, 'text');
});

test('an edge to a path that does not exist is collected, not thrown on', () => {
  const g = textRoleGraph({
    typography: { body: { fontSize: { $type: 'dimension', $value: '{nope.missing}' } } },
  });
  assert.ok(g.typographic.has('nope.missing'), 'the graph reports the edge; the applier skips it');
  assert.deepEqual(g.unreferencedSiblings, []);
});

test('a chain through a role-less intermediate is declined at the second hop', () => {
  const g = textRoleGraph({
    text: { base: { $type: 'dimension', $value: '16px' } },
    alias: { x: { $type: 'dimension', $value: '{text.base}' } },
    typography: { body: { fontSize: { $type: 'dimension', $value: '{alias.x}' } } },
  });
  assert.ok(g.typographic.has('alias.x'));
  assert.ok(!g.typographic.has('text.base'), 'the intermediate leaf name states no role');
});

test('a dual node is reached at its own path, before any hoist', () => {
  const g = textRoleGraph({
    text: { sm: { $type: 'dimension', $value: '14px', lineHeight: { $type: 'dimension', $value: '20px' } } },
    typography: { body: { fontSize: { $type: 'dimension', $value: '{text.sm}' } } },
  });
  assert.ok(g.typographic.has('text.sm'));
});

test('mergeDtcg lets a later source win and leaves its inputs alone', () => {
  const a = { typography: { body: { fontSize: { $value: '{text.sm}' } } }, keep: { x: { $value: '1px' } } };
  const b = { typography: { body: { fontSize: { $value: '{text.lg}' } } } };
  const merged = mergeDtcg([a, b]);
  assert.equal(merged.typography.body.fontSize.$value, '{text.lg}');
  assert.equal(merged.keep.x.$value, '1px');
  assert.equal(a.typography.body.fontSize.$value, '{text.sm}', 'inputs must not be mutated');
});

test('a merge can remove a referrer a union would have kept', () => {
  const desktop = { typography: { body: { fontSize: { $type: 'dimension', $value: '{text.lg}' } } } };
  const mobile = { typography: { body: { fontSize: { $type: 'dimension', $value: '{text.sm}' } } } };
  const base = { text: { lg: { $type: 'dimension', $value: '18px' }, sm: { $type: 'dimension', $value: '14px' } } };
  const g = textRoleGraph(mergeDtcg([base, desktop, mobile]));
  assert.ok(g.typographic.has('text.sm'));
  assert.ok(!g.typographic.has('text.lg'), 'the mobile file overwrote the only referrer to text.lg');
});
```

Add `textRoleGraph, mergeDtcg` to that file's import from `./dtcg.mjs`.

- [ ] **Step 2: Run and watch them fail**

Run: `node --test scripts/lib/dtcg.test.mjs`
Expected: FAIL — `textRoleGraph is not a function`.

- [ ] **Step 3: Implement both, appended to `scripts/lib/dtcg.mjs`**

```js
// Deep merge in list order, later source winning — the same later-wins rule
// validate-token-output.mjs already applies when it flattens a source list, and
// what Style Dictionary hands preprocess as one dict.
//
// Each source is cloned on the way in. Merging the caller's own objects would
// mutate the token trees it still holds, and the validator reads them again.
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

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
  const unreferencedSiblings = [];
  (function walk(node, prefix) {
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('$') || !isPlainObject(val)) continue;
      const path = [...prefix, key];
      const dotted = path.join('.');
      const group = prefix.join('.');
      if (
        '$value' in val &&
        val.$type === 'dimension' &&
        TEXT_ROLE_UNIT.test(String(val.$value).trim()) &&
        !referrers.has(dotted) &&
        !('nativeUnit' in (val.$extensions?.[EXT_NS] ?? {})) &&
        inferredGroups.has(group)
      ) {
        unreferencedSiblings.push({ path: dotted, group });
      }
      walk(val, path);
    }
  })(dict, []);

  return { typographic, ambiguous, unreferencedSiblings };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test scripts/lib/dtcg.test.mjs` then `node --test`
Expected: PASS, both.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/dtcg.mjs scripts/lib/dtcg.test.mjs
git commit -m "feat: infer a typographic role from the DTCG reference graph (#63)"
```

---

### Task 3: Apply the inference in `preprocess`, and correct the docs it falsifies

The behaviour change. Also corrects three documented claims — two this change falsifies, one already stale.

**Files:**
- Modify: `scripts/lib/sd-native.mjs` (new `applyTextRoleGraph`, new `preprocess` body, comment at `:330-334`)
- Modify: `scripts/build-native-adapter-config.mjs` (the `platform` prose, ~line 126)
- Test: `scripts/lib/sd-native.test.mjs`
- Regenerate: `references/native-adapter-config.md`

**Interfaces:**
- Consumes: `textRoleGraph` from Task 2; `TEXT_ROLE_UNIT`, `EXT_NS` from Task 1.
- Produces: no new export. `preprocess(dict)` keeps its signature and return shape.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/sd-native.test.mjs`:

```js
const roleDict = () => ({
  text: { base: { $type: 'dimension', $value: '16px' }, huge: { $type: 'dimension', $value: '96px' } },
  space: { md: { $type: 'dimension', $value: '8px' } },
  typography: {
    body: { fontSize: { $type: 'dimension', $value: '{text.base}' } },
    gutter: { $type: 'dimension', $value: '{space.md}' },
  },
});
const stampOf = (node) => node.$extensions?.[EXT_NS]?.nativeUnit;

test('a primitive referenced only by a fontSize is stamped as text', () => {
  const out = preprocess(roleDict());
  assert.equal(stampOf(out.text.base), 'text');
});

test('a primitive referenced by a role-less member is left alone', () => {
  const out = preprocess(roleDict());
  assert.equal(stampOf(out.space.md), undefined);
  assert.equal(stampOf(out.text.huge), undefined, 'nothing references it');
});

test('inference does not overwrite a role the source stated', () => {
  const dict = roleDict();
  dict.text.base.$extensions = { [EXT_NS]: { nativeUnit: 'length' } };
  const out = preprocess(dict);
  assert.equal(stampOf(out.text.base), 'length', 'a source opt-out survives the inference');
});

test('inference never stamps a unitless value', () => {
  const dict = roleDict();
  dict.text.base.$value = '1.5';
  const out = preprocess(dict);
  assert.equal(stampOf(out.text.base), undefined, 'a ratio is not a text-role dimension');
});

test('an unresolvable reference does not throw the inference', () => {
  const dict = { typography: { body: { fontSize: { $type: 'dimension', $value: '{nope.missing}' } } } };
  const out = preprocess(dict);
  assert.equal(out.typography.body.fontSize.$value, '{nope.missing}', 'left in place for SD to report');
});

test('preprocess stays idempotent with the inference in place', () => {
  const once = preprocess(roleDict());
  assert.deepEqual(preprocess(once), once);
});

test('an em letterSpacing primitive reaches Compose once the graph stamps it', () => {
  const dict = {
    tracking: { tight: { $type: 'dimension', $value: '-0.03em' } },
    typography: { body: { letterSpacing: { $type: 'dimension', $value: '{tracking.tight}' } } },
  };
  const out = preprocess(dict);
  assert.equal(stampOf(out.tracking.tight), 'text');
  const asToken = (n) => ({ ...n, original: { $value: n.$value } });
  assert.equal(nativeFilter(asToken(out.tracking.tight), 'android-kotlin'), true);
});
```

Add `preprocess, nativeFilter, EXT_NS` to that file's import if any is missing.

- [ ] **Step 2: Run and watch them fail**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: FAIL on the stamp assertions; the idempotency and unresolvable-reference tests may already pass.

- [ ] **Step 3: Add `applyTextRoleGraph`**

Insert immediately after `classifyTextUnits`'s closing brace, still inside the `preprocess` `@doc-section`:

```js
// Runs AFTER classifyTextUnits and BEFORE hoistDualNodes, on the SAME two
// grounds that pass gives: after, so a role the source or the member name
// already stated wins; before, because the hoist rewrites text.xs.lineHeight to
// text.xsLineHeight and the graph's paths are written in pre-hoist names.
//
// The three gates are classifyTextUnits's, verbatim — a dimension, a value with
// a unit, and no role already recorded. A unitless value is never stamped: no
// size transform claims one since #52, and stamping a ratio as text would still
// be a claim the source never made.
//
// A path may name no node at all. resolveInPlace deliberately leaves an
// unresolvable reference in place for Style Dictionary to report, so the graph
// can hold an edge to a token that does not exist. Skip it. This is also what
// keeps the second preprocess pass from throwing, and idempotency with it.
function applyTextRoleGraph(node, typographic) {
  for (const path of typographic) {
    let target = node;
    for (const segment of path.split('.')) {
      target = target && typeof target === 'object' ? target[segment] : undefined;
    }
    if (!target || typeof target !== 'object' || !('$value' in target)) continue;
    if (target.$type !== 'dimension') continue;
    if (!TEXT_ROLE_UNIT.test(String(target.$value).trim())) continue;
    target.$extensions ??= {};
    target.$extensions[EXT_NS] ??= {};
    const ns = target.$extensions[EXT_NS];
    if (!('nativeUnit' in ns)) ns.nativeUnit = 'text';
  }
  return node;
}
```

- [ ] **Step 4: Wire it into `preprocess`**

Replace the opening of `preprocess` — currently:

```js
export function preprocess(dict) {
  const collisions = [];
  const out = hoistDualNodes(
    classifyTextUnits(resolveInPlace(structuredClone(dict), flattenDtcg(dict))),
    collisions,
  );
```

with:

```js
export function preprocess(dict) {
  const collisions = [];
  // Read from the UNRESOLVED dict, before resolveInPlace flattens the aliases
  // the graph is made of.
  const { typographic } = textRoleGraph(dict);
  const out = hoistDualNodes(
    applyTextRoleGraph(
      classifyTextUnits(resolveInPlace(structuredClone(dict), flattenDtcg(dict))),
      typographic,
    ),
    collisions,
  );
```

Add `textRoleGraph` to the `./dtcg.mjs` import list at line 13.

- [ ] **Step 5: Correct the three documented claims**

In `scripts/lib/sd-native.mjs`, replace the two bullets at `:330-334` — currently:

```js
//   - A scale primitive carries no role. text.base: "16px" is a font size only
//     to a human, so it emits as dp. The semantic tokens referencing it are
//     correct, and those are what a consumer should reach for.
//   - An em-valued letterSpacing is filtered out of native output entirely,
//     rather than emitted as Compose's .em TextUnit.
```

with:

```js
//   - A scale primitive states no role, so #63 infers one from the reference
//     graph: a dimension referenced only by fontSize, letterSpacing or
//     lineHeight members is itself typographic. text.base: "16px" is stamped
//     because a fontSize references it. What remains is the primitive NOTHING
//     references — no structural signal exists for it, so it is not inferred,
//     and tokens:validate-output raises an unreferenced-text-sibling advisory
//     naming it rather than leaving the gap silent.
//   - An em-valued letterSpacing reaches Compose as a real .em TextUnit since
//     #64, but only where the text role is stamped. A role-less em value is
//     still filtered out of native output entirely.
```

In `scripts/build-native-adapter-config.mjs`, replace the first "What remains" bullet at ~line 126 — currently:

```
- **A bare scale primitive emits as \`dp\`.** \`text.base: "16px"\` is a font size
  only to a human — no nominal or structural signal marks it — so it is not
  stamped. The semantic tokens that reference it are, and those are what a
  consumer should reach for.
```

with:

```
- **A scale primitive nothing references emits as \`dp\`.** \`text.base: "16px"\`
  is a font size only to a human, so #63 takes the role from the reference
  graph instead: a dimension referenced only by \`fontSize\`, \`letterSpacing\` or
  \`lineHeight\` members is stamped typographic too. That is structural rather
  than nominal, so it needs no path convention. A primitive **nothing**
  references has no signal at all and is not inferred —
  \`tokens:validate-output\` names it with an \`unreferenced-text-sibling\`
  advisory, and a source-side \`nativeUnit\` stamp settles it.
```

- [ ] **Step 6: Run the tests**

Run: `node --test`
Expected: PASS. A pre-existing `sd-native` test that now fails is a **finding** — report it rather than editing the assertion.

- [ ] **Step 7: Regenerate and gate**

```bash
node scripts/build-native-adapter-config.mjs
node scripts/build-native-adapter-config.mjs --check
```
Expected: `--check` exits 0.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/lib/sd-native.test.mjs scripts/build-native-adapter-config.mjs references/native-adapter-config.md
git commit -m "feat: preprocess stamps a role the reference graph proves (#63)"
```

---

### Task 4: The two advisories in `tokens:validate-output`

Non-gating notes. The point of the whole task is the token that has **no emitted symbol**, so this cannot ride the existing declaration loop.

**Files:**
- Modify: `scripts/validate-token-output.mjs` (`validate`, `formatReport`, imports)
- Test: `scripts/validate-token-output.test.mjs`

**Interfaces:**
- Consumes: `textRoleGraph`, `mergeDtcg` (Task 2), `EXT_NS` (Task 1).
- Produces: two advisory shapes on `validate(...).advisories` — `{ rule: 'unreferenced-text-sibling', token, group }` and `{ rule: 'ambiguous-text-role', token, textLeaves, otherLeaves }`. Neither carries `symbol`, and neither affects `ok`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/validate-token-output.test.mjs`:

```js
const roleSources = () => [
  {
    file: 'tokens.json',
    dtcg: {
      text: { base: { $type: 'dimension', $value: '16px' }, huge: { $type: 'dimension', $value: '96px' } },
      tracking: { widest: { $type: 'dimension', $value: '0.15em' }, tight: { $type: 'dimension', $value: '-0.03em' } },
      typography: {
        body: {
          fontSize: { $type: 'dimension', $value: '{text.base}' },
          letterSpacing: { $type: 'dimension', $value: '{tracking.tight}' },
        },
      },
    },
  },
];

test('an unreferenced sibling is advised even though nothing emitted it', () => {
  const r = validate({
    sources: roleSources(),
    output: 'object Tokens {\n  val textBase = 16.00.sp\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  const advised = r.advisories.filter((a) => a.rule === 'unreferenced-text-sibling').map((a) => a.token);
  assert.ok(advised.includes('tracking.widest'), 'dropped from output entirely — the case that matters');
  assert.ok(advised.includes('text.huge'));
  assert.ok(
    r.advisories.every((a) => a.rule !== 'unreferenced-text-sibling' || !('symbol' in a)),
    'these advisories name a token path, not a symbol',
  );
});

test('an advisory is never a failure', () => {
  const r = validate({
    sources: roleSources(),
    output: 'object Tokens {\n  val textBase = 16.00.sp\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  assert.ok(r.advisories.length > 0, 'the fixture must actually produce advisories');
  assert.deepEqual(r.failures, [], 'advisories are reported, not gating');
  // Asserted on failures rather than on r.ok: ok also folds in the match rate,
  // so a green assertion there could be green for an unrelated reason.
});

test('a token referenced by both roles is advised as ambiguous', () => {
  const sources = roleSources();
  sources[0].dtcg.space = { pad: { $type: 'dimension', $value: '{text.base}' } };
  const r = validate({
    sources,
    output: 'object Tokens {\n  val textBase = 16.00.dp\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  const a = r.advisories.find((x) => x.rule === 'ambiguous-text-role');
  assert.ok(a, 'both-roles is reported, not silently declined');
  assert.equal(a.token, 'text.base');
  assert.deepEqual(a.otherLeaves, ['pad']);
});

test('formatReport renders a symbol-less advisory without printing undefined', () => {
  const r = validate({
    sources: roleSources(),
    output: 'object Tokens {\n  val textBase = 16.00.sp\n}\n',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  const text = formatReport(r).join('\n');
  assert.ok(text.includes('tracking.widest'));
  assert.ok(!/undefined/.test(text), 'a missing symbol must never reach the report');
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test scripts/validate-token-output.test.mjs`
Expected: FAIL — no such advisories are produced.

- [ ] **Step 3: Extend the imports**

In `scripts/validate-token-output.mjs`, change the `./lib/dtcg.mjs` import to:

```js
import {
  flattenDtcg,
  flattenDtcgTypes,
  resolveValue,
  findModeCollisions,
  textRoleGraph,
  mergeDtcg,
  EXT_NS,
} from './lib/dtcg.mjs';
```

- [ ] **Step 4: Add the source-side pass**

In `validate`, immediately after the `for (const { symbol, value } of decls)` loop closes and before `const matchRate = ...`:

```js
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
  const graph = textRoleGraph(mergeDtcg(sources.map((s) => s.dtcg)));
  for (const { path, group } of graph.unreferencedSiblings) {
    advisories.push({ rule: 'unreferenced-text-sibling', token: path, group });
  }
  for (const { path, textLeaves, otherLeaves } of graph.ambiguous) {
    advisories.push({ rule: 'ambiguous-text-role', token: path, textLeaves, otherLeaves });
  }
```

- [ ] **Step 5: Render them**

In `formatReport`, replace the body of the advisory loop — currently a single `lines.push(...)` — with:

```js
    for (const a of r.advisories) {
      if (a.rule === 'unreferenced-text-sibling') {
        lines.push(
          `  - [${a.rule}] ${a.token}: nothing references it, so no typographic role could be inferred — but tokens in "${a.group}" were. It emits as a length, or is dropped entirely if its unit is em. Stamp $extensions["${EXT_NS}"].nativeUnit = "text" on it in source to settle it, or leave it if it is not a text value.`,
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
```

- [ ] **Step 6: Run the tests**

Run: `node --test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/validate-token-output.mjs scripts/validate-token-output.test.mjs
git commit -m "feat: name the primitives the graph could not reach, instead of dropping them silently (#63)"
```

---

### Task 5: e2e against zygarden, compile the output, then the changelog

The spec's §6 table is a prediction. Measure it. A number that misses is a finding, not a number to edit.

**Files:**
- Create: `docs/superpowers/notes/2026-08-28-text-role-inference-e2e.md`
- Modify: `CHANGELOG.md` (`## [Unreleased]`)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: measured counts for the changelog entry.

- [ ] **Step 1: Build both platforms against real source**

Follow the procedure in `docs/superpowers/notes/2026-08-21-native-config-e2e-results.md`, using zygarden's source at `~/Dev/zygarden-frontend/libs/shared/util-tokens/src/tokens/`.

**Record which mode files the build included, before running it.** Per spec §8 the inference is mode-dependent — `text.6xl`'s only referrer lives in `typography-semantic.desktop.json` — so a count without its mode set cannot be reproduced.

- [ ] **Step 2: Count and compare against the prediction**

```bash
grep -c 'val ' Tokens.kt
grep -c 'static let' Tokens.swift
grep -c '\.sp$\|\.sp[^a-z]' Tokens.kt
```

| | before | spec §6 predicts | measured |
|---|--:|--:|--:|
| Kotlin declarations | 208 | 211 | |
| Swift declarations | 195 | 195 | |
| Kotlin symbols changed dp → sp | — | 9 or 10 | |

- [ ] **Step 3: Compile the output**

```bash
node ci/compile-native-output.mjs <build-dir>
```
Expected: exit 0, Kotlin PASS, Swift PASS. A Kotlin failure here is the real risk — `TextUnit` and `Dp` are different types and nine symbols just changed.

- [ ] **Step 4: Run the validator and read the advisories**

```bash
node scripts/validate-token-output.mjs --source <each json> --output Tokens.kt --platform android-kotlin
```
Expected: `unreferenced-text-sibling` naming `typography.letterSpacing.widest` and the unreferenced `text.*` tail. Confirm no `ambiguous-text-role` — spec §1 measured zero on this source, so one appearing means the merge differs from what was measured.

- [ ] **Step 5: Write the note**

Record: the mode set, every count, the full advisory output, the compile result, and any place the measurement disagreed with §6. Say so plainly where it did.

- [ ] **Step 6: Correct the handoff note's stale number**

Spec §2.1 records that `docs/superpowers/notes/2026-08-28-v0.16.0-shipped-handoff.md`
repeats the issue's wrong figure. Find the line reading:

```
#63 would take Android to 2 unmatched, both genuinely impossible.
```

Replace `2 unmatched` with the number Step 2 actually measured, and add one
clause saying why it is not 2 — `typography.letterSpacing.widest` is referenced
by nothing, so the reference graph cannot reach it. Do not edit the surrounding
paragraph.

- [ ] **Step 7: Add the changelog entry**

Under `## [Unreleased]`, using measured numbers, not predicted ones:

```markdown
### Breaking

- **A scale primitive referenced only by typographic members now emits `sp`, not
  `dp`.** `text.base: "16px"` was a font size only to a human; its role is now
  taken from the reference graph. On Android the symbol's type changes from `Dp`
  to `TextUnit`, so a use site like `Modifier.padding(Tokens.textBase)` stops
  compiling. That is the point — those symbols were always font sizes. Swift is
  unchanged; the sp/dp distinction is Compose-only.

### Fixed

- **An `em` letter-spacing primitive reaches Compose instead of being dropped.**
  #64 made `em` emit as a real `.em` TextUnit but only where the role was
  stamped, which reached the `typography.textStyle.*` members and not the
  primitives they reference. The graph now reaches those too.

### Added

- **`tokens:validate-output` names the primitives the graph could not reach.**
  A dimension nothing references has no structural signal, so no role is
  inferred — `unreferenced-text-sibling` names it and points at the
  `$extensions` stamp that settles it. `ambiguous-text-role` names a token
  referenced by both a typographic and a non-typographic member, which is
  declined rather than guessed. Both are advisories: reported, never gating.
```

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/notes/2026-08-28-text-role-inference-e2e.md CHANGELOG.md docs/superpowers/notes/2026-08-28-v0.16.0-shipped-handoff.md
git commit -m "docs: e2e proof of the inference against zygarden, and the changelog (#63)"
```
