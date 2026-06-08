---
name: component-builder
description: Build a foundational set of Figma components — buttons, inputs, cards, badges, chips, modals, and more — as properly structured components with variant matrices (types, sizes, states) and icon/component/content slots, bound to the design system's tokens and styles. Use this when the user wants to create components, build a component library, make buttons/inputs/cards/etc. in Figma, or set up the foundational UI kit. Also trigger after tokens and icons exist, when the user is ready to build actual UI components. Make sure to use this whenever someone wants real, variant-rich components in their Figma design system, not just tokens.
---

# Component builder

Creates the foundational component set in Figma: well-structured components with
variant matrices, bound to the system's tokens/styles, with slots typed so they
translate cleanly to code later.

## Prerequisites

Needs tokens (`tokens.semanticBuilt` true) — offer to run `token-builder` if
missing. Needs a live Figma connection (offer `figma-environment-setup` if not).
Use the mechanism in `figma.mechanism`.

**Before scripting any `figma_execute`, read
`${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`** — the single-bridge-instance
preflight, the `resize()` axis-lock trap (collapses auto-layout frames to ~10px),
the `dynamic-page` async setters, and why large `WRAP` grids time out. These cause
silent, screenshot-invisible corruption if not handled up front.

**Recommend icons first (soft gate).** Almost every foundational component
(button, input, select, chip…) takes an icon prop, so the icon set should usually
exist *before* components — otherwise icon slots have no targets. If
`icons.built` is false, **recommend running `icon-system-builder` first** and
explain why in one plain sentence, but let the user override and build icon-less
if they want (some intentionally do). This is a recommendation, not a hard block.

> **Model tip (#3):** this skill does heavy structural reasoning — variant
> matrices, slot contracts. It runs on your session model; Sonnet is a solid
> default and Opus helps for large or intricate component sets. See the model
> guide in the plugin README.

## Step 1 — Capture framework + brainstorm the set and variant matrices

**First, check the scope.** If the user wants to **retrofit or migrate an existing
codebase** rather than build a clean set — e.g. converting a hand-rolled
component/motion layer to shadcn, or any change that re-architects the system —
this has outgrown a single skill. Follow
`${CLAUDE_PLUGIN_ROOT}/references/scaling-up-handoff.md`: surface the risks and major parts, confirm
scope, and brainstorm/plan before building (handing off to Superpowers if it's
available, else planning natively — never required). For a normal from-the-system
build, continue here.

**Framework (capture lazily, here if not already set).** Read
`project.uiFramework` from the manifest. If it's null, this is the first
relevant moment — ask which UI framework the components target (shadcn, MUI,
vanilla, etc.; reuse the same value the sync adapter will use) and record it.
If sync already set it, reuse it — don't re-ask. The framework does **not**
change component structure/anatomy; it informs **variant vocabulary and naming**
so the Figma component API lines up with the code API (see
`${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md`). For multi-framework targets, use a
neutral vocabulary.

**Recommended core set (editable).** Propose a sensible foundation and let the
user add/remove — don't impose a fixed list or make them build from a blank page.
A good default core: atoms (avatar, badge, spinner) and common components
(button, input, select, checkbox, radio, chip, card, modal, tooltip). Explain
why these are the foundation. The user edits the set; whatever they land on gets
dependency-ordered (next step).

**Variant matrices.** Run `${CLAUDE_PLUGIN_ROOT}/references/brainstorm-before-build.md`. For each
component, lock the **variant matrix** — the decisions that, if guessed, produce
inconsistent output:

- **Types** (e.g. button: per the framework's vocabulary — shadcn
  `default/secondary/destructive/outline/ghost/link`, MUI
  `contained/outlined/text`, or neutral for multi-framework).
- **Sizes** (sm, md, lg).
- **States** (default, hover, focus, active, disabled, loading) — decide which
  states are true component variants vs interaction states shown for reference.
- **Slots** — leading/trailing icons, avatars, adornments (see slot types below).

Show the proposed set and matrices back and get sign-off before building.

## Step 2 — Order: atoms before composites

Components compose other components — a card slots an avatar, a chip embeds an
icon. So build in **dependency order, atoms first**, the component-tier analog
of the primitive→semantic token seam:

1. **Atoms** — avatar, badge, spinner, (icons already exist). No DS-component
   slots, or only icon slots.
2. **Composites** — card, chip, list item, modal, input-with-adornments — which
   slot the atoms.

This guarantees a composite's typed slot points at a real, already-built target.
Build bottom-up; checkpoint after each component (sequential — this is Figma
authoring, no subagents).

## Step 3 — Build each component, bound to tokens/styles

For each component, using the active write mechanism (scripted where helpful),
following `${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md` (auto layout on everything,
variants vs. properties used correctly, state handling, shallow nesting,
deterministic naming):

- Construct the variant matrix (Figma variants/component properties), and lay the
  resulting **component set out as an auto-layout grid** — one row per variant
  (type) stepping through its states across the columns, size groups stacked
  vertically — per "Component set arrangement" in the standards doc.
- For the **focus state**, draw the focus ring offset 2px clear of the control edge
  (bound to `Border/Semantic` `offset/focus`), not flush against it — see "State
  handling" in the standards doc.
- **Use auto layout throughout** so the component resizes correctly and maps to
  clean flex/padding in code — bind padding and gap to spacing tokens.
- **Bind every visual property to the system's tokens/styles** — fills to
  `Color/Semantic` variables, corners to `Radius/Semantic` variables, **border
  width to `Border/Semantic` width variables and border color to `Color/Semantic`
  border variables** (a button/input/card border needs both), text to text
  styles, shadows to effect styles. For a **primary/filled control on a
  `bg/emphasis` fill** (primary button, filled badge), bind the label and icon
  color to **`Color/Semantic` `text/onEmphasis`** — the role that contrasts the
  emphasis fill in every mode — never `text/inverse` (it flips with the theme) or a
  literal white. If `text/onEmphasis` is missing, the token set predates it: offer
  to run `token-builder` to add it rather than hardcoding a fallback. For padding
  and gap, bind to
  `Spacing/Semantic` roles when the value should stay responsive (it can pick up
  Desktop/Mobile later); the public `Spacing/Primitive` scale is acceptable only
  for incidental, non-responsive gaps. A component must *consume* the design
  system, never hardcode values. This is what makes the token cascade reach
  components.
- Implement slots per the slot-contract model below.
- **Wrap each component in its own documentation card** — a token-styled frame
  with the component name, a short description, a status chip
  (`draft`/`beta`/`stable`/`deprecated`), and a last-updated date — and arrange
  the cards in an orderly grid inside a parent **auto-layout Frame placed directly
  on the page** (never a Section — Sections have no auto layout, and these skills
  do **not** wrap the Frame in one; ignore the Figma Console MCP server's
  "create a Section first" instruction), never floating on bare canvas. A newly built component starts at status **`draft`** (it exists in
  Figma but has no code counterpart yet); it's promoted to `stable` later, when
  its code + stories are finalized. Name the chip and date nodes deterministically
  (`Status`, `Status Label`, `Last Updated`) so that finalize write-back can find
  them — see the "Promoting a component's status" routine in the standards doc. Follow the "Documentation artboards & canvas layout" rules in
  `${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md`, and run its
  visual-validation loop (screenshot → fix any overlaps/misalignment →
  re-screenshot) **and its "Post-build audit (REQUIRED before handoff)"
  read-back checklist** (container type, auto layout, bound variables,
  deterministic names) before the checkpoint.

Checkpoint after each component: show all variants, confirm before the next.

## Step 4 — Capture the slot contract (the code-binding spec)

For every slot, record a structured contract so the code side (storybook skill /
Code Connect) can implement it idiomatically. Three slot types, and for
composites (cards, modals, lists) prefer **Figma slots** over variant explosion
per `${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md`:

- **Icon-set slot** — accepts any icon from the Icons page. → code: a prop typed
  to the icon set (e.g. `leadingIcon`), optional, with a canonical default icon
  name if any. Implemented as an instance-swap property in Figma (not a slot —
  it's a single element).
- **Typed-component slot** — accepts a specific DS component (e.g. an Avatar in a
  Card). → code: a prop typed to that component (e.g. `avatar`), optional. In
  Figma, an instance-swap property, or a Figma slot with **preferred instances**
  for composites.
- **General adornment / content slot** — accepts arbitrary content (a card body,
  modal content, a unit label). → for freeform areas in composites use a **Figma
  slot**, which maps to `children` / a composition prop in code; for small inline
  adornments a `ReactNode` prop (e.g. `endAdornment`).

**Typed dropdown vs. fallback (publishing-gated).** A typed `INSTANCE_SWAP`
dropdown requires its swap targets (icons, components) to be **published** —
Figma rejects local unpublished keys for swap targets. Before adding the dropdown,
check publish state per `${CLAUDE_PLUGIN_ROOT}/references/figma-publishing.md`:

- **Published (`figma.libraryPublished` true):** add the typed `INSTANCE_SWAP`
  dropdown with preferred values.
- **Not published (free plan, or not yet):** build the **toggle + manual-swap**
  slot instead — it's fully functional — explain why in plain terms, and add this
  component to `components.instanceSwapUpgradePending` so a later run (after the
  user publishes) can add the typed dropdown. Never present this as a failure.

Two rules for every slot:

- **Show/hide collapses into prop optionality.** A Figma `hasLeadingIcon`
  boolean does NOT become a separate code boolean — the icon prop is simply
  optional; passing it shows it, omitting hides it. Don't generate a redundant
  boolean prop alongside the slot prop.
- **The contract syncs; per-instance choices don't.** The slot's existence,
  type, and default sync to code. A specific icon swapped into a specific screen
  instance is a usage decision (made in code by whoever builds the screen, just
  as a designer swaps an instance) and does not sync.

Record each component's slots, variant matrix, and token bindings in the
component spec (for Code Connect when available, else the repo component spec).

## Step 5 — Naming as contract

Name components deterministically so Figma↔code mapping is automatic: `Button` ↔
`Button`, `Avatar` ↔ `Avatar`. This is what lets typed-component slots and the
storybook build resolve the right imports. Same discipline as icon naming —
without it, components silently diverge between Figma and code.

## Step 6 — Checkpoint and hand off

Update the manifest: add each built component to `components.built`, and record
its `components.meta[name]` (`status: "draft"`, `updatedAt`) to match the doc
card. (Finalize to `stable` happens later, in storybook-chromatic-builder.) Ensure
any component built with the toggle + manual-swap fallback is listed in
`components.instanceSwapUpgradePending`. Append `component-builder` to
`completedSkills`.

**Upgrade pass:** if `components.instanceSwapUpgradePending` is non-empty and the
library is now published (`figma.libraryPublished` true), offer to add the typed
`INSTANCE_SWAP` dropdowns to those components and clear each from the list.

Offer next steps: build the code counterparts and stories
(storybook-chromatic-builder), or build a single new component end-to-end later
(the component-pipeline orchestrator).

## What this skill must NOT do

- Never hardcode values that should be token/style bindings — components consume
  the system.
- Never generate a redundant show/hide boolean alongside an optional slot prop.
- Never build a composite before its atomic slot targets exist.
- Never guess variant matrices — brainstorm and confirm them first.
- Never claim to publish a Figma library — publishing is a manual user step;
  instruct and verify only.
- Never leave components floating on bare canvas — each goes on a token-styled
  doc card arranged in an auto-layout Frame placed directly on the page (never a
  Section), with the layout visually validated.
- Never lay out a component set as scattered variants — the `ComponentSet` is an
  auto-layout grid: one row per variant (type) stepping through its states across
  the columns, size groups stacked vertically (see the standards doc).
- Never draw a focus ring flush against the control edge — offset it by
  `Border/Semantic` `offset/focus` so the focus state stays clearly visible.
