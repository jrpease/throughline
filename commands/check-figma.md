---
description: Check what's already in Figma against the design system, read-only — screens for detached components and raw values a token has, and existing component sets for their states, focus ring and focus contrast.
---

Check the Figma file against the design system without changing it. Use the
settings already in `design-system.json` (`figma.fileKey`, `project.uiFramework`,
`components.built`) rather than re-asking them. Scale explanation to
`user.codingLevel`.

1. **Know the file.** Read `figma.fileKey` from `design-system.json`. If it's
   absent, stop and ask which file to check.
2. **Confirm the active file.** Run the preflight in
   `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md` ("confirm the *active*
   file is your target") against that fileKey, and pin it with `figma_navigate`
   (`lock: true`) for the run. Unpin when done.
3. **Screens.** Unless the user named them, ask which page holds the screens, and
   optionally which screens on it. Run the snippet in
   `${CLAUDE_PLUGIN_ROOT}/references/figma-adherence.md` verbatim, with
   `const TARGET = { page, screens, fileKey }` (the fileKey from step 1, for the
   links) and `const SKIP = []` filled. The script is the rule; don't re-derive its
   checks.
4. **Existing component sets.** Ask which page holds the component sets, so only
   that page is loaded. Ask which colour variables are the page surfaces the
   components sit on, offering the file's likeliest default page surface (read the
   names with `figma_get_variables`), or let the user skip focus contrast. For each
   name in `components.built`, run
   `${CLAUDE_PLUGIN_ROOT}/references/figma-checks.md` with `MODE = 'existing'` and
   `EXPECT = { name, page, uiFramework, surfaces, archetype }` (`uiFramework` from
   `project.uiFramework`; `archetype` from the `archetype` field of the doc record
   at `components.meta[<name>].doc.path`, left out when there's no pointer, record
   or field). A name with no set on that page is reported as missing,
   not as a failure of the others. When `focus-indicator` fails on a wrapped control
   (an Input with a label, a Checkbox whose box is an inner frame), look at one focus
   variant's layers before reporting it: if the ring is on an inner layer, run that
   set again with `controlLayer` naming that layer, and say in the report that you
   did. Then collect the sets whose `state-baseline` or `focus-indicator` skipped
   because the name isn't in the state table or its kind owes no states, and that
   had no `archetype`. Ask about them in one question: is each interactive, and if
   so, which kind (button, input or choice)? Rerun those sets with `archetype`, and
   say in the report that you did. A set the user calls not interactive keeps its
   skip. A rerun set that fails `focus-indicator` gets the same inner-layer look as
   above. A doc record's `archetype` only fills in for these skipped names; a name
   the state table already checks keeps its own kind.
5. **Report.** The screen gate gives one pass or fail for the page: list its
   failures grouped by screen (the path's second segment), each with its detail and
   link, then the advisories, the counts and any skipped rules. Then pass or fail
   per component set, with whether focus contrast ran and against which surfaces. Say plainly what the
   gate can't see: a frame drawn from scratch to look like a component, variables
   that live only in a published library, and focus strokes painted from a colour
   style rather than a variable (likely, not yet seen on a real file). Say too that
   a focus stroke on a hidden layer, a zero-opacity paint, or a hidden focus paint
   beside a visible one still counts. A focus stroke bound to a colour that isn't a
   focus variable is reported as a failure naming that colour.

Never edit the file to make a check pass, and never edit a token. A failure is
a finding for the user; fixing it is a separate, deliberate step.
