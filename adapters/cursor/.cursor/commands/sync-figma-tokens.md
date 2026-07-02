Re-run the token sync pipeline to catch any updates made in Figma.

Follow the `token-sync-layer` rule's pipeline using the settings already
recorded in `design-system.json` (`sync.platforms`, `figma.mechanism`,
`figma.fileKey`) — don't re-ask configuration that's already set. Specifically:

1. Verify Figma is connected (cheap liveness read); if not, offer
   `figma-environment-setup`.
2. Re-extract Figma variables to DTCG JSON.
3. Rebuild outputs through Style Dictionary for every platform in
   `sync.platforms`.
4. Run full-regeneration with **rename detection** — diff against the previous
   output, flag probable renames (vanished + reappeared with identical
   `$value`/`$type`) and plain deletions.
5. Open a **reviewable PR** (or a reviewed branch diff if the repo is only
   `local-git`) summarizing added / changed / deleted / probable-renames. Never
   write silently.
6. Update `sync.lastRun` and `tokens.lastSync` in the manifest.

Scale explanation to `user.codingLevel`. This is the recurring loop of the whole
system: tokens change in Figma → `/sync-figma-tokens` → review PR → merge.

