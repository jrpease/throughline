Compose the screen the user asked for in Figma, from what the file already has.
Use the settings already in `design-system.json` (`figma.fileKey`) rather than
re-asking them. Scale explanation to `user.codingLevel`.

1. **Know the file.** Read `figma.fileKey` from `design-system.json`. If it's
   absent, stop and ask which file to compose in.
2. **Confirm the active file.** Run the preflight in
   `.throughline/references/figma-scripting.md` ("confirm the *active*
   file is your target") against that fileKey, and pin it with `figma_navigate`
   (`lock: true`) for the run. Unpin when done.
3. **Read what exists.** Unless the user named them, ask which page holds the
   component sets and which page the screen goes on (it's created if missing). Run
   the snippet in `.throughline/references/figma-compose.md` verbatim with
   `MODE = 'inventory'` and `SPEC = { componentsPage }`. If the plan will set an
   instance-swap property (an icon, say), ask which page holds the swap targets and
   run `inventory` again with `iconsPage`.
4. **Plan.** Write the screen description (its shape is documented at the top of
   the snippet) using only names from the inventory's summary: component sets and
   their properties and options, variables by kind, text styles, modes. Frames
   carry layout only (auto layout, gap, padding, fill, stroke, radius); everything
   the user sees is a component instance or styled text. When the request needs a
   component the inventory doesn't have, say so before building and ask: leave it
   out, use a named existing component instead, or stop. Never draw a lookalike
   from frames.
5. **Build.** Run the snippet with `MODE = 'build'` and
   `SPEC = { componentsPage, iconsPage, description, fileKey }`. If it returns
   errors, nothing was written: fix the description (a `missing-component` error
   goes back to the user as in step 4) and build again. A `name-taken` error means
   a screen a person made already has that name: ask for another name.
6. **Gate.** Run the screen gate in
   `.throughline/references/figma-adherence.md` verbatim with
   `TARGET = { page, screens: ['WIP: <screen>'], fileKey }`. If it fails, stop:
   report its failures as a composer bug, with their links, and leave the `WIP:`
   frame for inspection. Don't change the description to make it pass.
7. **Finalize.** Run the snippet with `MODE = 'finalize'` and
   `SPEC = { page, screen, fileKey }`. It replaces an earlier screen of that name
   only if throughline composed it.
8. **Review.** Dispatch the `reviewer` agent in Figma-visual mode with the screen's
   node id (from finalize) and the user's request as its spec, unless the host
   can't dispatch agents, in which case screenshot the screen yourself and say so.
9. **Report.** The screen's link, whether it replaced an earlier one, the gate's
   counts, the reviewer's verdict, and every gap: each component that was asked
   for and doesn't exist, with the nearest names the script offered.

Never edit a component, a variable or a text style, and never write a raw value.
If the screen can't be built from what the system has, the gap is the finding.

