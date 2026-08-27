# Stock transform accounting — design

**Issue:** [#54](https://github.com/jrpease/throughline/issues/54) — `PLATFORMS`
is a hand-transcribed snapshot of Style Dictionary's stock transform groups
**Date:** 2026-08-27
**File:** `scripts/lib/sd-native.mjs`

---

## 1. The measured problem

`scripts/lib/sd-native.mjs:314` states the module's design rule:

> Build each platform's transform list from Style Dictionary's **STOCK** group,
> replacing only the rem-assuming size transforms […] A hand-picked list
> silently drops whatever it forgets.

The rule is right — it is how #50 found three real defects, including Compose
font sizes rendered in `dp` instead of `sp`. But nothing enforces it. `PLATFORMS`
(`sd-native.mjs:341`) is a hand-written literal, and the stock lists it claims to
mirror exist only as **prose** at `sd-native.mjs:336-340`:

```
// Stock, from SD 4.4.0:
//   ios-swift: attribute/cti name/camel color/UIColorSwift
//              content/swift/literal asset/swift/literal size/swift/remToCGFloat
//   compose:   attribute/cti name/camel color/composeColor
//              size/compose/em size/compose/remToSp size/compose/remToDp
```

There is no machine-comparable record and no test. So the failure mode the
comment indicts is reintroduced one version later.

### 1.1 Both directions of drift are real, measured

Measured against real installs of Style Dictionary **4.4.0** and **5.5.2**
(the current latest), reading `StyleDictionary.hooks.transformGroups`:

| group | 4.4.0 | 5.5.2 | drift |
|---|---|---|---|
| `ios-swift` | 6 names | 6 names | **none — byte-identical** |
| `compose` | 6 names | 6 names | **none — byte-identical** |
| `ios` | …`size/remToPt` | …`size/remToFloat` | **renamed** |
| `android` | 5 names | 5 names | none |
| transforms registered | 55 | 62 | **+7 added** |

The two groups this module consumes have not drifted across thirteen months and
a major version. But Style Dictionary demonstrably does rename names inside a
stock group (`ios`) and does add transforms (+7). The risk is real; it has
simply not landed on us yet.

### 1.2 Why our CI cannot be the guard

`package.json` declares **no dependencies of any kind** — not even a peer
dependency on Style Dictionary. The rule is explicit in this project's own
plans: *"`scripts/` is a zero-dependency zone. `node:` built-ins only. No npm
packages, ever. Style Dictionary is passed in as an argument."*

Consequence: **the Style Dictionary a consumer runs is invisible to us.** There
is no lockfile to bump, no version to pin, and no natural trigger for a
version-pinned CI test. A guard that lives in our CI asserts something about a
version no consumer is guaranteed to run.

The only place the truth is known is the consumer's own build process — which
is exactly where `registerNativeTransforms(StyleDictionary)` already stands.

### 1.3 The asymmetry that decides the severity

- **A rename or removal of a transform we run fails loudly.** Style Dictionary
  throws on an unknown transform name at build time.
- **An addition is dropped silently.** A new stock transform we never learn
  about simply does not run, and the output is incomplete in whatever way that
  transform existed to prevent.

The second is the one worth guarding, and it is the one nothing catches today.

---

## 2. Three corrections to the issue text

**2.1 "Style Dictionary is a peer dependency" is not what `package.json` says.**
There is no `peerDependencies` block. It is an *implicit* peer, supplied by the
caller as a function argument. The practical effect is the same or stronger: we
have no declared version range at all, so we cannot even express a floor.

**2.2 The issue's third option — a version-pinned CI test — is not viable
alone.** §1.2: there is no dependency to pin and no natural trigger. It would
test a version we chose, not one a consumer runs. Rejected.

**2.3 The issue's recommended option (snapshot + assert) carries a liability the
issue does not price.** A hardcoded `STOCK_FROM_4_4_0` constant must be
re-blessed on every Style Dictionary release, and no test can distinguish
"our snapshot is stale" from "Style Dictionary drifted" — both present as
inequality. §3 avoids needing a snapshot at all.

---

## 3. The rule

Invert the comparison. Do not ask *"does live stock match what we recorded?"*
Ask the question the design rule actually poses:

> **Is there a stock transform this config neither runs nor explicitly declined?**

Answering it needs no snapshot. For each platform, take its stock group from the
live `transformGroups` and report every name that is **neither** in that
platform's own `transforms` array **nor** a declared exclusion.

This requires two things to become data.

**The stock group each platform mirrors** moves *into* `PLATFORMS`, not into a
parallel constant beside it:

```js
const PLATFORMS = {
  'ios-swift': {
    stockGroup: 'ios-swift',
    transforms: [ /* unchanged */ ],
    destination: 'Tokens.swift',
    format: 'ios-swift/enum.swift',
  },
  'android-kotlin': {
    stockGroup: 'compose',
    transforms: [ /* unchanged */ ],
    destination: 'Tokens.kt',
    format: 'compose/object',
  },
};
```

`nativePlatform()` builds its return value field by field
(`sd-native.mjs:435-453`) rather than spreading the preset, so `stockGroup` is
never emitted into the Style Dictionary platform config. Nothing about the
produced config changes.

**The exclusions** become a declared list. Today they are an *absence* from the
`PLATFORMS` arrays, which is indistinguishable from an oversight — issue item 4:

```js
// Stock transforms this config deliberately does NOT run. The reason is the
// point: an entry here is a decision on the record, where an absence from
// PLATFORMS is indistinguishable from an oversight.
const DECLINED_STOCK_TRANSFORMS = {
  'size/swift/remToCGFloat': 'rem-assuming — replaced by size/unit-aware/swift',
  'size/compose/remToDp': 'rem-assuming — replaced by size/unit-aware/compose-dp',
  'size/compose/remToSp': 'rem-assuming — replaced by size/unit-aware/compose-sp',
  'size/compose/em': 'em is not representable in native output — filtered out',
};
```

### 3.1 The declined list is flat across platforms, deliberately

`DECLINED_STOCK_TRANSFORMS` is keyed by transform name alone, with no platform
qualifier. A name declined for Compose is therefore also declined if it ever
appears in the `ios-swift` stock group.

That is safe today **only because every name in it is platform-prefixed**
(`size/swift/…`, `size/compose/…`), so no cross-platform collision is
expressible. That safety is a property of Style Dictionary's current naming
conventions, not of this design. A future decline of an unprefixed name — a
hypothetical shared `size/px` — would widen silently across both platforms.

The flat map is chosen because a per-platform map would be ceremony for a
collision that cannot currently occur. The moment an unprefixed name is
declined, it must become per-platform. Recorded in §12.

### 3.2 Why this beats the snapshot approach

- **Nothing to keep fresh.** No version-stamped constant, so no re-blessing
  ritual and no stale-vs-drifted ambiguity.
- **It states the actual rule.** "A hand-picked list silently drops whatever it
  forgets" becomes mechanically impossible: every stock name must be run or
  declined *in writing*.
- **It discharges issue item 4** — the exclusions stop being implicit.
- **It fits the module's existing principle.** From
  `2026-08-21-native-adapter-config-module-design.md:95-109`: *"Pure functions
  are the tested surface… testable without Style Dictionary present."* The check
  takes a plain object and tests against literals.
- **It catches renames too.** A renamed stock transform arrives as an
  unaccounted name.

### 3.3 What runs does not change

`PLATFORMS` keeps the same deliberate, reviewable transform arrays.
`nativePlatform()` returns exactly what it returns today. This is a diagnostic,
not a behaviour change.

Deriving the list at runtime instead — the issue's first option — was rejected:
it trades a silent *omission* for a silent *inclusion*, and every native defect
this project has found (#50's three, #51, #52) was a size/unit transform doing
the wrong thing to a value. Auto-admitting an unknown transform into the
pipeline is the more dangerous half of that trade.

### 3.4 A platform that declares no stock group

An earlier draft of this spec kept the mapping in a separate `STOCK_GROUP`
constant and claimed "the mapping enforces itself" because the audit iterates
`PLATFORMS` rather than `STOCK_GROUP`. That claim was unpinnable: both constants
had the same two keys, so an implementation looping over
`Object.entries(STOCK_GROUP)` — the more natural way to write it, since it
yields platform and group together — would satisfy every test and silently void
the guarantee.

Folding `stockGroup` into `PLATFORMS` **deletes the invariant instead of
asserting it.** There is no second constant to fall out of sync with, and no
wrong thing to iterate.

What remains is a preset that omits `stockGroup`. `auditStockGroups` reports
that as **its own finding kind with its own message** (§7) — never as a
group-missing finding, whose diagnosis (*Style Dictionary drifted; report your
version*) would be wrong for this cause and would tell a consumer to chase a
defect that is ours.

**The surface that catches it before shipping is our CI, not a consumer's
console.** Test 1 (§9) runs the audit against the real stock arrays and asserts
an empty result; a platform added without a `stockGroup` yields a finding and
that test fails. The `console.warn` is the backstop for a build we never ran,
not the primary guard.

---

## 4. Deliberate non-rules

Three things the check must **not** report. Each is pinned by a test (§9) so a
later change cannot quietly widen the rule.

**4.1 Order is never compared.** Our transform lists are hand-ordered for our own
reasons — `value/color-mix-to-hex8` must precede the colour transform, and there
is a test for it. That order does not derive from stock order. A pure reorder in
a stock group is therefore not actionable for us, and reporting it would be
noise.

**4.2 Removals are never reported.** A stock name we already declined
disappearing is a non-event. A stock name we actually *run* disappearing already
makes Style Dictionary throw on an unknown transform (§1.3), so we add nothing.

**4.3 Ungrouped transforms are out of scope.** Style Dictionary registered 62
transforms in 5.5.2; only six are in `compose`. A transform registered but placed
in no stock group is invisible to this check — correctly, because this module
mirrors *groups*, not the registry. Filed as a known limit (§12).

---

## 5. Severity: warn, never throw

The check **warns and never throws, and never changes an exit code.**

- The dangerous direction is an *addition*, which is almost always harmless —
  Style Dictionary 5.x added seven transforms, none touching our groups.
  Throwing would break a consumer's build over a change that is probably
  nothing, in a library they cannot edit, and would push them to pin an old
  Style Dictionary — the opposite of the goal.
- The direction that genuinely is fatal already throws inside Style Dictionary
  (§1.3).
- It matches the precedent set twice in this codebase: #52's unitless-dimension
  advisory and the doc lint are both non-gating by design.

Delivery: `console.warn('throughline: …')`, matching the existing convention at
`scripts/install.mjs:58`.

It fires once per **registration** — typically once per process — **not once per
build.** Registration and builds are not one-to-one: the module's own documented
usage (`build-native-adapter-config.mjs:190-199`) calls `registerNativeTransforms`
once and then constructs one `StyleDictionary` per mode. Nothing re-checks per
mode, and nothing needs to: the stock groups cannot change between modes.

---

## 6. The blind spot, and the decision on it

`registerNativeTransforms` is tested against a fake recorder —
`{ registerPreprocessor, registerTransform }` — at six call sites in
`sd-native.test.mjs`. None carries `hooks`.

**Decision: an unreadable `transformGroups` warns.** The six fakes gain `hooks`.

Reasoning: this whole issue is that *silent* is the dangerous direction. A guard
that can quietly switch itself off has precisely the defect it was built to fix.
The cost is six mechanical test edits; real consumers pass the real class, which
exposes `hooks.transformGroups` **statically, before instantiation**, in both
4.4.0 and 5.5.2 (measured).

The counter-argument, recorded because it is not weak: the module's own design
doc says `registerNativeTransforms` "is tested against a fake recorder object
with the same method names," and warning on an absent `hooks` makes that fake
incomplete by definition. The risk guarded is also narrow —
`registerTransform` and `registerPreprocessor` are statics too, so a Style
Dictionary that moved `hooks` would very likely fail loudly on those first. The
decision is a judgement that a self-disabling guard is the worse outcome, not a
claim that the counter-argument is wrong.

To keep the six fakes honest without pasting the same literal six times, the
test file routes them through a single fake factory — the pattern already used
near `sd-native.test.mjs:314`.

---

## 7. Who the message is addressed to

The warning prints in the **consumer's** build output, but both repairs it names
— edit `PLATFORMS`, or add to `DECLINED_STOCK_TRANSFORMS` — are edits to
**our** source. A consumer can act on neither.

So the message leads with the action the reader can take and names the
maintainer repair second, as the explanation. Without that ordering it is a
warning that blames the reader for something they cannot fix.

The three message forms, asserted verbatim by tests:

**Unaccounted** (`n` names, correctly singular/plural — no `transform(s)`):

```
throughline: Style Dictionary's "compose" transform group has 2 transforms this
adapter neither runs nor declined: size/compose/foo, size/compose/bar. Native
output may be incomplete. Upgrade @radicool/throughline, or report your Style
Dictionary version. (Maintainer repair: add each to
PLATFORMS['android-kotlin'].transforms, or to DECLINED_STOCK_TRANSFORMS with a
reason.)
```

**Group missing:**

```
throughline: Style Dictionary has no "compose" transform group, which
PLATFORMS['android-kotlin'] mirrors. The stock group may have been renamed or
removed. Upgrade @radicool/throughline, or report your Style Dictionary version.
```

**Unreadable:**

```
throughline: could not read Style Dictionary's stock transform groups
(hooks.transformGroups is not an object), so this adapter cannot check whether
its transform lists are still complete.
```

**No stock group declared** — a `PLATFORMS` preset missing `stockGroup`. This is
our defect, not a drift signal, so it says so rather than sending the reader
after their Style Dictionary version:

```
throughline: PLATFORMS['ios-tvos'] declares no stockGroup, so its transform list
cannot be checked against Style Dictionary's stock groups. This is a throughline
packaging defect — please report it.
```

The singular form of the unaccounted message reads `has 1 transform this
adapter neither runs nor declined:` — no `transform(s)` anywhere.

Each is emitted as a single-line string; the wrapping above is presentational.

---

## 8. Code shape

One exported pure function, returning **formatted strings** rather than
structured findings, so the wording is what the tests assert and the caller is
a bare loop:

```js
export function auditStockGroups(transformGroups) // → string[]
```

Contract:

- `transformGroups` fails `typeof transformGroups === 'object' && transformGroups !== null`
  → `[unreadable message]`, length 1, and nothing further is evaluated.
  **An array passes this check** — it is a non-null object — and therefore flows
  into the per-platform loop, where each platform yields a group-missing
  finding. That is the chosen reading; a stricter plain-object test is
  deliberately not used, because the only realistic non-object inputs are
  `undefined` and `null`, and rejecting arrays would be a rule with no case.
- Otherwise, for each entry of `PLATFORMS` in declaration order:
  - the preset has no `stockGroup` → the no-stock-group message for that
    platform.
  - `transformGroups[preset.stockGroup]` is not an array → the group-missing
    message for that platform.
  - otherwise, collect every name in that array that is neither in the
    platform's `transforms` nor a key of `DECLINED_STOCK_TRANSFORMS`. If the
    collection is non-empty, emit **one** unaccounted message listing all of
    them, comma-separated, in stock order.
- No findings → `[]`.

Each platform is evaluated independently: a finding for one must never suppress
evaluation of the other.

Call site, inside `registerNativeTransforms`:

```js
for (const w of auditStockGroups(StyleDictionary?.hooks?.transformGroups)) {
  console.warn(w);
}
```

The `?.` chain is what turns a fake with no `hooks` into `undefined`, which the
function reports as unreadable per §6.

---

## 9. Tests

All in `scripts/lib/sd-native.test.mjs`. The function takes a literal, so every
case is cheap and needs no Style Dictionary installed.

**Silence on reality**

1. The real stock arrays produce `[]`. One literal, commented as verified
   byte-identical in 4.4.0 and 5.5.2 — asserting the same array twice would be
   duplication, not coverage.

   This test carries two loads beyond the obvious one. It is the CI net for a
   platform added without a `stockGroup` (§3.4). And it discriminates against an
   implementation that compares the *reverse* direction: `PLATFORMS` contains six
   names absent from stock (`value/color-mix-to-hex8`, the three `unit-aware`
   size transforms, and both string-literal transforms), so a check asking "is
   everything we run in stock?" fails here immediately.

**The rule**

2. One unaccounted name → exactly one message, matching §7's **singular** form
   verbatim.
3. Two unaccounted names in one group → **one** message listing both,
   comma-separated in stock order — not two messages.
4. Both platforms unaccounted → two messages, one per platform.
5. A declined name present in stock → `[]`. Proves the deny-list is consulted.

**The non-rules of §4**

6. A stock group reordered, same names → `[]`. Discriminates against a check
   that compares ordered arrays.
7. A declined name removed from stock → `[]`. Discriminates against a
   snapshot-comparing implementation, which would report the removal.

**Degenerate inputs**

8. Group absent from `transformGroups` → group-missing message.
9. `undefined`, `null`, a string, and a number → the unreadable message,
   length 1, in each case.
10. An **array** → two group-missing messages, *not* the unreadable message.
    Pins §8's chosen reading, which two different implementations would
    otherwise both satisfy.

**Through the side-effecting caller**

11. `registerNativeTransforms` with a fake carrying correct `hooks` emits no
    warning (capture `console.warn`, restore in a `finally`).
12. `registerNativeTransforms` with a fake lacking `hooks` emits exactly one
    unreadable warning. This pins the §6 decision.

**Not broken**

13. The existing assertions at `sd-native.test.mjs:118-164` still pass
    unchanged — `nativePlatform`'s emitted arrays are untouched (§3.3).

### 9.1 What is deliberately not asserted

The **no-stock-group** message (§7) cannot be exercised from outside the module:
`PLATFORMS` is module-private and `auditStockGroups` takes no injectable platform
map. Adding a test-only injection parameter to a diagnostic would be
configurability nothing asked for.

So test 1 guards the *behaviour* — a preset added without `stockGroup` makes it
fail — while the message's exact wording ships unasserted. That is a real gap,
accepted rather than papered over, and recorded in §12.

---

## 10. Docs and generated output

The new constants and function sit inside the `@doc-section platform` block
(`sd-native.mjs:313-455`), so `references/native-adapter-config.md` **must be
regenerated**:

```
node scripts/build-native-adapter-config.mjs
```

CI gates freshness with `node scripts/build-native-adapter-config.mjs --check`.
Every task that touches `sd-native.mjs` regenerates and commits the doc in the
same commit.

**The `// Stock, from SD 4.4.0:` comment block is replaced.** Once the check
exists, that hand-transcribed prose is exactly the stale-snapshot liability §2.3
rejects — it will drift and nothing will notice. It becomes a short note stating
that the lists mirror Style Dictionary's stock groups, that `auditStockGroups`
enforces the mirroring at registration, and that both groups were verified
identical in 4.4.0 and 5.5.2. Comments in this file are load-bearing: they are
the shipped reference doc.

**`PROSE['platform']` in the generator must be updated too.** The prose that
accompanies the platform code block in the shipped reference is
`scripts/build-native-adapter-config.mjs:109-147` — a narrative section titled
*"Assemble the platform from the stock list"* that opens with the very rule this
change enforces. Regeneration alone would leave the code block gaining two
constants and an exported function with no prose acknowledging the audit exists,
against the generator's own principle that prose sits adjacent to the code it
explains.

It gains one paragraph stating: that the stock list is now accounted for rather
than mirrored by hand, that every stock transform must be run or declined in
writing, that the check warns and never throws, and that it fires in the
consumer's build because that is the only place the installed Style Dictionary
version is knowable. It must not restate the message text — that would be a
second copy to drift.

**No new user-facing reference beyond that.** The message carries its own
instructions (§7), and the repairs are ours, not the consumer's.

**CHANGELOG:** one entry under `## [Unreleased]` → `### Added`.

---

## 11. Constraints

- **Zero dependencies.** `node:` built-ins only. Style Dictionary is passed in
  as an argument and never imported.
- **Pure functions are the tested surface.** `auditStockGroups` is pure;
  `registerNativeTransforms` stays the only side-effecting export in this area.
- **Non-gating.** Nothing here throws, and nothing changes an exit code.
- **`sd-native.mjs` is a contended file.** It generates a CI-gated doc from its
  whole body, so concurrent branches conflict guaranteed. PR
  [#69](https://github.com/jrpease/throughline/pull/69) (#52) is open against it.
  This work **branches on top of `fix/52-unitless-dimension`**, and its PR must
  be **retargeted to `main` before #69 merges**. Merging a parent with
  `--delete-branch` auto-closes a stacked child, and it cannot be reopened once
  its head has been rebased — that cost PR #65 on 2026-08-24.

---

## 12. Known limits, to file rather than solve

- **Ungrouped transforms are invisible** (§4.3). Only names Style Dictionary
  places in a stock group are checked.
- **A stock reorder is not reported** (§4.1). If a future Style Dictionary
  reorders a group because order became semantically significant, this check is
  silent.
- **The check cannot verify that a declined transform is still the right thing
  to decline.** `DECLINED_STOCK_TRANSFORMS` entries carry reasons for a human;
  nothing tests that the reason still holds.
- **`DECLINED_STOCK_TRANSFORMS` is flat across platforms** (§3.1). Safe only
  while every declined name is platform-prefixed. Declining an unprefixed name
  must convert the map to per-platform; nothing enforces that today.
- **The no-stock-group message ships unasserted** (§9.1). Its behaviour is
  guarded by test 1; its wording is not.
