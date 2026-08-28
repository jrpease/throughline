# Text-role inference — end-to-end verification results

**Date:** 2026-08-28
**Gate for:** #63, the changelog entry that follows it
**Verdict:** PASS. All four rows of §6's table landed exactly, and the compile
step is green on all eight builds. One **finding against §6's prose**: the
predicted "nine or ten Kotlin symbols change type, mode-dependent" is **nine in
both viewport pins** — but a *different* nine, and ten is not reachable by any
single build. The spec has been corrected on that measurement; detail under
"Where the measurement disagrees with the spec".

Unit tests prove `textRoleGraph`, `preprocess` and the two advisories behave.
This run proves Style Dictionary *consumes* them: eight real builds from
zygarden's DTCG source — before and after, × two viewport pins, × light and dark
— each validated with `tokens:validate-output` and each compiled.

## Harness

- **Style Dictionary:** `4.4.0` (fresh `npm i style-dictionary@4` in a scratch
  directory outside this repo; nothing from the throughline tree, and the repo
  gained no dependency, lockfile or `node_modules`).
- **Installed by copy, not symlink.**
- **Source:** `zygarden-frontend`, branch `feature/apply-brandguide-styles`
  (`480ee9ec`), `libs/shared/util-tokens/src/tokens/` — **15 JSON files, 322
  `$value` entries**, matching the 2026-08-21 run exactly. Extracted read-only
  with `git -C … show <branch>:<path>`. That repository was never checked out or
  modified; it stayed on its own unrelated branch throughout.
- **Before/after in one harness.** The `after` tree is this branch's working
  copy; the `before` tree is the same files extracted read-only from `main`
  (`git show main:…`). Both were built against the identical 15 files, so every
  delta below is the branch's, not a source or harness difference.

### Finding 1 — the install list is stale: four files, not three

The 2026-08-21 note records the install list as exactly three files. **It is now
four.** Both `sd-native.mjs` and `validate-token-output.mjs` statically import a
fourth sibling, `scripts/lib/native-literal.mjs`, added by #70 and present on
`main` since 0.16.0. Installing only the documented three fails at import:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/scripts/lib/native-literal.mjs'
imported from …/scripts/lib/sd-native.mjs
```

That was reproduced deliberately by removing the file from a working install.

**This misleads the next e2e run, not any consumer.** The generated, CI-gated
`references/native-adapter-config.md` — the doc a consumer actually follows —
already names `lib/native-literal.mjs` as a required sibling (lines 21 and 48),
so the **shipped** instruction is correct and no user is affected. What is wrong
is the three-file list in the 2026-08-21 e2e note, which predates #70. Anyone
rebuilding this harness from that note gets `ERR_MODULE_NOT_FOUND` and has to
rediscover the fourth file, as this run did. It should not be copied forward
again.

The staleness is **not** this branch's: this branch's new code lives entirely in
`scripts/lib/dtcg.mjs`, `scripts/lib/sd-native.mjs` and
`scripts/validate-token-output.mjs`, all already on the list, and it adds no new
module. The four-file list is complete for this branch — no other import outside
`node:*` exists in any of the four.

### Finding 2 — `ci/compile-native-output.mjs` is not on this branch, or on `main`

**Do not go looking for this file in the repo — it is not there.** The compile
checker (#81, PR **#82**) is **not merged**. It exists only on the branch
`feat/81-compile-verification` (tip `7271bed`), which has landed on neither
`main` nor `feat/63-text-role-inference`. It was extracted read-only for this
run, exactly as the zygarden source was:

```bash
git show feat/81-compile-verification:ci/compile-native-output.mjs
git show feat/81-compile-verification:ci/stubs/compose-unit.kt
git show feat/81-compile-verification:ci/stubs/compose-graphics.kt
```

Anyone re-running this e2e from `main` or from `feat/63-text-role-inference`
alone will not find that file, and must extract it the same way or wait for #82
to merge. Nothing in this repo was changed to accommodate it — no file was
copied in, and no gate was pointed at it.

**Toolchains present:** `kotlinc` 2.4.10 (JRE 26.0.2.1), `swiftc` 6.3.2
(`/usr/bin/swiftc`, Xcode CLT). Neither was stubbed or skipped.

## Mode set — read this before quoting any count

The source carries **two orthogonal mode axes**. Building both members of either
axis in one build is a mode collision that `nativeSources()` rejects, so both
axes were pinned:

| Axis | Files | How it was handled |
|---|---|---|
| light / dark | `color-semantic.{light,dark}.json` | built **both**, separately |
| desktop / mobile | `spacing-semantic.{desktop,mobile}.json`, `typography-semantic.{desktop,mobile}.json` | built **both pins**, separately |

Eleven files are shared by every build — nine mode-neutral primitives/semantics
plus the two viewport-pinned files for that pin — and the colour file varies:

```
NEUTRAL = color-primitives, leading-primitives, radius-primitives,
          radius-semantic, spacing-primitives, stroke-primitives,
          stroke-semantic, text-primitives, typography-primitives
SHARED  = NEUTRAL + spacing-semantic.<pin> + typography-semantic.<pin>
build   = SHARED + color-semantic.<light|dark>          (12 files each)
```

Four mode sets × before/after = **eight builds**, all exit 0. The 2026-08-21 run
pinned mobile only; **this run built both viewport pins**, because §6's headline
number is the one the viewport axis moves.

Every count in this note is per-build. Light and dark produced identical
declaration counts and identical advisories on every row below, so the tables
collapse the colour axis and vary only the viewport pin.

## Counts, against §6's prediction

Commands are the brief's, run against each build's `Tokens.kt` / `Tokens.swift`.

| | before (measured) | §6 predicts | measured, mobile pin | measured, desktop pin |
|---|--:|--:|--:|--:|
| Kotlin declarations (`grep -c 'val '`) | 208 | 211 | **211** ✓ | **211** ✓ |
| Swift declarations (`grep -c 'static let'`) | 195 | 195 | **195** ✓ | **195** ✓ |
| Android unmatched source tokens | 6 | 3 | **3** ✓ | **3** ✓ |
| iOS unmatched source tokens | 19 | 19 | **19** ✓ | **19** ✓ |
| Kotlin symbols changed `dp` → `sp` | — | 9 or 10, mode-dependent | **9** | **9** ✗ |

The `before` column was **measured in this harness**, not carried over from a
prior note: `main`'s three modules were built against the same 15 files. It
reproduces the handoff note's 208 / 195 / 6 / 19 exactly.

Supporting counts, same builds:

| | before | after |
|---|--:|--:|
| `.sp` occurrences in `Tokens.kt` | 39 | 48 (+9) |
| `.em` occurrences in `Tokens.kt` | 13 | 16 (+3) |

The +3 `.em` are the three new declarations, and account for 211 − 208 exactly.
The Swift outputs are **byte-identical** before and after in all four mode sets
(`diff -q`), which is the strongest form of "Swift is untouched".

### The three new Kotlin declarations

Identical in both viewport pins:

```kotlin
val typographyLetterSpacingNormal = (0.00).em
val typographyLetterSpacingTight  = (-0.03).em
val typographyLetterSpacingWide   = (0.05).em
```

### The remaining Android unmatched, named

Re-derived with the validator's own exported `flattenDtcg` / `normalizeKey` /
`extractDeclarations` over each source set:

```
before, either pin: 6 → gradient.brand.primary, spacing.grid.containerMax,
                        typography.letterSpacing.{normal,tight,wide,widest}
after,  either pin: 3 → gradient.brand.primary, spacing.grid.containerMax,
                        typography.letterSpacing.widest
```

So §2.1's correction to the issue is confirmed on real output: **6 → 3, not
6 → 2.** `typography.letterSpacing.widest` is referenced by nothing in any of
the 15 files, so the reference graph has no edge to reach it by.

## Where the measurement disagrees with the spec

**§6 predicts "nine or ten Kotlin symbols change type, which of the two being
mode-dependent". Both pins changed nine.** Ten is not reachable by any single
build, because the two viewport files each drop a *different* `text.*` referrer:

```
$ grep -ho '{text\.[a-z0-9]*}' typography-semantic.mobile.json  | sort -u
  {text.2xl} {text.3xl} {text.4xl} {text.5xl} {text.base} {text.lg} {text.sm} {text.xl} {text.xs}
$ grep -ho '{text\.[a-z0-9]*}' typography-semantic.desktop.json | sort -u
  {text.2xl} {text.3xl} {text.4xl} {text.5xl} {text.6xl} {text.base} {text.sm} {text.xl} {text.xs}
```

Nine distinct `text.*` referents each. The union is ten. Neither pin sees ten.

The nine symbols that changed, verbatim from `diff`ing the before and after
`Tokens.kt`:

| mobile pin | desktop pin |
|---|---|
| `textXs textSm textBase textLg textXl text2xl text3xl text4xl text5xl` | `textXs textSm textBase textXl text2xl text3xl text4xl text5xl text6xl` |

`text.lg` ↔ `text.6xl` is a straight swap. §8 as written named the `text.6xl`
half correctly — its only referrer is in the desktop file — and **did not name
the mirror case**: `text.lg`'s only referrer is in the *mobile* file, so a
desktop build leaves `text.lg` as `18.00.dp` and files an advisory for it. That
omission made the limitation read as one stray token rather than a symmetric
swap; §8 has since been corrected.

§1's table ("`text.*`: 10 reached, `xs`–`6xl`") is a **union across all 15
files**, which §1 itself says. It is not a per-build figure, and §6 read it as
one. §6 has since been corrected to say so.

**This does not change the shipped behaviour, only the claim about it.** The
inference is working exactly as §8 describes; the arithmetic in §6 assumed the
union rather than a build. The changelog quotes nine, not "nine or ten".

**Resolved in the spec.** On this measurement the spec was corrected rather than
the number: §6 now states nine in any single build and that ten is unreachable
by one, §1's table is labelled as a union, and §8's bullet names the
`text.lg` ↔ `text.6xl` swap and records that the count is stable across pins
even though the set is not.

Nothing else disagreed. All four rows of §6's table landed exactly.

## Compile verification

`node ci/compile-native-output.mjs <dir>` on all eight builds, each directory
holding that build's `Tokens.kt` and `Tokens.swift`:

```
compile-native-output — do the emitted native tokens build?

  [PASS] kotlin: typechecked to bytecode (against ci/stubs, not real Compose)
  [PASS] swift: parsed only (UIKit unavailable; -typecheck impossible)

  Kotlin is typechecked to bytecode; Swift is parsed only. swiftc -typecheck
  cannot run here: Tokens.swift imports UIKit, which is unavailable on the
  macOS command line. Swift syntax is asserted; Swift types are not.
exit=0
```

**8 / 8 exit 0**, both platforms PASS in every one. The Kotlin risk this step
existed to catch — nine symbols changing from `Dp` to `TextUnit` — did not
materialise as a broken output.

Per `ci/README.md` (on the #81 branch), the strengths are unequal and must be
quoted that way: **Kotlin is typechecked to bytecode** against 19 lines of
Compose stubs, which is a real type check of every declaration; **Swift is
parsed only**, so `Tokens.swift` is asserted to be syntactically valid Swift and
nothing more.

### The break was demonstrated, not asserted

A PASS only proves the *output* compiles. The changelog claims something
stronger — that a `Dp` use site *stops* compiling — so that was compiled too:

```kotlin
// UseSite.kt — stands in for Modifier.padding(Tokens.textBase)
fun padding(value: Dp): Dp = value
val leak: Dp = padding(Tokens.textBase)
```

```
$ kotlinc <before Tokens.kt> <stubs> UseSite.kt     # main
(clean — compiles)

$ kotlinc <after Tokens.kt> <stubs> UseSite.kt      # this branch
UseSite.kt:6:24: error: argument type mismatch: actual type is 'TextUnit', but 'Dp' was expected.
val leak: Dp = padding(Tokens.textBase)
                       ^^^^^^^^^^^^^^^
```

The type really changed at the bytecode level, and the break is the one the
`Breaking` entry describes.

## Validator reports

Run per output with `--min-match 1` — 16 invocations, one per build per
platform. Every one **exit 0**, 100% match, zero rule failures.

| build | matched | advisories | unmatched source tokens |
|---|---|--:|--:|
| `android-kotlin`, before, both pins, both colours | 208/208 | 5 | 6 |
| `android-kotlin`, after, both pins, both colours | 211/211 | 10 | 3 |
| `ios-swift`, before, both pins, both colours | 195/195 | 5 | 19 |
| `ios-swift`, after, both pins, both colours | 195/195 | 10 | 19 |

The five pre-existing advisories are the `unitless-dimension` notes on
`leading.{tight,snug,normal,relaxed,loose}`, unchanged by this branch. The five
new ones are all `unreferenced-text-sibling`. Verbatim, `after` / mobile:

```
10 advisory note(s) — reported, not gating:
  - [unitless-dimension] leadingLoose: source "2" for leading.loose is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 2, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingNormal: source "1.5" for leading.normal is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.5, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingRelaxed: source "1.7" for leading.relaxed is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.7, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingSnug: source "1.25" for leading.snug is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.25, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingTight: source "1.1" for leading.tight is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.1, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unreferenced-text-sibling] text.6xl: nothing references it, so no typographic role could be inferred — but tokens in "text" were. It emits as a length, or is dropped entirely if its unit is em. Stamp $extensions["com.radicool.throughline"].nativeUnit = "text" on it in source to settle it, or leave it if it is not a text value.
  - [unreferenced-text-sibling] text.7xl: …
  - [unreferenced-text-sibling] text.8xl: …
  - [unreferenced-text-sibling] text.9xl: …
  - [unreferenced-text-sibling] typography.letterSpacing.widest: nothing references it, so no typographic role could be inferred — but tokens in "typography.letterSpacing" were. It emits as a length, or is dropped entirely if its unit is em. Stamp $extensions["com.radicool.throughline"].nativeUnit = "text" on it in source to settle it, or leave it if it is not a text value.

3 source token(s) had no matching emitted symbol.
exit=0
```

(`text.7xl` / `8xl` / `9xl` carry the same wording as `text.6xl`, elided.)

The `after` / **desktop** advisory set differs by exactly one line, which is the
finding above surfacing in the instrument that exists to surface it:

```
  - [unreferenced-text-sibling] text.lg: …      ← instead of text.6xl
  - [unreferenced-text-sibling] text.7xl: …
  - [unreferenced-text-sibling] text.8xl: …
  - [unreferenced-text-sibling] text.9xl: …
  - [unreferenced-text-sibling] typography.letterSpacing.widest: …
```

Five advisories in each pin, four common to both, one swapped.

**Zero `ambiguous-text-role` advisories in any of the eight builds.** §1
measured zero mixed cases on this source and the emitted output agrees, so the
merge this build performs matches the one §1 measured.

## What this run does NOT establish

1. **Ten symbols was never observed, and cannot be on this source.** Every
   figure above is per-build. Do not quote "ten" from §1's union table.
2. **Only zygarden's two viewport pins were built.** A third mode axis, or a
   consumer whose typography file references the full `text.*` scale, would
   produce different counts. The inference is mode-dependent by construction
   (§8) and this run measures two points, not a rule.
3. **`text.7xl`, `text.8xl`, `text.9xl` and `typography.letterSpacing.widest`
   are still wrong in the output**, and knowingly so. They are referenced by
   nothing in any of the 15 files, so no structural signal exists. They emit
   `72.00.dp` / `96.00.dp` / `128.00.dp` and (for `widest`) nothing at all. The
   advisory names them; the fix is a source-side `$extensions` stamp.
4. **Swift was parsed, not typechecked.** `Tokens.swift` imports `UIKit`, which
   is unavailable on the macOS command line, so `swiftc -parse` is the strongest
   available check. Swift syntax is asserted; Swift types are not. Since the
   Swift output is byte-identical to `main`'s, this is not a new gap.
5. **Kotlin was typechecked against stubs, not against Compose.**
   `ci/stubs/compose-unit.kt` declares `Dp` and `TextUnit` as plain classes; real
   Compose makes them value classes. Type *distinctness* is faithful — which is
   what the `dp`/`sp` claim rests on — but Compose's own semantics are not.
6. **Colour values are still checked by name only.** Unchanged from the
   2026-08-21 note and out of scope here; no rule compares an emitted colour to
   its source.
7. **Nothing was run on a device.** That `sp` respects the user's font-scale
   setting is Compose's documented behaviour, not something this run observed.
8. **One Style Dictionary version.** `4.4.0` only. ThroughLine declares no
   dependency on Style Dictionary, so the version a consumer runs stays
   invisible to this evidence either way.
9. **The compile checker was borrowed from an unmerged branch.** If #82 lands
   changed, this run's compile evidence was produced by
   `feat/81-compile-verification` at `7271bed`, not by whatever merges.

## Repo gates, run alongside

```
$ node --test                                    → 423 pass, 0 fail
$ node scripts/build-native-adapter-config.mjs --check
  references/native-adapter-config.md is up to date
$ node ci/validate-plugin.mjs                    → ✓
$ node ci/validate-skills.mjs                    → ✓ 12 skills, 5 commands, 4 agents
```
