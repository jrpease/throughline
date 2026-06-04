# Skill 0 Intake & Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Locate → Scan → Brief intake step to `figma-environment-setup` so the skill detects what the user is starting from — greenfield, existing repo, or existing monorepo — and sets expectations before taking any action.

**Architecture:** Two file changes: (1) extend `manifest-schema.md` with two new `workspace` fields (`origin`, `detectedLayers`), then (2) rewrite `figma-environment-setup/skill.md` to insert Step 0 and renumber existing steps. No new files. No changes to any other skill in this phase — downstream brownfield adaptation is phase 2.

**Tech Stack:** Markdown instruction files. No executable code. Verification is a structured self-review checklist, not automated tests.

---

## File Map

| Action | File | What changes |
|---|---|---|
| Modify | `references/manifest-schema.md` | Add `origin` + `detectedLayers` to JSON block; add field docs; add immutability rule |
| Modify | `skills/figma-environment-setup/skill.md` | Insert Step 0 (Locate → Scan → Brief); update Step 2 (formerly Step 1) with skip-if-exists note; renumber all steps |

---

## Task 1: Extend the Manifest Schema

**Files:**
- Modify: `references/manifest-schema.md`

- [ ] **Step 1.1: Read the current manifest schema**

  Open `references/manifest-schema.md` and locate the `workspace` block in the JSON schema (around line 26–29). It currently looks like:

  ```json
  "workspace": {
    "name": "my-design-system",
    "localPath": ".",
    "stage": "folder"
  },
  ```

- [ ] **Step 1.2: Add the two new fields to the JSON schema block**

  Replace that block with:

  ```json
  "workspace": {
    "name": "my-design-system",
    "localPath": ".",
    "stage": "folder",
    "origin": null,
    "detectedLayers": {
      "monorepo": null,
      "storybook": null,
      "tokens": null,
      "syncLayer": null
    }
  },
  ```

  `null` for both fields at default — `null` means "not yet run" which is distinct from `false` ("run, not found") and `true` ("run, found"). This matters for detecting whether intake has run at all.

- [ ] **Step 1.3: Add field reference documentation**

  In the `### workspace` field reference section, find the entry for `stage` (the last bullet under `workspace`). After that bullet, add:

  ```markdown
  - `origin` — how the user's project was configured at intake time. Set **once** by
    `figma-environment-setup` Step 0 and never overwritten by any downstream skill.
    Values:
    - `"greenfield"` — empty or newly created folder; no repo or tooling detected
    - `"existing-repo"` — `package.json` present but no monorepo config; user will need
      to convert to monorepo before the code phase
    - `"existing-monorepo"` — both `turbo.json` and `pnpm-workspace.yaml` present; code
      phase skills should adapt rather than scaffold from scratch
    - `"unknown"` — scan was inconclusive; treat conservatively (prompt the user)
    - `null` — intake has not yet run (default)

  - `detectedLayers` — snapshot of tooling found in the working directory at intake time.
    Written by `figma-environment-setup` Step 0, read by downstream skills to adapt
    behavior. `null` = not yet scanned. `false` = scanned, not found. `true` = found.
    - `monorepo` — both `turbo.json` and `pnpm-workspace.yaml` are present
    - `storybook` — `.storybook/` directory is present
    - `tokens` — `tokens.json` or a `tokens/` directory is present
    - `syncLayer` — `style-dictionary.config.js` or `*.style-dictionary.js` files present
  ```

- [ ] **Step 1.4: Add the immutability rule**

  In the `## Rules for skills touching the manifest` section, add a sixth rule after the existing five:

  ```markdown
  6. **`workspace.origin` is immutable after intake.** Written once by
     `figma-environment-setup` Step 0 and must not be overwritten by any downstream
     skill. Skills read it to adapt behavior — they do not modify it.
  ```

- [ ] **Step 1.5: Verify the changes are internally consistent**

  Read through the modified `manifest-schema.md` and check:
  - [ ] The JSON schema block contains `origin: null` and `detectedLayers` with four `null` keys
  - [ ] The field reference for `origin` lists all four string values plus `null`
  - [ ] The field reference for `detectedLayers` lists all four keys (`monorepo`, `storybook`, `tokens`, `syncLayer`) matching the JSON block exactly
  - [ ] The immutability rule is rule 6 (not a duplicate of an existing rule)
  - [ ] No existing content was accidentally deleted

- [ ] **Step 1.6: Commit**

  ```bash
  git add references/manifest-schema.md
  git commit -m "feat(manifest): add workspace.origin and detectedLayers fields"
  ```

---

## Task 2: Rewrite figma-environment-setup/skill.md

**Files:**
- Modify: `skills/figma-environment-setup/skill.md`

This task has two parts: insert the new Step 0 content, then renumber the existing steps.

---

### Part A — Insert Step 0

- [ ] **Step 2.1: Read the current skill file**

  Open `skills/figma-environment-setup/skill.md`. The first step heading is currently:

  ```
  ## Step 1 — Create the working folder and manifest
  ```

  Step 0 is inserted immediately before this heading, after the `Read references/manifest-schema.md...` line.

- [ ] **Step 2.2: Insert Step 0 — Phase 1 (Locate)**

  Insert the following content before the current `## Step 1` heading:

  ````markdown
  ## Step 0 — Intake (Locate → Scan → Brief)

  This step runs before everything else. Establish where you're working, read
  what's already there, and set the user's expectations before taking any action.
  It has three phases in sequence.

  ### Phase 1: Locate

  Open by surfacing the user's current working directory and presenting three
  explicit options — no assumptions made about where they want to work or whether
  they have started anything already:

  > "Before we get started, I want to make sure we're working in the right place.
  > You're currently in: `[current working directory path]`
  >
  > Where should we set up?
  > - **Here** — this directory is where the design system should live
  > - **Somewhere else** — I have a project at a different path
  > - **A new folder** — create a fresh folder somewhere"

  **"Here":** Proceed to the existing manifest check below.

  **"Somewhere else":** Ask for the path. Verify it exists on disk (`ls` or
  equivalent — just check the directory is real). If it doesn't exist, ask them
  to double-check the spelling. Once confirmed, proceed to the existing manifest
  check.

  **"A new folder":** Ask what they'd like to name it and where it should live
  (suggest the current directory as the default). Create it. Confirm where it was
  created: "I've created `[name]` at `[full path]`." Proceed to the existing
  manifest check.

  **Existing manifest check:** Before scanning, check whether `design-system.json`
  already exists in the confirmed directory.

  - **If it exists:** Read it. If `schemaVersion` is out of date, migrate forward
    (add missing fields with defaults, bump `schemaVersion` — do not delete
    unrecognised fields). Tell the user:
    > "Looks like we've worked here before — I'll pick up where we left off."
    Skip Phases 2 and 3. Continue into Step 2 with the existing manifest loaded.

  - **If it does not exist:** Proceed to Phase 2.
  ````

- [ ] **Step 2.3: Insert Step 0 — Phase 2 (Scan)**

  Immediately after the Phase 1 content, insert:

  ````markdown
  ### Phase 2: Scan

  Scan the confirmed directory for the following signals. Check in priority order
  — monorepo status is the most consequential and is checked first.

  | Signal | What it means |
  |---|---|
  | `turbo.json` **and** `pnpm-workspace.yaml` both present | Already a monorepo |
  | `package.json` present, no `turbo.json` or `pnpm-workspace.yaml` | Repo exists, not yet a monorepo |
  | `.storybook/` directory present | Storybook already installed |
  | `tokens.json` or `tokens/` directory present | Existing token pipeline |
  | `style-dictionary.config.js` or `*.style-dictionary.js` files present | Existing sync layer |

  After scanning, write the findings to `design-system.json` (creating it if it
  does not exist, using schema defaults for all other fields):

  ```json
  "workspace": {
    "origin": "<greenfield|existing-repo|existing-monorepo|unknown>",
    "detectedLayers": {
      "monorepo": <true|false>,
      "storybook": <true|false>,
      "tokens": <true|false>,
      "syncLayer": <true|false>
    }
  }
  ```

  **Setting `origin`:**
  - No `package.json` found → `"greenfield"`
  - `package.json` found, no `turbo.json`/`pnpm-workspace.yaml` → `"existing-repo"`
  - Both `turbo.json` and `pnpm-workspace.yaml` found → `"existing-monorepo"`
  - Signals present but contradictory or incomplete → `"unknown"`

  **Setting `detectedLayers`:** set each boolean independently from the table
  above. A directory can have `origin: "existing-monorepo"` and
  `detectedLayers.storybook: false` — they are independent fields.

  **Do not overwrite `workspace.origin` on subsequent runs.** If it is already
  set to a non-null value, skip the scan and proceed to Phase 3.
  ````

- [ ] **Step 2.4: Insert Step 0 — Phase 3 (Brief)**

  Immediately after the Phase 2 content, insert:

  ````markdown
  ### Phase 3: Brief

  Produce a short, warm, plain-language situational summary. The goal is to set
  expectations so nothing downstream feels like a surprise. No jargon. No alarm.
  If something requires action before a later skill can run, say so as a
  heads-up, not a warning.

  **Format:**

  > "Here's what I found in `[path]`:
  > [plain-language bullet list of detected signals and what they mean]
  >
  > Here's what that means for us:
  > [brief tailored roadmap: what works the same, what will be different, what
  > to know before we hit it]
  >
  > Ready to continue?"

  **By scenario:**

  *Greenfield (no signals detected):*
  > "Clean slate — we're building everything fresh. Ready to continue?"

  *Existing single repo (`origin: "existing-repo"`):*
  > "Here's what I found in `[path]`:
  > - You have an existing repo, but it's not yet set up as a monorepo
  > [any additional detected layers, one bullet each]
  >
  > Here's what that means for us: everything in the Figma phase — tokens,
  > components, variables — works exactly the same. When we get to the code
  > phase, you'll need to convert this repo to a monorepo first. I'll walk you
  > through that step-by-step when we get there — it's a one-time setup.
  > [one line per additional detected layer, e.g.: 'Storybook is already installed
  > — we'll build on top of what you have rather than starting fresh.']
  >
  > Ready to continue?"

  *Existing monorepo (`origin: "existing-monorepo"`):*
  > "Here's what I found in `[path]`:
  > - Your repo is already set up as a monorepo ✓
  > [any additional detected layers, one bullet each]
  >
  > Here's what that means for us: you're already in great shape for the code
  > phase. We'll build the Figma side first, then work inside your existing
  > monorepo structure when we get to code.
  > [one line per additional detected layer]
  >
  > Ready to continue?"

  *Unknown:*
  > "Here's what I found in `[path]`:
  > - I can see some project files but I'm not sure of the full setup
  >
  > Before we continue: do you have an existing git repo here? And is it already
  > set up as a monorepo (does it have a `turbo.json` or `pnpm-workspace.yaml`)?"
  >
  > Wait for the user to clarify, then update `workspace.origin` manually based
  > on their answer before proceeding.

  Once the user confirms they're ready, proceed to Step 2.
  ````

---

### Part B — Renumber Existing Steps

- [ ] **Step 2.5: Renumber all existing step headings**

  Find and replace every existing step heading in the file. The old heading text and the exact new heading text:

  | Find (exact) | Replace with (exact) |
  |---|---|
  | `## Step 1 — Create the working folder and manifest` | `## Step 2 — Create the working folder and manifest` |
  | `## Step 1.5 — Calibrate the coding level` | `## Step 2.5 — Calibrate the coding level` |
  | `## Step 2 — Choose the Figma write mechanism` | `## Step 3 — Choose the Figma write mechanism` |
  | `## Step 3 — Connect to Figma (Console MCP path)` | `## Step 4 — Connect to Figma (Console MCP path)` |
  | `### 3a.` | `### 4a.` |
  | `### 3b.` | `### 4b.` |
  | `### 3c.` | `### 4c.` |
  | `### 3d.` | `### 4d.` |
  | `## Step 3 (alt) — Connect to Figma (official plugin path)` | `## Step 4 (alt) — Connect to Figma (official plugin path)` |
  | `## Step 4 — Capture the file key` | `## Step 5 — Capture the file key` |
  | `## Step 5 — Liveness check` | `## Step 6 — Liveness check` |
  | `## Step 5.5 — Create the Cover page` | `## Step 6.5 — Create the Cover page` |
  | `## Step 6 — Hand off` | `## Step 7 — Hand off` |

  Also find any **inline references** to old step numbers in the body text (e.g. "the repository-builder skill handles that" and similar step cross-references) and update those too.

- [ ] **Step 2.6: Update Step 2 (formerly Step 1) with skip-if-exists note**

  At the top of the `## Step 2 — Create the working folder and manifest` section, add this note before the existing content:

  ```markdown
  **When Step 0 already handled this:** if the user chose "Here" or "Somewhere
  else" in Step 0 Phase 1, the directory already exists and `design-system.json`
  has already been created or loaded. In that case, skip folder creation and
  manifest initialization — the only thing to confirm here is that
  `workspace.name` is set. If it is `null` or `"my-design-system"` (the
  placeholder default), ask the user what they'd like to name their design system
  and update the field. Otherwise proceed to Step 2.5.
  ```

- [ ] **Step 2.7: Update the "What this skill must NOT do" list**

  Find `## What this skill must NOT do` at the bottom of the file. Add one item to the list:

  ```markdown
  - Never overwrite `workspace.origin` once it has been set — it is immutable
    after intake.
  ```

- [ ] **Step 2.8: Verify the full skill file**

  Read through the modified `skill.md` and check:
  - [ ] Step 0 appears before Step 2 with no Step 1 heading in between
  - [ ] All three phases (Locate, Scan, Brief) are present in Step 0
  - [ ] The existing manifest check is in Phase 1 (before the scan runs)
  - [ ] The scan table has 5 rows, no duplicate signals
  - [ ] All four `origin` values are listed in Phase 2 (`"greenfield"`, `"existing-repo"`, `"existing-monorepo"`, `"unknown"`)
  - [ ] The briefing has examples for all four scenarios (greenfield, existing-repo, existing-monorepo, unknown)
  - [ ] No old step number (Step 1, Step 2, Step 3, Step 4, Step 5, Step 6 in the old numbering) appears as a heading — verify with a search
  - [ ] Subsection headings `### 3a` through `### 3d` are now `### 4a` through `### 4d`
  - [ ] The "must NOT do" list includes the `workspace.origin` immutability rule
  - [ ] No existing content was accidentally deleted

- [ ] **Step 2.9: Commit**

  ```bash
  git add skills/figma-environment-setup/skill.md
  git commit -m "feat(skill-0): add intake step (Locate → Scan → Brief)"
  ```

---

## Done

Both files updated, both committed. The intake step is live in skill 0. Downstream skill brownfield modes (reading `workspace.origin` to adapt behavior) are phase 2 — tracked separately.
