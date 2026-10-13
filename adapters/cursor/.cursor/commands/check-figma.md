Check the Figma file against the design system without changing it. Use the
settings already in `design-system.json` (`figma.fileKey`, `project.uiFramework`,
`components.built`) rather than re-asking them. Scale explanation to
`user.codingLevel`.

1. **Know the file.** Read `figma.fileKey` from `design-system.json`. If it's
   absent, stop and ask which file to check.
2. **Confirm the active file.** Run the preflight in
   `.throughline/references/figma-scripting.md` ("confirm the *active*
   file is your target") against that fileKey, and pin it with `figma_navigate`
   (`lock: true`) for the run. Unpin when done.
3. **Screens.** Unless the user named them, ask which page holds the screens, and
   optionally which screens on it. Run the snippet in
   `.throughline/references/figma-adherence.md` verbatim, with
   `const TARGET = { page, screens }` and `const SKIP = []` filled. The script is
   the rule; don't re-derive its checks.
4. **Existing component sets.** Ask which colour variables are the page surfaces
   the components sit on, offering the file's likeliest default page surface (read
   the names with `figma_get_variables`), or let the user skip focus contrast. For
   each name in `components.built`, run
   `.throughline/references/figma-checks.md` with `MODE = 'existing'`,
   `EXPECT = { name, uiFramework, surfaces }` (`uiFramework` from
   `project.uiFramework`). A name with no set in the file is reported as missing,
   not as a failure of the others.
5. **Report.** Per screen and per set: pass or fail, then every failure with its
   path, detail and link, then the advisories, the counts, any skipped rules, and
   whether focus contrast ran and against which surfaces. Say plainly what the
   gate can't see: a frame drawn from scratch to look like a component, variables
   that live only in a published library, and focus states drawn as an INSIDE
   stroke.

Never edit the file to make a check pass, and never edit a token. A failure is
a finding for the user; fixing it is a separate, deliberate step.

