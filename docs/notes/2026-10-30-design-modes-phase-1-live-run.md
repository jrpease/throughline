# Design modes phase 1: live run

Date: 2026-10-30
Spec: `docs/specs/2026-10-30-design-modes.md` (Plan, Step 11)
File: `Zygarden.gg` (`948SPugP1tqqLpLleHZOsU`), library `Zygarden Design System`
(`k5EV3vXCZ7eTKFgqS0TMFv`, the system in `zygarden-frontend/design-system.json`).
Figma Desktop, bridge plugin 1.39.0, `figma_execute` with `fileKey`.

## How the snippet was run

`references/figma-compose.md` is 66 KB. Pasting it into every call, as the command
says, was replaced for this run by one transfer. The snippet and the gate's reader
went over with full-line comments stripped, in four chunks stored on `globalThis`.
They were checked by length against the source (55,723 characters, exact) and
evaluated once into `globalThis.__tl`. Plugin globals persist between `figma_execute`
calls in one plugin session. A later fix was patched into the stored chunks as exact
string replacements, and the lengths were checked again.

The library cache was built inside Figma, with the same shapes as
`design-workspace.mjs` `cache init`, `cache merge` and `tokens`, instead of on disk.
Saving 233 entries through the chat would have meant hand-copying the JSON. The disk
path is covered by `scripts/design-workspace.test.mjs`.

## Run 1: a product file on a connected library

| Step | Result | Time |
|---|---|---|
| `signals`, pages `↳ Registration` and the (missing) test page, no manifest key | mode b, `libraryDetected`; 10 library collections, a library instance found, 0 local variables, 0 local sets | 26 ms |
| `signals`, manifest key = the system file (the consumer-file case) | mode b | 10 ms |
| `signals`, `forced: 'c'` | mode c, reason says lowered | — |
| `library-list` | 10 collections, 233 variables | 338 ms |
| `library-import`, 12 chunks of 20 | 233 entries, 0 references unresolved; chunks 206–372 ms | ~3 s |
| `inventory` with `library` | 7 library sets with props, 11 swap targets (library icons), colours, 29 gap and 11 radius variable names, 10 collections with modes; 0 text styles | 137 ms |
| `build`, gap `{ raw: 20 }` | refused, `raw-has-variable` naming `spacing/space/5`; nothing written | 46 ms |
| `build`, header `auth=minimal` + step-indicator `steps=6, step=2` | threw `Unable to find a variant with those property values` and rolled back; no page left | 404 ms |
| `build`, those props dropped | ok; `localPicks: []`, three raws (gap 28, padding 36 ×2), `staleCache` empty | 381 ms |
| gate with `libraryTokens` | pass; the three raws are advisories ("off-scale …") | 17 ms |
| gate without `libraryTokens` | fails `colour-rule-inert` and `dimension-rule-inert` | — |
| `finalize` | `Registration (mode b test)`, `replaced: false` | — |

Read back: a 390 px vertical frame with gap 28 and padding 36/36 (raw), fill bound
to the library's `color/bg/canvas` (`remote: true`), Color Semantic set to Dark.
It holds five library instances: header (mobile), step-indicator, text field
(lg), dropdown (lg) and button (primary), all `remote: true`. The test page holds
only that frame.

Screen: https://www.figma.com/design/948SPugP1tqqLpLleHZOsU?node-id=6951-720, on
page `Throughline phase 1 test` (deleted afterwards, 2026-10-30).

## What the run found

- **Importing a component or set by key hung.** `importComponentSetByKeyAsync` on
  the library `button` set, and `importComponentByKeyAsync` on its variant and on
  the `li:plus` icon, each ran past 6 s, with the file in front. Variable imports
  in the same file took ~200 ms. The build first hung here. Fixed in the same
  change: a set or component the reader reaches through a library instance is
  already in the file, so it goes to the writer as it is (`live.libraryNodes`), and
  only `figma_get_library_components` results are imported by key. Those are
  untested live (the MCP had no `FIGMA_ACCESS_TOKEN`).
- **Variable names repeat across library collections.** `spacing/space/12` is in
  both Spacing Primitives and Spacing Semantic, and `radius/pill` twice. The
  resolver binds the first match, so which one a plan gets depends on cache order.
- **The file has no local text styles.** The screen could only use components; a
  text node has no style to take in mode b on this file. The open question on
  library text styles is a real limit here, not a later nicety.
- **Variant combinations aren't checked before writing.** Each option was valid on
  its own; the combination didn't exist, and the writer threw and rolled back. This
  limit isn't new to mode b.
- **Importing hangs with the file behind another tab** (Step 0, Facts checked), and
  the bridge's `isActive` flag is no guide to which tab is in front.
- **`structuredClone` doesn't exist in the plugin sandbox.** Irrelevant to the
  shipped path (`design-workspace.mjs` runs in Node), but anything inlined must not
  use it.
- **`figma_capture_screenshot` can't target a connected file that isn't the
  bridge's active one** ("Unable to establish connection"), so the screen was read
  back with `figma_execute` instead of screenshotted, and the reviewer step was not
  run.

## Runs 2 and 3: not run live

- **Run 2 (a detached local copy sharing a library name).** Not run: Zygarden.gg has
  no local components, and making one would add a component to the owner's file.
  Library-wins and `localPicks` are covered by `figma-compose-library.test.mjs` and
  the fake-Figma build test.
- **Run 3 (mode a on the system's own file).** Not run: it would write into the
  owner's design system file, and the bundle would need sending again to that file's
  plugin instance. The mode a path is unchanged code (the reader's refactor extracts
  `composeSetProps`), and every pre-existing compose and drift fixture still passes.
