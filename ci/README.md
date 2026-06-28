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
```
