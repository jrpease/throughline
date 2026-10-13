# Adherence gate for Figma screens

Status: built
Reviewed: 2026-10-13 — needs revision (the colour rule departed from the code gate's Decision 3 on a misread rationale; #170 overclaimed focus contrast on existing sets; reader gaps: instance-root overrides, mixed text paints, shared helpers, install list). Revised the same day: the colour rule now follows Decision 3, `unstyled-text` moved to v2, and every Plan finding is addressed.
Date: 2026-10-13
Backlog: #112, Phase 5 — #40, folding in #170
Builds on: `docs/superpowers/specs/2026-08-31-code-adherence-gate-design.md` (the code gate), `docs/specs/2026-10-07-figma-checks-as-scripts.md` and `docs/specs/2026-10-13-focus-ring-contrast.md` (the Figma checks machinery)

The owner asked for this to start with grill-to-spec (2026-10-13), under a
standing instruction for the session: "Take your recommendations when you have a
question. Only pull me in when there is an important P0 question." Every decision
below was made by Claude on that instruction, after measuring the real files. None
was put to the owner one by one, and any can be reopened. The two most worth the
owner's glance are the new command (product surface) and the stricter colour rule
left in Open questions.

## Goal

The code side has a gate that fails a screen built from things the system doesn't
have. The Figma side has nothing: a detached copy, a hardcoded token value, or an
unbound gap looks identical to the real thing and breaks at the next token change.
After this ships, one generated script walks a Figma screen and fails it, node by
node with a link to each, on three kinds of drift: a detached component, a colour
that a token has but that isn't bound to it, and a gap, padding or radius in the
same state. Colours and dimensions no token has are listed as advisories. The same
command also runs the component checks that need no spec (states, focus ring,
focus contrast) over a library's existing component sets, not only over a fresh
build (#170).

## Non-goals

- **Composing screens.** #42. This is the gate #42 will run before handing a screen over.
- **Hand-built lookalikes.** A frame drawn from scratch to look like a Button can't be
  told apart from layout by structure, and a name match is wrong on real files
  (Zygarden's `form` frame is a wrapper holding four `form` instances). Only
  *detached* copies are caught, by Figma's own marker.
- **Text without a style.** Measured at 0 on both files, so its false-positive rate
  is unknown. v2, after a file that has some (Open questions).
- **Library-consuming files.** Tokens are read from the file's local variables. A
  file whose variables all come from a published library has nothing to compare
  against, and the rules say so by failing as inert.
- **Code drift and screen drift over time.** #44 and #46.
- **Recording results in the proof bundle.** The code gate doesn't either
  (`references/proof-bundle.md:12`); one decision for both is an Open question.
- **Overrides as a category.** Changing text, size or a declared property on an
  instance is normal (measured below). Only an override that leaves a raw token
  value is drift, and the colour rule covers that.
- **Fixing anything.** The gate reports; it never edits the file.

## Decisions

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| Shape | A pure, import-free checker (`scripts/lib/figma-adherence.mjs`, unit-tested on fixtures) plus a Figma reader (`scripts/lib/figma-adherence-read.figma.js`), inlined into a generated `references/figma-adherence.md`. The existing generator (`scripts/build-figma-checks.mjs`) emits both generated files and gates both with `--check`. Variable resolution moves to one shared reader file (`scripts/lib/figma-variables-read.figma.js`) that both generated scripts inline. | The same split as the Figma checks: the rules are tested in Node, and the model pastes the script rather than rewriting it. One generator, and one copy of the variable code. | Prose rules re-derived each run; a second generator; two copies of alias resolution |
| What a screen is | Given a page name: each top-level FRAME, and each FRAME directly inside a top-level SECTION. Or a named list of those. A named screen not found throws with its name. | Names are stable across sessions; node ids aren't (`references/figma-scripting.md`). Both real files keep screens as top-level frames on a Templates page; sections are the other common wrapper. | Node ids; the whole file at once |
| Where the tokens come from | The live file's local variables, values resolved per mode | The manifest records collection names only, never values (`references/manifest-schema.md:207-225`). | DTCG files; the manifest |
| Rule 1, `detached-component` | Fail on any frame inside the screen whose `detachedInfo` is set. The detail names the component when it's local and on the loaded page, says "a local component on another page (id …)" when it's local but not loaded, and gives the key for a library one. | Figma's own marker, with no guessing. Measured: 8 on 01. Design System's `↳ Archtypes` page, all from one library component; 0 on either Templates page. | Name matching (measured false on Zygarden's `form`) |
| Rule 2, `raw-colour` | Fail on a visible SOLID fill or stroke, with no bound variable and no style, **whose colour equals a local colour variable's value in some mode**, naming the variable(s). This applies on any node outside an instance, and on an overridden node inside one. A raw colour no variable has is an **advisory**. | The code gate's Decision 3: a hex matching no token "may be an illustration, a one-off marketing surface, a third-party embed… a noisy gate gets switched off." That reason holds in Figma. Measured: Zygarden's 8 raw paints are text at `#e8e7e7`, which no token has, so they are advisories under this rule. Whether those 8 are drift or one-offs isn't something a measurement can settle; see Open questions. | Failing every raw colour (Open questions); ignoring overrides |
| Rule 3, `raw-dimension` | Fail on an unbound gap, padding side or corner radius whose value equals a FLOAT variable scoped for it (`GAP` for gap and padding, `CORNER_RADIUS` for radius, `ALL_SCOPES` for both), naming the variable(s). An off-scale value is an advisory. A gap renders only on a frame with `layoutMode` set and at least two visible children that aren't ABSOLUTE, and not when `primaryAxisAlignItems` is `SPACE_BETWEEN`; otherwise it's skipped. 0 is skipped, and so is the screen root's corner radius. | Decision 3 again. Measured on 01. Design System: 21 flagged, all on-scale; 27 skipped because the gap doesn't render. Scopes, not names, separate spacing from letter-spacing and opacity. Zygarden's screen roots carry radius 32 as a presentation frame. | Failing off-scale dimensions; matching variables by name |
| Rules that compared nothing | Fail by name: `nothing-scanned` (zero nodes read), `colour-rule-inert` (no local colour variables), `dimension-rule-inert` (no FLOAT variable scoped for gap, padding or radius). `skip` per rule, as in the code gate; a skipped rule also skips its inert check, and the result lists what was skipped. | Code gate Decision 7: every enabled rule must have had something to check. The first code-gate run passed having read nothing (`docs/superpowers/notes/2026-08-31-adherence-gate-e2e.md`). | A green result over nothing |
| Text with mixed paints | A text node whose `fills` is `figma.mixed` is recorded as an advisory, "mixed paints not read", and not as a pass | Iterating `figma.mixed` throws mid-run. Reading per-run segments is more code than v1 needs, and an advisory keeps the gap visible. | A crash; a silent pass |
| Report | Per failure and advisory: rule, `Page / Screen / … / Node` path, the value, the variable to bind when there is one, and `https://www.figma.com/design/<fileKey>?node-id=<id>`. Then counts per rule, and the rules skipped. | #40 asks for "a path a human can click to". | Ids alone |
| #170: existing component sets | The Figma checks script gains `MODE = 'existing'`: it finds the COMPONENT_SET whose name folds (`normalizeName`) to `EXPECT.name`, loading pages one at a time, and runs `state-baseline`, `focus-indicator` and `focus-contrast` against the set's own children. `structural-read-back` is skipped in this mode. | Structural compares against a spec matrix that an existing set doesn't have, and a deliberately sparse set fails it (0.23.0 CHANGELOG). The other three need no spec. `components.built` holds display names, so the match folds. | Hand-written matrices for every existing set |
| What #170 reaches today | States on every set. The focus ring and its contrast only on sets whose ring the focus check recognises. Zygarden's existing controls use INSIDE strokes (#169), so on that file `focus-indicator` fails and `focus-contrast` skips. The report says so rather than implying the ring was measured. | Measured 2026-10-13 (`docs/notes/2026-10-13-focus-ring-contrast-live-run.md`). | Claiming focus contrast runs on every existing set |
| Who runs it | A new command, `/throughline:check-figma`. It reads `design-system.json` (`figma.fileKey`, `project.uiFramework`, `components.built`), runs the active-file preflight, runs the screen gate on the page or screens the user names, and runs the existing-set checks over `components.built`. For focus contrast it asks the user which colour variables are the page surfaces, offering the file's likeliest default page surface; skipping is allowed, and the report says contrast was skipped. It reports and never edits. | The code gate runs from an npm script; a Figma gate needs an agent and the bridge. One command for "check what's already in Figma" covers #40 and #170, and #42 will call the screen gate directly. Surfaces are a design fact with no spec to copy from, so the user names them. | A new skill; folding into `design-system-audit`, which counts the inventory rather than gating it; the model guessing surfaces |
| Fails what | The command's result is pass or fail per screen and per set, listing every failure. Nothing records it yet, and nothing blocks except #42's future flow. | There is no build step to stop here. The gate exists so #42 has something to stop on. | — |

## Constraints the build follows

- **Plugin-internal files stay out of consumer repos.** `scripts/install.mjs`
  `PLUGIN_INTERNAL` gains `lib/figma-adherence.mjs`, `lib/figma-adherence-read.figma.js`
  and `lib/figma-variables-read.figma.js`, with `scripts/install.test.mjs` asserting
  each is skipped. `lib/fixtures/` is already excluded.
- **Never call `getNodeByIdAsync` in a loop over a large file.** On Zygarden it
  stalled the bridge. Find overridden nodes within their instance (`findOne` by id),
  or the instance itself when the override's id is the instance's own.
- **Load only the pages a run needs** (`page.loadAsync()`), never all pages. A
  whole-file walk on Zygarden (1,667 icon components) stalled the bridge.

## Facts this rests on

Measured read-only on 2026-10-13 through the bridge:

| | Zygarden, `Templates` (5 screens + `bg`) | 01. Design System, `↳ Templates` (9 frames) |
|---|---|---|
| Instances per screen | 8 | 2 to 6 |
| Detached frames | 0 | 0 here; **8 on `↳ Archtypes`** |
| Raw solid paints outside instances | 8, all text, all `#e8e7e7`, matching no token | 0 |
| Fill overrides inside instances | 29 unique: 17 bound, 12 set to no paint, 0 raw | — |
| Unbound gaps | 9: 16 and 24 on-scale, 72 and 200 off-scale | 48: **21 flagged** (on-scale, rendering), 27 not rendering, 0 off-scale |
| Raw radius | 32 on each screen root | 0 |
| Text without a style | 0 | 0 (58 local text styles) |
| Override fields seen | `characters`, `width`/`height`, `fills`, `fillStyleId`, `componentProperties`, `name`, sizing | `characters`, `width`/`height`, `componentProperties`, sizing |

- `detachedInfo` reads `{ type: 'library', componentKey }` on 01. Design System's
  detached frames.
- FLOAT variable scopes on 01. Design System: `GAP` 18, `CORNER_RADIUS` 8,
  `FONT_SIZE` 12, plus `WIDTH_HEIGHT`, `OPACITY`, `LETTER_SPACING` and others.
- The census didn't record how many of Zygarden's 29 fill overrides sit on the
  instance root itself. The reader handles that case either way (Constraints).

## Open questions

- **Failing every raw colour.** A stricter rule would fail Zygarden's 8 `#e8e7e7`
  text paints, where this one lists them as advisories. Typed Figma properties carry
  none of the code side's comment-and-mask noise, so the stricter rule's only risk
  is the one Decision 3 names: a deliberate one-off. Departing from a documented
  house rule is the owner's call. I'd recommend keeping Decision 3 until someone
  classifies a real file's raw colours as drift or one-off, then revisiting.
  Unresolved.
- **Text without a style (`unstyled-text`).** Fail a text node with neither a text
  style nor a bound font size. Measured 0 on both files. I'd recommend adding it
  once a file with unstyled text has been measured. Unresolved.
- **Instances of components that aren't the system's.** #40's first bullet wants
  every component to be "a published library component". An instance of a one-off
  component made on the screen's own page passes every rule here. I'd recommend a v2
  rule, measured first. Unresolved.
- **Recording results.** Neither adherence gate writes to the proof bundle. I'd
  recommend deciding both together when #42 gives the Figma gate a build to stop.
  Unresolved.
- **Library-consuming files.** Reading a library's variable values means importing
  them, which writes to the file. Wait for a real library-consuming user. Unresolved.

## What shipped

- `scripts/lib/figma-adherence.mjs` (+ test, 14 fixtures): `checkScreens`, `RULES`, and `dimensionBuckets`.
- `scripts/lib/figma-adherence-read.figma.js`: the screen reader, read-only, one page at a time.
- `scripts/lib/figma-variables-read.figma.js`: colour-variable resolution, moved out of the checks reader and shared by both.
- `scripts/lib/figma-checks.mjs` / `figma-checks-read.figma.js`: `checkExisting` and `MODE = 'existing'` (#170).
- `scripts/build-figma-checks.mjs`: emits and `--check`s both `references/figma-checks.md` and `references/figma-adherence.md`; a fake-Figma test runs the screen snippet end to end.
- `scripts/install.mjs`: the three new lib files stay plugin-internal.
- `commands/check-figma.md`, README, CHANGELOG (`### Added`), pointer test, adapters, `scripts/README.md`, `ci/README.md`.
- `docs/notes/2026-10-13-figma-adherence-live-run.md`.

## Where it diverged

- **`ALL_SCOPES` number variables are classified by name.** The live run on
  Zygarden, where every number variable is `ALL_SCOPES`, failed a 72 px gap as
  "bind text/7xl". An explicit scope still decides; an `ALL_SCOPES` variable counts
  as spacing or radius only when its name says so (`dimensionBuckets`). This
  replaces "scopes, not names" in Rule 3 for unscoped variables.
- **Raw rules don't run inside a detached frame** (`underDetached` in the snapshot).
  On `↳ Archtypes` they turned 8 detached frames into about 200 failures that one
  re-instancing fixes.
- **A page matches on its trimmed name** when exactly one does. 01. Design System's
  page names carry leading spaces.
- **The "no surfaces named" message** no longer says the architect names them,
  since `check-figma` asks the user.
- **The whole-branch review's fixes.** A paint's opacity now goes into its hex the
  way a translucent variable's does, so a 50% black matches a 50% black token and
  not the opaque one. Links use `TARGET.fileKey`, passed by the command from
  `design-system.json`, because `figma.fileKey` is only exposed to private plugins.
  `MODE = 'existing'` takes `EXPECT.page` so only the components page loads, and
  the command asks for it. The command handles wrapped controls by re-running a
  set with `controlLayer` when its ring sits on an inner layer. The snapshot's
  unused `screens` field was dropped, and the command reports one pass or fail for
  the page with failures grouped by screen.
- **Step 6 ran transcriptions for the narrowed screen gate**, not the regenerated
  file, and didn't re-run Zygarden's existing sets. The note says both.

## Plan

### Step 1 — the pure checker

Files: `scripts/lib/figma-adherence.mjs`, `scripts/lib/figma-adherence.test.mjs`, fixtures in `scripts/lib/fixtures/figma-adherence/`
Change: an import-free module (`export const`/`export function` only, as
`figma-checks.mjs`) exporting `RULES = ['detached-component', 'raw-colour', 'raw-dimension']`
and `checkScreens(snapshot, { skip = [] } = {})`.

SNAPSHOT, documented in the module header:
```
{
  fileKey,
  screens: [{ id, name }],
  nodes: [{
    id, path,                       // path: 'Page / Screen / … / Node'
    isRoot,                         // the screen frame itself
    inInstance,                     // true for an overridden node inside an INSTANCE (or the instance itself)
    overridden: ['fills' | 'strokes'],   // inInstance nodes only
    paints: [{ kind: 'fill' | 'stroke', hex: '#rrggbb', bound, styled }],   // visible SOLID paints only
    mixedPaints,                    // true when fills is figma.mixed (text with mixed runs)
    gap: { value, bound, renders } | null,
    padding: [{ side, value, bound }],
    radius: [{ corner, value, bound }],
    detached: { kind: 'local' | 'library', name, id, key } | null,
  }],
  tokens: {
    colours: { '#rrggbb': [variableName] },     // every mode's value
    gap: { '<number>': [variableName] },        // FLOAT scoped GAP or ALL_SCOPES
    radius: { '<number>': [variableName] },     // FLOAT scoped CORNER_RADIUS or ALL_SCOPES
  },
}
```
Rules:
- `detached-component`: `detached` set → fail. Detail: `detached from <name>`; for a local component with no name, `detached from a local component on another page (id <id>)`; for a library one, `detached from a library component (key <key>)`.
- `raw-colour`: on a node with `inInstance` false, every paint; on one with `inInstance` true, only paints whose field (`fills` for `fill`, `strokes` for `stroke`) is in `overridden`. A paint with neither `bound` nor `styled`: if `tokens.colours[hex]` exists → fail, `<kind> <hex>: bind <names joined ', '>`; else → advisory, `<kind> <hex>: no colour variable has this value`. `mixedPaints` → advisory, `mixed paints not read`.
- `raw-dimension` (`inInstance` false only): an unbound `gap` with `renders` true and value > 0; an unbound padding side > 0; an unbound radius corner > 0 unless `isRoot`. A value in `tokens.gap` (gap and padding) or `tokens.radius` (radius) → fail, `<gap|padding-<side>|radius-<corner>> <value>: bind <names>`; else → advisory, `off-scale <what> <value>`.
- Inert: `nodes` empty → `nothing-scanned`; `tokens.colours` empty → `colour-rule-inert`; `tokens.gap` and `tokens.radius` both empty → `dimension-rule-inert`. Each fails by name. A rule in `skip` runs nothing and its inert check doesn't fire; `nothing-scanned` can't be skipped.

RESULT: `{ pass, failures: [{ rule, id, path, detail, link }], advisories: [...same], counts: { [rule]: { checked, failed } }, skipped: [rule] }`, with `link` = `https://www.figma.com/design/<fileKey>?node-id=<id with ':' replaced by '-'>`. `pass` is false when any failure exists. Failures and advisories are sorted by path, then detail.

Fixtures, each `{ covers, snapshot, skip?, expected: { pass, failures: [rule, …], advisories: <count> } }`, values from the 2026-10-13 measurement:
- `zygarden-text-raw`: 8 text fills `#e8e7e7`, no token → pass, 8 advisories.
- `raw-colour-token`: an outside-instance fill `#ffffff` unbound where `tokens.colours['#ffffff']` exists → fail naming the variable.
- `override-raw`: an `inInstance` node with `overridden: ['fills']` and an unbound token-valued fill → fail. The same node without `fills` in `overridden` → not checked (a test asserts both).
- `zygarden-override-bound`: overridden fills that are bound → pass.
- `ds01-gaps`: a two-child gap 12 unbound with `tokens.gap['12']` → fail naming it; a one-child gap 8 (`renders: false`) → not counted.
- `padding-raw`: unbound `paddingLeft` 16 in `tokens.gap` → fail.
- `off-scale-gap`: gap 200, not in tokens → pass with an advisory.
- `root-radius`: root radius 32 in `tokens.radius` → skipped; the same on a non-root node → fail.
- `detached-library`: 01. Design System's `hud-*` shape → fail naming the key; plus a local-on-another-page case.
- `mixed-text`: `mixedPaints: true` → pass with one advisory.
- `inert-all`: no tokens → `colour-rule-inert` and `dimension-rule-inert`.
- `nothing-scanned`: no nodes.
- `skip-colour`: `skip: ['raw-colour']` with no colour tokens → no `raw-colour` and no `colour-rule-inert`; `skipped` lists it.
- `clean`: everything bound → pass, no advisories.

Prove the fail fixtures can fail: for each rule, invert its fail condition, watch its fixtures go red, then restore.
Verify: `node --test scripts/lib/figma-adherence.test.mjs` → all pass; a test asserts the module has no `import` line.

### Step 2 — the shared variable reader, and the screen reader

Files: `scripts/lib/figma-variables-read.figma.js` (new), `scripts/lib/figma-checks-read.figma.js`, `scripts/lib/figma-adherence-read.figma.js` (new)
Change:
- Move `colorHex`, `resolveColor` and `variableColors` from `figma-checks-read.figma.js`
  into `figma-variables-read.figma.js`, unchanged in behaviour, with a local
  `foldModeName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')` in place
  of `normalizeName` so the file depends on nothing. `figma-checks-read.figma.js`
  keeps calling them by the same names.
- `figma-adherence-read.figma.js`: `async function readScreens(TARGET)`, where
  `TARGET = { page, screens? }`. It finds the page by exact name, then
  `await page.loadAsync()`, and never loads other pages. Screens are top-level
  FRAMEs plus FRAMEs directly inside top-level SECTIONs; filtered to `screens` when
  given, throwing on a missing name. Walk depth-first, skipping `visible === false`
  nodes and their subtrees. For a non-instance node, emit a record (Step 1 shape):
  paints from `fills`/`strokes` when they're arrays (visible SOLID only; `bound` from
  `boundVariables.fills[i]`/`strokes[i]`, `styled` from a non-empty `fillStyleId`/`strokeStyleId`);
  `mixedPaints` when `fills === figma.mixed`; `gap` and `padding` only when
  `layoutMode` is set and not `NONE`, with `renders` per Rule 3; `radius` from
  `cornerRadius`, or the four corner fields when it's `figma.mixed`, bound from
  `boundVariables.topLeftRadius` etc.; `detached` from `detachedInfo` (for `local`,
  `name` is the name of the node with that `componentId` on the loaded page, found
  with `page.findOne`, else null). For an INSTANCE, don't descend. Read
  `instance.overrides`; for each entry whose `overriddenFields` includes `fills` or
  `strokes`, take the instance itself when the entry's id is the instance's id, else
  `instance.findOne(n => n.id === entry.id)`, and emit a paints-only record with
  `inInstance: true` and `overridden`. Tokens: local COLOR variables through
  `variableColors`, every non-null mode value into `colours`; local FLOAT variables,
  each mode value into `gap` when scoped `GAP` or `ALL_SCOPES` and into `radius`
  when scoped `CORNER_RADIUS` or `ALL_SCOPES`. Then
  `async function runScreenGate(TARGET, SKIP)` returns
  `checkScreens(await readScreens(TARGET), { skip: SKIP })`. Async getters only.
Verify: these files are untested in Node, like the existing reader. Step 3's
snippet test exercises the screen reader against a fake `figma`, and Step 6 runs
both live. `node --test scripts/lib/figma-checks.test.mjs` and
`node scripts/build-figma-checks.mjs --check` still pass after the move (after Step 3 regenerates).

### Step 3 — generate `references/figma-adherence.md`

Files: `scripts/build-figma-checks.mjs`, `scripts/build-figma-checks.test.mjs`, `references/figma-checks.md` and `references/figma-adherence.md` (generated), `scripts/README.md`, `ci/README.md`, `scripts/install.mjs`, `scripts/install.test.mjs`
Change: `buildFigmaChecks` inlines `figma-variables-read.figma.js` ahead of its
reader. A new `buildFigmaAdherence({ checkerSource, variablesSource, readerSource })`
inlines the adherence checker, the shared variable reader and the screen reader,
reusing `stripExports` and the import guard; it doesn't inline `contrast.mjs` or
`component-states.mjs`. Its header says how to call it: fill
`const TARGET = { page, screens }` and `const SKIP = []`, end with
`return await runScreenGate(TARGET, SKIP);`, pass `timeout: 30000`, and read the
result. The CLI writes both files; `--check` checks both and names whichever is
stale. `install.mjs` `PLUGIN_INTERNAL` gains the three new lib files, and
`install.test.mjs` asserts each is skipped. `scripts/README.md` and `ci/README.md`
list the new sources and the second generated file.
Tests: the adherence build inlines its three sources with no module syntax, refuses
an importing source, is deterministic, and the file on disk is in sync. The snippet
runs against a fake `figma` built in the test: `root.children` holding one PAGE
(`name`, `loadAsync()`, `children`, `findOne`) whose single FRAME screen has one
child RECTANGLE with an unbound SOLID fill `{ r: 1, g: 1, b: 1 }`; `variables`
with `getLocalVariablesAsync(type)` returning one COLOR variable whose only mode is
white for `'COLOR'` and `[]` for `'FLOAT'`, and `getVariableCollectionByIdAsync`
returning `{ modes: [{ modeId: 'm', name: 'Default' }], defaultModeId: 'm' }`;
`fileKey: 'TEST'`; `mixed: Symbol('mixed')`. Expected: one `raw-colour` failure
naming the variable, plus `dimension-rule-inert`.
Verify: `node scripts/build-figma-checks.mjs && node scripts/build-figma-checks.mjs --check`; `node --test scripts/build-figma-checks.test.mjs scripts/install.test.mjs`.

### Step 4 — existing component sets (#170)

Files: `scripts/lib/figma-checks.mjs`, `scripts/lib/figma-checks-read.figma.js`, `scripts/lib/figma-checks.test.mjs`, `scripts/build-figma-checks.mjs` (header), `references/figma-checks.md` (generated)
Change: the checker gains `checkExisting(snapshot, expect)`, returning
`state-baseline` (entries from the snapshot's children), `focus-indicator` and
`focus-contrast`, with no `structural-read-back`. `withTable` returns it beside
`checkSpec` and `checkBuilt`. The reader's `readComponentSet(expect)` splits into
`findWipSet(expect)` (today's lookup) and `readSet(set, expect)` (today's body).
A new `findExistingSet(name)` walks `figma.root.children`, calls `page.loadAsync()`
on each in turn, and returns the first `COMPONENT_SET` (via
`findAllWithCriteria({ types: ['COMPONENT_SET'] })`) whose name folds to the same
`normalizeName` as `name`. `runFigmaChecks` accepts `MODE = 'existing'` and throws
with the name when no set is found. The generated header documents the mode, says
`matrix` isn't needed, and says that a set whose ring the focus check doesn't
recognise (an INSIDE stroke, #169) fails `focus-indicator` and skips contrast.
Tests: `checkExisting` on `sample-button.real.json` returns exactly the three
checks; on `button-sparse` it passes `state-baseline` where `checkBuilt` fails
structural.
Verify: `node --test scripts/lib/figma-checks.test.mjs`; `node scripts/build-figma-checks.mjs --check`.

### Step 5 — the command, and the prose

Files: `commands/check-figma.md`, `README.md`, `CHANGELOG.md`, `ci/figma-checks-pointers.test.mjs`, adapters (generated)
Change: `commands/check-figma.md`, with a `description` and no `model`. Steps:
(1) read `design-system.json`; stop if `figma.fileKey` is absent. (2) Run the
active-file preflight in `references/figma-scripting.md` against that fileKey.
(3) Screens: unless given as arguments, ask which page, and optionally which
screens; run `references/figma-adherence.md` verbatim with `TARGET` filled.
(4) Existing sets: ask which colour variables are the page surfaces, offering the
file's likeliest default page surface, or let the user skip focus contrast. For
each name in `components.built`, run `references/figma-checks.md` with
`MODE = 'existing'`, `uiFramework` from `project.uiFramework` and those surfaces.
(5) Report pass or fail per screen and per set: every failure with its path and
link, advisories, counts, skipped rules, and whether focus contrast ran. Never edit
the file.
README: after the `/throughline:start` block (`README.md:105`), one short paragraph
naming `/throughline:check-figma` and what it checks. CHANGELOG `[Unreleased]` →
`### Added`, naming the three rules, the advisories, the existing-set mode, and what
it can't see (lookalikes, library-only files, INSIDE-stroke rings).
Pointer tests: `commands/check-figma.md` names `references/figma-adherence.md`,
`references/figma-checks.md` and `MODE = 'existing'`.
Run `node scripts/adapters/generate.mjs`.
Verify: `node --test` (bare, repo root) → all pass; every `--check` in `ci/README.md` passes; `node ci/validate-skills.mjs` reports 6 commands.

### Step 6 — measure on the real files

Files: `docs/notes/2026-10-13-figma-adherence-live-run.md`
Change: pin each file (`figma_navigate`, `lock: true`) and run the generated
snippets read-only.
- Screen gate: Zygarden `Templates`, and 01. Design System `↳ Templates` and
  `↳ Archtypes`. Expect: Zygarden passes with 8 `raw-colour` advisories (`#e8e7e7`),
  the 72 and 200 gap advisories, and on-scale gap failures; 01. Design System fails
  21 gaps on `↳ Templates` and 8 `detached-component` on `↳ Archtypes`.
- Existing sets: the sample's Button with `surfaces: ['color/bg/canvas']` (expect
  pass), and the same with `['color/bg/canvas', 'color/bg/muted']` as the
  discriminating control (expect `focus-contrast` fail at 2.99:1, as in the
  2026-10-13 focus run). Two Zygarden sets, to record what #169 leaves them.
- Compare every failure with the census and classify it as right or wrong. Any
  wrong failure gets a narrowed rule, never an advisory downgrade (code-gate spec
  §11). Record timings. Unpin after.
Verify: the note's counts match the tool output; nothing in either file changed (read-only).
