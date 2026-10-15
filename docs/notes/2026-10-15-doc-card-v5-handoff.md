# Doc card v5: handoff

Date: 2026-10-15
Spec: `docs/specs/2026-10-15-doc-card-v5.md` (Status: spec, Reviewed: needs revision)

## Where it stands

A grill-to-spec interview settled 24 decisions for redesigning the Figma doc card
toward Manyfest's "Documentation Pilot" artboard (file `0AgaYH2xuGNKKDW1pRYLkg`,
artboard `23546:2623`). The spec is written. A critic review came back **needs
revision**. Nothing is built.

## Next: one short grilling round, then revise the spec

Five findings need Jordan's call:

1. **Status chip colour.** Finalize re-binds the chip's fill to the status colour
   today (`references/figma-component-standards.md:373-388`). A text property on
   `_Doc/Header` can't do that. Options: make status a variant property on the
   header, or override the fill inside the instance. Also say who carries the old
   chip's value across during the v4 → v5 migration, since decision 15 says only
   finalize writes it.
2. **Step 1 drops content.** The v4 Usage band's row 3 shows variant meanings,
   state meanings and accessibility (`scripts/lib/doc-card-plan.mjs:64-74`). Step 1
   deletes it and those bands only come back in Steps 2–3. Keep them in Step 1,
   reorder the steps, or accept the gap.
3. **Two-set cards.** `Select Menu — Documentation` holds two sets, and v4 refuses
   it (`scripts/lib/doc-card-render.figma.js:51-60`). Split the card first, or
   support two sets.
4. **Matching record axes to Figma axes.** How the Variants and States bands match
   `record.variants` / `record.states` keys to Figma axis names and options (case,
   `State` vs booleans, `checked`). The drift comparer already pairs renamed axes,
   so reuse its rules (`docs/notes/2026-10-15-component-drift-live-run.md`).
5. **Where the token list comes from.** The record's `tokensUsed` (dotted names) or
   the variables actually bound in Figma (slashed names).

Then fix the smaller findings in place:

- The provenance rule should use the schema's protected tier (it misses `w3c-apg`,
  `framework` and blocks with no provenance).
- Say where `recordHash` lives in `surfaces.docCard` and add it to the schema-8 bump.
- Make the untagged-card fallback concrete: an optional `--node-id` on the first
  render, and whether the tag search covers the whole file.
- The inverse-surface fallback applies when the role is picked, not at render time.
- The specimen's width must never depend on the card's, or the measurement ratchets
  (`doc-card-plan.mjs:20-24`).
- Finalize does change: it sets properties on the header instance. Audit items 3,
  4 and 7 change too.
- Either give `toneCaution` a use (the Unreviewed chip) or drop it.
- Say 1440 is today's 3 × 480 minimum carried over.
- The status values are draft / beta / stable / deprecated. Remove "Final".
- There are 13 sample cards, not 14.

After that: re-run `/review-spec`, then `/build-spec`.

## Reference material

- The pilot's kit: `_Doc/Header` `23481:1812`, `_Doc/Band` `23481:1853`, in frame
  `23546:3216`.
- Manyfest's older skill was read from a pasteboard path that may not survive. Its
  useful ideas are already in the spec (live instances, a props table from
  `componentPropertyDefinitions`, skipping empty bands, tagging with shared plugin
  data).
