# Multi-agent adapters — design

**Date:** 2026-07-02
**Status:** Approved (design), pending implementation plan

## Problem

ThroughLine is authored as a Claude Code plugin: `skills/*/SKILL.md` (description-triggered), `commands/*.md` (slash commands), `references/*.md` (shared docs the skills read), `.mcp.json` (Figma MCP server), and Node `scripts/`. We want the same plugin usable from **Cursor**, **Codex**, and any **generic AGENTS.md-aware agent**, without hand-maintaining three divergent copies that drift as the plugin evolves.

The plugin is a tool users run *against their own project* — it builds their design system in their repo. In Claude Code it is a globally-installed plugin and `${CLAUDE_PLUGIN_ROOT}` resolves to the install dir so skills can read `references/` and `scripts/`. Other agents have no equivalent global-plugin install, so the skill bodies, references, scripts, and MCP config must be delivered into the user's project.

## What is already portable

- `.mcp.json` — MCP is a cross-vendor protocol; only the *config file location/format* differs per host.
- `scripts/` — plain Node, no Claude API surface. Works unmodified once its path is resolvable.

## The actual coupling (small and mechanical)

- **57** occurrences of `${CLAUDE_PLUGIN_ROOT}` across 11 skill/command files, all resolving to `references/*` or `scripts/*`.
- **~9** soft cross-references in prose ("run this skill", "invoke the `component-builder` skill"), only **2** of which name another skill.
- **2** stray Claude-Code-specific phrasings.

The skill *prose* is otherwise ~95% platform-neutral. So translation is a post-process, not a rewrite.

## Decisions

1. **Targets (first cut):** Cursor, Codex, generic AGENTS.md.
2. **Codex/generic surfacing:** prompts + a routing index. No platform there has description-triggering, so each skill becomes a manually-invoked prompt, and `AGENTS.md` carries a short "skill index" (name + when-to-use) that tells the agent which prompt to load.
3. **Source of truth:** the Claude-native `SKILL.md` / `commands/*.md` / `references/*` stay canonical and are **never edited** by the adapter tooling.
4. **Distribution:** an `npx` installer stamps generated adapters into the user's project (option 3 — installer *plus* self-adapters committed to this repo for dogfooding + CI drift guard). Path variables rewritten to a project-relative base at install time.
5. **Build phasing:** generator core first (prove the format), installer second (de-risk).

## Architecture

### Translation layer (shared, source-preserving)

A single module applies three rules to canonical content and never mutates source files:

- **Path rewrite:** `${CLAUDE_PLUGIN_ROOT}` → a per-target project-relative base (`.throughline/`), so `references/` and `scripts/` resolve after install.
- **Phrasing map:** a small, reviewable substitution table (~a dozen entries) mapping Claude idioms to each target's idiom — e.g. "the Skill tool" and "invoke the `X` skill" → "load the `X` prompt" (Codex) / "see the `X` rule" (Cursor); "the plugin README" → repo-relative path.
- **Frontmatter transform:** per target (see emitters).

### Generator + emitters

`scripts/adapters/generate.mjs` — a pure function plus a thin CLI, structured and tested exactly like the existing `scripts/... /validate-plugin.mjs` (pure core, CLI wrapper, colocated `.test.mjs`). It reads `skills/*/SKILL.md`, `commands/*.md`, `references/*`, `.mcp.json`, and `plugin.json`, then invokes three emitters that share the translation layer:

- **Cursor** →
  - `.cursor/rules/<name>.mdc` per skill. Frontmatter `{ description: <skill description>, alwaysApply: false }` — description-triggered "agent-requested" rules, the near-1:1 map to Claude skills.
  - `.cursor/commands/<name>.md` per command.
  - `.cursor/mcp.json` (same server shape as `.mcp.json`).
- **Codex** →
  - `AGENTS.md` containing a **routing index**: one line per skill (`name — when-to-use`, derived from the skill's `description`).
  - `prompts/<name>.md` per skill (full translated body).
  - commands emitted as prompts.
  - a Codex MCP config snippet (TOML `mcp_servers`) plus install note.
- **Generic** →
  - `AGENTS.md` routing index (same as Codex).
  - a plain `skills/` markdown tree (translated bodies).
  - copied `references/` and `scripts/`.

### CI drift guard

Generate this repo's *own* adapters and commit them. Add `scripts/adapters/generate.test.mjs` that regenerates and asserts byte-equality against the committed output — the same pattern as `validate-plugin.test.mjs`. Any PR that edits a skill must regenerate cleanly or CI fails. This is the mechanism that keeps three targets from silently drifting from the canonical source.

### Installer (phase 2)

`npx throughline init --target=cursor|codex|generic`:
- wraps the generator,
- copies output + `references/` + `scripts/` into the user's project under `.throughline/` and the target's conventional locations,
- is idempotent (safe to re-run),
- **non-destructive** for an existing `AGENTS.md`: appends/updates a delimited `<!-- throughline:start -->…<!-- throughline:end -->` block rather than clobbering the file.

## Phasing

- **Phase 1 — prove the format:** translation layer, generator, three emitters, committed self-adapters, CI drift test. No installer.
- **Phase 2 — distribution:** `npx throughline init` wrapper, non-destructive project merge, docs.

## Non-goals

- Windsurf/Cline and other agents (more emitters) — deferred until the three-target format is proven.
- Any change to skill authoring workflow — `SKILL.md` stays the single hand-edited artifact.
- Translating MCP *server* behavior — only its per-host config representation.

## Testing

- `generate.test.mjs`: pure-function tests (path rewrite, phrasing map, frontmatter transform per target) + the drift assertion against committed self-adapters.
- Spot-check that a generated Cursor `.mdc` and Codex prompt for one representative skill (`token-builder`) contain no unresolved `${CLAUDE_PLUGIN_ROOT}` and no Claude-only idioms.

## Risks / open items

- **Installer merge into existing AGENTS.md** is the fiddliest part; the delimited-block approach is the mitigation, validated in phase 2.
- Target config formats (Cursor `.mdc` frontmatter fields, Codex prompt/MCP config paths) may evolve; the emitters isolate each target so a format change is a localized edit.
