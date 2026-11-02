# Design modes phase 1b: live run

Date: 2026-11-02
Spec: `docs/specs/2026-10-30-design-modes.md` (Plan, phase 1b, Step B8)
Files: `Zygarden Design System` (`k5EV3vXCZ7eTKFgqS0TMFv`, the system) and
`Zygarden.gg` (`948SPugP1tqqLpLleHZOsU`, a product file using it as a library).
Figma Desktop, both files connected to the bridge, `figma_execute` with `fileKey`,
Zygarden.gg in front. In Zygarden.gg, `pages` was the new test page plus
`↳ Registration`, which already uses the library, so its components and text
styles were seen.
Working directory: a scratch directory holding a copy of
`~/Dev/zygarden-frontend/design-system.json`. The owner's repo was not written to
(`git status` clean afterwards).

## How the snippet was run

The snippets and their returns went through a small local relay instead of the
chat. A Node server on `localhost:9232` (inside the bridge plugin's
`networkAccess` allowance) served the two generated snippets, extracted from
`references/figma-compose.md` and `figma-adherence.md`. It saved every
`runCompose` and gate return to disk as JSON, and served the cache and `tokens`
back. In each file, one `figma_execute` fetched both snippets, checked their
lengths against the source (74,192 and 19,764 characters, exact), and evaluated
them into plugin globals. Every later call ran `runCompose` or `runScreenGate`
from those globals. Each `library-import` was a separate `runCompose` of at most
20 keys, run in a loop inside one call.

So the `design-workspace.mjs` and `gap-report.mjs` steps ran on disk exactly as
the command says, against returns that were never hand-copied. That is a
difference from phase 1, which built the cache inside Figma.

## Run 1: the system file

| Step | Result | Time |
|---|---|---|
| `signals`, manifest = open file, no keys recorded | mode a, `consumer: false`, `askSystem: []`, 10 `localCollectionKeys` | 347 ms |
| `system keys --from` | "recorded 10 collection keys"; every other field unchanged; keys match B0 | — |
| `inventory`, `componentsPage: 'Components'` | 27 sets, 13 local text styles, 77 colour / 29 gap / 11 radius variables | 97 ms |
| `build`, one primary `button` | ok, `WIP: Phase 1b system test` | 104 ms |
| gate | pass; 1 component, 1 colour, 4 dimensions checked; 0 advisories | 91 ms |
| `discard` | removed 1; page `Throughline phase 1b test` left empty | — |

The screen was discarded while still `WIP:`, as the Plan says. Nothing was
finalized into the production system file and no drift record was written.

## Run 2: Zygarden.gg, a consumer run

| Step | Result | Time |
|---|---|---|
| `signals`, keys recorded | mode a, `consumer: true`, `systemLibrary: 'Zygarden Design System'`; the reason names the library, the gap rule, other libraries and drift | 22 ms |
| step 1 | nothing written (`design-system.json` exists, Q36) | — |
| `library-list` | 10 collections, 233 variables | 964 ms |
| `cache get` → `null`; `cache init` | "wrote design-system/library-cache.json with 10 collections" | — |
| `library-import`, 12 chunks | 233 entries, 0 skipped; chunks 223–383 ms | ~3.4 s |
| `cache merge` ×12; `cache missing` | `[]` | — |
| `tokens` | 0 unresolved | — |
| `inventory` with `library` | 7 library sets, 11 swap targets, 6 library text styles in use (`labelLg`, `bodyMd`, `labelMd`, `h1`, `bodyLg`, `labelSm`), 77/29/11 variables | 123 ms |
| `build`, `gap: { raw: 18 }` | refused, `invalid` at `root.gap`: "a variable name, not {raw:18}" | — |
| `build`, `fill: { raw: '#123456' }` | refused the same way at `root.fill` | — |
| `build`, `padding.top: { raw: 20 }` | refused the same way at `root.padding.top` | — |
| `build` with a `segmented control` | refused, `missing-component`, `nearest: []`; nothing written | 31 ms |
| `gap-report record … --resolution left-out` | "recorded segmented control (open), 1 screen, in design-system/gaps.json" | — |
| `build`: `h1` heading, `bodyMd` copy, text field, dropdown, button | ok; `localPicks: []`, `raws: []`, `staleCache` empty | 525 ms |
| gate with `libraryTokens` | pass; 3 components, 3 colours, 5 dimensions; 0 advisories | 15 ms |
| `finalize` | `Phase 1b consumer test`, `replaced: false` | — |

Read back: both text nodes carry the library's `h1` and `bodyMd` (`remote: true`),
all three instances are library components (`remote: true`), and the file still
has 0 local text styles. No drift record and no `design/` folder.

Reviewer (Figma-visual): **pass with notes.** Fonts, wrapping, spacing (24 px
padding, 16 px gaps) and dark-mode contrast are all fine. Its notes are about
content, not composition:
- the library's default "Placeholder" and "Primary Button" content was left in,
  because the button set exposes no text property in the inventory, so the plan
  couldn't set one;
- the fields have no labels;
- the frame hugs its content at 316 px tall;
- the button is content-width.

Screen: https://www.figma.com/design/948SPugP1tqqLpLleHZOsU?node-id=6974-37508

## Run 3: Zygarden.gg forced to b

| Step | Result | Time |
|---|---|---|
| `signals`, `forced: 'b'`, keys recorded | mode b, "lowered from mode a because you asked", `askSystem: []` | — |
| `signals`, `forced: 'b'`, no keys | mode b, `askSystem: []` (Q37) | — |
| step 1 | nothing written (Q36) | — |
| `build`: `h1`, `bodyMd`, button, with `library` and no `systemCollectionKeys` | ok; text styles `h1` and `bodyMd`, both `remote: true`; 0 local text styles | 1,736 ms |
| gate with `libraryTokens` | pass; 0 advisories | — |
| `finalize` | `Phase 1b forced b test`, `replaced: false` | — |

No `design/` folder in the scratch directory afterwards. No reviewer was
dispatched: the screen uses the same library parts run 2's review covered.

Screen: https://www.figma.com/design/948SPugP1tqqLpLleHZOsU?node-id=6974-37533

## Run 4: the ask

`collectionKeys` was removed from the copy.

| Step | Result |
|---|---|
| `signals`, no keys, not forced | mode b, `askSystem: ['Zygarden Design System']` |
| `system keys --library Nope` | exit 1, "No connected library named Nope; connected: Zygarden Design System" |
| `system keys --library 'Zygarden Design System'` (the scripted "yes") | "recorded 10 collection keys"; they match B0's |
| `signals` again | mode a, `consumer: true`, `systemLibrary: 'Zygarden Design System'`, `askSystem: []` |

No screen was built in run 4. After the pick, it continues exactly like run 2.

## What the run found

- **The consumer keys were documented in the wrong place.** The command (step 3)
  and the generated reference said a consumer run "passes the same `library` plus
  `systemCollectionKeys`". Read that way, the keys go at the top of `SPEC`. The
  snippet reads them only from `library.systemCollectionKeys`. With them at the
  top, a raw gap and a raw colour **built**: the run quietly followed mode b's
  rules. Step 5 also passed `library` to `build` "in mode b" only. Both were fixed
  in the same change: the command and `COMPOSE_HEADER` now say the keys go inside
  `library`, passed to `inventory` and `build` both. The references were
  regenerated and the gates re-run. The code was right, and the fake-Figma tests
  pass the keys inside `library`.
- **`system keys` reformats the manifest.** Its write is `JSON.stringify(…, null, 2)`,
  so the owner's one-line arrays (`"built": ["SurfaceCard"]`, `"modes": [...]`)
  come out expanded. The data is identical and the field order is kept. It's a
  diff the owner will see the first time it runs on their real file. Kept after the
  run (spec Q38); the script now prints a line saying the file was reformatted.
- **A raw padding refusal reads oddly.** In a consumer run, `padding: { raw: 20 }`
  is refused as `invalid` at `root.padding.raw`, asking for "top, right, bottom or
  left", which is the mode b per-side message rather than "no raw values here". A
  per-side raw gets the clear message. Fixed after the run (spec Q39): a
  whole-padding `{ raw }` is now refused as a raw value.
- **The gate's `detached-component` count** was 3 in both runs 2 and 3, though
  run 3 had one instance and run 2 three, so it isn't an instance count. What it
  counts wasn't looked into. Both gates passed with nothing failed.

## Left in place

Page `Throughline phase 1b test` in both files:
- in the system file it is empty;
- in Zygarden.gg it holds `Phase 1b consumer test` and `Phase 1b forced b test`.

Deleting them is the owner's call (Q17).
