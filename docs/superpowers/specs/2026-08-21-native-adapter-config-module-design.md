# Native adapter config as a shipped module — design

**Date:** 2026-08-21
**Status:** Proposed
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
   artifact after it.

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
registerNativeTransforms(StyleDictionary);   // preprocessor + 3 transforms
nativePlatform({ platform, buildPath, className });  // → plain config object
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
| `assertSingleMode(sources)` | pure (throws) | void |
| `registerNativeTransforms(SD)` | side effect | void |

`nativePlatform` returning a plain object rather than mutating anything is what
makes assembly testable without Style Dictionary present:
a test asserts the emitted transform list contains `size/unit-aware/swift` and
contains no stock group name. `registerNativeTransforms` is tested against a
fake recorder object with the same method names.

### 4. The mode guard reuses `findModeCollisions`, it does not reimplement it

`validate-token-output.mjs:92` already exports `findModeCollisions(sources)` —
the exact check needed, already tested. `assertSingleMode` calls it and throws
naming the colliding token paths.

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

### 6. Unit tests are not verification

CI proves the functions behave. It cannot prove Style Dictionary consumes them,
because Style Dictionary is not installable here.

**Before this lands**, an end-to-end run happens in a scratch directory outside
the repo: real `style-dictionary@4`, zygarden's tokens read via
`git show <branch>:<path>` (never checked out, never modified), light and dark
builds, the module wired the way the skill will instruct, then
`validate-token-output` over each output. The result is recorded in the PR.

**If it does not reproduce 196/196 with zero rule failures, the module is
wrong.** It does not land, and the tier badge does not move.

This decision is stated explicitly because this area has produced two
plausible-but-wrong claims already, both from asserting third-party behavior
without executing it.

### 7. `ios-swift` returns to Tier 1; `android-kotlin` does not

`references/sync-adapters.md:56` states re-promotion is available once a native
preset ships the validated configuration by default. This spec is that
condition, so leaving the demotion text in place would make the docs understate
the plugin — the mirror of the overclaim that caused the demotion.

`android-kotlin` receives the same module (the Compose transform is in it) and
**stays Tier 2**. The 196/196 verification exercised the Swift path only.
Promoting Android on the argument that it shares a code path would be an
inference stated as evidence. It earns the badge when someone runs it against a
real Android source; worth its own issue at that point.

Both promotions are conditional on Decision 6 passing.

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
- `references/sync-adapters.md` — `ios-swift` to Tier 1; "Four" → "Five";
  demotion paragraph replaced
- `skills/token-sync-layer/SKILL.md` — Step 3 imports rather than transcribes;
  Step 4 install list gains `lib/sd-native.mjs`
- `scripts/README.md` — new row; `sd-native.mjs` added to the travels-with set
- `.github/workflows/ci.yml` — `--check` step

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
