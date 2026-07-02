# Multi-Agent Adapters — Phase 2 Handoff

> Start-here note for the next session. Phase 1 (the generator) is merged. Phase 2 is the `npx` installer plus the README rewrite that depends on it.

**Design spec:** `docs/superpowers/specs/2026-07-02-multi-agent-adapters-design.md`
**Phase 1 plan (done):** `docs/superpowers/plans/2026-07-02-multi-agent-adapters-phase1.md`

## What Phase 1 shipped

A source-preserving generator that turns the canonical Claude-native plugin into Cursor / Codex / generic adapters, with a CI drift guard. Nothing under `skills/`, `commands/`, `references/`, `.mcp.json`, or `plugin.json` was modified.

- `scripts/adapters/read-sources.mjs` — parses skills/commands frontmatter + `.mcp.json`/`plugin.json` into a model.
- `scripts/adapters/translate.mjs` — `${CLAUDE_PLUGIN_ROOT}` → `.throughline` rewrite + `PHRASING_RULES` (named cross-skill refs, `Claude Code`, bare `Claude`, "the plugin README") + `firstSentence`.
- `scripts/adapters/emit-cursor.mjs` / `emit-codex.mjs` / `emit-generic.mjs` — per-target emitters returning `{path, content}[]`.
- `scripts/adapters/generate.mjs` — orchestrator + CLI. Default writes `adapters/<target>/`; `--check` fails on drift **and orphans** (reverse-walk).
- `scripts/adapters/generate.test.mjs` — drift guard + portability invariants (no `CLAUDE_PLUGIN_ROOT` leak, no untranslated named-skill idiom, no codex prompt-name collision, orphan detection).
- Committed output: `adapters/cursor/` (17 files), `adapters/codex/` (18), `adapters/generic/` (17).
- CI: `.github/workflows/ci.yml` runs `node scripts/adapters/generate.mjs --check`.
- Docs: `scripts/README.md` "Multi-agent adapters" section — edit source + regenerate, never hand-edit `adapters/`.

**Regenerate after any skill/command/mcp edit:** `node scripts/adapters/generate.mjs` (CI enforces sync).

## Phase 2 goal — the installer

`npx throughline init --target=cursor|codex|generic` that stamps the adapters into a user's own project. Per the design spec:

- Wraps the generator (or copies the committed `adapters/<target>/` tree).
- Copies the target files into the user's project at conventional locations (`.cursor/…`, `AGENTS.md`, `prompts/…`).
- **Also stages the runtime payload** the adapters point at: the bodies reference `.throughline/references/…` and `.throughline/scripts/…`, so the installer must copy `references/` → `.throughline/references/` and `scripts/` → `.throughline/scripts/` in the user's project. (Phase 1 deliberately did NOT snapshot these into `adapters/`, so this copy is the installer's job.)
- Idempotent (safe re-run).
- **Non-destructive `AGENTS.md` merge:** insert/update a delimited `<!-- throughline:start -->…<!-- throughline:end -->` block rather than clobbering an existing file. This is the fiddliest part — validate it carefully.

## Open decisions surfaced during Phase 1 (resolve in Phase 2)

1. **Where the runtime payload lives.** Either the installer copies `references/`+`scripts/` from the published package at install time (leaner repo), or the generator also stages a `.throughline/` payload into each `adapters/<target>/` tree (self-contained, but triples those files in git). Design spec assumed the former; confirm before building.
2. **Figma MCP wiring per tool.** Cursor: `.cursor/mcp.json` is already emitted (drop-in). Codex: we emit `codex-mcp.toml` as a *snippet* — the installer must merge it into the user's Codex config or print copy-paste instructions. Generic: documented as a JSON block in `AGENTS.md`. Decide how far the installer automates vs. instructs.
3. **README rewrite (was requested, deferred).** The README is still worded as "a Claude Code plugin." Once the installer lands, generalize it (tagline, badges, Requirements table, "connect Claude to Figma" phrasings) and add clean per-tool getting-started — mirror the obra/superpowers structure (upfront list of supported tools + per-tool `###` install subsections). Until the installer exists, per-tool instructions would be a clunky manual copy, which is why this was held.

## Deferred Minor cleanups (from the Phase 1 final review — sweep together)

None block anything; all are cosmetic or unreachable today.

- **Trailing double newline** in every emitted body (`${body}\n` while source bodies already end in `\n`) — spans emit-cursor/codex/generic. One consistent cross-emitter fix + regenerate.
- `firstSentence` naive on a leading abbreviation ("e.g."/"Dr.") — no current description triggers it.
- `applyPhrasing`/`tomlValue` have no invalid-`target`/null guards — unreachable from current data.
- `tomlValue` handles only one level of object nesting — current `.mcp.json` `env` renders valid TOML; only a 2-deep value would break.
- Dead `note` param in `emit-codex` `indexSection`; `ext` param misnomer in `emit-generic` `indexSection`; hardcoded "Figma access" prose in the generic MCP section.

## Guardrails to keep in Phase 2

- ESM only, no new deps, no `package.json` (matches existing `ci/`+`scripts/` tooling). The installer is the first thing that might justify a `package.json`/`bin` — decide deliberately.
- Canonical source stays hand-edited; adapters stay generated. CI drift check must keep passing.
