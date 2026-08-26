# Unitless Dimensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A unitless value is no longer claimed by any native size transform, so
it emits bare — the correct native form for a ratio — and `tokens:validate-output`
reports it as an advisory rather than passing it silently.

**Architecture:** One predicate (`isRatio`) added to `scripts/lib/sd-native.mjs`
and ANDed into the three size transforms' filters. One additive helper
(`flattenDtcgTypes`) in `scripts/lib/dtcg.mjs` giving the validator the `$type`
that `flattenDtcg` drops. One advisory rule in `scripts/validate-token-output.mjs`
that consumes it. No existing helper is narrowed or re-signatured.

**Tech Stack:** Node 20+ ESM, zero runtime dependencies, `node:test` +
`node:assert/strict`. Style Dictionary 4.4.0 is a *parameter*, never an import.

**Spec:** `docs/superpowers/specs/2026-08-26-unitless-dimension-design.md` — read
it before starting. The plan argues from it and does not restate its reasoning.

## Global Constraints

- **Branch:** `fix/52-unitless-dimension`, already created off `main`. Do not
  create another. Do not rebase.
- **Zero dependencies in `scripts/lib/`.** These files install into a user's
  `packages/tokens/scripts/`. Never add an import of `style-dictionary`.
- **`magnitude()` must not change.** Spec §5.1. It is correct as written, and
  changing it would put it in conflict with the validator's `expectedMagnitude`.
- **`flattenDtcg`'s signature and return shape must not change.** Spec §6.2. It
  has four consumers and both validators re-export it.
- **Regenerate the config doc in the same task as any change to
  `scripts/lib/sd-native.mjs`**, never at the end of the branch. The doc inlines
  the module's whole body, so *any* edit to that file — code or comment — makes
  `node scripts/build-native-adapter-config.mjs --check` fail until regenerated.
- **Full suite green before every commit:** `node --test` (353 tests at branch
  point).
- **Do not touch `~/Dev/zygarden-frontend`.** It is read-only source material,
  read with `git show <branch>:<path>`.
- Commit message trailers, on every commit:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018etbNQyHfuuGWwmd88T8Zm
  ```

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `scripts/lib/dtcg.mjs` | add `flattenDtcgTypes` — effective `$type` per dot-path | 1 |
| `scripts/lib/dtcg.test.mjs` | tests for the above | 1 |
| `scripts/lib/sd-native.mjs` | add `isRatio`; AND it into 3 filters; correct 3 comments | 2 |
| `scripts/lib/sd-native.test.mjs` | filter tests, both invariant tests, zero regression | 2 |
| `references/native-adapter-config.md` | GENERATED — regenerate, never hand-edit | 2, 4 |
| `scripts/validate-token-output.mjs` | `unitless-dimension` advisory + report line | 3 |
| `scripts/validate-token-output.test.mjs` | tests for the advisory | 3 |
| `scripts/build-native-adapter-config.mjs` | generator prose: three limits become two | 4 |
| `CHANGELOG.md` | two `Unreleased` entries | 4 |
| `docs/superpowers/notes/2026-08-26-unitless-dimension-e2e.md` | e2e evidence | 5 |

---

### Task 1: `flattenDtcgTypes`

Gives the validator the `$type` that `flattenDtcg` drops, without touching
`flattenDtcg`. Spec §6.2.

**Files:**
- Modify: `scripts/lib/dtcg.mjs` (append after `flattenDtcg`, before `resolveValue`)
- Test: `scripts/lib/dtcg.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `flattenDtcgTypes(obj, prefix = [], out = {}, groupType = undefined) -> Record<string, string|undefined>`
  — maps dot-path to effective `$type`. Task 3 imports it.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/dtcg.test.mjs`. Note the existing module-level `dtcg`
fixture at the top of that file is reused by the first test.

```js
test('flattenDtcgTypes reports a token own $type', () => {
  const types = flattenDtcgTypes(dtcg);
  assert.equal(types['text.sm'], 'dimension');
  assert.equal(types['color.gray.900'], 'color');
});

test('flattenDtcgTypes inherits from the nearest ancestor group', () => {
  const types = flattenDtcgTypes({
    leading: { $type: 'dimension', normal: { $value: '1.5' } },
  });
  assert.equal(types['leading.normal'], 'dimension');
});

// DTCG 6.1: a node carrying a $value is a token, not a group, so it is not an
// inheritance source. The same rule hoistDualNodes computes as `inherited`.
test('flattenDtcgTypes does not inherit from a $value-bearing node', () => {
  const types = flattenDtcgTypes({
    text: { sm: { $value: '14px', $type: 'dimension', lineHeight: { $value: '20px' } } },
  });
  assert.equal(types['text.sm'], 'dimension');
  assert.equal(types['text.sm.lineHeight'], undefined);
});

test('flattenDtcgTypes keeps an enclosing group type across a dual node', () => {
  const types = flattenDtcgTypes({
    text: { $type: 'dimension', sm: { $value: '14px', lineHeight: { $value: '20px' } } },
  });
  assert.equal(types['text.sm.lineHeight'], 'dimension');
});

test('flattenDtcgTypes lets an own $type beat an inherited one', () => {
  const types = flattenDtcgTypes({
    g: { $type: 'dimension', a: { $value: '400', $type: 'fontWeight' } },
  });
  assert.equal(types['g.a'], 'fontWeight');
});

test('flattenDtcgTypes returns undefined where nothing supplies a type', () => {
  const types = flattenDtcgTypes({ g: { a: { $value: '1.5' } } });
  assert.equal(types['g.a'], undefined);
});
```

Add `flattenDtcgTypes` to the import at the top of the file:

```js
import { flattenDtcg, flattenDtcgTypes, resolveValue, findModeCollisions } from './dtcg.mjs';
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/lib/dtcg.test.mjs`
Expected: FAIL — `flattenDtcgTypes is not a function`.

- [ ] **Step 3: Implement**

Insert into `scripts/lib/dtcg.mjs` immediately after `flattenDtcg`:

```js
// Flatten nested DTCG groups into { "dot.path": effectiveType }, applying the
// $type resolution of DTCG 5.2.2: a token's own $type wins, otherwise the
// nearest ancestor GROUP's. A node carrying a $value is a token, not a group
// (DTCG 6.1), so it is not an inheritance source for its children — the same
// rule hoistDualNodes computes as `inherited`, and the two must agree or two
// functions in this codebase disagree about the type of the same tree.
//
// Separate from flattenDtcg rather than folded into it: that function has four
// consumers and both validators re-export it, so its return shape is fixed.
//
// LIMIT, stated rather than hidden: this reads the RAW source, so it cannot see
// the $type carry hoistDualNodes applies during preprocessing. An untyped child
// of a dimension-typed dual node with no enclosing group type is a dimension to
// the pipeline and undefined here. Reference-derived typing (5.2.2 rule 1) is
// likewise not resolved — an alias is undefined, but its referent is typed, and
// the referent is the token an author edits.
export function flattenDtcgTypes(obj, prefix = [], out = {}, groupType = undefined) {
  const inherited = '$value' in obj ? groupType : (obj.$type ?? groupType);
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    if (!val || typeof val !== 'object') continue;
    const path = [...prefix, key];
    if ('$value' in val) out[path.join('.')] = val.$type ?? inherited;
    flattenDtcgTypes(val, path, out, inherited);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/lib/dtcg.test.mjs`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: PASS, 359 tests (353 + 6).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/dtcg.mjs scripts/lib/dtcg.test.mjs
git commit -m "feat: flattenDtcgTypes — effective \$type per dot-path (#52)"
```

---

### Task 2: `isRatio` and the three size-transform filters

The behaviour change. Spec §5.

**Files:**
- Modify: `scripts/lib/sd-native.mjs` — add `isRatio` near the other predicates
  (~line 507, beside `isDimension`/`isFontSize`/`hasMagnitude`); amend three
  filters in `registerNativeTransforms`; correct three comments
- Modify: `references/native-adapter-config.md` — GENERATED, regenerate only
- Test: `scripts/lib/sd-native.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: no new export. `isRatio` is module-private, matching `isDimension`,
  `isFontSize`, `hasMagnitude` and `isTextUnit`, which are all private and
  tested through the registered transforms via the existing `collectTransforms()`
  helper at `sd-native.test.mjs:314`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/sd-native.test.mjs`. `collectTransforms()` and `stamped()`
already exist in this file — do not redefine them.

```js
// #52. DTCG 8.2.1 requires a dimension to carry a unit; 8.7's `number` is the
// type for a ratio, and 9.8 types lineHeight as one. A unitless value is
// therefore malformed input, and no size transform may claim it.
test('no size transform claims a unitless dimension', () => {
  const t = collectTransforms();
  const token = { $type: 'dimension', $value: '1.5', original: { $value: '1.5' } };
  assert.equal(t.get('size/unit-aware/swift').filter(token), false);
  assert.equal(t.get('size/unit-aware/compose-dp').filter(token), false);
  assert.equal(t.get('size/unit-aware/compose-sp').filter(token), false);
});

test('no size transform claims a unitless fontSize', () => {
  const t = collectTransforms();
  const token = { $type: 'fontSize', $value: '1.5', original: { $value: '1.5' } };
  assert.equal(t.get('size/unit-aware/swift').filter(token), false);
  assert.equal(t.get('size/unit-aware/compose-sp').filter(token), false);
});

test('a unitless value is read from the ORIGINAL authored value', () => {
  const t = collectTransforms();
  const dp = t.get('size/unit-aware/compose-dp');
  // $value rewritten by an earlier transform; original is what decides.
  assert.equal(dp.filter({ $type: 'dimension', $value: '1.50.dp', original: { $value: '1.5' } }), false);
  assert.equal(dp.filter({ $type: 'dimension', $value: '1.5', original: { $value: '16px' } }), true);
});

test('a united dimension is still claimed', () => {
  const t = collectTransforms();
  const px = { $type: 'dimension', $value: '16px', original: { $value: '16px' } };
  assert.equal(t.get('size/unit-aware/compose-dp').filter(px), true);
  assert.equal(t.get('size/unit-aware/swift').filter(px), true);
});

// Spec 5.2. The load-bearing claim of the design: taking the advisory's advice
// ("type it number") must not change output.
//
// The SWIFT filter is what carries this — it gates on isDimension || isFontSize
// and so is the only one of the three sensitive to $type. Measured: drop
// !isRatio from swift alone and $type dimension emits CGFloat(1.50) while
// $type number emits bare. Keep swift in this loop or the test stops catching
// the variant that breaks the design.
test('a unitless value emits identically as $type dimension and as $type number', () => {
  const t = collectTransforms();
  const asDimension = { $type: 'dimension', $value: '1.5', original: { $value: '1.5' } };
  const asNumber = { $type: 'number', $value: '1.5', original: { $value: '1.5' } };
  for (const name of ['size/unit-aware/swift', 'size/unit-aware/compose-dp', 'size/unit-aware/compose-sp']) {
    const tr = t.get(name);
    assert.equal(tr.filter(asDimension), tr.filter(asNumber), `${name} must treat both $types alike`);
    assert.equal(tr.filter(asDimension), false, `${name} must claim neither`);
  }
});

// Spec 5.2. NOT an invariant test, deliberately. The invariant holds whether or
// not compose-sp carries !isRatio — measured, not assumed — because compose-sp
// filters on isTextUnit, which reads the stamp rather than $type, so a stamped
// token behaves the same under both $types either way. Only a direct
// behavioural assertion catches a missing !isRatio here.
//
// What it would emit without the guard: 1.50.sp — 1.5 scale-pixels of text,
// which is the output #51 gated ABSOLUTE_UNIT to prevent. An explicit stamp
// must not be able to produce it either.
test('a stamped unitless token is still declined — the override cannot manufacture a unit', () => {
  const sp = collectTransforms().get('size/unit-aware/compose-sp');
  assert.equal(sp.filter(stamped('1.5')), false);
  assert.equal(sp.filter({ ...stamped('1.5'), $type: 'number' }), false);
});

// The override's scope, narrowed and pinned: it chooses between dp and sp for a
// value that HAS a unit. It does not manufacture one.
test('the nativeUnit override still selects sp for a united value', () => {
  const sp = collectTransforms().get('size/unit-aware/compose-sp');
  assert.equal(sp.filter(stamped('30px')), true);
  assert.equal(sp.transform(stamped('30px')), '30.00.sp');
});

// Spec 5.4. A unitless zero is invalid DTCG for the same reason (8.2.1 requires
// the unit "even if $value.value is 0"). Recorded as a test so the behaviour
// change cannot later be reverted as though it were a bug.
test('a unitless zero is a ratio, not a zero measurement', () => {
  const t = collectTransforms();
  const zero = { $type: 'dimension', $value: '0', original: { $value: '0' } };
  assert.equal(t.get('size/unit-aware/compose-dp').filter(zero), false);
  assert.equal(t.get('size/unit-aware/swift').filter(zero), false);
  // "0px" is a measurement and is unaffected.
  const zeroPx = { $type: 'dimension', $value: '0px', original: { $value: '0px' } };
  assert.equal(t.get('size/unit-aware/compose-dp').filter(zeroPx), true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: FAIL — the unitless filters currently return `true`.

- [ ] **Step 3: Add the predicate**

In `scripts/lib/sd-native.mjs`, in the `register` doc-section, immediately after
`const hasMagnitude = (token) => authored(token) !== null;`:

```js
// A unitless value is a ratio, not a measurement. DTCG 8.2.1 requires a
// dimension to carry a unit ("still required even if $value.value is 0"), 8.7's
// `number` is the type for a multiplier, and 9.8 types lineHeight as one — so a
// unitless dimension is malformed input, and appending dp/sp/CGFloat to it
// invents a unit the source never stated. Declining it emits the raw value,
// which is exactly what a correctly typed `number` already produces.
//
// Reads the ORIGINAL authored value, like authored(), and must: preprocess has
// already resolved references by transform time, and a value transform earlier
// in the chain may have rewritten $value.
const RATIO = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const isRatio = (token) => RATIO.test(String(token.original?.$value ?? token.$value).trim());
```

- [ ] **Step 4: Amend the three filters**

In `registerNativeTransforms`, replace each `filter` line exactly:

```js
// size/unit-aware/swift
    filter: (token) => (isDimension(token) || isFontSize(token)) && hasMagnitude(token) && !isRatio(token),

// size/unit-aware/compose-dp
    filter: (token) => isDimension(token) && !isTextUnit(token) && hasMagnitude(token) && !isRatio(token),

// size/unit-aware/compose-sp
    filter: (token) => (isTextUnit(token) || isFontSize(token)) && hasMagnitude(token) && !isRatio(token),
```

All three carry `!isRatio`, but for two different reasons, and conflating them
is how the earlier draft of the spec went wrong:

- **`swift`** carries the output-neutrality invariant. It is the only one of the
  three that gates on `$type` (`isDimension || isFontSize`), so dropping
  `!isRatio` here makes `dimension` emit `CGFloat(1.50)` while `number` emits
  bare. Measured, not assumed.
- **`compose-dp`** is the basic fix: without it a unitless dimension still emits
  `N.dp` on Kotlin.
- **`compose-sp`** is on the merits, not the invariant. It gates on `isTextUnit`,
  which reads the stamp rather than `$type`, so it cannot break the invariant
  either way. Without it a *stamped* unitless token emits `1.50.sp`.

- [ ] **Step 5: Run to verify it passes**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: PASS.

- [ ] **Step 6: Narrow the partition test's comment**

`scripts/lib/sd-native.test.mjs:1017-1019` claims the dp/sp partition is "disjoint
AND total". That is no longer total — a unitless dimension matches neither. The
test itself still passes (its three fixtures all carry units); only the claim is
now too wide. Replace the comment above `test('no dimension token matches both compose transforms'...)`:

```js
// The partition must be disjoint AND total FOR A TOKEN THAT CARRIES A UNIT:
// exactly one of the two filters matches. Asserting `dp && sp === false` alone
// would pass against an implementation where both always return false, so
// assert the exclusive-or. A unitless value matches neither, deliberately (#52),
// and is covered by its own tests rather than folded in here.
```

- [ ] **Step 7: Correct the three comments the change falsifies**

**7a.** `classifyTextUnits`, the override comment (~line 267). Replace:

```js
      // A source that states the role itself wins — for a value that HAS a
      // unit. The override chooses between dp and sp; it does not manufacture
      // one, so a unitless value is declined by every size transform regardless
      // of what is stamped here (see isRatio, #52). Declining to overwrite IS
      // the feature: it costs no configuration parameter, and it is what makes
      // the pass idempotent.
```

**7b.** The `ABSOLUTE_UNIT` comment (~line 235). Replace:

```js
// px and rem only. magnitude() reads a bare number as an unscaled ratio, so a
// lineHeight authored "1.5" would otherwise be stamped and emit 1.50.sp —
// which compiles and renders 1.5sp text, trading a loud failure for a silent
// one. Since #52 a unitless value is declined by every size transform and
// emits bare, which is what DTCG 8.7 and 9.8 say a ratio is, so this gate is
// no longer the only thing standing between a ratio and 1.50.sp. It stays
// because the stamp is also the override's carrier, and stamping a ratio as
// text would still be a claim the source never made.
```

**7c.** The `platform` doc-section's limits list (~line 340). Replace the
`Three limits remain ...` paragraph and its three bullets with:

```js
// Two limits remain, both Android-only and both measured rather than
// theoretical — see docs/superpowers/notes/2026-08-21-native-config-e2e-results.md:
//
//   - A scale primitive carries no role. text.base: "16px" is a font size only
//     to a human, so it emits as dp. The semantic tokens referencing it are
//     correct, and those are what a consumer should reach for.
//   - An em-valued letterSpacing is filtered out of native output entirely,
//     rather than emitted as Compose's .em TextUnit.
//
// The third — a unitless ratio emitting as dp — is fixed by #52: no size
// transform claims a unitless value, so it emits bare on both platforms, and
// tokens:validate-output reports it as a unitless-dimension advisory.
```

- [ ] **Step 8: Regenerate the config doc**

The doc inlines this module's whole body, so it is stale after any edit above.

Run: `node scripts/build-native-adapter-config.mjs`
Then: `node scripts/build-native-adapter-config.mjs --check`
Expected: `--check` exits 0.

- [ ] **Step 9: Run the full suite**

Run: `node --test`
Expected: PASS. Eight tests added in this task.

- [ ] **Step 10: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/lib/sd-native.test.mjs references/native-adapter-config.md
git commit -m "fix: a unitless value is a ratio, so no size transform claims it (#52)"
```

---

### Task 3: the `unitless-dimension` advisory

Spec §6. Advisory means reported and **excluded from `ok`** — it must not change
any exit code.

**Files:**
- Modify: `scripts/validate-token-output.mjs` — import, two constants, a types
  map, the loop check, the return object, `formatReport`
- Test: `scripts/validate-token-output.test.mjs`

**Interfaces:**
- Consumes: `flattenDtcgTypes` from Task 1.
- Produces: `validate()`'s return object gains `advisories: Array<{rule, symbol, token, source, emitted}>`.
  `ok` is unchanged and does **not** consider it.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/validate-token-output.test.mjs`. The module-level `SRC`
fixture at line 127 already contains `leading.tight: "1.1"` typed `dimension`.

```js
// #52. A unitless dimension is invalid DTCG (8.2.1). The emitted output is
// correct under the ratio reading, so this is reported and does NOT gate.
test('unitless-dimension is reported as an advisory', () => {
  const r = validate({ sources: SRC, output: 'static let leadingTight = 1.1', platform: 'ios-swift' });
  assert.equal(r.advisories.length, 1);
  assert.equal(r.advisories[0].rule, 'unitless-dimension');
  assert.equal(r.advisories[0].token, 'leading.tight');
});

test('unitless-dimension does not fail the gate', () => {
  const r = validate({ sources: SRC, output: 'static let leadingTight = 1.1', platform: 'ios-swift' });
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

test('unitless-dimension ignores a unitless non-dimension', () => {
  const sources = [{ file: 't.json', dtcg: {
    w: { bold: { $value: '700', $type: 'fontWeight' } },
    ratio: { golden: { $value: '1.618', $type: 'number' } },
  } }];
  const r = validate({ sources, output: 'static let wBold = 700\nstatic let ratioGolden = 1.618', platform: 'ios-swift' });
  assert.deepEqual(r.advisories, []);
  assert.equal(r.ok, true);
});

test('unitless-dimension ignores a dimension that carries a unit', () => {
  const r = validate({ sources: SRC, output: 'static let textSm = CGFloat(14.00)', platform: 'ios-swift' });
  assert.deepEqual(r.advisories, []);
});

test('unitless-dimension fires on a type inherited from a group', () => {
  const sources = [{ file: 't.json', dtcg: {
    leading: { $type: 'dimension', normal: { $value: '1.5' } },
  } }];
  const r = validate({ sources, output: 'static let leadingNormal = 1.5', platform: 'ios-swift' });
  assert.equal(r.advisories.length, 1);
  assert.equal(r.advisories[0].token, 'leading.normal');
});

test('formatReport renders the advisory and names the fix', () => {
  const r = validate({ sources: SRC, output: 'static let leadingTight = 1.1', platform: 'ios-swift' });
  const text = formatReport(r).join('\n');
  assert.match(text, /unitless-dimension/);
  assert.match(text, /leadingTight/);
  assert.match(text, /"number"/);
});
```

Ensure `validate` and `formatReport` are imported at the top of the test file;
add whichever is missing to the existing import from `./validate-token-output.mjs`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/validate-token-output.test.mjs`
Expected: FAIL — `Cannot read properties of undefined (reading 'length')` on `r.advisories`.

- [ ] **Step 3: Import the helper**

`scripts/validate-token-output.mjs` line 10, and the re-export on line 14:

```js
import { flattenDtcg, flattenDtcgTypes, resolveValue, findModeCollisions } from './lib/dtcg.mjs';
```
```js
export { flattenDtcg, flattenDtcgTypes, resolveValue, findModeCollisions };
```

- [ ] **Step 4: Add the two constants**

Beside `BARE_UNIT` (~line 97):

```js
// #52. A unitless value is a ratio, not a measurement: DTCG 8.2.1 requires a
// dimension to carry a unit, and 8.7's `number` is the type for a multiplier.
// Distinct from BARE_UNIT, which requires a unit SUFFIX and so never matches
// this — which is exactly why the shape passed the gate silently before.
const UNITLESS = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const DIMENSIONAL = new Set(['dimension', 'fontSize']);
```

- [ ] **Step 5: Build the types map and collect advisories**

In `validate()`, after the `flat` loop (~line 128):

```js
  const types = {};
  for (const { dtcg } of sources) Object.assign(types, flattenDtcgTypes(dtcg));
```

Declare beside `const failures = [];`:

```js
  const advisories = [];
```

Inside the declaration loop, immediately after `matched += 1;`:

```js
    // Advisory, not a failure: the emitted value is correct under the ratio
    // reading this build applies, so it compiles and its magnitude matches.
    // What is wrong is the SOURCE's $type, which only the author can settle.
    if (UNITLESS.test(String(source).trim()) && DIMENSIONAL.has(types[path])) {
      advisories.push({ rule: 'unitless-dimension', symbol, token: path, source, emitted: value });
    }
```

- [ ] **Step 6: Return it, without touching `ok`**

Amend the return statement (~line 192). `ok` is deliberately unchanged:

```js
  return { total: decls.length, matched, matchRate, failures, advisories, collisions, minMatch, ok, unparsedLines, unemittedTokens };
```

- [ ] **Step 7: Render it**

In `formatReport`, immediately before the `if (r.unemittedTokens)` block:

```js
  if (r.advisories.length) {
    lines.push(`\n${r.advisories.length} advisory note(s) — reported, not gating:`);
    for (const a of r.advisories) {
      lines.push(
        `  - [${a.rule}] ${a.symbol}: source ${JSON.stringify(a.source)} for ${a.token} is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted ${a.emitted}, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.`,
      );
    }
  }
```

- [ ] **Step 8: Run to verify it passes**

Run: `node --test scripts/validate-token-output.test.mjs`
Expected: PASS.

- [ ] **Step 9: Run the full suite**

Run: `node --test`
Expected: PASS. Six tests added in this task.

- [ ] **Step 10: Commit**

```bash
git add scripts/validate-token-output.mjs scripts/validate-token-output.test.mjs
git commit -m "feat: report a unitless dimension as an advisory, not a gate failure (#52)"
```

---

### Task 4: generator prose, changelog, regenerate

Spec §9. The "three limits" claim also lives in the generator's own prose, which
Task 2 did not touch.

**Files:**
- Modify: `scripts/build-native-adapter-config.mjs:115-141`
- Modify: `CHANGELOG.md` — `Unreleased`
- Modify: `references/native-adapter-config.md` — GENERATED, regenerate only

**Interfaces:** none.

- [ ] **Step 1: Replace the generator's limits prose**

In `scripts/build-native-adapter-config.mjs`, replace from
``**The \`dp\`/\`sp\` split is fixed here; three narrower Android-only limits remain.**``
through the closing ``unit.`],`` — the whole block read in spec §9 item 1 — with:

```
**The \`dp\`/\`sp\` split is fixed here; two narrower Android-only limits remain.**
Style Dictionary's Compose transforms select on \`$type\`, and DTCG's type set
does not line up with what they expect — there is no \`fontSize\` type, because
DTCG types font sizes as \`dimension\`. So the role is taken instead from the
member names DTCG §9.8 fixes for the typography composite, stamped onto
\`$extensions\` during preprocessing, and the two Compose transforms partition on
that stamp. Measured against a real source: 39 declarations that emitted \`dp\`
now emit \`sp\`, with the Swift output byte-identical.

What remains:

- **A bare scale primitive emits as \`dp\`.** \`text.base: "16px"\` is a font size
  only to a human — no nominal or structural signal marks it — so it is not
  stamped. The semantic tokens that reference it are, and those are what a
  consumer should reach for.
- **An \`em\`-valued \`letterSpacing\` is dropped from native output entirely**
  rather than emitted as Compose's \`.em\` TextUnit. A filter gap, not a
  \`dp\`/\`sp\` gap.

Both are Android-only. \`size/unit-aware/swift\` filters
\`dimension || fontSize\` and emits \`CGFloat\`, which carries no unit to be wrong
about; iOS handles Dynamic Type at the use site via \`UIFontMetrics\`.
\`tokens:validate-output\` passes in both cases: it checks magnitude, not unit.

**A unitless value is no longer one of them.** DTCG §8.2.1 requires a dimension
to carry a unit, §8.7's \`number\` is the type for a ratio, and §9.8 types
\`lineHeight\` as one — so \`leading.normal: "1.5"\` typed \`dimension\` is malformed
input. No size transform claims it: it emits bare on both platforms, which is
byte-for-byte what a correctly typed \`number\` already produced, so correcting
the source's \`$type\` changes no output. \`tokens:validate-output\` reports it as
a \`unitless-dimension\` advisory, which does not gate — the emitted value is
right under the ratio reading, and only the author can say whether a ratio is
what was meant.\`],
```

- [ ] **Step 2: Regenerate and verify**

Run: `node scripts/build-native-adapter-config.mjs && node scripts/build-native-adapter-config.mjs --check`
Expected: `--check` exits 0.

- [ ] **Step 3: Add both changelog entries**

Under `## [Unreleased]`, add to `### Fixed`:

```markdown
- **A unitless value no longer emits with an invented unit.** `leading.normal:
  "1.5"` typed `dimension` emitted `1.50.dp` on Compose and `CGFloat(1.50)` on
  Swift — the magnitude faithful, the unit meaningless. DTCG §8.2.1 requires a
  dimension to carry a unit and §8.7's `number` is the type for a ratio, so this
  is malformed input rather than a shape to interpret. No size transform now
  claims a unitless value; it emits bare, which is byte-for-byte what a
  correctly typed `number` already produced on both platforms, so correcting a
  source's `$type` changes no output. `tokens:validate-output` reports it as a
  `unitless-dimension` advisory, which does not gate.
```

And a `### Changed` section (create it if absent), which is where the two
regressions belong — they are not fixes:

```markdown
### Changed
- **A dimension whose unit was omitted by mistake now fails loudly instead of
  working by accident.** `spacing.gutter: "16"` meant as `16px` previously
  emitted `16.00.dp`, correct only because px and dp map 1:1 by convention. It
  now emits bare `16`, which does not compile at a Compose `Dp` use site and
  infers `Int` in Swift, where it will not convert at a `CGFloat` use site. A
  unitless `0` is affected identically — DTCG §8.2.1 requires the unit "even if
  `$value.value` is `0`". Add the unit, or type the token `number` if it really
  is a ratio.
- **The `nativeUnit` override no longer applies to a unitless value.** It
  chooses between `dp` and `sp` for a value that has a unit; it does not
  manufacture one. A source that stamped `nativeUnit: "text"` onto a unitless
  token previously got `1.50.sp` — which compiles and renders 1.5sp text — and
  now gets the bare value. This narrows the "a source that states the role
  itself wins" contract introduced in 0.15.0.
```

- [ ] **Step 4: Run the full suite and every CI gate**

```bash
node --test
node ci/validate-plugin.mjs
node ci/validate-skills.mjs
node scripts/adapters/generate.mjs --check
node scripts/build-doc-card-builder.mjs --check
node scripts/build-native-adapter-config.mjs --check
```
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-native-adapter-config.mjs references/native-adapter-config.md CHANGELOG.md
git commit -m "docs: two native limits remain, not three (#52)"
```

---

### Task 5: end-to-end verification against zygarden

Spec §7's prediction is falsifiable; this task falsifies it or confirms it. The
byte-level diff is the assertion — declaration counts alone would miss
compensating changes.

**Files:**
- Create: `docs/superpowers/notes/2026-08-26-unitless-dimension-e2e.md`

**Interfaces:** none.

- [ ] **Step 1: Locate or rebuild the harness**

```bash
ls -d /private/tmp/claude-501/-Users-jordansstudio-Dev-throughline/*/scratchpad/e2e
```

A live harness has `tokens/` (15 JSON files), `node_modules/style-dictionary`
at 4.4.0, `build.mjs`, `run.sh`, and `scripts/lib` symlinked to
`/Users/jordansstudio/Dev/throughline/scripts/lib`. If none survives, rebuild:
`npm i style-dictionary@4.4.0` in a scratch dir, symlink `scripts/lib` and
`scripts/validate-token-output.mjs` to the repo, and extract the token sources
with `git show feature/apply-brandguide-styles:libs/shared/util-tokens/src/tokens/<file>`
from `~/Dev/zygarden-frontend`. **Do not check out or modify that repo.**

- [ ] **Step 2: Build at HEAD**

```bash
cd <harness> && bash run.sh out-52-head
```
Expected: exit 0 both platforms; `declarations 195 | .sp 39 | .dp 45`.

- [ ] **Step 3: Build at `main` in a throwaway worktree**

```bash
git worktree add /tmp/tl-main main
ln -sfn /tmp/tl-main/scripts/lib <harness>/scripts/lib
cd <harness> && bash run.sh out-52-main
```
Expected: `declarations 195 | .sp 39 | .dp 50`.

- [ ] **Step 4: Diff, then restore the symlink**

```bash
diff -r <harness>/out-52-main <harness>/out-52-head
ln -sfn /Users/jordansstudio/Dev/throughline/scripts/lib <harness>/scripts/lib
git worktree remove /tmp/tl-main
```

Expected, and **treat any deviation as a failed prediction, not a nuisance**:
- exactly 5 changed lines in `Tokens.kt` — `leadingTight/Snug/Normal/Relaxed/Loose`, `N.dp` to bare
- exactly 5 changed lines in `Tokens.swift` — the same five, `CGFloat(N)` to bare
- `leadingLoose` emits `2`, not `2.00` — integral ratios infer `Int` (spec §7)
- **no other line differs in either file**

- [ ] **Step 5: Confirm the advisory fires and does not gate**

Re-run `run.sh out-52-head` and read the validator output.
Expected: exit 0 on both platforms, each reporting **5** `unitless-dimension`
advisory notes naming `leading*`.

- [ ] **Step 6: Write the evidence note**

Create `docs/superpowers/notes/2026-08-26-unitless-dimension-e2e.md` following
`docs/superpowers/notes/2026-08-24-hoist-dual-nodes-e2e.md`: date, what the run
gates, the verdict, the harness description, the numbered procedure with real
pasted output, and the prediction-vs-actual table. If any prediction missed,
record what actually happened and **stop** — do not adjust the note to match.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/notes/2026-08-26-unitless-dimension-e2e.md
git commit -m "docs: e2e evidence for the unitless-dimension fix (#52)"
```

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin fix/52-unitless-dimension
```

PR body must state: the measured blast radius (5 orphaned tokens), the two
behaviour changes from the changelog's `Changed` section, and the §6.2 carry
limit with its follow-up. Target `main`.

---

## Follow-ups to file after the PR opens

Per spec §10 — file, do not absorb:

1. **The advisory cannot see the hoist's `$type` carry.** A unitless, untyped
   child of a `dimension`-typed dual node with no enclosing group type is
   flipped to bare by Task 2 and not flagged by Task 3. That is #60's
   genuinely-silent shape. Fixing it means deciding whether
   `validate-token-output.mjs` may read a preprocessed tree, which trades away
   its property of checking output against what the author actually wrote.
2. **The `number` type is unreachable from a Figma-derived source.** Figma emits
   no DTCG `number` tokens, so every ratio arrives mistyped and every user of
   this pipeline meets the advisory. Whether throughline's extraction should
   type ratios as `number` at the source is the item that would close this class.
