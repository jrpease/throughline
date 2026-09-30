# #140 component accessibility checks: handoff

Date: 2026-09-30
Spec: `docs/specs/2026-09-29-component-accessibility-checks.md`

**Superseded later on 2026-09-30.** Step 7 ran live the same day. It built
`Chip` and `Toggle`, not the `RinglessButton` described below. The focus check
and the #138 fix are in the CHANGELOG, the README says so, and the spec is at
`Status: built`. The spec's "Where it diverged" section has the current state.
The rest of this note stays as it was written.

## What shipped (unreleased, on `main`)

- **#151.** The spec and its eight-step Plan.
- **#152.** Plan Steps 1–5: the JSX reader, `unnamed-control` and
  `colour-only-status` in the adherence gate, and `archetype` in the docs index.
  The measurement is in `2026-09-30-accessibility-usage-rules-measurement.md`: 24
  elements checked, no wrong failures, and no real ones in the corpus to catch.
- **#153.** Plan Step 6: the `focus-indicator` read-back, written once in the
  standards (post-build audit, item 9) and run by both `figma-executor` and
  inline `component-builder`.
- **#154.** Two decisions made after the build. Icon props are never the label,
  and an empty body is judged like a self-closing element.

## What's unfinished

- **Step 7, the live proof.** It needs a person and Figma, in #138's session. On a
  `shadcn` system, build a Button through `figma-executor`. Then build a
  `RinglessButton` from an architect spec hand-edited to drop the ghost focus
  variant's ring. The first must return `DONE` with `focus-indicator` recorded, and
  the second `BLOCKED`. Until this runs, the focus check isn't claimed anywhere:
  not in the CHANGELOG, and not in the README.
- **Step 8, close-out.** Add the focus check to the CHANGELOG once Step 7 passes.
  Correct #140's issue text, which says both halves become bundle entries; the
  usage rules are adherence-gate failures only. Show the user the edit before
  posting it.

## Open questions (in the spec, with recommendations)

- Whether focus-ring contrast becomes its own issue. Recommend yes.
- Whether the vanilla-css check asserts the `offset/focus` gap. Recommend no for
  v1.

## At release time

- The README roadmap (`README.md:207`) still calls text alternatives and status
  by colour "still ahead", but both are on `main`. Update it with the release,
  and leave focus off until Step 7.
- Both new rules can fail a run that passed before. The release notes need a
  Breaking line, as 0.20.0 had for its gates.
