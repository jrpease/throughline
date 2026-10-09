# Figma stop conditions as committed scripts

Status: planned
Reviewed: 2026-10-09 — needs revision (second pass: built mode targeted the wrong node, controlLayer had no supplier, install leaked the checker). Revised: the owner settled Q20–Q27 and the Plan was amended to match.
Date: 2026-10-07
Backlog: #112, Phase 4¾
Source: a whole-plugin critique run on 2026-10-07 (not committed; its findings
are summarised in #112's Phase 4¾).
Builds on: #159 (one state list, `scripts/lib/component-states.mjs`), #140
(the focus-indicator check), #135 (inline builds get the executor's checks).

## Goal

Every Figma-side stop condition is prose today. Each run, the model reads a
paragraph and writes its own `figma_execute` read-back to check it. The same
checks are written in up to three places: `agents/figma-executor.md:19`,
`references/figma-scripting.md:330-339`, and the post-build audit in
`references/figma-component-standards.md:500-632`. None of them has a test.

After this ships, three checks are one committed script that both the executor
and the inline build run as written, before and after a component build: the
COMPONENT_SET assertion against the full variant matrix, the state matrix, and
the focus ring. The rules live in one pure module with fixture tests in Node,
and a rule that turns out wrong on a live file gets fixed in one place.

The value is preventive. No recorded run shows the model writing a wrong
read-back. What the record does show is a rule that was wrong on its first live
run: the focus check would have blocked all 18 correct focus variants on the
sample Button on 2026-09-30 (`docs/specs/2026-09-29-component-accessibility-checks.md:450-485`),
and today that fix has to land in three prose copies with nothing to catch a
missed one.

## Non-goals

- Scripting the rest of the post-build audit: the bound-variable spot-check,
  `clipsContent`, naming, header division, and so on. Those stay prose in v1,
  including the two sentences of executor step 4 that cover the spot-check and
  `clipsContent`.
- Token, token-sheet and icon dispatches of the executor. They keep their
  current prose read-backs.
- Writing script results into the proof bundle as attested entries.
  `component-builder` keeps recording them the way it does today.
- Changing what the reviewer agent does. It keeps its visual-only review.
- A mock of the `figma` global.

## Decisions

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| Which checks become scripts in v1 | The COMPONENT_SET assertion, the state matrix, and the focus ring | These are the checks that can stop a build. Keeps v1 to what's already a stop condition | Scripting the bound-variable spot-check and the rest of the post-build audit |
| Which paths run the scripts | `figma-executor` and `component-builder`'s inline build path | #135 promised inline builds the executor's checks. Executor-only would let the two drift again | Executor-only scripts; the reviewer re-running the scripts |
| Which executor dispatches run them | Component builds only. Step 4 says: when the dispatch builds a component set, run the checks script | Token, token-sheet and icon dispatches have no COMPONENT_SET or matrix to check | Expanding the script to variables, swatches and icon grids |
| Proof bundle wiring | Not in v1 | Who signs the entry and what schema it uses is its own design, worth doing once the scripts are proven on a live file | Executor-written attested entries from script output, for now |
| Build it at all, with no recorded wrong read-back | Yes | Preventive: one tested source, and rules fixable in one place with a fixture | Waiting until the prose actually drifts |
| How the script reaches Figma | The doc-card pattern: a generator inlines committed source into a generated reference, the model pastes it into `figma_execute`, and `--check` runs in CI and release | It's the one pattern the repo already has for committed Figma code | The agent reading a `.figma.js` file directly |
| Where the rules live as code | A new pure module, `scripts/lib/figma-checks.mjs`, with no imports (like `doc-card-plan.mjs`). It holds the checker and the focus-framework rules: which frameworks are in scope, each one's ring recipe, the focus-variable name rule | One home for the Figma rules, unit-tested; the CLI module stays CLI-only | A framework table added to `component-states.mjs`; the model supplying rules each run |
| How the state table gets into the script | Make `component-states.mjs` import-free by defining its one-line fold locally (`source-scan.mjs` keeps its own `normalizeName`), and have the generator inline its source the way it inlines the doc-card planner. A test asserts the two fold one-liners agree | #159's single list reaches Figma as the same source the CLI runs. No JSON emission step, and no second fold inside the checker | Evaluating the module in Node and emitting its tables as JSON |
| Do the checker and its fixtures ship to consumers | No. `lib/figma-checks.mjs` and `lib/fixtures/` join `PLUGIN_INTERNAL` with the generator and the reader | Consumers get the generated reference, the only form the executor uses; nothing in their repo would import the checker | Copying an unused checker into every consumer's `scripts/` |
| What the model supplies | One `const EXPECT = { name, matrix: { axis: [values] }, uiFramework, controlLayer? }` slot. `name` is the component's real name, used for matching against the state table. The executor already reads `uiFramework` from `design-system.json` at step 1. `controlLayer` names the layer that is the actual control in a wrapped control (an Input with a label); the ring is checked on it, or on the variant itself when it's absent | Turns the prose judgment "the child frame that is the control" into a name | A layer-finding convention in code |
| Who supplies `controlLayer` | The architect. Its per-component spec gains a `controlLayer` field for wrapped controls, and the executor copies it into `EXPECT`. On the inline path, component-builder names it the same way | The decision stays with the deciding tier; the executor still decides nothing | The executor deriving it by convention |
| Which node built mode checks | The COMPONENT_SET inside the frame named `WIP: <name>` on the current page; it throws only if the frame is missing (see Where it diverged) | That's the node the self-verify loop is building. Searching by the real name finds nothing on a first build, and the old live component on a rebuild | An explicit node field in `EXPECT` |
| How it's tested without Figma | Split it in two. A thin reader turns the live node into plain JSON and stays untested, like the doc-card renderer. The pure checker takes that JSON and returns the result, and Node unit-tests it against fixture JSON | Tests the rules, which is where the recorded variance was, without writing a fake of a large API | A mock `figma` global; live-only testing |
| How the reader gets variable names | It resolves names (`getVariableByIdAsync`) only for bindings on focus variants and their control layer: effects and strokes. Fixtures carry resolved names | Keeps lookups proportional to the number of focus variants, inside the ~30 s cap | Resolving every binding in the set |
| What the state check reads | Both, in one script. `MODE: 'spec'` checks `EXPECT.matrix` against the state table with no node, before anything is written. `MODE: 'built'` reads the node and runs all three checks | The pre-write check is cheap and caught Chip before anything was written; the post-build check catches a build that drifted from its spec. One script, one table | The pre-write check staying prose; dropping either check |
| Is `default` still required | Yes, in both modes: the table's states plus `default`, as executor step 4 requires today. The CLI table keeps excluding it | Dropping it would quietly remove a stop condition the executor has today | Matching the CLI exactly |
| What the structural check asserts | The full matrix: type is `COMPONENT_SET`, every child is a `COMPONENT`, the axes match, and the set of value combinations equals the cross product of `EXPECT.matrix`, with missing and extra combinations named. Axis names and values compare folded (lowercase, punctuation stripped), the same rule the state check uses. A deliberately sparse set fails and is `BLOCKED`, as it is under today's count check | A count-only check passes a set with the right count but the wrong values; folding keeps the two checks from disagreeing on `Focus` vs `focus` | Count plus axis names only; exact string matching; an explicit combinations list for sparse sets in v1 |
| Result shape and failure | Returns `{ pass, checks: [{ name, result, detail }] }`, with names matching the proof bundle's existing check names (`structural-read-back`, `state-baseline`, `focus-indicator`). `result` is `pass`, `fail` or `skip`, and a skip's `detail` says why (framework out of scope, name not in the table). `pass` ignores skips. A failed assertion is data, not an exception; built mode throws only when the target node doesn't exist. The executor's existing retry-then-`BLOCKED` loop decides | You see every problem in one Figma call, so the ~3-pass budget isn't spent finding issues one at a time. Skips stay visible, and when results reach the proof bundle later, skips aren't recorded, matching today's "a skip records nothing" | Throwing on the first failure; omitting skipped checks |
| What happens to the prose | Build guidance stays: how to make a focus ring and a COMPONENT_SET, because designers read that. Check detail goes, replaced by "run the checks in `references/figma-checks.md`; the script is the rule": the COMPONENT_SET, state and focus sentences of executor step 4, `figma-scripting.md:330-339`, and the recipe assertions in audit items 8 and 9. A CI test fails if those sites stop pointing at it | Keeping prose copies of the checks is the drift this work exists to remove | Keeping the prose as documentation beside the script |
| Where fixtures come from | Hand-written now, one for every recipe branch: a good shadcn Button (filled), a transparent variant with a ring child, an Input with a control layer, a `mui` input, a `vanilla-css` OUTSIDE stroke, a skipped framework, plain FRAMEs, a ring with spread 0, a missing Selected, a wrong matrix combination. One real reader capture from the sample Button is saved during the live run | Tests don't wait on a Figma session, and every branch the live run can't reach still has a test | Real captures only |
| Live run before shipping | Yes, merge only after it. On the sample file, built mode reads the existing 108-variant Button read-only (timing and one real fixture; rebuilding it could detach its instances). Chip, Toggle and Switch are built fresh through the executor and removed afterwards, as the #140 run did. The sample file is `shadcn`, so only that recipe is measured live; `mui`, `vanilla-css`, `tailwind` and the skip path are tested on hand-written fixtures only, and the release notes say so | The post-build state check is a new stop condition, and stop conditions get measured on a real system first. It also closes the Figma side #159 left unmeasured | Shipping on unit tests alone; a second live sample |

## Open questions

- **Will the reader fit the ~30 s `figma_execute` cap on a large set, such as
  the 108-variant Button?** The reader resolves variable names only on focus
  variants (Decisions), which bounds the cost. The live run measures it. If it
  doesn't fit, split by variant the way builds already are. Unresolved until
  measured.

## Constraints the build follows

- **Install:** the generator, the reader, the checker and `lib/fixtures/`
  join `PLUGIN_INTERNAL` in `scripts/install.mjs:105-110`, and the `skipScript`
  test in `install.test.mjs` covers them. The generated
  `references/figma-checks.md` ships to consumers the way `doc-card-builder.md`
  does. `scripts/README.md` gets a row for each new script.
- **Adapters:** editing `skills/component-builder/SKILL.md` means regenerating
  `adapters/*` (`node scripts/adapters/generate.mjs`); CI gates it.
- **The post-build state check is a new stop condition**, so it goes under
  Breaking in the CHANGELOG.

## Facts this rests on

- **Prose sites today:** `agents/figma-executor.md:19` (step 4: structural
  read-back, bound-variable spot-check, `clipsContent`, state check, focus
  check); `references/figma-component-standards.md:500-632` (post-build audit,
  items 8 and 9 at 557-618); `references/figma-scripting.md:330-339` (the
  build-verify-then-replace read-back); `skills/component-builder/SKILL.md:178-182`
  (the inline path runs the full audit).
- **The executor has four dispatchers:** `component-builder`, `token-builder`
  (`SKILL.md:59-63`), `token-sheet-builder` (`:41-46`) and
  `icon-system-builder` (`:179`).
- **The state check reads the spec**, not the built node (`agents/figma-executor.md:19`).
  In the #140 live run it blocked Chip before any write.
- **Focus rules exist only as prose** (`figma-component-standards.md:122-194`,
  `:573-618`): the frameworks in scope, shadcn/tailwind/unset use a ring,
  `mui` splits by input, `vanilla`/`vanilla-css` use an OUTSIDE stroke, and a
  focus variable is any variable with a `focus` segment.
- **Bound variables carry only an id** (`{ type: 'VARIABLE_ALIAS', id }`); a
  name needs `figma.variables.getVariableByIdAsync`.
- **Precedent:** `scripts/lib/doc-card-render.figma.js`, inlined by
  `scripts/build-doc-card-builder.mjs:114-138`, which strips `export`, throws if any
  `import`/`export` survives, and fails `--check` on drift.
  `scripts/install.mjs:105-110` marks both as plugin-internal. The renderer is
  never executed in a test. `scripts/build-state-baseline.mjs` is the second
  generate-and-check precedent.
- **`figma_execute` constraints** (`references/figma-scripting.md`): a ~30 s cap
  whatever timeout is passed (:242-257); `dynamic-page` needs the async getters
  (:109-128); read-after-write needs `refreshCache: true` (:102-107); no
  documented size limit, and the 22,553-byte doc-card snippet runs today.
- **Effect binding resets `spread`** (`references/figma-scripting.md:145-159`),
  which is why the focus check asserts `spread > 0`.
- **The sample file is `shadcn`** (`docs/specs/2026-09-29-component-accessibility-checks.md`, Step 7).
- **No fake Figma exists** anywhere in the repo. Tests are bare `node --test`
  with zero dependencies.
- **Recorded variance:** a fabricated DONE from Haiku building plain FRAMEs; a
  focus rule wrong on its first live run (2026-09-30); flaky binds that stuck on
  a re-run. No case of the model's read-back script itself being wrong.

## Where it diverged

Steps 1–6 are built; Step 7 (the live run) is not, so Status stays `planned`.

- **A frame with no set is data, not a throw.** The plan had built mode throw
  when the `WIP:` frame held no COMPONENT_SET. That's the fabricated-DONE case
  (plain FRAMEs) the structural check exists for, and the Decisions row "Result
  shape and failure" says a failed assertion is data. The reader now reports the
  frame's first child type, and the structural check names it. It throws only
  when the frame itself is missing.
- **A conflicting set is data too.** `variantGroupProperties` throws in the
  plugin API when Figma flags duplicate combinations. The reader catches it and
  derives the axes from the children, so the structural check names the
  duplicates. Not provable in Node, and the live run won't build a conflicting
  set; this rests on the whole-branch review's reasoning.
- **Judgment calls in the transcription,** each ruled faithful to main's prose
  by the whole-branch review: a focus variable needs a `/`-separated segment
  equal to `focus`; zero focus variants on an in-scope component fails; a name
  not in the table or an exempt archetype skips; `mui` counts as an input when the
  archetype resolves to `input`; the ring child needs ABSOLUTE + OUTSIDE, the
  outline recipe needs OUTSIDE only; a named `controlLayer` is the only place the
  ring is checked; duplicate combinations are reported.
- **Unproven until Step 7:** whether `figma_execute` surfaces a top-level
  `return` from the snippet. The doc-card precedent never uses one.

## Plan

### Step 1 — Make `component-states.mjs` inlinable

Files: `scripts/lib/component-states.mjs`, `scripts/lib/component-states.test.mjs`
Change: Replace `import { normalizeName } from './source-scan.mjs'` with a local
`const normalizeName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');`
(the same one-liner as `source-scan.mjs:45`). Add a test asserting the local and
`source-scan.mjs` versions agree on `Text Field`, `IconButton`, `check-box`,
`Focus Visible`. Nothing else about the module changes.
Verify: `grep -c '^import' scripts/lib/component-states.mjs` → 0; `node --test scripts/lib/component-states.test.mjs` → pass; `node ci/validate-install-sets.mjs` → OK.

### Step 2 — The pure checker and its fixtures

Files: `scripts/lib/figma-checks.mjs`, `scripts/lib/figma-checks.test.mjs`, `scripts/lib/fixtures/figma-checks/*.json`
Change: A module with no `import` statements exporting `FRAMEWORKS` (in-scope
`uiFramework` values and each one's recipe, transcribed from
`figma-component-standards.md:122-194` and `:573-618`), `checkSpec(expect)` and
`checkBuilt(snapshot, expect)`. It uses `resolveArchetype`, `BASELINE_STATES`,
`NAME_SYNONYMS` and `STATE_SYNONYMS` from `component-states.mjs` as free names:
the generator inlines both, and the test imports `component-states.mjs` and
injects them through a small `withTable({...})` factory, so the checker file
itself stays import-free. Both functions return
`{ pass, checks: [{ name, result: 'pass'|'fail'|'skip', detail }] }` per the
Decisions, require `default` on the state axis, and fold axis names and values.
Document the snapshot shape (the reader's output) in a comment at the top:
the set's type; `variantGroupProperties` keys; each child's type and
`variantProperties`; and for focus variants only: the variant's effects (type,
`visible`, `spread`, bound colour variable name), its direct children with
`layoutPositioning`, `strokeAlign`, strokes and bound stroke-colour variable
names, `boundVariables.strokeWeight` presence, and the same fields for the
`controlLayer` subtree when one is named. Write one fixture per branch listed in
the Decisions.
Verify: `node --test scripts/lib/figma-checks.test.mjs` → every fixture branch passes; `grep -c '^import' scripts/lib/figma-checks.mjs` → 0.

### Step 3 — The reader

Files: `scripts/lib/figma-checks-read.figma.js`
Change: Not a Node module (header like `doc-card-render.figma.js:1-10`). An
async `readComponentSet(expect)` that finds the frame named `WIP: ${expect.name}`
with `figma.currentPage.findOne` (after `figma.currentPage.loadAsync()`), takes
its `COMPONENT_SET` child, throws if the frame is missing (a frame with no set is reported, not thrown; see Where it diverged), and returns the
snapshot shape from Step 2, resolving variable names with
`figma.variables.getVariableByIdAsync` only on focus variants and their
`controlLayer`. Then `runFigmaChecks(EXPECT, MODE)`: spec mode calls
`checkSpec`; built mode reads, then calls `checkBuilt`. Returns the result object.
Verify: reviewed by eye against the snapshot comment in Step 2; proven in Step 7.

### Step 4 — The generator and its gate

Files: `scripts/build-figma-checks.mjs`, `scripts/build-figma-checks.test.mjs`, `references/figma-checks.md`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `ci/README.md`, `scripts/README.md`, `scripts/install.mjs`, `scripts/install.test.mjs`
Change: Mirror `scripts/build-doc-card-builder.mjs`: strip `export` from
`component-states.mjs` and `figma-checks.mjs`, throw if any `import`/`export`
survives, append the reader, and write `references/figma-checks.md` with a
"How to call it" section: the `EXPECT` and `MODE` slots, timeout 30000, and
what to do with the result. Run bare to write, `--check` to fail on drift. Add
`--check` to both workflows and `ci/README.md`. Add the generator, the reader,
`lib/figma-checks.mjs` and `lib/fixtures/` to `PLUGIN_INTERNAL`, and extend the
`skipScript` test. Add a `scripts/README.md` row per new script.
Verify: `node scripts/build-figma-checks.mjs --check` → up to date; `node --test scripts/build-figma-checks.test.mjs ci/workflow-gates.test.mjs scripts/install.test.mjs` → pass; in a `git clone --local` copy in the scratchpad, remove `selected` from `BASELINE_STATES.choice` and `--check` exits 1.

### Step 5 — Point the prose at the script

Files: `agents/architect.md`, `agents/figma-executor.md`, `references/figma-scripting.md`, `references/figma-component-standards.md`, `skills/component-builder/SKILL.md`, `ci/figma-checks-pointers.test.mjs`, `adapters/*`
Change: The architect's per-component spec gains `controlLayer` for wrapped
controls. Executor step 4: for a component-set dispatch, run spec mode before
the first write and built mode in the self-verify loop, with `controlLayer`
copied from the spec. The COMPONENT_SET, state and focus sentences are replaced
by the pointer; the bound-variable spot-check and `clipsContent` sentences stay.
Token, token-sheet and icon dispatches are unchanged. `figma-scripting.md:330-339`
and audit items 8 and 9 keep their build guidance and lose the check detail. The
inline path in component-builder runs the same two modes and names
`controlLayer` itself. A new test asserts each of those sites names
`references/figma-checks.md`. Regenerate adapters.
Verify: `node --test ci/figma-checks-pointers.test.mjs` fails before the edits and passes after; `node scripts/adapters/generate.mjs --check` → in sync.

### Step 6 — Changelog and full gate

Files: `CHANGELOG.md`
Change: Under `## [Unreleased]`: a `### Breaking` entry for the post-build state
check and the full-matrix comparison, and a `### Changed` entry for the scripts,
saying only `shadcn` is measured live.
Verify: the full CI set, `node --test` through `node scripts/build-figma-checks.mjs --check`, all green.

### Step 7 — Live run (owner, with Figma open)

Files: `docs/notes/<date>-figma-checks-live-run.md`, `scripts/lib/fixtures/figma-checks/sample-button.real.json`
Change: On the sample file: run built mode read-only against the existing
108-variant Button (for this run only, the pasted snippet's frame lookup
is edited by hand to target the existing set; nothing about that edit is committed), time it against the ~30 s cap, and
save the snapshot as a real fixture with a test. Build Chip, Toggle and Switch
fresh through the executor with spec and built mode, then remove them. Record
what passed, what failed and why, in the style of the other measurement notes.
Any rule that's wrong goes back to the owner, not narrowed in the run.
Verify: the note exists with timings; `node --test scripts/lib/figma-checks.test.mjs` passes, including the real fixture. Merge only after this step.
