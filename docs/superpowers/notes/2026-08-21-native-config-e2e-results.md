# Native config module — end-to-end verification results

**Date:** 2026-08-21
**Gate for:** Task 6 (tier promotion of `ios-swift`)
**Verdict:** PASS against the stated bar — four builds, zero rule failures,
exit 0 on all four. The caveats under "What this run does not establish" bound
what may be claimed from it: notably that `matched` counts name resolution, not
value agreement, and that the Compose `sp` branch is not merely untested but
appears unreachable on spec-compliant DTCG.

Unit tests prove the functions in `scripts/lib/sd-native.mjs` behave. This run
proves Style Dictionary *consumes* them: four real builds from zygarden's DTCG
source, each validated with `tokens:validate-output`.

## Harness

- **Style Dictionary:** `4.4.0` (fresh `npm i style-dictionary@4` in a scratch
  directory, nothing from the throughline repo's own tree).
- **Installed by copy, not symlink** — proving the Task 6 install list is
  complete: `scripts/lib/sd-native.mjs`, `scripts/lib/dtcg.mjs`,
  `scripts/validate-token-output.mjs`. Nothing else was needed **on this date**.

  > **Correction (2026-08-31, #87).** The list has been **four** files since
  > #70, which made `sd-native.mjs` import `scripts/lib/native-literal.mjs`;
  > `validate-token-output.mjs` imports it too. Rebuilding the harness from the
  > three-file list above fails at module resolution, which is how this was
  > found — by an `ENOENT`, not by reading. Add
  > `scripts/lib/native-literal.mjs`. The three-file list was accurate when
  > written and is left in place, because this note is a dated record of what
  > ran, not a live install guide. The **shipped** guide in
  > `references/native-adapter-config.md` and the `token-sync-layer` skill were
  > never wrong: both say "all four files, as a set" and warn that copying any
  > without the others breaks at import. No consumer was affected.
- **Source:** `zygarden-frontend`, branch `feature/apply-brandguide-styles`,
  `libs/shared/util-tokens/src/tokens/` — **15 JSON files, 322 `$value`
  entries**, extracted read-only with `git -C … show <branch>:<path>`. That
  repository was never checked out or modified.

  Note on the brief's Step 3 command: `ls-tree … -- libs/shared/util-tokens`
  matches 17 `.json` paths, two of which are `package.json` and `project.json`.
  Scoping the path to `libs/shared/util-tokens/src/tokens` yields the expected
  15 token files.

## Per-mode source split

The source carries **two orthogonal mode axes**, not one:

| Axis | Files |
|---|---|
| light / dark | `color-semantic.light.json`, `color-semantic.dark.json` |
| desktop / mobile | `spacing-semantic.{desktop,mobile}.json`, `typography-semantic.{desktop,mobile}.json` |

The brief models only light/dark. Including both viewport files in one build is
a mode collision, so the viewport axis had to be pinned. **Mobile was chosen**,
as the axis matching an iOS/Android target. The two viewport files have
identical `$value` counts (4 and 65), so the desktop axis is expected to produce
the same figures — but it was not built, and is recorded below as unexercised.

Both builds share eleven files — nine mode-neutral primitives/semantics plus
the two **mobile-pinned** viewport files — and differ only in the colour file:

```
SHARED  = color-primitives, leading-primitives, radius-primitives,
          radius-semantic, spacing-primitives, stroke-primitives,
          stroke-semantic, text-primitives, typography-primitives,   <- mode-neutral
          spacing-semantic.mobile, typography-semantic.mobile        <- viewport-pinned
light   = SHARED + color-semantic.light      (214 $value entries)
dark    = SHARED + color-semantic.dark       (214 $value entries)
```

`nativeSources()` accepted both lists. Passing the **whole directory** instead
makes the guard fire, as designed — and the collisions span **both** axes,
which is why the viewport axis had to be pinned too:

```
$ node guard-check.mjs
50 token path(s) are defined differently across this build's sources.
Style Dictionary keeps whichever file sorts last, silently dropping a whole mode.
Build once per mode, passing an explicit source list for that mode only.
  color.bg.canvas: tokens/color-semantic.dark.json vs tokens/color-semantic.light.json
  color.bg.surface.1: tokens/color-semantic.dark.json vs tokens/color-semantic.light.json
  color.bg.surface.2: tokens/color-semantic.dark.json vs tokens/color-semantic.light.json
  color.bg.surface.3: tokens/color-semantic.dark.json vs tokens/color-semantic.light.json
  color.bg.elevated: tokens/color-semantic.dark.json vs tokens/color-semantic.light.json
  ...and 45 more

breakdown: {"light/dark":35,"desktop/mobile":15} total 50

first viewport-axis collisions:
  spacing.grid.columns: tokens/spacing-semantic.desktop.json="{spacing.space.3}" vs tokens/spacing-semantic.mobile.json="{spacing.space.1}"
  spacing.grid.gutter: tokens/spacing-semantic.desktop.json="{spacing.space.6}" vs tokens/spacing-semantic.mobile.json="{spacing.space.4}"
  spacing.grid.margin: tokens/spacing-semantic.desktop.json="{spacing.space.8}" vs tokens/spacing-semantic.mobile.json="{spacing.space.4}"
```

35 + 15 = 50. The error message truncates at five, all of which happen to be
colour; the breakdown and the viewport examples above come from calling
`findModeCollisions` directly on the same 15 files.

## Build

```
$ node build.mjs
ios-swift
✔︎ out/light/ios/Tokens.swift
built ios-swift / light

android-kotlin
✔︎ out/light/android/Tokens.kt
built android-kotlin / light

ios-swift
✔︎ out/dark/ios/Tokens.swift
built ios-swift / dark

android-kotlin
✔︎ out/dark/android/Tokens.kt
built android-kotlin / dark
exit=0
```

## Validator invocations

Run from the scratch root, one invocation per output. `--min-match` was never
passed, so the floor is the default **0.5**. The `--source` flags are built
with a bash array; a bare string collapses to one argument and the validator
correctly rejects it with exit 2.

```bash
SHARED=(tokens/color-primitives.json tokens/leading-primitives.json \
        tokens/radius-primitives.json tokens/radius-semantic.json \
        tokens/spacing-primitives.json tokens/stroke-primitives.json \
        tokens/stroke-semantic.json tokens/text-primitives.json \
        tokens/typography-primitives.json tokens/spacing-semantic.mobile.json \
        tokens/typography-semantic.mobile.json)
LIGHT=("${SHARED[@]}" tokens/color-semantic.light.json)
DARK=("${SHARED[@]}" tokens/color-semantic.dark.json)

run() {                     # run <platform> <outfile> <source...>
  local platform=$1 out=$2; shift 2
  local args=(); for f in "$@"; do args+=(--source "$f"); done
  node scripts/validate-token-output.mjs "${args[@]}" --output "$out" --platform "$platform"
  echo "exit=$?"
}

run ios-swift      out/light/ios/Tokens.swift  "${LIGHT[@]}"
run ios-swift      out/dark/ios/Tokens.swift   "${DARK[@]}"
run android-kotlin out/light/android/Tokens.kt "${LIGHT[@]}"
run android-kotlin out/dark/android/Tokens.kt  "${DARK[@]}"
```

## Validator reports (verbatim)

```
===== ios-swift / light =====
tokens:validate-output — 196/196 emitted symbols matched a source token (100%)

18 source token(s) had no matching emitted symbol.
exit=0
===== ios-swift / dark =====
tokens:validate-output — 196/196 emitted symbols matched a source token (100%)

18 source token(s) had no matching emitted symbol.
exit=0
===== android-kotlin / light =====
tokens:validate-output — 196/196 emitted symbols matched a source token (100%)

18 source token(s) had no matching emitted symbol.
exit=0
===== android-kotlin / dark =====
tokens:validate-output — 196/196 emitted symbols matched a source token (100%)

18 source token(s) had no matching emitted symbol.
exit=0
```

| Target | Bar | Result |
|---|---|---|
| `ios-swift`, light | 196/196, 0 rule failures, exit 0 | **196/196, 0, exit 0** |
| `ios-swift`, dark | 196/196, 0 rule failures, exit 0 | **196/196, 0, exit 0** |
| `android-kotlin`, light | 0 rule failures, exit 0, rate consistent with iOS | **196/196, 0, exit 0** |
| `android-kotlin`, dark | 0 rule failures, exit 0, rate consistent with iOS | **196/196, 0, exit 0** |

No divergence between platforms: both emit exactly 196 symbols on the same
source, and the two platforms' symbol sets are the same size in both modes.

### What "196/196 matched" does and does not mean

`matched` counts **name resolution**, not value agreement
(`scripts/validate-token-output.mjs:133-145`): the counter increments as soon
as the normalized symbol name resolves to a source token path. The value is
compared only when `expectedMagnitude()` returns a magnitude, and it returns
`{skip: 'not-a-dimension'}` for every non-numeric source value.

Measured on these committed outputs by re-running the validator's own exported
`extractDeclarations` / `normalizeKey` / `expectedMagnitude` over each source
set:

| Target | Emitted | Name-matched | Value-verified | Name-only |
|---|---|---|---|---|
| `ios-swift` / light | 196 | 196 | **107** | **89** |
| `ios-swift` / dark | 196 | 196 | **107** | **89** |
| `android-kotlin` / light | 196 | 196 | **107** | **89** |
| `android-kotlin` / dark | 196 | 196 | **107** | **89** |

The 89 name-only symbols are the same set on every target: **74 colours, 14
`fontFamily`, 1 gradient**.

So state it as: *196/196 emitted symbols map to a source token; 107 of those
additionally had their numeric magnitude verified; colour and string values are
matched by name only and are checked by no rule.* Every colour — including all
11 `color-mix` resolutions — counted as matched **without its value being
compared to the source**.

**The 18 unmatched source tokens** are the web-only-unit exclusions
`nativeFilter` exists to make: `spacing.grid.containerMax` (`100%`), the four
`typography.letterSpacing.*` primitives (`em`), and the 13 `textStyle.*`
aliases that resolve to them. 214 source tokens − 18 = 196 emitted. The
validator reports these informationally; they are not rule failures.

## Spot-checks (Step 9)

```
$ grep -n 'textSm\b' out/light/ios/Tokens.swift | head -3
144:    public static let textSm = CGFloat(14.00)

$ grep -n 'color-mix' out/light/ios/Tokens.swift | wc -l
       0

$ grep -n '\.sp\b' out/light/android/Tokens.kt | head -3
(no output)
```

- **The ×16 bug is not present.** `text.sm` is authored `"14px"` and emits
  `CGFloat(14.00)`, not `CGFloat(224.00)`. The stock
  `size/swift/remToCGFloat` would have produced the latter.
- **No `color-mix()` leaks.** Both mode files author 11 `color-mix(...)`
  values and the string `color-mix` appears zero times in either output, so
  none leaked. **One** of the 11 was checked against its expected result by
  hand: `color.interactive.hoverOverlay`
  (`color-mix(in srgb, {color.neutral.900} 4%, transparent)`) emits
  `UIColor(red: 0.067, green: 0.094, blue: 0.153, alpha: 0.0392156862745098)`
  and `Color(0x0a111827)`. The other 10 are "not leaked", not "verified
  correct" — no rule checks colour values (see above).
- **Font sizes emit as `dp` on Android, not `sp`** — a reproduced defect, not
  merely an untested path. See item 1 below.

## What this run does NOT establish

1. **The Compose `sp` branch appears unreachable on spec-compliant DTCG, and
   this run reproduced the resulting defect.** The source carries **13
   font-size tokens** (`typography.textStyle.*.fontSize`) — they are *named*
   `fontSize` and *typed* `dimension`, which is what DTCG requires: DTCG has no
   `fontSize` type; `fontSize` is a Style Dictionary convention. The whole
   15-file source contains **zero** `$type: "fontSize"` tokens.
   The predicate at
   `sd-native.mjs:241` (`isFontSize`) is the whole filter for
   `size/unit-aware/compose-sp`, so it never fires and every font size falls through
   to `size/unit-aware/compose-dp`:
   ```
   $ grep -n 'FontSize' out/light/android/Tokens.kt | head -1
   158:  val typographyTextStyleBodyLgFontSize = 16.00.dp
   $ grep -c '\.sp\b' out/light/android/Tokens.kt
   0
   ```
   That is exactly the defect `sd-native.mjs:127-128` names as the transform's
   own motivation — "Compose font sizes rendered in dp instead of sp" — and it
   defeats the user's font-scale accessibility setting. Same class of bug as
   item 6 below (`leading.*` ratios → `dp`): a `$type`-gated Compose transform
   meeting real DTCG typing.

   **This is Android-only.** The iOS path is unaffected:
   `size/unit-aware/swift` filters `isDimension(token) || isFontSize(token)`,
   so dimension-typed font sizes are handled correctly there
   (`typographyTextStyleBodyLgFontSize = CGFloat(16.00)`).
2. **The `rem` branch of `magnitude()` was never exercised.** The source has no
   `rem`-authored value; every dimension is `px` or unitless.
3. **15 emitted symbols per file are not valid Swift/Kotlin.** String-valued
   tokens emit unquoted:
   ```
   public static let typographyFontFamilyWeb = Nunito Sans
   public static let gradientBrandPrimary = linear-gradient(90deg, #77AE17 0%, #AFEF21 100%)
   ```
   (14 `fontFamily` symbols + 1 CSS `linear-gradient`, identical on both
   platforms.) This is **stock Style Dictionary behaviour**, not something the
   module introduces — `content/swift/literal` and `asset/swift/literal` only
   apply to `$type: content`/`asset`. The validator does not catch it: its
   `no-foreign-syntax` rule matches only `color-mix|calc|var`, and it has no
   rule for language validity. Combined with the matched/verified split above:
   **196/196 emitted symbols map to a source token; 107 of those additionally
   had their numeric magnitude verified; colour and string values are matched
   by name only and are checked by no rule** — and nothing checks that any of
   it compiles. Any public claim built on this run must say that, not "196
   correct symbols".
4. **Nothing was compiled in this run.** No `swiftc` or `kotlinc` ran;
   correctness here is value fidelity as measured by `tokens:validate-output`
   only. `swiftc` was nonetheless available at `/usr/bin/swiftc` via the Xcode
   command line tools when this run happened, and went unused — the Swift
   half of this limitation was self-imposed. `kotlinc` was not available: it
   was installed on 2026-08-27, after this run. Later runs compile both, via
   `ci/compile-native-output.mjs` (#81).
5. **The desktop viewport axis was not built.** Only the mobile axis was.
6. **Unitless ratios emit as `dp` on Android.** `leading.*` is authored
   unitless (`"1.5"`, typed `dimension`) and emits `val leadingNormal = 1.50.dp`
   — a line-height ratio expressed in density-independent pixels. The magnitude
   is faithful, so the validator passes, but the unit is semantically wrong.
   Swift's `CGFloat(1.50)` is unitless and fine.
7. **Only the default `className` was used** (`Tokens`), and only one
   `packageName`. The `nativePlatform` error paths (unknown platform, missing
   `packageName`) are unit-test-only.

---

## Addendum — 2026-08-21, re-run after the final fix wave

**Why.** The fix wave moved `preprocessors: ['dtcg/resolve-dual-node']` into the
object `nativePlatform` returns, and rewrote `nativeSources`' read/parse error
path. Both change what Style Dictionary consumes, so the four-build evidence
above was re-established rather than assumed. The original record is unchanged;
this is what the re-run measured.

**Harness.** Same scratch directory, same Style Dictionary `4.4.0`, same 15
extracted zygarden token files, same `build.mjs`. The three installed module
files (`scripts/lib/sd-native.mjs`, `scripts/lib/dtcg.mjs`,
`scripts/validate-token-output.mjs`) were re-copied from the repo first, so the
fixed code is what ran. `out/` was deleted before building. (Four files today —
see the correction under **Harness** above.)

```
$ node build.mjs
built ios-swift / light
built android-kotlin / light
built ios-swift / dark
built android-kotlin / dark
exit=0
```

Validator invocations are the ones recorded above, with one change: this run
passes **`--min-match 1`**, matching the gate the docs now describe.

```
===== ios-swift / light =====
tokens:validate-output — 196/196 emitted symbols matched a source token (100%)

18 source token(s) had no matching emitted symbol.
exit=0
===== ios-swift / dark =====
tokens:validate-output — 196/196 emitted symbols matched a source token (100%)

18 source token(s) had no matching emitted symbol.
exit=0
===== android-kotlin / light =====
tokens:validate-output — 196/196 emitted symbols matched a source token (100%)

18 source token(s) had no matching emitted symbol.
exit=0
===== android-kotlin / dark =====
tokens:validate-output — 196/196 emitted symbols matched a source token (100%)

18 source token(s) had no matching emitted symbol.
exit=0
```

**No figure moved.** Re-running `measure.mjs` over the fresh outputs reproduces
the matched/verified split exactly:

```
ios-swift / light: total=196 matched=196 value-verified=107 name-only=89  [color=74 fontFamily=14 gradient=1]
android-kotlin / light: total=196 matched=196 value-verified=107 name-only=89  [color=74 fontFamily=14 gradient=1]
ios-swift / dark: total=196 matched=196 value-verified=107 name-only=89  [color=74 fontFamily=14 gradient=1]
android-kotlin / dark: total=196 matched=196 value-verified=107 name-only=89  [color=74 fontFamily=14 gradient=1]
```

Spot-checks also unchanged: `textSm = CGFloat(14.00)`, zero `color-mix` in the
Swift output, zero `.sp` in the Kotlin output. Items 1, 3 and 6 under "What this
run does NOT establish" still hold verbatim — the fix wave documents them, it
does not fix them.

### Extra check the original run did not make

The platform-level `preprocessors` is only worth carrying if it does the work on
its own. Building with the top-level `preprocessors` line **removed** from
`build.mjs` produces output byte-identical to the run above:

```
$ node build-notop.mjs && diff -r out out-noTop
IDENTICAL: platform-level preprocessors alone produce byte-identical output
```

So `nativePlatform`'s copy is sufficient, and a project that also declares it at
top level pays nothing — `preprocess` is idempotent.
