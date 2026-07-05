# Agent routing — choosing a model per subagent

**Claude-only.** This reference governs subagent dispatch, a Claude Code
capability. Hosts without subagent dispatch (Codex, generic AGENTS.md) run the
work inline on their single model and ignore this file.

## Why route

Do the *thinking* on the best model and the *doing* on a cheap one. Deciding a
component's variant matrix, token architecture, or adapter strategy is reasoning
— it earns the best model. Running the resulting spec — transcribing code,
placing Figma nodes, emitting adapter output — is mechanical, and a cheap model
does it well **once the plan is complete**.

## The tier ladder

Relative, never a hardcoded model name — installers have different plans, so we
name a *capability tier* and resolve it against the models actually available.

- `fast` — cheapest/fastest tier. Transcription-grade work from a complete spec.
- `balanced` — mid tier. Judgment, integration, review scaled to risk.
- `deep` — most capable tier available. Planning, architecture, hard reasoning.

### Recommended mapping (Anthropic)

| Tier | Recommended model |
|---|---|
| `fast` | Haiku |
| `balanced` | Sonnet |
| `deep` | Opus (or the most capable model you have) |

**Override in one place:** edit this table for your plan. Everything downstream
reads tiers, not model names.

### Resolution + fallback

At dispatch, resolve the role's tier to a concrete model **from the models you
actually have**, then pass it explicitly (an omitted model inherits the session
model — often the most expensive — which defeats routing). If a tier's model is
unavailable, **collapse to the nearest lower tier you have**; `deep` always maps
to the most capable model available. An installer with only one model degrades
to that model everywhere — routing becomes a no-op, never a failure.

## Roles → tiers

| Agent | Tier | Concurrency | Role |
|---|---|---|---|
| `code-executor` | `fast` | parallel-safe | Transcribe code/adapter output from a complete spec; verify its own build. |
| `reviewer` | `balanced` (scale to risk) | parallel-safe | Spec-compliance + quality gate; code-diff or Figma-visual mode. |
| `architect` | `deep` | 1 | Plan a stage; read Figma read-only; emit a transcription-grade spec in stable identifiers (names, never nodeIds). |
| `figma-executor` | `fast`→`balanced` (default **`balanced`** for a real component build; `fast` only for trivial mechanical ops) | **1 (bridge-locked)** | Resolve names→nodeIds at run time; build into a `WIP:` frame; verify via `COMPONENT_SET` read-back (not screenshot-only); finalize by build-verify-then-replace and reap `WIP:` debris. |

## The spec-completeness gate

Dispatch an executor on `fast` **only when the spec is transcription-grade** —
complete enough that execution is copying, not deciding. Turn count beats token
price: a cheap model on a vague task takes 2–3× the turns and costs more. If the
spec is incomplete, run the work inline on the stronger model instead.

## Escalation

A `BLOCKED` executor is re-dispatched **one tier up**, never the same model
unchanged. If still blocked at `deep`, escalate to the human.

## Concurrency

Code-gen roles are parallel-safe. Figma work is **not**: the figma-console
bridge is a single live connection with global selection/current-page state, so
the entire Figma surface is concurrency-1. Route Figma work through
sequential subagents — model routing yes, parallelism never.
