# Brownfield Retrofit — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the cross-cutting groundwork for brownfield retrofits — manifest v4 sections, a canonical brownfield reference with the 7 guardrails + verification triad, and the B1–B4 "never assert state without a verified read" hardening in the Figma scripting and environment-setup skills.

**Architecture:** Four markdown-only file changes. (1) Extend `references/manifest-schema.md` to schemaVersion 4 with `audit` / `tokenCrosswalk` / `retrofit` sections, a `"retrofit"` intake mode, and clarified publish-state field docs (B3). (2) Create `references/brownfield-retrofit.md` as the canonical home for the unified read-discipline principle, the 7 DON'T guardrails, the safe sequence, and the verification triad. (3) Harden `references/figma-scripting.md`: live-vs-stale bridge-port discipline (B4) and a new read-discipline section (B1/B2). (4) Fix the `figma-environment-setup` Step 6 liveness check so it never reports counts from a cheap/early read (B1/B2). No executable code, no new skills, no routing changes (those land in Plan 3). Greenfield paths are untouched.

**Tech Stack:** Markdown instruction files. No build, no automated tests (the plugin ships no test harness). Verification is a structured self-review checklist plus a JSON-validity check on the manifest schema block, matching the house style of prior plans in `docs/superpowers/plans/`.

---

## File Map

| Action | File | What changes |
|---|---|---|
| Modify | `references/manifest-schema.md` | Bump schemaVersion 3→4; add `audit`, `tokenCrosswalk`, `retrofit` to JSON block + field docs; add `"retrofit"` to `tokens.intakeMode`; clarify `figma.canPublish`/`libraryPublished` docs for B3 |
| Create | `references/brownfield-retrofit.md` | Unified read-discipline principle (B1–B4); the 7 DON'T guardrails; the safe retrofit sequence; the verification triad |
| Modify | `references/figma-scripting.md` | Rewrite the bridge-instance preflight for live-vs-stale (B4); add a "Read discipline" section (B1/B2) |
| Modify | `skills/figma-environment-setup/SKILL.md` | Step 6: apply read discipline — prove connection cheaply, never report inventory counts from that probe; point at the new reference |

---

## Task 1: Manifest schema → v4

**Files:**
- Modify: `references/manifest-schema.md`

- [ ] **Step 1.1: Bump the schemaVersion in the heading and JSON block**

  In `references/manifest-schema.md`, change the section heading on line 14 from:

  ```markdown
  ## Schema (schemaVersion 3)
  ```

  to:

  ```markdown
  ## Schema (schemaVersion 4)
  ```

  And in the JSON block, change line 18 from:

  ```json
    "schemaVersion": 3,
  ```

  to:

  ```json
    "schemaVersion": 4,
  ```

- [ ] **Step 1.2: Add the three new sections to the JSON schema block**

  In the JSON block, find the `storybook` block and the trailing `completedSkills`
  line (lines 81–86):

  ```json
    "storybook": {
      "initialized": false,
      "chromatic": false,
      "codeConnect": false
    },
    "completedSkills": []
  }
  ```

  Replace it with (insert the three new sections before `completedSkills`):

  ```json
    "storybook": {
      "initialized": false,
      "chromatic": false,
      "codeConnect": false
    },
    "audit": {
      "ranAt": null,
      "codeSurface": null,
      "figmaInventory": null,
      "percentSemantic": null
    },
    "tokenCrosswalk": {
      "path": null,
      "statusCounts": null,
      "validatorPassing": null
    },
    "retrofit": {
      "phase": null,
      "startedAt": null,
      "completedAt": null,
      "journalScaffolded": false
    },
    "completedSkills": []
  }
  ```

  Defaults are `null` ("not yet run") rather than `false`/`{}` so downstream skills
  can distinguish "audit has never run" from "audit ran and found nothing" — the
  same `null`-vs-`false` discipline already used for `workspace.detectedLayers`.

- [ ] **Step 1.3: Add `"retrofit"` to the `tokens.intakeMode` documentation**

  In the `### tokens` field reference, find the `intakeMode` bullet (lines 171–173):

  ```markdown
  - `intakeMode` — how the user started: `"generative"` (seed expanded by AI),
    `"descriptive"` (from aesthetic direction), or `"import"` (existing set
    organized). Recorded so later runs know how the system was built.
  ```

  Replace it with:

  ```markdown
  - `intakeMode` — how the user started: `"generative"` (seed expanded by AI),
    `"descriptive"` (from aesthetic direction), `"import"` (existing set
    organized), or `"retrofit"` (a mature codebase **and** a populated Figma file
    reconciled onto tokens — the brownfield path; differs from `"import"` by having
    existing code bindings to inspect and converge). Recorded so later runs know how
    the system was built.
  ```

- [ ] **Step 1.4: Clarify the B3 publish-state field docs**

  In the `### figma` field reference, find the `canPublish` and `libraryPublished`
  bullets (lines 160–166):

  ```markdown
  - `canPublish` — whether the user can publish a Figma **team library** (requires
    a paid plan, Professional+). `true` / `false` / `null` (unknown / not yet
    asked). Asked once and recorded; gates the typed instance-swap dropdown path.
    See `${CLAUDE_PLUGIN_ROOT}/references/figma-publishing.md`.
  - `libraryPublished` — whether the user has published the file as a library at
    least once (so local component keys resolve for `INSTANCE_SWAP`). User-driven
    and manual; the plugin verifies, never publishes.
  ```

  Replace with:

  ```markdown
  - `canPublish` — whether the user can publish a Figma **team library** (requires
    a paid plan, Professional+). `true` / `false` / `null` (unknown / not yet
    asked). Asked once and recorded; gates the typed instance-swap dropdown path.
    See `${CLAUDE_PLUGIN_ROOT}/references/figma-publishing.md`.
  - `libraryPublished` — whether the user has published the file as a library at
    least once (so local component keys resolve for `INSTANCE_SWAP`). User-driven
    and manual; the plugin verifies, never publishes. **Treat the default `false`
    as _unverified_, not "definitely not published" (bug B3): before asserting a
    library is unpublished, attempt detection (`figma_get_library_components` /
    `figma_get_library_variables`); if detection is inconclusive, ask the user once
    and record the answer here. Never silently assume unpublished — see the read
    discipline in `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`.**
  ```

- [ ] **Step 1.5: Add field-reference docs for the three new sections**

  In the field reference, find the `### storybook` block (lines 247–250) and insert
  three new field-reference blocks immediately after it, before `### completedSkills`:

  ```markdown
  ### `audit`
  Populated by the `design-system-audit` skill (brownfield front door). `null` in
  every field until that skill runs. Records the measured state of a pre-existing
  system so the retrofit can be right-sized.
  - `ranAt` — ISO timestamp the audit last ran.
  - `codeSurface` — object of counts sizing the code-side retrofit, e.g.
    `{ "scssColorVars": 692, "tailwindColorClasses": 230, "jsColorsUsages": 74,
    "rawHexRgba": 143, "svgFills": 430 }`. Keys vary by what the repo actually uses.
  - `figmaInventory` — object snapshot of the existing Figma file from explicit
    per-class reads, e.g. `{ "variables": 0, "bindings": 0, "textStyles": 0,
    "effectStyles": 0, "modes": [] }`. Each count comes from a verified read, never
    an assumption (see `brownfield-retrofit.md`).
  - `percentSemantic` — integer 0–100: how much of the existing system is already
    semantic. The single number that decides rename+cleanup vs. rewrite.

  ### `tokenCrosswalk`
  Populated by the `token-crosswalk-builder` skill. Points at the backbone artifact
  that maps new token ↔ old Figma token ↔ code identifier.
  - `path` — repo-relative path to the crosswalk file (e.g. `"tokens/crosswalk.json"`),
    or `null` if not yet built. The manifest stores the pointer, not the map.
  - `statusCounts` — object counting crosswalk rows by `status`, e.g.
    `{ "aligned": 12, "renamed": 151, "driftFix": 2, "added": 42, "mappedNearest": 3 }`.
  - `validatorPassing` — `true`/`false`/`null`: whether the last crosswalk validator
    run passed (resolved value == new value for every row).

  ### `retrofit`
  Populated by the `retrofit-planner` orchestrator. Tracks where a multi-phase
  retrofit stands so a later session can resume.
  - `phase` — one of `"audit"`, `"refine"`, `"rebind"`, `"sync"`, `"baseline"`,
    `"code"`, `"cleanup"`, `"done"`, or `null` (no retrofit in progress). Phases run
    in that order; see the safe sequence in
    `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`.
  - `startedAt` / `completedAt` — ISO timestamps bounding the retrofit.
  - `journalScaffolded` — whether the `docs/design-system/` decision journal has been
    created for this retrofit (offered default-on by `retrofit-planner`).
  ```

- [ ] **Step 1.6: Verify the JSON schema block is valid JSON**

  Run (from the repo root):

  ```bash
  python3 -c "import json,re,sys; t=open('references/manifest-schema.md').read(); m=re.search(r'\`\`\`json\n(\{.*?\n\})\n\`\`\`', t, re.S); json.loads(m.group(1)); print('valid JSON, schemaVersion =', json.loads(m.group(1))['schemaVersion'])"
  ```

  Expected output:

  ```
  valid JSON, schemaVersion = 4
  ```

  If it errors, fix the trailing-comma / brace problem it reports and re-run.

- [ ] **Step 1.7: Self-review the schema edit**

  Confirm, by re-reading the changed regions:
  - The JSON block and the field-reference prose agree on every new field name
    (`audit.ranAt`, `audit.codeSurface`, `audit.figmaInventory`, `audit.percentSemantic`,
    `tokenCrosswalk.path/statusCounts/validatorPassing`,
    `retrofit.phase/startedAt/completedAt/journalScaffolded`).
  - The migration rule already in the doc ("Migrate forward on `schemaVersion`
    mismatch", rules section) still covers v3→v4 — it does, because it adds missing
    fields with defaults. No edit needed there.

- [ ] **Step 1.8: Commit**

  ```bash
  git add references/manifest-schema.md
  git commit -m "feat: manifest schema v4 — audit, tokenCrosswalk, retrofit sections + B3 publish-state doc"
  ```

---

## Task 2: Create the brownfield-retrofit reference

**Files:**
- Create: `references/brownfield-retrofit.md`

- [ ] **Step 2.1: Create the file with the full canonical content**

  Create `references/brownfield-retrofit.md` with exactly this content:

  ```markdown
  # Brownfield retrofit — read discipline, guardrails, safe sequence

  Canonical reference for retrofitting a design system onto a **mature codebase and
  an already-populated Figma file** (the brownfield path), as opposed to building
  greenfield. Read this before running `design-system-audit`, `token-crosswalk-builder`,
  `retrofit-planner`, or any brownfield branch of `token-builder`, `token-sync-layer`,
  or `storybook-chromatic-builder`.

  ## The read-discipline principle (fixes bugs B1–B4)

  **Never assert that something is absent, empty, unpublished, or stale without an
  explicit, completed read that returned that result.** "I didn't find X" must mean
  "I queried for X and the result was empty (after the file and all pages fully
  loaded)," never "I assumed X from Y." When a result is genuinely undetectable, ask
  the user once and persist the answer in the manifest — never guess.

  Concrete applications:

  - **Variables (B1).** Before counting variables, `await figma.loadAllPagesAsync()`.
    Treat a `0` count on a first read as suspect — re-read before reporting. An
    unexpectedly-empty result is a possible read/cache error, not ground truth. Prefer
    the dedicated `figma_get_variables` tool over a hand-written probe.
  - **Styles vs. variables (B2).** Text styles, effect/paint styles, and variables are
    **different surfaces**. Absence of variables says nothing about styles. Query each
    independently — variables (`figma_get_variables`), text styles
    (`figma_get_text_styles`), effect/paint styles (`figma_get_styles`) — and only
    report "none" for the specific class whose own read returned empty.
  - **Publish state (B3).** Treat a default/`false` `figma.libraryPublished` as
    _unverified_. Attempt detection first (`figma_get_library_components` /
    `figma_get_library_variables`, library component keys). If inconclusive, ask once
    ("Is this library published to a team library?") and persist to
    `figma.libraryPublished` / `figma.canPublish`. Frame the unpublished path as a
    graceful choice, not a failure.
  - **Bridge ports (B4).** Distinguish *live* concurrent bridge instances from
    *dead/stale* entries. Only block on genuinely live ones; reap or offer one-click
    cleanup for stale ones. See the bridge-instance preflight in
    `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`.

  ## The 7 guardrails (hard "DON'T" rules)

  Each cost real debugging time on a live retrofit. Treat each as a hard rule.

  1. **Don't bind line-height / letter-spacing variables to text styles.** Figma stores
     them as PERCENT; a unitless ratio var (`1.6`) rebinds as `1.6px` — catastrophic.
     **Font-size binding only** (px→px is safe).
  2. **Don't normalize float32 in Figma** — it is a no-op (Figma re-quantizes to float32
     on store). Normalize at the export boundary instead (`Math.round(v*100)/100`).
  3. **Don't delete-and-recreate variables to rename** — it unbinds everything. Rename
     in place to preserve Figma IDs (and therefore every existing binding).
  4. **Don't trust `tsc` / build to catch Tailwind color-utility removal** — deleted
     utilities become *silent no-ops*. Guard repo-wide (all `.tsx/.ts` minus generated
     + tests), and let Chromatic be the net.
  5. **Don't assume `build-storybook` exercises all SCSS** — story-unreachable modules
     (and a dead `@import` of a deleted partial) only fail when the real app renders.
     Run the app and spot-check 5–7 routes before declaring an SCSS change done.
  6. **Don't carry `/opacity` modifiers onto var-based tokens** — convert to
     `color-mix(in srgb, var(--…) NN%, transparent)` or channel-based alpha.
  7. **Don't hand-edit generated files** — change the source and re-run `tokens:sync`.

  ## The safe retrofit sequence

  Run these phases in order; `retrofit-planner` gates each one with a human
  confirmation. The ordering rules are not arbitrary — each prevents a specific class
  of damage.

  1. **audit** — measure both sides (`design-system-audit`). Size the code surface and
     inventory the Figma file with verified per-class reads.
  2. **refine** — rename/realign variables **in place** (`token-builder` brownfield
     branch). Never delete-and-recreate (guardrail 3); run a binding-survival audit.
  3. **rebind** — reconcile components onto the refined variables, preserving IDs.
  4. **sync** — run the sync layer with the brownfield transforms (alpha channels,
     opacity 0–100→0–1, float32 rounding at the export boundary).
  5. **baseline** — capture a Chromatic baseline **before** any code retrofit, so
     intended drift-fixes are distinguishable from regressions.
  6. **code** — retrofit the codebase with **dual output**: new and old tokens coexist
     during the transition.
  7. **cleanup** — remove old outputs **only** after a zero-reference grep passes (the
     repo-wide token-removal guard).

  ## The verification triad

  No single check catches everything; all three are necessary on every retrofit:

  1. **`check-types`** (TypeScript) — blind to Tailwind silent no-ops.
  2. **`build-storybook` + Chromatic snapshots** — the visual-regression net; blind to
     story-unreachable code. **Chromatic, not `tsc`/build, is the source of truth** for
     color-utility removal.
  3. **Run the actual app** + spot-check real routes — the only thing that exercises
     story-unreachable SCSS.
  ```

- [ ] **Step 2.2: Self-review against the spec**

  Open `docs/superpowers/specs/2026-06-25-brownfield-retrofit-design.md` §3 and §7.
  Confirm the new reference contains: the unified principle with all four bug
  applications (B1–B4), all 7 guardrails verbatim in intent, the 7-phase safe
  sequence with the same phase names as the `retrofit.phase` enum in Task 1
  (`audit/refine/rebind/sync/baseline/code/cleanup/done`), and the 3-part
  verification triad. Fix any drift inline.

- [ ] **Step 2.3: Commit**

  ```bash
  git add references/brownfield-retrofit.md
  git commit -m "feat: add brownfield-retrofit reference — read discipline, 7 guardrails, safe sequence, verification triad"
  ```

---

## Task 3: Harden figma-scripting.md (B4 + B1/B2)

**Files:**
- Modify: `references/figma-scripting.md`

- [ ] **Step 3.1: Rewrite the bridge-instance preflight for live-vs-stale (B4)**

  In `references/figma-scripting.md`, replace the entire
  "## Preflight: one bridge instance per file (concurrent-write corruption)"
  section (lines 10–18) with:

  ```markdown
  ## Preflight: one *live* bridge instance per file (concurrent-write corruption)

  Before any write, call **`figma_get_status`** and inspect `otherInstances`.
  Concurrent writes from two **live** Desktop Bridge instances connected to the same
  `fileKey` collide and produce **truncated parent frames and orphaned node
  fragments** at negative coordinates — damage a screenshot won't reveal. So a second
  *live* instance is a hard stop.

  **But do not hard-block on _stale_ entries (bug B4).** Users routinely hit a wall
  where `otherInstances` lists ports they never opened — phantom/stale connections
  left by a plugin reload, a file switch, or an MCP reconnect that spawned a new port
  without reaping the old one. Telling them to "close the other instance" is useless
  when they never opened one. Distinguish the two cases before blocking:

  1. **Verify liveness, don't assume it.** Treat an `otherInstances` entry as
     *suspected stale* until confirmed live. If the MCP exposes a liveness/heartbeat
     signal, use it; otherwise attempt a `figma_reconnect` (or re-read
     `figma_get_status`) — stale ports typically drop out after a reconnect.
  2. **Only the genuinely-live count blocks.** If exactly one live instance remains
     after reaping stale entries, proceed. Only block when **two or more** instances
     are confirmed live.
  3. **If you must block, be actionable.** Name the exact ports, state which are
     suspected stale vs. live, and give a concrete clear path (run `figma_reconnect`,
     reload the bridge plugin, or restart the MCP client) — never a bare "shut down
     the others." If only stale entries remain and they won't clear, say so plainly
     and let the user proceed rather than dead-ending them.

  This is the bridge-side application of the read-discipline principle
  (`${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`): don't assert "another
  instance is active" without confirming it's actually live.
  ```

- [ ] **Step 3.2: Add a read-discipline section (B1/B2)**

  Immediately after the section you just rewrote (before
  "## `dynamic-page` mode: use the async APIs"), insert:

  ```markdown
  ## Read discipline: never report "empty" without a verified read (B1/B2)

  Before reporting that a file has no variables, no text styles, or no effect styles,
  you MUST have run an explicit read **for that specific class** that returned empty —
  after the file is fully loaded. Two real bugs came from violating this:

  - **B1** — a first read returned `0` variables on a fully-populated file (stale/early
    read) and was reported as fact. **Fix:** `await figma.loadAllPagesAsync()` before
    counting; treat a `0` on first read as suspect and re-read before reporting; prefer
    the dedicated `figma_get_variables` tool (handles `dynamic-page`, resolves aliases).
  - **B2** — "no text styles" was asserted because no text *variables* were found —
    styles were never read. **Fix:** variables and styles are different surfaces. Read
    each independently: variables (`figma_get_variables`), text styles
    (`figma_get_text_styles`), effect/paint styles (`figma_get_styles`). Report "none"
    only for the class whose own read came back empty.

  An unexpectedly-empty result is a possible read error, not ground truth. See the
  full principle in `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`.
  ```

- [ ] **Step 3.3: Self-review**

  Re-read the two new/changed sections. Confirm: the preflight no longer instructs an
  unconditional "stop and warn"; it blocks only on ≥2 confirmed-live instances and
  gives actionable guidance otherwise. Confirm the read-discipline section names the
  three distinct read tools and cross-links `brownfield-retrofit.md`. Confirm the file
  still reads coherently top-to-bottom (the intro paragraph on lines 3–8 still fits).

- [ ] **Step 3.4: Commit**

  ```bash
  git add references/figma-scripting.md
  git commit -m "fix: bridge-port live-vs-stale discipline (B4) + read discipline section (B1/B2)"
  ```

---

## Task 4: Fix the figma-environment-setup liveness read (B1/B2)

**Files:**
- Modify: `skills/figma-environment-setup/SKILL.md`

- [ ] **Step 4.1: Rewrite the Step 6 liveness probe so it never reports inventory counts**

  In `skills/figma-environment-setup/SKILL.md`, find the opening paragraph of
  "## Step 6 — Liveness check (prove it actually works)" (lines 322–326):

  ```markdown
  Don't declare success on faith. Run one trivial **read** against Figma to prove
  the connection is live — for example, fetch a quick summary of the file's
  existing variables/styles (a low-cost call). If it succeeds:
  ```

  Replace with:

  ```markdown
  Don't declare success on faith. Run one trivial **read** against Figma to prove
  the connection is live — for example, a low-cost call such as reading the file
  name or a single variable collection. This probe proves *connectivity only*.

  **Do not report an inventory from this probe (bugs B1/B2).** A cheap or early read
  can come back empty on a fully-populated file (pages not yet loaded, cache/read
  error), and reporting "0 variables" or "no text styles" off the back of it is a
  confidence-destroying first impression. Proving the connection is live is a
  separate concern from inventorying what's in the file — the full per-class
  inventory (with `loadAllPagesAsync` and independent reads for variables, text
  styles, and effect styles) belongs to the `design-system-audit` skill, which
  applies the read discipline in
  `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`. Here, only confirm the
  call succeeded — never announce counts.

  If the liveness probe succeeds:
  ```

- [ ] **Step 4.2: Self-review**

  Re-read Step 6 end-to-end. Confirm: the success branch (set `figma.connected`,
  `lastVerified`, append to `completedSkills`) and both failure branches (A: server
  never started; B: connection failed) are unchanged and still flow correctly after
  the rewritten opening. Confirm the skill no longer instructs reporting a
  variable/style summary to the user at this step.

- [ ] **Step 4.3: Commit**

  ```bash
  git add skills/figma-environment-setup/SKILL.md
  git commit -m "fix: env-setup liveness proves connectivity only, never reports inventory (B1/B2)"
  ```

---

## Self-Review (run after all tasks)

**1. Spec coverage** (against `docs/superpowers/specs/2026-06-25-brownfield-retrofit-design.md`):
- §3 unified principle (B1–B4) → Task 2 (reference) + Task 3 (figma-scripting) + Task 4 (env-setup). ✓
- §7 guardrails + safe sequence + verification triad → Task 2. ✓
- §8 manifest v4 (`audit`, `tokenCrosswalk`, `retrofit`, `intakeMode` retrofit, B3 doc) → Task 1. ✓
- §4/§5 new skills, branches, routing, baseline, scripts, journal → **deferred to Plans 2 & 3** (out of scope here, by design). Confirm none were accidentally required by Plan 1's edits — they are not; Plan 1 only references the future skills by name in docs.

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later" in any task. Every edit shows the exact before/after text.

**3. Type/name consistency:** The `retrofit.phase` enum values in Task 1 Step 1.5
(`audit/refine/rebind/sync/baseline/code/cleanup/done`) match the safe-sequence phase
names in Task 2 Step 2.1. The new manifest field names in the JSON block (Task 1
Step 1.2) match the field-reference prose (Task 1 Step 1.5). The reference filename
`brownfield-retrofit.md` is identical across Tasks 1, 3, and 4 cross-links.

---

## Execution Handoff

Plan 1 of 3. After this ships, Plan 2 (scripts + crosswalk skill) and Plan 3 (audit/
retrofit-planner skills, existing-skill brownfield branches, env-setup routing+baseline,
journal) get written and executed in turn.
