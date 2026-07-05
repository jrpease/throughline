# Subagent Routing — Phase 1 (token-sync pilot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the model-tier routing mechanism on one skill — migrate `token-sync-layer` to dispatch named subagents whose model is chosen from a portable tier ladder, with the shared machinery (agent definitions, routing reference, a no-hardcoded-model check, cross-host degradation) that later phases reuse.

**Architecture:** Introduce a Claude-only `agents/` directory holding two role agents (`code-executor`, `reviewer`), each `model: inherit`. A new `references/agent-routing.md` maps roles→tiers→models with a fallback so installers on any model plan resolve it. A CI validator enforces that agents never hardcode a model. The `token-sync-layer` skill's execution-model paragraph is rewritten to dispatch those agents via the reference, authored as a self-degrading conditional so the generated Codex/generic adapters fall back to inline execution (no subagents there). Adapters are regenerated so the drift guard stays green.

**Tech Stack:** ESM Node ≥20, `node:test` + `node:assert/strict`, zero dependencies. Markdown skill/agent/reference files. Existing `scripts/adapters/*` generator + `ci/validate-*` validators.

## Global Constraints

- **ESM only, zero new dependencies** — Node built-ins only (matches `ci/` + `scripts/`).
- **Tests run under `node --test`** (auto-discovers `*.test.mjs`); pure functions + colocated tests, CLI guarded by the `import.meta.url === pathToFileURL(process.argv[1]).href` idiom.
- **No concrete model names in `agents/`** — every agent frontmatter is exactly `model: inherit`. Concrete names (`opus`/`sonnet`/`haiku`) are forbidden in `agents/` only; skills may still pin a model (`figma-environment-setup` legitimately uses `model: haiku`).
- **`agents/` is Claude-only** — the adapter generator (`scripts/adapters/read-sources.mjs`) reads only `skills/`, `commands/`, `.mcp.json`, `plugin.json`, so it never emits agents. Ships to Claude Code via the git marketplace `source: "./"`; the `npx` installer deliberately does not stamp it into non-Claude projects.
- **Tier vocabulary is exactly `fast` < `balanced` < `deep`** — used verbatim in the reference and agent bodies.
- **Drift guard must stay green** — after any `skills/` or `scripts/adapters/` edit, `node scripts/adapters/generate.mjs` regenerates `adapters/`, and `node scripts/adapters/generate.mjs --check` must pass (CI runs it).
- **Canonical source files stay hand-edited** — `SKILL.md` etc. are canonical; `adapters/` is generated.

---

### Task 1: Agent frontmatter validator (the no-hardcoded-model guard)

Adds a pure `validateAgent` to the existing skill/command validator and wires it into the CLI so CI fails if any agent pins a concrete model or omits required frontmatter. Written first so the guard exists before any agent file does.

**Files:**
- Modify: `ci/validate-skills.mjs` (add `validateAgent`, enumerate `agents/` in `main`)
- Test: `ci/validate-skills.test.mjs` (add `validateAgent` cases)

**Interfaces:**
- Consumes: `parseFrontmatter` (already imported from `./lib/frontmatter.mjs`, returns `{ data }` and throws on malformed frontmatter); `isNonEmptyString` (module-local helper).
- Produces: `validateAgent({ fileName, source }) -> string[]` — array of problem strings, empty when valid.

- [ ] **Step 1: Write the failing tests**

Add to `ci/validate-skills.test.mjs`:

```javascript
import {
  validateAgent,
} from './validate-skills.mjs';

function agentSource({ name = 'code-executor', description = 'an agent', model = 'inherit', extra = '' } = {}) {
  return `---\nname: ${name}\ndescription: ${description}\nmodel: ${model}\n${extra}---\nbody\n`;
}

test('a well-formed agent produces no problems', () => {
  assert.deepEqual(validateAgent({ fileName: 'code-executor.md', source: agentSource() }), []);
});

test('flags an agent that hardcodes a concrete model', () => {
  const problems = validateAgent({ fileName: 'code-executor.md', source: agentSource({ model: 'opus' }) });
  assert.ok(problems.some((p) => /model.*must be.*inherit/i.test(p)));
});

test('flags an agent missing the model field', () => {
  const src = `---\nname: code-executor\ndescription: an agent\n---\nbody\n`;
  const problems = validateAgent({ fileName: 'code-executor.md', source: src });
  assert.ok(problems.some((p) => /model.*must be.*inherit/i.test(p)));
});

test('flags an agent missing a description', () => {
  const src = `---\nname: code-executor\nmodel: inherit\n---\nbody\n`;
  const problems = validateAgent({ fileName: 'code-executor.md', source: src });
  assert.ok(problems.some((p) => /"description" is required/.test(p)));
});

test('flags an agent whose name does not match the file', () => {
  const problems = validateAgent({ fileName: 'code-executor.md', source: agentSource({ name: 'other' }) });
  assert.ok(problems.some((p) => /must equal the file name/.test(p)));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test ci/validate-skills.test.mjs`
Expected: FAIL — `validateAgent` is not exported (`SyntaxError`/`undefined is not a function`).

- [ ] **Step 3: Implement `validateAgent` and wire it into `main`**

In `ci/validate-skills.mjs`, add after `validateCommand`:

```javascript
export function validateAgent({ fileName, source }) {
  let data;
  try {
    ({ data } = parseFrontmatter(source));
  } catch (err) {
    return [`agents/${fileName}: ${err.message}`];
  }
  const problems = [];
  const expectedName = fileName.replace(/\.md$/, '');
  if (!isNonEmptyString(data.name)) {
    problems.push(`agents/${fileName}: "name" is required`);
  } else if (data.name !== expectedName) {
    problems.push(`agents/${fileName}: "name" (${data.name}) must equal the file name (${expectedName})`);
  }
  if (!isNonEmptyString(data.description)) {
    problems.push(`agents/${fileName}: "description" is required`);
  }
  if (data.model !== 'inherit') {
    problems.push(`agents/${fileName}: "model" must be exactly "inherit" (agents never hardcode a concrete model)`);
  }
  return problems;
}
```

In `main()`, after the commands loop and before the manifest-doc check, add:

```javascript
  const agentsDir = join(REPO_ROOT, 'agents');
  let agentCount = 0;
  if (existsSync(agentsDir)) {
    const agentFiles = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
    agentCount = agentFiles.length;
    for (const fileName of agentFiles) {
      problems.push(...validateAgent({ fileName, source: readFileSync(join(agentsDir, fileName), 'utf8') }));
    }
  }
```

Update the success log line to include agents:

```javascript
    console.log(`✓ ${skillDirs.length} skills, ${commandFiles.length} commands, ${agentCount} agents, manifest doc OK`);
```

(`existsSync`, `readdirSync`, `readFileSync`, `join` are already imported.)

- [ ] **Step 4: Run tests + the CLI to verify they pass**

Run: `node --test ci/validate-skills.test.mjs`
Expected: PASS (all new cases green).
Run: `node ci/validate-skills.mjs`
Expected: PASS — prints `✓ N skills, N commands, 0 agents, manifest doc OK` (no `agents/` dir yet, so `existsSync` is false).

- [ ] **Step 5: Commit**

```bash
git add ci/validate-skills.mjs ci/validate-skills.test.mjs
git commit -m "feat(ci): validate agents/ frontmatter, forbid hardcoded models"
```

---

### Task 2: Routing reference `references/agent-routing.md`

The portable tier system: the `fast < balanced < deep` ladder, recommended mapping, fallback, one-place override, role table, spec-completeness gate, escalation ladder, and the Figma-lane concurrency note. A light validator asserts it defines all three tiers (mirrors `validateManifestDoc`).

**Files:**
- Create: `references/agent-routing.md`
- Modify: `ci/validate-skills.mjs` (add `validateAgentRouting`, call in `main`)
- Test: `ci/validate-skills.test.mjs` (add `validateAgentRouting` cases)

**Interfaces:**
- Produces: `validateAgentRouting(source) -> string[]` — empty when the doc names all three tiers, else one problem string.

- [ ] **Step 1: Write the failing tests**

Add to `ci/validate-skills.test.mjs`:

```javascript
import {
  validateAgentRouting,
} from './validate-skills.mjs';

test('agent-routing doc naming all three tiers passes', () => {
  const src = '# Routing\n\n- `fast` — cheapest\n- `balanced` — mid\n- `deep` — most capable\n';
  assert.deepEqual(validateAgentRouting(src), []);
});

test('agent-routing doc missing a tier is flagged', () => {
  const src = '# Routing\n\n- `fast`\n- `balanced`\n';
  const problems = validateAgentRouting(src);
  assert.ok(problems.some((p) => /deep/.test(p)));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test ci/validate-skills.test.mjs`
Expected: FAIL — `validateAgentRouting` is not exported.

- [ ] **Step 3: Implement `validateAgentRouting` and wire it in**

In `ci/validate-skills.mjs`, add after `validateManifestDoc`:

```javascript
export function validateAgentRouting(source) {
  const missing = ['fast', 'balanced', 'deep'].filter((tier) => !new RegExp(`\`${tier}\``).test(source));
  if (missing.length) {
    return [`references/agent-routing.md: must define tier(s): ${missing.join(', ')}`];
  }
  return [];
}
```

In `main()`, after the agents loop, add (guarded so the check only runs once the file exists):

```javascript
  const routingPath = join(REPO_ROOT, 'references', 'agent-routing.md');
  if (existsSync(routingPath)) {
    problems.push(...validateAgentRouting(readFileSync(routingPath, 'utf8')));
  }
```

- [ ] **Step 4: Create `references/agent-routing.md`**

```markdown
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
| `architect` *(Phase 2)* | `deep` | 1 | Plan a stage; emit a transcription-grade spec in stable identifiers. |
| `figma-executor` *(Phase 2)* | `fast`→`balanced` | **1 (bridge-locked)** | Run the architect's Figma script; screenshot-verify; finalize a named frame. |

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
the entire Figma surface is concurrency-1 (Phase 2). Route Figma work through
sequential subagents — model routing yes, parallelism never.
```

- [ ] **Step 5: Run the validator + tests to verify they pass**

Run: `node --test ci/validate-skills.test.mjs`
Expected: PASS.
Run: `node ci/validate-skills.mjs`
Expected: PASS — `agent-routing.md` names all three tiers.

- [ ] **Step 6: Commit**

```bash
git add references/agent-routing.md ci/validate-skills.mjs ci/validate-skills.test.mjs
git commit -m "feat(routing): add agent-routing tier reference + validator"
```

---

### Task 3: Agent definitions (`code-executor`, `reviewer`)

The two reusable Claude-only role agents this phase dispatches. Frontmatter is `model: inherit`; the body carries the tier, the verification contract, and a pointer to `agent-routing.md` for resolution. No domain logic lives here (that stays in skills), so these do not rot when skills improve.

**Files:**
- Create: `agents/code-executor.md`
- Create: `agents/reviewer.md`

**Interfaces:**
- Consumes: the tier system in `references/agent-routing.md` (Task 2).
- Produces: subagent types `code-executor` and `reviewer`, dispatchable by name (Task 4 references them).

- [ ] **Step 1: Create `agents/code-executor.md`**

```markdown
---
name: code-executor
description: Transcribes code or generated output from a complete, transcription-grade spec and verifies its own build. Dispatched on the fast tier for mechanical, parallel-safe code-gen (per-adapter token output, per-component stories, SVGR transforms). Not for planning or design decisions — those belong to the dispatcher or the architect.
model: inherit
tools: Read, Write, Edit, Bash
---

# code-executor

**Tier:** `fast` (see `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`). **Concurrency:** parallel-safe.

You receive a complete spec and produce exactly what it describes — no design
decisions. If the spec is ambiguous or underspecified, do not guess: return
`BLOCKED` naming the gap (the dispatcher will re-plan or escalate a tier up).

## Contract

1. Read the spec and the files it names.
2. Produce the files the spec specifies, following existing repo patterns.
3. **Verify your own work** — run the build/test the spec names and confirm the
   expected artifacts appear (for token adapters: the config builds, expected
   files exist, references resolve for web / flatten for native).
4. Return a concise result: files written, verification command + outcome, and
   one of `DONE` / `DONE_WITH_CONCERNS` / `BLOCKED`. Your final message IS the
   return value — return data, not prose for a human.

Never expand scope beyond the spec. Never mark `DONE` without running the
verification step.
```

- [ ] **Step 2: Create `agents/reviewer.md`**

```markdown
---
name: reviewer
description: Reviews a completed unit of work for spec compliance and quality before it is combined or landed. Two modes — code-diff review (a git diff) and Figma-visual review (screenshot then analyze). Dispatched on the balanced tier, scaled to the diff's risk. Reports a verdict; does not fix.
model: inherit
tools: Read, Bash
---

# reviewer

**Tier:** `balanced`, scaled to risk (see `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`). **Concurrency:** parallel-safe.

Review the unit you are given against its spec. Report; do not edit.

## Mode: code-diff

Given a spec and a diff:
1. **Spec compliance** — does the diff do what the spec requires, and only that?
2. **Quality** — correctness, DRY, repo conventions, dead code, tests that
   assert something real.
Return: `spec: ✅/❌ <reason>`, then quality findings ranked most-severe first,
then an overall `approved` / `changes-requested`. Flag anything you cannot
verify from the diff alone as `⚠️ cannot verify` — do not block on it; the
dispatcher holds the cross-task context to resolve it.

## Mode: Figma-visual *(exercised in Phase 2)*

Figma work has no diff. Screenshot the result, then analyze alignment, spacing,
proportions, and binding to tokens against the spec; report the same
`approved` / `changes-requested` verdict. (Phase 2 wires the screenshot tools.)
```

- [ ] **Step 3: Verify the agents pass validation and break nothing**

Run: `node ci/validate-skills.mjs`
Expected: PASS — `✓ N skills, N commands, 2 agents, ...` (both agents valid, `model: inherit`).
Run: `node --test`
Expected: PASS — full suite still green.
Run: `node scripts/adapters/generate.mjs --check`
Expected: PASS — `agents/` is not read by the generator, so adapters are unchanged (no drift).

- [ ] **Step 4: Commit**

```bash
git add agents/code-executor.md agents/reviewer.md
git commit -m "feat(agents): add code-executor and reviewer role agents"
```

---

### Task 4: Migrate `token-sync-layer` dispatch + regenerate adapters

Rewrites the skill's execution-model paragraph to dispatch the new agents via the routing reference, authored as a **self-degrading conditional** so the generated Codex/generic prompts fall back to inline execution without a phrasing-map rule. Then regenerates adapters so the drift guard stays green, and spot-checks that the Codex prompt degraded correctly.

**Files:**
- Modify: `skills/token-sync-layer/SKILL.md:147-153` (the execution-model paragraph)
- Modify (generated): `adapters/**` (regenerated, committed)
- Test: `scripts/adapters/generate.test.mjs` (add a degradation spot-check for token-sync-layer)

**Interfaces:**
- Consumes: `code-executor`, `reviewer` (Task 3), `references/agent-routing.md` (Task 2).
- Produces: canonical dispatch wording that the generator translates verbatim (agent names aren't `` `X` skill``, so the phrasing map leaves them alone; the text names no Claude-only product, so the `Claude Code`→target rule can't corrupt it).

- [ ] **Step 1: Add the failing degradation spot-check**

In `scripts/adapters/generate.test.mjs`, reuse the module-level `result = generate(readSources(REPO_ROOT))` that the file already defines. `generate()` returns `{ cursor, codex, generic }` (keyed by target; each file has `.path` and `.content` — note: `content`, not `contents`, and there is no `.target` field). Add:

```javascript
test('token-sync-layer dispatch degrades to inline for codex', () => {
  const prompt = result.codex.find((f) => /token-sync-layer/.test(f.path));
  assert.ok(prompt, 'expected a codex token-sync-layer prompt');
  assert.match(prompt.content, /no subagent dispatch, generate and verify each adapter inline/);
  assert.match(prompt.content, /\.throughline\/references\/agent-routing\.md/);
  assert.doesNotMatch(prompt.content, /CLAUDE_PLUGIN_ROOT/);
});
```

(Verified against the file: `result`, `REPO_ROOT`, `OUT_ROOT` are module-level; `readSources`/`generate` are already imported; the drift test uses `f.content` and `f.path`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/adapters/generate.test.mjs`
Expected: FAIL — the skill still says "one subagent per adapter" and the codex prompt lacks the inline-fallback phrase.

- [ ] **Step 3: Rewrite the skill's execution-model paragraph**

In `skills/token-sync-layer/SKILL.md`, replace this exact block (lines 147–153):

```
**Execution model — subagent-driven for multiple platforms.** When more than one
platform is targeted, generating each platform's output is independent and
verifiable, so dispatch **one subagent per adapter**: each produces its
platform's files and verifies them (the config builds, the expected files
appear, references resolve correctly for web / flatten for native). Review each
before combining. For a single platform, run inline. (See the selective-
subagent decision: code-gen skills parallelize; Figma-authoring skills don't.)
```

with:

```
**Execution model — subagent dispatch with model routing.** Generating each
platform's output is independent and verifiable. If your host supports subagent
dispatch, dispatch **one `code-executor` per adapter** — each produces its
platform's files and verifies them (the config builds, the expected files
appear, references resolve for web / flatten for native) — then a **`reviewer`**
to check each before combining. Choose each subagent's model from its role tier
per `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md` (`code-executor` → fast,
`reviewer` → balanced), and only dispatch once each adapter's spec is complete
enough to transcribe. If your host has no subagent dispatch, generate and verify
each adapter inline instead. For a single platform, run inline either way. This
is a code-gen stage, so these subagents may run in parallel — unlike Figma
authoring, which is always sequential.
```

- [ ] **Step 4: Regenerate adapters**

Run: `node scripts/adapters/generate.mjs`
Expected: rewrites files under `adapters/` (cursor/codex/generic token-sync-layer).

- [ ] **Step 5: Run the full verification set**

Run: `node --test`
Expected: PASS — including the new degradation spot-check.
Run: `node scripts/adapters/generate.mjs --check`
Expected: PASS — committed adapters now match freshly generated output.
Run: `node ci/validate-skills.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add skills/token-sync-layer/SKILL.md adapters scripts/adapters/generate.test.mjs
git commit -m "feat(token-sync): dispatch code-executor/reviewer with tier routing"
```

---

## Self-Review

**Spec coverage (Phase 1 scope of `2026-07-04-subagent-driven-model-routing-design.md`):**
- Cognition-split agents (`code-executor`, `reviewer`) → Task 3. (`architect`/`figma-executor` are explicitly Phase 2 per the spec's Phasing section.)
- Relative tiers, `model: inherit`, resolve-at-dispatch, fallback, one-place override → `agent-routing.md` (Task 2) + validator (Task 1).
- Spec-completeness gate → documented in `agent-routing.md` and referenced in the migrated skill (Tasks 2, 4).
- Escalation ladder → `agent-routing.md` + `code-executor` `BLOCKED` contract (Tasks 2, 3).
- Cross-host degradation (agents Claude-only; dispatch degrades to inline) → generator ignores `agents/` (Global Constraints) + self-degrading skill wording + codex spot-check (Task 4).
- No-hardcoded-model test → Task 1.
- Reviewer two modes → `reviewer.md` (Task 3); visual mode exercised in Phase 2.
- Figma-lane lock, named working frame, screenshot-verify → **deferred to Phase 2** (noted, not a gap).
- Observability → non-goal (not implemented, per spec).

**Placeholder scan:** No TBD/TODO; every code and prose artifact is written in full. The one conditional instruction (Task 4 Step 1's note about `generate.test.mjs` imports) directs the implementer to match existing conventions and is a real safeguard, not a placeholder.

**Type consistency:** `validateAgent({ fileName, source })` and `validateAgentRouting(source)` are defined in Task 1/2 and consumed by the same test files; `code-executor`/`reviewer` names are used identically in `agents/`, `agent-routing.md`, and the migrated skill; tier tokens are exactly `fast`/`balanced`/`deep` throughout.

## Execution Notes

- Task order is dependency-correct: the guard (1) precedes the reference (2) precedes the agents it validates (3) precedes the skill that dispatches them (4).
- After Task 4, dogfood manually (out of automated scope): run `/sync-figma-tokens` against a multi-adapter system and confirm the orchestrator dispatches a `code-executor` per adapter on the fast tier and a `reviewer` on balanced — the real proof the routing works end to end.
