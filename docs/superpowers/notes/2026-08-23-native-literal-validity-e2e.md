# Native literal validity — end-to-end verification results

**Date:** 2026-08-23
**Gate for:** #53 — the `invalid-literal` rule and the quoting/drop fix in
`scripts/lib/sd-native.mjs`, at HEAD `52b1888`.
**Verdict:** PASS. The rule catches the 15-symbols-per-file defect on the
pre-fix output (exit 1) and reports zero failures on the post-fix output
(exit 0), on all four platform/mode combinations. The measurements below
distinguish what the run establishes from what it does not; see "What this
run does NOT establish."

Tasks 1–3 proved `parseLiteral`/`isValidLiteral`, the `invalid-literal` rule,
and the quoting transforms in isolation, by unit test. This run proves Style
Dictionary *consumes* them correctly against the same real zygarden DTCG
source used for the `ios-swift` tier-promotion evidence
(`docs/superpowers/notes/2026-08-21-native-config-e2e-results.md`), by
rebuilding all four combinations and re-running the validator over both the
pre-fix and post-fix output.

## Harness

- **Style Dictionary:** `4.4.0`, installed in a scratch directory.
- **`scripts/lib` symlinked** to the repo's live tree — the code under test is
  whatever is checked out at HEAD, not a copy.
- **Source:** the same 15 zygarden token files as the 2026-08-21 run (light +
  dark colour modes, mobile-pinned viewport axis, same `NEUTRAL`/`VIEWPORT`
  split in `build.mjs`).
- **`out-prefix/`:** a pre-fix snapshot of the same build, taken before the
  fix wave (commits `6b81f8c`..`52b1888`), kept for direct before/after
  comparison against the current `out/`.

## Step 1 — Rebuild all four combinations

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

Four `built …` lines, exit 0, as expected.

## Step 2 — Broken symbols gone, declaration count 196 → 195

```
$ for f in out/*/ios/Tokens.swift out/*/android/Tokens.kt; do
  printf "%-32s broken=%s decls=%s\n" "$f" \
    "$(grep -cE '= (Nunito Sans|linear-gradient)' "$f")" \
    "$(grep -cE '(static let|val) [A-Za-z_]' "$f")"
done
out/dark/ios/Tokens.swift        broken=0 decls=195
out/light/ios/Tokens.swift       broken=0 decls=195
out/dark/android/Tokens.kt       broken=0 decls=195
out/light/android/Tokens.kt      broken=0 decls=195
```

For comparison, the pre-fix baseline in `out-prefix/`:

```
$ for f in out-prefix/*/ios/Tokens.swift out-prefix/*/android/Tokens.kt; do
  printf "%-40s broken=%s decls=%s\n" "$f" \
    "$(grep -cE '= (Nunito Sans|linear-gradient)' "$f")" \
    "$(grep -cE '(static let|val) [A-Za-z_]' "$f")"
done
out-prefix/dark/ios/Tokens.swift         broken=15 decls=196
out-prefix/light/ios/Tokens.swift        broken=15 decls=196
out-prefix/dark/android/Tokens.kt        broken=15 decls=196
out-prefix/light/android/Tokens.kt       broken=15 decls=196
```

`decls` came out at **195, not 181** — the failure branch the brief names
(`$type` not surviving the hoist preprocessor, dropping all 14 `fontFamily`
tokens instead of quoting them) did **not** fire. That prediction is
confirmed unnecessary rather than merely unexercised: `fontFamily` is present
and quoted, not missing.

```
$ grep -n 'FontFamily' out/light/ios/Tokens.swift
149:    public static let typographyFontFamilyWeb = "Nunito Sans"
155:    public static let typographyTextStyleBodyLgFontFamily = "Nunito Sans"
159:    public static let typographyTextStyleBodyMdFontFamily = "Nunito Sans"
163:    public static let typographyTextStyleBodySmFontFamily = "Nunito Sans"
167:    public static let typographyTextStyleCaptionFontFamily = "Nunito Sans"
171:    public static let typographyTextStyleDisplayLgFontFamily = "Nunito Sans"
175:    public static let typographyTextStyleDisplayMdFontFamily = "Nunito Sans"
179:    public static let typographyTextStyleH1FontFamily = "Nunito Sans"
183:    public static let typographyTextStyleH2FontFamily = "Nunito Sans"
187:    public static let typographyTextStyleH3FontFamily = "Nunito Sans"
191:    public static let typographyTextStyleH4FontFamily = "Nunito Sans"
195:    public static let typographyTextStyleLabelLgFontFamily = "Nunito Sans"
199:    public static let typographyTextStyleLabelMdFontFamily = "Nunito Sans"
203:    public static let typographyTextStyleLabelSmFontFamily = "Nunito Sans"

$ grep -n 'gradient' out/light/ios/Tokens.swift
(no output)
```

14 `fontFamily` symbols, quoted; the gradient symbol (`gradientBrandPrimary`)
is absent entirely from the post-fix file — it is filtered out of native
output, not emitted broken. `196 - 1 (dropped gradient) = 195` declarations,
matching the measured count exactly.

## Step 3 — Validator over pre-fix and post-fix output

Run from the scratch root, `--min-match 1`, source list built as a bash array
(a bare string collapses to one argument, per the 2026-08-21 note).

### PRE-FIX — expect 15 `invalid-literal` failures, exit 1

All four combinations reproduce the same 15 failures (14 `fontFamily`
symbols + 1 gradient), the message deriving a stop offset in each case.
`ios-swift / light`, verbatim:

```
tokens:validate-output — 196/196 emitted symbols matched a source token (100%)

15 rule failure(s):
  - [invalid-literal] gradientBrandPrimary: emitted `linear-gradient(90deg, #77AE17 0%, #AFEF21 100%)` is not a valid ios-swift literal — parsing stopped at offset 6 ("-gradient(90deg, #77AE17 0%, #")
  - [invalid-literal] typographyFontFamilyWeb: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleBodyLgFontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleBodyMdFontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleBodySmFontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleCaptionFontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleDisplayLgFontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleDisplayMdFontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleH1FontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleH2FontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleH3FontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleH4FontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleLabelLgFontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleLabelMdFontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")
  - [invalid-literal] typographyTextStyleLabelSmFontFamily: emitted `Nunito Sans` is not a valid ios-swift literal — parsing stopped at offset 7 ("Sans")

An invalid-literal value will not compile. A string value must be quoted — add its $type to the quoting transform in lib/sd-native.mjs. A CSS construct such as linear-gradient() has no native form and should be filtered out of native builds instead.

18 source token(s) had no matching emitted symbol.
exit=1
```

`android-kotlin / light`, `ios-swift / dark`, `android-kotlin / dark` produce
the identical 15-failure list (platform name substituted in the message,
`android-kotlin` for the two Kotlin runs), same `exit=1`.

### POST-FIX — expect 0 failures, exit 0

```
===== ios-swift / light / POST =====
tokens:validate-output — 195/195 emitted symbols matched a source token (100%)

19 source token(s) had no matching emitted symbol.
exit=0
===== android-kotlin / light / POST =====
tokens:validate-output — 195/195 emitted symbols matched a source token (100%)

19 source token(s) had no matching emitted symbol.
exit=0
===== ios-swift / dark / POST =====
tokens:validate-output — 195/195 emitted symbols matched a source token (100%)

19 source token(s) had no matching emitted symbol.
exit=0
===== android-kotlin / dark / POST =====
tokens:validate-output — 195/195 emitted symbols matched a source token (100%)

19 source token(s) had no matching emitted symbol.
exit=0
```

| Target | Pre-fix | Post-fix |
|---|---|---|
| `ios-swift`, light | 15 failures, exit 1 | 0 failures, 195/195, exit 0 |
| `ios-swift`, dark | 15 failures, exit 1 | 0 failures, 195/195, exit 0 |
| `android-kotlin`, light | 15 failures, exit 1 | 0 failures, 195/195, exit 0 |
| `android-kotlin`, dark | 15 failures, exit 1 | 0 failures, 195/195, exit 0 |

`unemittedTokens` rose from 18 to 19 on every combination — the gradient
token, present in the source but now correctly absent from native output,
moves from "matched-but-invalid" to "unmatched," which is the expected
consequence of filtering it rather than emitting it broken.

## Step 4 — No other measurement moved

```
$ node measure.mjs
ios-swift / light: total=195 matched=195 value-verified=107 name-only=88  [color=74 fontFamily=14 gradient=0]
android-kotlin / light: total=195 matched=195 value-verified=107 name-only=88  [color=74 fontFamily=14 gradient=0]
ios-swift / dark: total=195 matched=195 value-verified=107 name-only=88  [color=74 fontFamily=14 gradient=0]
android-kotlin / dark: total=195 matched=195 value-verified=107 name-only=88  [color=74 fontFamily=14 gradient=0]
```

Same measurement re-run against the `out-prefix/` snapshot, for direct
before/after comparison:

```
$ node measure-prefix.mjs   (measure.mjs with out/ -> out-prefix/)
ios-swift / light: total=196 matched=196 value-verified=107 name-only=89  [color=74 fontFamily=14 gradient=1]
android-kotlin / light: total=196 matched=196 value-verified=107 name-only=89  [color=74 fontFamily=14 gradient=1]
ios-swift / dark: total=196 matched=196 value-verified=107 name-only=89  [color=74 fontFamily=14 gradient=1]
android-kotlin / dark: total=196 matched=196 value-verified=107 name-only=89  [color=74 fontFamily=14 gradient=1]
```

| Metric | Pre-fix | Post-fix | Moved? |
|---|---|---|---|
| `total` / `matched` | 196 | 195 | yes — gradient dropped |
| `value-verified` | 107 | 107 | **no** |
| `name-only` | 89 | 88 | yes — gradient dropped |
| `name-only` breakdown | color=74 fontFamily=14 gradient=1 | color=74 fontFamily=14 gradient=0 | only `gradient` changed |

`value-verified=107` is unchanged, and `color=74`/`fontFamily=14` are intact
on both sides. Only the gradient's presence moved. No dimension or colour
token was affected by the quoting/drop fix, as expected — the fix targets
literal syntax, not numeric magnitude.

## What this run does NOT establish

1. **Nothing was compiled in this run.** No `swiftc` or `kotlinc` ran. "Valid
   literal" here means `parseLiteral`/`isValidLiteral` (Task 1's grammar)
   accepts the emitted text as a syntactically well-formed Swift or Kotlin
   literal — not that the surrounding declaration, type, or file compiles. A
   type mismatch or a reference to an undefined symbol elsewhere in the file
   would still pass every check made here. `swiftc` was nonetheless available
   at `/usr/bin/swiftc` via the Xcode command line tools when this run
   happened, and went unused — the Swift half of this limitation was
   self-imposed. `kotlinc` was not available: it was installed on 2026-08-27,
   after this run. Later runs compile both, via `ci/compile-native-output.mjs`
   (#81).
2. **Colour values are still matched by name only and checked by no rule.**
   As in the 2026-08-21 native-config run, `matched` counts name resolution
   in `tokens:validate-output`, not value agreement. `invalid-literal` checks
   literal *syntax*, not whether a colour's numeric components are correct.
   All 74 colour symbols in `name-only` above are unverified by value, exactly
   as before this fix — this task did not change that.
3. **The gradient is dropped rather than translated.** `gradientBrandPrimary`
   has no native literal form at all and is filtered out of native output
   entirely, not converted to any Swift/Kotlin equivalent (e.g. a gradient
   layer or brush). Consumers who need the gradient on native must express it
   by other means; `unemittedTokens` reports the drop, it does not hide it.
4. **The `$type`-hoist failure branch was not exercised.** The brief names a
   specific risk — `$type` not surviving the hoist preprocessor, which would
   drop all 14 `fontFamily` tokens instead of quoting them (decls=181). That
   branch did not fire (decls=195, fontFamily present and quoted), so it
   remains a prediction that was checked and found not to apply here, not a
   path this run exhaustively tested under other preprocessor configurations.
5. **Only the mobile viewport axis, `Tokens`/default `packageName`, and the
   same 15-file zygarden source were exercised** — same scope limits as the
   2026-08-21 run (desktop viewport axis, alternate class/package names, and
   the Compose `sp` defect are out of scope here as there).
6. **This source contains exactly one CSS-function-shaped invalid value** —
   the gradient. This run says nothing about the silent-drop path for any
   other such value (an unrescued `calc(...)`, `var(...)`, or `color-mix(...)`
   variant): whether the filter correctly distinguishes "no native form at
   all" from "an unimplemented rescue" was never exercised here. That is
   precisely where the branch's final review found two defects — the filter
   silently dropping values it should instead let fail loudly.

## Files

- `docs/superpowers/notes/2026-08-21-native-config-e2e-results.md` — the prior
  run this one follows the structure of, and whose 196-declaration/15-broken
  baseline this run's pre-fix numbers reproduce.
- `references/sync-adapters.md` — the tier caveat this run's evidence retires
  (see the paragraph beginning "What the badge does not cover").
