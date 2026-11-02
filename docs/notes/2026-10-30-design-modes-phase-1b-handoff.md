# Design modes phase 1b: handoff

Date: 2026-10-30
Spec: `docs/specs/2026-10-30-design-modes.md` (Q3 "Rules out", Q21 item 1b)
Branch: `feat/design-modes-1b` (this note is its only commit so far)

## What shipped before this

- 0.32.0 (#199): phase 1. Mode detection, mode b in compose-figma, library cache,
  `{ raw }` values, library tokens in the gate, gap-report on `design/gaps.json`.
- 0.32.1 (#200): README and listings reposition ThroughLine as an agentic design
  team. Q22 amended, Q21 gains phase 1b.
- Both tagged and published to npm and GitHub Releases.

## What 1b is

Mode a's rules in a product file that uses a throughline system as its library
(Zygarden.gg on the Zygarden Design System). Today that file is mode b: raw values
allowed, local stand-ins allowed, no drift. The owner approved 1b on 2026-10-30
and said to take Claude's recommendations. No 1b decisions are in the spec yet.

## Facts checked live (2026-10-30)

- In Zygarden.gg (`948SPugP1tqqLpLleHZOsU`), `teamLibrary` collection keys equal
  the system file's (`k5EV3vXCZ7eTKFgqS0TMFv`) local `VariableCollection.key`, all
  10. Remote component set keys reached through instances equal the system file's
  set keys (button `a58cbedf…`, text field `038d21ca…`, dropdown `811d557f…`,
  step-indicator `d401f7fb…`, icon-button `66506b54…`). `libraryName` equals the
  system file's name.
- `zygarden-frontend/design-system.json` records no collection or component keys
  (only `figma.fileKey`). Nothing else in that repo does either.
- Drift's live half (`commands/drift.md` step 3) assumes every Figma screen lives
  in `figma.fileKey` and finds components on that file's components page.

## Recommendations to write up as decisions (owner said take them)

1. **Detection:** consumer = `design-system.json` present, its `figma.fileKey` is
   not the open file, and a connected library collection's key is in a recorded
   list of the system's collection keys. Not by library name (renameable).
2. **Recording the keys:** saved on any mode a compose-figma run (signals reads
   local collection keys), into `design-system.json` (e.g. `figma.collectionKeys`).
   When none are recorded and a library is connected, ask once "is <library> your
   throughline system?" and on yes save the library's collection keys.
3. **Rules in a consumer file:** no `{ raw }`; library parts only, so a request
   only a local part would meet is a `missing-component` gap; gaps to
   `design-system/gaps.json` (already); no `design/` writes; the library cache
   moves under `design-system/` or is read in memory (decide).
4. **Forcing:** consumer ranks as a; can be forced down to b or c.
5. **Drift is phase 1c, not 1b.** Recording consumer screens before drift can
   check them in their own file would report them all as gone. 1c: per-entry
   `fileKey` in `screens.json`, the drift screens snippet run against that file
   (`figma_execute` takes `fileKey`), components resolved through library
   instances.

## Leftovers to fold into 1b

- Spec line 3 `Status:` should say phases 1b–4 not yet planned.
- `design-workspace.mjs cache missing --from` doesn't validate its input or run
  through `guard` (raw TypeError on a bad file).
- A variable listed under `skipped` is re-imported and re-skipped every run.
- One ~130-character line in `commands/compose-figma.md` step 2b.

## Still open, not 1b

Library text styles (urgent for Zygarden.gg, which has none locally), repeated
variable names across library collections, variant combinations, the by-key
component import path (needs a Figma token run). All in the spec's Open questions.

## How to start

`/grill-to-spec` on 1b taking the recommendations above, written into the existing
spec (Decisions Q26+ and a Plan section), then `/review-spec`, then `/build-spec`.
Both Zygarden files are connected to the bridge; the system file was the active one.
