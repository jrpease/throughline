# Skill 0 Intake & Routing Design

**Date:** 2026-06-04
**Status:** Approved
**Scope:** `figma-environment-setup` (skill 0)

## Problem

Skill 0 currently assumes the user is starting from scratch and in the correct directory when they trigger it. In practice:

- Greenfield users may have already created their project folder and simply want to use it — skill 0 currently creates a nested folder inside it
- Brownfield users (existing repo, existing monorepo, partial design systems) have no detection or routing — they hit confusing failures mid-flow when downstream skills assume a fresh setup
- The "existing repo → needs monorepo conversion" gap is the single biggest routing failure, but it surfaces late and without warning

## Solution

Add a new **Step 0 (Intake)** to `figma-environment-setup`, inserted before all existing steps. It runs three phases in sequence — **Locate → Scan → Brief** — then hands off to the existing skill 0 flow, adapted based on findings.

## What This Does NOT Do

- Does not add brownfield capability to individual downstream skills (that is phase 2)
- Does not automate monorepo conversion (that stays as a guided walkthrough, triggered by downstream skills when they detect `workspace.origin = "existing-repo"`)
- Does not change anything after the intake — all existing skill 0 steps (Figma connection, coding level calibration, cover page, etc.) are unchanged

---

## Design

### Step 0 — Intake

#### Phase 1: Locate

Skill 0 opens by surfacing the current working directory and offering three explicit options — no assumptions made:

> *"Before we get started, I want to make sure I'm working in the right place. Here's where you currently are: `[current path]`"*
>
> - **Use this directory** — this is where the design system should live
> - **My project is somewhere else** — I'll provide the path
> - **Create a new folder** — I want a fresh folder somewhere

**"Use this directory":** proceed directly to the scan.

**"My project is somewhere else":** ask for the path, verify it exists on disk, confirm with the user, then proceed to scan. If the path doesn't exist, ask them to double-check.

**"Create a new folder":** ask for a name and where it should live (defaulting to current directory), create it, confirm its location in plain language, then proceed to scan.

**Existing manifest check:** before scanning, check if `design-system.json` already exists in the confirmed directory. If it does, read it, migrate if needed (`schemaVersion` mismatch), and tell the user:

> *"Looks like we've worked here before — I'll pick up where we left off."*

Skip the rest of the intake and continue into skill 0's normal flow with the existing manifest loaded.

---

#### Phase 2: Scan

Once the directory is confirmed, scan for the following signals in priority order:

| Signal | Interpretation |
|---|---|
| `turbo.json` + `pnpm-workspace.yaml` | Already a monorepo ✅ |
| `package.json` (no turbo/pnpm-workspace) | Repo exists, not yet a monorepo ⚠️ |
| `.storybook/` directory | Storybook already installed |
| `tokens.json`, `tokens/` directory | Existing token pipeline |
| `style-dictionary.config.js`, custom transform files | Existing sync layer |

Monorepo status is checked first — it is the most consequential signal and determines the primary routing fork.

---

#### Phase 3: Situational Briefing

After scanning, produce a short, warm, plain-language summary before any action is taken. Format:

> *"Here's what I found in `[path]`:"*
> *(plain-language list of detected signals and what they mean)*
>
> *"Here's what that means for us:"*
> *(brief tailored roadmap — what will work the same, what will be different, what the user needs to know before we hit it)*
>
> *"Ready to continue?"*

**Tone:** reassuring, not alarming. No jargon. The goal is to set expectations so nothing downstream feels like a surprise.

**Greenfield (empty or new folder):** the briefing collapses to a single confirming line:
> *"Clean slate — we're building everything fresh."*

**Existing single repo example:**
> *"Here's what I found in `~/Dev/my-app`:"*
> *- You have an existing repo, but it's not yet set up as a monorepo*
> *- Storybook is already installed*
> *- No existing token pipeline detected*
>
> *"Here's what that means for us: everything in the Figma phase (tokens, components, variables) works exactly the same. When we get to the code phase, you'll need to convert this to a monorepo — I'll walk you through that step by step when we get there. Storybook is already here so we'll build on top of what you have rather than starting fresh."*

---

### Routing Outcomes

Three primary states after the scan:

**Greenfield**
Nothing changes in the existing skill 0 flow. Folder creation is skipped if they're already in the right place. Normal flow continues.

**Existing single repo (`package.json`, no monorepo config)**
Skill 0 continues unchanged — Figma connection, coding level calibration, cover page all work fine. Downstream code skills (`token-sync-layer`, `storybook-chromatic-builder`) do not change in this phase — their brownfield modes are phase 2 work. What changes is the user has already been warned by the briefing, so when those skills surface the monorepo requirement, it is expected rather than surprising.

**Existing monorepo (`turbo.json` + `pnpm-workspace.yaml`)**
Skill 0 continues normally. The briefing confirms the user is already set up for the code phase. Downstream skill adaptation (skipping scaffolding, reading existing structure) is phase 2 work — the manifest fields written here give those skills the data they need when the time comes.

Storybook and token pipeline detections do not change routing in this phase — they are recorded in the manifest for downstream skills to read. The briefing surfaces them as context.

---

### Manifest Changes

Two new fields added to the `workspace` block in `design-system.json`:

```json
"workspace": {
  "name": "my-design-system",
  "localPath": ".",
  "stage": "folder",
  "origin": "greenfield",
  "detectedLayers": {
    "monorepo": false,
    "storybook": false,
    "tokens": false,
    "syncLayer": false
  }
}
```

**`workspace.origin`**
Set once at intake, never overwritten by downstream skills. Values:
- `"greenfield"` — empty or new folder
- `"existing-repo"` — has `package.json`, not yet a monorepo
- `"existing-monorepo"` — has `turbo.json` + `pnpm-workspace.yaml`
- `"unknown"` — scan was inconclusive

**`workspace.detectedLayers`**
Snapshot of what was found at intake time. Boolean flags. Skills read these to adapt behavior. This is the foundation for brownfield skill modes in phase 2.

**`workspace.localPath`**
No change — stays `"."`. The manifest always lives at the root of the confirmed working directory regardless of where Claude Code was opened from.

**Schema rule:** `workspace.origin` is set once at intake and treated as immutable. Skills read it, never overwrite it.

---

### Skill 0 Step Renumbering

With the intake inserted as Step 0, existing steps shift:

| Before | After |
|---|---|
| Step 1 — Create the working folder and manifest | Step 2 — Create the working folder and manifest *(skipped if directory already exists)* |
| Step 1.5 — Calibrate the coding level | Step 2.5 — Calibrate the coding level |
| Step 2 — Choose the Figma write mechanism | Step 3 — Choose the Figma write mechanism |
| Step 3 — Connect to Figma | Step 4 — Connect to Figma |
| Step 4 — Capture the file key | Step 5 — Capture the file key |
| Step 5 — Liveness check | Step 6 — Liveness check |
| Step 5.5 — Create the Cover page | Step 6.5 — Create the Cover page |
| Step 6 — Hand off | Step 7 — Hand off |

---

## Out of Scope

- **Brownfield capability in individual skills** — downstream skills (`repository-builder`, `token-sync-layer`, `storybook-chromatic-builder`) will read `workspace.origin` and `detectedLayers` but their brownfield modes are a separate phase of work
- **Monorepo conversion automation** — the guided walkthrough for converting an existing repo stays as manual steps surfaced by downstream skills, not automated by the intake
- **Production Figma file migration** — not addressable by throughline; handled by Figma's native Swap Library feature
