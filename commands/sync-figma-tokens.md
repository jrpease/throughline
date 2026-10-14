---
description: Re-run the Figma-to-code token sync — extract current Figma variables, rebuild code outputs via Style Dictionary, and open a PR with the changes for review.
---

Re-run the token sync pipeline to catch any updates made in Figma.

Follow the `token-sync-layer` skill's pipeline using the settings already
recorded in `design-system.json` (`sync.platforms`, `figma.mechanism`,
`figma.fileKey`) — don't re-ask configuration that's already set. Specifically:

1. Verify Figma is connected (cheap liveness read); if not, offer
   `figma-environment-setup`.
2. Before anything is written, run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/drift-check.mjs check --system <the directory holding design-system.json> --allow-empty`
   and read its token section. Exit 1 here is expected when generated files were
   edited by hand: it's a warning, not a stop. Name those files to the user, say
   this sync overwrites them and that the change belongs in Figma or in the
   adapter, and carry on. Its screens section isn't this command's business.
3. Re-extract Figma variables to DTCG JSON, and rebuild outputs through Style
   Dictionary for every platform in `sync.platforms`.
4. Run full-regeneration with **rename detection** — diff against the previous
   output, flag probable renames (vanished + reappeared with identical
   `$value`/`$type`) and plain deletions.
5. Update `sync.lastRun` and `tokens.lastSync` in the manifest.
6. Stamp what this sync wrote, so `/throughline:drift` can tell later when it
   moves. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/drift-check.mjs stamp --system <dir>`
   with one `--out <dir>` for each directory the sync wrote: the DTCG directory
   and each platform's output directory. Never the token package as a whole: it
   holds files people edit on purpose (the Style Dictionary config,
   `package.json`). Then run the variables snippet in
   `${CLAUDE_PLUGIN_ROOT}/references/figma-drift.md` (the short one), write the
   result to a scratch file, and run
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/drift-check.mjs stamp-figma --system <dir> --from <file>`.
   `design-system/token-stamp.json` goes in the same PR.
7. Open a **reviewable PR** (or a reviewed branch diff if the repo is only
   `local-git`) summarizing added / changed / deleted / probable-renames. Never
   write silently.

Scale explanation to `user.codingLevel`. This is the recurring loop of the whole
system: tokens change in Figma → `/sync-figma-tokens` → review PR → merge.
