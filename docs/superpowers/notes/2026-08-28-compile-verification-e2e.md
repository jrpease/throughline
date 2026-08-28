# Compile verification (#81) — baseline and control against zygarden

**Date:** 2026-08-28
**Gate for:** Task 6 of the #81 plan — the committed runner
(`ci/compile-native-output.mjs`) compiles real emitted output, and demonstrably
fails on output that does not compile.
**Verdict:** PASS — the runner both passed against real zygarden output and
failed against deliberately broken output, quoting the exact historical
`unaryMinus` defect.

## Why this run exists

Four e2e notes claimed nothing could be compiled. Both compilers are in fact
available (`swiftc` throughout; `kotlinc` since 2026-08-27), so the ceiling on
what an e2e run asserts was lower than it needed to be. This run establishes the
new ceiling and, more importantly, that the check can fail.

## Harness

Reused at
`/private/tmp/claude-501/-Users-jordansstudio-Dev-throughline/395cf4ed-9e55-4c18-a73d-e9980db4545c/scratchpad/e2e`
(a prior session's harness, still alive) — not rebuilt.

- **Style Dictionary:** 4.4.0, installed in the harness directory.
- **Source:** the 15 zygarden JSON files, light + mobile axes (the build drops
  any filename containing `desktop` or `dark`).
- **Module under test:** reached via
  `<harness>/lib/{dtcg,native-literal,sd-native}.mjs` symlinked into this
  checkout's `scripts/lib/`. Not `scripts/lib`, which `build.mjs` never reads —
  the no-op #73 was filed over.
- **Branch:** `feat/81-compile-verification` at `4dd004f`.

## Procedure

### Step 1 — build zygarden

```
$ H=/private/tmp/claude-501/-Users-jordansstudio-Dev-throughline/395cf4ed-9e55-4c18-a73d-e9980db4545c/scratchpad/e2e
$ cd "$H" && node build.mjs ../tokens out-81-baseline
swift
✔︎ out-81-baseline/Tokens.swift

kt
✔︎ out-81-baseline/Tokens.kt
---exit=0---
$ ls out-81-baseline
Tokens.kt
Tokens.swift
```

### Step 2 — declaration counts

```
$ grep -c '^  val ' "$H/out-81-baseline/Tokens.kt"
208
$ grep -c 'public static let' "$H/out-81-baseline/Tokens.swift"
195
```

### Step 3 — baseline compile

```
$ cd /Users/jordansstudio/Dev/throughline
$ node ci/compile-native-output.mjs "$H/out-81-baseline"; echo "exit=$?"
compile-native-output — do the emitted native tokens build?

  [PASS] kotlin: typechecked to bytecode
  [PASS] swift: parsed only (UIKit unavailable; -typecheck impossible)

  Kotlin is typechecked to bytecode; Swift is parsed only. swiftc -typecheck
  cannot run here: Tokens.swift imports UIKit, which is unavailable on the
  macOS command line. Swift syntax is asserted; Swift types are not.
exit=0
```

### Step 4 — the control, which must fail

```
$ mkdir -p /tmp/tl-control
$ cat > /tmp/tl-control/Tokens.kt <<'EOF'
package com.zygarden.tokens
import androidx.compose.ui.unit.*
object Tokens {
  val letterSpacingTight = -0.03.em
}
EOF
$ node ci/compile-native-output.mjs /tmp/tl-control --allow-missing; echo "exit=$?"
compile-native-output — do the emitted native tokens build?

  [FAIL] kotlin: /tmp/tl-control/Tokens.kt:4:28: error: unresolved reference 'unaryMinus' for operator '-'.
  val letterSpacingTight = -0.03.em
                           ^
  [----] swift: Tokens.swift not present

  Kotlin is typechecked to bytecode; Swift is parsed only. swiftc -typecheck
  cannot run here: Tokens.swift imports UIKit, which is unavailable on the
  macOS command line. Swift syntax is asserted; Swift types are not.
exit=1
```

### Step 5 — the control's fixed form

```
$ sed -i '' 's/-0\.03\.em/(-0.03).em/' /tmp/tl-control/Tokens.kt
$ node ci/compile-native-output.mjs /tmp/tl-control --allow-missing; echo "exit=$?"
compile-native-output — do the emitted native tokens build?

  [PASS] kotlin: typechecked to bytecode
  [----] swift: Tokens.swift not present

  Kotlin is typechecked to bytecode; Swift is parsed only. swiftc -typecheck
  cannot run here: Tokens.swift imports UIKit, which is unavailable on the
  macOS command line. Swift syntax is asserted; Swift types are not.
exit=0
```

## Prediction vs. actual

| Prediction | Actual |
|---|---|
| `Tokens.kt` compiles, exit 0, `Tokens.class` produced | [x] |
| `Tokens.swift` parses, exit 0 | [x] |
| 208 Kotlin declarations / 195 Swift | [x] |
| `-0.03.em` FAILS with `unresolved reference 'unaryMinus'` | [x] |
| `(-0.03).em` passes | [x] |

## What this run does NOT establish

- **Swift is parsed, never typechecked.** `Tokens.swift` imports `UIKit`, which
  is unavailable on the macOS command line, so `swiftc -typecheck` cannot run. A
  Swift type error — a wrong `UIColor` initialiser arity, an `Int` where
  `CGFloat` is required — passes this check. Only syntax is asserted.
- **The Kotlin stubs are not Compose.** They are six declarations with matching
  names and shapes (`Dp`, `TextUnit`, `.dp`, `.sp`, `.em`, `Color`). Real `Dp`
  is a value class and real `Color` wraps a `ULong`; nothing beyond "this
  expression resolves and typechecks" is covered.
- **Neither compiler validates semantics.** `2.dp` where `2.sp` was meant
  compiles. This closes the gap between "well-formed literal" and "compiles",
  which is narrower than "correct" — `tokens:validate-output` and the e2e diff
  remain the checks for whether the right thing was emitted.
- **The harness is scratch and unowned.** It can vanish; only the runner and
  stubs are repo assets. Spec §8.1 is what makes it rebuildable.
