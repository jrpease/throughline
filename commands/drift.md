---
description: Show what moved under the things built from the design system — composed screens that broke or went stale, generated token files edited by hand, Figma variables changed since the last sync, and components whose Figma or code no longer matches their doc record.
---

Show the maintainer what has drifted since things were built from the system, and
which command fixes each. Use the settings already in `design-system.json` rather
than re-asking them. Scale explanation to `user.codingLevel`.

1. **Find the system.** The directory holding `design-system.json`. If there isn't
   one, say no design system is set up here and stop.
2. **Run the check.** From the repo root:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/drift-check.mjs check --system <dir> --allow-empty`.
   It covers composed screens (code screens fully, Figma screens for stale only),
   generated token output, and each component's code against its doc record. Exit 1 means it found something broken or edited;
   that's a result to report, not a failure to stop on. Stale screens and code that's
   behind exit 0: they're findings too, just not failures. Exit 2 is a usage or read
   error: report it and stop. If it says nothing was checked, say no screen has
   been composed and recorded yet, no sync has stamped the token output and no
   component's code has been stamped; the live half can still compare Figma.
3. **The live half.** Only when `figma.fileKey` is set and the bridge is open on
   that file: confirm the active file is the target (the preflight in
   `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`) and pin it with
   `figma_navigate` (`lock: true`) for the run; unpin when done. Then run the
   snippets in `${CLAUDE_PLUGIN_ROOT}/references/figma-drift.md` verbatim, as its
   "How to call it" section says, one call each:
   - The variables snippet. Write the result to a scratch file as returned and run
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/drift-check.mjs compare-figma --system <dir> --from <file>`.
     Exit 1 means a collection moved: a result, like step 2's.
   - The screens snippet, with `SPEC = { entries }`, where `entries` is every entry
     in `design-system/screens.json` whose `side` is `"figma"`, as stored. Skip this
     call when there are none.
   - The components snippet. Run the check again with `--json` (step 2's report
     stays as it is) and take `names` from its `components.documented`; skip this
     call when it's empty. `SPEC = { names }`, plus `componentsPage` set to the
     `componentsPage` of any Figma entry in `design-system/screens.json` when there
     is one. If the snippet throws because it can't tell which page holds the
     components, ask the user for the page name once and run it again with it.
     Write the result to a scratch file as returned and run
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/drift-check.mjs compare-components --system <dir> --from <file>`.
     Exit 1 means a component differs: a result.
   A Figma screen's live state replaces the "stale" or "clean" step 2 gave it:
   `broken`, `gone` or `released` wins, and any contract change step 2 named for it
   stays as a note. Count it once, in its live state.
   When the bridge isn't open, say the live half was skipped and what it would
   have checked (Figma screens' live state, Figma variables, and Figma
   components against their doc records), and report Figma screens as step 2
   left them. Never ask the user
   to open Figma just for this.
4. **Report.** In this order, leaving out what's empty:
   - **Broken screens** (including Figma screens that are `gone`): what each one
     uses that's gone, and the options the check says remain. The fix is to compose it
     again (`/throughline:compose-code` or `/throughline:compose-figma`) with the
     same name, or to put back what was removed.
   - **Edited token output**: generated files changed by hand. The next
     `/throughline:sync-figma-tokens` overwrites them, so the change belongs in
     Figma or in the sync's adapter, not in the file.
   - **Components**: first, from the live half, each Figma component that differs
     from its doc record: the axes and options in Figma and not the record, and the
     other way, or that it's gone from Figma. A "renamed?" line means a record axis
     and a Figma axis have the same options under different names: the fix is to
     rename one to match, never to add both. Otherwise the fix is
     `/throughline:document-component <Name>`, folding in exactly the axes and
     options named (it infers variants rather than reading them off Figma, so name them),
     or changing Figma back when Figma is the one that's wrong. Then, from step 2,
     each component whose code is **behind**: its code was built against an older
     shape of the record (variants, states or tokens), so it may be missing what
     changed. This is a stamp, not a reading of the code. The fix is to rebuild that
     component's code with `storybook-chromatic-builder`, for that one component as
     the `component-pipeline` skill's Stage 3 runs it, which stamps it again. If the
     user says the code already matches, offer
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/drift-check.mjs stamp-code --system <dir> --component <Name>`,
     and run it only when they say yes.
   - **Figma variables changed since the last sync**: which collections moved. The
     fix is `/throughline:sync-figma-tokens`, whose diff shows each variable.
   - **Stale screens**: which component's contract (its variants, states or
     tokens) changed since the screen was composed. Nothing is wrong yet; look at
     the screen, and compose it again if it should use what changed.
   - **Released screens**: their composed marker is gone, so a person owns them
     now. Offer to stop tracking each with
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/screens.mjs forget --system <dir> --side <side> --screen <screen>`,
     and run it only when the user says yes.
   - **Untracked components** (the check's "untracked (no doc record)" line under
     a screen: a component with no doc record can't be checked for stale),
     **unstamped files** (in the system's output folders, not written by the last
     sync), **code not stamped** (documented components whose code was built before
     stamping, or by hand: nothing to compare yet) and **no doc record** (built
     components neither half can check): one line each.
   A check that had nothing to compare against ("No token stamp yet", "No Figma
   stamp yet", "No code stamp yet") isn't empty: report it in one line, with the
   command that writes the stamp, rather than leaving it out.
   End with the counts, and say the code half is the `drift:check` script, which
   can run in CI where the documentation scripts are set up.

Never fix drift from here: don't recompose a screen, re-sync tokens or edit a
generated file. The report is the finding.
