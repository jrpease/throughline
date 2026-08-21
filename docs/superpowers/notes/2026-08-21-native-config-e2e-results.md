# Native config module — end-to-end verification results

**Date:** 2026-08-21
**Gate for:** Task 6 (tier promotion of `ios-swift`)
**Verdict:** PASS against the stated bar, with two recorded caveats (see
"What this run does not establish").

Unit tests prove the functions in `scripts/lib/sd-native.mjs` behave. This run
proves Style Dictionary *consumes* them: four real builds from zygarden's DTCG
source, each validated with `tokens:validate-output`.

## Harness

- **Style Dictionary:** `4.4.0` (fresh `npm i style-dictionary@4` in a scratch
  directory, nothing from the throughline repo's own tree).
- **Installed by copy, not symlink** — proving the Task 6 install list is
  complete: `scripts/lib/sd-native.mjs`, `scripts/lib/dtcg.mjs`,
  `scripts/validate-token-output.mjs`. Nothing else was needed.
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

Eleven mode-neutral files, plus one colour file per build:

```
NEUTRAL = color-primitives, leading-primitives, radius-primitives,
          radius-semantic, spacing-primitives, stroke-primitives,
          stroke-semantic, text-primitives, typography-primitives,
          spacing-semantic.mobile, typography-semantic.mobile
light   = NEUTRAL + color-semantic.light      (214 $value entries)
dark    = NEUTRAL + color-semantic.dark       (214 $value entries)
```

`nativeSources()` accepted both lists. Passing the **whole directory** instead
makes the guard fire, as designed:

```
$ node guard-check.mjs
50 token path(s) are defined differently across this build's sources.
Style Dictionary keeps whichever file sorts last, silently dropping a whole mode.
Build once per mode, passing an explicit source list for that mode only.
  color.bg.canvas: tokens/color-semantic.dark.json vs tokens/color-semantic.light.json
  color.bg.surface.1: tokens/color-semantic.dark.json vs tokens/color-semantic.light.json
  ...
```

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
  values; all 11 resolve. `color.interactive.hoverOverlay`
  (`color-mix(in srgb, {color.neutral.900} 4%, transparent)`) emits
  `UIColor(red: 0.067, green: 0.094, blue: 0.153, alpha: 0.0392156862745098)`
  and `Color(0x0a111827)`.
- **The `.sp` path was NOT exercised** — see below.

## What this run does NOT establish

1. **The Compose `sp` path was never exercised.** The source contains **zero**
   `$type: "fontSize"` tokens — every size is typed `dimension` (148
   occurrences; the other types are `color`, `fontFamily`, `fontWeight`,
   `string`). `size/unit-aware/compose-sp` therefore never fired, and the
   Kotlin output contains no `.sp` at all. Font sizes emit as `.dp`. The
   transform is unit-tested but has no end-to-end evidence.
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
   rule for language validity. So "196/196 matched" means **196 symbols carry
   their source value**, not "196 symbols compile". Any public claim built on
   this run should say the former.
4. **Nothing was compiled.** No `swiftc` or `kotlinc` ran; correctness here is
   value fidelity as measured by `tokens:validate-output` only.
5. **The desktop viewport axis was not built.** Only the mobile axis was.
6. **Unitless ratios emit as `dp` on Android.** `leading.*` is authored
   unitless (`"1.5"`, typed `dimension`) and emits `val leadingNormal = 1.50.dp`
   — a line-height ratio expressed in density-independent pixels. The magnitude
   is faithful, so the validator passes, but the unit is semantically wrong.
   Swift's `CGFloat(1.50)` is unitless and fine.
7. **Only the default `className` was used** (`Tokens`), and only one
   `packageName`. The `nativePlatform` error paths (unknown platform, missing
   `packageName`) are unit-test-only.
