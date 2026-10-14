---
description: Compose a screen in Figma from the design system's own components, variables and text styles — every value bound, nothing invented, gated before it's handed over.
---

Compose the screen the user asked for in Figma, from what the file already has.
Use the settings already in `design-system.json` (`figma.fileKey`) rather than
re-asking them. Scale explanation to `user.codingLevel`.

1. **Know the file.** Read `figma.fileKey` from `design-system.json`. If it's
   absent, stop and ask which file to compose in.
2. **Confirm the active file.** Run the preflight in
   `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md` ("confirm the *active*
   file is your target") against that fileKey, and pin it with `figma_navigate`
   (`lock: true`) for the run. Unpin when done.
3. **Read what exists.** Unless the user named them, ask which page holds the
   component sets and which page the screen goes on (it's created if missing). Run
   the snippet in `${CLAUDE_PLUGIN_ROOT}/references/figma-compose.md` verbatim, called
   as its "How to call it" section says (`MODE` and `SPEC` declared above it,
   `return await runCompose(MODE, SPEC);` below it), with `MODE = 'inventory'` and
   `SPEC = { componentsPage }`. If the plan will set an instance-swap property (an
   icon, say), ask which page holds the swap targets and run `inventory` again with
   `iconsPage`.
4. **Plan.** Write the screen description (its shape is the `DESCRIPTION` comment
   in the snippet, at the top of the resolver) using only names from the
   inventory's summary: component sets and their properties and options, variables
   by kind, text styles, modes. Leave `sizing` off an instance unless it should
   fill; `hug` works only on a set whose summary says `autoLayout: true`. Frames
   carry layout only (auto layout, gap, padding, fill, stroke, radius); everything
   the user sees is a component instance or styled text. When the request needs a
   component the inventory doesn't have, keep it in the description under the name
   asked for, and don't ask yet: the build (step 5) refuses it, names its nearest
   and writes nothing, and the user is asked on that error whether to leave it out,
   use a named existing component instead, or stop. An icon the swap-target page
   doesn't hold is a gap in the same way. Never draw a lookalike from frames.
5. **Build.** Run the snippet with `MODE = 'build'` and
   `SPEC = { componentsPage, iconsPage, description, fileKey }`. If it returns
   errors, nothing was written. A `missing-component` or `missing-swap-target`
   error goes back to the user as in step 4. Once they answer, record each gap,
   once per gap rather than per attempt:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/gap-report.mjs record --system <the directory holding design-system.json> --side figma --screen <screen> --target <page> --asked <name> --resolution <left-out | used:<Component> | stopped>`.
   Add `--kind icon` for an icon or swap target; `--nearest` with the names the
   build offered, comma-separated (leave it off when there were none); `--need`
   with one sentence on what the screen needed it for; and `--from` with the
   existing components or parts it would have been made of, comma-separated, where that's clear (leave it
   off rather than guess). Then
   fix the description and build again. A `name-taken` error on
   `<screen>` means a screen a person made already has that name: ask for another
   name. On `WIP: <screen>` it means an unmarked frame holds the working name: ask
   the user to rename or remove it. If the call throws instead, the build rolled
   itself back and nothing was written: stop, and report the error as a composer
   bug rather than reworking the screen around it.
6. **Gate.** Run the screen gate in
   `${CLAUDE_PLUGIN_ROOT}/references/figma-adherence.md` verbatim with
   `TARGET = { page, screens: ['WIP: <screen>'], fileKey }` and `SKIP = []`. If it
   fails, stop: report its failures as a composer bug, with their links, and leave
   the `WIP:` frame for inspection. Don't change the description to make it pass.
   Remove that frame with `MODE = 'discard'` and `SPEC = { page, screen }` only
   when the user asks.
7. **Finalize.** Run the snippet with `MODE = 'finalize'` and
   `SPEC = { page, screen, fileKey }`. It replaces an earlier screen of that name
   only if throughline composed it.
8. **Review.** Dispatch the `reviewer` agent in Figma-visual mode with the screen's
   node id (from finalize), the fileKey, the project's working directory (where
   `design-system.json` is) and the user's request as its spec, unless the host
   can't dispatch agents, in which case screenshot the screen yourself and say so.
9. **Report.** The screen's link, whether it replaced an earlier one, the gate's
   counts, the reviewer's verdict, and every gap: each component or icon that was
   asked for and doesn't exist, with the nearest names the script offered, and
   anything left out of the request because of it. Say the gaps were recorded in
   `design-system/gaps.json`, and that `/throughline:gap-report` ranks them for
   triage.

Never edit a component, a variable or a text style, and never write a raw value.
If the screen can't be built from what the system has, the gap is the finding.
