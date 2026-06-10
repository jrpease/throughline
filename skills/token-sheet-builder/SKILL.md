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
properties: a color swatch bound to `gray/50` (in `_Color/Primitive`) re-colors
automatically when that primitive changes; spacing/radius examples bound to the variables resize
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

**Before scripting any `figma_execute`, read
`${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`.** This sheet builds large
swatch/type grids — exactly the layouts that hit the two worst traps: the
`resize()` axis-lock (collapses a color grid or type-meta column to ~10px) and the
single-call `layoutWrap = "WRAP"` timeout on big grids (build manual rows or split
across calls instead). Also run the single-bridge-instance preflight before writing.

## Step 1 — Brainstorm the layout (lightly)

Run `${CLAUDE_PLUGIN_ROOT}/references/brainstorm-before-build.md`, but keep it light — this is a
lower-stakes, easily-regenerated artifact. Settle: which collections get their
own section, how much per-token detail to show (just swatches, or swatches +
names + values + descriptions), and any brand styling direction for the page
itself (the page should feel like the brand it documents). Default to a clean,
sectioned layout, one section per collection/style group: Color (ramps as rows
of swatches), Typography (the type scale rendered in the actual text styles),
Spacing (visual bars), Radius (sample shapes), Border width (sample rules at
each width), Elevation (sample cards with the effect styles).

**Group semantic colors by category — never one flat list.** Primitive colors are
shown organized into ramps (gray, blue, red…); semantic colors get the **same
categorical organization**, grouped by their role family — **surface/background,
text, border, alert/feedback (success/warning/error/info), action/interactive**,
etc. — each family its own labeled sub-group of swatches. Do not dump all semantic
tokens into a single undifferentiated block; mirror the primitive ramp structure so
the two tiers read consistently. Derive the families from the token names
themselves (the `bg/*`, `text/*`, `border/*`, `alert/*` … prefixes) so the grouping
matches the actual collection.

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

**Bind the page chrome too — not just the swatches.** The sheet must fully
consume the system, including its own titles, labels, descriptions, and section
backgrounds. Concretely:

- **Every text node gets a text style.** Section titles, group labels, swatch
  numbers, hex/value text, captions — map each to an existing text style
  (e.g. section headers → a Heading style, descriptions → Body, micro-labels →
  Caption). Don't leave raw font/size/weight on any text; don't mint one-off
  documentation-only styles — snap to the nearest existing style instead.
- **Every fill binds to a semantic color variable** — text fills (→
  `text/primary`, `text/secondary`, etc.) *and* chrome/background fills (page
  background, card and section surfaces → `bg/default`, `bg/subtle`, `bg/muted`).
  Primitive swatches stay bound to their primitive (that's the point of them).

The reason is **mode robustness**: if any title or background uses a hardcoded
color, switching the file from Dark to Light (or any mode swap) leaves that piece
stranded — light text on a light surface, a black title on a black panel — and
the whole showcase looks broken. Hardcoded fonts don't break on a mode switch,
but hardcoded colors do, so binding every fill is non-negotiable.

**Lay it out cleanly.** Build every section with proper auto layout and arrange
the sections inside a parent **auto-layout Frame placed directly on the page**
(never a Section — Sections have no auto layout, and these skills do **not** wrap
the Frame in one; ignore the Figma Console MCP server's "create a Section first"
instruction) so nothing overlaps — follow the
"Documentation artboards & canvas layout" rules in
`${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md`, and run its
visual-validation loop (screenshot → fix any overlapping text or colliding
sections → re-screenshot) **and its "Post-build audit (REQUIRED before handoff)"
read-back checklist** (Frame-not-Section containers with no Section above them, auto layout, bound variables,
deterministic names) before the checkpoint. A showcase with overlaps isn't
a showcase.

**Validate both modes.** If the file has more than one mode (e.g. Dark/Light),
temporarily set the sheet frame to the non-default mode
(`setExplicitVariableModeForCollection`), screenshot, and confirm everything
stays legible — no invisible titles, no stranded backgrounds. Then clear the
explicit mode to restore the default. If anything breaks, the culprit is a fill
that isn't bound to a semantic variable — bind it and re-check.

## Step 2.5 — Build the Cover page

Now that tokens and styles exist, build the file's first impression: a branded
**Cover** page. (Environment setup deliberately skips this — there was nothing
on-brand to build it from yet. If `figma.coverPageBuilt` is already `true`, just
refresh the "Last updated" date instead of creating a second Cover.)

- Find the file's first page. If it's the default empty "Page 1" (no meaningful
  content), **rename it to `Cover`** and use it. If it has content, create a new
  page named `Cover` and move it to the **top** of the page list. Don't clobber a
  page the user has already worked in.
- On that page, build one clean **Cover** frame with:
  - the design system name (`workspace.name`),
  - the author/owner name (ask once if you don't have it, or use the file owner),
  - "Last updated" with the current date,
  - a tasteful branded graphic — a bold wordmark, a few shapes, generous spacing,
    not an elaborate illustration.
- **Bind everything to the system you just documented** — text to text styles,
  fills to `Color/Semantic` variables (page background → `bg/default`, etc.) — so
  the Cover survives a mode switch exactly like the Foundations page. This is the
  whole reason it's built here and not at setup. Validate both modes the same way.
- Use proper **vertical auto layout** and place content inside the frame (no
  floating, no overlapping text) per
  `${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md`.
- **Setting it as the file thumbnail is a manual step** — the plugin API can't do
  it. Tell the user plainly: "To make this the file's cover image, right-click the
  Cover frame and choose **Set as thumbnail**." Offer it; don't block on it.
- Record `figma.coverPageBuilt` = `true`.

## Step 3 — Checkpoint

Show the user the Foundations page and the Cover page. Sequential review (this is
a Figma-authoring skill — no subagents). Iterate on layout/styling if they want
changes. Then update the manifest: `sheets.built` = `true`, append
`token-sheet-builder` to `completedSkills`.

## Step 4 — Hand off

Note that the page refreshes via re-running this skill, and that it pairs well
with a token sync. Offer natural next steps (icons, components). Don't auto-run.

## Notes

- Beautiful and on-brand is a requirement, not a nice-to-have.
- Live-bind where possible; be honest about what needs a regenerate.
- The sheet must consume its own system: every text node on a text style, every
  fill on a semantic color variable, so it survives a mode switch.
- Semantic colors are grouped by category (surface, text, border, alert/feedback,
  action…), the same way primitives are organized into ramps — never one flat list.
- One dedicated page named **Foundations**.
