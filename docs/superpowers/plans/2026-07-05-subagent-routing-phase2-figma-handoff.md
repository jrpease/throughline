# Subagent routing — Phase 2 (Figma path) handoff

> **For the next session.** This is a handoff, not a plan. Read it, then read the
> two source docs below, then start the Phase 2 spec→plan→build cycle. You have
> zero context from the session that wrote this — everything you need is here or
> linked.

## How to start

1. Read the parent spec: `docs/superpowers/specs/2026-07-04-subagent-driven-model-routing-design.md` — especially **Decisions 4–7** (Figma-lane lock, named working frame, two-mode reviewer, human gates) and the **Phasing → Phase 2** section. That spec is the design of record; this handoff does not restate it.
2. Read the Phase 1 plan for the conventions Phase 2 must match: `docs/superpowers/plans/2026-07-04-subagent-routing-phase1-token-sync.md`.
3. The Figma-specific mechanics below (named-frame protocol, screenshot-verify loop, name→nodeId resolution) were designed only to the *principle* level in the spec. **Brainstorm those into a concrete design first** (superpowers:brainstorming), then write the Phase 2 plan (superpowers:writing-plans), then execute it (superpowers:subagent-driven-development). Do not skip the brainstorm — Phase 2's risk lives in these mechanics, not in the routing (Phase 1 proved the routing).

## What Phase 1 already established (merged, on `main`)

Reuse these verbatim — do not reinvent them:

- **`agents/` directory, Claude-only.** Two role agents exist: `agents/code-executor.md` (fast, parallel-safe) and `agents/reviewer.md` (balanced; already carries a **Figma-visual mode stub** awaiting Phase 2 tool-wiring). Every agent is `model: inherit`.
- **`references/agent-routing.md`** — the `fast < balanced < deep` tier ladder, resolution/fallback, override, spec-completeness gate, escalation ladder, and Figma-lane concurrency note. Its roles table **already lists `architect` and `figma-executor` as Phase-2 rows** — flesh out their contracts, don't add new tiers.
- **CI guard:** `ci/validate-skills.mjs` `validateAgent` fails CI on any `agents/*.md` that isn't `model: inherit`. New Phase 2 agents must satisfy it. `validateAgentRouting` checks the reference names all three tiers.
- **Cross-host degradation = self-degrading conditional prose**, NOT phrasing-map entries. When you migrate a skill's dispatch, author it as *"if your host supports subagent dispatch, dispatch X per `agent-routing.md`; otherwise do the work inline"* and name **no Claude-only product** (so the `Claude Code`→target phrasing rule can't corrupt it). This is the proven, generator-safe idiom from `token-sync-layer` Step 3 — copy it.
- **Adapter drift guard:** any `skills/*/SKILL.md` edit requires `node scripts/adapters/generate.mjs` then commit; CI runs `--check`. `agents/` is not read by the generator (no drift from adding agents).

## Phase 2 goal

Prove "plan deep, build cheap" on the **Figma surface** — the novel, risky core. Introduce the planner/executor split for Figma authoring and migrate the first Figma-authoring skills onto it.

## What Phase 2 must build (from the spec, Phase 2 row)

- **`agents/architect.md`** — `deep` tier, concurrency 1. Plans a stage (Figma variant matrix, token architecture, slot contract, adapter strategy) and emits a **transcription-grade spec in stable identifiers** (component/page/token *names*, never nodeIds).
- **`agents/figma-executor.md`** — `fast`→`balanced`, concurrency **1 (bridge-locked)**. Resolves names→nodeIds at run time, builds, screenshot-verifies, finalizes.
- **Reviewer visual mode** — wire the Figma screenshot tools into `agents/reviewer.md`'s existing Figma-visual stub.
- **Migrate the first Figma-authoring skills** from "no subagents" to the architect→figma-executor split (sequential, routing yes / parallel never): start with **`component-builder`**, then **`token-builder`**. `token-sheet-builder` can follow or defer.
- **Reframe `references/sync-adapters.md`** — its "Figma-authoring skills don't parallelize" line becomes "Figma work uses sequential subagents — routing yes, parallel never."

## The hard Figma-specific design points — get these right (brainstorm targets)

1. **Single stateful bridge = whole-surface serialization.** The figma-console MCP is one live connection with global selection/current-page state. Concurrency 1 applies to the **entire Figma lane** — architect-reading-Figma, figma-executor-writing, and visual-review-screenshotting all share the one bridge and must serialize. Decide *how the orchestrator enforces* this (never two Figma-touching subagents live at once).
2. **nodeIds are session-specific and go stale.** The architect's spec MUST address elements by stable name; the figma-executor re-searches (`figma_search_components` / find-by-name) to resolve at run time. Design the handoff format.
3. **No git for Figma → partial-failure recovery.** A dead figma-executor leaves a half-built component. Design chosen in the spec: **build into a clearly-named working frame, screenshot-verify, finalize/rename only on success** — so a failure leaves an obvious, named, resumable artifact. Nail down the exact protocol (naming, verify criteria, finalize/swap step).
4. **Screenshot-verify loop.** The MCP mandates create → screenshot → analyze → iterate (max ~3). Decide how the figma-executor self-verifies vs. what the visual `reviewer` re-checks, to avoid double work.
5. **Tool grants.** figma-executor and reviewer-visual need the figma-console MCP tools (execute, screenshot, search). Decide the minimal `tools:` list per agent.

## Environment dependency

Phase 2 cannot be built or dogfooded without the **Figma Console MCP bridge connected** (the desktop plugin running). Run `throughline:figma-environment-setup` / confirm `figma_get_status` before any Figma dispatch. (Note: the bridge was connected during Phase 1's design session but is not a given in a fresh session.)

## Verification (same gates as Phase 1)

- `node --test` → all green (Phase 1 baseline: 120 passing)
- `node scripts/adapters/generate.mjs --check` → adapters in sync
- `node ci/validate-skills.mjs` → skills + commands + agents OK (new agents must pass `validateAgent`)
- `node ci/validate-plugin.mjs` → OK
- **Dogfood:** with the bridge connected, build one real component through the migrated `component-builder` and confirm the architect dispatches on `deep`, the figma-executor on a cheaper tier, the Figma lane never runs two subagents at once, and a forced failure leaves a named working frame.

## Deferred beyond Phase 2 (Phase 3)

Generalize the proven pattern to the remaining subagent-driven skills: `storybook-chromatic-builder`, `icon-system-builder`, `token-sheet-builder`, and the `component-pipeline` sequencer. Not Phase 2's problem.
