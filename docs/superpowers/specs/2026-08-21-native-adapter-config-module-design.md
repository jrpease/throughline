# Native adapter config as a shipped module — design

**Date:** 2026-08-21
**Status:** Proposed — revised after critic review
**Issue:** [#35](https://github.com/jrpease/throughline/issues/35)
**Follows:** `2026-08-21-token-output-validation-design.md` (shipped as #34)

> **Origin.** #34 made the native token failures *detectable*:
> `validate-token-output.mjs` catches the ×16 dimension bug, leaked
> `color-mix()`, unresolved dual-node aliases, and mode collisions. It also
> produced `references/native-adapter-config.md`, a Style Dictionary
> configuration verified at 196/196 correct symbols against a real source.
> That configuration ships as **prose**. This spec makes it ship as **code**.

## Problem

The fix for the ×16 bug exists, is verified, and is documented. It is not
installed.

`skills/token-sync-layer/SKILL.md:147` and `references/sync-adapters.md:122`
both already mandate `native-adapter-config.md` over a stock `transformGroup`.
So the gap is not that throughline says the wrong thing — it is that saying the
right thing requires an agent to transcribe roughly 80 lines of preprocessor and
transform code correctly, from a Markdown file, on every native sync.

Transcription is exactly where this regresses. Three of the four failure classes
are silent by construction (they emit code that compiles), so a transcription
slip does not announce itself — it ships.

One failure is worse than the other three and lives outside the transcribed
block entirely. Style Dictionary deduplicates by dot-path, so a single build
over a token directory containing both a light and a dark definition of the same
token keeps whichever file sorted last and **drops the other mode without a
diagnostic**. The current mitigation is a paragraph telling the agent to build
once per mode. Nothing enforces it.

## Goals

1. A native sync with **no manual configuration** produces output that passes
   `tokens:validate-output` against a real source.
2. The configuration that ships and the configuration that is documented cannot
   diverge.
3. The silent mode-drop becomes a loud failure before the build, not a wrong
   artifact after it — enforced by position in the data path, not by
   instruction. See Decision 4.

> **Revision note.** A critic review found Decision 7 invalidated four files the
> Modify list did not name, that nothing guaranteed the mode guard would ever be
> called, and that the Android half of `nativePlatform` was unspecified. All
> three are resolved below and marked ⟨rev⟩, along with two ambiguities
> (Decision 5's generation mechanism, Decision 7's tier-row content).

## Non-goals

- **Replacing or wrapping the build loop.** Where token sources live and which
  mode combinations exist are project facts. The module supplies a platform
  config; the project drives the loop.
- **Promoting `android-kotlin` to Tier 1.** See Decision 7.
- **A web-side equivalent.** Tracked separately as #37.
- **Reopening the Style Dictionary question.** Settled in #34's spec; the
  answer is no.

## Decisions

### 1. The module owns transforms *and* platform assembly

`scripts/lib/sd-native.mjs` exports both the registration side effect and a
platform-config factory:

```js
registerNativeTransforms(StyleDictionary);           // preprocessor + 4 transforms
nativeSources(paths);                                // → same paths, guarded ⟨rev⟩
nativePlatform({ platform, buildPath, ...opts });    // → plain config object
```

**Why assembly is included.** The ×16 bug's proximate cause is choosing a stock
`transformGroup` instead of an explicit transform list. That choice lives in the
platform block. A module that registers correct transforms but leaves assembly
to transcription leaves the decision that causes the bug in the hands of the
process that causes the bug.

**Why the loop is excluded.** Owning `buildNative({ modes, sourcesFor, outDir })`
would mean owning build orchestration, output layout, and error handling for
every project shape — a large interface, and one that fights any repo with an
existing token build script.

### 2. Style Dictionary is a parameter, never an import

`scripts/` is a zero-dependency zone: `node:` built-ins only. The module takes
the `StyleDictionary` constructor as an argument. This is not a workaround for
the constraint — it is what lets the module be *installed into a user's repo*
alongside `lib/dtcg.mjs`, where the dependency legitimately exists, exactly as
the two existing validators are installed.

### 3. Pure functions are the tested surface

Exports split into pure and side-effecting:

| Export | Kind | Returns |
|---|---|---|
| `magnitude(authored)` | pure | number \| null |
| `colorMixToHex8(value)` | pure | string \| null |
| `preprocess(dict)` | pure | resolved + hoisted token tree |
| `nativePlatform(opts)` | pure | platform config **object** |
| `nativeSources(paths)` ⟨rev⟩ | reads files, throws | the same `paths` |
| `registerNativeTransforms(SD)` | side effect | void |

`nativePlatform` returning a plain object rather than mutating anything is what
makes assembly testable without Style Dictionary present:
a test asserts the emitted transform list contains `size/unit-aware/swift` and
contains no stock group name. `registerNativeTransforms` is tested against a
fake recorder object with the same method names.

### 4. The mode guard sits in the data path ⟨rev⟩

The first draft exported `assertSingleMode(sources)` for the project's loop to
call. The critic was right that this fails its own Goal 3: nothing in the module
sees the source list, so the guard fires only if the agent remembers to invoke
it — the same instruction-following the Problem section indicts, one line
cheaper.

The fix is positional. `nativeSources(paths)` reads and parses the files, runs
the collision check, throws on collision, and **returns the same paths**, so it
wraps the value the build already needs:

```js
const sd = new StyleDictionary({
  source: nativeSources(sourcesFor(mode)),   // cannot be skipped
  preprocessors: ['dtcg/resolve-dual-node'],
  platforms: { ios: nativePlatform({ platform: 'ios-swift', buildPath: out }) },
});
```

Skipping the guard now means deleting a call whose return value is consumed,
rather than omitting a line nothing depends on. That is the difference between
a check and a convention.

It reads files, so it is not pure — `node:fs` is a built-in and stays inside the
zero-dependency rule. Tests write fixtures to a temp directory.

**The check itself is not reimplemented.** `validate-token-output.mjs:92`
already exports `findModeCollisions(sources)`, taking `[{ file, dtcg }]`.
`nativeSources` parses paths into that shape and delegates.

To avoid a cycle (the module must not import the validator), `findModeCollisions`
moves into `lib/dtcg.mjs` — already the shared DTCG reader, already installed
alongside everything that needs it. `validate-token-output.mjs` re-exports it so
its public surface and its test file are unchanged.

This is the same extraction already performed for `flattenDtcg` and
`resolveValue` in #34, for the same reason.

**Why guard before the build when the validator already catches it after.**
Different diagnostic. Post-build, the validator reports that an emitted symbol
has the wrong value. Pre-build, the guard reports which two source files define
the same path — which is the information needed to fix it. The check is not
duplicated; its position is.

### 5. `native-adapter-config.md` becomes a generated file

`scripts/build-native-adapter-config.mjs` inlines the module's real source into
the reference doc. `--check` gates CI, beside the two `--check` steps already in
`.github/workflows/ci.yml:22-25`.

This mirrors `build-doc-card-builder.mjs`, which solves the identical problem
for `references/doc-card-builder.md`. Adopting the existing pattern rather than
inventing a second one.

**Why generation rather than deleting the code from the doc.** Agents read
`native-adapter-config.md` to understand *why* the configuration is shaped this
way. A doc that says "call the module" loses the reasoning that makes the
transforms reviewable. Generation keeps both without allowing them to disagree.

**Mechanism: interleaved slices, not one inlined block. ⟨rev⟩** The precedent
(`build-doc-card-builder.mjs`) inlines whole source files under a prose header,
because its module is one unit. This doc is four prose sections each explaining
the code fragment beneath it, and collapsing them into prose-then-one-blob would
destroy the adjacency that makes it readable.

So the module carries paired markers:

```js
// @doc-section unit-aware
export function magnitude(orig) { ... }
// @doc-section-end unit-aware
```

The generator holds the prose keyed by section id, slices the module source
between each marker pair, and emits prose-then-its-code in declared order.
It **fails** (non-zero, no write) if a declared id has no marker pair, if a pair
is unbalanced, or if any marked region is unreferenced — so adding a piece to
the module without documenting it breaks CI rather than silently shipping an
incomplete doc.

### 6. Unit tests are not verification

CI proves the functions behave. It cannot prove Style Dictionary consumes them,
because Style Dictionary is not installable here.

**Before this lands**, an end-to-end run happens in a scratch directory outside
the repo: real `style-dictionary@4`, zygarden's tokens read via
`git show <branch>:<path>` (never checked out, never modified), light and dark
builds, the module wired the way the skill will instruct, then
`validate-token-output` over each output. The result is recorded in the PR.

**Both platforms, not just Swift. ⟨rev⟩** The first draft scoped the run to
iOS while shipping a two-platform helper, which left every Android-specific
choice in Decision 8 unexercised. The zygarden source is platform-agnostic
DTCG, so the Kotlin build is the same sources through a different platform
block — four runs total (`ios-swift` and `android-kotlin` × light and dark).

**If iOS does not reproduce 196/196 with zero rule failures, the module is
wrong.** It does not land, and the tier badge does not move. Android has no
prior figure to reproduce, so its bar is zero rule failures and a match rate
consistent with iOS; a divergence between the two platforms on the same source
is itself a finding.

This decision is stated explicitly because this area has produced two
plausible-but-wrong claims already, both from asserting third-party behavior
without executing it.

### 7. `ios-swift` returns to Tier 1; `android-kotlin` does not

`references/sync-adapters.md:51-54` states re-promotion is available once a
native preset ships the validated configuration by default. This spec is that
condition, so leaving the demotion text in place would make the docs understate
the plugin — the mirror of the overclaim that caused the demotion.

**The restored row states what the module implements, not what the pre-demotion
row claimed. ⟨rev⟩** The old row said modes arrive via asset-catalog light/dark
variants. The module does not do that — it builds once per mode into a
per-mode directory, and asset catalogs remain unimplemented and unvalidated
(#38). Reinstating the historical text would re-document a mechanism the preset
does not have, which is the precise overclaim that caused the demotion. The row
reads:

| Adapter | Values live in | Modes via | Sem→prim refs | Naming |
|---|---|---|---|---|
| `ios-swift` | Swift enum constants (`Tokens.swift`) | one build per mode, one output directory per mode | flattened | `Tokens.textSm` |

**`android-kotlin` stays Tier 2.** Decision 6 now verifies its *output*, which
removes the first draft's stated reason — so the reason is restated rather than
left stale: the curated tier is a claim about a vetted preset for a named
framework, and Android's remaining unknowns are on the consumption side (Compose
`dp`/`sp` unit correctness against a real Compose app, resource-qualifier
conventions, package layout) which building tokens does not exercise. Passing
`validate-token-output` makes promotion a small follow-up, not a rewrite; it is
filed as its own issue rather than taken here.

Both statements are conditional on Decision 6 passing.

### 8. The Android platform block ⟨rev⟩

The first draft specified `nativePlatform` with a Swift-shaped signature and
left every Compose-specific choice to the planner. Read from
`style-dictionary@4.4.0`'s own source rather than assumed:

- **Format** `compose/object`. Its options are `packageName`, `className`,
  `import`, `accessControl`, `objectType`
  (`lib/common/formatHelpers/setComposeObjectProperties.js`).
- **`packageName` is required, not optional.** The template emits
  `package ${options.packageName ?? ''}`
  (`lib/common/templates/compose/object.kt.template.js`), so omitting it
  produces a bare `package ` line — invalid Kotlin. `nativePlatform` throws when
  `platform: 'android-kotlin'` is passed without one.
- **`import` defaults** to `androidx.compose.ui.graphics.Color` and
  `androidx.compose.ui.unit.*`. Left at the default; overriding is a project
  concern.
- **Destination** `Tokens.kt`, mirroring `Tokens.swift`.

One consequence worth recording, because it inverts a hazard from #34: the
Compose formatter is configured `commentStyle: none` and the template emits
`/** … */` on its own line above each `val`. So Kotlin `val` lines never carry a
trailing comment. The inline-comment case that nearly defeated the validator —
a documented token emitting
`public static let textSm = CGFloat(224.00) /** … */` — is **Swift-only**.
Comment stripping must stay, and the Android tests must not assume it is
exercised.

So the signature is `nativePlatform({ platform, buildPath, className,
packageName })`, with `packageName` required for `android-kotlin` and ignored
for `ios-swift`.

### 9. The transform list is stock-minus-the-broken-one, not hand-picked ⟨rev⟩

Reading the stock groups out of `style-dictionary@4.4.0` turned up three
defects in the transform list `references/native-adapter-config.md` currently
documents. The module fixes all three, and the doc inherits the fix by being
generated from it (Decision 5).

Stock, verified by enumerating `SD.hooks.transformGroups`:

```
ios-swift: attribute/cti  name/camel  color/UIColorSwift
           content/swift/literal  asset/swift/literal  size/swift/remToCGFloat
compose:   attribute/cti  name/camel  color/composeColor
           size/compose/em  size/compose/remToSp  size/compose/remToDp
```

**Defect 1 — Compose needs two dimension transforms, not one.**
`size/compose/remToSp` filters `$type === 'fontSize'` and emits `.sp`;
`size/compose/remToDp` filters `$type === 'dimension'` and emits `.dp`. The
documented config collapses both into one `.dp` transform, which would render
every font size in `dp`. On Android that silently ignores the user's font-scale
accessibility setting — a wrong-but-compiling output of exactly the kind this
whole area exists to prevent. The module registers
`size/unit-aware/compose-dp` and `size/unit-aware/compose-sp` with the stock
filters and the unit-aware magnitude.

**Defect 2 — the Swift transform's filter is too narrow.**
`size/swift/remToCGFloat` filters `isDimension(token) || isFontSize(token)`.
The documented replacement filters `$type === 'dimension'` only, so a
`fontSize`-typed token falls through untransformed and emits a bare `14px`.
`no-bare-units` would catch it, but the config should not produce it. The
module matches the stock filter.

*Why 196/196 passed anyway:* DTCG types font sizes as `dimension`;
`fontSize` is a legacy Style Dictionary type the zygarden source does not use.
The defect is real and was simply not exercised.

**Defect 3 — two non-size Swift transforms were dropped.**
`content/swift/literal` and `asset/swift/literal` quote `content`- and
`asset`-typed values. The documented list omits both, so such a token emits as
an unquoted Swift literal, which does not compile. Restored.

**The rule this establishes:** the module derives each platform's list from the
stock group by replacing only the rem-assuming size transforms and inserting
`value/color-mix-to-hex8` ahead of the colour transform. Everything else stock
does is kept. A hand-picked list silently drops whatever it forgets, which is
how all three of these arose.

Resulting lists:

```
ios-swift:      attribute/cti  name/camel  value/color-mix-to-hex8
                color/UIColorSwift  content/swift/literal
                asset/swift/literal  size/unit-aware/swift
android-kotlin: attribute/cti  name/camel  value/color-mix-to-hex8
                color/composeColor  size/unit-aware/compose-dp
                size/unit-aware/compose-sp
```

`size/compose/em` is dropped rather than replaced: it converts `fontSize` to an
`em` value, which the unit-aware `sp` transform supersedes.

## Files

**Create**
- `scripts/lib/sd-native.mjs` — the module
- `scripts/lib/sd-native.test.mjs` — unit tests
- `scripts/build-native-adapter-config.mjs` — doc generator
- `scripts/build-native-adapter-config.test.mjs` — generator tests

**Modify**
- `scripts/lib/dtcg.mjs` — gains `findModeCollisions`
- `scripts/validate-token-output.mjs` — imports and re-exports it
- `references/native-adapter-config.md` — becomes generated
- `scripts/README.md` — new row; `sd-native.mjs` added to the travels-with set
- `.github/workflows/ci.yml` — `--check` step

**Modify — the tier promotion's full blast radius ⟨rev⟩**

The first draft named two of these six. A plan built from that list would ship a
skill contradicting the reference it cites, so every place the demotion is
recorded is enumerated:

| File | What it currently says | Change |
|---|---|---|
| `references/sync-adapters.md:29` | "Four built-in adapters" | "Five" |
| `references/sync-adapters.md:32-37` | Tier 1 table, four web rows | add the `ios-swift` row from Decision 7 |
| `references/sync-adapters.md:39-45` | rationale predicates the set on a "web-first, design-led audience"; lists iOS/Swift under "everything else … via Tier 2" | rewrite: four web adapters plus one verified native |
| `references/sync-adapters.md:47-54` | "`ios-swift` was curated and is not any more" | replace with what restored it |
| `skills/token-sync-layer/SKILL.md:49-53` | curated set listed as the four web adapters; iOS/Swift under Tier 2 | add `ios-swift` to the curated list |
| `README.md:208` | native targets "currently generate through the Tier 2 protocol" | correct for `ios-swift`; still true for Android |

**Modify — the skill's instructions**
- `skills/token-sync-layer/SKILL.md` Step 3 — replace the transcribe-the-doc
  instruction with the import-and-call loop template from Decision 4, including
  the `nativeSources` call. Step 4's install list gains `lib/sd-native.mjs`.

## Risks

**The module's `nativePlatform` output is new code, not the verified spike.**
The transforms were verified at 196/196 symbols; the assembly helper was not —
the spike hand-wrote its platform block. Decision 6's end-to-end run covers the
helper specifically, which is why it runs the module rather than the doc.

**Installing a third file into `packages/tokens/scripts/lib/`.** The
install-incompleteness failure mode is known: #34 shipped a validator whose
import broke when `lib/dtcg.mjs` was not copied with it. `scripts/README.md` and
the skill's Step 4 must name all three files as one set.

## Out of scope, noted

`README.md:122` claims "Ten reference docs"; there are 17. Pre-existing and
unrelated.
