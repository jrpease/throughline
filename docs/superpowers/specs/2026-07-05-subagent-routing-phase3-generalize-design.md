# Subagent routing — Phase 3 (generalize) — design

**Date:** 2026-07-05
**Status:** Approved (design), pending implementation plan
**Parent spec:** `docs/superpowers/specs/2026-07-04-subagent-driven-model-routing-design.md` (design of record; Phase 3 row)
**Prior phase:** `docs/superpowers/specs/2026-07-05-subagent-routing-phase2-figma-design.md` (proven the Figma path on `component-builder`)

> **Terminology.** *"Multi-agent"* in this repo means **multi-host** (the
> Cursor/Codex/generic adapters). This spec is about **subagents**: Claude Code
> `Task`-dispatched workers on a chosen model tier. Different axis, different word.

## Problem

Phases 1 & 2 built and proved the "plan deep, build cheap" mechanism — the four
role agents (`architect`, `figma-executor`, `code-executor`, `reviewer`, all
`model: inherit`), `references/agent-routing.md` (the `fast < balanced < deep`
ladder, resolution/fallback, spec-completeness gate, escalation, Figma-lane
concurrency-1), and the self-degrading dispatch idiom — on `token-sync-layer`
(Phase 1) and `component-builder` (Phase 2). The remaining subagent-driven skills
still either dispatch **informally without naming a model** (so an omitted model
silently inherits the session's most-capable, most-expensive tier) or say
**"no subagents"** outright. Phase 3 rolls the *proven* pattern into those skills
without regressing their behavior or human-gate UX, and reconciles the last stale
parallel/sequential wording so the routing model reads as uniform.

## Approach: reuse the proven idiom, don't reinvent

This is a **generalization** pass, not a fresh design. No new agents, no new
references, no new CI machinery — Phases 1–2 built all of it. Every change is
prose in `skills/*/SKILL.md` (plus regenerated `adapters/`), reusing verbatim:

- The **self-degrading conditional dispatch idiom** proven in `token-sync-layer`
  Step 3 and `component-builder` Step 3: *"If your host supports subagent
  dispatch, route per `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`;
  otherwise do the work inline."* It names **no Claude-only product**, so no
  phrasing-map entry is needed and the else-branch governs on Codex/generic hosts.
- The **agent role contracts** as-authored — `agents/*.md` bodies do not change.
  They carry role + verification only; domain logic stays in the skills.
- The **references** as-authored — `agent-routing.md`, `figma-scripting.md`
  (named-frame + build-verify-then-replace + read-back verify + WIP-reaping),
  `figma-component-standards.md`. Only `sync-adapters.md` gets a wording fix.

Reusing one idiom uniformly is itself a Phase 3 goal (the routing model should
read the same everywhere), and it means the CI, degradation, and generator
behavior is already validated.

## The migrations

Two lanes, split by cognition-per-`agent-routing.md`, not by domain.

### Code lane — parallel-safe, no bridge, `reviewer` in code-diff mode

- **`storybook-chromatic-builder` (Step 3, story-gen).** Already
  subagent-driven-parallel; **add tier naming only**: per-component story-gen →
  **`code-executor` (fast)**, two-stage review → **`reviewer` (balanced,
  code-diff mode)**. Wrap the dispatch in the self-degrading conditional. Route to
  `fast` only when the per-component spec slice is transcription-grade
  (spec-completeness gate); a vague slice runs inline on the stronger model.
  **Wording fix:** the "code-gen skills parallelize; this is the opposite of the
  sequential Figma-authoring skills" framing (≈line 77) is now stale — every lane
  routes; only the *concurrency* differs. Reframe without losing the real point
  (stories parallelize; Figma authoring is concurrency-1).

- **`icon-system-builder` — SVGR pass.** Mechanical SVG→component transform →
  **`code-executor` (fast)**, self-verifies its build. This is exactly the
  "genuinely mechanical op" the Phase 2 dogfood confirmed `fast` still fits.

### Figma lane — concurrency-1, bridge-locked, `reviewer` in visual mode

Each site reframes "sequential, no subagents" → one **`architect` (deep)**
dispatch that reads live Figma state and emits a **stable-identifier** spec
(names, never nodeIds), then **`figma-executor` (balanced)** builds strictly
sequentially through the single bridge: preflight `figma_get_status` (reconnect /
reap stale instances if needed), **concurrency-1** (never two Figma-touching
subagents at once), `WIP:` frame → build-verify-then-replace → **programmatic
read-back verify** (`COMPONENT_SET`/variable existence + count + bound-variable
spot-check; screenshot secondary) → reap `WIP:` debris on finalize. Each result
is gated by **`reviewer` (visual mode: screenshot → analyze → iterate)**. A
`BLOCKED` executor escalates **one tier up**, never a silent same-tier retry.

- **`icon-system-builder` — Figma placement step.** The SVG-to-Figma
  componentization/placement pass adopts the Figma-lane contract above.
- **`token-builder`.** Reframe "no subagents" → sequential
  architect(deep)→figma-executor(balanced); **never parallel**. The architect
  earns its keep — ramp construction, semantic mappings, and mode axes are real
  reasoning, and the deep dispatch makes "the plan is always the better model"
  hold even on a cheap session.
- **`token-sheet-builder`.** Same reframe. Its architect slice is lighter (a
  layout plan over already-existing tokens rather than token architecture), but
  the dispatch structure is identical.

### Verification, not rewrite

- **`component-pipeline`.** Confirm the sequencer keeps its **human gates
  *between* stages** while subagents run continuously *within* a stage (parent
  Decision 7). Read and assert; edit only if the current prose contradicts it.
  Expected outcome: no change.

### Reference reframing

- **`references/sync-adapters.md`** — "Figma-authoring skills don't parallelize"
  → **"Figma work uses sequential subagents — routing yes, parallel never."**
  Sweep the migrated skills for any other stale parallel/sequential wording now
  that the routing model is uniform, and fix in place.

## Dispatch contract (inherited, per lane)

Reproduced here as the acceptance target; the source of truth is the agents +
`agent-routing.md`, which do not change.

**Code-lane site:** self-degrading conditional → dispatch **`code-executor`
(fast)** per unit (parallel-safe) → each self-verifies its build →
**`reviewer` (balanced, code-diff)** two-stage gate before combining →
spec-completeness gate protects the cheap tier (vague slice ⇒ inline on stronger).

**Figma-lane site:** self-degrading conditional → one **`architect` (deep)**
emits stable-identifier spec → **`figma-executor` (balanced)** sequential,
concurrency-1, preflight status, `WIP:` frame + read-back verify + reap →
**`reviewer` (visual)** gate → escalate one tier up on `BLOCKED`.

## Testing / verification gates

Same gates as Phases 1 & 2:

- `node --test` → all green (current baseline on `main`: **121 passing**).
- `node scripts/adapters/generate.mjs --check` → adapters in sync.
  **Regenerate and commit `adapters/` after every `SKILL.md` edit** — `agents/`
  and `references/` are not bundled, but skill *bodies* are.
- `node ci/validate-skills.mjs` → OK. **Still 4 agents** (Phase 3 adds none); the
  `validateAgent` (`model: inherit`) and `validateAgentRouting` (three tiers
  named) checks continue to pass unchanged.
- `node ci/validate-plugin.mjs` → OK.
- Extend `generate.test.mjs` to spot-check a newly-migrated skill's generated
  **Codex** prompt carries the inline-fallback branch and the rewritten
  `.throughline/references/agent-routing.md` path with **no `CLAUDE_PLUGIN_ROOT`
  leak** (mirrors the Phase-1/2 checks).

## Dogfood (bridge is up — full validation both lanes)

- **Code lane:** run `storybook-chromatic-builder` Step 3 on a small
  multi-component set — confirm the story subagents actually **parallelize** and
  the `reviewer` runs in **code-diff** mode.
- **Figma lane:** run `token-builder` (or `token-sheet-builder`) end-to-end
  against a real file — confirm the architect dispatches **deep**, the
  figma-executor **balanced**, the lane **never runs two Figma subagents at
  once**, and the **read-back verify** (not just a screenshot) gates finalize.
- **Tier-emulation reality (from Phase 2):** the `agents/` files are **not
  registered as dispatchable subagent *types*** in a fresh Claude Code session.
  Emulate the ladder by dispatching **`general-purpose`** subagents with the role
  contract and an **explicit `model` per tier** (architect→deep,
  figma-executor→balanced, reviewer→balanced, code-executor→fast).

## Environment dependency

The Figma-lane dogfood requires the **Figma Console MCP bridge connected**
(desktop plugin running). Confirm `figma_get_status` (probe) and reap stale
instances before any Figma dispatch. The code-lane dogfood (stories, SVGR) needs
no bridge.

## Non-goals (carried from the parent spec)

- Routing observability / telemetry (deferred v1 non-goal).
- A top-level "conductor" agent (fights `component-pipeline`'s human gates).
- Parallel Figma execution (the bridge forbids it).
- New agents, new references, or new host targets.
- Hardcoding any concrete model name anywhere.

## Risks / open items

- **Agent/skill drift.** Unchanged from Phases 1–2: agents hold role +
  verification contract only; domain logic (Figma anatomy, token structure, story
  conventions) stays in the skills.
- **Resolution depends on the orchestrator honoring the reference** — prescriptive
  prose, not an enforced mechanism; the same reliance superpowers accepts.
- **Bridge disconnect mid-flow** — surfaces as a `figma-executor` failure that
  leaves a resumable named `WIP:` frame; the preflight `figma_get_status` guards
  against a down bridge before dispatch.
- **Stale-wording sweep is judgment-based** — `sync-adapters.md` is the known
  target; other occurrences are found by reading, so the plan should grep the
  migrated skills for `parallel`/`sequential`/`no subagent` and reconcile each.
