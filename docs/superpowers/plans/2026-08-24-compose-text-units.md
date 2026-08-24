# Compose Text Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Compose font sizes and line heights emit as `.sp` rather than
`.dp`, by sourcing the typographic role from DTCG §9.8's member names instead
of from a `$type` that DTCG does not define.

**Architecture:** A classification pass inside `preprocess`, running after
`resolveInPlace` and before `hoistDualNodes`, stamps
`$extensions["com.radicool.throughline"].nativeUnit = "text"` onto dimension
tokens named `fontSize`, `letterSpacing`, or `lineHeight` whose resolved value
carries an absolute unit. The two Compose size transforms then partition on
that stamp instead of on `$type === 'fontSize'`, which DTCG never produces.

**Tech Stack:** Node ≥20, ESM, zero runtime dependencies. Style Dictionary
4.4.0 is a *parameter*, never an import. Tests are `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-08-24-compose-text-unit-design.md`

## Global Constraints

- **Zero dependencies in `scripts/lib/`.** It is installed into consumer repos.
  Never `import` Style Dictionary; it arrives as a function parameter.
- **Every code line must sit inside an `@doc-section <name>` /
  `@doc-section-end <name>` comment pair.** Only blank lines and `//` comments
  may sit outside one. `scripts/build-native-adapter-config.mjs` throws
  otherwise and `--check` gates it in CI.
- **Regenerate the reference doc at the end of EVERY task** that edits
  `scripts/lib/sd-native.mjs`: `node scripts/build-native-adapter-config.mjs`.
  A freshness test goes red the moment the module changes; deferring the
  regeneration leaves a known-failing suite that a real regression can hide
  behind.
- **`preprocess` must stay structurally idempotent.**
  `assert.deepEqual(preprocess(preprocess(x)), preprocess(x))` is an existing
  test at `scripts/lib/sd-native.test.mjs:650`.
- **`preprocess` must not mutate its input** — existing test at
  `scripts/lib/sd-native.test.mjs:97`. It clones with `structuredClone` first.
- **The extension namespace string is exactly `com.radicool.throughline`** and
  the key inside it is exactly `nativeUnit`, value exactly `"text"`.
- **The three role names are exactly `fontSize`, `letterSpacing`, `lineHeight`**
  — matched against the token's own key, case-sensitive, exact equality.
- **Run the full suite with `node --test` from the repo root.** Do not add a
  test runner, a config file, or a dependency.
- **Do not change `size/unit-aware/swift`.** iOS is already correct.

---

## File Structure

| File | Responsibility in this change |
|---|---|
| `scripts/lib/sd-native.mjs` | All behaviour. Task 1 adds `classifyTextUnits` + `EXT_NS` to the `preprocess` doc-section; Task 2 changes two transform filters and the `platform` doc-section comment. |
| `scripts/lib/sd-native.test.mjs` | All tests. Append to the end; do not reorder existing tests. |
| `references/native-adapter-config.md` | **Generated.** Never hand-edit. Regenerate at the end of Tasks 1 and 2. |
| `references/sync-adapters.md` | Hand-written. Task 3 corrects the paragraph citing this defect. |
| `CHANGELOG.md` | Task 3 adds one `[Unreleased] / Fixed` entry. |

---

### Task 1: Classify text-unit roles in `preprocess`

**Files:**
- Modify: `scripts/lib/sd-native.mjs` — add code inside the existing
  `// @doc-section preprocess` / `// @doc-section-end preprocess` pair
  (currently lines 56–208), and change the `preprocess` function body.
- Test: `scripts/lib/sd-native.test.mjs` — append at end of file.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export const EXT_NS = 'com.radicool.throughline'` — Task 2's
  `isTextUnit` helper and its tests import this by name from
  `./sd-native.mjs`. Also produces the stamp shape
  `token.$extensions['com.radicool.throughline'].nativeUnit === 'text'`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/sd-native.test.mjs`. Add `EXT_NS` to the existing
import block at the top of the file (the one importing `magnitude`,
`colorMixToHex8`, `preprocess`, …).

```js
// #51. DTCG has no fontSize type, so the role cannot come from $type. It comes
// from the member names the Format Module's 30 July 2026 draft §9.8 fixes at
// MUST level for the typography composite.
const roleOf = (token) => token?.$extensions?.[EXT_NS]?.nativeUnit;

test('preprocess stamps a dimension named fontSize as a text unit', () => {
  const out = preprocess({
    typography: { h1: { fontSize: { $value: '30px', $type: 'dimension' } } },
  });
  assert.equal(roleOf(out.typography.h1.fontSize), 'text');
});

test('preprocess stamps letterSpacing and lineHeight, not fontFamily or fontWeight', () => {
  const out = preprocess({
    t: {
      letterSpacing: { $value: '0.5px', $type: 'dimension' },
      lineHeight: { $value: '24px', $type: 'dimension' },
      fontFamily: { $value: 'Nunito Sans', $type: 'fontFamily' },
      fontWeight: { $value: '700', $type: 'fontWeight' },
    },
  });
  assert.equal(roleOf(out.t.letterSpacing), 'text');
  assert.equal(roleOf(out.t.lineHeight), 'text');
  assert.equal(roleOf(out.t.fontFamily), undefined);
  assert.equal(roleOf(out.t.fontWeight), undefined);
});

// The load-bearing case, and the one the spec review caught. Every semantic
// font size in a real source is authored as a REFERENCE — "{text.3xl}" — and
// carries no unit at all. Classifying on the authored string would stamp only
// the px-authored primitives and miss two thirds of the fix.
test('preprocess stamps a fontSize authored as a reference, using the resolved value', () => {
  const out = preprocess({
    text: { '3xl': { $value: '30px', $type: 'dimension' } },
    typography: { h1: { fontSize: { $value: '{text.3xl}', $type: 'dimension' } } },
  });
  assert.equal(out.typography.h1.fontSize.$value, '30px');
  assert.equal(roleOf(out.typography.h1.fontSize), 'text');
});

// The hoist renames text.xs.lineHeight to text.xsLineHeight, consuming the
// leaf name the rule matches on. Classification must run first.
test('preprocess stamps a dual-node child before the hoist consumes its name', () => {
  const out = preprocess({
    text: { xs: { $value: '12px', $type: 'dimension', lineHeight: { $value: '16px', $type: 'dimension' } } },
  });
  assert.equal(out.text.xsLineHeight.$value, '16px');
  assert.equal(roleOf(out.text.xsLineHeight), 'text');
  assert.equal(roleOf(out.text.xs), undefined);
});

// magnitude() reads a bare number as a ratio. Stamping one would emit
// 1.50.sp — which compiles and renders 1.5sp text, trading a loud failure for
// a silent one. leading.normal stays the separate defect it already is.
test('preprocess does not stamp a unitless ratio named lineHeight', () => {
  const out = preprocess({
    t: { lineHeight: { $value: '1.5', $type: 'dimension' } },
  });
  assert.equal(roleOf(out.t.lineHeight), undefined);
});

test('preprocess does not stamp an em or percentage value', () => {
  const out = preprocess({
    t: {
      letterSpacing: { $value: '-0.03em', $type: 'dimension' },
      lineHeight: { $value: '150%', $type: 'dimension' },
    },
  });
  assert.equal(roleOf(out.t.letterSpacing), undefined);
  assert.equal(roleOf(out.t.lineHeight), undefined);
});

test('preprocess stamps rem as well as px', () => {
  const out = preprocess({ t: { fontSize: { $value: '1.5rem', $type: 'dimension' } } });
  assert.equal(roleOf(out.t.fontSize), 'text');
});

// The $type check reads the token's OWN key, so a fontSize typed something
// else is not swept in.
test('preprocess does not stamp a fontSize that is not dimension-typed', () => {
  const out = preprocess({ t: { fontSize: { $value: '30px', $type: 'string' } } });
  assert.equal(roleOf(out.t.fontSize), undefined);
});

// The override, and the reason this design needs no new config parameter.
test('preprocess honours a nativeUnit the source already set', () => {
  const out = preprocess({
    t: {
      lineHeight: {
        $value: '24px',
        $type: 'dimension',
        $extensions: { 'com.radicool.throughline': { nativeUnit: 'device' } },
      },
      size: {
        $value: '30px',
        $type: 'dimension',
        $extensions: { 'com.radicool.throughline': { nativeUnit: 'text' } },
      },
    },
  });
  assert.equal(roleOf(out.t.lineHeight), 'device');
  assert.equal(roleOf(out.t.size), 'text');
});

test('preprocess leaves an unrelated $extensions namespace untouched', () => {
  const out = preprocess({
    t: {
      fontSize: {
        $value: '30px',
        $type: 'dimension',
        $extensions: { 'org.example.other': { hint: 'keep me' } },
      },
    },
  });
  assert.equal(out.t.fontSize.$extensions['org.example.other'].hint, 'keep me');
  assert.equal(roleOf(out.t.fontSize), 'text');
});

test('preprocess does not stamp the caller input', () => {
  const input = { t: { fontSize: { $value: '30px', $type: 'dimension' } } };
  preprocess(input);
  assert.equal(input.t.fontSize.$extensions, undefined);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/sd-native.test.mjs`

Expected: FAIL. The import of `EXT_NS` fails first with
`SyntaxError: The requested module './sd-native.mjs' does not provide an export named 'EXT_NS'`.

- [ ] **Step 3: Add the classifier to the `preprocess` doc-section**

In `scripts/lib/sd-native.mjs`, insert immediately **before** the line
`export function preprocess(dict) {` (currently line 179) and **inside** the
`@doc-section preprocess` pair:

```js
// Which native unit a dimension belongs in: Compose's Dp, or its TextUnit.
//
// $type cannot answer this. DTCG's type set has no fontSize — font sizes are
// dimension, and so are spacing, radius and stroke widths — so the stock
// size/compose/remToSp filter on $type === 'fontSize' never fires on a
// spec-compliant source and every font size falls through to dp.
//
// The role therefore comes from the one place a DTCG source states it: the
// member names the Format Module's 30 July 2026 draft, §9.8, fixes at MUST
// level for the typography composite. Three of the five are dimension-valued,
// and Compose's TextStyle takes TextUnit for all three with no Dp overload.
//
// The limit, stated rather than hidden: §9.8 puts those names inside a
// composite token's $value object, while Figma-derived sources put them as
// sibling tokens in a group. Reading them there mirrors the spec's vocabulary;
// it is not a guarantee the spec makes. A source naming its font size
// typography.body.size sets $extensions itself and is honoured below.
const TEXT_UNIT_NAMES = new Set(['fontSize', 'letterSpacing', 'lineHeight']);

// Reverse-DNS, per DTCG's $extensions convention. Exported because the
// transforms and their tests address the same key.
export const EXT_NS = 'com.radicool.throughline';

// px and rem only. magnitude() reads a bare number as an unscaled ratio, so a
// lineHeight authored "1.5" would otherwise be stamped and emit 1.50.sp —
// which compiles and renders 1.5sp text. That trades a loud failure (a Dp
// where a TextUnit is required) for a silent one, which is the failure class
// this module exists to prevent. A ratio keeps today's behaviour and stays the
// separate defect it already is.
const ABSOLUTE_UNIT = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem)$/;

// Runs AFTER resolveInPlace and BEFORE hoistDualNodes. Both halves matter.
//
// After resolution, because the unit is not in the authored text: a semantic
// font size is authored "{text.3xl}" and carries no unit at all. Reading the
// authored string would classify only the px-authored primitives — 13 of 39
// on a real source.
//
// Before the hoist, because the hoist consumes the leaf name:
// text.xs.lineHeight becomes text.xsLineHeight, and the name this rule matches
// on is gone. Matching a suffix against the camel-joined name instead would
// couple the rule to the hoist's naming scheme, and case-insensitively it
// false-positives on names like baselineHeight.
function classifyTextUnits(node) {
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$') || !val || typeof val !== 'object') continue;
    if (
      TEXT_UNIT_NAMES.has(key) &&
      '$value' in val &&
      val.$type === 'dimension' &&
      ABSOLUTE_UNIT.test(String(val.$value).trim())
    ) {
      val.$extensions ??= {};
      val.$extensions[EXT_NS] ??= {};
      const ns = val.$extensions[EXT_NS];
      // A source that states the role itself wins. This is the override, and
      // it costs no configuration parameter: declining to overwrite IS the
      // feature. It is also what makes the pass idempotent.
      if (!('nativeUnit' in ns)) ns.nativeUnit = 'text';
    }
    classifyTextUnits(val);
  }
  return node;
}
```

- [ ] **Step 4: Wire it into `preprocess`**

In the same file, in `export function preprocess(dict)`, replace:

```js
  const out = hoistDualNodes(
    resolveInPlace(structuredClone(dict), flattenDtcg(dict)),
    collisions,
  );
```

with:

```js
  const out = hoistDualNodes(
    classifyTextUnits(resolveInPlace(structuredClone(dict), flattenDtcg(dict))),
    collisions,
  );
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test scripts/lib/sd-native.test.mjs`

Expected: PASS, including the pre-existing `preprocess is idempotent` and
`preprocess does not mutate its input` tests. If `preprocess is idempotent`
fails, the cause is the stamp being rewritten rather than declined — re-check
the `if (!('nativeUnit' in ns))` guard.

- [ ] **Step 6: Regenerate the reference doc**

Run: `node scripts/build-native-adapter-config.mjs`

Then confirm it is self-consistent: `node scripts/build-native-adapter-config.mjs --check`
Expected: exit 0.

- [ ] **Step 7: Run the full suite**

Run: `node --test`
Expected: 0 failures.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/lib/sd-native.test.mjs references/native-adapter-config.md
git commit -m "feat: classify DTCG typography members as Compose text units (#51)

Stamps \$extensions[com.radicool.throughline].nativeUnit on dimension tokens
named fontSize, letterSpacing or lineHeight, between alias resolution and the
dual-node hoist. No output change yet — the transforms read the stamp in the
next commit."
```

---

### Task 2: Partition the Compose size transforms on the stamp

**Files:**
- Modify: `scripts/lib/sd-native.mjs` — the `@doc-section register` pair
  (currently 397–500): add one helper, change two transform filters. Also the
  `@doc-section platform` comment block (currently 210–230), which currently
  documents the sp branch as unreachable.
- Test: `scripts/lib/sd-native.test.mjs` — append at end; also update one
  existing test named exactly
  `'the registered compose transforms split sp from dp by $type'`.

**Interfaces:**
- Consumes: `EXT_NS` from Task 1, and the stamp shape
  `token.$extensions[EXT_NS].nativeUnit === 'text'`.
- Produces: no new exports. Changes the observable output of
  `size/unit-aware/compose-sp` and `size/unit-aware/compose-dp`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/sd-native.test.mjs`:

```js
// #51. The sp branch used to gate on $type === 'fontSize', which DTCG never
// produces. It now gates on the role stamped in preprocess.
const stamped = (value) => ({
  $type: 'dimension',
  $value: value,
  original: { $value: value },
  $extensions: { [EXT_NS]: { nativeUnit: 'text' } },
});

test('the compose transforms split sp from dp by the text-unit stamp', () => {
  const t = collectTransforms();
  const dp = t.get('size/unit-aware/compose-dp');
  const sp = t.get('size/unit-aware/compose-sp');

  const textUnit = stamped('30px');
  const device = { $type: 'dimension', $value: '16px', original: { $value: '16px' } };

  assert.equal(sp.filter(textUnit), true);
  assert.equal(dp.filter(textUnit), false);
  assert.equal(sp.transform(textUnit), '30.00.sp');

  assert.equal(dp.filter(device), true);
  assert.equal(sp.filter(device), false);
  assert.equal(dp.transform(device), '16.00.dp');
});

// The partition must be disjoint: no token may be transformed by both, and
// none may fall through neither.
test('no dimension token matches both compose transforms', () => {
  const t = collectTransforms();
  const dp = t.get('size/unit-aware/compose-dp');
  const sp = t.get('size/unit-aware/compose-sp');
  for (const token of [
    stamped('30px'),
    { $type: 'dimension', $value: '16px', original: { $value: '16px' } },
    { $type: 'fontSize', $value: '14px', original: { $value: '14px' } },
  ]) {
    assert.equal(dp.filter(token) && sp.filter(token), false);
  }
});

// The override invites a source to stamp any token it likes, so the sp filter
// needs the same hasMagnitude guard both size transforms already carry.
// Without it this reaches authored(token).toFixed(2) on null.
test('the sp transform skips a stamped token with no build-time magnitude', () => {
  const sp = collectTransforms().get('size/unit-aware/compose-sp');
  assert.equal(sp.filter(stamped('-0.03em')), false);
  assert.equal(sp.filter(stamped('Nunito Sans')), false);
});

// Style Dictionary's own convention keeps working: this change is additive.
test('the sp transform still fires on a Style Dictionary $type fontSize', () => {
  const sp = collectTransforms().get('size/unit-aware/compose-sp');
  const token = { $type: 'fontSize', $value: '14px', original: { $value: '14px' } };
  assert.equal(sp.filter(token), true);
  assert.equal(sp.transform(token), '14.00.sp');
});

// End to end through preprocess: the shape a real source actually has.
test('a resolved semantic fontSize reaches the sp transform', () => {
  const out = preprocess({
    text: { '3xl': { $value: '30px', $type: 'dimension' } },
    typography: { h1: { fontSize: { $value: '{text.3xl}', $type: 'dimension' } } },
  });
  const token = out.typography.h1.fontSize;
  token.original = { $value: token.$value };
  const sp = collectTransforms().get('size/unit-aware/compose-sp');
  assert.equal(sp.filter(token), true);
  assert.equal(sp.transform(token), '30.00.sp');
});
```

- [ ] **Step 2: Update the one existing test that asserts the old gate**

Find the test named exactly
`'the registered compose transforms split sp from dp by $type'` (currently at
`scripts/lib/sd-native.test.mjs:281`). Rename it and add the stamped case, so
it documents both gates rather than only the legacy one. Replace the whole
test with:

```js
test('the registered compose transforms split sp from dp by $type or stamp', () => {
  const transforms = [];
  registerNativeTransforms({ registerPreprocessor: () => {}, registerTransform: (t) => transforms.push(t) });
  const dp = transforms.find((t) => t.name === 'size/unit-aware/compose-dp');
  const sp = transforms.find((t) => t.name === 'size/unit-aware/compose-sp');

  const dimension = { $type: 'dimension', $value: '16px', original: { $value: '16px' } };
  const fontSize = { $type: 'fontSize', $value: '14px', original: { $value: '14px' } };

  assert.equal(dp.filter(dimension), true);
  assert.equal(dp.filter(fontSize), false);
  assert.equal(dp.transform(dimension), '16.00.dp');

  assert.equal(sp.filter(fontSize), true);
  assert.equal(sp.filter(dimension), false);
  assert.equal(sp.transform(fontSize), '14.00.sp');
});
```

(The only change is the test name; the body still guards the legacy gate, and
the new tests from Step 1 cover the stamp.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test scripts/lib/sd-native.test.mjs`

Expected: FAIL on `the compose transforms split sp from dp by the text-unit stamp`
with `sp.filter(textUnit)` returning `false` and `dp.filter(textUnit)`
returning `true` — the current filters ignore the stamp.

- [ ] **Step 4: Add the helper and change the two filters**

In `scripts/lib/sd-native.mjs`, inside the `@doc-section register` pair, add
beside the existing `isDimension` / `isFontSize` / `hasMagnitude` consts
(currently lines 400–403):

```js
// The role preprocess stamped. $type cannot carry it — see classifyTextUnits.
const isTextUnit = (token) => token.$extensions?.[EXT_NS]?.nativeUnit === 'text';
```

Replace the `size/unit-aware/compose-dp` filter:

```js
    filter: (token) => isDimension(token) && hasMagnitude(token),
```

with:

```js
    filter: (token) => isDimension(token) && !isTextUnit(token) && hasMagnitude(token),
```

Replace the `size/unit-aware/compose-sp` filter:

```js
    filter: (token) => isFontSize(token) && hasMagnitude(token),
```

with:

```js
    filter: (token) => (isTextUnit(token) || isFontSize(token)) && hasMagnitude(token),
```

Leave both `transform` functions and `size/unit-aware/swift` untouched.

- [ ] **Step 5: Replace the stale comment in the `platform` doc-section**

In the `// @doc-section platform` block, delete this paragraph (currently
lines 217–224):

```
// That last one is only half fixed, and the half that remains is load-bearing:
// the sp transform below gates on $type === 'fontSize', but DTCG has no
// fontSize type — it types font sizes as dimension — so on a spec-compliant
// source the sp branch never fires and Android font sizes still emit as dp.
// Android-only; size/unit-aware/swift filters dimension || fontSize and is
// correct. Same class as a unitless ratio (leading.normal: "1.5") emitting as
// 1.50.dp. Both are measured, not theoretical — see
// docs/superpowers/notes/2026-08-21-native-config-e2e-results.md.
```

and put this in its place:

```
// That last one is fixed for tokens whose role a DTCG source actually states:
// classifyTextUnits stamps fontSize, letterSpacing and lineHeight members, and
// the sp transform gates on the stamp rather than on a $type DTCG never emits.
// Three limits remain, all Android-only and all measured rather than
// theoretical — see docs/superpowers/notes/2026-08-21-native-config-e2e-results.md:
//
//   - A scale primitive carries no role. text.base: "16px" is a font size only
//     to a human, so it emits as dp. The semantic tokens referencing it are
//     correct, and those are what a consumer should reach for.
//   - An em-valued letterSpacing is filtered out of native output entirely,
//     rather than emitted as Compose's .em TextUnit.
//   - A unitless ratio (leading.normal: "1.5") emits as 1.50.dp. It is
//     deliberately NOT stamped: 1.50.sp would compile and render 1.5sp text,
//     turning a loud failure into a silent one.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: PASS, all tests including the two updated ones.

- [ ] **Step 7: Regenerate the reference doc and run the full suite**

```bash
node scripts/build-native-adapter-config.mjs
node scripts/build-native-adapter-config.mjs --check
node --test
```
Expected: exit 0 from the `--check`, 0 test failures.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/lib/sd-native.test.mjs references/native-adapter-config.md
git commit -m "fix: Compose font sizes and line heights emit as sp, not dp (#51)

compose-sp now gates on the text-unit stamp as well as Style Dictionary's
\$type: fontSize, and compose-dp excludes stamped tokens. The partition is
disjoint. Compose TextStyle takes TextUnit for fontSize, lineHeight and
letterSpacing with no Dp overload, so the previous output did not compile at
the use site."
```

---

### Task 3: Correct the prose docs and record the changelog

**Files:**
- Modify: `references/sync-adapters.md` — the `android-kotlin` Tier 2
  paragraph (currently lines 73–82).
- Modify: `CHANGELOG.md` — the `## [Unreleased]` / `### Fixed` list.
- Do NOT modify `references/native-adapter-config.md` by hand; Task 2
  regenerated it.

**Interfaces:**
- Consumes: the behaviour Tasks 1 and 2 shipped.
- Produces: nothing consumed by later tasks.

> **Amended after Task 2's review.** Two defects in this plan's own text were
> found and are fixed in this task: the ratio example in Task 2 Step 5's
> comment is excluded by two gates rather than the one it illustrates, and the
> test renamed in Task 2 Step 2 has a title its body does not match. Both are
> written out as Steps 0a/0b in
> `.superpowers/sdd/2026-08-24-compose-text-units/task-3-brief.md`, with a
> Step 0c regenerating the reference doc — required, because 0a edits
> `scripts/lib/sd-native.mjs`.

- [ ] **Step 1: Correct the `sync-adapters.md` Tier 2 paragraph**

Replace this sentence inside the `android-kotlin` paragraph:

```
Concretely, DTCG has no `fontSize` type — it types font sizes as
`dimension` — and the `sp` transform gates on `$type === 'fontSize'`, so on
spec-compliant input Android font sizes currently emit as `dp`, not `sp`; the
Swift transform filters `dimension || fontSize` and is unaffected.
```

with:

```
The `dp`/`sp` split itself is no longer among them: font sizes and line
heights whose role a DTCG source states — the `fontSize`, `letterSpacing` and
`lineHeight` member names of §9.8's typography composite — now emit as `sp`.
What remains is narrower and documented in
`${CLAUDE_PLUGIN_ROOT}/references/native-adapter-config.md`: a bare scale
primitive carries no role and stays `dp`, an `em` letterSpacing is filtered
out rather than emitted as `.em`, and a unitless ratio still emits as `dp`.
```

Leave the rest of the paragraph — including "stays Tier 2" — unchanged. The
tier does not move: the stated reason is consumption-side behaviour against a
real Compose app, which building tokens does not exercise.

- [ ] **Step 2: Add the changelog entry**

In `CHANGELOG.md`, add as the FIRST bullet under `## [Unreleased]` →
`### Fixed`:

```markdown
- **Compose font sizes and line heights emit as `sp` rather than `dp`.**
  `size/unit-aware/compose-sp` gated on `$type === "fontSize"`, which DTCG
  does not define — it types font sizes as `dimension` — so on a
  spec-compliant source the branch never fired and every dimension emitted as
  `dp`. Measured on a real 322-token source: zero `.sp` in the Kotlin output.
  The role now comes from the member names DTCG §9.8 fixes for the typography
  composite: a `dimension` token named `fontSize`, `letterSpacing` or
  `lineHeight` whose resolved value carries a `px` or `rem` unit is stamped
  `$extensions["com.radicool.throughline"].nativeUnit = "text"` during
  preprocessing, and the Compose transforms partition on that stamp. Style
  Dictionary's own `$type: "fontSize"` convention still works, so the change
  is additive. A source can set the extension itself to override the rule, or
  set it to `"device"` to opt a token out. Three limits remain and are
  documented: a bare scale primitive (`text.base`) carries no role and stays
  `dp`, an `em` letterSpacing is still filtered out of native output, and a
  unitless ratio still emits as `dp` — deliberately, since `1.50.sp` would
  compile and render 1.5sp text.
```

- [ ] **Step 3: Verify the six repo gates**

```bash
node --test
node ci/validate-plugin.mjs
node ci/validate-skills.mjs
node scripts/adapters/generate.mjs --check
node scripts/build-doc-card-builder.mjs --check
node scripts/build-native-adapter-config.mjs --check
```
Expected: every one exits 0.

- [ ] **Step 4: Commit**

```bash
git add references/sync-adapters.md CHANGELOG.md
git commit -m "docs: record the Compose text-unit fix and correct the tier rationale (#51)"
```

---

## Verification (controller, after Task 3)

Not a subagent task — the controller runs this, because it needs the external
zygarden source and a scratch Style Dictionary install.

The spec's §7.1 prediction is falsifiable and must be checked by building at
the base commit and at HEAD and diffing, **not** by counting declarations.
Counting cannot see compensating changes.

Expected, against the zygarden light+mobile build:

- exactly **39** Kotlin declarations change, all `.dp` → `.sp`
  (13 `typography.textStyle.*.fontSize`, 13 `typography.textStyle.*.lineHeight`,
  13 hoisted `text.*LineHeight`)
- the other **156** are byte-identical
- declaration count stays **195**
- `Tokens.swift` is **byte-identical**
- `validate-token-output.mjs` exits 0 on both platforms, still 195/195 matched

Any deviation is a finding, not a rounding error.

## Follow-ups to file (controller, at PR time)

Spec §10. These are deliberately out of scope here and must be filed rather
than absorbed:

1. **A scale primitive carries no role.** `text.base: "16px"` emits as `dp`;
   no nominal or structural signal identifies it as typographic. Reference-graph
   inference — a dimension referenced by a `fontSize`-named token is itself a
   font size — is the candidate, and is the only option that reaches all 52.
2. **An `em`-valued `letterSpacing` is dropped rather than emitted as Compose
   `.em`.** A filter gap, not a dp/sp gap. Whoever fixes it must also revisit
   `ABSOLUTE_UNIT` in `classifyTextUnits`, since the two are coupled: today
   those tokens are not stamped.
