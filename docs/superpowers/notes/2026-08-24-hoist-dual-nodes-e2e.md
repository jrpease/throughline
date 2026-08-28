# hoist-dual-nodes (#55) — e2e proof that nothing moved

**Date:** 2026-08-24
**Gate for:** Task 3 of the `#55` plan (`hoistDualNodes`: collision throw, `$type`
carry-through)
**Verdict:** PASS against the stated bar — `diff -r` between a build at this
branch's HEAD and a build at `main` (pre-`#55`) is **empty**. All eight output
files (four per build) show `decls=195 broken=0`. The assertion is narrower
than a validator run: this proves *byte-identical output*, nothing more.

## Why this run exists

Tasks 1 and 2 fixed two defects in `hoistDualNodes` — a silent token loss on a
name collision, and a hoisted child losing its `$type`. Neither defect is
authored anywhere in zygarden's real token source (see below), so the purpose
of this run is not to exercise the fixes. It is to prove the fixes did not
perturb output on a real, unrelated source — i.e. that Tasks 1 and 2 changed
behaviour only on the paths they targeted.

## Harness

Reused, not rebuilt — it already existed from the prior native-config e2e work
and was live at the time this task started:

```
/private/tmp/claude-501/-Users-jordansstudio-Dev-throughline/395cf4ed-9e55-4c18-a73d-e9980db4545c/scratchpad/e2e
```

- **Style Dictionary:** `4.4.0`, installed in the scratch directory.
- **`scripts/lib`:** a symlink, swapped between the two builds below — not a
  copy — so each build exercises the module's actual source at that commit,
  not a snapshot.
- **Source:** the same 15 zygarden JSON files already extracted into
  `tokens/` from prior work (`libs/shared/util-tokens/src/tokens/`,
  `feature/apply-brandguide-styles`). Not re-extracted; the zygarden repo was
  not touched.
- **`build.mjs`:** the harness's existing script — `ios-swift` and
  `android-kotlin`, light/dark, mobile viewport axis,
  `packageName: 'com.zygarden.tokens'` for Kotlin. Unmodified.

## Do not copy this procedure forward (added 2026-08-27, issue #73)

The steps below were correct **for the harness as it existed when this run
executed**, and stopped being correct about three hours later. Anyone
reaching for them as a template will get a verification that cannot fail.

The harness has two symlink surfaces. `<harness>/scripts/lib` is a
directory-level symlink; `<harness>/lib/` is three per-file symlinks
(`dtcg.mjs`, `native-literal.mjs`, `sd-native.mjs`). Which one matters
depends on which `build.mjs` is present, and `build.mjs` was rewritten on
2026-08-24 at 13:46 — the same minute `<harness>/lib/` was created. The
rewritten script imports `./lib/sd-native.mjs` and never reads
`scripts/lib`.

| Run | Built at | Import surface | Swapping `scripts/lib` |
|-----|----------|----------------|------------------------|
| This one (`#55`) | 10:22 | `scripts/lib` — `lib/` did not exist yet | works |
| `#60` | 17:59 | `./lib/` | no-op |
| `#52` and later | — | `./lib/` | no-op |

**This run's verdict stands.** `<harness>/lib/` was created at 13:46, three
hours and 24 minutes after `out-55/` was built, so a 10:22 build importing
`./lib/sd-native.mjs` would have failed with `ERR_MODULE_NOT_FOUND`. Both
builds recorded `EXIT:0`, so the import resolved against the only surface
that existed — the one the swap retargeted. The empty diff is a true
negative.

`#60`'s verdict also stands, on separate evidence: alongside its zygarden
build it ran synthetic fixtures that reach the defect, and those *did* move
across the swap (`20px` → `20.00.dp`, `1.5` → `1.50.dp`). A no-op swap
could not have produced that.

**The durable lesson.** For both runs the defect is unreachable in
zygarden's source, so an empty diff was the predicted result under a sound
procedure *and* under a broken one. The two hypotheses were observationally
identical, and no amount of re-running the same comparison could separate
them — only a baseline assertion can. Before trusting a diff, prove the
baseline is what you think it is: check that the "before" build actually
exhibits the pre-fix behaviour. `#52`'s run did this and caught the stale
procedure before it produced a false result; see
`2026-08-26-unitless-dimension-e2e.md`.

## Procedure

1. `scripts/lib` symlinked to this branch's live tree
   (`/Users/jordansstudio/Dev/throughline/scripts/lib`, HEAD =
   `9ef5230`), built, output moved to `out-55/`.
2. `git worktree add /tmp/tl-main main` — a throwaway worktree at `main`
   (pre-`#55`), to get the un-patched module without touching this branch's
   checkout.
3. `scripts/lib` re-pointed to `/tmp/tl-main/scripts/lib`, built, output moved
   to `out-main/`.
4. `diff -r out-main out-55`.
5. `git worktree remove /tmp/tl-main`.

```
$ node build.mjs        # HEAD (fix/55-hoist-dual-nodes)
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
EXIT:0

$ mv out out-55

$ git worktree add /tmp/tl-main main
Preparing worktree (checking out 'main')
HEAD is now at 698a236 fix: native token output that does not compile — quote string values, reject invalid literals (#53) (#56)

$ ln -sfn /tmp/tl-main/scripts/lib scripts/lib
$ node build.mjs        # main (pre-#55)
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
EXIT:0

$ mv out out-main

$ diff -r out-main out-55
$ echo "DIFF_EXIT:$?"
DIFF_EXIT:0
```

`diff -r` produced no output and exited `0`: the two builds are byte-identical.

## Declaration / broken-symbol counts

```
out-55/dark/ios/Tokens.swift    decls=195 broken=0
out-55/light/ios/Tokens.swift   decls=195 broken=0
out-55/dark/android/Tokens.kt   decls=195 broken=0
out-55/light/android/Tokens.kt  decls=195 broken=0
out-main/dark/ios/Tokens.swift   decls=195 broken=0
out-main/light/ios/Tokens.swift  decls=195 broken=0
out-main/dark/android/Tokens.kt  decls=195 broken=0
out-main/light/android/Tokens.kt decls=195 broken=0
```

All eight files: `decls=195 broken=0`. Matches the prior recorded count for
this source, and matches identically between HEAD and `main`.

## What this run does NOT establish

- **Neither defect is reachable from this source.** Zygarden's `text.*`
  children each carry an explicit `$type: dimension` and no camel-joined name
  collides, so this e2e run does **not** validate either fix — synthetic unit
  fixtures do (see Tasks 1 and 2's test suites). Proving *nothing moved* is
  this run's entire job, and is the only thing it claims to have proven.
- **Nothing was compiled in this run.** No `swiftc` or `kotlinc` ran.
  `decls`/`broken` are `grep`-based counts, not a compiler's verdict, and
  `diff -r` establishes byte-identity, not correctness of what those bytes
  mean. `swiftc` was nonetheless available at `/usr/bin/swiftc` via the Xcode
  command line tools when this run happened, and went unused — the Swift
  half of this limitation was self-imposed. `kotlinc` was not available: it
  was installed on 2026-08-27, after this run. Later runs compile both, via
  `ci/compile-native-output.mjs` (#81).
- **The two widenings recorded in the spec (`#52` and `#51`) are unreachable
  in this source for the same reason.** `#52` (untyped unitless literal child
  under a `dimension` dual node emitting `dp`) and `#51` (untyped `fontSize`
  child under a `dimension` dual node emitting `dp` instead of `sp`) both
  require an untyped hoisted child — zygarden's `text.*` children are always
  explicitly typed, so neither widening fires here. This run says nothing
  about them one way or the other.
- **No validator (`tokens:validate-output`) was run this time.** The prior
  `2026-08-21-native-config-e2e-results.md` run already established the
  validator's bar on this same source; this run's only new claim is
  byte-identity across the `#55` change, which a diff answers more directly
  than re-running the validator would.
