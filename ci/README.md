# `ci/` — plugin self-validation

Plugin-internal validators run by GitHub Actions (`.github/workflows/ci.yml`).
**Not** copied into user repos — unlike `scripts/`, these guard *this plugin's*
own structure. Zero dependencies; stdlib only.

## What runs in CI

1. `node --test` — the full test suite (these validators' logic tests + the
   `scripts/` suite). Run with **bare `node --test` from the repo root**, never
   `node --test ci/` (pathed invocation errors on Node ≥21).
2. `node ci/validate-plugin.mjs` — `.claude-plugin/plugin.json` and
   `marketplace.json`: valid JSON, required fields, semver version, and that a
   marketplace entry's `name` matches `plugin.json`.
3. `node ci/validate-skills.mjs` — every `skills/*/SKILL.md` has `name`
   (matching its directory) and a `description` (≤ 1024 chars); every
   `commands/*.md` has a `description`; and the `references/manifest-schema.md`
   example JSON parses with an integer `schemaVersion`.
4. `node ci/validate-install-sets.mjs` — every documented install set carries
   every file its scripts import, followed transitively. Reads the lists from
   the docs themselves: the **Documentation scripts — install as a set** table in
   `scripts/README.md` and each `src` → `dest` copy line in `skills/*/SKILL.md`.
   Also checks the file and npm-script counts that prose restates about the docs
   set. Every other gate runs scripts in place, where every sibling exists, so a
   list missing a file stays green without this one.

## Run locally

```bash
node --test                  # all tests
node ci/validate-plugin.mjs  # guard plugin manifests
node ci/validate-skills.mjs  # guard skill/command/manifest-doc structure
node ci/validate-install-sets.mjs  # guard install lists against missing imports
node ci/compile-native-output.mjs <dir>  # compile generated Tokens.kt/.swift (not a CI gate)
node ci/compile-native-output.mjs <dir> --allow-missing  # tolerate one absent toolchain
```

`--allow-missing` downgrades a compiler that is not on `PATH` from a failure to
a skip. It does not excuse a run in which *nothing* compiled: with neither
toolchain present the run still exits 1, because a green run that verified
nothing is the vacuous pass this module exists to prevent.

## Compile verification is not a CI gate

`ci/compile-native-output.mjs` compiles generated native token output —
`kotlinc` typechecks `Tokens.kt` to bytecode against `ci/stubs/*.kt`; `swiftc
-parse` checks `Tokens.swift` syntax only, because it imports `UIKit` and
`-typecheck` must resolve imports where `-parse` need not.

It runs at e2e time, deliberately, and `.github/workflows/` does not call it.

Producing `Tokens.kt` at all requires Style Dictionary, because `PLATFORMS` in
`scripts/lib/sd-native.mjs` targets SD's stock formatters — this repo owns the
transforms and the config, not the formatter. The repo also declares zero
dependencies and has no lockfile, and `ubuntu-latest` carries neither toolchain.
Gating would mean adding a dependency graph, a lockfile, a committed token
fixture, a JDK, and a Swift toolchain — in order to prove that output compiles
*under one pinned Style Dictionary version*, while the version a consumer
actually runs stays invisible to us either way. The e2e harness builds real
zygarden source, which is stronger evidence than that fixture would be.

Reopen this deliberately if the tradeoff changes. Do not let it drift.

This module's logic tests *do* run under `node --test`, like the validators above — but
never against a real compiler. The suite injects a fake environment, so it stays
green on a runner with neither toolchain installed. Only the CLI invocations
above reach `kotlinc` and `swiftc`.

## An e2e run that expects no change must prove it could see one

This is a hard rule (#77). When an e2e run's PASS condition is an absence — an
empty `diff -r`, zero warnings, `IDENTICAL`, unchanged counts — that result
counts only if the same run also exercised a case that **would have produced a
difference had the change been wrong**. Same harness, same session.

An absence cannot report on itself. A swapped symlink the build never reads,
the wrong commit checked out, a build reusing cached output: each of those
produces an empty diff too. A sound harness and a broken one predict the same
observation, so re-running the comparison cannot tell them apart.
`docs/superpowers/notes/2026-08-24-hoist-dual-nodes-e2e.md` has the worked case
(#55, #60, #73).

Any one of these satisfies the rule:

- **A fixture that reaches the defect,** built at both commits, which must
  differ across them. #60's synthetic fixtures moved `20px` → `20.00.dp`.
- **A baseline assertion.** Before trusting the diff, show the "before" build
  exhibits the pre-fix behaviour. #52's run did, and caught a swap that was a
  no-op (`docs/superpowers/notes/2026-08-26-unitless-dimension-e2e.md`).
- **A failing control.** For a check rather than a diff, feed it input it must
  reject and show that it rejects. #81 fed `ci/compile-native-output.mjs` a
  `Tokens.kt` it could not compile
  (`docs/superpowers/notes/2026-08-28-compile-verification-e2e.md`).

A plan that schedules such a run names its discriminating case in the same task.
The note records that case's output next to the empty result. **If the
discriminating case comes back clean too, the harness is broken, not the code
clean** — the verdict is not PASS until the harness is fixed and the run
repeated. A note with only the empty result records a belief, not a measurement.
