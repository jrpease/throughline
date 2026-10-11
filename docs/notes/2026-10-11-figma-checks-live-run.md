# The Figma checks script, run against a live file

Date: 2026-10-11
Spec: `docs/specs/2026-10-07-figma-checks-as-scripts.md`, Step 7
File: "Throughline Plugin Test" (`OCiZiGpsJ4ncPD8r205BjC`), `uiFramework: shadcn`

The short version: **the script works on a real file, and it found one wrong
rule.** The rule was 0.22.0's, not this branch's, and it's fixed here.

## What was run

1. The generated script, read-only, against the file's existing Button, Checkbox
   and Switch. For this run only, the reader's frame lookup was edited by hand to
   target each existing set by id, as the spec allows. Nothing was committed from
   that edit.
2. The `figma-executor`, following this branch's step 4, built a fresh Chip,
   Toggle and Switch into `WIP:` frames inside a section on the Components page.
   It ran spec mode before writing and built mode after. Nothing was finalized,
   and the section was removed afterwards; the existing sets were checked intact.

## Numbers

| Component | Variants | Structure | States | Focus ring | Read |
|---|---|---|---|---|---|
| Button (existing) | 108 | pass | pass | pass, 18 of 18 | 25 ms |
| Checkbox (existing) | 15 | pass | **fail: missing selected** | pass with `controlLayer: 'box'` | 6 ms |
| Switch (existing) | 10 | pass | **fail: missing selected** | pass | 3 ms |
| Chip (built) | 6 | pass | pass | pass | 46 ms |
| Toggle (built, `on` axis) | 10 | pass | pass | pass | 37 ms |
| Switch (built, `checked` axis, ring on `track`) | 10 | pass | pass | pass | 32 ms |

The Chip, Toggle and built-Switch rows ran after the fix below.

## What it means

- **The ~30 s cap is not a concern.** The 108-variant Button reads in 25 ms.
  The spec's one open question is answered.
- **A top-level `return` works** in `figma_execute`. The how-to's call shape stands.
- **The reader and the checker agree on real data.** Button's live snapshot is
  saved as `scripts/lib/fixtures/figma-checks/sample-button.real.json`, and
  Checkbox's as `checkbox-checked-axis.real.json`.
- **The rule that was wrong: `selected`.** The sample's Checkbox and Switch carry
  selection on their own `checked` axis, not as a `selected` value on the state
  axis, and failed 0.22.0's state check while correctly built. The owner settled
  it: an axis named `selected`, `checked` or `on` now satisfies it. The built
  Toggle (`on`) and Switch (`checked`) pass under the new rule.
- **The focus check read the Checkbox correctly once given its control layer.**
  Without `controlLayer` it failed all three focus variants, because the ring is
  on the inner `box` frame. That's the case `controlLayer` exists for, and in a
  real build the architect names it.
- **A ring that passes can still be invisible.** In the screenshot of the built
  section, the Focus variants look identical to Default: `color/focus/ring` sits
  too close to the fills. The script checks that a ring exists and is bound,
  which is its job. Whether anyone can see it is #158 (focus-ring contrast), and
  this is the first real evidence for it.

## What went wrong on the way

- **Two figma-console servers bound port 9223**, one on IPv4 and one on IPv6, and
  the Desktop Bridge connected to the other session's. Stopping that server fixed
  it. Worth filing upstream.
- **The active file switched mid-run** when another file was opened in Figma, and
  the first Button read ran against the wrong file. It failed loudly (the node id
  didn't exist), and pinning the target fixed it. It's the case the active-file
  preflight exists for.

## What wasn't measured

- Only the `shadcn` recipe. `mui`, `vanilla-css`, `tailwind` and the skip path
  rest on hand-written fixtures.
- A failing build. Every built component passed first time, so no live run
  showed a check failing on a real defect. The failing branches are covered by
  fixtures only; the live Checkbox without `controlLayer` is the one real fail
  the script produced, and it was a missing input, not a defect.
- A set Figma flags as conflicting, so the reader's fallback for that case is
  still untested anywhere.
