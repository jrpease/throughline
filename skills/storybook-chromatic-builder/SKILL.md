---
name: storybook-chromatic-builder
description: Stand up Storybook in the monorepo, build code components matching the Figma design system, generate stories for every component, set up Chromatic for visual regression testing, and wire Code Connect when the user's Figma plan supports it. Use this when the user wants to set up Storybook, build component stories, add visual regression testing, set up Chromatic, connect Figma components to code, or build the code side of their design system. Also trigger after components and token sync exist, when moving the component library into code.
---

# Storybook + Chromatic builder

Builds the code half of the component library: real components consuming the
synced tokens, stories documenting them, Chromatic for visual regression, and
Code Connect tying Figma to code when available.

## Calibrate + prerequisites

Read `user.codingLevel` (`${CLAUDE_PLUGIN_ROOT}/references/coding-level.md`) and scale explanation.
This skill needs:

- A repo with the monorepo scaffold (`repository-builder`, at least
  `local-git`). Offer to run it if missing.
- Synced tokens in `packages/tokens` (`token-sync-layer`) so components consume
  real token files. Offer to run sync if missing.
- Figma components (`components.built`) with their slot contracts, so stories
  reflect the real component APIs.

Strongly recommend `github` stage so Chromatic's CI integration works; it can be
set up locally first and wired to CI when the remote exists.

## Step 1 — Stand up Storybook

Initialize Storybook in `packages/ui` (or the components package), configured for
the framework the tokens were synced for (e.g. React + Vite for a shadcn/Tailwind
system). Wire it to consume `packages/tokens` output so stories render with the
real design tokens (import the generated CSS/theme). Checkpoint: confirm
Storybook runs and shows the token-themed canvas.

Install the documentation scripts alongside the token scripts: copy the five
files and register the three npm scripts listed under **Documentation scripts —
install as a set** in `${CLAUDE_PLUGIN_ROOT}/scripts/README.md`. That table is
the single source of truth for what a consuming repo gets; do not restate the
list here.

These are the documentation analog of `tokens:validate`; see
`${CLAUDE_PLUGIN_ROOT}/scripts/README.md`. This copy is setup, not a forever-fork:
`/document-component` re-checks these files' freshness on every run and refreshes
them from the plugin when it has moved on.

**pnpm build-script allowlist (first-run gotcha).** On pnpm workspaces, the
`@storybook/react-vite` install pulls `esbuild`, whose postinstall is blocked by
pnpm's default `onlyBuiltDependencies` policy — Storybook then fails to start with a
binary-not-found error. When installing Storybook in a pnpm workspace, add `esbuild`
(and any other native postinstall dep Storybook pulls) to root `package.json`
`"pnpm": { "onlyBuiltDependencies": [...] }` as part of setup, so first run works.

**Don't duplicate the app's CSS — share it.** Storybook needs the same Tailwind v4
`@utility` typography rules the app uses to render correctly. **Before adding any,
check whether the app's global stylesheet (e.g. `apps/web/app/globals.css`) already
defines them.** If it does, extract the shared `@utility` blocks into a single
source — e.g. `packages/ui/src/typography.css`, added to the UI package's `exports`
(`"./typography.css"`) — and replace the inline copies in *both* the app and the UI
package with one `@import`. If they don't exist yet, create that shared file from
the start. Copying the rules inline into a second file starts immediate drift (one
side ends up on the wrong `--font-*` var and nobody notices). Keep Storybook-only
concerns (Google Fonts `@import`, `:root` font-var fallbacks) in a *separate*
`styles.css` layer so the shared typography file stays clean and app-shareable.

## Step 2 — Build code components from the Figma spec + slot contracts

For each Figma component (`components.built`), build its code counterpart
consuming tokens and implementing the **slot contracts** captured by
component-builder:

- **Icon-set slots** → a prop typed to the icon set (`leadingIcon?`), defaulting
  to the canonical icon name if specified, imported from the installed icon
  package (`lucide-react` etc.).
- **Typed-component slots** → a prop typed to the DS component (`avatar?`),
  resolved via deterministic naming.
- **General adornment slots** → a `ReactNode` prop (`endAdornment?`); **Figma
  slots on composites** (card body, modal content) → `children` / a composition
  prop, since a Figma slot is the design-tool expression of React composition.
- **Show/hide** is prop optionality, never a redundant boolean.
- Variant matrices (type/size/state) become the component's props/variants.

Match the deterministic naming so `Button` (Figma) ↔ `Button` (code).

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

**Controls must actually drive the component (args-through render).** A `render`
that ignores its args silently breaks the Controls panel — the toggle writes to
`args` but nothing re-renders. So:

- Always thread args through: **`render: (args) => <Component {...args} />`**, never
  `render: () => <Component variant="..." />` (hardcoded props make the variant
  radio and other controls dead). Add fixed children/body *after* the spread:
  `render: (args) => <Card {...args}>{body}</Card>`.
- **`ReactElement` slot props** (e.g. `avatar?: React.ReactElement`) can't be driven
  by an auto-generated object control — the panel renders a broken `[object Object]`
  input. Suppress it (`avatar: { control: false, table: { disable: true } }`) and
  add a **boolean helper arg** under a `Slots` category that the render function maps
  to a concrete element — e.g. a `showAvatar` toggle → `avatar={showAvatar ? <Avatar
  … /> : undefined}`. This gives a real, working slot toggle without asking the user
  to type JSX into the panel.

**Icon gallery story** — don't write a story per library icon. Generate ONE
searchable gallery story that imports the icon package and renders the grid
(optionally with click-to-copy import names). This mirrors the Figma Icons page.
Custom icons (SVGR-generated, owned by the repo) get normal individual stories
like any component.

## Step 4 — Set up Chromatic

Set up Chromatic for visual regression testing. Generate the config and the CI
workflow that runs Chromatic on PRs. This needs a `CHROMATIC_PROJECT_TOKEN`:
- Following the secrets discipline (`${CLAUDE_PLUGIN_ROOT}/references/coding-level.md`), the token
  value never passes through chat. Tell the user where to get it (Chromatic's
  project setup page after signing in) and where it goes — `.env` locally
  (gitignored) and the GitHub Actions secrets vault for CI. The user places it.
- This is the moment a previously-taught env-file concept becomes concrete
  (repository-builder taught it; here they actually set the value, because
  they've now decided to use Chromatic).
- Verify: after they add the secret, confirm CI runs Chromatic and goes green.

Scale all of this to `codingLevel` — full teaching for `new`, terse for
`comfortable`.

### TurboSnap vs. design tokens — default to full snapshots

**Recommendation: leave TurboSnap OFF for a design system.** Snapshot every story
on every run. TurboSnap (`onlyChanged: true`) only re-snapshots stories whose
changed files it can trace incrementally — and for a token-driven system that
model is fundamentally fragile, because **token changes are global**: one token
edit can restyle every component, the opposite of the localized change TurboSnap
is built for.

Concretely, TurboSnap keeps missing token changes in two independent ways:

- **It doesn't trace changes inside a linked workspace package** resolved under
  `node_modules` (e.g. `@<scope>/tokens` → `packages/tokens` build output), so a
  token-only PR — the everyday `/sync-figma-tokens` loop — traces nothing and
  reports "Capturing 0 snapshots." False green.
- **Its diffing is incremental against the previous build on the branch.** Once a
  build has "consumed" a token change, a later commit (a workflow tweak, say)
  won't re-snapshot it either. The `externals` option is only a partial
  mitigation and, given the incremental model, is easy to defeat in practice.

So for a design system the robust default is: **snapshot all stories, always.** At
typical counts (dozens of stories) this is cheap and can *never* miss a global
token change. Only consider TurboSnap if the story count grows large enough that
full-run cost genuinely matters — and even then, treat any token change as
requiring a full run.

Configure Chromatic to snapshot everything (do **not** set `onlyChanged`), and
verify a token-only PR re-snapshots all stories — they should flip orange against
the green baseline.

### Usage & cost guardrails

The full-snapshot default above is the right call for catching regressions, and it
is also the **maximum-usage** choice: every story, every run. Chromatic bills per
snapshot, so name this cost shape to the user when you set Chromatic up, and put the
guardrails in *before* the first big token PR, not after the bill.

What Chromatic actually offers (re-verify the live numbers at
`chromatic.com/pricing` — they drift):

- **Free plan (~5,000 snapshots/month):** testing **auto-pauses** when the ceiling
  is hit. No surprise bill, but visual-regression coverage silently *stops* until
  the monthly reset or an upgrade. For a full-suite design system that ceiling
  arrives fast — treat a *paused* build as a red flag, not a passing one.
- **Paid plans: no hard spending cap.** Overage snapshots auto-bill at month-end.
  The only native guardrail is **usage alerts** — an email when consumption crosses
  a threshold you set (e.g. 90%).

The math, so the user sizes the plan honestly: **snapshots ≈ stories × modes ×
builds.** One `/sync-figma-tokens` PR re-snapshots the *entire* suite × every mode
in a single build — e.g. 40 components × 2 modes = 80 snapshots per build, and a
handful of token PRs plus daily `main` builds clears a free tier in a week.

So the guardrails, all of them user-controlled (Chromatic will not cap you):

1. **Set usage alerts** at ~80% on a paid plan so the bill cannot sneak up. On the
   free plan, make sure the user knows testing *pauses* at the ceiling.
2. **Scope the CI trigger.** Run Chromatic on **pull requests and `main` only** —
   never on every branch push — path-filter out docs-only changes, and keep it to
   one Chromatic build per commit (no duplicate runs).
3. **Size the plan to the math** before the first token PR. A large story count is
   also the *only* reason to revisit TurboSnap (see above), and even then treat
   every token change as a full run.

Do not silently pick a plan or leave the trigger wide open. Name the tradeoff and
let the user choose with the numbers in front of them.

## Step 5 — Code Connect (plan-gated, skip gracefully)

Code Connect ties Figma components to their code counterparts so Figma's dev
mode shows the real code. It's plan-gated (Figma Organization/Enterprise).

- Detect or ask whether the user's plan supports Code Connect.
- **If yes:** wire it up — map each Figma component to its code component,
  including the slot contracts (this is the formal home of the icon/component
  slot bindings). Record `storybook.codeConnect` = `true`.
- **If no:** skip gracefully and say why in plain terms ("Code Connect needs a
  Figma Organization plan — we'll skip it; everything else works, and your
  component spec in the repo still records the Figma↔code mapping"). Don't block
  the rest of the setup.
- **Publishing & pending swap upgrades:** Code Connect and typed slot mappings
  line up best once the Figma library is published (see
  `${CLAUDE_PLUGIN_ROOT}/references/figma-publishing.md`). If
  `components.instanceSwapUpgradePending` is non-empty, those components still owe
  a *typed instance-swap dropdown in Figma* — added by a later component-builder
  run after the user publishes. This does **not** block the code side: implement
  each slot prop from the recorded slot contract regardless of the Figma dropdown.

## Step 5.5 — Render documentation to code

For each component that has a canonical record
(`design-system/docs/components/<Name>.doc.json`), render the code-side surfaces
from it (read `${CLAUDE_PLUGIN_ROOT}/references/component-doc-schema.md` for the
projection contract):

- **Storybook autodocs (MDX).** Generate `<Name>.mdx` next to the component (e.g.
  `packages/ui/src/<Name>/<Name>.mdx`) rendering summary, description,
  when-to-use/not, do's/don'ts, accessibility, and a variant/state table. Put the
  record's fingerprint in MDX frontmatter as `docFingerprint: <fp>`.
- **JSDoc.** Add a doc comment to the code component from `summary` + `description`
  and per-prop descriptions from `variants`/`states` meanings, so `argTypes`
  descriptions surface in the Storybook controls table.
- **AI digest.** Run `docs:digest` to (re)generate `design-system/docs/index.json`
  + `design-system/docs/llms.txt` from all records.

**Update the manifest:** add the `storybookMdx` surface to
`components.meta[<Name>].doc.surfaces` as `{ src: <fp>, render: <hash of the MDX
file>, file: "<repo-relative MDX path>" }`.

**Wire the gate.** Ensure `docs:check` is part of the repo's verification (a CI
step and/or a Turbo task). It compares every surface against its record and exits
non-zero on drift; Figma surfaces report `edit-unverified` (checked live in a Figma
session). Run `docs:check` once here and confirm it passes before handing off.

## Step 6 — Finalize component status (Figma write-back)

A component built and storied here is now **done** — but its Figma doc card was
stamped `draft` by component-builder and won't change on its own. Once the code
component renders and its stories build (and the user has approved the result),
**promote each finalized component to `stable`** so the design system tells the
truth in both places.

**Confirm the write-back once, up front.** Before touching Figma, state the batched
change in one line and get a yes — *"I'll update the N doc cards in Figma: flip the
status chips amber → green and set Last Updated to today. Confirm?"* The user
approved the *components*, but writing to their Figma file is a separate external-
system action that needs explicit consent (and an unannounced write trips the safety
classifier, forcing the round-trip anyway). One confirmation covers all cards.

For every component you finalized in this run, follow the **"Promoting a
component's status (write-back on finalize)"** routine in
`${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md` (which also covers
the `figma_execute` scripting gotchas — `getNodeByIdAsync` and an explicit
`timeout` for the multi-card write):

- Set `components.meta[name].status` = `"stable"` and refresh
  `components.meta[name].updatedAt` to today.
- When promoting status (e.g. draft → stable), also set `status` + `updatedAt` in
  the component's `.doc.json`, recompute its fingerprint, re-run `docs:digest`, and
  re-render the affected surfaces so `docs:check` stays green.
- If Figma is connected (per `figma.mechanism`), open the component's doc card and
  update the `Status Label` text to `stable`, re-bind the `Status` chip fill to
  the **success** semantic color variable (mode-aware, not a hardcoded hex), then
  re-run the canonical doc-card builder against the same card to refresh the
  header date from the `record.updatedAt` already set above (it locates the date
  node under either header shape) — then screenshot to confirm the chip
  recolored and the date changed.
- If Figma isn't connected, still update the manifest and tell the user the card
  will reconcile next Figma session (or offer to reconnect and fix it now).

Once confirmed, do the whole batch in one pass as part of finishing — don't make
the user re-approve each chip. (`stable` is the finalized status; if a component is
intentionally still experimental, leave it at `beta` and say so.)

## Step 7 — Update manifest + hand off

Set `storybook.initialized` = `true`, `storybook.chromatic` accordingly,
`storybook.codeConnect` accordingly. Append `storybook-chromatic-builder` to
`completedSkills`. (Per-component `status`/`updatedAt` were already updated in
Step 6.) Note the ongoing loop: new components flow through the
component-pipeline orchestrator; token changes flow through `/sync-figma-tokens`.

## Brownfield: baseline before retrofit + the verification triad

On a **retrofit** (`tokens.intakeMode: "retrofit"`), the order of operations and the
verification bar are stricter than greenfield. **Read
`${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`** — the safe sequence and the
verification triad live there.

**Capture the Chromatic baseline BEFORE the code retrofit.** Run `build-storybook` +
Chromatic to establish a green baseline *before* any token/color code is changed. Then,
when the retrofit lands, every diff is either an **intended drift-fix** (a color the
audit flagged as wrong) or a **regression** — and the baseline is the only thing that
tells them apart. Baseline *after* the retrofit and you've thrown away that signal.

**The verification triad — all three are necessary; no single check catches everything:**
1. **`check-types` (TypeScript)** — catches type errors, but is **blind to Tailwind
   silent no-ops**: a deleted color utility just stops applying, with no type error
   (guardrail 4).
2. **`build-storybook` + Chromatic snapshots** — the visual-regression net, but **blind
   to story-unreachable code**. `build-storybook` only compiles SCSS that some story
   actually imports; a dead `@import` of a deleted partial, or a route's styles no story
   renders, compiles "fine" here and breaks only in the app. **Chromatic — not
   `tsc`/build — is the source of truth** for whether a color-utility removal was safe.
3. **Run the actual app + spot-check 5–7 real routes** — the only thing that exercises
   story-unreachable SCSS (guardrail 5). Don't declare an SCSS/color change done on the
   strength of a green build alone.

**Don't assume the stack (§11).** This triad names Chromatic + `build-storybook`
because that's the case-study tooling. Detect what the repo actually uses — read its
`package.json` scripts for the real type-check / build / visual-test commands — and map
the triad onto them (or degrade gracefully and say so) rather than asserting commands
that may not exist.

## What this skill must NOT do

- Never finish a finalized component while leaving its Figma doc card on `draft`
  — promote the status and write it back (Step 6).
- Never write a story per library icon — one gallery story.
- Never put a secret value through chat or commit it — user places it, scaled to
  level.
- Never block setup when Code Connect is unavailable — skip gracefully.
- Never hardcode token values in components — consume `packages/tokens`.
- Never rely on TurboSnap (`onlyChanged: true`) for a token-driven design system
  — its incremental model keeps missing global token changes. Default to full
  snapshots (every story, every run); revisit only at large story counts.
- Never leave Chromatic's cost shape unspoken or the CI trigger wide open — there
  is no hard spend cap on paid plans, so set usage alerts, run it on PRs + `main`
  only, and size the plan to stories × modes × builds before the first token PR.
- Never use the sequential model for story-gen — parallelize via subagents.
- Never capture the Chromatic baseline *after* a code retrofit — baseline before, so
  intended drift-fixes are distinguishable from regressions.
- Never trust `tsc`/build to catch Tailwind color-utility removal — it's a silent
  no-op; Chromatic is the source of truth (guardrail 4).
- Never declare an SCSS/color change done on a green build alone — run the app and
  spot-check 5–7 real routes (guardrail 5).
