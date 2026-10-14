Show the maintainer what has drifted since things were built from the system, and
which command fixes each. Use the settings already in `design-system.json` rather
than re-asking them. Scale explanation to `user.codingLevel`.

1. **Find the system.** The directory holding `design-system.json`. If there isn't
   one, say no design system is set up here and stop.
2. **Run the check.** From the repo root:
   `node .throughline/scripts/drift-check.mjs check --system <dir> --allow-empty`.
   It covers composed screens (code screens fully, Figma screens for stale only)
   and generated token output. Exit 1 means it found something broken or edited;
   that's a result to report, not a failure to stop on. Exit 2 is a usage or read
   error: report it and stop. If it says nothing was checked, say no screen has
   been composed and recorded yet and no sync has stamped the token output; the
   live half can still compare Figma against a variables stamp.
3. **The live half.** Only when `figma.fileKey` is set and the bridge is open on
   that file: confirm the active file is the target (the preflight in
   `.throughline/references/figma-scripting.md`) and pin it with
   `figma_navigate` (`lock: true`) for the run; unpin when done. Then run the
   snippets in `.throughline/references/figma-drift.md` verbatim, as its
   "How to call it" section says, one call each:
   - The variables snippet. Write the result to a scratch file as returned and run
     `node .throughline/scripts/drift-check.mjs compare-figma --system <dir> --from <file>`.
     Exit 1 means a collection moved: a result, like step 2's.
   - The screens snippet, with `SPEC = { entries }`, where `entries` is every entry
     in `design-system/screens.json` whose `side` is `"figma"`, as stored. Skip this
     call when there are none.
   A Figma screen's live state replaces the "stale" or "clean" step 2 gave it:
   `broken`, `gone` or `released` wins, and any contract change step 2 named for it
   stays as a note. Count it once, in its live state.
   When the bridge isn't open, say the live half was skipped and what it would
   have checked, and report Figma screens as step 2 left them. Never ask the user
   to open Figma just for this.
4. **Report.** In this order, leaving out what's empty:
   - **Broken screens** (including Figma screens that are `gone`): what each one
     uses that's gone, and the options the check says remain. The fix is to compose it
     again (`/throughline:compose-code` or `/throughline:compose-figma`) with the
     same name, or to put back what was removed.
   - **Edited token output**: generated files changed by hand. The next
     `/throughline:sync-figma-tokens` overwrites them, so the change belongs in
     Figma or in the sync's adapter, not in the file.
   - **Figma variables changed since the last sync**: which collections moved. The
     fix is `/throughline:sync-figma-tokens`, whose diff shows each variable.
   - **Stale screens**: which component's contract (its variants, states or
     tokens) changed since the screen was composed. Nothing is wrong yet; look at
     the screen, and compose it again if it should use what changed.
   - **Released screens**: their composed marker is gone, so a person owns them
     now. Offer to stop tracking each with
     `node .throughline/scripts/screens.mjs forget --system <dir> --side <side> --screen <screen>`,
     and run it only when the user says yes.
   - **Untracked components** (the check's "untracked (no doc record)" line under
     a screen: a component with no doc record can't be checked for stale) and
     **unstamped files** (in the system's output folders, not written by the last
     sync): one line each.
   End with the counts, and say the code half is the `drift:check` script, which
   can run in CI where the documentation scripts are set up.

Never fix drift from here: don't recompose a screen, re-sync tokens or edit a
generated file. The report is the finding.

