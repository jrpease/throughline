# Subagent routing — Phase 3 (generalize) handoff

> **For the next session.** This is a handoff, not a plan. Read it, then read the
> linked source docs, then start the Phase 3 spec→plan→build cycle. You have zero
> context from the session that wrote this — everything you need is here or linked.

## How to start

1. Read the parent spec: `docs/superpowers/specs/2026-07-04-subagent-driven-model-routing-design.md` — especially the **Phasing → Phase 3** row and the **Skill migrations** + **Reference reframing** sections. That spec is the design of record.
2. Read the Phase 2 design + its dogfood section: `docs/superpowers/specs/2026-07-05-subagent-routing-phase2-figma-design.md` (esp. **Dogfood validation** — the tier-calibration table and the hardened executor contract). Phase 2 proved the Figma path on `component-builder`; Phase 3 rolls the *proven* pattern out.
3. Read the two prior plans for conventions to match verbatim:
   - `docs/superpowers/plans/2026-07-04-subagent-routing-phase1-token-sync.md`
   - `docs/superpowers/plans/2026-07-05-subagent-routing-phase2-figma.md`
4. **Brainstorm first, then plan, then build** (superpowers:brainstorming → writing-plans → subagent-driven-development). The mechanism is proven; Phase 3's work is applying it to five more skills without regressing their existing behavior.

## What Phases 1 & 2 established (merged, on `main`) — reuse, do not reinvent

- **`agents/` (Claude-only), four role agents, all `model: inherit`:** `architect` (deep, concurrency 1, reads Figma read-only, emits stable-identifier spec), `figma-executor` (fast→**balanced default**, bridge-locked, COMPONENT_SET read-back verify, build-verify-then-replace + WIP reaping), `code-executor` (fast, parallel-safe), `reviewer` (balanced; code-diff **and** Figma-visual modes, both live).
- **`references/agent-routing.md`** — `fast < balanced < deep` ladder, resolution/fallback, spec-completeness gate, escalation (one tier up), Figma-lane concurrency-1. Rows for all four agents are finalized.
- **`references/figma-scripting.md`** — the named-frame + build-verify-then-replace protocol (with the read-back verify and WIP-reaping) and the bridge preflight/stale-instance (B4) discipline.
- **`references/figma-component-standards.md`** — now carries the **icon-color rule** (icons match the component's text color token; stroke for line icons / fill for solid glyphs; never hardcoded, never fixed across tones; override the instance, never the shared `icon/*` source).
- **Self-degrading dispatch idiom** (proven in `token-sync-layer` Step 3 and `component-builder` Step 3): *"If your host supports subagent dispatch, dispatch X per `agent-routing.md`; otherwise do the work inline"* — names **no Claude-only product**, so no phrasing-map entry is needed. Copy this idiom for every Phase 3 migration.
- **CI:** `ci/validate-skills.mjs` (`validateAgent` requires `model: inherit`; `validateAgentRouting` requires the three tiers named). `scripts/adapters/generate.mjs --check` must pass; `agents/` and `references/` are **not** bundled, so only `skills/*/SKILL.md` edits require `node scripts/adapters/generate.mjs` + committing the regenerated `adapters/`.

## Phase 3 goal

Generalize the proven "plan deep, build cheap" pattern to the remaining subagent-driven skills, and reconcile the last references — without regressing existing behavior or human-gate UX.

## What Phase 3 must migrate (from the parent spec, Phase 3 row)

- **`storybook-chromatic-builder`** (Step 3 story-gen) — already subagent-driven (one per component); add tier naming + `code-executor` (fast) + `reviewer` (balanced, code-diff mode). Stories are code, not Figma — parallel-safe, no bridge lock.
- **`icon-system-builder`** (SVGR pass) — mechanical → **`fast` tier** `code-executor` (this is exactly the "trivial mechanical op" the Phase 2 dogfood said `fast` still fits). The Figma icon *placement* step, if it authors Figma, uses the sequential figma-executor lane.
- **`token-builder`** — reframe from *"no subagents"* to **sequential** architect(deep)→figma-executor(balanced) for the Figma variable authoring; never parallel.
- **`token-sheet-builder`** — same sequential Figma reframe.
- **`component-pipeline`** — the sequencer stays unchanged; **confirm** it keeps its human gates *between* stages while subagents run continuously *within* a stage (parent Decision 7). This is a verification, not a rewrite.
- **Reference reframing** — sweep `references/sync-adapters.md` and any skill (e.g. `storybook-chromatic-builder` line ~77's "sequential Figma-authoring skills") for stale parallel/sequential wording now that the routing model is uniform.

## Hard-won lessons from the Phase 2 dogfood — apply these to every migration

These came from a live end-to-end run and are the reason the executor contract is what it is:

1. **Default a real Figma *component* build to `balanced`, not `fast`.** In the dogfood, `fast` (Haiku) used *more* turns than `balanced` (Sonnet) for the same wall-clock AND produced unusable output (plain frames + a falsely-green self-report). `fast` is right only for genuinely mechanical ops (SVGR transforms, adapter output).
2. **Screenshot-only verification is a trap.** A screenshot of N frames is indistinguishable from N real variants. Any Figma componentization must self-verify with a **programmatic read-back** (`node.type === 'COMPONENT_SET'`, child/variant count, bound-variable spot-check). This is already in the figma-executor contract — keep it for every Figma migration.
3. **The independent reviewer earns its keep** — it caught the fabricated "DONE." Do not let an executor's self-report stand in for review.
4. **Subagents CAN drive the figma-console bridge** (proven in the dogfood: architect read, executor wrote, reviewer screenshotted). Concurrency-1 is enforced by the orchestrator serializing dispatch, not by the bridge.
5. **Dispatch reality:** the `agents/` files are **not registered as dispatchable subagent *types*** in a fresh Claude Code session — only `general-purpose`, `Explore`, etc. are. The orchestrator emulates the ladder by dispatching `general-purpose` subagents with the role contract and an **explicit `model` per tier** (architect→deep, figma-executor→balanced, reviewer→balanced, code-executor→fast). Whoever dogfoods Phase 3 must do the same.

## Environment dependency

The Figma-authoring migrations (`token-builder`, `token-sheet-builder`, icon placement) can only be dogfooded with the **Figma Console MCP bridge connected**. Confirm `figma_get_status` (probe) and reap stale instances (B4) before any Figma dispatch. The code-only migrations (`storybook-chromatic-builder`, SVGR) do not need the bridge.

## Verification gates (same as Phases 1 & 2)

- `node --test` → all green (current baseline on `main`: **121 passing**).
- `node scripts/adapters/generate.mjs --check` → adapters in sync (regenerate after any `SKILL.md` edit).
- `node ci/validate-skills.mjs` → skills + commands + agents OK (currently 4 agents).
- `node ci/validate-plugin.mjs` → OK.
- **Dogfood** each migrated skill with the appropriate tier routing; confirm parallel-safe code roles actually parallelize and Figma roles stay concurrency-1.

## Notes / artifacts from Phase 2

- A real, correct **`Badge` component set** was built into the "Brand Studio" Figma file during the Phase 2 dogfood (10 variants, Tone×Size, icon slot colored per the icon-color rule). It's a keeper, not debris — leave it.
- Full dogfood write-up (tier table, icon-color bug + fix) lived in `.superpowers/sdd/dogfood-findings.md` (gitignored scratch — may not survive a fresh session); its durable summary is the Phase 2 spec's **Dogfood validation** section.

## Deferred beyond Phase 3

- Routing observability / telemetry (a per-tier "who ran what" log) — a conscious non-goal since v1.
- A top-level "conductor" agent — rejected (fights `component-pipeline`'s human gates).
