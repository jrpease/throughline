# Multi-agent adapters — Phase 2 (installer) design

**Date:** 2026-07-02
**Status:** Approved (design), pending implementation plan
**Builds on:** `docs/superpowers/specs/2026-07-02-multi-agent-adapters-design.md` (parent design), `docs/superpowers/plans/2026-07-02-multi-agent-adapters-phase2-handoff.md` (handoff)

## Problem

Phase 1 shipped a source-preserving generator that turns the canonical Claude-native plugin into committed Cursor / Codex / generic adapters under `adapters/<target>/`, with a CI drift guard. What's missing is distribution: a user on Cursor, Codex, or a generic AGENTS.md agent has no way to get those adapters — plus the `references/` and `scripts/` they point at — into their own project.

Phase 2 delivers `npx throughline init --target=…`, the installer that stamps a target's adapter tree and its runtime payload into the user's project non-destructively, plus a README rewrite that stops describing ThroughLine as only "a Claude Code plugin."

## Decisions (resolved from the handoff's open items)

1. **Distribution:** add a minimal root `package.json` with a `bin` entry so `npx throughline init` resolves. Zero dependencies — Node built-ins only, matching the existing dep-free `ci/` + `scripts/` tooling. This is the first thing in the repo that justifies a `package.json`; it stays minimal.
2. **Payload source:** the installer **copies the already-committed `adapters/<target>/` tree** rather than regenerating from source at install time. The committed tree is CI-drift-guarded, so a copy is deterministic and needs no source skills in the published package.
3. **MCP wiring:** write project-local config directly where safe (Cursor `.cursor/mcp.json`); for Codex, land the `codex-mcp.toml` snippet in the tree and **print copy-paste instructions** rather than mutating the user's global `~/.codex` config. Generic carries the MCP JSON inline in `AGENTS.md`.
4. **README rewrite:** done in this phase (it was requested and deferred pending the installer).

## Architecture

### `package.json` (new root file, zero deps)

```jsonc
{
  "name": "throughline",
  "version": "0.11.0",              // tracks .claude-plugin/plugin.json
  "type": "module",
  "bin": { "throughline": "scripts/install.mjs" },
  "files": ["adapters/", "references/", "scripts/", "README.md", "LICENSE"],
  "engines": { "node": ">=20" }
}
```

`scripts/install.mjs` carries a `#!/usr/bin/env node` shebang and an executable bit so `bin` works. Publishing to npm under the bare name is a later, separate step; this phase only makes the package `npx`-ready and locally testable via `npm pack` / `npx .`.

### Installer — `scripts/install.mjs`

Structured like the existing adapter modules: a **pure core** (exported functions, no I/O) + a **thin CLI** guarded by the `import.meta.url === pathToFileURL(process.argv[1]).href` idiom + a **colocated `.test.mjs`**.

**CLI:** `throughline init --target=cursor|codex|generic [--dir=.]`

- `--target` is required and validated against `{cursor, codex, generic}`; missing/unknown prints an error listing valid targets and exits non-zero.
- `--dir` defaults to `process.cwd()`.
- `--help` prints usage.
- The package root (source of `adapters/`, `references/`, `scripts/`) resolves from `import.meta.url` — `scripts/install.mjs` sits one level under the package root.

**Behavior**, writing into `<dir>`:

1. **Copy the committed `adapters/<target>/` tree** to `<dir>/<same relative path>`, with two files handled specially (steps 3–4).
2. **Stage the runtime payload** the translated bodies reference (`baseDir` = `.throughline`):
   - `references/` → `<dir>/.throughline/references/`
   - `scripts/` → `<dir>/.throughline/scripts/`, **excluding `scripts/adapters/`** (build-time tooling, not a runtime dependency of the design-system skills). Colocated `*.test.mjs` under the copied runtime scripts are harmless and copied as-is.
3. **`AGENTS.md`** (present in codex + generic trees): non-destructive **delimited-block merge** using `<!-- throughline:start -->` … `<!-- throughline:end -->`.
   - No existing file → create it containing just the block.
   - Existing file containing the delimiters → replace everything between them (inclusive) with the fresh block.
   - Existing file without the delimiters → append the block after the existing content, separated by a blank line.
   - Idempotent: applying the block twice yields the same result as applying it once.
4. **`.cursor/mcp.json`** (present in cursor tree): **JSON-aware merge**.
   - Existing file → parse it and set `mcpServers["figma-console"]` to ours, preserving any other servers and top-level keys the user has.
   - Missing / unparseable-as-object → write ours.
   - Idempotent.
5. **MCP next-step output:** after copying, print the per-target next step. Cursor: nothing further (config written). Codex: instruct the user to add the contents of the copied `codex-mcp.toml` to their Codex `mcp_servers` config. Generic: point at the MCP JSON block already in `AGENTS.md`.
6. Print a summary: number of files written and where, plus the MCP next step.

**Idempotency overall:** all throughline-owned files (`.cursor/rules/…`, `prompts/…`, `.throughline/…`, `skills/…`, `commands/…`) are overwritten on each run; the two shared files (`AGENTS.md`, `.cursor/mcp.json`) merge. A second `init` into the same dir with the same target produces a byte-identical tree.

### Pure functions to factor out (for direct testing)

- `mergeAgentsBlock(existingOrUndefined, block) -> string` — the delimited-block logic (create / replace / append).
- `mergeMcpJson(existingOrUndefined, ourServersObject) -> string` — the JSON merge, returning serialized JSON.
- `resolveTarget(argv)` / arg parsing — small, but tested via the CLI-facing entry or a helper.
- A copy planner or the copy itself is exercised via the integration test rather than mocked.

## Testing — `scripts/install.test.mjs`

Run under `node --test` (already the CI command; auto-discovers `*.test.mjs`). Uses `node:test`, `node:assert/strict`, and `mkdtemp` under `os.tmpdir()`.

- **`mergeAgentsBlock`** — four cases: create (no file), replace-in-place (delimiters present), append (file without delimiters), and **double-apply == single-apply** (idempotence).
- **`mergeMcpJson`** — merging into an existing config preserves the user's other servers and top-level keys; missing file writes ours; double-apply is idempotent.
- **Integration (per target)** — install into a fresh temp dir and assert:
  - the expected convention files exist (`.cursor/rules/*.mdc` for cursor; `prompts/*.md` + `AGENTS.md` for codex; `skills/*/SKILL.md` + `AGENTS.md` for generic);
  - `.throughline/references/` and `.throughline/scripts/` are populated;
  - **no copied file contains `${CLAUDE_PLUGIN_ROOT}`** (the payload resolves post-install);
  - `scripts/adapters/` is **absent** from the staged payload;
  - a **second run produces a byte-identical tree** (idempotence end-to-end);
  - for codex/generic, `AGENTS.md` contains exactly one delimited throughline block.

## README rewrite

- Generalize the tagline / description away from "a Claude Code plugin" to a multi-tool design-system builder.
- Add an upfront **supported tools** list and per-tool `###` getting-started subsections, mirroring the obra/superpowers structure:
  - Claude Code — plugin install (existing path).
  - Cursor / Codex / generic — `npx throughline init --target=…`, with the per-tool MCP note.
- Adjust Requirements / "connect to Figma" phrasings so they read for any supported tool.
- Update `scripts/README.md`'s adapters section to mention the installer (`scripts/install.mjs`) alongside the generator.

## Guardrails kept

- ESM only, zero new dependencies.
- Canonical `SKILL.md` / `commands/*.md` / `.mcp.json` / `plugin.json` stay hand-edited; adapters stay generated; the CI drift check (`generate.mjs --check`) keeps passing.
- The installer copies committed output — it does not regenerate — so it introduces no new drift surface.

## Deferred Phase-1 cosmetic cleanups (not in scope here)

The handoff lists minor cosmetic items (trailing double newline in emitted bodies, `firstSentence` abbreviation edge case, missing null guards in `applyPhrasing`/`tomlValue`, dead params). These are unreachable or purely cosmetic today and touch the generator, which would force an `adapters/` regeneration and enlarge this diff. They are explicitly **out of scope** for Phase 2 and left for a dedicated sweep.

## Non-goals

- Publishing to the npm registry (a later release step).
- Mutating the user's global agent config (`~/.codex`, etc.) — project-local only.
- Additional targets (Windsurf/Cline) — deferred until the three-target format is proven in the wild.
- `--dry-run` and other installer conveniences — YAGNI for the first cut.
