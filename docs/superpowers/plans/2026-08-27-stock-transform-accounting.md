# Stock Transform Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible for a Style Dictionary stock transform to be
silently dropped from ThroughLine's native transform lists, by requiring every
stock transform to be either run or declined in writing, and warning at
registration when one is neither.

**Architecture:** One pure exported function, `auditStockGroups`, walks each
platform's stock transform group and reports names accounted for by neither the
platform's own `transforms` array nor a new `DECLINED_STOCK_TRANSFORMS` map. The
stock group name each platform mirrors moves *into* `PLATFORMS` so there is no
parallel constant to drift. `registerNativeTransforms` — which already receives
the `StyleDictionary` class, on which `hooks.transformGroups` is readable
statically — calls it and `console.warn`s each result. Nothing that runs
changes.

**Tech Stack:** Node ≥20 ESM, zero dependencies, `node:test` +
`node:assert/strict`. Style Dictionary is passed in as an argument and never
imported.

**Spec:** `docs/superpowers/specs/2026-08-27-stock-transform-accounting-design.md`

## Global Constraints

- **Zero dependencies.** `scripts/` is a zero-dependency zone. `node:` built-ins
  only. No npm packages, ever. Style Dictionary is passed in as an argument and
  never imported.
- **Pure functions are the tested surface.** `auditStockGroups` is pure;
  `registerNativeTransforms` stays the only side-effecting export in this area.
- **Non-gating.** Nothing added here throws, and nothing changes an exit code.
  `console.warn` only.
- **`scripts/lib/sd-native.mjs` generates a CI-gated document.**
  `references/native-adapter-config.md` is built from that file's body via
  `@doc-section` markers. **Every task that edits `sd-native.mjs` or
  `scripts/build-native-adapter-config.mjs` must run
  `node scripts/build-native-adapter-config.mjs` and commit the regenerated
  `references/native-adapter-config.md` in the same commit.** CI gates it with
  `node scripts/build-native-adapter-config.mjs --check`.
- **The full test suite is `node --test` run from the repo root** — bare, with no
  path argument. `node --test scripts/lib/` fails with `MODULE_NOT_FOUND` and is
  not a real failure.
- **Message strings are asserted verbatim by tests.** Reword nothing without
  updating both sides. There is no `transform(s)` anywhere — singular and plural
  are separate strings.
- **Every commit ends with these two trailers, exactly:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018etbNQyHfuuGWwmd88T8Zm
  ```
- **Branch:** `feat/54-stock-transform-accounting`, stacked on
  `fix/52-unitless-dimension`. Do not rebase onto `main`; do not merge anything.

---

## File Structure

| File | Responsibility in this change |
|---|---|
| `scripts/lib/sd-native.mjs` | `stockGroup` added to each `PLATFORMS` preset; new `DECLINED_STOCK_TRANSFORMS` map; new exported `auditStockGroups`; call site in `registerNativeTransforms`; the stale `// Stock, from SD 4.4.0:` comment replaced |
| `scripts/lib/sd-native.test.mjs` | 13 new tests; the six existing `registerNativeTransforms` fakes consolidated onto one factory that carries `hooks` |
| `scripts/build-native-adapter-config.mjs` | `PROSE['platform']` gains one paragraph describing the audit |
| `references/native-adapter-config.md` | Regenerated — never hand-edited |
| `CHANGELOG.md` | One `### Added` entry under `## [Unreleased]` |

---

## Task 1: The audit function and its data

**Files:**
- Modify: `scripts/lib/sd-native.mjs` — `PLATFORMS` at `341-369`; insert new code immediately after line `369` (`};`) and before the `// % and em are container- or parent-relative` comment at `371`. Both insertions must land **inside** the `@doc-section platform` block, which opens at `313` and closes at `455`.
- Modify: `scripts/lib/sd-native.test.mjs` — add tests; extend the import list at the top.
- Regenerate: `references/native-adapter-config.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export function auditStockGroups(transformGroups: unknown): string[]` — pure; returns formatted warning strings, empty array when everything is accounted for. Task 2 calls it.
  - `PLATFORMS` presets each gain a `stockGroup: string` field. Module-private.
  - `DECLINED_STOCK_TRANSFORMS` — module-private object, transform name → reason string.

---

- [ ] **Step 1: Add `stockGroup` to both `PLATFORMS` presets**

In `scripts/lib/sd-native.mjs`, add one line as the **first** property of each
preset. Change nothing else about them.

```js
const PLATFORMS = {
  'ios-swift': {
    stockGroup: 'ios-swift',
    transforms: [
      'attribute/cti',
      'name/camel',
      'value/color-mix-to-hex8',
      'color/UIColorSwift',
      'content/swift/literal',
      'asset/swift/literal',
      'size/unit-aware/swift',
      'value/swift-string-literal',
    ],
    destination: 'Tokens.swift',
    format: 'ios-swift/enum.swift',
  },
  'android-kotlin': {
    stockGroup: 'compose',
    transforms: [
      'attribute/cti',
      'name/camel',
      'value/color-mix-to-hex8',
      'color/composeColor',
      'size/unit-aware/compose-dp',
      'size/unit-aware/compose-sp',
      'value/kotlin-string-literal',
    ],
    destination: 'Tokens.kt',
    format: 'compose/object',
  },
};
```

**Why this and not a separate `STOCK_GROUP` constant:** a parallel map with the
same two keys means an implementation looping over it instead of over
`PLATFORMS` behaves identically until someone adds a third platform — a bug no
test can discriminate. One constant makes the mistake unwriteable. `stockGroup`
is safe to add because `nativePlatform` (line `435-453`) builds its return value
field by field rather than spreading the preset, so it is never emitted into the
Style Dictionary platform config.

- [ ] **Step 2: Write the failing tests**

Append to `scripts/lib/sd-native.test.mjs`. First add `auditStockGroups` to the
existing import block at the top of the file (it imports from
`'./sd-native.mjs'`).

```js
// Style Dictionary's stock transform groups, read from real installs of 4.4.0
// and 5.5.2 via StyleDictionary.hooks.transformGroups. Both groups are
// byte-identical across those versions, so one literal covers both; asserting
// the same array twice would be duplication, not coverage.
const REAL_STOCK = {
  'ios-swift': [
    'attribute/cti',
    'name/camel',
    'color/UIColorSwift',
    'content/swift/literal',
    'asset/swift/literal',
    'size/swift/remToCGFloat',
  ],
  compose: [
    'attribute/cti',
    'name/camel',
    'color/composeColor',
    'size/compose/em',
    'size/compose/remToSp',
    'size/compose/remToDp',
  ],
};

const UNREADABLE =
  "throughline: could not read Style Dictionary's stock transform groups " +
  '(hooks.transformGroups is not an object), so this adapter cannot check ' +
  'whether its transform lists are still complete.';

const NO_COMPOSE_GROUP =
  'throughline: Style Dictionary has no "compose" transform group, which ' +
  "PLATFORMS['android-kotlin'] mirrors. The stock group may have been renamed " +
  'or removed. Upgrade @radicool/throughline, or report your Style Dictionary ' +
  'version.';

const NO_IOS_GROUP =
  'throughline: Style Dictionary has no "ios-swift" transform group, which ' +
  "PLATFORMS['ios-swift'] mirrors. The stock group may have been renamed " +
  'or removed. Upgrade @radicool/throughline, or report your Style Dictionary ' +
  'version.';

test('auditStockGroups is silent on the real stock groups', () => {
  assert.deepEqual(auditStockGroups(REAL_STOCK), []);
});

test('auditStockGroups reports one stock transform that is neither run nor declined', () => {
  const groups = { ...REAL_STOCK, compose: [...REAL_STOCK.compose, 'size/compose/foo'] };
  assert.deepEqual(auditStockGroups(groups), [
    'throughline: Style Dictionary\'s "compose" transform group has 1 transform ' +
      'this adapter neither runs nor declined: size/compose/foo. Native output ' +
      'may be incomplete. Upgrade @radicool/throughline, or report your Style ' +
      'Dictionary version. (Maintainer repair: add each to ' +
      "PLATFORMS['android-kotlin'].transforms, or to DECLINED_STOCK_TRANSFORMS " +
      'with a reason.)',
  ]);
});

test('auditStockGroups reports two unaccounted names in ONE message, in stock order', () => {
  const groups = {
    ...REAL_STOCK,
    compose: [...REAL_STOCK.compose, 'size/compose/foo', 'size/compose/bar'],
  };
  assert.deepEqual(auditStockGroups(groups), [
    'throughline: Style Dictionary\'s "compose" transform group has 2 transforms ' +
      'this adapter neither runs nor declined: size/compose/foo, size/compose/bar. ' +
      'Native output may be incomplete. Upgrade @radicool/throughline, or report ' +
      'your Style Dictionary version. (Maintainer repair: add each to ' +
      "PLATFORMS['android-kotlin'].transforms, or to DECLINED_STOCK_TRANSFORMS " +
      'with a reason.)',
  ]);
});

test('auditStockGroups reports each platform independently', () => {
  const groups = {
    'ios-swift': [...REAL_STOCK['ios-swift'], 'size/swift/newThing'],
    compose: [...REAL_STOCK.compose, 'size/compose/foo'],
  };
  const out = auditStockGroups(groups);
  assert.equal(out.length, 2);
  assert.ok(out[0].includes('"ios-swift" transform group has 1 transform'));
  assert.ok(out[0].includes('size/swift/newThing'));
  assert.ok(out[1].includes('"compose" transform group has 1 transform'));
  assert.ok(out[1].includes('size/compose/foo'));
});

test('auditStockGroups is silent on a group holding only declined transforms', () => {
  const groups = { ...REAL_STOCK, compose: ['size/compose/em', 'size/compose/remToDp'] };
  assert.deepEqual(auditStockGroups(groups), []);
});

test('auditStockGroups ignores stock ORDER', () => {
  const groups = { ...REAL_STOCK, compose: [...REAL_STOCK.compose].reverse() };
  assert.deepEqual(auditStockGroups(groups), []);
});

test('auditStockGroups ignores a REMOVED declined transform', () => {
  const groups = {
    ...REAL_STOCK,
    compose: REAL_STOCK.compose.filter((n) => n !== 'size/compose/em'),
  };
  assert.deepEqual(auditStockGroups(groups), []);
});

test('auditStockGroups reports a stock group that is absent entirely', () => {
  assert.deepEqual(auditStockGroups({ 'ios-swift': REAL_STOCK['ios-swift'] }), [
    NO_COMPOSE_GROUP,
  ]);
});

test('auditStockGroups reports unreadable transformGroups', () => {
  for (const bad of [undefined, null, 'nope', 42]) {
    assert.deepEqual(auditStockGroups(bad), [UNREADABLE], `input: ${String(bad)}`);
  }
});

test('auditStockGroups treats an array as a readable object with no groups', () => {
  assert.deepEqual(auditStockGroups([]), [NO_IOS_GROUP, NO_COMPOSE_GROUP]);
});
```

**Note on test 4 (`reports each platform independently`)** — it asserts on
fragments rather than two full strings on purpose: the two verbatim forms are
already pinned in full by tests 2 and 3, and what this test exists to
discriminate is that a finding for one platform does not suppress the other.
Repeating both full strings here would be duplication without added
discrimination.

**Note on test 10 (`treats an array as a readable object`)** — an array *is* a
non-null object, so it passes the readability check and falls through to the
per-platform loop. Two different implementations would otherwise both satisfy
the contract; this pins the chosen one.

**There is deliberately no test for the fourth message form** — the
`declares no stockGroup` warning added in Step 4. It cannot be reached from
outside the module: `PLATFORMS` is module-private and `auditStockGroups` takes
no injectable platform map, and adding a test-only injection parameter to a
diagnostic would be configurability nothing asked for. Test 1 guards the
*behaviour* — a platform added without a `stockGroup` makes it fail — while the
wording ships unasserted. This is recorded in the spec at §9.1 and §12. Do not
add an injection parameter to close it.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test`

Expected: FAIL. The first error is a `SyntaxError` about
`auditStockGroups` not being exported by `./sd-native.mjs` — the import is
unresolvable, so the whole test file fails to load rather than failing test by
test. That is the expected shape at this step.

- [ ] **Step 4: Write the implementation**

In `scripts/lib/sd-native.mjs`, insert immediately after `PLATFORMS`' closing
`};` (line `369`) and before the blank line preceding the
`// % and em are container- or parent-relative` comment:

```js

// Stock transforms this config deliberately does NOT run. The reason is the
// point: an entry here is a decision on the record, where an absence from
// PLATFORMS is indistinguishable from an oversight.
//
// Keyed by transform name alone, with no platform qualifier. That is safe only
// because every name here is platform-prefixed, so no cross-platform collision
// is expressible. Declining an unprefixed name — a hypothetical shared
// "size/px" — would widen silently across both platforms and must convert this
// to a per-platform map.
const DECLINED_STOCK_TRANSFORMS = {
  'size/swift/remToCGFloat': 'rem-assuming — replaced by size/unit-aware/swift',
  'size/compose/remToDp': 'rem-assuming — replaced by size/unit-aware/compose-dp',
  'size/compose/remToSp': 'rem-assuming — replaced by size/unit-aware/compose-sp',
  'size/compose/em': 'em is not representable in native output — filtered out',
};

// Report every transform in a platform's live stock group that this config
// neither runs nor explicitly declined. Pure: it takes Style Dictionary's
// hooks.transformGroups and returns formatted warning strings, so the wording
// is what the tests assert and the caller is a bare loop.
//
// Warns, never throws. The dangerous direction is an ADDITION we never learned
// about, which is usually harmless and occasionally important — throwing would
// break a build over a change the consumer cannot fix. The fatal direction, a
// transform we run being removed, already makes Style Dictionary throw on an
// unknown transform name.
//
// Order is never compared: our lists are hand-ordered for our own reasons and
// do not inherit stock order. Removals are never reported: a declined name
// disappearing is a non-event.
export function auditStockGroups(transformGroups) {
  if (typeof transformGroups !== 'object' || transformGroups === null) {
    return [
      "throughline: could not read Style Dictionary's stock transform groups " +
        '(hooks.transformGroups is not an object), so this adapter cannot check ' +
        'whether its transform lists are still complete.',
    ];
  }
  const warnings = [];
  for (const [platform, preset] of Object.entries(PLATFORMS)) {
    const group = preset.stockGroup;
    if (!group) {
      warnings.push(
        `throughline: PLATFORMS['${platform}'] declares no stockGroup, so its ` +
          "transform list cannot be checked against Style Dictionary's stock " +
          'groups. This is a throughline packaging defect — please report it.',
      );
      continue;
    }
    const stock = transformGroups[group];
    if (!Array.isArray(stock)) {
      warnings.push(
        `throughline: Style Dictionary has no "${group}" transform group, which ` +
          `PLATFORMS['${platform}'] mirrors. The stock group may have been ` +
          'renamed or removed. Upgrade @radicool/throughline, or report your ' +
          'Style Dictionary version.',
      );
      continue;
    }
    const unaccounted = stock.filter(
      (name) =>
        !preset.transforms.includes(name) &&
        !Object.hasOwn(DECLINED_STOCK_TRANSFORMS, name),
    );
    if (unaccounted.length) {
      const n = unaccounted.length;
      warnings.push(
        `throughline: Style Dictionary's "${group}" transform group has ${n} ` +
          `transform${n === 1 ? '' : 's'} this adapter neither runs nor declined: ` +
          `${unaccounted.join(', ')}. Native output may be incomplete. Upgrade ` +
          '@radicool/throughline, or report your Style Dictionary version. ' +
          `(Maintainer repair: add each to PLATFORMS['${platform}'].transforms, ` +
          'or to DECLINED_STOCK_TRANSFORMS with a reason.)',
      );
    }
  }
  return warnings;
}
```

`Object.hasOwn` rather than `name in DECLINED_STOCK_TRANSFORMS`: `in` also
matches inherited `Object.prototype` keys, so a stock transform named
`constructor` or `toString` would be treated as declined.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test`

Expected: PASS, 385 tests, 0 failures. (375 before this task, plus the 10 added
here.)

- [ ] **Step 6: Regenerate the reference doc**

Run: `node scripts/build-native-adapter-config.mjs`

Then verify the gate: `node scripts/build-native-adapter-config.mjs --check`

Expected: exit 0, no output. `git status` should show
`references/native-adapter-config.md` modified — the new constants and function
are inside `@doc-section platform`, so they now appear in the shipped doc.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/lib/sd-native.test.mjs references/native-adapter-config.md
git commit -F - <<'MSG'
feat: account for every Style Dictionary stock transform (#54)

PLATFORMS claimed to mirror Style Dictionary's stock transform groups but
nothing checked it, and the four rem-assuming transforms it declines existed
only as an absence from an array — indistinguishable from an oversight.

auditStockGroups reports any transform in a platform's live stock group that
is neither run nor listed in the new DECLINED_STOCK_TRANSFORMS map. The stock
group name lives inside PLATFORMS rather than in a parallel constant, so there
is nothing to fall out of sync with and no wrong thing to iterate.

Silent against Style Dictionary 4.4.0 and 5.5.2, whose ios-swift and compose
groups are byte-identical.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018etbNQyHfuuGWwmd88T8Zm
MSG
```

---

## Task 2: Wire the audit into registration

**Files:**
- Modify: `scripts/lib/sd-native.mjs` — `registerNativeTransforms`, which opens at `562` and closes at `625`.
- Modify: `scripts/lib/sd-native.test.mjs` — the six fakes at `256`, `275`, `284`, `302`, `309`, and the `collectTransforms` helper at `316`.
- Regenerate: `references/native-adapter-config.md`

**Interfaces:**
- Consumes: `auditStockGroups(transformGroups) → string[]` from Task 1, and the module-private `PLATFORMS` presets, each of which now carries `stockGroup`.
- Produces: nothing later tasks consume.

**Context you need that the brief cannot know:** Task 1 added a test-file
constant `REAL_STOCK` — an object with keys `'ios-swift'` and `compose`, each an
array of six stock transform names — and a constant `UNREADABLE` holding the
exact unreadable-input warning string. Both already exist near the other new
tests; reuse them, do not redefine them.

---

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/sd-native.test.mjs`:

```js
// Swap console.warn for the duration of fn and return everything it emitted.
// Restored in a finally so a throwing fn cannot leak the stub into later tests.
function captureWarnings(fn) {
  const original = console.warn;
  const seen = [];
  console.warn = (...args) => seen.push(args.join(' '));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return seen;
}

test('registerNativeTransforms is silent when the stock groups are accounted for', () => {
  const seen = captureWarnings(() => registerNativeTransforms(fakeStyleDictionary()));
  assert.deepEqual(seen, []);
});

test('registerNativeTransforms warns when it cannot read the stock transform groups', () => {
  const seen = captureWarnings(() =>
    registerNativeTransforms({ registerPreprocessor() {}, registerTransform() {} }),
  );
  assert.deepEqual(seen, [UNREADABLE]);
});
```

The second test is the one that pins the design decision: a caller with no
`hooks` gets told the check has gone blind, rather than the check quietly
switching itself off.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test`

Expected: FAIL — `fakeStyleDictionary is not defined` in the first test, and the
second fails its assertion with `actual: []` because nothing warns yet.

- [ ] **Step 3: Add the fake factory and route every existing fake through it**

Add this helper to `scripts/lib/sd-native.test.mjs`, replacing the existing
`collectTransforms` helper and its comment at lines `314-324`:

```js
// One fake Style Dictionary for every registerNativeTransforms call in this
// file. It carries hooks.transformGroups because registration now audits them,
// and a fake without hooks warns by design.
function fakeStyleDictionary({ onPreprocessor = () => {}, onTransform = () => {} } = {}) {
  return {
    hooks: { transformGroups: REAL_STOCK },
    registerPreprocessor: onPreprocessor,
    registerTransform: onTransform,
  };
}

// Collect the transforms registerNativeTransforms registers, keyed by name.
function collectTransforms() {
  const registered = new Map();
  registerNativeTransforms(
    fakeStyleDictionary({ onTransform: (t) => registered.set(t.name, t) }),
  );
  return registered;
}
```

Then rewrite the five inline fakes. Each currently builds a `transforms` array
and calls `.find(...)`; each becomes a `collectTransforms().get(...)`.

At line `253`, the preprocessor test keeps its own fake because it needs both
recorders:

```js
test('registerNativeTransforms registers the preprocessor and six transforms', () => {
  const preprocessors = [];
  const transforms = [];
  registerNativeTransforms(
    fakeStyleDictionary({
      onPreprocessor: (p) => preprocessors.push(p),
      onTransform: (t) => transforms.push(t),
    }),
  );

  assert.deepEqual(preprocessors.map((p) => p.name), ['dtcg/resolve-dual-node']);
  assert.deepEqual(transforms.map((t) => t.name).sort(), [
    'size/unit-aware/compose-dp',
    'size/unit-aware/compose-sp',
    'size/unit-aware/swift',
    'value/color-mix-to-hex8',
    'value/kotlin-string-literal',
    'value/swift-string-literal',
  ]);
  for (const t of transforms) assert.equal(t.type, 'value');
});

test('the registered swift transform converts a px dimension 1:1', () => {
  const swift = collectTransforms().get('size/unit-aware/swift');
  const token = { $type: 'dimension', $value: '14px', original: { $value: '14px' } };
  assert.equal(swift.filter(token), true);
  assert.equal(swift.transform(token), 'CGFloat(14.00)');
});

test('the registered compose transforms still split sp from dp by the legacy $type gate', () => {
  const registered = collectTransforms();
  const dp = registered.get('size/unit-aware/compose-dp');
  const sp = registered.get('size/unit-aware/compose-sp');

  const dimension = { $type: 'dimension', $value: '16px', original: { $value: '16px' } };
  const fontSize = { $type: 'fontSize', $value: '14px', original: { $value: '14px' } };

  assert.equal(dp.filter(dimension), true);
  assert.equal(dp.filter(fontSize), false);
  assert.equal(dp.transform(dimension), '16.00.dp');

  assert.equal(sp.filter(fontSize), true);
  assert.equal(sp.filter(dimension), false);
  assert.equal(sp.transform(fontSize), '14.00.sp');
});

test('the registered swift transform also handles fontSize, matching stock', () => {
  const swift = collectTransforms().get('size/unit-aware/swift');
  assert.equal(swift.filter({ $type: 'fontSize', $value: '14px', original: { $value: '14px' } }), true);
});

test('the registered size transforms skip a value with no native magnitude', () => {
  const swift = collectTransforms().get('size/unit-aware/swift');
  assert.equal(swift.filter({ $type: 'dimension', $value: '100%', original: { $value: '100%' } }), false);
});
```

`collectTransforms` must be **declared before** the tests that call it, or moved
to the top of the file — function declarations hoist within a module, so leaving
it where it is also works; do not spend time relocating it.

Assertions inside these five tests are unchanged. Only how the fake is
constructed changes. If any assertion needs editing to pass, stop and report it
— that would mean the refactor altered behaviour, which it must not.

- [ ] **Step 4: Add the call site**

In `scripts/lib/sd-native.mjs`, at the **end** of `registerNativeTransforms` —
after the final `StyleDictionary.registerTransform({...})` call and before the
closing `}` at line `625`:

```js

  // Last, so every registration side effect has completed before anything is
  // printed. Fires once per REGISTRATION — typically once per process, not once
  // per build: the documented usage registers once and then constructs one
  // StyleDictionary per mode, and the stock groups cannot change between modes.
  //
  // The ?. chain is what turns a caller with no hooks into undefined, which
  // auditStockGroups reports as unreadable rather than silently skipping.
  for (const warning of auditStockGroups(StyleDictionary?.hooks?.transformGroups)) {
    console.warn(warning);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test`

Expected: PASS, 387 tests, 0 failures. **No warning text may appear in the test
output** — if `throughline: could not read…` prints during the run, a fake was
missed in Step 3.

- [ ] **Step 6: Regenerate the reference doc**

Run: `node scripts/build-native-adapter-config.mjs`

Then verify: `node scripts/build-native-adapter-config.mjs --check`

Expected: exit 0. `references/native-adapter-config.md` is modified — the call
site is inside `@doc-section register`.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/lib/sd-native.test.mjs references/native-adapter-config.md
git commit -F - <<'MSG'
feat: run the stock transform audit at registration (#54)

registerNativeTransforms already holds the StyleDictionary class, on which
hooks.transformGroups is readable statically, so the audit runs in the
consumer's own build — the only place the installed Style Dictionary version
is knowable, since throughline declares no dependency on it.

A caller that exposes no hooks is warned that the check has gone blind rather
than having it silently switch off; the six test fakes in this file therefore
carry hooks, and now share one factory.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018etbNQyHfuuGWwmd88T8Zm
MSG
```

---

## Task 3: Retire the transcribed snapshot and document the audit

**Files:**
- Modify: `scripts/lib/sd-native.mjs:336-340` — the `// Stock, from SD 4.4.0:` comment block.
- Modify: `scripts/build-native-adapter-config.mjs` — `PROSE['platform']`, which opens at `109` and ends at the closing `` `], `` before `['sources', ...` at `148`.
- Modify: `CHANGELOG.md` — under `## [Unreleased]` at line `7`, above the existing `### Fixed` at line `9`.
- Regenerate: `references/native-adapter-config.md`

**Interfaces:**
- Consumes: `auditStockGroups` and `DECLINED_STOCK_TRANSFORMS` from Task 1 — referenced by name in prose only.
- Produces: nothing.

**Why this is a task and not a step:** the comment block in `sd-native.mjs` and
`PROSE['platform']` are both **shipped documentation** — they are the body of
`references/native-adapter-config.md`, which is published in the npm package.
A reviewer can reasonably reject the prose while approving the code.

---

- [ ] **Step 1: Replace the transcribed stock snapshot**

In `scripts/lib/sd-native.mjs`, replace these five lines (`336-340`) exactly:

```js
// Stock, from SD 4.4.0:
//   ios-swift: attribute/cti name/camel color/UIColorSwift
//              content/swift/literal asset/swift/literal size/swift/remToCGFloat
//   compose:   attribute/cti name/camel color/composeColor
//              size/compose/em size/compose/remToSp size/compose/remToDp
```

with:

```js
// The lists below mirror Style Dictionary's stock groups, and nothing derives
// them at runtime — what runs stays deliberate and reviewable. But nothing is
// transcribed either: auditStockGroups checks at registration that every name
// in the live stock group is either run here or declined in writing, so a
// stock transform this config has never made a decision about is loud rather
// than silently dropped.
//
// Both groups were verified byte-identical in SD 4.4.0 and 5.5.2. The `ios`
// group was not — it renamed size/remToPt to size/remToFloat between them, and
// 5.x added seven transforms overall. The drift this guards against is real;
// it has simply not landed on the two groups we build from.
```

The old block is a version-stamped snapshot that will go stale with nothing to
notice — precisely the liability the audit exists to remove. Do not keep it
alongside the new text.

- [ ] **Step 2: Add the prose paragraph to the generator**

In `scripts/build-native-adapter-config.mjs`, inside the `['platform', ...]`
entry, append this paragraph as the **last** paragraph of the template literal,
immediately before the closing `` `], ``:

```
**The stock list is accounted for, not transcribed.** \`PLATFORMS\` records the
stock group each platform mirrors, and \`auditStockGroups\` checks at
registration that every transform in that live group is either run here or
declined in writing, with a reason. A stock transform this config has never
decided about warns; it is never silently dropped. The check warns and never
throws — a new stock transform is usually harmless, and the fatal direction, a
transform we run being removed, already makes Style Dictionary throw on an
unknown name. It runs in your build because that is the only place the
installed Style Dictionary version is knowable: ThroughLine declares no
dependency on it.
```

Note the escaped backticks (`` \` ``) — this is inside a JavaScript template
literal, and an unescaped backtick terminates it and breaks the file.

Do **not** restate the warning message text here. That would be a second copy
to drift, and the messages are already asserted verbatim by tests.

- [ ] **Step 3: Add the CHANGELOG entry**

In `CHANGELOG.md`, insert a new `### Added` section immediately after
`## [Unreleased]` (line `7`) and before the existing `### Fixed` (line `9`):

```markdown
### Added
- **Style Dictionary's stock transform groups are now accounted for rather than
  transcribed.** `PLATFORMS` claimed to mirror the stock lists, but nothing
  checked it and the four rem-assuming transforms it declines existed only as
  an absence from an array — indistinguishable from an oversight. Each platform
  now records the stock group it mirrors, the exclusions are a declared list
  with reasons, and `auditStockGroups` reports at registration any transform in
  the live stock group that is neither run nor declined. It warns via
  `console.warn` and never throws, and never changes an exit code: a new stock
  transform is usually harmless, while the fatal direction — a transform we run
  being removed — already makes Style Dictionary throw on an unknown name. The
  check runs in your build because ThroughLine declares no dependency on Style
  Dictionary, so that is the only place the installed version is knowable.
  Verified silent against Style Dictionary 4.4.0 and 5.5.2, whose `ios-swift`
  and `compose` groups are byte-identical.
```

- [ ] **Step 4: Regenerate the reference doc and run every gate**

```bash
node scripts/build-native-adapter-config.mjs
node --test
node ci/validate-plugin.mjs
node ci/validate-skills.mjs
node scripts/adapters/generate.mjs --check
node scripts/build-doc-card-builder.mjs --check
node scripts/build-native-adapter-config.mjs --check
```

Expected: `node --test` reports 387 tests, 0 failures. Every other command exits
0 and prints no failure line. These are exactly the six steps in
`.github/workflows/ci.yml`.

Run each command separately. Quoting the whole string as one argument — e.g.
`node "scripts/adapters/generate.mjs --check"` — makes Node treat it as a
filename and report a spurious failure.

- [ ] **Step 5: Verify the regenerated doc actually changed**

Run: `git diff --stat references/native-adapter-config.md`

Expected: the file appears with a non-zero change count, and
`git diff references/native-adapter-config.md` shows both the replaced comment
block and the new prose paragraph. If it shows nothing, the generator did not
pick up the edits and Step 2's paragraph is in the wrong place.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/build-native-adapter-config.mjs references/native-adapter-config.md CHANGELOG.md
git commit -F - <<'MSG'
docs: retire the transcribed stock snapshot (#54)

The `// Stock, from SD 4.4.0:` comment was a hand-transcribed snapshot with
nothing to keep it fresh — the same liability the audit exists to remove. It
is replaced by a note on what the audit guarantees, plus the measured fact
that motivates it: SD's ios group renamed size/remToPt to size/remToFloat
between 4.4.0 and 5.5.2, and 5.x added seven transforms.

PROSE['platform'] gains a matching paragraph so the shipped reference explains
the audit next to the code that performs it, per the generator's own rule that
prose sits adjacent to what it describes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018etbNQyHfuuGWwmd88T8Zm
MSG
```

---

## Done when

- `node --test` reports **387 tests, 0 failures**, with no `throughline:` warning
  text in the output.
- All six CI gates pass.
- `git status` is clean.
- `references/native-adapter-config.md` contains `auditStockGroups`,
  `DECLINED_STOCK_TRANSFORMS`, `stockGroup` in both presets, and the new prose
  paragraph — and contains **no** `Stock, from SD 4.4.0` text.
- Three commits on `feat/54-stock-transform-accounting`, each carrying both
  required trailers.
