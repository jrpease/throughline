---
description: Show the components and icons composed screens asked for that the design system doesn't have, ranked by how many screens hit them, and triage each one — build it, point at what already exists, or drop it.
---

Show the maintainer what composed screens needed and couldn't find, and help them
decide what to do about each gap. The gaps were recorded by
`/throughline:compose-code` and `/throughline:compose-figma`. Scale explanation to
`user.codingLevel`.

1. **Find the system.** The directory holding `design-system.json`, or, without
   one, the directory holding a `design/` folder (where `/throughline:compose-figma`
   keeps gaps for a file built from a connected library). gap-report picks the file
   itself. If there's neither, say nothing has been composed here yet and stop.
2. **Read the report.** Run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/gap-report.mjs report --system <dir>`. If it
   says no gaps are recorded yet, say so: gaps appear once a composed screen asks
   for something the system doesn't have. Stop there.
3. **Present it.** Open gaps first, in the order the report ranks them. For each,
   say how many screens asked for it, what they needed it for, and how people got
   by. Where the report flags a likely docs gap, say that people keep reaching for
   an existing component instead, so the fix may be its docs rather than a new
   component. Mention how many gaps are already triaged; don't walk them unless
   asked.
4. **Triage.** Ask about the open gaps one at a time, top first, with your
   recommendation, and stop whenever the maintainer wants to. The choices:
   - **build**: it's a real component (or icon) to add.
   - **exists**: something the system already has covers it. Ask which one; it
     goes in the note.
   - **dropped**: not needed.
   - **leave open**: decide later. Record nothing.

   Record each choice with
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/gap-report.mjs triage --system <dir> --name <gap name> --status <build | exists | dropped> [--note <text>]`.
   `--name` is the gap's name as the report heads it, without the kind in
   brackets. `exists` needs `--note`: just the existing component's name, since the
   report prints it after the gap. A triage replaces any earlier note, so pass
   `--note` again to keep one. A decided gap can be reopened with `--status open`.
5. **Next steps.** For each component marked `build`, offer
   `/throughline:new-component`; for an icon, the `icon-system-builder` skill.
   For each marked `exists`, offer `/throughline:document-component` on the named
   component, so its `whenToUse` says when to reach for it and the next composer
   finds it. Offer, don't run.

The report is the maintainer's copy to work from: each open gap reads as a draft
component request they can paste into their own tracker. Don't file anything on
their behalf. The gap file (`design-system/gaps.json`, or `design/gaps.json`
without a system) is meant to be committed, so a team's screens add up in one
place.
