# Focus-ring contrast in the Figma checks

Status: built
Reviewed: 2026-10-13 — needs revision (result routed nowhere, `parseHex` not injected, evidence overclaimed, roadmap order overridden silently). Revised the same day: every finding taken except the sequencing one, which is now a recorded decision.
Date: 2026-10-13
Backlog: #112, Phase 4¾ — #158
Builds on: `docs/specs/2026-10-07-figma-checks-as-scripts.md`, `docs/specs/2026-09-29-component-accessibility-checks.md` (Non-goals, Open questions)

Decisions here were made by Claude under the owner's standing instruction for
this session (2026-10-13: "Take your recommendations when you have a question.
Only pull me in when there is an important P0 question"). None was put to the
owner one by one. Each row says what it rests on, so any of them can be reopened.

## Goal

0.21.0 checks that every focus variant has a ring. It doesn't check whether
anyone can see it. After this ships, the Figma checks script also measures each
ring colour against the page surfaces the component is meant to sit on, in every
mode, at WCAG 1.4.11's 3:1, and a ring below that stops the build.

## Non-goals

- **A token-side table in `verify:check`.** No name-keyed pair table. See the first decision.
- **Ring against the control's own fill.** Out of v1; see Open questions.
- **Focus indicators the check doesn't already recognise as rings.** Zygarden's
  and 01. Design System's focused controls carry an INSIDE stroke in a brand or
  `interaction/*` colour. The focus check doesn't count those as rings today, and
  this doesn't change what counts.
- **Existing component sets.** The script reads only the `WIP: <name>` frame it
  builds. Re-checking a library's existing sets is separate work.
- **An acceptance record** for a known-failing ring. See Open questions.
- **Surfaces from a published library.** Surfaces are looked up among the file's
  local variables. See Constraints.
- **Pixel-exact colour.** The check measures the variable's value, not what draws
  after paint or node opacity. See Constraints.
- **WCAG 2.4.13** (focus appearance, AAA: area and change-of-state contrast).

## Decisions

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| Build #158 before the second-user run | Build it now, ahead of #112's "a second real user runs `/throughline:start`" item | #112 orders the second-user run first, then "#158, measured on that second system". The run needs a person on another machine, so this session can't do it. The owner asked for the backlog to be worked through and handed over two systems besides the sample (Zygarden, 01. Design System); those are the second corpus here. The check skips until an architect names surfaces, so nothing existing starts failing on upgrade without a new spec. | Waiting on an item a session can't do; treating #112's order as untouchable |
| Where the check lives | In the Figma checks script, as a new `focus-contrast` check after `focus-indicator`, run in `'built'` mode. This **replaces #158's stated approach** ("derived off the token source the way `color-contrast` is"). | Only the build knows which ring variable is bound to which variant. `color-contrast` pairs roles by exact folded name (`verify-check.mjs:198-207`), and the three real files name the ring `color/focus/ring` + `ringOnFill`, `color/stroke/focus`, and `interaction/border-*-focus`, with surfaces `bg/canvas`, `bg/surface/1-3`, `surface/greyscale-*`. A name table would compare nothing on any of them. | A `border.focus` × `bg.default` row in `CONTRAST_PAIRS` |
| Which pairs | Each ring colour variable the focus check accepted, against each surface variable named in a new `EXPECT.surfaces` | A ring always sits against the page it's placed on. The sample shows the pairing lives in usage: its primary Button binds `ringOnFill`, every other control binds `ring`. Nothing in a variable's name says which page it sits on, so the architect names the surfaces. | Guessing surfaces from names; checking every colour in the file |
| Who names the surfaces | The architect, per component spec, as colour-variable names it reads from the file with `figma_get_variables` (already in its tool list, `agents/architect.md:5`): `surfaces: ['color/bg/canvas']`. The executor copies them into `EXPECT`, as it does `controlLayer`. On the inline path, component-builder names them. | Same split as `controlLayer`: the deciding tier decides, the executor decides nothing (`2026-10-07-figma-checks-as-scripts.md`, Decisions) | The executor or the script picking a surface |
| `surfaces` absent or empty | `skip`, with a detail saying no surface was named | Matches how the script treats other missing context (an out-of-scope `uiFramework`). A build from an older architect spec isn't blocked. The skip is visible because the executor reports this check's outcome (row below). | Failing every build that predates the field |
| A named surface not found | `fail`, naming it | A typo would otherwise compare nothing. Matches a `controlLayer` that names no layer. | Silently dropping it |
| Modes | Compare in every mode name found in either the ring's collection or the surface's. Each side resolves in its own same-named mode, or its collection's default when it has none. Mode names match after `normalizeName` (so `Light` and `light` match). | A single-mode collection on either side is common (01. Design System's semantic colours have one mode; a single-mode ring against Light/Dark surfaces must still meet both surfaces). The fold matches how the rest of the checker compares names. | Driving the loop from the ring's modes only; a cross-product of every mode pair |
| Threshold and rounding | 3:1, compared raw, unrounded. The detail prints the ratio **rounded down** to two decimals | WCAG 1.4.11. `color-contrast` compares raw (`verify-check.mjs:234`). The sample's `ring` on `bg/muted` is 2.997: rounding down prints 2.99, so a fail never reads "3.00:1, needs 3:1". | Rounding to nearest |
| Alpha | A translucent ring is composited over the surface. A translucent surface is skipped for that pair and counted in the detail. | The rule `color-contrast` applies (`verify-check.mjs:222-229`) | Guessing what's under a translucent surface |
| A value that isn't a colour or doesn't resolve | Skipped for that pair and counted. If every pair is skipped, the check is `skip`, not `pass`. | A check that compared nothing must not read as green | `pass` on zero comparisons |
| Whether it fails the build | Yes. A ring below 3:1 on a named surface in any mode is `fail`, and `pass` goes false. | **What the evidence proves:** the 2026-10-13 measurement hand-computed ring and surface token ratios on three real files, and found tokens that fail 1.4.11 (Zygarden's light ring 2.38:1 on canvas; 01. Design System's primary focus colour 1.98:1 on white). That shows the threshold catches real bad tokens, and that the sample's own pairs pass on canvas. **What it doesn't prove:** the pairing rule on a real build. On all three files the check as designed reaches no existing ring (INSIDE strokes; `interaction/border-primary-focus` isn't a focus variable), so the pairing rule is proven only when a real architect run names surfaces. Step 6 runs it on scratch sets. | Advisory-only output |
| What a `focus-contrast` fail does | **`figma-executor` returns `BLOCKED` at once**, without spending the pass budget, naming each failing pair. **Inline**, the builder stops and names the pairs. Neither changes a variable's value or swaps the ring to another variable. | The fix is a token value, and a rebuild can't change it. Changing a shared token, or picking a different focus role, is a design decision for the owner. | Retrying a build that can't change the outcome; an executor editing tokens |
| Where the result goes | The executor names the `focus-contrast` outcome in its return (step 6), as it does `focus-indicator`. `component-builder` records `focus-contrast` as an attested check when it ran and passed, not when it skipped. `references/proof-bundle.md` gains its row. | The `focus-indicator` precedent (`skills/component-builder/SKILL.md:374`, `references/proof-bundle.md:209`). Without it, "ran and passed" and "never ran" look the same downstream. | An unrecorded check |
| Where the maths lives | `contrast.mjs` is inlined into the generated script ahead of the checker, and gains `AA_NON_TEXT = 3`. `withTable` takes `{ contrastRatio, composite, parseHex, AA_NON_TEXT }` | One contrast implementation, already tested. `contrast.mjs` is import-free, so it inlines the way `component-states.mjs` does. | A second copy of the WCAG maths |
| What the reader adds | For focus variants and their `controlLayer`: the resolved per-mode value of every colour variable it reads. Once per run: the same for each `EXPECT.surfaces` name. Returned as `snapshot.colors: { [variableName]: { modes: { [modeName]: hex \| null }, defaultMode } }`, plus `snapshot.missingSurfaces: [name]` | Keeps the checker pure and testable in Node. The reader resolves aliases with async getters only, as `references/figma-scripting.md` requires. | The checker calling Figma |
| Release note | `### Breaking` | A build that passed yesterday can be `BLOCKED` today. Every new stop condition has gone under Breaking (`2026-10-07-figma-checks-as-scripts.md`, Constraints). | `### Added` |

## Constraints the build follows

- **Surfaces must be local variables.** They're looked up with
  `getLocalVariablesAsync('COLOR')`. throughline's token-builder creates the
  collections in the file it builds components in, so a throughline-built system
  meets this. A component file that consumes a published library's variables will
  report its surfaces as missing; the detail says the lookup is local only. Ring
  variables are resolved by id, so a library ring still resolves.
- **The check measures the variable, not the pixels.** A stroke paint's own
  opacity and the node's opacity aren't read. The ring recipes
  (`references/figma-component-standards.md:149-151`, "ring at ~50% opacity") are
  assumed to put any translucency in the variable value. In the sample every focus
  drop-shadow has effect alpha 1 and node opacity 1.
- **A variable is read in its own collection's modes.** A single-mode variable that
  aliases into a multi-mode collection is recorded as one colour (the target's
  default-mode value), though Figma would render it per mode. throughline builds
  the other way round (multi-mode semantics over single-mode primitives), so the
  common path is unaffected.

## Facts this rests on

Measured read-only on 2026-10-13 through the bridge, all three files open.
Token ratios, hand-computed with `scripts/lib/contrast.mjs`:

| File | Ring variable(s) | Surface | Light | Dark |
|---|---|---|---|---|
| Throughline Plugin Test | `color/focus/ring` | `color/bg/canvas` | 3.57 | 6.87 |
| | `color/focus/ring` | `color/bg/muted` | **2.997** | 4.74 |
| | `color/focus/ringOnFill` | `color/bg/canvas` | 15.52 | high |
| | `color/focus/ringOnFill` | `color/brand/primary` (own fill) | 4.34 | **2.46** |
| Zygarden Design System | `color/stroke/focus` | `color/bg/canvas` | **2.38** | 10.96 |
| | | `color/bg/surface/1` | **2.24** | 9.82 |
| 01. Design System (Light only) | `interaction/border-primary-focus` | `surface/greyscale-default` | **1.98** | — |
| | `interaction/border-secondary-focus` | `surface/greyscale-default` | 4.92 | — |
| | `border/greyscale-focus` | `surface/greyscale-default` | 8.18 | — |

- The sample's components all use the drop-shadow ring recipe: `ringOnFill` on the
  filled primary Button, `ring` on everything else. The ghost and link Buttons
  have no fill, so their ring sits on the page alone.
- Zygarden's focused `search`/`autocomplete` and 01. Design System's Text Field
  and Card use INSIDE strokes. The focus check doesn't count those as rings, so this
  check won't reach them (Non-goals).
- `interaction/border-primary-focus` has no `/`-segment equal to `focus`, so
  `isFocusVariable` (`figma-checks.mjs:67`) doesn't count it. That's existing
  behaviour; see Open questions.

## Open questions

- **Ring against the control's own fill.** A shadow ring with no offset touches
  the control's fill as well as the page. Checking that side would fail the sample's
  secondary Button (2.997 on `bg/muted`) and its dark primary Button (2.46 on
  `brand/primary`). Auditors disagree on whether 1.4.11 asks for both sides. I'd
  recommend leaving it out until a second reading (an auditor or a real complaint)
  says which. Unresolved.
- **Accepting a known-failing ring.** `color-contrast` has `contrast-baseline`.
  Here, the only way past a failing ring is fixing the token. I'd recommend adding an
  acceptance record only once a real user asks for one. Unresolved.
- **`focus` as a substring.** `interaction/border-primary-focus` names a focus role
  without a `focus` segment. Widening `isFocusVariable` to match a `-focus`/`focus-`
  word inside a segment would let real systems' rings count. I'd recommend filing it
  as its own issue: it changes what `focus-indicator` passes, which this spec doesn't
  touch. Unresolved.
- **Re-checking existing sets.** The script targets `WIP: <name>`. Running it
  over a library's existing sets would catch Zygarden-style rings that already
  shipped. That belongs to #40 (adherence gate for Figma screens) or its own issue.
  Unresolved.
- **Library surfaces.** Resolving a surface name through `figma.teamLibrary`
  would cover library-consuming files, but importing a variable writes to the file.
  I'd recommend waiting for a real library-consuming user. Unresolved.

## What shipped

- `scripts/lib/contrast.mjs`: `AA_NON_TEXT = 3`; the header now points focus-ring contrast at the Figma checks.
- `scripts/lib/figma-checks.mjs`: `ringVariables` and the `focus-contrast` check; `withTable` takes the contrast maths.
- `scripts/lib/figma-checks-read.figma.js`: per-mode colour resolution through aliases (`variableColors`) and the local surface lookup.
- `scripts/build-figma-checks.mjs`: inlines `contrast.mjs`; the generated header documents `surfaces` and the immediate `BLOCKED`.
- `references/figma-checks.md` and the adapters, regenerated.
- 9 new fixtures, and `focus-contrast` added to the 25 existing ones; detail tests in `figma-checks.test.mjs`.
- Prose: `agents/architect.md`, `agents/figma-executor.md` (steps 4 and 6), `skills/component-builder/SKILL.md` (inline path, record step), `references/figma-component-standards.md` item 9, `references/proof-bundle.md`, `scripts/README.md`, `ci/README.md`, `README.md`, `CHANGELOG.md` (Breaking).
- `ci/figma-checks-pointers.test.mjs`: three tests holding `surfaces` in the architect, inline and executor sites.
- `docs/notes/2026-10-13-focus-ring-contrast-live-run.md`.

## Where it diverged

- **The mode rule was refined during the build.** As written, the union of both
  sides' mode names added a single-mode side's own name (`Default`) and compared the
  same pair twice. Now the modes come from the side(s) with more than one mode, and
  from both when both have one. The `surface-single-mode` and `ring-single-mode`
  fixtures pin it.
- **The Zygarden ratio prints as 2.37, not 2.38.** The real ratio is 2.378. The
  spec's figure was rounded to nearest; the check rounds down by design.
- **The `surface-single-mode` fixture's dark ring changed** from `#1db954` to
  `#0e6b30`. The planned value really fails on white (2.59:1), so the fixture tested
  a failure instead of the mode rule.
- **Step 6 on Zygarden ran a trimmed transcription** of the checker and reader, not
  the full generated script. The full script ran on the sample. The live-run note says so.
- **The first Zygarden scratch ring had spread 0**, the `setBoundVariableForEffect`
  quirk `references/figma-scripting.md:145` already documents. A test-setup error,
  not a defect; the docs needed no change.

## Plan

### Step 1 — the non-text threshold

Files: `scripts/lib/contrast.mjs`, `scripts/lib/contrast.test.mjs`
Change: add `export const AA_NON_TEXT = 3;` under `AA_NORMAL_TEXT`, with a one-line
comment citing WCAG 1.4.11 and the Figma `focus-contrast` check. Replace the
`border/*` sentence in the header comment (`:18-19`), which calls that table separate
work, with one saying focus-ring contrast is checked in the Figma checks
(`figma-checks.mjs`, `focus-contrast`), where the ring's pairing is known. Add a test
pinning the value.
Verify: `node --test scripts/lib/contrast.test.mjs` → passes.

### Step 2 — the `focus-contrast` check in the pure checker

Files: `scripts/lib/figma-checks.mjs`, `scripts/lib/figma-checks.test.mjs`, new fixtures in `scripts/lib/fixtures/figma-checks/`
Change:
- `withTable` also takes `{ contrastRatio, composite, parseHex, AA_NON_TEXT }`. The
  module stays import-free. The test file imports those from `./contrast.mjs` and
  passes them in.
- Header comment: `EXPECT.surfaces?: [variableName]`; snapshot gains
  `colors: { [variableName]: { modes: { [modeName]: '#rrggbb' | '#rrggbbaa' | null }, defaultMode } }`
  and `missingSurfaces: [name]`. RESULT lists four checks.
- Add `ringVariables(target, recipe, isInput)` beside `lacksRing`. It returns the
  focus-variable names the recipe accepted: the drop-shadow `colorVariable`s that pass
  `lacksRing`'s shadow test; the ABSOLUTE OUTSIDE ring children's focus stroke
  variables; the outline recipe's OUTSIDE focus stroke variables (on the target or a
  direct child); the mui input's focus stroke variables.
- Add `focusContrast(snapshot, expect, indicator)`, appended to `checkBuilt` after
  `focusIndicator` (which is computed once and passed in). In order:
  1. `indicator.result !== 'pass'` → `skip`, "focus-indicator did not pass, so there is no ring to measure".
  2. `surfaces` absent or empty → `skip`, "no surfaces named; the architect names the colour variables of the surfaces the component sits on".
  3. `missingSurfaces` non-empty → `fail`, "no local colour variable named: …" (names joined).
  4. Rings: the union of `ringVariables` over the focus variants, using `controlLayer`
     exactly as `focusIndicator` does. For each ring × each surface × each mode name in
     the union of the two entries' `modes` keys, folded with `normalizeName` and
     deduplicated: each side's hex is its same-named mode (matched after the fold),
     else its `defaultMode`. Skip and count the pair when either side is null or
     `parseHex` returns null. Skip and count it when the surface's alpha is < 1.
     Composite a translucent ring over the surface with `composite`. Fail when
     `contrastRatio(ring, surface) < AA_NON_TEXT`, compared raw.
  5. Any failing pair → `fail`. Detail: each pair as
     `<ring> on <surface> in <mode>: <ratio rounded down to 2dp>:1, needs 3:1`, joined
     with `; `, sorted by ring, then surface, then mode. Use the mode name as it
     appears in the ring's entry, or else the surface's.
  6. Zero pairs compared → `skip`, naming the skip counts and their reasons.
  7. Otherwise `pass`: `<n> ring/surface pair(s) clear 3:1 across <m> mode(s)`, plus
     the skip counts when non-zero.
- Fixture-loop test (`figma-checks.test.mjs:36`): the expected list becomes the four
  names. Add `"focus-contrast"` to every existing fixture's `expected` map: `skip`
  everywhere, since none carries `surfaces`. This is one mechanical edit across 25
  JSON files (an `implementer` dispatch).
- New fixtures, each with a `covers` line and `surfaces` set. Values come from the
  2026-10-13 measurement:
  - `zygarden-ring-light-fails`: `color/stroke/focus` `{Dark: #22d3ee, Light: #14b8d4}`
    on `color/bg/canvas` `{Dark: #070a10, Light: #ffffff}` → fail. Detail names Light
    at `2.38:1` and not Dark.
  - `sample-ring-passes`: `color/focus/ring` and `ringOnFill` variants on
    `color/bg/canvas`, both modes → pass, `4 ring/surface pair(s)`.
  - `sample-ring-on-muted-raw`: `color/focus/ring` Light `#169c46` on `color/bg/muted`
    Light `#ebebeb` (2.997) → fail, detail `2.99:1`. Proves the comparison is raw and
    the print rounds down.
  - `surface-missing`: `missingSurfaces: ['color/bg/canvsa']` → fail naming it.
  - `surface-single-mode`: ring `{Light, Dark}` on a surface `{Default}` → both modes
    compared against the default, `2 pair(s)`.
  - `ring-single-mode`: ring `{Default}` on surface `{light, dark}` (lower case, to
    exercise the fold) → both surface modes compared.
  - `ring-translucent`: a ring `#00000080` on `#ffffff` composites to `#808080`
    (3.95:1) → pass, where an opaque `#000000` reading would also pass but `#00000033`
    (composite `#cccccc`, 1.61:1) → fail. Assert both.
  - `surface-translucent`: the only surface is `#ffffff80` → `skip`, counted.
  - `indicator-failed`: a focus variant without a ring, surfaces set → `skip`.
- **Prove the fail fixtures can fail:** temporarily change `< AA_NON_TEXT` to
  `< 0`, run the tests, and see `zygarden-ring-light-fails`,
  `sample-ring-on-muted-raw` and the translucent-fail case go red; then restore.
Verify: `node --test scripts/lib/figma-checks.test.mjs` → all pass; the mutation
above turns the three red.

### Step 3 — the reader resolves colours

Files: `scripts/lib/figma-checks-read.figma.js`
Change: add `async function variableColors(variable)` returning
`{ modes: { [modeName]: hex | null }, defaultMode }` over the variable's own
collection (`getVariableCollectionByIdAsync`). For each mode it follows
`VARIABLE_ALIAS` chains with `getVariableByIdAsync`, resolving each hop in the target
collection's mode with the same name (matched after `normalizeName`), else that
collection's default mode, up to 10 hops; past that, or on a non-colour value, the
result is `null`. The hex is lowercase `#rrggbb`, with `aa` appended only when alpha
< 1. `readFocusNode` keeps the variable objects it already fetches. `readComponentSet`
builds `colors` from every colour variable read on focus variants and their
`controlLayer` (effect colours and stroke variables). Then, once per run, it looks
each `EXPECT.surfaces` name up in `getLocalVariablesAsync('COLOR')` and adds it,
putting names it can't find in `missingSurfaces`. Async getters only. The header
comment says values are now resolved, for which variables, and that surface lookup is
local only.
Verify: the reader is untested in Node, as its header says. Step 4's `--check` proves
only that it inlines. The proof that it resolves aliases per mode is Step 6, which
records an aliased ring's per-mode hex against the value read independently.

### Step 4 — generate the script

Files: `scripts/build-figma-checks.mjs`, `scripts/build-figma-checks.test.mjs`, `references/figma-checks.md` (generated), `scripts/README.md`, `ci/README.md`
Change: read `scripts/lib/contrast.mjs` and inline it, stripped of exports and run
through the same import-free assertion, before the checker. `BIND` passes
`contrastRatio, composite, parseHex, AA_NON_TEXT`. In `HEADER`, the "Sources:" line
names `scripts/lib/contrast.mjs` too. The EXPECT line becomes
`{ name, matrix, uiFramework, controlLayer, surfaces }`, with a sentence saying
`surfaces` holds the colour-variable names of the page surfaces the component sits on,
copied from the architect's spec, and that without it focus contrast is skipped. The
header's list of checks names focus-ring contrast, and step 3 says a `focus-contrast`
fail is `BLOCKED` at once rather than retried. `scripts/README.md` (the lines that
enumerate the generator's sources, around `:26-34`) and `ci/README.md` item 8 name the
fourth source. Update the generator test for the new source.
Verify: `node scripts/build-figma-checks.mjs && node scripts/build-figma-checks.mjs --check` → `✓ figma checks in sync`; `node --test scripts/build-figma-checks.test.mjs` passes.

### Step 5 — who names the surfaces, where the result goes, and the prose

Files: `agents/architect.md`, `agents/figma-executor.md`, `skills/component-builder/SKILL.md`, `references/figma-component-standards.md`, `references/proof-bundle.md`, `ci/figma-checks-pointers.test.mjs`, `README.md`, `CHANGELOG.md`, adapters (generated)
Change:
- architect.md item 3: the per-component spec also carries `surfaces`, the colour
  variable names (read with `figma_get_variables`) of the page surfaces the component
  is placed on: at least the default page surface, plus any other it's meant for.
  The executor copies them into the checks.
- figma-executor.md step 4: "and `controlLayer` copied from the spec when it gives
  one" becomes "`controlLayer` and `surfaces` copied from the spec when it gives
  them", plus one sentence: a `focus-contrast` fail is `BLOCKED` at once, naming
  the pairs, because the fix is a token value. Step 6: name the `focus-contrast`
  outcome beside `focus-indicator`.
- component-builder SKILL.md: on the inline path (`:184`), name `surfaces` yourself
  the same way as `controlLayer`, and a `focus-contrast` fail stops the build without
  changing any variable. In the record step (`:374`), add `focus-contrast` when that
  check ran and passed (not when it was skipped).
- figma-component-standards.md item 9: one paragraph. The ring must clear 3:1
  against each named surface in every mode, the script checks it, the executor
  `BLOCKED`s at once and inline stops (neither edits a token), and a pass is
  recorded as `focus-contrast`. Point to `references/figma-checks.md`; don't restate
  the rules.
- proof-bundle.md: add `| focus-contrast | attested | component-builder |` under
  `focus-indicator` (`:209`).
- ci/figma-checks-pointers.test.mjs: three tests mirroring the `controlLayer` ones
  (architect spec, inline path, executor step 4 each name `surfaces`). Prove each fails
  by deleting the word from its site, then restore it.
- README.md:215: "Still ahead: focus-ring contrast (WCAG's 3:1 for non-text)." becomes
  a sentence saying a Figma build also stops when a focus ring falls below WCAG's 3:1
  against a surface the architect names for it, in any mode. Keep the paragraph's
  claim about real-world catches honest: it still hasn't caught a bug in a real build.
- CHANGELOG `[Unreleased]` → `### Breaking`: the check, the new `surfaces` field,
  what blocks, and what a builder does (the architect names surfaces; until then it
  skips).
- `node scripts/adapters/generate.mjs` regenerates the adapters.
Verify: `node --test` (bare, from the repo root) → all pass; `node scripts/adapters/generate.mjs --check` and the other `--check` commands in `ci/README.md` pass.

### Step 6 — live run on real files

Files: `docs/notes/2026-10-13-focus-ring-contrast-live-run.md` (new)
Change: through the bridge, pin each file (`figma_navigate` with `lock: true`) and run
the generated script in `'built'` mode with `uiFramework: 'shadcn'`. Judge only the
`focus-contrast` entry; a scratch set may fail `state-baseline`, and that's expected.
- **Sample:** clone the existing Button set into a `WIP: Button` frame in a scratch
  section. With `surfaces: ['color/bg/canvas']` → expect pass. With
  `['color/bg/canvas', 'color/bg/muted']` → expect fail naming `color/focus/ring` on
  `color/bg/muted` in Light at `2.99:1`. Record `colors['color/focus/ring']`, an alias
  to a primitive, against the hex read independently per mode.
- **Zygarden:** the owner offered this file for testing. In a scratch section, build a
  minimal `WIP: Chip` set with `state=default|focus`, whose focus variant carries a
  drop-shadow ring (spread 3) bound to `color/stroke/focus`. With
  `surfaces: ['color/bg/canvas']` → expect fail in Light at `2.38:1`, Dark passing.
- Remove every scratch node, and confirm by a page read that nothing is left and the
  existing sets are untouched. Unpin after.
Record the numbers, what failed and why, and what wasn't measured.
Verify: the note's numbers match the tool output; a read after cleanup finds no
`WIP:` nodes.
