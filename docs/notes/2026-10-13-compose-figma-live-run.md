# Composing a screen in Figma, run against the sample

Date: 2026-10-13
Spec: `docs/specs/2026-10-13-compose-figma-screen.md`, Step 6 (and Step 3's re-measure)
Files: "Throughline Plugin Test" (`OCiZiGpsJ4ncPD8r205BjC`, written, pinned for the run), "Zygarden Design System" (`k5EV3vXCZ7eTKFgqS0TMFv`, read-only), "01. Design System" (`bk45RXGcpqiFZgbR5cQiWt`, read-only)

The short version: **two real bugs surfaced live, and both were fixed and
re-run.**

1. **The first build stalled.** It awaited per text layer, and the bridge stopped
   resolving awaits about twenty in. The writer now loads every font in one batch
   and applies every text style in one batch, and the same screen built in 130 ms.
2. **A fresh agent driving the command hit the second bug.** Its build threw on
   the sample's Switch, which has no auto layout, and left a half-built frame. The
   whole-branch review found the same bug in the code at the same time. Instances
   are no longer resized unless asked, `hug` on a component without auto layout is
   refused before writing, and a throw rolls the build back. The agent's full
   screen, Switch included, then built, passed the gate and finalized.

## What ran, and how

- **Not pasted per call.** The generated snippets are 38 KB
  (`figma-compose.md`) and 18 KB (`figma-adherence.md`). Each was pasted once per
  file with comment-only and blank lines stripped by a script (no code line
  changed), and its entry point kept on `globalThis` for later calls in that
  file. So what ran is the generated code minus comments, transcribed once per
  install, not the file pasted verbatim. The Node tests run the generated files
  themselves.
- The sample was pinned with `figma_navigate` (`lock: true`).

## The stall, and the fix

The first `build` of "Sign in" timed out at 30 s. The page afterwards held a
partial `WIP: Sign in`, and it kept growing a few nodes at a time, but only while
later `figma_execute` calls that awaited something were running. A probe that
awaited a font load 40 times in a row froze the same way after 7 or 8
iterations. Even a `setTimeout` raced against the await never fired. So the
plugin's event loop stopped running, not one API. Each primitive on its own took
0–3 ms.

The cause wasn't established. Figma Desktop throttling a background window fits
what was seen, but nothing here confirms it. Later in the same session the gate
made hundreds of awaits (colour-variable resolution) in 52 ms without stalling.
`references/figma-scripting.md` already warns that awaiting `loadFontAsync` per
node runs out the budget.

**Fix:** `build` now collects every font the plan can touch (each text style
used, every text layer in each placed set, and Inter Regular, which a new text
node starts in), loads them in one `Promise.all`, writes the whole tree
synchronously, then applies every text style in one `Promise.all`. A build's
awaits are now a fixed handful whatever the screen's size. Two reloads of the
bridge plugin were needed to clear the stalled runs. The stray partial frames
were removed by hand.

## Results

| Check | Result | Time |
|---|---|---|
| `inventory` (Components + Icons) | 14 sets, 68 swap targets, 101 colour / 20 gap / 6 radius variables, 10 text styles, 7 collections | 37 ms |
| `build` "Sign in" (text, 2 labelled Inputs, Checkbox, 3 Buttons incl. an icon swap, Light mode) | ok, `WIP: Sign in` | 130 ms |
| Screen gate on `WIP: Sign in` | **pass**; checked 14 nodes for detachment, 7 paints, 11 dimensions; 0 advisories | 52 ms |
| `finalize` | renamed to "Sign in", `replaced: false` | 5 ms |
| Re-run `build` + `finalize` with "Sign in" moved to (120, 80) | `replaced: true`, one "Sign in", new id, still at (120, 80) | 164 ms |
| `build` "Sign up" with an unmarked "Sign up" frame on the page | `name-taken`, 0 nodes written | — |
| `build` asking for `DatePicker` and `Buton` | two `missing-component`: DatePicker → Spinner, Textarea, Avatar; Buton → Button, Badge, Avatar; 0 nodes written, no page created | — |
| Slot: temporary `TMP Panel` set with a VERTICAL `Body` slot; compose with an added stack in the slot | built (45 ms), gate pass (5 dimensions checked) | — |
| Same, with the added stack's gap unbound on purpose | gate **fails**: `Screens / WIP: Panel test / TMP Panel / Body / Added \| gap 16: bind space/4` | — |
| Slot left unfilled; the placeholder (id `I442:1672;442:1667`) has a raw 16 px gap | gate pass, 0 dimensions checked: the placeholder isn't read | — |

The finalized screen was looked at: the heading in Heading/L (Poppins
SemiBold), body and labels in the file's Inter styles, inputs filling the width,
"Remember me" and "Forgot password?" spread across a row, the primary Button
with its arrow, and the "Sign up" link row centred. Every value is bound. The
primary Button's dark label on green is the sample's own Button, not the
composer's choice.

"Sign in" is left on the sample's new `Screens` page as the reference result.
The `TMP Panel` sets and their screens were removed.

## Step 3's re-measure (the gate now reads slot content)

Read-only, same pages as `docs/notes/2026-10-13-figma-adherence-live-run.md`:

| Page | 0.25.0 | Now |
|---|---|---|
| Zygarden `Templates` | 7 failures, 14 advisories | 7 failures, 14 advisories (74 ms) |
| 01. Design System `↳ Templates` | 21 failures | 21 failures (97 ms) |
| 01. Design System `↳ Archtypes` | 8 detached, 8 colour, 40 dimension | the same (92 ms) |

No page has a SLOT node (counted: 0 on all three), so the counts can't move and
the change is unmeasured on a real file. It's measured on the sample above, in
both directions.

## Found along the way

- **The gate's number lookup doesn't follow aliases.** `space/gap/md` is 16 by way
  of `space/4`, but the failure above names only `space/4`: the gate reads FLOAT
  values directly and skips a `VARIABLE_ALIAS`. Colours resolve aliases; numbers
  don't. It shipped that way in 0.25.0. A follow-up, not this branch: #173.
- `nearest` for a component with no near name (`DatePicker`) is noise. It's
  ranked by shared prefix, then edit distance, with no cut-off (#174).

## The command driven by a fresh agent

A general-purpose agent with none of this session's context followed
`commands/compose-figma.md` for "an Account settings screen: heading, helper
text, Name and Email fields, an 'Email notifications' row with a switch that's
on, Save and Cancel side by side". It got its fileKey from a scratch
`design-system.json`, and it pasted the generated references verbatim, three
times.

- **Inventory and plan:** fine from the prose. It labelled the inputs with styled
  text, since the sample has no Label component, which the command allows.
- **Build:** threw `HUG can only be set on auto-layout frames or text children of
  auto-layout frames` on the Switch. A partial `WIP: Account settings` was left on
  the page, and the command had no instruction for a throw. The agent dropped the
  row, rebuilt (89 ms), gated (pass: 10 / 5 / 9 checked), finalized, and
  dispatched the `reviewer` agent ("pass with notes": the missing row, the large
  empty band, the Save label colour).
- **Prose gaps it reported, now fixed in the command:**
  - how to call the snippet;
  - where the description's shape is documented;
  - `SKIP = []` for the gate;
  - what to do on a throw;
  - giving the reviewer the fileKey and the project's folder;
  - showing auto layout in the inventory summary.

**After the fixes**, the same description, Switch row included, was rebuilt from
the regenerated script (118 ms), and the gate passed (12 / 6 / 9 checked). It
was finalized, replacing the agent's version in place. The screenshot shows the
heading, helper text, two labelled inputs, the notifications row with the switch
on at the right, and Save and Cancel pinned to the bottom. Asking for `hug` on the
Switch now returns `invalid … hug on a component without auto layout` with
nothing written. The inventory summary marks Switch as the sample's one set
without auto layout.

"Sign in" and "Account settings" are left on the sample's `Screens` page.

## What wasn't measured

- **A real file's slot components.** Neither real file has a slot on its screen
  pages; the slot checks ran on a temporary set in the sample.
- **Zygarden or 01. Design System as a compose target.** Neither was written to.
- **The rollback on a real throw.** After the fix, nothing in the sample makes the
  writer throw, so the rollback is covered only by the fake-Figma test.
