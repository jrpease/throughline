# unitless-dimension (#52) — e2e proof against zygarden

**Date:** 2026-08-26
**Gate for:** Task 5 of the `#52` plan — end-to-end verification of Tasks 1-4
(unitless `dimension` values no longer get a size unit; the emitter infers
`Int`/`Double`/`CGFloat` from the literal; the validator reports an advisory,
not a gate failure).
**Verdict:** PASS against spec §7's stated prediction, on every particular.
`diff -r` between a build at this branch's HEAD and a build at `main`
(pre-`#52`) shows exactly 5 changed lines in `Tokens.kt` and exactly 5 in
`Tokens.swift`, all `leading*`, all `N.dp`/`CGFloat(N)` collapsing to bare
`N`, `leadingLoose` emitting `2` not `2.00`, no other line differing. The
validator exits 0 on both platforms at HEAD, each reporting 5
`unitless-dimension` advisories naming the same five `leading*` tokens.

## Why this run exists

Spec §7 made a falsifiable, numeric prediction about what Tasks 1-4 do to a
real 322-token design system: 195 declarations unchanged, `.sp` count
unchanged at 39, `.dp` count dropping from 50 to 45 (5 tokens losing their
unit), and exactly those 5 lines changing in each native output file. This
run builds the same real source at both commits and checks the prediction
against actual bytes, not against the reasoning that produced it.

## Harness

Reused, not rebuilt from scratch — live at the time this task started:

```
/private/tmp/claude-501/-Users-jordansstudio-Dev-throughline/395cf4ed-9e55-4c18-a73d-e9980db4545c/scratchpad/e2e
```

- **Style Dictionary:** `4.4.0`, installed in the scratch directory.
- **Source:** the 15 zygarden JSON files in `../tokens` (the harness's parent
  scratchpad directory), extracted from zygarden-frontend in prior work. Not
  re-extracted; the zygarden repo was not touched.
- **`build.mjs`:** takes a token dir and an output dir as CLI args, builds
  `android-kotlin` and `ios-swift` flat into that output dir (no light/dark
  axis in this version of the harness — it was rewritten since the
  `#55`/`#60` runs), `packageName: 'com.zygarden.tokens'` for Kotlin.
  Unmodified.
- **`run.sh`:** runs `build.mjs`, then `cd`s into
  `/Users/jordansstudio/Dev/throughline` (this checkout, on
  `fix/52-unitless-dimension`) and runs the repo's real
  `scripts/validate-token-output.mjs` against the built files, then prints a
  `declarations | .sp | .dp` count line via `grep -c` on the output file.

### A correction to the brief's stated wiring

The brief (and the task that set up this harness) describes swapping
`<harness>/scripts/lib` to retarget the code `build.mjs` compiles against.
That symlink exists and does point at
`/Users/jordansstudio/Dev/throughline/scripts/lib`, but `build.mjs` does not
import from it — it imports from `./lib/sd-native.mjs`, a *separate*
top-level `<harness>/lib/` directory of three per-file symlinks
(`dtcg.mjs`, `native-literal.mjs`, `sd-native.mjs`). `run.sh` also always
`cd`s into the real repo checkout to run the validator, regardless of either
symlink — so the validator step is pinned to whatever branch this checkout
has out (`fix/52-unitless-dimension` throughout this run).

Repointing only `scripts/lib` to the `main` worktree (as the brief's Step 3
literally says) is a no-op: the build phase still reads the unchanged
top-level `lib/`, so a "main" build under that instruction is byte-identical
to the HEAD build, not because the fix has no effect, but because the swap
never touched the module `build.mjs` actually loads. This was caught by
running the intended swap and observing the "main" build still contained the
`#52` fix (bare `leadingLoose = 2`, not `2.00.dp`) — the wrong result for a
build claiming to be pre-fix. The three symlinks under `<harness>/lib/` were
repointed instead, which produced the expected pre-fix output
(`leadingLoose = 2.00.dp` / `CGFloat(2.00)`), and were restored afterward
alongside `scripts/lib`.

## Procedure

1. Build at HEAD (`5cff43b`) — output to `out-52-head/`.
2. `git worktree add /tmp/tl-main main` (`main` = `4025ac5`).
3. Repoint `<harness>/lib/{dtcg,native-literal,sd-native}.mjs` to
   `/tmp/tl-main/scripts/lib/*` (see correction above), rebuild — output to
   `out-52-main/`.
4. `diff -r out-52-main out-52-head`.
5. Repoint `<harness>/lib/*` and `<harness>/scripts/lib` back to
   `/Users/jordansstudio/Dev/throughline/scripts/lib`, `git worktree remove
   /tmp/tl-main`.
6. Re-run `out-52-head` once more and read the validator output in full, to
   confirm the advisory list.

### Step 1 — build at HEAD

```
$ bash run.sh out-52-head
--- kotlin
tokens:validate-output — 195/195 emitted symbols matched a source token (100%)

5 advisory note(s) — reported, not gating:
  - [unitless-dimension] leadingLoose: source "2" for leading.loose is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 2, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingNormal: source "1.5" for leading.normal is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.5, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingRelaxed: source "1.7" for leading.relaxed is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.7, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingSnug: source "1.25" for leading.snug is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.25, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingTight: source "1.1" for leading.tight is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.1, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.

19 source token(s) had no matching emitted symbol.
exit=0
--- swift
tokens:validate-output — 195/195 emitted symbols matched a source token (100%)

5 advisory note(s) — reported, not gating:
  - [unitless-dimension] leadingLoose: source "2" for leading.loose is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 2, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingNormal: source "1.5" for leading.normal is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.5, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingRelaxed: source "1.7" for leading.relaxed is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.7, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingSnug: source "1.25" for leading.snug is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.25, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingTight: source "1.1" for leading.tight is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.1, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.

19 source token(s) had no matching emitted symbol.
exit=0
--- counts
declarations 195 | .sp 39 | .dp 45
```

### Step 2-3 — build at `main`, in a throwaway worktree

```
$ git worktree add /tmp/tl-main main
Preparing worktree (checking out 'main')
HEAD is now at 4025ac5 fix: an enclosing group's $type is no longer shadowed by a dual node's (#60) (#68)

$ ln -sfn /tmp/tl-main/scripts/lib/dtcg.mjs lib/dtcg.mjs
$ ln -sfn /tmp/tl-main/scripts/lib/native-literal.mjs lib/native-literal.mjs
$ ln -sfn /tmp/tl-main/scripts/lib/sd-native.mjs lib/sd-native.mjs

$ bash run.sh out-52-main
--- kotlin
tokens:validate-output — 195/195 emitted symbols matched a source token (100%)

5 advisory note(s) — reported, not gating:
  - [unitless-dimension] leadingLoose: source "2" for leading.loose is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 2.00.dp, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingNormal: source "1.5" for leading.normal is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.50.dp, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingRelaxed: source "1.7" for leading.relaxed is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.70.dp, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingSnug: source "1.25" for leading.snug is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.25.dp, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingTight: source "1.1" for leading.tight is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted 1.10.dp, read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.

19 source token(s) had no matching emitted symbol.
exit=0
--- swift
tokens:validate-output — 195/195 emitted symbols matched a source token (100%)

5 advisory note(s) — reported, not gating:
  - [unitless-dimension] leadingLoose: source "2" for leading.loose is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted CGFloat(2.00), read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingNormal: source "1.5" for leading.normal is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted CGFloat(1.50), read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingRelaxed: source "1.7" for leading.relaxed is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted CGFloat(1.70), read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingSnug: source "1.25" for leading.snug is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted CGFloat(1.25), read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.
  - [unitless-dimension] leadingTight: source "1.1" for leading.tight is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted CGFloat(1.10), read as a ratio. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.

19 source token(s) had no matching emitted symbol.
exit=0
--- counts
declarations 195 | .sp 39 | .dp 50
```

Note: the validator output above still comes from HEAD's `validate-token-output.mjs`
(the checkout it runs from was never repointed — see the correction above),
so it still reports the advisory even against `main`'s unit-suffixed output.
That is a property of the validator being source-type-driven, not
literal-format-driven, and does not affect the count line, which is a
`grep -c` over the built file's own bytes.

### Step 4 — diff

```
$ diff -r out-52-main out-52-head
diff -r out-52-main/Tokens.kt out-52-head/Tokens.kt
87,91c87,91
<   val leadingLoose = 2.00.dp
<   val leadingNormal = 1.50.dp
<   val leadingRelaxed = 1.70.dp
<   val leadingSnug = 1.25.dp
<   val leadingTight = 1.10.dp
---
>   val leadingLoose = 2
>   val leadingNormal = 1.5
>   val leadingRelaxed = 1.7
>   val leadingSnug = 1.25
>   val leadingTight = 1.1
diff -r out-52-main/Tokens.swift out-52-head/Tokens.swift
86,90c86,90
<     public static let leadingLoose = CGFloat(2.00)
<     public static let leadingNormal = CGFloat(1.50)
<     public static let leadingRelaxed = CGFloat(1.70)
<     public static let leadingSnug = CGFloat(1.25)
<     public static let leadingTight = CGFloat(1.10)
---
>     public static let leadingLoose = 2
>     public static let leadingNormal = 1.5
>     public static let leadingRelaxed = 1.7
>     public static let leadingSnug = 1.25
>     public static let leadingTight = 1.1
```

Exactly 5 changed lines per file, all `leading*`, all `N.dp`/`CGFloat(N)`
collapsing to bare `N`, `leadingLoose` bare `2` not `2.00`. No other line in
either file differs.

### Step 5 — restore, remove worktree

```
$ ln -sfn /Users/jordansstudio/Dev/throughline/scripts/lib/dtcg.mjs lib/dtcg.mjs
$ ln -sfn /Users/jordansstudio/Dev/throughline/scripts/lib/native-literal.mjs lib/native-literal.mjs
$ ln -sfn /Users/jordansstudio/Dev/throughline/scripts/lib/sd-native.mjs lib/sd-native.mjs
$ ln -sfn /Users/jordansstudio/Dev/throughline/scripts/lib scripts/lib
$ git worktree remove /tmp/tl-main
$ git worktree list
/Users/jordansstudio/Dev/throughline  5cff43b [fix/52-unitless-dimension]
```

## Prediction vs. actual (spec §7)

| Prediction | Actual |
|---|---|
| 195 declarations unchanged | 195 at both HEAD and `main` — match |
| `.sp` stays 39 | 39 at both — match |
| `.dp` goes 50 → 45 | 50 at `main`, 45 at HEAD — match |
| exactly 5 changed lines in `Tokens.kt`, all `leading*` | 5 lines, `leadingTight/Snug/Normal/Relaxed/Loose` — match |
| exactly 5 changed lines in `Tokens.swift`, all `leading*` | 5 lines, same five — match |
| every other line byte-identical | confirmed by `diff -r` — match |
| validator exits 0 both platforms | exit 0 on both at HEAD — match |
| 5 `unitless-dimension` advisories each, naming `leading*` | 5 advisories each, all `leading*` — match |
| `leadingLoose` emits `2`, not `2.00` | confirmed in both `Tokens.kt` and `Tokens.swift` — match |

Every clause of the prediction held. Nothing was adjusted to fit.

## What this run does NOT establish

- **Nothing was compiled.** No `swiftc` or `kotlinc` ran; the declaration and
  `.sp`/`.dp` counts are `grep`-based, and the advisory/diff checks are
  textual, not a compiler's verdict on whether the bare `Int`/`Double`
  literals actually satisfy whatever consumes them downstream.
- **The harness's `scripts/lib` symlink is unused by this build path.** It
  was left pointed at the live repo throughout (as found), but `build.mjs`
  never reads it — see the correction above. Anyone reusing this harness for
  a future differential build should repoint `<harness>/lib/*`, not
  `<harness>/scripts/lib`.
