# Focus drawn as a stroke, in existing libraries (#169)

Status: built (run live on Zygarden and 01. Design System, 2026-11-15)
Reviewed: 2026-11-15 — ready to build (round 3)
Date: 2026-11-15

## Goal

`/throughline:check-figma` runs the focus checks over component sets that already
exist in a library. Two of the three real files we've measured draw focus as an
INSIDE stroke on the control: Zygarden's `search` and `autocomplete`, and
01. Design System's Text Field and Card. Today none of the four is measured, for
two separate reasons:

1. **The kind gate.** The checks resolve a set's kind (archetype) from its name
   alone (`scripts/lib/component-states.mjs:34-49`). `search` and `autocomplete`
   aren't in the table, so they skip as "not a name in the state table". `Card`
   resolves to `card`, which owes no states, so it skips before any variant is
   read. Only Text Field (`input`) gets as far as the focus check.
2. **The recipe gate.** The focus check only accepts ThroughLine's own build
   recipes (a drop shadow, an absolute ring child, an OUTSIDE outline), so a
   Text Field drawn with an INSIDE stroke fails `focus-indicator`, and
   `focus-contrast` never measures it.

After this ships:

- **01. Design System's Text Field** passes `focus-indicator` on its
  `interaction/border-primary-focus` stroke, and `focus-contrast` measures that
  stroke against the named surfaces. Its 1.98:1 on `surface/greyscale-default`
  fails, and that's the result we want reported.
- **01. Design System's Card** gets the same, once the user says it's an
  interactive kind (Decision 8).
- **Zygarden's `search` and `autocomplete`** are still not measured, because
  their stroke is bound to `color/brand/primary`, not a focus variable. Once the
  user names their kind, they fail `focus-indicator`, and the detail says why and
  names the variable to rebind or rename, instead of being skipped.

Wider reach, in `existing` mode only: a currently failing set also passes when
its focus-bound stroke is anywhere Decision 2 allows. That includes a `mui` input
whose stroke weight isn't bound, and a ring-recipe set whose focus stroke sits on
a non-absolute child. A set whose doc record names an interactive kind its name
doesn't resolve (a Select recorded as `input`) moves from skipped to checked, and
can newly fail `state-baseline`. No currently passing result changes.

## Non-goals

- **ThroughLine's own builds.** `checkBuilt` and `checkSpec` are unchanged, and
  enforced in code: they ignore both the stroke fallback and `EXPECT.archetype`.
  They keep the house recipes in `references/figma-component-standards.md` (item
  9: an INSIDE stroke is a fail).
- **#168, contrast against the control's own fill.** An INSIDE stroke's inner
  edge touches the fill. That's the same two-sided question #168 leaves open.
- **Detecting a colour change with no focus variable.** No comparison with the
  default variant's stroke (Decision 3).
- **Adding `search` or `autocomplete` to the state table.** The kind comes from
  the user or the doc record, per set (Decision 8).
- **Remembering a kind the user gives.** `check-figma` is read-only, so an answer
  lasts for that run. It's kept by writing `archetype` into the component's doc
  record, which is `document-component`'s job.

## Decisions

Rows 1–7 were recommended in a self-answered crush-it round and approved as a set
by the owner at the checkpoint on 2026-11-15 ("keep going"). The spec review then
found the checkpoint summary had overstated the reach: three of the four named
components never reach the focus check. The owner was shown the real reach and
chose row 8 directly, keeping rows 3 and 5 as approved. The second review raised
the hidden-stroke question, and the owner chose row 9 directly.

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| 1. Does a focus-variable-bound INSIDE stroke count as a focus indicator? | Yes, in `existing` mode only. `checkBuilt` and `checkSpec` keep the house recipes. | WCAG 2.4.7 asks for a visible indicator, not a ring outside the control. In an audit, failing a legitimate indicator hides the contrast result, which is the thing worth knowing. ThroughLine's build standard is a house rule for what it draws itself. | Loosening the build recipes; changing `references/figma-component-standards.md` |
| 2. Which strokes count? | Any `strokeAlign` (INSIDE, CENTER, OUTSIDE) on the focus target (the variant, or its `controlLayer`) or one of its direct children, with at least one stroke colour bound to a focus variable. | Matches the depth the `outline` recipe already reads. CENTER is half outside, so it's no weaker than INSIDE. | Reading deeper than direct children |
| 3. What signals "this stroke is the focus state"? | The stroke is bound to a focus variable (`isFocusVariable`, unchanged). | It's the signal every other recipe uses. A focus-named binding is the designer saying "this is focus." Confirmed by the owner after seeing that it leaves Zygarden unmeasured. | Accepting any stroke, or comparing against the default variant |
| 4. Which wins when a variant has both a recipe ring and a focus stroke? | The recipe ring, as today. Per variant, the stroke is used only when `lacksRing` fails for that variant, and contrast measures exactly what the indicator accepted for it. | Keeps every currently passing result and its contrast pairs byte-identical. Keying contrast off the indicator's own per-variant result means the two checks can't disagree. | Measuring both |
| 5. What does a stroke contrast against? | The named page surfaces, same as rings. | Consistent with the ring check. The own-fill side is #168's open question and stays there. Confirmed by the owner alongside row 3. | Deciding #168 here |
| 6. How does the report say it? | `focus-indicator` passes, and its detail counts the variants that used the recipe and those that used a focus-bound stroke, naming the alignment. `focus-contrast` wording is deliberately untouched ("ring/surface pair(s)"). | A pass on a stroke shouldn't read as "the library uses the shadcn ring." The contrast check doesn't care how the colour got there. | A new result value beside pass/fail/skip; rewording `focus-contrast` |
| 7. What does a near-miss say? | In `existing` mode, when a focus variant has bound strokes but none is a focus variable, the fail detail names them: `its stroke is bound to color/brand/primary, which isn't a focus variable`. | Once its kind is known (row 8), Zygarden's `search` fails here. The detail should say why and what to rebind or rename. | Silently counting it |
| 8. What about sets the kind gate skips? | In `existing` mode only, `EXPECT` takes an optional `archetype` (`button`, `input`, `choice`, …), passed to `resolveArchetype`, which already honours it. `check-figma` fills it from the component's doc record when there is one. When a set skips because its name isn't in the state table or its kind owes no states, and its doc record doesn't give it a kind, `check-figma` asks the user whether it's interactive and which kind, then reruns it with `archetype`. If the user says it isn't interactive, the skip stands. | The resolver already takes a record's `archetype`. The rerun copies the `controlLayer` pattern `check-figma` Step 4 already uses. It reaches 01 DS's Card and Zygarden's `search`/`autocomplete` without guessing kinds from names. | Growing `NAME_SYNONYMS` to guess kinds; reclassifying `card` as interactive for everyone; the override in built or spec mode |
| 9. A bound stroke that's hidden or zero-width? | Guard it. The reader also returns `strokeVisible` (any stroke paint with `visible !== false`) and `strokeWeight` (the number, or the largest side weight when Figma reports mixed). The stroke fallback ignores a node whose `strokeVisible` is `false` or whose `strokeWeight` is a number ≤ 0. A missing field counts as visible, so old snapshots and fixtures read the same. The house recipes don't use the new fields. | An audit of someone else's library shouldn't pass a focus state nobody can see. The ring recipes already guard their equivalents (`visible !== false`, `spread > 0`). | Accepting a false pass as a known limit; changing what the house recipes accept |

## Open questions

- **Strokes applied through a colour style.** A stroke painted from a colour style
  rather than a bound variable has no `boundVariables.strokes`, so it reads as
  unbound and fails without the near-miss detail. Not measured on any real file
  yet. Recommendation: check during the live run. Unresolved.
- **How the kind question is asked** (minor, built as recommended). One batched
  question per run, listing every skipped set with no doc-record kind. A set
  whose doc record gives a no-state kind (`card`, `badge`, `modal`, `other`) isn't
  asked about, because the record has answered. Unresolved; change it at review
  if you'd rather.
- **The visibility guard is per node** (Decision 9 as defined). A hidden
  focus-bound paint beside a visible unbound one, a hidden layer, or a
  zero-opacity paint still passes. Recommendation: revisit if the live run meets
  one. Unresolved.

## What shipped

- `scripts/lib/figma-checks.mjs`: `kindOf` (existing-mode `archetype`), `visibleFocusStrokeNodes`, `nonFocusStrokes`, `strokeOutcome`; `focusIndicator`, `focusContrast` and `stateBaseline` take `{ existing }`; `checkExisting` passes it.
- `scripts/lib/figma-checks-read.figma.js`: `strokeVisible` and `strokeWeight` on every focus node.
- `scripts/lib/fixtures/figma-checks/existing-inside-stroke.json` and eight tests in `scripts/lib/figma-checks.test.mjs`.
- `scripts/build-figma-checks.mjs` prose, regenerated `references/figma-checks.md`.
- `commands/check-figma.md` Steps 4 and 5, regenerated into the Cursor, Codex and generic adapters.
- `CHANGELOG.md` `[Unreleased]`.

## Where it diverged

- The near-miss names are gathered in a small named helper (`nonFocusStrokes`)
  rather than inline in `focusIndicator`, with the same rule.
- The diff review found that `kindOf` as planned let a doc record's `archetype`
  override a name the state table already checks (a Text Field recorded as
  `other` dropped out of the audit). That contradicted Decision 8's scope and the
  Goal's "no currently passing result changes", so `kindOf` now uses `archetype`
  only when the name resolves to nothing or to a no-state kind. Test 6 covers it.
- `check-figma.md` Step 4 also sends a rerun set through the inner-layer look, and
  Step 5 names the visibility guard's limits (from Open questions).
- **The live run on Zygarden (2026-11-15) found the sets name their state
  `focused`, not `focus`.** With a kind given, `search` and `autocomplete` failed
  "missing: focus" and no focus variant was read, so the Goal's promise for them
  didn't hold. The owner chose a shared synonym: `STATE_SYNONYMS` gains
  `focused → focus`, and the checker's and reader's focus-variant tests fold
  through it. This reverses part of `2026-09-29-component-accessibility-checks.md`'s
  "What counts as a focus variant" row (`Focused` abstained); `focus-visible`,
  `hover+focus` and a boolean focus property still abstain (a test holds the
  first two). It reaches every mode and the doc-record state check, not only
  existing sets. Live result after the fix: both sets fail `state-baseline` on a
  missing `hover` (true: Zygarden has none) and fail `focus-indicator` naming
  `color/brand/primary` (`search` on the control, `autocomplete` on its inner
  frame). The reader's `strokeVisible` and `strokeWeight` read correctly on the
  real nodes.
- **01. Design System, live the same day.** Its Text Field also names the state
  `Focused`, so without the synonym it would never have been reached. Card, given
  an interactive kind, matches the Goal: 4 of 4 focus strokes count, and contrast
  fails on `interaction/border-primary-focus` at 1.98:1 on
  `surface/greyscale-default`, the ratio the 2026-10-13 measurement found by hand.
  Text Field doesn't fully match the Goal's "passes `focus-indicator`": three
  focus variants carry focus-bound strokes (on the inner `Input` frame, a direct
  child), but `Color=On Red` binds `border/greyscale-light`, so it fails and the
  near-miss names that variable. That's Decision 3 working as decided: the file
  has to rename or rebind it. Text Field also fails `state-baseline` on a missing
  `hover`, which is true of the file. No colour-style strokes and no
  hidden-paint cases turned up on either file.

## Plan

### Step 1 — Fixture and tests (red before Step 2)

Files: `scripts/lib/fixtures/figma-checks/existing-inside-stroke.json` (new),
`scripts/lib/figma-checks.test.mjs`
Change:
- The fixture must also satisfy the auto-loop (`figma-checks.test.mjs:41-56`),
  which runs every fixture through `checkBuilt`. Shape:
  - `covers`: `"01 DS Text Field: a focus-bound INSIDE stroke is a built-mode fail (house rule); existing mode is tested below"`
  - `expect`: `{ "name": "Text Field", "matrix": { "state": ["default", "hover", "focus", "disabled"] }, "surfaces": ["surface/greyscale-default"] }` (no `uiFramework`, so the ring recipe)
  - `snapshot`: `type: "COMPONENT_SET"`, `variantGroupProperties: { "State": { "values": ["Default", "Hover", "Focus", "Disabled"] } }`. There are four COMPONENT children with `variantProperties: { "State": <value> }`. Only the Focus child carries `effects: []`, `strokeAlign: "INSIDE"`, `strokeVariables: ["interaction/border-primary-focus"]`, `strokeWeightBound: false`, `children: []`. It has no `strokeVisible` or `strokeWeight`, so it also covers "missing counts as visible". `colors`: `{ "interaction/border-primary-focus": { "modes": { "Light": "#b8b8b8" }, "defaultMode": "Light" }, "surface/greyscale-default": { "modes": { "Light": "#ffffff" }, "defaultMode": "Light" } }` (1.98:1 on `contrastRatio`, floored to `1.98`). `missingSurfaces: []`.
  - `expected`: `{ "structural-read-back": "pass", "state-baseline": "pass", "focus-indicator": "fail", "focus-contrast": "skip" }`
- New tests, each using `checkExisting` unless it says otherwise. All colour
  entries added in a test use the single mode `Light`.
  1. The fixture: `focus-indicator` pass with detail exactly `all 1 focus variants carry a focus indicator: 1 a stroke bound to a focus variable (INSIDE)`. `focus-contrast` fail with detail exactly `interaction/border-primary-focus on surface/greyscale-default in Light: 1.98:1, needs 3:1`.
  2. The fixture through `checkBuilt`: `focus-indicator` detail contains `lacks` (the house rule holds).
  3. `strokeAlign: "CENTER"` passes and the detail ends `(CENTER)`. The stroke moved to a direct child (`children: [{ "strokeAlign": "INSIDE", "strokeVariables": ["interaction/border-primary-focus"] }]`, the variant's own `strokeVariables: []`) passes.
  4. `strokeVariables: ["color/brand/primary", "color/border/default", "color/brand/primary"]` fails with detail containing `its stroke is bound to color/border/default, color/brand/primary, which isn't a focus variable`. Names are distinct and sorted, and the wording stays as is for any count.
  5. A DROP_SHADOW ring `{ "type": "DROP_SHADOW", "visible": true, "spread": 3, "colorVariable": "color/focus/ring" }` (`color/focus/ring` = `#000000`) added to the Focus variant: the indicator detail is today's `all 1 focus variants carry a ring-recipe focus indicator`, and `focus-contrast` passes (only `color/focus/ring` is paired).
  6. Kind override: with `expect.name: "search"`, all three checks skip. Adding `expect.archetype: "input"` gives test 1's two results. Same for `name: "Card"`. Through `checkBuilt`, `name: "search"` with `archetype: "input"` still skips `state-baseline` and `focus-indicator` (built mode ignores the override).
  7. Hidden and zero-width: `strokeVisible: false` fails with detail containing `lacks`. So does `strokeWeight: 0`. `strokeVisible: true, strokeWeight: 1` passes.
  8. A matching node with no `strokeAlign`: passes, and the detail is `all 1 focus variants carry a focus indicator: 1 a stroke bound to a focus variable`, with no parentheses.
- Every existing fixture and test stays as it is.
Verify: `node --test scripts/lib/figma-checks.test.mjs`. These fail until Step 2:
test 1, test 3, test 4, the `archetype` halves of test 6, the pass half of test 7,
and test 8. These already pass: the auto-loop (including the new fixture), test 2,
test 5, the skip halves of test 6, the fail halves of test 7, and every existing
test.

### Step 2 — The checker and the reader

Files: `scripts/lib/figma-checks.mjs`, `scripts/lib/figma-checks-read.figma.js`
Change:
- Checker, inside `withTable`: `kindOf(expect, existing)` returns
  `resolveArchetype(existing ? { name: expect.name, archetype: expect.archetype } : { name: expect.name })`.
  `stateBaseline(expect, entries, { existing = false } = {})`, `focusIndicator` and
  `focusContrast` use it in place of `resolveArchetype({ name: expect.name })`.
- Module level: `visibleFocusStrokeNodes(target)`. From `[target, ...(target.children ?? [])]`, keep the nodes whose `strokeVariables` include a focus variable, unless `strokeVisible === false` or (`typeof strokeWeight === 'number'` and `strokeWeight <= 0`). Return `{ variables, aligns }`: `variables` is their focus-variable names in node order; `aligns` is the distinct, sorted string `strokeAlign` values. The local `focusStrokes` inside `ringVariables` stays as it is.
- Module level: `strokeOutcome(target, recipe, isInput, existing)`. It returns `{ kind: 'recipe', variables: ringVariables(...) }` when `lacksRing` returns `[]`. It returns `{ kind: 'stroke', ...visibleFocusStrokeNodes(target) }` when it doesn't, `existing` is true and `variables` is non-empty. Otherwise it returns `{ kind: 'miss', lacks }`.
- `focusIndicator(snapshot, expect, { existing = false } = {})`: per focus variant, use `strokeOutcome`. A `miss` gives today's `<label>: lacks …` text. In existing mode, also take the distinct, sorted names in `strokeVariables` on target and direct children that aren't focus variables. If there are any, append `; its stroke is bound to <names joined ", ">, which isn't a focus variable`. Pass detail: when no variant is `stroke`, today's string exactly. Otherwise it's `all N focus variants carry a focus indicator: ` plus the parts `R the <recipe> recipe` (when R > 0) and `S a stroke bound to a focus variable` (when S > 0), joined with `, `. The stroke part gets ` (<union of aligns joined "/">)` only when that union isn't empty.
- `focusContrast(snapshot, expect, indicator, { existing = false } = {})`: per focus variant, add `strokeOutcome(...).variables` for a `recipe` or `stroke` outcome. With `existing` false, this is exactly `ringVariables`, as now.
- `checkExisting` passes `{ existing: true }` to all three. `checkBuilt` and `checkSpec` pass nothing.
- Header comment: add `archetype?` (existing mode only) to the EXPECT line, `strokeVisible` and `strokeWeight` to the FOCUS NODE shape, and a line under the recipes about the existing-mode stroke fallback.
- Reader, in `readFocusNode`: add `strokeVisible: (node.strokes || []).some((p) => p.visible !== false)`. Add `strokeWeight`: `node.strokeWeight` when it's a number, else the largest of `strokeTopWeight`, `strokeRightWeight`, `strokeBottomWeight` and `strokeLeftWeight` that are numbers, else `null`.
Verify: `node --test scripts/lib/figma-checks.test.mjs` → all pass.

### Step 3 — The command, the prose, the generated files

Files: `commands/check-figma.md`, `scripts/build-figma-checks.mjs` (the `existing`
prose at lines 104-105), `references/figma-checks.md` (regenerated),
`adapters/cursor/.cursor/commands/check-figma.md`,
`adapters/codex/prompts/check-figma.md`,
`adapters/generic/commands/check-figma.md` (regenerated), `CHANGELOG.md`
(`[Unreleased]`)
Change:
- `check-figma.md` Step 4: `EXPECT = { name, page, uiFramework, surfaces, archetype }`. `archetype` is the `archetype` field of the doc record at `components.meta[<name>].doc.path` in `design-system.json` (`references/component-doc-schema.md`, "Manifest pointer"); leave it out when there's no pointer, no record or no field. After the `controlLayer` sentence, add: collect the sets whose `state-baseline` or `focus-indicator` skipped because the name isn't in the state table or its kind owes no states, and that had no `archetype`. Ask about them in one question: is each interactive, and if so, which kind (button, input or choice)? Rerun those sets with `archetype`, and say in the report that you did. A set the user calls not interactive keeps its skip.
- `check-figma.md` Step 5: in the "can't see" list, replace "focus states drawn as an INSIDE stroke" with "focus strokes painted from a colour style rather than a variable (likely, not yet seen on a real file)". After that list, add one sentence: a focus stroke bound to a colour that isn't a focus variable is reported as a failure naming that colour.
- Build script prose, in the `existing` paragraph only: replace "A set whose focus state is drawn some other way, such as an INSIDE stroke, fails the focus-ring check and skips contrast." with three sentences. In this mode, a focus variant with no recipe ring but a visible stroke bound to a focus variable (any alignment, on the control or a direct child) passes the focus-ring check, and contrast measures that stroke. A stroke bound to anything else fails, naming the variable. `EXPECT.archetype` (`button`, `input` or `choice`) gives the kind of a set whose name the state table doesn't know, or whose kind owes no states; built and spec mode ignore it. The shared `EXPECT` bullet at line 72 isn't changed.
- Run `node scripts/build-figma-checks.mjs` and `node scripts/adapters/generate.mjs`.
- CHANGELOG `[Unreleased]` → `### Changed`: one entry stating the real reach. `check-figma` now measures a focus state drawn as a visible stroke bound to a focus variable. A set it doesn't recognise can be given a kind, by the user or by its doc record. A stroke bound to a non-focus colour is named in the failure. ThroughLine's own builds are unchanged. (#169)
Verify: `node scripts/build-figma-checks.mjs --check` and `node scripts/adapters/generate.mjs --check` exit 0. `node --test` (whole repo) passes. `grep -rn "drawn as an INSIDE" commands adapters references` returns nothing.
