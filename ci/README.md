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

## Run locally

```bash
node --test                  # all tests
node ci/validate-plugin.mjs  # guard plugin manifests
node ci/validate-skills.mjs  # guard skill/command/manifest-doc structure
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
