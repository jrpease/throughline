---
name: token-sheet-builder
description: Build a beautiful, on-brand "Foundations" page in Figma that visually documents every variable collection and style — color ramps with swatches, the type scale, spacing, radius, shadows/elevations — with swatches live-bound to the actual variables where Figma allows. Use this when the user wants a visual stylesheet, a token reference page, a Foundations page, to document or showcase their design system, or to "see all my tokens" laid out. Also trigger after token-builder completes, when the user wants a visual artifact of their tokens. Make sure to use this when someone wants their tokens presented visually rather than just existing as variables.
---

# Token sheet builder

Creates a polished visual reference of the design system's tokens and styles on
a dedicated Figma page called **Foundations**. This is the artifact designers
and stakeholders actually look at — so it must be beautiful and on-brand, not a
utilitarian dump of swatches.

## Live vs regenerated — set expectations clearly

Bind to variables wherever Figma allows so the sheet **live-updates** for those
properties: a color swatch bound to `color.gray.50` re-colors automatically when
that primitive changes; spacing/radius examples bound to the variables resize
automatically. But labels, hex/value text, token names, descriptions, and the
set of tokens shown (adding/removing tokens) are **snapshots** — they don't
auto-update. So tell the user plainly: "The swatches update live when you change
a value, but if you rename tokens, change descriptions, or add/remove tokens,
re-run this skill to refresh the page." The sheet is regenerable; re-running
refreshes the snapshot parts.

(Tie-in: when the sync skill runs after token changes, refreshing Foundations is
a sensible companion step — the sheet and the synced code both reflect Figma.)

## Prerequisites

Needs tokens in Figma (`tokens.semanticBuilt` true) and a live Figma connection.
If tokens don't exist, offer to run `token-builder`. If Figma isn't connected,
offer `figma-environment-setup`. Use the mechanism in `figma.mechanism`.

## Step 1 — Brainstorm the layout (lightly)

Run `${CLAUDE_PLUGIN_ROOT}/references/brainstorm-before-build.md`, but keep it light — this is a
lower-stakes, easily-regenerated artifact. Settle: which collections get their
own section, how much per-token detail to show (just swatches, or swatches +
names + values + descriptions), and any brand styling direction for the page
itself (the page should feel like the brand it documents). Default to a clean,
sectioned layout: Color (ramps as rows of swatches), Typography (the type scale
rendered in the actual text styles), Spacing (visual bars), Radius (sample
shapes), Elevation (sample cards with the effect styles).

## Step 2 — Build the Foundations page

Create a Figma page named **Foundations** (if one exists, ask whether to refresh
it or version it). Lay out sections for each collection/style group, using the
active write mechanism (scripted where possible for efficiency). Make swatches
and examples **live-bound to the variables/styles** they document wherever Figma
supports binding. Render the type scale using the actual text styles created by
token-builder, and elevation samples using the actual effect styles — so the
page consumes the system rather than re-describing it.

Prioritize visual quality: generous spacing, clear section headers, consistent
swatch sizing, the brand's own type and color applied to the page chrome. This
is a showcase.

## Step 3 — Checkpoint

Show the user the Foundations page. Sequential review (this is a Figma-authoring
skill — no subagents). Iterate on layout/styling if they want changes. Then
update the manifest: `sheets.built` = `true`, append `token-sheet-builder` to
`completedSkills`.

## Step 4 — Hand off

Note that the page refreshes via re-running this skill, and that it pairs well
with a token sync. Offer natural next steps (icons, components). Don't auto-run.

## Notes

- Beautiful and on-brand is a requirement, not a nice-to-have.
- Live-bind where possible; be honest about what needs a regenerate.
- One dedicated page named **Foundations**.
