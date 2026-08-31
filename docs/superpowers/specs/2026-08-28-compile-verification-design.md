# Compile verification for native token output — design

**Issue:** [#81](https://github.com/jrpease/throughline/issues/81) — e2e runs can
compile their output now; four notes still say they cannot
**Date:** 2026-08-28
**Base branch:** `main` (`e45afc4`). No open PRs, so this does not stack.

## 1. What is actually available, measured

Both compilers were run against zygarden's real emitted output during this
design, not inspected or assumed.

| tool | version | path |
|---|---|---|
| `swiftc` | Apple Swift 6.3.2 (`swift-driver` 1.148.6) | `/usr/bin/swiftc` |
| `kotlinc` | kotlinc-jvm 2.4.10 (JRE 26.0.2.1) | `/opt/homebrew/bin/kotlinc` |

**Kotlin typechecks to real bytecode.** Against the 195-declaration
`out-52-head/Tokens.kt` from the surviving e2e harness — that build predates
#64, so it is 195 declarations, not `main`'s current 208 (§8):

```
$ kotlinc compose-stubs.kt compose-stubs-graphics.kt Tokens.kt -d out2   # scratch names; committed as ci/stubs/compose-{unit,graphics}.kt per §3
kotlinc exit=0
$ find out2 -name '*.class'
out2/com/zygarden/tokens/Tokens.class
out2/androidx/compose/ui/unit/Dp.class
out2/androidx/compose/ui/unit/TextUnit.class
out2/androidx/compose/ui/unit/Compose_stubsKt.class
out2/androidx/compose/ui/graphics/Color.class
```

**Swift parses only, and the reason is exact:**

```
$ swiftc -parse Tokens.swift      # exit=0
$ swiftc -typecheck Tokens.swift  # exit=1
Tokens.swift:9:8: error: no such module 'UIKit'
```

`Tokens.swift` opens `import UIKit` and every colour is a `UIColor(...)`.
`-parse` does not resolve imports, so it succeeds; `-typecheck` must, so it
cannot. This is a property of the platform, not a gap to close later.

### 1.1 How much each mode actually catches

Measured on the two literals #70 turned on, because "compiles" is not one
strength across the two platforms:

| literal | Swift `-parse` | Kotlin |
|---|---|---|
| `.5` | **rejected** — "'.5' is not a valid floating point literal; it must be written '0.5'" | **accepted**, `.class` produced |
| `0100` | **accepted** | **rejected** — "leading zeros are not allowed in integer literals" |

Exactly opposite, as #81 states. This is the measured basis for #70's
per-platform rule, and it means neither compiler subsumes the other even at the
literal level. Swift's parse-only mode is weaker than Kotlin's typecheck about
*types*, but it is not weaker about *syntax* — it catches a class of literal
defect Kotlin accepts.

## 2. Three corrections to the issue's own text

All three measured, all three change what this spec must do.

### 2.1 The stub set in the issue is insufficient, and cannot be one file

#81 gives roughly ten lines covering `androidx.compose.ui.unit` — `Dp`,
`TextUnit`, and the `.dp` / `.sp` / `.em` extension properties. Run against real
output, that set fails:

```
Tokens.kt:9:28: error: unresolved reference 'graphics'.
import androidx.compose.ui.graphics.Color
Tokens.kt:13:23: error: unresolved reference 'Color'.
  val colorBgCanvas = Color(0xffffffff)
```

Real output also imports `androidx.compose.ui.graphics.Color` and emits
`Color(0xffffffff)`. Colours are the largest single category of token, so the
issue's stub set fails on essentially every real design system, not an edge
case.

**And it must be two files.** A Kotlin source file carries exactly one `package`
declaration, so `androidx.compose.ui.unit` and `androidx.compose.ui.graphics`
cannot share one. The issue's "the stub file", singular, is not achievable.

The colour literal also fixes the stub's type: `0xffffffff` is 4294967295, past
`Int.MAX_VALUE`, so Kotlin types it `Long` and the stub must be
`class Color(val value: Long)`.

### 2.2 There is no "e2e procedure" to add a step to

#81's step 2 says to add a compile step "to the e2e procedure". No such durable
artifact exists. Every e2e run is recorded in its own dated note describing the
harness that ran it; there is no canonical procedure document, and
`docs/superpowers/` holds only `notes/`, `plans/`, and `specs/`.

**That absence is a prior decision, not an oversight.** #73 investigated whether
#55 and #60's evidence was vacuous, and `ee95020` resolved it by scoping the
procedure text to the harness that ran it. The finding: the recorded steps were
correct at 10:22 on 2026-08-24 and a silent no-op by 13:46 the same day, when
`build.mjs` was rewritten to import `./lib/sd-native.mjs`. #52's plan inherited
the stale text four days later and nearly recorded a false PASS.

The lesson generalises directly to #81: **prose procedure rots silently;
executable code fails loudly.** A documented compile step is the same artifact
that already failed once. So the reusable thing must be a committed, runnable
script, and the notes cite it rather than describe it.

This is also why #81 exists at all — a claim about tooling ("nothing was
compiled") lived in prose across four notes and went stale without anything
detecting it.

### 2.3 CI gating is not a toolchain question

#81's step 4 frames the CI decision as needing "a JDK on the runner and the stubs
to be maintained". The blocker is earlier than that.

`PLATFORMS` in `scripts/lib/sd-native.mjs:365,380` targets Style Dictionary's
**stock** formatters — `ios-swift/enum.swift` and `compose/object`. ThroughLine
owns the transforms and the config; it does not own the formatter. There is no
code path that produces `Tokens.kt` text without Style Dictionary running.

And the repo declares **zero dependencies, with no lockfile and no
`node_modules`** — deliberately, per `package.json`. So a CI compile gate needs
Style Dictionary added as a devDependency plus a lockfile plus `npm ci`, plus a
committed token fixture, before any toolchain question arises.

§7 records the decision this leads to.

## 3. What lands

| # | artifact | kind |
|---|---|---|
| 1 | `ci/compile-native-output.mjs` | new runner |
| 2 | `ci/stubs/compose-unit.kt`, `ci/stubs/compose-graphics.kt` | new stubs |
| 3 | `ci/compile-native-output.test.mjs` | new tests |
| 4 | four e2e notes, claim scoped to when it was true | edit |
| 5 | `ci/README.md` — runner entry + the §7 decision | edit |
| 6 | `docs/superpowers/notes/2026-08-28-compile-verification-e2e.md` | new note |

### 3.1 The stub source, as measured

Recorded here rather than left to re-derivation, because a spec arguing for
measured artifacts over reconstructable prose should not make its own stubs
reconstructable prose. This exact pair compiled zygarden's real output to
bytecode during design.

`ci/stubs/compose-unit.kt`:

```kotlin
package androidx.compose.ui.unit
class Dp(val value: Double)
class TextUnit(val value: Double)
val Double.dp: Dp get() = Dp(this)
val Double.sp: TextUnit get() = TextUnit(this)
val Double.em: TextUnit get() = TextUnit(this)
```

`ci/stubs/compose-graphics.kt`:

```kotlin
package androidx.compose.ui.graphics
class Color(val value: Long)
```

`Long`, not `Int` or `ULong`: `0xffffffff` is 4294967295, past `Int.MAX_VALUE`,
so Kotlin types the literal `Long` and the constructor must accept one.

`ci/` is the correct home: its README already states these are "**Not** copied
into user repos — unlike `scripts/`, these guard *this plugin's* own structure",
and `package.json`'s `files` omits `ci/` entirely. Nothing here reaches the
published tarball.

## 4. The runner's contract

`node ci/compile-native-output.mjs <dir> [--allow-missing]`

Takes a directory holding `Tokens.kt` and/or `Tokens.swift`. For each file
present:

- **Kotlin** — `kotlinc <stubs> <dir>/Tokens.kt -d <tmp>`. Passes only if the
  exit status is 0 **and** a `Tokens.class` exists under `<tmp>`. **The stub
  paths resolve relative to the runner module, not the working directory** —
  via `import.meta.url` — because the intended caller is an e2e harness in a
  scratchpad, where a cwd-relative `ci/stubs/...` resolves to nothing.
- **Swift** — `swiftc -parse <dir>/Tokens.swift`. Passes on exit status 0.

Rules:

- **The asymmetry is printed every run**, not documented. Output reads
  `Kotlin: typechecked to bytecode` / `Swift: parsed only (UIKit unavailable;
  -typecheck impossible)`. Every future e2e note then carries the caveat as part
  of its own transcript, which is the specific failure mode §2.2 describes.
- **A missing compiler is a failure**, not a skip. A silent skip is the
  "verification that cannot fail reads identically to one that passed" shape #73
  was written about. `--allow-missing` downgrades it to a reported skip that does
  not affect the exit status — for a machine that genuinely has only one
  toolchain. It must be passed deliberately; it is never the default.
- **A run in which nothing actually compiled fails, `--allow-missing`
  notwithstanding.** At least one platform must have been really compiled for
  the run to pass. Without this rule the flag produces a green run that verified
  nothing, which is the same vacuous pass as §2.2 — the flag exists to tolerate
  *one* absent toolchain, not to excuse the absence of both.
- **An absent `Tokens.swift` is neither pass nor fail** — it is reported as not
  present. Absence of a file is not evidence about it.
- **The compiler's own stderr is surfaced verbatim** on failure. #81's third
  finding is that the compilers' error text is better evidence than any
  paraphrase.
- Exit non-zero if any present platform failed.

**Implementation note.** Exit status must be read from the compiler process
directly, never through a pipe — during this design `kotlinc ... | head`
reported `exit=0` while `kotlinc` itself had failed, because the shell reports
the last command in the pipeline. That is the same false-pass shape as
everything else in this spec.

## 5. Testing

`ci/` is stdlib-only and every module there has a `.test.mjs` sibling. The tests
cover the runner's decision logic with an injected fake exec:

- missing compiler → fails; with `--allow-missing` → reports skipped
- `kotlinc` exit 0 but no `Tokens.class` → fails (guards the "compiles" claim
  against an empty output directory)
- Kotlin fails, Swift passes → overall non-zero, both verdicts still reported
- `Tokens.swift` absent → reported as not present, not as a pass
- compiler stderr appears in output

**The test suite never invokes a real compiler.** CI is `ubuntu-latest` with
Node 24 and nothing else; `node --test` has to stay green there with zero
dependencies.

This relies on bare `node --test` from the repo root discovering
`ci/compile-native-output.test.mjs`, as it already discovers every other
`ci/*.test.mjs`. Stated because it is load-bearing and `ci/README.md` records
that discovery here has misfired before: the invocation is **bare `node --test`
from the repo root**, never `node --test ci/`, which errors on Node >= 21.

## 6. The four note corrections

Each of these carries one occurrence of the stale claim:

- `2026-08-21-native-config-e2e-results.md`
- `2026-08-23-native-literal-validity-e2e.md`
- `2026-08-24-hoist-dual-nodes-e2e.md`
- `2026-08-26-unitless-dimension-e2e.md`

The verdicts stand and are not touched. The claim is **scoped to when it was
true**, the same treatment `ee95020` gave the #55 procedure — the run genuinely
did not compile anything, and that part of the record is accurate. What changes
is the false implication that compiling was impossible:

> **Nothing was compiled in this run.** No `swiftc` or `kotlinc` ran; the
> declaration counts are `grep`-based, not a compiler's verdict. `swiftc` was
> nonetheless available at `/usr/bin/swiftc` via the Xcode command line tools
> when this run happened, and went unused — the Swift half of this limitation
> was self-imposed. `kotlinc` was not: it was installed on 2026-08-27, after
> this run. Later runs compile both: see `ci/compile-native-output.mjs` (#81).

**The two compilers must not be scoped identically, and getting this wrong was
caught in review.** `kotlinc` was installed 2026-08-27 22:59; the four notes are
dated 08-21 through 08-26, so it existed on the machine for none of them. A
correction claiming "both compilers were available" would replace a false
implication with a false statement — the exact defect this spec exists to
prevent. #81's own text draws the distinction correctly; any edit that loses it
is wrong.

## 7. The decision: not a CI gate

Recorded in `ci/README.md` with its reasoning, so that reopening it is a
deliberate act rather than drift:

> Compile verification runs at e2e time, not in CI. Producing `Tokens.kt` at all
> requires Style Dictionary, because the config targets SD's stock formatters
> (§2.3); the repo declares zero dependencies and has no lockfile; and
> `ubuntu-latest` carries neither toolchain. Gating would mean adding a
> dependency graph, a lockfile, a committed token fixture, a JDK, and a Swift
> toolchain — to prove that output compiles *under one pinned SD version*, while
> the version a consumer actually runs stays invisible to us either way. The e2e
> harness builds real zygarden source, which is stronger evidence than that
> fixture would be.

## 8. Baseline run, and the falsifiable prediction

The e2e harness survived at
`395cf4ed-.../scratchpad/e2e` with Style Dictionary installed, all 15 zygarden
token files in `../tokens`, and its `lib/*` symlinks pointing at this checkout.
It is being reaped — several directories were emptied at 2026-08-28 00:00 — so
this run also establishes whether it still works while it still does.

### 8.1 If the harness is gone, rebuild it from this section

Everything needed was captured during design, so §8 does not depend on a
scratchpad surviving. Verified 2026-08-28:

- **Style Dictionary 4.4.0**, installed locally in the harness directory. Not a
  repo dependency and must not become one (§2.3).
- **Token source:** `/Users/jordansstudio/Dev/zygarden-frontend` at
  `libs/shared/util-tokens/src/tokens` — 15 `.json` files. Copy them out; do not
  build inside the zygarden checkout. (The branch has moved since earlier runs —
  it is `feature/new-home-page` now, not the `feature/apply-brandguide-styles`
  named in the #52 spec. The 15 filenames still match.)
- **Axis filter:** the build drops any filename containing `desktop` or `dark`,
  leaving the light + mobile axes. This is why the baseline is one flat pair of
  files and not four.
- **`packageName`:** `com.zygarden.tokens`.
- **The module under test is reached through `./lib/*.mjs`** — three per-file
  symlinks to `dtcg.mjs`, `native-literal.mjs`, `sd-native.mjs` in this
  checkout's `scripts/lib/`. **Not `scripts/lib`**, which `build.mjs` never
  reads; repointing that is the no-op #73 was filed over (`ee95020`).

`build.mjs` in full:

```js
import StyleDictionary from 'style-dictionary';
import { registerNativeTransforms, nativePlatform, nativeSources } from './lib/sd-native.mjs';
import { readdirSync } from 'node:fs';
const TOK = process.argv[2];
const OUT = process.argv[3];
const files = readdirSync(TOK).filter(f => f.endsWith('.json') && !f.includes('desktop') && !f.includes('dark')).map(f => `${TOK}/${f}`);
registerNativeTransforms(StyleDictionary);
const sd = new StyleDictionary({
  source: nativeSources(files),
  preprocessors: ['dtcg/resolve-dual-node'],
  platforms: {
    kt: nativePlatform({ platform: 'android-kotlin', buildPath: `${OUT}/`, packageName: 'com.zygarden.tokens' }),
    swift: nativePlatform({ platform: 'ios-swift', buildPath: `${OUT}/` }),
  },
});
await sd.buildAllPlatforms();
```

Rebuilding is a fallback, not a fresh baseline: a rebuilt harness proves the same
thing only if the declaration counts in §8's table still hold.

Build zygarden at `main`, compile both outputs, record in the new note.
Prediction, to be checked against actual bytes rather than reasoning:

| prediction | how it fails |
|---|---|
| `Tokens.kt` compiles, exit 0, `Tokens.class` produced | any `kotlinc` diagnostic |
| `Tokens.swift` parses, exit 0 | any `swiftc -parse` diagnostic |
| declaration count is 208 Kotlin / 195 Swift | count line disagrees |

**And the control, which matters more than the pass.** #73's durable lesson is
that a procedure predicting an absence cannot distinguish a sound run from a
broken one. So the run also feeds the runner known-bad input and requires a
failure — measured during this design:

```
val letterSpacingTight = -0.03.em     -> exit=1
  error: unresolved reference 'unaryMinus' for operator '-'.
val letterSpacingTight = (-0.03).em   -> exit=0
```

That is the #64 defect exactly. A run where the control does not fail is a
broken run regardless of what the baseline reported.

## 9. Limitations, stated rather than hidden

- **Swift is parsed, never typechecked.** A type error in `Tokens.swift` —
  wrong `UIColor` initialiser arity, an `Int` where `CGFloat` is required — will
  pass. Only syntax is asserted. Closing this needs an iOS SDK and a real
  destination target, which is out of proportion here.
- **The Kotlin stubs are not Compose.** They are six declarations with matching
  names and shapes — `Dp`, `TextUnit`, `.dp`, `.sp`, `.em`, `Color` (§3.1). Real `Dp` is a value class with operators and real `Color` a
  `ULong` wrapper; behaviour differences beyond "this expression resolves and
  typechecks" are not covered.
- **Neither compiler validates semantics.** `2.dp` where `2.sp` was meant
  compiles. This closes the gap between "well-formed literal" and "compiles",
  which is narrower than "correct" — `tokens:validate-output` and the e2e diff
  remain the checks for whether the right thing was emitted.
- **The harness is scratch and unowned.** Nothing in this spec makes the e2e
  harness durable; it remains a scratchpad artifact that can vanish. The runner
  and stubs are the only parts that become repo assets.

## 10. Out of scope

- **#77** — discriminating fixtures for absence-shaped PASS conditions. Cited as
  the source of §8's control, not implemented.
- **#80** — the `release.yml` gate gap.
- Every native token fix: #63, #67, #71, #72, #75.
- Promoting the runner to `scripts/` for consumers. Decided against in design:
  ThroughLine declares no dependencies and cannot assume a consumer has either
  toolchain, and there is no demand on record.
