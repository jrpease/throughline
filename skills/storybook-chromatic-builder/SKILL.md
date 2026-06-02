---
name: storybook-chromatic-builder
description: Stand up Storybook in the monorepo, build code components matching the Figma design system (consuming the synced tokens and implementing the captured slot contracts), generate stories for every component, set up Chromatic for visual regression testing, and wire Code Connect when the user's Figma plan supports it. Use this when the user wants to set up Storybook, build component stories, add visual regression testing, set up Chromatic, connect Figma components to code, or build the code side of their design system. Also trigger after components and token sync exist, when moving the component library into code. Make sure to use this whenever someone wants their Figma components realized as documented, tested code.
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

Story generation is independent and verifiable per component, so use the
**subagent-driven model** (code-gen skills parallelize; this is the opposite of
the sequential Figma-authoring skills): dispatch one subagent per component to
write its stories — a story per meaningful variant, controls wired to props,
slot props demonstrated. Each subagent verifies its work (the story builds and
renders). Two-stage review (does it match the component spec; is it quality
code) before combining.

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

## Step 6 — Update manifest + hand off

Set `storybook.initialized` = `true`, `storybook.chromatic` accordingly,
`storybook.codeConnect` accordingly. Append `storybook-chromatic-builder` to
`completedSkills`. Note the ongoing loop: new components flow through the
component-pipeline orchestrator; token changes flow through `/sync-figma-tokens`.

## What this skill must NOT do

- Never write a story per library icon — one gallery story.
- Never put a secret value through chat or commit it — user places it, scaled to
  level.
- Never block setup when Code Connect is unavailable — skip gracefully.
- Never hardcode token values in components — consume `packages/tokens`.
- Never use the sequential model for story-gen — parallelize via subagents.
