# Doc card v5: handoff

Date: 2026-10-27
Branch: `docs/doc-card-v5-spec` (pushed, draft PR #190)
Spec: `docs/specs/2026-10-15-doc-card-v5.md` (Status: built)
Live run: `docs/notes/2026-10-26-doc-card-v5-step1-live-run.md`

Replaces the 2026-10-15 handoff, which predated the review and the build.

## What's done

Release Step 1 (decision 22) is built through Step 1.7:

- Steps 1.1 to 1.6: schema 8, planner, renderer, payload, the builder's setup
  prose, and the prose callers. `node --test` passes 1040/1040; the builder,
  adapter, plugin, skills, install-set and pinned-run checks pass.
- Step 1.7, the live run:
  - All 14 sample cards are rendered.
  - 01. Design System renders as a second file (Badge, on a scratch page Jordan
    has since deleted).
  - Zygarden is blocked by duplicate variable names across collections. Filed
    as #191.
- Kits are drawn in the sample (set `466:612`) and in 01 (set `1105:2342`).
  Jordan wants both kept so he can document them later.

Decisions amended on 2026-10-27, after Jordan's feedback on colours:

- **Decision 4.** The header uses the brand, following how the file's own
  artboards set their headers off. It must differ from the card frame's fill,
  and the renderer refuses a header whose fill matches.
- **Decision 20.** `toneCaution` now colours only the Unreviewed chip.
- **Decision 27.** Status chips take `textOnHeader`.

Header colours now in use:

| File | Header | Text and chip |
|---|---|---|
| Sample | `color/bg/muted`, #353535 | `color/brand/primary` (green) |
| 01 | `surface/brand-primary-default` (yellow) | `text/on-brand-primary` (red) |

## What's unfinished

1. **Step 1.8 is done.** The later-band issues are filed as #192 to #196
   and linked in the live-run note.
2. **Close-out (build-spec step 5).**
   - Set `Status: built`.
   - Write "What shipped" and "Where it diverged":
     - the renderer throws when a kit exists but `figma.docKit` is null;
     - the term column is computed;
     - the one-set split was already done;
     - the stall procedure;
     - the Zygarden collision (#191);
     - decisions 4, 20 and 27 amended;
     - the header guard.
3. **Gaps the fresh agent found in `commands/document-component.md`.** The
   live-run note's "The fresh agent's walk" lists them. Propose fixes.
4. **The stall procedure.** `references/doc-card-builder.md` should say: keep
   Figma side by side with the terminal for the whole write run, and read the
   node state after a timeout. Today it's only in memory and the note.
5. **Square header corners.** The header has no radius while the bands do. It
   needs Jordan's call.
6. **The sample repo** (`~/Dev/throughline-sample`) has uncommitted manifest
   changes: schema 8, the doc card roles, and `surfaceHeader: color/bg/muted`.
   Ask before committing there.
7. **01's manifest.** When 01 is documented for real, its manifest needs
   `figma.docKit: { fileKey: "bk45RXGcpqiFZgbR5cQiWt" }` and the 01 brand roles
   above.

## What the next session needs to know

- Live runs need Figma **side by side** with the terminal. A hidden window
  stalls `loadFontAsync`. The run finishes once Figma is visible, so after a
  timeout, read the node state before you re-run.
- The bridge target is pinned to Throughline Plugin Test
  (`OCiZiGpsJ4ncPD8r205BjC`). Reads in other files go by `fileKey`.
- The renderer has no Node tests. The header guard was checked live: it threw
  on the sample before the restyle and passed for all 14 cards after. It
  catches only an exact colour match.

## Open questions

- Should the header guard also catch near-matches (a contrast threshold), or is
  an exact match enough?
- Square header corners: give the header `radiusBand`, or accept them?
