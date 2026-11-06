# Backlog run: handoff

Date: 2026-11-06

## What shipped (merged to main)

- #203: the 0.33.1 copy update (README, npm, adapters, `start`, `design-system-status`,
  "Mode 1/2/3"). **Merged but not tagged**: `v0.33.1` goes on `2d30173`.
- #204 (#191 doc card roles can name a collection), #205 (#202 same-named sets,
  nested screens, `system keys` formatting), #207 (#198, four of five), #206 (#160
  line table). In `CHANGELOG.md` under `[Unreleased]`.
- throughline-ds#19: the site's new hero and "Design with what you have", deployed
  to production and checked live at radicool.studio/throughline.

## Open, reviewed, waiting on the owner's "merge"

- #208: `doc-description.mjs` and `render-mdx.mjs` (#188). Critic: ship.
  Spec `docs/specs/2026-11-06-doc-projection-scripts.md`.
- #209: design-modes phase 1c, drift for product-file screens. Critic: fix first,
  then ready to merge after the fixes. Spec `docs/specs/2026-10-30-design-modes.md`
  Q40–Q47.

Both add to `CHANGELOG.md`'s `[Unreleased]`, so the second to merge will conflict
there; merge `origin/main` into it and keep both blocks.

## Next

1. Owner pushes the tag: `git tag v0.33.1 2d3017353c02f5b1a6dbc150b82d2c960a0082ee && git push origin v0.33.1`, then watch `release.yml`.
2. Merge #208 and #209, then cut **0.34.0** (one release: #191, #202, #198, #188,
   phase 1c; 1c is new capability, so minor).
3. Live runs that need Figma open: phase 1c and #191 in Zygarden.gg on the
   Zygarden Design System; #198's rounded header and every-variant check on a file
   with no doc kit.

## Open questions

- Phase 1c: a library set deleted after a product-file screen used it isn't
  detected (design-modes spec, Open questions). Recommendation: report a recorded
  component whose doc record is gone, offline.
- Re-render the sample's live Figma descriptions into the template format? They're
  in two older formats, so it rewrites every `figmaDescription` stamp.
- The rest of the backlog needs product calls, not building: #169 (does an INSIDE
  stroke count as a focus indicator?), #168 (waits on an audit), #127 (needs a real
  MUI theme), doc card Step 2 (design round), #47/#48.
