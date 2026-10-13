# The focus-contrast check, run against live files

Date: 2026-10-13
Spec: `docs/specs/2026-10-13-focus-ring-contrast.md`, Step 6
Files: "Throughline Plugin Test" (`OCiZiGpsJ4ncPD8r205BjC`) and "Zygarden Design System" (`k5EV3vXCZ7eTKFgqS0TMFv`)

The short version: **on real variables, the check fails where the tokens fail and
passes where they pass.** The reader resolved two aliased ring variables per mode
to the values read independently. Nothing it reported was a mis-pairing.

## What was run

1. **Sample.** The existing Button set (108 variants) was cloned into a
   `WIP: Button` set inside a scratch section on the Components page. The
   generated script ran in `'built'` mode with `uiFramework: 'shadcn'`, three
   times with different `surfaces`. The script was pasted with its comments
   stripped; the code was otherwise the generated file's.
2. **Zygarden.** A two-variant `WIP: Chip` (`state=default|focus`) was built in a
   scratch section on the Cover page, with a drop-shadow ring (spread 3) bound to
   Zygarden's own `color/stroke/focus`. This run used a trimmed transcription of
   the checker's ring and contrast logic and the reader's colour resolution, not
   the whole generated script. The full script ran on the sample only.

Both scratch sections were removed afterwards. A read found no `WIP:` node and no
scratch section on either page, and the sample's Button set still had 108 variants.

## Numbers

| File | `surfaces` | `focus-contrast` | Detail |
|---|---|---|---|
| Sample | `color/bg/canvas` | pass | 4 ring/surface pair(s) clear 3:1 across 2 mode(s) |
| Sample | `color/bg/canvas`, `color/bg/muted` | **fail** | color/focus/ring on color/bg/muted in Light: 2.99:1, needs 3:1 |
| Sample | `color/bg/canvsa` (typo) | **fail** | no local colour variable named: color/bg/canvsa |
| Zygarden | `color/bg/canvas`, `color/bg/surface/1` | **fail** | color/stroke/focus on color/bg/canvas in Light: 2.37:1; on color/bg/surface/1 in Light: 2.23:1 |

On the sample, the other three checks passed: 108 variants matching the matrix,
every button state, and a ring on all 18 focus variants. The whole run took 187 ms.

## Alias resolution

Both ring variables are aliases (`valuesByMode` holds `VARIABLE_ALIAS` in every
mode), and the reader resolved them per mode:

| Variable | Light | Dark | Matches the independent read |
|---|---|---|---|
| `color/focus/ring` (sample) | `#169c46` | `#1db954` | yes |
| `color/focus/ringOnFill` (sample) | `#242424` | `#f9f9f9` | yes |
| `color/stroke/focus` (Zygarden) | `#14b8d4` | `#22d3ee` | yes |

## What went wrong on the way

- **The first Zygarden Chip read as having no ring.** `focus-indicator` failed,
  so `focus-contrast` skipped, which is the designed behaviour. The cause was the
  scratch build, not the check: `setBoundVariableForEffect` returns the effect
  with `spread` reset to 0. `references/figma-scripting.md:145` already documents
  this, with the fix (re-assert `spread` after binding). The scratch script hadn't
  read it. After re-asserting the spread, the ring read correctly.

## What wasn't measured

- **The pairing rule on a real architect run.** Both runs named the surfaces by
  hand. Whether an architect picks the right surfaces is untested until one does.
- **An existing Zygarden component.** Its focused controls use INSIDE strokes that
  `focus-indicator` doesn't count as rings, so the check can't reach them. The
  Chip was built for the run.
- **01. Design System.** Its focus colours (`interaction/border-*-focus`) have no
  `focus` segment, so they aren't focus variables today. Not run.
- **Translucent rings and surfaces, single-mode collections, and library
  surfaces** on a live file. These are covered by fixtures only.
- **The `mui` and `outline` recipes** on a live file.
