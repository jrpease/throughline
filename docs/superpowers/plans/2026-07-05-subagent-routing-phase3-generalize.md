# Subagent Routing — Phase 3 (Generalize) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the proven "plan deep, build cheap" subagent-routing pattern into the remaining subagent-driven skills, reusing the existing agents/references verbatim, without regressing behavior or human-gate UX.

**Architecture:** Every change is prose in `skills/*/SKILL.md` (plus the regenerated `adapters/`). Each migrated dispatch site wraps its work in the **self-degrading conditional idiom** already proven in `component-builder` Step 3 and `token-sync-layer` Step 3: *"If your host supports subagent dispatch, route per `agent-routing.md`; otherwise do the work inline."* No new agents, no new references, no new CI machinery — Phases 1–2 built all of it. Two cognition lanes: **code** (parallel-safe, `code-executor` fast + `reviewer` code-diff) and **Figma** (concurrency-1 through the single bridge, `architect` deep → `figma-executor` balanced + `reviewer` visual).

**Tech Stack:** Markdown skill files; Node's built-in `node:test` runner; `scripts/adapters/generate.mjs` (Cursor/Codex/generic adapter generator); `ci/validate-skills.mjs`, `ci/validate-plugin.mjs`.

## Global Constraints

- **Never hardcode a concrete model name** anywhere — routing is by relative tier (`fast < balanced < deep`) via `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`. Agents stay `model: inherit`.
- **No new agents or references.** `agents/` stays at 4 (`architect`, `figma-executor`, `code-executor`, `reviewer`). Reuse the references as-authored; only prose in skills changes (plus one parity edit + optional sweep).
- **Regenerate and commit `adapters/` after every `skills/*/SKILL.md` edit** — skill bodies are bundled; `agents/` and `references/` are not. Command: `node scripts/adapters/generate.mjs`.
- **Self-degrading conditional names no Claude-only product** — the else-branch governs on Codex/generic hosts, so no phrasing-map entry is needed.
- **Human gates are preserved.** Subagents run continuously *within* a stage/tier; human checkpoints stay *between* stages/tiers (parent Decision 7).
- **Figma lane is concurrency-1.** Preflight `figma_get_status`; never run two Figma-touching subagents at once; verify with a **programmatic read-back** (not just a screenshot).
- **Verification baseline:** `node --test` currently **121 passing**; end state must be ≥121 (the two new tests below raise it).

### Scope reconciliation (discovered while planning — read before starting)

Two items the parent spec listed as Phase 3 work are **already done** in Phases 1–2. They become *verify-only*, not edits:

1. **`references/sync-adapters.md` reframing is already complete** (commit `491d342`). Lines 143–146 already read *"Figma work uses sequential subagents — model routing yes, parallel never."* → Task 7 verifies, does not rewrite.
2. **The "icon SVGR → fast code-executor" migration lives in `token-sync-layer` Step 4.5, not `icon-system-builder`.** Step 4.5's custom-SVGR pass already *"rides the same PR-review and subagent model as token output"* (Phase-1 `code-executor` fast + `reviewer`). `icon-system-builder` itself only *authors Figma* (fetch + componentize), so its migration is **Figma-lane only** (Task 2). Task 5 is a small **parity edit** naming the fast tier explicitly in Step 4.5 to match the handoff's intent — not a new dispatch site.

Net real edits: **4 skill migrations** (Tasks 1–4), **1 parity edit** (Task 5), **2 verify-only** (Tasks 6–7), **2 test/verify/dogfood** (Tasks 8–10).

---

### Task 1: `storybook-chromatic-builder` Step 3 — name tiers (code lane) + TDD the Codex degradation

**Files:**
- Modify: `skills/storybook-chromatic-builder/SKILL.md:73-81` (Step 3 intro) and `:259` (leave — see step)
- Modify (regen): `adapters/` (generated)
- Test: `scripts/adapters/generate.test.mjs`

**Interfaces:**
- Consumes: `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md` (`code-executor` → fast, `reviewer` → balanced), unchanged.
- Produces: a Codex prompt whose else-branch contains the exact string **`generate and verify each component's stories inline`** (asserted by the new test) and the path `.throughline/references/agent-routing.md`.

- [ ] **Step 1: Write the failing test** — append to `scripts/adapters/generate.test.mjs` (mirrors the existing `token-sync-layer` degradation test at lines 41-48):

```javascript
test('storybook-chromatic-builder story-gen degrades to inline for codex', () => {
  const prompt = result.codex.find((f) => /storybook-chromatic-builder/.test(f.path));
  assert.ok(prompt, 'expected a codex storybook-chromatic-builder prompt');
  const norm = prompt.content.replace(/\s+/g, ' ');
  assert.match(norm, /generate and verify each component's stories inline/);
  assert.match(prompt.content, /\.throughline\/references\/agent-routing\.md/);
  assert.doesNotMatch(prompt.content, /CLAUDE_PLUGIN_ROOT/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/adapters/generate.test.mjs`
Expected: FAIL on the new test — the current Step 3 prose has no `code-executor`/inline-fallback branch, so the string is absent.

- [ ] **Step 3: Rewrite Step 3's intro** — replace `skills/storybook-chromatic-builder/SKILL.md` lines 73-81 (the header through `...before combining.`) with:

```markdown
## Step 3 — Generate stories (subagent-driven, parallel)

Story generation is independent and verifiable per component, so it
parallelizes — one worker per component, unlike the concurrency-1 Figma lane.

**Execution model — parallel subagents with model routing.** If your host
supports subagent dispatch, dispatch **one `code-executor` per component** (fast
tier) to write its stories — a story per meaningful variant, controls wired to
props, slot props demonstrated — each verifying its own work (the story builds
and renders); then a **`reviewer`** (balanced) two-stage pass (does it match the
component spec; is it quality code) before combining. Route per
`${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`, and only dispatch a
component once its story spec is complete enough to transcribe. If your host has
no subagent dispatch, generate and verify each component's stories inline
instead.
```

- [ ] **Step 4: Confirm the `:259` "Never" rule still reads correctly** — the anti-pattern line `Never use the sequential model for story-gen — parallelize via subagents.` remains accurate (stories parallelize) and needs **no change**. Read it once to confirm; do not edit.

- [ ] **Step 5: Regenerate adapters**

Run: `node scripts/adapters/generate.mjs`
Expected: `✓ wrote N adapter files to adapters/`

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test scripts/adapters/generate.test.mjs`
Expected: PASS (all tests, including the new one and the no-drift test).

- [ ] **Step 7: Commit**

```bash
git add skills/storybook-chromatic-builder/SKILL.md scripts/adapters/generate.test.mjs adapters/
git commit -m "feat(storybook): route Step 3 story-gen via code-executor/reviewer tiers"
```

---

### Task 2: `icon-system-builder` Step 2 — Figma-lane reframe (figma-executor)

**Files:**
- Modify: `skills/icon-system-builder/SKILL.md:177-179` (the "no subagents" note under Step 2)
- Modify (regen): `adapters/`

**Interfaces:**
- Consumes: `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md` (`figma-executor` → balanced) and `figma-scripting.md`, unchanged. The Step 3 "Post-build audit read-back checklist" (existing, lines ~208-212) is the read-back verify.
- Produces: a Codex prompt whose else-branch contains **`script the SVG-to-component pass inline`** (covered by the existing "no idiom leaks" + drift tests; no dedicated new test — this lane's representative test is Task 3's token-builder).

- [ ] **Step 1: Replace the "no subagents" note** — replace `skills/icon-system-builder/SKILL.md` lines 177-179 with:

```markdown
**Execution model — sequential Figma-lane subagent with model routing.** If your
host supports subagent dispatch, run the bring-in + componentize pass as a
**`figma-executor`** dispatch (balanced tier): preflight `figma_get_status`,
never run two Figma-touching subagents at once (the single bridge is
concurrency-1), build into a `WIP:` frame and finalize by build-verify-then-
replace with the read-back audit in Step 3. The subset + naming contract were
already settled with the user in Step 1, so no separate architect dispatch is
needed here. Route per `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`. If
your host has no subagent dispatch, script the SVG-to-component pass inline,
sequentially, with the user in the loop. Either way, follow
`${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`.
```

- [ ] **Step 2: Regenerate adapters**

Run: `node scripts/adapters/generate.mjs`
Expected: `✓ wrote N adapter files to adapters/`

- [ ] **Step 3: Verify no drift + no leaks**

Run: `node --test scripts/adapters/generate.test.mjs`
Expected: PASS (the drift test now reflects the regenerated adapters; the CLAUDE_PLUGIN_ROOT-leak test still passes because the `${CLAUDE_PLUGIN_ROOT}/...` paths are rewritten to `.throughline/...` in adapters).

- [ ] **Step 4: Commit**

```bash
git add skills/icon-system-builder/SKILL.md adapters/
git commit -m "feat(icons): route Figma bring-in via sequential figma-executor lane"
```

---

### Task 3: `token-builder` — architect(deep)→figma-executor(balanced) reframe + TDD the Codex degradation

**Files:**
- Modify: `skills/token-builder/SKILL.md` — insert an execution-model paragraph after the `figma-scripting.md` note (after line 57, before `## Step 1`)
- Modify (regen): `adapters/`
- Test: `scripts/adapters/generate.test.mjs`

**Interfaces:**
- Consumes: `agent-routing.md` (`architect` → deep, `figma-executor` → balanced, `reviewer` → balanced); `figma_get_variables` for read-back.
- Produces: a Codex prompt whose else-branch contains **`build and verify each tier inline`** and the `.throughline/references/agent-routing.md` path (asserted by the new test).

- [ ] **Step 1: Write the failing test** — append to `scripts/adapters/generate.test.mjs`:

```javascript
test('token-builder Figma dispatch degrades to inline for codex', () => {
  const prompt = result.codex.find((f) => /token-builder/.test(f.path));
  assert.ok(prompt, 'expected a codex token-builder prompt');
  const norm = prompt.content.replace(/\s+/g, ' ');
  assert.match(norm, /build and verify each tier inline/);
  assert.match(prompt.content, /\.throughline\/references\/agent-routing\.md/);
  assert.doesNotMatch(prompt.content, /CLAUDE_PLUGIN_ROOT/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/adapters/generate.test.mjs`
Expected: FAIL on the new test — `token-builder` has no dispatch prose yet.

- [ ] **Step 3: Insert the execution-model paragraph** — in `skills/token-builder/SKILL.md`, immediately after the `figma_get_variables ... over a hand-written script.` paragraph (ends line 57) and before `## Step 1 — Brainstorm the structure`, insert:

```markdown
**Execution model — sequential architect → figma-executor with model routing.**
If your host supports subagent dispatch, plan the token architecture once with
one **architect** dispatch (deep tier) — it reads existing Figma state and emits
a transcription-grade spec in stable identifiers (collection/variable *names*,
never nodeIds) — then build the variables with **figma-executor** dispatches
(balanced tier), strictly sequentially: preflight `figma_get_status` and never
run two Figma-touching subagents at once (the single bridge is concurrency-1).
Each executor finalizes by build-verify-then-replace with a programmatic
read-back (`figma_get_variables`, not a screenshot); gate the result with a
**reviewer** pass. **Keep the human checkpoint between tiers** (the PAUSE in
Steps 2–4) — subagents run continuously within a tier, but you pause for the
human between them. Route per
`${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`; never parallelize Figma
work. If your host has no subagent dispatch, build and verify each tier inline,
sequentially, as the steps below describe.
```

- [ ] **Step 4: Regenerate adapters**

Run: `node scripts/adapters/generate.mjs`
Expected: `✓ wrote N adapter files to adapters/`

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test scripts/adapters/generate.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add skills/token-builder/SKILL.md scripts/adapters/generate.test.mjs adapters/
git commit -m "feat(tokens): route token-builder via sequential architect/figma-executor"
```

---

### Task 4: `token-sheet-builder` — architect(deep)→figma-executor(balanced) reframe

**Files:**
- Modify: `skills/token-sheet-builder/SKILL.md` — insert an execution-model paragraph after the `figma-scripting.md` note (after line 39, before `## Step 1`); fix the `— no subagents)` parenthetical in Step 3
- Modify (regen): `adapters/`

**Interfaces:**
- Consumes: `agent-routing.md` (`architect` → deep, `figma-executor` → balanced). Architect slice is lighter (layout plan over existing tokens, not token architecture).
- Produces: a Codex prompt whose else-branch contains **`build and verify the page inline`** (covered by drift + leak tests; token-builder is the Figma lane's representative TDD).

- [ ] **Step 1: Insert the execution-model paragraph** — in `skills/token-sheet-builder/SKILL.md`, immediately after the paragraph ending `...single-bridge-instance preflight before writing.` (line 39) and before `## Step 1 — Brainstorm the layout`, insert:

```markdown
**Execution model — sequential architect → figma-executor with model routing.**
If your host supports subagent dispatch, plan the sheet layout once with one
**architect** dispatch (deep tier) — a lighter plan than token-builder's, since
the tokens already exist; it emits a stable-identifier layout spec (which
collections/sections, how much per-token detail) — then build the page with
**figma-executor** dispatches (balanced tier), strictly sequentially: preflight
`figma_get_status`, concurrency-1, `WIP:` frame + build-verify-then-replace,
gated by a **reviewer** visual pass. Route per
`${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`; never parallelize Figma
work. If your host has no subagent dispatch, build and verify the page inline,
sequentially, as the steps below describe.
```

- [ ] **Step 2: Fix the Step 3 parenthetical** — in the same file, find the string `a Figma-authoring skill — no subagents)` (in `## Step 3 — Checkpoint`, ~line 149) and replace it with:

```
a Figma-authoring skill)
```

- [ ] **Step 3: Regenerate adapters**

Run: `node scripts/adapters/generate.mjs`
Expected: `✓ wrote N adapter files to adapters/`

- [ ] **Step 4: Verify no drift + no leaks**

Run: `node --test scripts/adapters/generate.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/token-sheet-builder/SKILL.md adapters/
git commit -m "feat(tokens): route token-sheet-builder via sequential architect/figma-executor"
```

---

### Task 5: `token-sync-layer` Step 4.5 — parity edit naming the fast tier for SVGR

**Files:**
- Modify: `skills/token-sync-layer/SKILL.md:179-182` (the "Custom icons" bullet)
- Modify (regen): `adapters/`

**Interfaces:**
- Consumes: the Step 4 execution model (already routes `code-executor` fast + `reviewer` balanced), unchanged. This is wording-only — no new dispatch site.

- [ ] **Step 1: Make the fast-tier routing explicit** — replace the `- **Custom icons** — ...` bullet (lines 179-182, ending `...rides the same PR-review and subagent model as token output.`) with:

```markdown
- **Custom icons** — these the repo owns, so generate them: export the custom
  SVGs from Figma, optimize, and componentize via SVGR into `packages/ui` (or a
  dedicated icons package). This is real code generation and rides the same
  **`code-executor` (fast) + `reviewer` (balanced)** routing and PR-review as
  token output (SVGR transforms are the textbook mechanical op the fast tier is
  for) — see the Step 4 execution model.
```

- [ ] **Step 2: Regenerate adapters**

Run: `node scripts/adapters/generate.mjs`
Expected: `✓ wrote N adapter files to adapters/`

- [ ] **Step 3: Verify no drift**

Run: `node --test scripts/adapters/generate.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add skills/token-sync-layer/SKILL.md adapters/
git commit -m "docs(tokens): name fast code-executor tier for the SVGR pass explicitly"
```

---

### Task 6: `component-pipeline` — verify human gates preserved (verify-only)

**Files:**
- Read: `skills/component-pipeline/SKILL.md` (esp. `## The sequence (confirm between every stage)` and the "Never" rules)
- Modify (only if it contradicts): `skills/component-pipeline/SKILL.md`

**Interfaces:**
- Consumes: nothing new. This confirms parent Decision 7: gates BETWEEN stages, subagents continuous WITHIN a stage.

- [ ] **Step 1: Read and assert the gates exist** — confirm each stage in `## The sequence` ends in a **Checkpoint** requiring explicit human confirmation, and that the "Never skip a confirmation between stages" rule is present.

Run: `grep -n "Checkpoint\|confirm\|Never skip a confirmation\|between" skills/component-pipeline/SKILL.md`
Expected: the three stage Checkpoints (lines ~38, ~51, ~58) and the "Never skip a confirmation between stages" rule (~83) are all present.

- [ ] **Step 2: Decide — edit or no-op.** If (and only if) the prose does **not** already make clear that subagents run continuously *within* a stage while gates sit *between* stages, add one clarifying sentence to the `## The sequence` intro:

```markdown
Within any single stage the invoked skill may run subagents continuously (no
pause); the human gates live strictly *between* stages, never inside one.
```

If the intent is already clear, make **no edit** and record that in the commit/PR description. (Expected outcome given current prose: no edit needed.)

- [ ] **Step 3: If edited, regenerate + commit; if not, skip.**

```bash
# only if Step 2 made an edit:
node scripts/adapters/generate.mjs
git add skills/component-pipeline/SKILL.md adapters/
git commit -m "docs(pipeline): clarify subagents run within a stage, gates between stages"
```

---

### Task 7: Reference sweep — verify `sync-adapters.md` + grep migrated skills for stale wording

**Files:**
- Read: `references/sync-adapters.md:143-146`
- Modify (only stragglers found): any `skills/*/SKILL.md` migrated above

**Interfaces:**
- Consumes: nothing. Reconciles leftover "no subagents"/"opposite of sequential" wording now that routing is uniform.

- [ ] **Step 1: Verify `sync-adapters.md` is already reframed** — confirm the reframed sentence is present.

Run: `grep -n "sequential subagents — model routing yes" references/sync-adapters.md`
Expected: matches line ~145 (already done in Phase 2; **no edit**).

- [ ] **Step 2: Grep the migrated skills for remaining stale wording**

Run: `grep -rn "no subagent\|opposite of the sequential\|Figma-authoring skills don't\|don't parallelize" skills/storybook-chromatic-builder/SKILL.md skills/icon-system-builder/SKILL.md skills/token-builder/SKILL.md skills/token-sheet-builder/SKILL.md`
Expected: **no matches** (Tasks 1-4 removed each occurrence). If any straggler appears, reconcile it in place using the same routing framing, then regenerate adapters and commit.

- [ ] **Step 3: Commit only if a straggler was fixed**

```bash
# only if Step 2 found and fixed a straggler:
node scripts/adapters/generate.mjs
git add skills/ adapters/
git commit -m "docs(routing): reconcile leftover parallel/sequential wording"
```

---

### Task 8: Full verification gates

**Files:** none (validation only)

- [ ] **Step 1: Run the full test suite**

Run: `node --test`
Expected: all green, **≥123 passing** (121 baseline + the 2 new degradation tests from Tasks 1 & 3).

- [ ] **Step 2: Confirm adapters are in sync**

Run: `node scripts/adapters/generate.mjs --check`
Expected: `✓ adapters in sync` (if it reports out-of-date, a prior task skipped its regenerate — run `node scripts/adapters/generate.mjs`, inspect the diff, and fold it into that task's commit).

- [ ] **Step 3: Validate skills, commands, agents**

Run: `node ci/validate-skills.mjs`
Expected: OK; **still 4 agents** (Phase 3 adds none); `validateAgent` (`model: inherit`) and `validateAgentRouting` (three tiers named) pass.

- [ ] **Step 4: Validate the plugin**

Run: `node ci/validate-plugin.mjs`
Expected: OK.

---

### Task 9: Dogfood — code lane (`storybook-chromatic-builder` Step 3)

**Files:** none (live validation; may create throwaway stories in a scratch/worktree)

**Tier-emulation reality (from Phase 2):** `agents/` files are **not** registered as dispatchable subagent *types* in a fresh Claude Code session. Emulate the ladder by dispatching **`general-purpose`** subagents with the role contract and an **explicit `model` per tier** (`code-executor` → fast, `reviewer` → balanced).

- [ ] **Step 1: Pick a small multi-component target** — 2–3 existing built components (e.g. from the Phase-2 `Badge` plus one or two others) so parallelism is observable.

- [ ] **Step 2: Run Step 3's flow** — dispatch one `code-executor` (fast) per component to write stories, concurrently; then a `reviewer` (balanced, code-diff mode) two-stage pass.

- [ ] **Step 3: Confirm the two lane properties** — (a) the story subagents actually **parallelize** (dispatched in one batch, not serialized); (b) the reviewer runs in **code-diff** mode (reviews the story diff, not a screenshot). Record the observation in the PR description.

---

### Task 10: Dogfood — Figma lane (`token-builder`), then land the PR

**Files:** none for the dogfood (live Figma writes aren't git-committable); the PR lands Tasks 1-8.

**Environment dependency:** requires the **Figma Console MCP bridge connected**. Preflight `figma_get_status` and reap stale instances before any Figma dispatch.

- [ ] **Step 1: Preflight the bridge**

Use `figma_get_status`. Expected: connected. If not, run `throughline:figma-environment-setup` and reap stale instances before proceeding.

- [ ] **Step 2: Run `token-builder` end-to-end against a real file** — emulate tiers with `general-purpose` + explicit `model`: `architect` → deep (reads Figma, emits stable-identifier spec), then `figma-executor` → balanced (builds variables sequentially).

- [ ] **Step 3: Confirm the four Figma-lane properties** — (a) architect dispatched on **deep**, figma-executor on **balanced**; (b) the lane **never ran two Figma subagents at once**; (c) finalize was gated by a **programmatic read-back** (`figma_get_variables`), not just a screenshot; (d) the human checkpoint held **between** primitive/semantic tiers. Record in the PR description.

- [ ] **Step 4: Open the PR** — push the branch and open a PR bundling Tasks 1-8, with the dogfood observations (Tasks 9-10) in the body.

```bash
git push -u origin HEAD
gh pr create --title "Phase 3: generalize subagent routing across skills" \
  --body "Rolls the proven plan-deep/build-cheap routing into storybook-chromatic-builder, icon-system-builder, token-builder, token-sheet-builder; parity-names the SVGR fast tier; verifies component-pipeline gates and the sync-adapters reframe. Two new Codex-degradation tests. Dogfooded both lanes (see checklist).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review

**Spec coverage:**
- storybook-chromatic-builder tier naming → Task 1 ✓
- icon-system-builder Figma lane → Task 2 ✓ (SVGR-to-fast reconciled: lives in token-sync-layer, parity-named in Task 5)
- token-builder architect→figma-executor → Task 3 ✓
- token-sheet-builder reframe → Task 4 ✓
- component-pipeline gate verification → Task 6 ✓
- sync-adapters.md reframe → Task 7 ✓ (verify-only; already done Phase 2)
- generate.test.mjs Codex spot-check → Tasks 1 & 3 ✓ (one per lane, mirroring Phase 1/2 precedent)
- Verification gates (node --test, generate --check, validate-skills, validate-plugin) → Task 8 ✓
- Both-lane dogfood with tier emulation → Tasks 9 & 10 ✓
- Non-goals (no new agents/refs, no hardcoded models, no parallel Figma) → Global Constraints ✓

**Placeholder scan:** No TBD/TODO; every edit shows exact before/after markdown; both new tests show full JS. Conditional edits (Tasks 6, 7) state the exact condition and the exact insert text, with an explicit "no edit" default.

**Type/string consistency:** Codex else-branch assertion strings match the prose exactly — `generate and verify each component's stories inline` (Task 1 Step 1 ↔ Step 3), `build and verify each tier inline` (Task 3 Step 1 ↔ Step 3). Adapter path asserted as `.throughline/references/agent-routing.md` (the rewrite of `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`), consistent with the existing Phase-1/2 tests.
