# Subagent-driven development & model-tier routing — design

**Date:** 2026-07-04
**Status:** Approved (design), pending implementation plan

> **Terminology.** In this repo, *"multi-agent"* already means **multi-host** —
> the Cursor/Codex/generic adapters (see `2026-07-02-multi-agent-adapters-design.md`).
> This spec is about **subagents**: Claude Code `Task`-dispatched workers running
> on a chosen model tier. Different axis, deliberately different word.

## Problem

Several skills already dispatch subagents — `storybook-chromatic-builder`
(one per component for stories), `token-sync-layer` (one per adapter),
`icon-system-builder`, and `component-pipeline` sequences them — but they do it
**informally and never name a model.** An omitted model inherits the session's
model, "often the most capable and most expensive, which silently defeats"
cost control (the superpowers subagent-driven-development principle). Meanwhile
the Figma-authoring skills say *"no subagents"* outright.

The goal is **model/cost routing**: do the *thinking* on the best model and the
*doing* on a cheap one — without pinning concrete model names (the plugin is
installed by others whose available tiers differ), and without breaking the
non-Claude host adapters that can't dispatch subagents at all.

## The core idea: route by cognition, not by domain

The wrong axis is *Figma vs. code*. The right axis is **decide vs. do**:

- **Deciding** — the variant matrix, token architecture, slot contract, adapter
  strategy, naming — is reasoning. Best model. Short and expensive.
- **Doing** — running `figma_execute` to place nodes, transcribing component
  code, SVGR transforms, adapter output — is mechanical. Cheap model. Long.

Figma authoring, *once planned*, is mechanical. So a Figma stage only touches
the best model for its short planning slice. This is the superpowers lever:
**"when the task's plan text contains the complete code to write, the
implementation is transcription — use the cheapest tier."** The better the
plan, the cheaper execution is *allowed* to be.

## Decisions

1. **Cognition split.** An `architect` (deep tier) plans any stage and emits a
   transcription-grade spec; executors (fast→balanced) carry it out; a
   `reviewer` (balanced) gates. Planning is deep **by construction** — an
   explicit deep-tier dispatch, never left to the session default — so the
   "plan is always the better model" invariant holds even on a cheap session.

2. **Relative tiers, never hardcoded models** (portability). `model:` frontmatter
   only accepts concrete names or `inherit`; there is no "cheapest available"
   token. So every agent is **`model: inherit`**, and `references/agent-routing.md`
   holds a *relative ladder* (`fast < balanced < deep`) with a recommended
   Anthropic mapping and explicit fallback: **a missing tier collapses to the
   nearest lower tier the installer has; `deep` = the most capable available.**
   The live orchestrator resolves tier→model at dispatch against the models it
   actually has and passes an explicit `model`. One installer edits one table.

3. **Spec-completeness gate** (the money-saver). An executor is dispatched on a
   cheap tier **only when the spec is transcription-grade**; otherwise the work
   runs inline on the stronger model. Rationale: *turn count beats token price* —
   a cheap model on a vague task takes 2–3× the turns and costs more. Incomplete
   plan ⇒ the optimization inverts, so the gate protects it.

4. **Figma-lane lock.** The figma-console bridge is one live connection with
   global selection/current-page state. The **entire Figma surface is
   concurrency-1** — architect-reading-Figma, `figma-executor`, and visual
   review all serialize through the one bridge. A preflight `figma_get_status`
   (reconnect if needed) precedes any Figma dispatch; the bridge can be down.

5. **Figma partial-failure = named working frame.** Figma writes aren't
   git-committable, so a dead executor would leave a half-built component. The
   `figma-executor` **builds into a clearly-named working frame, screenshot-
   verifies, and finalizes/renames only on success.** A failure leaves an
   obvious, named, resumable artifact instead of corrupting the real component.

6. **Reviewer has two modes.** Code work reviews a **git diff**; Figma work has
   no diff — its review is **screenshot → analyze → iterate** (mandated by the
   MCP). `reviewer` carries both a code-diff mode and a Figma-visual mode.

7. **Human gates vs. continuous execution.** `component-pipeline` confirms with
   the human *between* stages; subagent-driven execution *never pauses* within a
   task. Reconciliation: **the orchestrator keeps its human gates BETWEEN
   stages; subagents run continuously WITHIN a stage.**

8. **Escalate, don't retry.** A `BLOCKED` executor is re-dispatched **one tier
   up**, never the same model unchanged.

9. **Cross-host degradation.** `agents/` is **Claude-only** — the adapter
   generator (`read-sources.mjs`) reads only `skills/`, `commands/`, `.mcp.json`,
   `plugin.json`, so it ignores `agents/` cleanly. But skill *bodies* get
   translated to Codex/generic prompts, where subagents don't exist. So dispatch
   is authored to **degrade to inline single-model execution**: each dispatch
   site reads *"if your host supports subagent dispatch, route per
   `agent-routing.md`; otherwise run inline,"* and the phrasing map neutralizes
   dispatch idioms for non-Claude targets. `agent-routing.md` states its
   Claude-specificity.

10. **Observability deferred.** A per-tier "who ran what" log to *prove* savings
    is a conscious v1 non-goal.

## Architecture

### New: `agents/` (Claude-native)

Four role agents, each `model: inherit`, tools scoped to their surface, body
carrying the role contract + verification — **not** domain logic (that stays in
the skills, so agents don't rot when skills improve):

| Agent | Tier | Concurrency | Job |
|---|---|---|---|
| `architect` | deep | 1 | Plans any stage (Figma variant matrix, token architecture, slot contract, adapter strategy). Emits a spec in **stable identifiers** (component/page/token *names*, never nodeIds). |
| `figma-executor` | fast→balanced | **1 (bridge-locked)** | Resolves names→nodeIds at run time, builds into a named working frame, screenshot-verifies, finalizes on success. |
| `code-executor` | fast→balanced | parallel-safe | Transcribes component code / stories / adapter output from spec; verifies its own build. |
| `reviewer` | balanced (scaled to risk) | parallel-safe | Code-diff review *or* Figma-visual review. |

### The handoff contract (architect → executor)

The architect's spec is addressed in **stable identifiers only** — nodeIds are
session-specific and go stale. The `figma-executor` **re-searches** to resolve
names→nodeIds at run time. This is what makes a spec survive a session roll.

### New: `references/agent-routing.md` (Claude-specific)

The single source for: the `fast < balanced < deep` ladder, the recommended
Anthropic mapping, the fallback algorithm, the one-place installer override, the
concurrency policy (Figma-lane lock), the spec-completeness gate, and the
escalation ladder.

### Skill migrations

Adopt the architect/executor split and reference `agent-routing.md`:

- `storybook-chromatic-builder` (Step 3 story-gen) — already subagent-driven;
  add tier naming + code-executor + reviewer.
- `token-sync-layer` (per-adapter) — already subagent-driven; add tiers.
- `icon-system-builder` (SVGR pass) — mechanical → fast tier.
- `component-builder`, `token-builder`, `token-sheet-builder` — reframe from
  *"no subagents"* to **sequential subagents for routing** (architect plans deep,
  figma-executor builds cheap; never parallel).
- `component-pipeline` — unchanged sequencer; keeps human gates between stages.

### Reference reframing

`references/sync-adapters.md`'s "Figma-authoring skills don't parallelize"
becomes **"Figma work uses sequential subagents — routing yes, parallel never."**

## Non-goals

- Routing observability / telemetry (deferred).
- A top-level "conductor" agent (fights `component-pipeline`'s human gates).
- Parallel Figma execution (the bridge forbids it).
- New host targets or changes to the human-gate UX.
- Hardcoding any concrete model name anywhere.

## Testing

- **Generator drift** — `generate.mjs --check` still passes with `agents/`
  present (agents are ignored, not emitted).
- **No hardcoded models** — extend `scripts/validate-plugin.mjs` to assert every
  `agents/*.md` frontmatter is `model: inherit` (fail on a concrete model name).
- **Phrasing map** — `generate.test.mjs` covers the new dispatch-idiom → inline
  substitutions for Codex/generic.
- **Dogfood** — run `component-pipeline` end-to-end; confirm the architect
  dispatches on the deep tier and executors on a cheaper tier, and that a Figma
  executor failure leaves a named working frame.

## Risks / open items

- **Agent/skill drift.** Agents duplicating skill logic would rot. Mitigation:
  agents hold *role + verification contract only*; domain logic stays in skills.
- **Resolution depends on the orchestrator honoring the reference** — the same
  reliance superpowers accepts; the routing reference is prescriptive prose, not
  an enforced mechanism.
- **Bridge disconnect mid-flow** — the preflight `figma_get_status` check is the
  guard; a mid-stage drop still surfaces as a `figma-executor` failure with a
  resumable named frame.
