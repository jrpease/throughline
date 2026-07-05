# Phase 2 (Figma path) Subagent Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the `architect` (deep) + `figma-executor` (fast→balanced) subagent split for Figma authoring, wire the reviewer's visual mode, and migrate `component-builder` onto "plan deep, build cheap."

**Architecture:** One deep `architect` dispatch plans the whole component set and emits a transcription-grade spec in stable identifiers; a bridge-locked `figma-executor` builds each component into a named working frame, screenshot-verifies structurally, and finalizes by build-verify-then-replace; a `reviewer` visual pass gates design quality. The whole Figma surface is concurrency-1, enforced by sequential dispatch prose plus the existing `figma_get_status` preflight. Dispatch prose self-degrades to inline execution on non-Claude hosts.

**Tech Stack:** Markdown agents/skills/references (this plugin's authoring surface); Node's built-in test runner (`node --test`) for CI; the adapter generator (`scripts/adapters/generate.mjs`); figma-console MCP tools.

## Global Constraints

- **No hardcoded model names anywhere.** Every `agents/*.md` frontmatter must be exactly `model: inherit` (CI `validateAgent` fails otherwise).
- **Relative tiers only** — refer to `fast` / `balanced` / `deep` and `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`, never a concrete model.
- **Self-degrading dispatch prose** — any migrated skill dispatch reads "if your host supports subagent dispatch, dispatch X per agent-routing.md; otherwise do the work inline" and names **no Claude-only product** (so the phrasing-map can't corrupt generated adapters).
- **Screenshot tool = `figma_capture_screenshot`** (repo-preferred; `figma_take_screenshot` fails with auth errors — see `references/figma-component-standards.md`).
- **Stable identifiers only in specs** — component/page/token/style *names*, never nodeIds (they go stale across sessions).
- **Figma surface is concurrency-1** — never two Figma-touching subagents live at once.
- **Adapter drift guard** — any `skills/*/SKILL.md` edit requires `node scripts/adapters/generate.mjs` then committing the regenerated `adapters/`. References are NOT bundled, so reference/agent edits need no regeneration.
- **Agent bodies hold role + verification contract only** — Figma anatomy and the named-frame protocol live in references, not in agents (anti-drift).

---

### Task 1: `agents/architect.md` (deep planner)

**Files:**
- Create: `agents/architect.md`
- Test: `ci/validate-skills.mjs` (existing; auto-discovers new agents via `validateAgent`)

**Interfaces:**
- Consumes: `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md` (tier ladder), `${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md` (anatomy the spec references).
- Produces: the **architect spec contract** consumed by Task 2's `figma-executor` and Task 7's `component-builder` dispatch — a spec addressed in stable identifiers carrying, per component: variant matrix (variants=rows, states=columns), slot contract, token/style bindings by name, dependency order (atoms first), target component name, working-frame name `WIP: <ComponentName>`.

- [ ] **Step 1: Create the agent file**

```markdown
---
name: architect
description: Plans a build stage on the deep tier and emits a transcription-grade spec addressed in stable identifiers (component/page/token/style names, never nodeIds). Reads existing Figma state read-only to plan against it; it does not write. Dispatched concurrency-1 because it touches the single Figma bridge.
model: inherit
tools: Read, mcp__figma-console__figma_get_status, mcp__figma-console__figma_reconnect, mcp__figma-console__figma_get_variables, mcp__figma-console__figma_search_components, mcp__figma-console__figma_get_styles, mcp__figma-console__figma_capture_screenshot
---

# architect

**Tier:** `deep` (see `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`). **Concurrency:** 1 — you read the single Figma bridge; never run alongside another Figma-touching subagent.

You plan a build stage and emit a **transcription-grade spec** — complete enough that a cheap executor copies it without deciding anything. You do not write to Figma or disk.

## Contract

1. **Preflight** `figma_get_status` (reconnect / reap stale entries per `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`); read existing Figma state you plan against — variables (`figma_get_variables`), styles (`figma_get_styles`), already-built components (`figma_search_components`).
2. **Emit the spec in stable identifiers only** — component/page/token/style *names*, never nodeIds (they go stale; the executor re-resolves at run time).
3. Per component the spec MUST carry: the **variant matrix** (existing layout law — variants are rows, states are columns), the **slot contract**, **token/style bindings by name**, **dependency order** (atoms first), the **target component name**, and the **working-frame name** `WIP: <ComponentName>`. Reference `${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md` for anatomy — do not restate it.
4. Return the spec as your message — it IS the return value (data for the executor, not prose for a human).

Hold role + output contract only; component anatomy lives in the standards reference, so this agent does not rot when the standards improve.
```

- [ ] **Step 2: Run the validator (expected PASS)**

Run: `node ci/validate-skills.mjs`
Expected: exits 0, no `agents/architect.md` problems (frontmatter is `model: inherit`, name matches file, description present).

- [ ] **Step 3: Confirm no adapter drift**

Run: `node scripts/adapters/generate.mjs --check`
Expected: PASS — `agents/` is not read by the generator, so adding it changes nothing.

- [ ] **Step 4: Commit**

```bash
git add agents/architect.md
git commit -m "feat(agents): add architect (deep-tier Figma/stage planner)"
```

---

### Task 2: `agents/figma-executor.md` (bridge-locked builder)

**Files:**
- Create: `agents/figma-executor.md`
- Test: `ci/validate-skills.mjs`

**Interfaces:**
- Consumes: the architect spec contract (Task 1 Produces), `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md` (named-frame + finalize protocol added in Task 4; preflight; scripting gotchas), `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md` (tier + escalation).
- Produces: a finalized, renamed component (or, on failure, a resumable `WIP: <ComponentName>` frame). Returns `DONE` / `DONE_WITH_CONCERNS` / `BLOCKED`.

- [ ] **Step 1: Create the agent file**

```markdown
---
name: figma-executor
description: Runs an architect's Figma spec on a cheap tier — resolves stable names to nodeIds at run time, builds into a named working frame, screenshot-verifies structure, and finalizes by build-verify-then-replace. Concurrency-1, bridge-locked. Not for design decisions — those belong to the architect.
model: inherit
tools: Read, mcp__figma-console__figma_get_status, mcp__figma-console__figma_reconnect, mcp__figma-console__figma_search_components, mcp__figma-console__figma_get_variables, mcp__figma-console__figma_execute, mcp__figma-console__figma_capture_screenshot, mcp__figma-console__figma_get_selection
---

# figma-executor

**Tier:** `fast`→`balanced` (see `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`). **Concurrency:** 1 (bridge-locked) — the figma-console bridge is one live connection with global selection/current-page state; never run alongside another Figma-touching subagent.

You receive a complete architect spec for **one component** and build exactly what it describes — no design decisions. If the spec is ambiguous or underspecified, do not guess: return `BLOCKED` naming the gap (the dispatcher re-plans or escalates one tier up).

## Contract (per component)

1. **Preflight** `figma_get_status` (reconnect / reap stale per `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`). If the bridge is down, return `BLOCKED`.
2. **Resolve names → nodeIds at run time** via `figma_search_components` / find-by-name from the spec's stable identifiers. Never trust a nodeId from the spec.
3. **Read `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md` first**, then build into the named working frame `WIP: <ComponentName>` (resize axis-lock trap, dynamic-page async setters, WRAP-grid timeouts all apply).
4. **Structural self-verify loop** — create → `figma_capture_screenshot` → analyze → iterate, **max ~3**: nodes landed, no collapsed (~10px) auto-layout, full variant grid present, token/style bindings resolve on read-back. This is a structural check only — design-quality review is the reviewer's job; do not re-do it.
5. **Finalize = build-verify-then-replace** per `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`: only once the working frame verifies green, replace any existing same-named component and rename the working frame to the real name. On failure, leave the `WIP:` frame intact and the existing component untouched.
6. Return a concise result: component built, verify outcome, and one of `DONE` / `DONE_WITH_CONCERNS` / `BLOCKED`. Your final message IS the return value.

Never expand scope beyond the spec. Never finalize without a green structural verify.
```

- [ ] **Step 2: Run the validator (expected PASS)**

Run: `node ci/validate-skills.mjs`
Expected: exits 0, no `agents/figma-executor.md` problems.

- [ ] **Step 3: Confirm no adapter drift**

Run: `node scripts/adapters/generate.mjs --check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add agents/figma-executor.md
git commit -m "feat(agents): add figma-executor (bridge-locked Figma builder)"
```

---

### Task 3: Wire the reviewer's Figma-visual mode

**Files:**
- Modify: `agents/reviewer.md` (frontmatter `tools:` line, and the "Mode: Figma-visual" section)
- Test: `ci/validate-skills.mjs`

**Interfaces:**
- Consumes: a finalized component name (from a figma-executor `DONE`) and its spec.
- Produces: an `approved` / `changes-requested` verdict from an **independent fresh screenshot** — no change to the existing code-diff mode.

- [ ] **Step 1: Add figma-console tools to the frontmatter**

Change the frontmatter `tools:` line from:

```yaml
tools: Read, Bash
```

to:

```yaml
tools: Read, Bash, mcp__figma-console__figma_get_status, mcp__figma-console__figma_search_components, mcp__figma-console__figma_capture_screenshot
```

- [ ] **Step 2: Replace the stub Figma-visual section**

Replace the existing section:

```markdown
## Mode: Figma-visual *(exercised in Phase 2)*

Figma work has no diff. Screenshot the result, then analyze alignment, spacing,
proportions, and binding to tokens against the spec; report the same
`approved` / `changes-requested` verdict. (Phase 2 wires the screenshot tools.)
```

with:

```markdown
## Mode: Figma-visual

Figma work has no diff. **Concurrency:** 1 (bridge-locked) — never screenshot while another Figma-touching subagent runs.

1. Preflight `figma_get_status`; locate the finalized component by name via `figma_search_components`.
2. Take your **own fresh** `figma_capture_screenshot` (independence — do not rely on the executor's shot; you may need state it did not capture).
3. Analyze **design quality** against the spec — alignment, spacing, proportion, spec fidelity. The executor already checked structural correctness; focus on quality, not re-checking node placement.
4. Report `approved` / `changes-requested` with findings ranked most-severe first. Flag anything you cannot verify from the screenshot as `⚠️ cannot verify`.
```

- [ ] **Step 3: Run the validator (expected PASS)**

Run: `node ci/validate-skills.mjs`
Expected: exits 0 (frontmatter still `model: inherit`, name/description intact).

- [ ] **Step 4: Confirm no adapter drift**

Run: `node scripts/adapters/generate.mjs --check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/reviewer.md
git commit -m "feat(agents): wire reviewer Figma-visual mode (screenshot tools)"
```

---

### Task 4: Named-frame + finalize protocol in `figma-scripting.md`

**Files:**
- Modify: `references/figma-scripting.md` (append a new section)
- Test: `ci/validate-skills.mjs` (references aren't bundled → no generation)

**Interfaces:**
- Consumes: nothing new.
- Produces: the `WIP: <ComponentName>` build-verify-then-replace protocol that Task 2's `figma-executor` and Task 7's `component-builder` reference.

- [ ] **Step 1: Append the protocol section**

Append to `references/figma-scripting.md`:

```markdown
## Subagent authoring: named working frame + finalize protocol

Figma writes are not git-committable, so a dead executor must never leave a
corrupted live component. Any subagent authoring a component (`figma-executor`)
uses **build-verify-then-replace**:

1. **Always build into a distinct working frame** named `WIP: <ComponentName>` —
   never edit the live component in place.
2. **Screenshot-verify the working frame green before touching anything real** —
   the structural self-verify loop (create → `figma_capture_screenshot` →
   analyze → iterate, max ~3): nodes landed, no collapsed (~10px) auto-layout,
   full variant grid present, token/style bindings resolve on read-back.
3. **Only then finalize:** remove/replace any existing same-named component, and
   rename the working frame's component set to the real `<ComponentName>`.
4. **On failure / `BLOCKED`:** leave the `WIP:` frame intact and named; the
   existing real component is **never touched**. A resumed run finds the `WIP:`
   frame by name and either continues or rebuilds it. A failure therefore leaves
   an obvious, named, resumable artifact — not a half-built live component.

Concurrency-1 still applies: the whole Figma surface serializes through the one
bridge, so only one subagent runs this protocol at a time.
```

- [ ] **Step 2: Run the validator (expected PASS)**

Run: `node ci/validate-skills.mjs`
Expected: exits 0.

- [ ] **Step 3: Confirm no adapter drift**

Run: `node scripts/adapters/generate.mjs --check`
Expected: PASS (references not bundled).

- [ ] **Step 4: Commit**

```bash
git add references/figma-scripting.md
git commit -m "docs(figma): named-frame + build-verify-then-replace protocol"
```

---

### Task 5: Flesh out the routing/adapters references

**Files:**
- Modify: `references/agent-routing.md` (the roles table rows for `architect` and `figma-executor`)
- Modify: `references/sync-adapters.md` (the "don't parallelize" line)
- Test: `ci/validate-skills.mjs` (`validateAgentRouting` still finds `fast`/`balanced`/`deep`)

**Interfaces:**
- Consumes: nothing new.
- Produces: canonical routing rows (no "(Phase 2)" markers) that Tasks 1, 2, 7 point to.

- [ ] **Step 1: Update the routing table rows**

In `references/agent-routing.md`, replace these two rows:

```markdown
| `architect` *(Phase 2)* | `deep` | 1 | Plan a stage; emit a transcription-grade spec in stable identifiers. |
| `figma-executor` *(Phase 2)* | `fast`→`balanced` | **1 (bridge-locked)** | Run the architect's Figma script; screenshot-verify; finalize a named frame. |
```

with:

```markdown
| `architect` | `deep` | 1 | Plan a stage; read Figma read-only; emit a transcription-grade spec in stable identifiers (names, never nodeIds). |
| `figma-executor` | `fast`→`balanced` | **1 (bridge-locked)** | Resolve names→nodeIds at run time; build into a `WIP:` frame; structural screenshot-verify; finalize by build-verify-then-replace. |
```

- [ ] **Step 2: Add the parallel-vs-sequential contrast to sync-adapters**

`references/sync-adapters.md` has **no** "Figma-authoring skills don't parallelize" line to replace (its "## Multiple platforms at once" paragraph at ~line 139 correctly describes *token-adapter* generation as parallel-safe). Honor the spec's intent by appending a contrast sentence to that paragraph so the distinction is explicit in the reference. After the paragraph ending "See the token-sync skill for the execution model.", append:

```markdown

Token-adapter generation parallelizes because each adapter writes independent
files. Figma authoring does **not**: the single figma-console bridge is
concurrency-1, so Figma work uses sequential subagents — model routing yes,
parallel never (see `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`).
```

- [ ] **Step 3: Run the validator (expected PASS)**

Run: `node ci/validate-skills.mjs`
Expected: exits 0 (`validateAgentRouting` still finds all three tiers named in backticks).

- [ ] **Step 4: Confirm no adapter drift**

Run: `node scripts/adapters/generate.mjs --check`
Expected: PASS (references not bundled).

- [ ] **Step 5: Commit**

```bash
git add references/agent-routing.md references/sync-adapters.md
git commit -m "docs(routing): finalize architect/figma-executor rows; reframe sync-adapters parallel note"
```

---

### Task 6: Migrate `component-builder` Step 3 dispatch prose

**Files:**
- Modify: `skills/component-builder/SKILL.md` (Step 3 build section — the "no subagents" note at ~line 97)
- Modify (generated): `adapters/**` via `scripts/adapters/generate.mjs`
- Test: `node scripts/adapters/generate.mjs --check`, `ci/validate-skills.mjs`

**Interfaces:**
- Consumes: the architect spec contract (Task 1), `figma-executor` (Task 2), reviewer visual mode (Task 3), the named-frame protocol (Task 4), `agent-routing.md` (Task 5).
- Produces: the migrated skill body whose generated Codex prompt Task 7 asserts against.

- [ ] **Step 1: Rewrite the checkpoint/no-subagents note**

In `skills/component-builder/SKILL.md`, replace the existing checkpoint clause:

```markdown
This guarantees a composite's typed slot points at a real, already-built target.
Build bottom-up; checkpoint after each component (sequential — this is Figma
authoring, no subagents).
```

with:

```markdown
This guarantees a composite's typed slot points at a real, already-built target.
Build bottom-up in dependency order.

**Execution model — sequential subagents with model routing.** If your host
supports subagent dispatch, plan the whole set once with one **architect**
dispatch (deep tier) — it reads existing Figma state and emits a
transcription-grade spec in stable identifiers — then build **each component**
with one **figma-executor** dispatch (fast→balanced), strictly sequentially:
preflight `figma_get_status` and never run two Figma-touching subagents at once
(the single bridge is concurrency-1). Each executor builds into a `WIP:` frame
and finalizes by build-verify-then-replace (see
`${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`); gate each finished
component with a **reviewer** visual pass. Route per
`${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`, and only dispatch a
component once its slice of the spec is complete enough to transcribe. **Keep the
human checkpoint between components** — subagents run continuously within a
component, but you pause for the human between them. If your host has no subagent
dispatch, build and verify each component inline, sequentially, as before.
```

- [ ] **Step 2: Regenerate adapters**

Run: `node scripts/adapters/generate.mjs`
Expected: writes updated `adapters/` files for `component-builder`.

- [ ] **Step 3: Verify generation is in sync**

Run: `node scripts/adapters/generate.mjs --check`
Expected: PASS (no drift after regeneration).

- [ ] **Step 4: Run the skill validator**

Run: `node ci/validate-skills.mjs`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add skills/component-builder/SKILL.md adapters
git commit -m "feat(component-builder): route Figma authoring through architect/figma-executor"
```

---

### Task 7: Degradation test for the generated `component-builder`

**Files:**
- Modify: `scripts/adapters/generate.test.mjs` (add one test, mirroring the token-sync degradation test at lines 41-48)
- Test: `node --test scripts/adapters/generate.test.mjs`

**Interfaces:**
- Consumes: the migrated `component-builder` (Task 6) and its regenerated Codex adapter.
- Produces: a regression guard that the generated Codex prompt keeps the inline fallback and the rewritten reference path with no `CLAUDE_PLUGIN_ROOT` leak.

- [ ] **Step 1: Add the failing-first test**

Append to `scripts/adapters/generate.test.mjs`:

```javascript
test('component-builder Figma dispatch degrades to inline for codex', () => {
  const prompt = result.codex.find((f) => /component-builder/.test(f.path));
  assert.ok(prompt, 'expected a codex component-builder prompt');
  const norm = prompt.content.replace(/\s+/g, ' ');
  assert.match(norm, /build and verify each component inline, sequentially, as before/);
  assert.match(prompt.content, /\.throughline\/references\/agent-routing\.md/);
  assert.doesNotMatch(prompt.content, /CLAUDE_PLUGIN_ROOT/);
});
```

- [ ] **Step 2: Run the new test (expected PASS against Task 6's output)**

Run: `node --test scripts/adapters/generate.test.mjs`
Expected: PASS. (If it FAILS on the first `assert.match`, the Task 6 SKILL.md wording or the regeneration in Task 6 Step 2 is out of sync — fix the wording/regenerate, do not weaken the assertion.)

- [ ] **Step 3: Sanity-check the guard actually binds**

Confirm the asserted phrase `build and verify each component inline, sequentially, as before` appears verbatim in the migrated SKILL.md (Task 6 Step 1). If you changed the wording in Task 6, update both to match.

- [ ] **Step 4: Commit**

```bash
git add scripts/adapters/generate.test.mjs
git commit -m "test(adapters): assert component-builder Figma dispatch degrades to inline"
```

---

### Task 8: Full verification gate

**Files:**
- No source changes — this task runs the complete gate and records the result.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a green run of every CI gate; a dogfood checklist for the human (bridge-dependent).

- [ ] **Step 1: Run the full test suite**

Run: `node --test`
Expected: all green (Phase 1 baseline was 120 passing; expect +1 from Task 7).

- [ ] **Step 2: Adapter sync**

Run: `node scripts/adapters/generate.mjs --check`
Expected: PASS.

- [ ] **Step 3: Skill/command/agent validation**

Run: `node ci/validate-skills.mjs`
Expected: exits 0 — includes `validateAgent` on `architect`, `figma-executor`, `reviewer` and `validateAgentRouting`.

- [ ] **Step 4: Plugin validation**

Run: `node ci/validate-plugin.mjs`
Expected: OK.

- [ ] **Step 5: Dogfood (human, bridge-dependent — not a blocker for the code gate)**

With the Figma Console MCP bridge connected (`throughline:figma-environment-setup` / confirm `figma_get_status`), run the migrated `component-builder` and confirm:
- the architect dispatches on the `deep` tier and emits a stable-identifier spec;
- each figma-executor dispatches on a cheaper tier;
- the Figma lane never runs two subagents at once;
- a forced executor failure leaves a named `WIP:` frame with the existing component untouched.

- [ ] **Step 6: Final commit (if the dogfood surfaced doc fixes; otherwise skip)**

```bash
git add -A
git commit -m "docs(phase2): dogfood fixes"
```

---

## Self-Review

- **Spec coverage:** architect (T1), figma-executor (T2), reviewer visual mode (T3), named-frame/finalize protocol (T4), agent-routing rows + sync-adapters reframe (T5), component-builder migration with self-degrading prose + human gates (T6), degradation test (T7), full gate + dogfood (T8). Scope = component-builder only; token-builder/token-sheet-builder deferred — matches the spec.
- **Placeholder scan:** no TBD/TODO; every doc task shows full file content; every code step shows the code and the exact command + expected output.
- **Type/name consistency:** `WIP: <ComponentName>` naming, `figma_capture_screenshot`, `model: inherit`, and the `.throughline/references/agent-routing.md` rewritten path are used identically across tasks. The Task 7 assertion phrase is drawn verbatim from Task 6's SKILL.md wording (guarded by T7 Step 3).
