# Remediation run: handoff

Date: 2026-09-11
Corrected: 2026-09-13 — Phase 4 shipped on 2026-09-12 and has moved from
"What's unfinished" to "What shipped". Nothing else about this note changed.

The backlog got worked in order against pinned #112. Five batches are done. One
is left, and it is blocked on Q9. Nothing has been released.

## What shipped

All merged to `main`, all under `[Unreleased]`.

- **Correctness.** The Figma executor checks which file it is about to write to
  (#107, PR #115). Promoting a component to stable reaches doc cards with the
  legacy header (#108, PR #116). `nothing-scanned` reports the files it walked
  (#109, PR #113 from an outside contributor). CI checks that every documented
  install set carries its own imports (#106, PR #117).
- **Prose and procedure.** `sync-adapters.md` links native build behaviour
  instead of restating it (#86, PR #118). An e2e run that expects no change must
  prove it could see one (#77, PR #119).
- **The adherence gate, measured and finished.** The colour rule was measured
  against the throughline-ds site and zygarden-frontend (PR #122). 70% of its
  flags were wrong, so it was narrowed first (#123, PR #125): 73 flags down to 26,
  every real finding kept. Then spacing, radius and type rules (#39, PR #126),
  and #39 closed. Then the three bugs the measurement turned up: the component
  rule failing `<Icons.X>` and `<CardTitle>` (#120, PR #129), skipped colour
  tokens going uncounted (#121, PR #130), and a local Storybook build getting
  scanned (#124, PR #131).
- **Web output validation.** `tokens:validate-output` checks web CSS, not just
  native output (#37, PR #128).
- **Phase 4, the proof bundle** (2026-09-12, both merged). Every stage now leaves
  a durable entry on disk and `verify:check` re-derives what it can, so a stage
  advances on evidence somebody kept rather than on prose that evaporates when the
  run ends (#110, PR #136). Colour contrast landed as the fourth derived rule
  inside it rather than a checker beside it: eight semantic pairs at WCAG AA,
  compared once per mode, failing the token build rather than warning about it
  (#45, PR #139). Manifest `schemaVersion` is 7.

## What's unfinished

- **The adherence gate release.** Everything #112 said must be in it is merged.
  Before writing the release notes, fix the roadmap line in `README.md` that still
  says only native targets are validated per build. #37 changed that.
- **Phase 5.** The consumption layer, #40 through #44. It can't start until Q9
  is answered.
- **Waiting on something real.** #127 needs a generated MUI theme before anyone
  writes an extractor. #38 waits for a project that needs asset catalogs.

## What the next session needs to know

- **#112 is the order.** Its boxes are ticked as work merges. Start there.
- **Spec decisions made during the run are marked.** Each one says "accepted
  under Jordan's standing instruction", so they can be told apart from choices
  made in conversation. The specs are in `docs/specs/`.
- **Measurements run on throwaway clones** of `throughline-brand` and
  `zygarden-frontend`, at the commits recorded in
  `docs/superpowers/notes/2026-09-11-colour-rule-measurement.md`. Neither repo was
  touched.
- **A detailed bug issue gets picked up fast.** #113 arrived ten minutes after
  #109 was filed. Read outside PRs for safety before merging anything. This
  code ends up in people's repos.

## Open questions

- **Q9: what does composing in code (#41) produce?** One screen, a flow, or an
  app scaffold. My recommendation is one screen added to an existing app. It's
  the smallest unit that runs the whole chain: read the inventory, compose, gate,
  report gaps.
- **Left open on purpose in the specs,** until a real run shows the problem:
  - declared component parts in the manifest;
  - what counts as a skipped dimension token;
  - story scaffolding flags;
  - a web variable declared only in another mode's block.
