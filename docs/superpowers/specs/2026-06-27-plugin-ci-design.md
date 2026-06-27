# ThroughLine plugin CI — design

**Date:** 2026-06-27
**Status:** Approved (brainstorming) — ready for an implementation plan.
**Context:** Closes the "no plugin CI" carry-forward from the brownfield retrofit
effort (PR #12, spec §11). This is the repository's **first** GitHub Actions
workflow.

## Goal

A GitHub Actions workflow that runs on every pull request (and pushes to `main`)
and **fails the build** when the plugin's own structure is broken:

- a typo or invalid JSON in `.claude-plugin/plugin.json` or `marketplace.json`,
- a malformed, misnamed, or incomplete `SKILL.md` frontmatter,
- a missing command `description`,
- a regression in the existing `scripts/` test suite (43 tests that today run
  only on a contributor's machine).

It gives the existing tests teeth in CI and adds structural validators for the
plugin metadata. **Zero runtime dependencies, no `npm install` step** — this
matches the deliberate zero-dep ethos of the `scripts/` directory.

## Non-goals (YAGNI)

- A full machine-readable JSON Schema for `design-system.json` (explicitly
  declined — the prose schema in `references/manifest-schema.md` stays the source
  of truth).
- Markdown prose linting / spell-check.
- Validating that `${CLAUDE_PLUGIN_ROOT}/...` cross-references resolve, or that
  skills referenced by other skills exist. (Good future additions; out of scope
  for the first CI.)
- Reproducing B1/B2/B4 against a real Figma file (a separate carry-forward,
  unrelated to CI).

## File layout

A new top-level **`ci/`** directory, kept distinct from `scripts/`. This matters:
`scripts/` is "executable code copied verbatim into the user's repo" by
`token-crosswalk-builder` (it copies a specific named list, so nothing leaks, but
`scripts/README.md` frames the whole dir as an *install contract*). The CI
validators are **plugin-internal dev tooling** and never ship into a user's
project — so they live in their own directory to keep that boundary obvious.

```
ci/
  lib/
    frontmatter.mjs        # zero-dep frontmatter parser (pure)
  validate-plugin.mjs      # validates plugin.json + marketplace.json (lib + CLI)
  validate-plugin.test.mjs
  validate-skills.mjs      # validates skills/*/SKILL.md + commands/*.md (lib + CLI)
  validate-skills.test.mjs
.github/
  workflows/
    ci.yml
```

Each `.mjs` exports **pure functions** (input: strings / parsed objects; output:
a list of human-readable problems) plus a thin CLI entry that reads the real repo
files and calls those functions. This is the same lib / CLI / colocated-`.test.mjs`
shape the crosswalk scripts already use.

Bare `node --test` from the repo root discovers `*.test.mjs` recursively, so it
picks up both `ci/` and `scripts/` with no change to the test command. (Note: the
existing convention is bare `node --test` from root — **not** `node --test
scripts/`, which errors on Node ≥ 21.)

## Component: `ci/lib/frontmatter.mjs`

A minimal, dependency-free parser for the simple YAML frontmatter these files use
(single-line `key: value` pairs, values optionally wrapped in single or double
quotes — which is all the current skills/commands use).

- `parseFrontmatter(text)` → `{ data, body }`.
  - Throws if the text does not begin with a `---` line and contain a closing
    `---` line.
  - Parses each line of the block as `key: value`, splitting on the **first**
    colon; trims surrounding whitespace; strips a single matching pair of
    wrapping quotes from the value.
  - `data` is a plain object of string keys → string values; `body` is the
    remaining markdown.
- Explicitly does **not** attempt full YAML (no nested maps, lists, multi-line
  scalars). The current corpus has none; if a future skill needs richer
  frontmatter, the parser fails loudly rather than silently mis-parsing.

## Component: `ci/validate-plugin.mjs`

Pure function `validatePlugin({ pluginJson, marketplaceJson, parseError })` →
`string[]` of problems. The CLI reads the two files, reports a JSON parse error as
a single problem, and otherwise passes the parsed objects in.

Checks:

- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` both exist
  and are valid JSON. (A read/parse failure is itself a reported problem.)
- `plugin.json`:
  - has non-empty string `name`, `description`;
  - has `version` matching a semver pattern (`MAJOR.MINOR.PATCH`, optional
    pre-release / build metadata);
  - has an `author` (object or string);
  - if `keywords` is present, it is an array of strings.
- `marketplace.json`:
  - has non-empty string `name`;
  - has an `owner`;
  - has a non-empty `plugins` array, each entry having non-empty string `name`,
    `source`, and `description`;
  - at least one plugin entry's `name` equals `plugin.json`'s `name`.

## Component: `ci/validate-skills.mjs`

Two pure functions over already-read file contents:

- `validateSkill({ dirName, source })` → `string[]`:
  - frontmatter block present and parseable;
  - `name` present and non-empty;
  - **`name` exactly equals `dirName`** — the highest-value check, because a
    mismatch silently breaks skill discovery in Claude Code;
  - `description` present, non-empty, and within a generous length cap
    (`MAX_DESCRIPTION = 1024` chars — comfortably above the current longest
    description; a single named constant so the limit is easy to find/adjust);
  - extra frontmatter keys are **allowed** (e.g. `model:`, `allowed-tools:`) — the
    validator never fails on unknown keys.
- `validateCommand({ fileName, source })` → `string[]`:
  - frontmatter block present and parseable;
  - `description` present and non-empty.
  - No `name` requirement (a command's name derives from its filename).

The CLI enumerates `skills/*/SKILL.md` and `commands/*.md`, runs the matching
function on each, and aggregates problems. It also flags a `skills/<dir>` that has
no `SKILL.md`.

## Optional included check: manifest-doc parses

A small extra that honors the "manifest schema" wording of the carry-forward
without authoring a JSON Schema: extract the first fenced ```` ```json ```` block
from `references/manifest-schema.md`, assert it parses, and assert its
`schemaVersion` is an integer. Lives as a pure helper + a check in the skills/docs
validator CLI (or its own tiny `validate-manifest-doc` function — implementation
detail for the plan). ~5 lines of logic; catches a broken example in the de-facto
schema doc.

## Error handling & output

Every validator:

- collects **all** problems rather than stopping at the first,
- prints them grouped by file with a clear `✗ <file>: <problem>` style,
- exits `1` if there is at least one problem,
- otherwise prints a one-line `✓` summary (e.g. `✓ 12 skills, 4 commands OK`) and
  exits `0`.

This mirrors the reporting style of the existing `scripts/` CLIs.

## The workflow: `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: node --test
      - run: node ci/validate-plugin.mjs
      - run: node ci/validate-skills.mjs
```

- `pull_request` covers the team's branch-and-PR flow (PR #12 style); `push` to
  `main` guards the trunk. This avoids double-runs on PR branches.
- Node 20 (LTS) — bare `node --test` discovery is stable; no `node --test
  scripts/` issue.
- No `npm install` — everything is zero-dep stdlib (`node:test`, `node:fs`,
  `node:path`, `node:assert`).
- `node --test` runs the existing 43 tests **plus** the new validator logic tests;
  the two `node ci/validate-*.mjs` steps guard the real repo files.

## Testing strategy (TDD)

For the parser and each validator, write `*.test.mjs` first using crafted inputs:
one valid case and one case per failure mode (missing key, wrong type, bad semver,
name/dir mismatch, over-length description, missing frontmatter, invalid JSON,
etc.). Then implement until green. The CLIs reading real files are exercised in CI
against the actual repo, which is the live guard.

## Documentation

Add a short `ci/README.md` (or a section) explaining: what each validator checks,
how to run them locally (`node ci/validate-plugin.mjs`, `node ci/validate-skills.mjs`,
`node --test`), and that these are plugin-internal — **not** copied into user
repos. Update the top-level `CHANGELOG.md` `[Unreleased]` section.
