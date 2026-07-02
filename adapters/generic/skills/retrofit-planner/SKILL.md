# Retrofit planner (orchestrator)

Sequences a brownfield retrofit through the safe 7-phase order, gating each phase on a
human confirmation. Like `component-pipeline`, this skill holds **zero domain logic of
its own** — it is a sequencer that invokes the real skills and the phase work, and only
updates the manifest fields it owns (`retrofit.*`, `completedSkills`). All the
actual work lives in the skills it calls, so this orchestrator doesn't rot when they
improve.

**Before anything, read `.throughline/references/brownfield-retrofit.md`** —
the read discipline, the 7 guardrails, the safe sequence, and the verification triad
are the rules this skill enforces as gates.

## When to use vs. the individual skills

Use this for a **complete retrofit**, especially across multiple sessions. For a single
isolated step (just the audit, just the crosswalk), run that skill directly. This is the
"converge my mature system onto tokens, end to end, without breaking the live app" flow.

## Calibrate

Read `user.codingLevel` (`.throughline/references/coding-level.md`). A retrofit
touches Figma, tokens, code, CI, and a live app — for `new` users explain each phase and
why its ordering matters the first time; for `comfortable` users be terse. The phases and
gates are identical across levels.

## Prerequisites

Read the manifest. This orchestrator assumes a brownfield situation
(`tokens.intakeMode: "retrofit"`, or `workspace.origin` is an existing repo/monorepo). If
the audit hasn't run yet (`audit.ranAt` is `null`), start at the audit phase below. If
none of the brownfield markers are set, this is probably greenfield — point the user to
the normal build skills instead.

## Decision-journal offer (default-on)

At the start of a retrofit, offer to scaffold a decision journal at `docs/design-system/`
with `specs/ plans/ spikes/ findings/ decisions/ handoffs/`. **Recommend yes** —
retrofits are multi-session and the journal is the human decision trail (complementary to
the manifest's machine state) — but allow the user to decline. Record the choice in
`retrofit.journalScaffolded`. This is the only artifact this skill creates directly.

## Detect the stack, don't assume it (§11)

Before running phases that shell out (sync, baseline, code, cleanup), detect what the
repo actually uses — read its `package.json` scripts for the real type-check, build,
visual-test, and token commands. The case study used Chromatic + `build-storybook` +
`tokens:sync`/`tokens:validate`; a real repo may differ. Map each phase onto the repo's
actual commands, or degrade gracefully and say what's missing — never assert a command
that doesn't exist.

## The safe sequence (confirm between EVERY phase)

Set `retrofit.phase` to the current phase as you enter it, so a later session can resume
exactly here. Confirm the goal first, then walk the phases. **Each gate is a hard stop:
do not advance without explicit confirmation** — the gates are what keep the live app
intact and make the retrofit resumable.

### Phase 1 — `audit` (invoke `design-system-audit`)

Invoke `design-system-audit`: size the code surface, inventory the Figma file with
verified per-class reads, compute `percentSemantic`. **Gate:** show the audit results and
the right-sizing read ("~90% semantic → renames + cleanup, not a rewrite"). Confirm before
continuing. Capture the rollback baseline (Figma version checkpoint / token export) now if
`figma-environment-setup` didn't already. On first entry, set `retrofit.startedAt` to the
current ISO timestamp if it is unset.

### Phase 2 — `refine` (invoke `token-builder` brownfield branch)

Invoke `token-builder`'s refine-in-place branch: rename/realign variables **in place**,
preserving IDs, with a binding-survival audit before and after each rename (guardrail 3).
**Gate:** show the before/after binding counts are equal (no bindings severed) and the
refined variable names. Confirm before continuing. **Never delete-and-recreate.**

### Phase 3 — `rebind`

Reconcile components onto the refined variables, preserving their Figma IDs. There is no
dedicated skill for this — drive it directly here: verify components still reference the
(renamed, same-id) variables, and fix any that drifted. **Gate:** confirm components still
render bound. This is also the natural point to build the crosswalk if not yet done —
offer `token-crosswalk-builder` (it reads the `audit` section to seed rows and wires
`tokens:validate`).

### Phase 4 — `sync` (invoke `token-sync-layer` brownfield branch)

Invoke `token-sync-layer` with the brownfield transforms (channel alpha, opacity
0–100→0–1, float32 rounding at the export boundary, `/opacity`→`color-mix`). It lands a
reviewable PR per its own rules. **Gate:** confirm the sync PR before continuing.

### Phase 5 — `baseline` (invoke `storybook-chromatic-builder`)

Capture a Chromatic baseline **before** any code retrofit, so intended drift-fixes are
distinguishable from regressions. **Gate:** confirm the baseline is green and captured.
This ordering is not optional — baseline *after* the code change throws away the signal.

### Phase 6 — `code` (dual output)

Retrofit the codebase with **dual output**: new and old tokens coexist during the
transition, so nothing breaks mid-migration. Use the crosswalk reverse index
(`tokens:reverse-index`) to semi-automate the SCSS/Tailwind swaps. Run the verification
triad as you go — `check-types`, `build-storybook` + Chromatic, **and run the actual app**
+ spot-check 5–7 routes (the build alone is blind to story-unreachable SCSS). **Gate:**
confirm the triad passes before continuing.

### Phase 7 — `cleanup`

Remove the old token outputs **only after** the repo-wide token-removal guard returns
**zero references** (`guard-token-removal.mjs`) — deleted Tailwind utilities are silent
no-ops that `tsc`/build won't catch (guardrail 4). **Gate:** show the guard reporting zero
references, then confirm removal. Re-run the verification triad after removal.

When cleanup is verified, set `retrofit.phase: "done"` and `retrofit.completedAt`, and
append `retrofit-planner` to `completedSkills`.

## Resumability

Because each phase is gated and `retrofit.phase` is written on entry, a stop at any point
leaves a clean resume point. `figma-environment-setup` reads `retrofit.phase` on the next
`/start` and routes back here at the right phase. Never silently restart from the top —
resume where the manifest says.

## What this skill must NOT do

- Never reimplement what the sub-skills do — only sequence them and drive the
  no-dedicated-skill phases (rebind, code, cleanup). If you're writing token/sync logic
  here, stop and invoke the real skill.
- Never skip a confirmation between phases — the gates keep the live app intact and make
  the retrofit resumable.
- Never delete-and-recreate variables (guardrail 3), baseline after the code retrofit
  (phase 5 before 6), or remove old outputs before the zero-reference grep passes
  (guardrail 4).
- Never write another skill's manifest fields — own only `retrofit.*` and
  `completedSkills`. The audit owns `audit.*`; the crosswalk owns `tokenCrosswalk`.
- Never assert the case-study toolchain — detect the repo's real commands or degrade
  gracefully.

