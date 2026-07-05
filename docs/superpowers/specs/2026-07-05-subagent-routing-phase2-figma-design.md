# Subagent routing — Phase 2 (Figma path) — design

**Date:** 2026-07-05
**Status:** Approved (design), pending implementation plan
**Parent spec:** `2026-07-04-subagent-driven-model-routing-design.md` (design of record; Decisions 4–7 govern the Figma surface)
**Handoff:** `docs/superpowers/plans/2026-07-05-subagent-routing-phase2-figma-handoff.md`

> This spec fills in the **Figma-specific mechanics** the parent spec designed only
> to the principle level. It does not restate the parent's decisions — it makes them
> concrete. Phase 1 (merged, on `main`) proved the routing; Phase 2's risk lives in
> these mechanics.

## Goal

Prove "plan deep, build cheap" on the **Figma authoring surface** — the novel, risky
core — by introducing the planner/executor split for Figma and migrating the first
Figma-authoring skill (`component-builder`) onto it.

## Scope

- **Build** the shared Figma machinery: `agents/architect.md`, `agents/figma-executor.md`,
  reviewer visual-mode wiring, the named-frame/finalize protocol in
  `references/figma-scripting.md`, `references/agent-routing.md` row fleshing, and the
  `references/sync-adapters.md` reframe.
- **Migrate `component-builder` only.** Dogfood one real component end-to-end, then stop.
- **Defer** `token-builder` and `token-sheet-builder` to a follow-up cycle once the
  pattern is proven on the richest surface (variant matrices, slots, composites).

## Locked decisions (from the brainstorm)

1. **Split shape — plan-set-once, build-each.** One deep `architect` dispatch plans the
   whole component set upfront and emits one transcription-grade spec. Then one
   `figma-executor` dispatch **per component**, sequential and bridge-locked, each
   screenshot-verifying itself. Deep tier paid once; cheap tier does the long tail.
   Preserves the existing checkpoint-after-each-component rhythm and gives per-component
   failure recovery.

2. **Serialization — prose discipline + existing preflight.** The orchestrator dispatches
   Figma-touching subagents strictly sequentially (architect-read → each executor-build →
   each reviewer-visual), awaiting each before the next, and every Figma dispatch runs the
   `figma_get_status` liveness preflight already documented in `figma-scripting.md`. No new
   lock artifact. Consistent with the whole plugin's prescriptive-prose model and the parent
   spec's accepted reliance on the orchestrator honoring the reference.

3. **Verify labor — executor structural, reviewer design.** The `figma-executor` owns the
   `create → screenshot → analyze → iterate` loop (max ~3) for **structural** correctness
   only. The `reviewer` owns a separate **design-quality** pass with its own fresh
   screenshot of the finalized component (preserves reviewer independence). One extra
   screenshot per component; buys an independent gate.

4. **Finalize — build-verify-then-replace.** The executor always builds into a distinct
   named working frame, screenshot-verifies it green, and **only then** replaces any
   existing same-named component and renames the working frame to the real name. The live
   component is never touched until a verified replacement exists.

## Architecture

### `agents/architect.md` (new)

- **Tier** `deep`, **concurrency 1** (reads the bridge). `model: inherit`.
- **Tools:** `Read` + figma-console **read-only** (`figma_get_status`, `figma_reconnect`,
  `figma_get_variables`, `figma_search_components`, `figma_get_styles`, screenshot). No
  write tools, no `figma_execute`.
- **Contract:** reads existing Figma state (tokens, styles, already-built atoms) plus the
  skill's brainstormed set, then emits a **transcription-grade spec addressed in stable
  identifiers only** — component names, page names, token/variable names, style names,
  **never nodeIds** (they go stale across sessions). Per component the spec carries: the
  variant matrix (existing layout law — variants are rows, states are columns), the slot
  contract, token/style bindings by name, dependency order (atoms first), the target
  component name, and the working-frame name. Returns the spec as its message (data, not
  human prose).
- **Anti-drift:** the agent body holds the **role + output-format contract only**.
  Component anatomy/standards stay in `references/figma-component-standards.md`; the spec
  references them.

### `agents/figma-executor.md` (new)

- **Tier** `fast`→`balanced`, **defaulting to `balanced` for a real component-set build**
  (dogfood-validated — see below); `fast` only for trivial mechanical ops. **Concurrency 1
  (bridge-locked)**. `model: inherit`.
- **Tools:** `Read` + figma-console (`figma_get_status`, `figma_reconnect`,
  `figma_search_components`, `figma_get_variables`, `figma_execute`, screenshot,
  `figma_get_selection`). No `Write`/`Edit` — it writes to Figma, not disk.
- **Contract (per component):**
  1. Preflight `figma_get_status` (reconnect / reap stale per `figma-scripting.md`).
  2. **Resolve names → nodeIds at run time** via `figma_search_components` / find-by-name
     from the spec's stable identifiers.
  3. Build into a **named working frame** (`WIP: <ComponentName>`), having read
     `figma-scripting.md` first (resize axis-lock trap, dynamic-page async setters, WRAP-grid
     timeouts).
  4. **Structural self-verify via programmatic read-back** (create → read-back → screenshot
     → iterate, max ~3). A screenshot alone is **insufficient** — 10 tone-colored frames
     look identical to 10 real variants — so assert `node.type === 'COMPONENT_SET'` (never
     `'FRAME'`), child count matches the matrix with every child a `'COMPONENT'`,
     `variantGroupProperties` names the axes, and ≥2 variants show fills/strokes/radius
     bound to variables with the expected `clipsContent`. Screenshot is a secondary check.
  5. **Finalize** = build-verify-then-replace (see protocol below), **then reap leftover
     `WIP:`/orphan artifacts** so exactly one finalized component and zero `WIP:` debris
     remain.
  6. Return `DONE` / `DONE_WITH_CONCERNS` / `BLOCKED` (naming the gap). A `BLOCKED`
     executor is re-dispatched **one tier up** per `agent-routing.md`, never retried
     unchanged.

### Reviewer visual mode (wire the Phase-1 stub)

`agents/reviewer.md` already carries a Figma-visual mode stub. Phase 2 wires it:

- **Add tools:** figma-console `figma_get_status`, `figma_search_components`, screenshot.
- **Labor:** the reviewer takes its **own fresh screenshot** of the *finalized* component
  and analyzes alignment, spacing, proportion, and spec fidelity, returning
  `approved` / `changes-requested`. Independent of the executor's structural pass.

### Named-frame + finalize protocol (`references/figma-scripting.md`)

Domain mechanics live in the shared Figma reference (keeps the agents thin), referenced by
both `figma-executor.md` and `component-builder`:

- The executor **always** builds into a distinct working frame `WIP: <ComponentName>`.
- It screenshot-verifies that frame green **before touching anything real**.
- **Only then:** remove/replace any existing same-named component, and rename the working
  frame's component set to the real name.
- **On failure / BLOCKED:** the WIP frame is left intact and named; the existing real
  component is **never touched**. A dead executor leaves an obvious, named, resumable
  artifact — not a corrupted component. A resumed run finds the WIP frame by name.

### `component-builder` migration

Reframe today's Step 3 note (*"sequential — Figma authoring, no subagents"*) into the
**self-degrading conditional idiom** proven in `token-sync-layer` Step 3:

> If your host supports subagent dispatch, plan the whole set with one architect dispatch,
> then build each component with a figma-executor dispatch sequentially — preflight
> `figma_get_status`, never two Figma subagents live at once — and gate each with a reviewer
> visual pass per `references/agent-routing.md`. Otherwise build each component inline
> sequentially, as before.

Names **no Claude-only product** (so the `Claude Code`→target phrasing rule can't corrupt
the generated adapters). The **human checkpoint after each component is preserved** — a
between-stage gate; subagents run continuously *within* a component, per parent Decision 7.

### Reference updates

- **`references/agent-routing.md`:** flesh out the `architect` and `figma-executor` rows,
  dropping the "(Phase 2)" tentative markers. Concurrency/escalation policy already present.
- **`references/sync-adapters.md`:** the *"Figma-authoring skills don't parallelize"* line
  becomes *"Figma work uses sequential subagents — routing yes, parallel never."*

## Cross-host degradation

Same idiom Phase 1 proved: the migrated dispatch prose degrades to inline single-model
execution on hosts without subagent dispatch (Codex, generic AGENTS.md), and names no
Claude-only product, so no phrasing-map entry is needed. `agents/` is not read by
`scripts/adapters/generate.mjs`, so adding agents causes no adapter drift.

## Testing / verification

- `node --test` → all green.
- `node scripts/adapters/generate.mjs --check` → adapters in sync (agents ignored).
- `node ci/validate-skills.mjs` → skills + commands + agents OK; new agents pass
  `validateAgent` (`model: inherit`, no concrete model name).
- `node ci/validate-plugin.mjs` → OK.
- Extend `generate.test.mjs` to spot-check the generated Codex `component-builder` prompt
  carries the inline-fallback branch and the rewritten `agent-routing.md` path with no
  `CLAUDE_PLUGIN_ROOT` leak (mirrors the Phase-1 token-sync check).
- **Dogfood** (bridge connected): build one real component through the migrated
  `component-builder`; confirm the architect dispatches on `deep`, the figma-executor on a
  cheaper tier, the Figma lane never runs two subagents at once, and a forced executor
  failure leaves a named WIP frame with the real component untouched.

## Dogfood validation (2026-07-05)

Ran the full architect→figma-executor→reviewer flow live against a mature file ("Brand
Studio": 159 variables, 12 collections, 12 existing component sets), building a net-new
`Badge` atom. Tiers were emulated via `general-purpose` subagents dispatched with explicit
models (architect=deep, figma-executor=fast/balanced, reviewer=balanced), since the
`agents/` here aren't registered as dispatchable subagent *types*. Full write-up:
`.superpowers/sdd/dogfood-findings.md`.

**Validated:** tier routing dispatches correctly; **subagents can drive the figma-console
bridge**; concurrency-1 holds when the orchestrator serializes Figma-touching subagents;
the stable-identifier spec is reusable across runs; and — the headline — the **independent
reviewer + orchestrator read-back caught a fabricated "DONE"**, proving the two-stage gate's
value ("don't trust the report").

**Tier calibration (drove the refinements above):**

| Tier | Model | Tool calls | Wall-clock | Outcome |
|---|---|---|---|---|
| `fast` | Haiku | 67 | ~8.6 min | ❌ built plain FRAMEs, falsely-green self-report, left orphans — output unusable |
| `balanced` | Sonnet | 39 | ~8.5 min | ✅ real `COMPONENT_SET`, read-back-verified, reaped prior orphans, resolved 3 naming-drift gaps |

The fast tier used **more** turns for the same wall-clock and produced throwaway work — a
live confirmation of the spec-completeness gate's "turn count beats token price." Hence:
figma-executor **defaults to `balanced`** for a real component build, the self-verify is a
mandatory **`COMPONENT_SET` read-back** (screenshot secondary), and finalize **reaps `WIP:`
debris**. The named-WIP recovery behavior was observed organically (failed fast-tier
attempts left named, resumable frames), so the planned forced-failure test was unnecessary.

## Environment dependency

Phase 2 cannot be dogfooded without the **Figma Console MCP bridge connected** (desktop
plugin running). Confirm `figma_get_status` (run `throughline:figma-environment-setup` if
needed) before any Figma dispatch.

## Non-goals

- Migrating `token-builder` / `token-sheet-builder` (follow-up cycle).
- A new lock artifact for serialization (prose + preflight is the decision).
- Parallel Figma execution (the bridge forbids it).
- Routing observability / telemetry (deferred by the parent spec).
- Hardcoding any concrete model name anywhere.

## Risks / open items

- **Agent/skill drift** — agents hold role + verification contract only; Figma anatomy and
  the named-frame protocol live in references, not in the agents.
- **Serialization depends on the orchestrator honoring the prose** — the same reliance the
  parent spec accepts; the preflight `figma_get_status` is the concrete guard against a
  second live bridge instance.
- **Bridge disconnect mid-flow** — surfaces as a `figma-executor` failure that leaves a
  resumable named WIP frame; the preflight catches a down bridge before dispatch.
