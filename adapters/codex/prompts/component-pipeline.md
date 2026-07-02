# Component pipeline (orchestrator)

Sequences a single new component through the whole flow: Figma → tokens →
code/stories. This skill holds **zero domain logic of its own** — it is a
sequencer that invokes the real skills and gates each stage on a human
confirmation. All the actual work lives in the skills it calls; this keeps it
from rotting when those skills improve.

## When to use vs. the individual skills

Use this for **one new component, end to end**, on a system that already has
foundations (tokens, repo, sync, Storybook). For initial setup, the individual
skills run directly. This is the "I have a system; add a Tooltip and take it all
the way to a tested story" flow.

## Prerequisites

Read the manifest. The pipeline assumes foundations exist: tokens built, a repo
at least `local-git`, sync configured, Storybook initialized. For any missing
piece, offer to run the relevant skill — but note that if a lot is missing, the
user probably wants the individual setup skills first, not this orchestrator.

## The sequence (confirm between every stage)

Confirm the goal first: "New `Tooltip` component, right? I'll build it in Figma,
sync any new tokens, then build the code component and its stories — checking
with you between each step." Then:

### Stage 1 — Build in Figma (invoke component-builder)

Invoke the `component-builder` prompt for this one component: brainstorm its
variant matrix and slots, build it bound to tokens following the component
standards, capture its slot contract. **Checkpoint:** show the finished Figma
component. Get explicit confirmation before continuing.

If the build fails or the user wants changes, stop here — they still have a
valid (or fixable) Figma component and a clean place to resume. Never push a
half-built component down the pipeline.

### Stage 2 — Sync new tokens (offer token-sync-layer)

The new component may have introduced new tokens (a new semantic role, a new
spacing step). Offer: "This component added a couple of new tokens — want me to
sync them to code now?" If yes, invoke `token-sync-layer` (which lands a
reviewable PR per its own rules). If the component introduced no new tokens, say
so and skip. **Checkpoint:** confirm the sync PR before continuing.

### Stage 3 — Build code component + stories (offer storybook-chromatic-builder)

Offer: "Tokens are synced. Build the code component and its stories now?" If yes,
invoke `storybook-chromatic-builder` for this one component: build the code
counterpart implementing the captured slot contract, generate its stories
(subagent-driven), wire Code Connect if available. **Checkpoint:** confirm the
component renders and stories build. On approval, that skill **finalizes** the
component — promoting its status from `draft` to `stable` and writing the new
chip color + last-updated date back into its Figma doc card (its Step 6). Since
Figma is still connected from stage 1, the card updates live; the chip should no
longer read `draft` once the pipeline finishes.

## Resumability

Because each stage is gated and invokes a real skill, a failure at any stage
leaves a clean resume point: the Figma component exists after stage 1, the token
PR after stage 2, the code/stories after stage 3. The user can stop after any
stage and pick up later — the manifest reflects what's done.

## After completion

Confirm the component went all the way through. Update nothing the sub-skills
didn't already update (they own their manifest fields). Note the ongoing loops:
more components via this pipeline, token changes via `/sync-figma-tokens`.

## What this skill must NOT do

- Never reimplement what the sub-skills do — only sequence them. If you find
  yourself writing component-building or sync logic here, stop and invoke the
  real skill instead.
- Never skip a confirmation between stages — the gates are what make it
  resumable and prevent half-updated state.
- Never push a half-built or unconfirmed component to the next stage.

