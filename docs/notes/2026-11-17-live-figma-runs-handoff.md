# Handoff: #169 shipped as a PR, live Figma runs for 0.34.0 still owed

Date: 2026-11-17

## What shipped (open, waiting on the owner's "merge")

- **PR #213, #169**: `/throughline:check-figma` counts a focus state drawn as a
  stroke on existing sets, a set it skips can be given a kind, and a state named
  `focused` counts as `focus`. Spec: `docs/specs/2026-11-15-inside-stroke-focus.md`
  (Status: built, run live on both files). CI green, last critic verdict ready to
  merge. 1138/1138 tests.
- Run live on 2026-11-15: Zygarden's `search`/`autocomplete` and 01. Design
  System's Text Field and Card. Results are in the spec's "Where it diverged" and
  in two comments on the PR.
- Ticket tidy: #170 closed, #111 updated with the 11-09 directory refusal, #112
  refreshed (#188 ticked).

## Unfinished: live runs that 0.34.0 shipped without

Nothing below has run in Figma yet. Each needs Figma Desktop open with the
Desktop Bridge plugin running in the named files.

1. **Design-modes phase 1c (#209): drift for product-file screens.**
   `/throughline:drift` on screens in **Zygarden.gg** that use the **Zygarden
   Design System** library. Read-only. Spec `docs/specs/2026-10-30-design-modes.md`
   Q40–Q47.
2. **#191: doc card roles name a collection.** Render one doc card in the Zygarden
   Design System, which couldn't render one before (twinned `spacing/space/*`
   variables). Writes a card, so ask before running it.
3. **#198: the rounded header.** Draw a doc kit fresh on a file with no kit
   (Throughline Plugin Test), and check `radiusBand` on the header and every
   variant. Writes, so ask first. The last unchecked box on #198.

If any of these finds a bug, it gets the normal flow (spec if needed, PR, never
merge). Memory `live-figma-run-before-done` explains why these come first.

## Open questions

- #213's spec still has three: strokes painted from a colour style, how the kind
  question is asked (built batched), and the per-node visibility guard. Neither
  live file had a colour-style or hidden-paint stroke.
- Phase 1c: a library set deleted after a screen used it isn't detected (from the
  2026-11-06 handoff, still open).
- Stale local branches `backup/pre-reset-main` (never pushed) and
  `docs/verification-proof-bundle-handoff` (upstream gone). Wait on the owner.
