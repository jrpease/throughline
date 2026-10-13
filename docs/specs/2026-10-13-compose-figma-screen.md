# Compose a screen in Figma from library components

Status: planned
Reviewed: 2026-10-13 — needs revision (finalize/marker and WIP-collision gaps, variant picking in untested code, text-prop fonts, reviewer can't find a screen, sizing vocabulary, gate retry loop retried the unfixable, slot placeholders, late name collision, live-run honesty). Revised the same day after two more probes on the sample; every finding is addressed.
Date: 2026-10-13
Backlog: #112, Phase 5 — #42
Builds on: `docs/specs/2026-10-13-figma-adherence-gate.md` (the screen gate this runs before handing a screen over), `docs/specs/2026-10-07-figma-checks-as-scripts.md` (the generated-script machinery)

The owner asked for this to start with grill-to-spec (2026-10-13), under the
session's standing instruction: "Take your recommendations when you have a
question. Only pull me in when there is an important P0 question." Every decision
below was made by Claude on that instruction, after measuring the sample file and
Zygarden through the bridge. None was put to the owner one by one, and any can be
reopened. The ones most worth the owner's glance are the seventh command, and
keeping the screen description Figma-only rather than shared with code (#41).

## Goal

Throughline can build components and check screens, but nothing places a
component instance anywhere: `createInstance`, `setProperties` and slot filling
appear nowhere in the repo. After this ships, a user asks for a screen, the agent
plans it as a short description written only in the file's own names (component
sets, their properties, variables, text styles), and one generated, tested script
builds it from real instances with every value bound to a variable. The screen
gate from 0.25.0 runs on the result before it gets its real name. A screen that
needs something the system doesn't have is never drawn as a lookalike: the run
stops before writing anything and names the gap.

## Non-goals

- **Composing in code.** #41.
- **A screen description shared with code.** Figma property names
  (`state=Default`, `label#10:273`) are not code props, and the only mapping
  between the two is Code Connect, which the manifest records as optional and
  plan-gated (`references/manifest-schema.md:85`, `:304`). A shared description
  would rest on a mapping most files don't have. Open questions.
- **Aggregating gaps into a report.** #43. This run names its gaps; collecting them
  across runs is #43's.
- **Images, vectors, rectangles and groups.** Zygarden's screens use one
  rectangle each, as a background texture. A composer that draws shapes is drawing,
  not composing.
- **Components from a published library.** Only the file's local component sets,
  the same scope as the gate (whose tokens are local variables only).
- **Editing a screen in place.** A re-run rebuilds the screen from its
  description and replaces it. Patching one node is a separate feature.
- **Prototyping links, interactions, variable modes per node.** Modes are set
  once, on the screen root.

## Decisions

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| Shape | A pure, import-free resolver (`scripts/lib/figma-compose.mjs`, unit-tested on fixtures) plus a Figma reader/writer (`scripts/lib/figma-compose.figma.js`), inlined with `figma-variables-read.figma.js` and `figma-adherence.mjs` (for `dimensionBuckets`) into a generated `references/figma-compose.md`. The existing generator emits and `--check`s it. | The same split as both gates: the rules are tested in Node and the model pastes the script rather than writing plugin code. No code in the repo places an instance today, so this is the one place that will. | Prose instructions for the model to hand-write `figma_execute` calls; the architect/executor split |
| Input | A JSON screen description: `screen` (name), `page`, `width`, optional `height`, optional `modes` (`{ collectionName: modeName }`), and `root` (a frame). Nodes are exactly one of: **frame** — `layout` (required: `vertical` \| `horizontal`), optional `gap`, `padding` (a name, or `{ top, right, bottom, left }`), `fill`, `stroke` (a colour name; weight 1), `radius`, `align` (`{ main: start\|center\|end\|space-between, cross: start\|center\|end }`), `children`; **component** — `component` (set name), `props`, `slots: { slotName: [nodes] }`; **text** — `text`, `style` (required), `color` (required). Any non-root node takes `sizing: { horizontal, vertical }`, each `fill` \| `hug` (default `hug`). The root is fixed at `width`, and at `height` when given, else hugs. Every visual value is a variable or text-style name; the only raw numbers are `width` and `height`. | Measured on Zygarden's Templates: each screen is a fixed-width root holding auto-layout stacks of frames, 8 instances, and 1–2 text layers, every one styled. Frames, instances, styled text and slot content cover that, except the 1–2 background rectangles each screen also carries, which are a non-goal. Requiring `layout` on every frame means `fill` always has an auto-layout parent. | Raw values anywhere; absolute positioning; frames without auto layout; rectangles and vectors |
| Name matching | Component sets match by `normalizeName` fold. Property names match with the `#id` suffix dropped and case folded (`label` → `label#10:273`, `State` → `state`). Variant values match case-folded and are written with the set's own casing. An INSTANCE_SWAP value names a component; a SLOT value is a list of nodes. | Measured on the sample: property keys carry `#id` suffixes; one set says `state=Default`, another `State=Selected`. A model writing the description can't be expected to reproduce either. | Exact-match names; asking the model for node ids |
| Choosing the variant | The writer creates every instance from the set's `defaultVariant` and switches variant through `setProperties` with the variant props, then sets the rest. Nothing parses variant names. | Probed on the sample: `setProperties({ variant: 'secondary', size: 'lg' })` on a default Button instance switched it, and a swap given a component id set the icon. So the plan carries only real keys and values, all chosen by the tested resolver. | Variant picking in the untested `.figma.js` file |
| Resolve before writing | The resolver checks the whole description against an inventory read from the file (component sets with their property definitions, local variables tagged colour / gap / radius by `dimensionBuckets`, local text styles) and returns every error at once: unknown component (with the nearest names), unknown property or option, a variable of the wrong kind, an unknown text style. Any error means nothing is written. | A half-built screen is worse than none, and one round trip that lists every problem beats fixing them one at a time. Kinds reuse the gate's scope logic so the composer can't bind a value the gate would then flag. | Building until the first failure; binding a gap to `font/size/400` |
| Gaps | A component the inventory lacks is an error of kind `missing-component`, carrying what was asked for and the closest set names. The command reports it and asks the user how to proceed (drop it, use a named alternative, or stop). It never substitutes on its own and never draws a lookalike. | #43's premise: invention is the drift the gates exist to prevent. The record has the shape #43 will aggregate. | A placeholder frame; silent substitution |
| Slots | Supported. Slot content is a list of nodes appended to the instance's SLOT node, after its default children are removed. The inventory records each SLOT's layout; `sizing: fill` inside a slot without auto layout is an `invalid` error. | Measured: Zygarden's `SurfaceCard` and `modal` take their body through a SLOT property, so a card can't be filled without it. Probed on the sample: appending to an instance's SLOT and removing its placeholder both work, and the node stays an INSTANCE. A slot created with defaults has layout NONE, and `layoutSizingHorizontal = 'FILL'` inside it threw. | Cards and modals with only their placeholder; a runtime throw on fill |
| Where it's built | Into a top-level frame named `WIP: <screen>` on the named page, created if the page doesn't exist, placed to the right of the page's existing content. `build` writes the description into the WIP frame's shared plugin data (`throughline` / `composedScreen`) as it creates it. The root gets the description's `modes` via `setExplicitVariableModeForCollection`. A `WIP: <screen>` already on the page is replaced only when it carries the marker (a leftover from an earlier run); an unmarked one is a `name-taken` error. | The `WIP:` working-frame rule from `references/figma-scripting.md` ("Subagent authoring"). The gate's screen definition is a top-level frame, so the WIP frame can be gated before it's finalized. Writing the marker at build means finalize needs nothing but the name. | Building in place; building inside the user's existing frames; reusing a component build's `WIP:` frame |
| Gate | The command runs the screen gate (`references/figma-adherence.md`) on the WIP frame. Only a passing screen is finalized. A failing one stops the run: the command reports the gate's failures as a composer bug and leaves the WIP frame for inspection. It doesn't retry. | #42: "Run the Figma adherence gate before handing the screen over." The resolver already rejects every raw value, so no change to the description can turn a gate failure into a pass; the fix is in the writer or the gate. The loop that does retry is the resolver's: its errors are description errors, and the command fixes the description and builds again. | Handing over an ungated screen; retrying something a retry can't fix |
| Slot content and the gate | The gate's reader walks the children of each SLOT inside an instance that were added on the instance (their id doesn't start with `I`) as screen content (`inInstance: false`). A slot's own placeholder children (ids starting `I…;`) stay part of the component and aren't read. | The reader today reads only an instance's overrides (`figma-adherence-read.figma.js:172`). Probed on the sample: content appended to an instance's slot does **not** appear in `instance.overrides`, so the gate never sees composed slot content, nor a hand-filled card on a real file. In the same probe, an unfilled slot's placeholder had id `I439:1282;439:1281` and appended content had `439:1289`, so the two can be told apart without reading the main component. This widens a shipped gate, so 0.25.0's live counts are re-measured (Step 3). | A gate that can't see slot content; counting a component's placeholder as the screen's drift |
| Replacing | A top-level frame already named `<screen>` on the target page is replaced only when it carries the composed marker; the new screen takes its position. An unmarked one is a `name-taken` error from `build`, before anything is written, since `build` loads the target page anyway. `finalize` checks again (the file can change between calls) and on an unmarked collision throws and leaves the WIP frame in place. No stop ever removes the WIP frame; only `discard` does, when the user asks. | Build-verify-then-replace, without ever overwriting a screen a person made. Every error that can be known before writing is raised before writing, as with the resolver. `references/figma-scripting.md` (working-frame protocol, step 4) leaves the WIP frame on failure. | Overwriting by name; renaming around the collision; throwing away a built, gated screen for a fact known at the start |
| What the marker holds | The description JSON, in the composed screen's shared plugin data. | The replace rule needs a marker anyway, and holding the description lets a later run rebuild or change the screen without re-planning it. | A separate store of descriptions |
| Who plans | The command, in the session, from the inventory the script returns (`MODE = 'inventory'`). A `throughline:reviewer` in Figma-visual mode screenshots the finalized screen, by the node id `finalize` returns, against the user's request; `agents/reviewer.md` gains that screen case, since today it locates a finalized *component* via `figma_search_components`. | The architect/executor split exists because component builds are long, hand-written plugin code that a separate executor transcribes. Here the writing is a tested script, so the only judgment left is the plan, plus a visual check the gate can't make. The reviewer keeps that check out of the author's hands, and `figma_capture_screenshot`, already in its tools, takes a node id. | An architect agent (it can't run `figma_execute` to read property definitions); an executor agent for a one-call script |
| Script modes | One snippet with `MODE`: `'inventory'` (read only), `'build'` (resolve then write `WIP:`), `'finalize'` (replace-or-rename), `'discard'` (remove the WIP frame). | One generated file. Each step is a separate call, so the gate runs between build and finalize. | Separate snippets per step |
| Who runs it | A new command, `/throughline:compose-figma`. It reads `design-system.json` (`figma.fileKey`), runs the active-file preflight and pins the file, asks which page holds the component sets and which page the screen goes on, and runs `inventory`. If the inventory shows INSTANCE_SWAP properties the plan wants to use, it asks which page holds the swap targets and runs `inventory` again with it. Then it plans, builds, gates, finalizes, and reports. | Matches `/throughline:check-figma`, its gate. A seventh command, but composing is a user-facing act, not a step inside another skill. | Folding it into `component-builder`, which builds components, not screens |

## Constraints the build follows

- **Load only the pages a run needs** (`page.loadAsync()`): the components page,
  an icon page when a swap needs one, and the target page. A whole-file walk on
  Zygarden stalled the bridge.
- **Never read `instance.mainComponent`** in `dynamic-page` mode; it throws. Use
  `getMainComponentAsync` when needed.
- **Plugin-internal files stay out of consumer repos**: `PLUGIN_INTERNAL` in
  `scripts/install.mjs` gains the two new lib files.
- **Fonts**: load each text style's `fontName` before setting characters. Before
  setting an instance's TEXT properties (after its variant props, which can change
  the text layers), find each TEXT descendant whose
  `componentPropertyReferences.characters` is that property's key and load its
  font: `fontName`, or every font from `getRangeAllFontNames(0, characters.length)`
  when `fontName` is `figma.mixed`. The probe set a text property without loading
  the font, likely because Inter was already loaded that session; don't rely on it.
- **The ~30 s `figma_execute` cap** (`references/figma-scripting.md`): `build`
  reads the inventory and writes in one call. The live run records each call's
  time; the Button probe took 34 ms.
- **No top-level name clashes in the snippet**: `figma-compose.mjs` is inlined
  next to `figma-adherence.mjs` (`RULES`, `checkScreens`, `dimensionBuckets`, …)
  and the shared variable reader, so it reuses none of their top-level names.
  The fake-Figma test would catch a clash as a SyntaxError.

## Facts this rests on

Measured 2026-10-13, read-only except four probes on the sample that created and
removed temporary components and instances on the Cover page.

- Sample: 14 component sets on `Components`; 68 icon components on `Icons`; 147
  local variables in 7 collections, `Color / Semantic` with Dark and Light modes;
  10 text styles. No screens page exists.
- Property shapes on the sample: VARIANT, TEXT, BOOLEAN, INSTANCE_SWAP (Button
  and Badge icons, 68 preferred values each). Keys of non-variant properties carry
  a `#id` suffix. Variant property names are `state` on most sets and `State` /
  `Size` on `Select Menu*`.
- Zygarden: 27 component sets. Two have SLOT properties (`modal` → `Modal Body`,
  `SurfaceCard` → `Body`). Its 5 Templates screens are 390 wide, root layout
  NONE, holding auto-layout stacks (`VERTICAL gap24` → `gap16` → …), 8 instances,
  1–2 styled text layers, and 1–2 rectangles each.
- Slot probes on the sample: `createSlot()` on a component, then on an instance,
  `slot.children[0].remove()` and `slot.appendChild(frame)` both succeed, and the
  instance stays an INSTANCE. Appended content isn't listed in
  `instance.overrides`. Placeholder children have instance-sublayer ids
  (`I439:1282;439:1281`); appended ones don't (`439:1289`). A default slot has
  layout NONE, and setting `layoutSizingHorizontal = 'FILL'` inside it throws.
- Variant probe on the sample: a Button instance from `defaultVariant`
  (`variant=default, size=sm`) switched to `secondary, lg` by `setProperties`;
  `hasTrailing` and `trailingIcon` (given `icon/arrow-right`'s component id) set
  together. 34 ms with the Components, Cover and Icons pages loaded.
- The sample's 14 sets: Button, Input, Textarea, Select, Select Menu, Select Menu
  Item, Checkbox, Radio, Spinner, Tooltip, Avatar, Switch, Card, Badge. Card has
  only `variant` (default/elevated) and no slot, so it can't hold content.

## Open questions

- **One screen description for Figma and code.** The strongest version of #41 and
  #42 together, and the one #42's issue flags as likeliest to overreach. It needs a
  property mapping that exists only with Code Connect. Recommend #41's spec decides,
  with this description as the Figma half. Unresolved.
- **Keeping descriptions in the repo** (say `design-system/screens/*.json`) as
  well as on the screen. That would give #44 (drift for composed screens) a source
  to diff against. Recommend deciding with #44. Unresolved.
- **One command for both sides.** If #41 composes in code, `/throughline:compose`
  with a target might read better than two commands. Recommend revisiting when #41
  ships. Unresolved.
- **Icon pages too large to load.** Zygarden's icon page stalled the bridge on a
  full walk. An INSTANCE_SWAP to an icon there may need the property's preferred
  values instead of a page load. Measure if a live run hits it. Unresolved.

## Plan

### Step 1 — the pure resolver

Files: `scripts/lib/figma-compose.mjs`, `scripts/lib/figma-compose.test.mjs`, fixtures in `scripts/lib/fixtures/figma-compose/`
Change: an import-free module (`export const` / `export function` only) exporting
`resolveScreen(description, inventory)` → `{ ok, errors, plan }`.

INVENTORY, documented in the module header (the Step 2 reader produces it):
```
{
  sets: [{ name, id, page, props: [{ key: 'label#10:273', name: 'label', type: 'TEXT'|'BOOLEAN'|'VARIANT'|'INSTANCE_SWAP'|'SLOT', options?: [...], slotLayout?: 'NONE'|'VERTICAL'|'HORIZONTAL' }] }],
  components: [{ name, id, page }],      // standalone COMPONENTs, the swap targets
  variables: [{ name, id, kinds: ['colour'|'gap'|'radius'] }],
  textStyles: [{ name, id }],
  collections: [{ name, id, modes: [{ name, id }] }],
  target: { screen: 'marked'|'unmarked'|null, wip: 'marked'|'unmarked'|null } | null,
                                         // build only: what already holds the names on the target page
}
```
`resolveScreen` walks the description and returns every error, each
`{ kind, path, asked, nearest? }` where `path` is the node's place in the
description (`root.children[2].slots.Body[0]`). Kinds: `invalid` (shape: missing
`screen`, `page`, `width`, `root`; a node that isn't exactly one of
frame/component/text; a frame without `layout`; a text without `style` or
`color`; a `sizing` or `align` value outside the Input decision's vocabulary;
`sizing: fill` inside a slot whose `slotLayout` is `NONE`; a raw number where a
name belongs), `name-taken` (`inventory.target` says `<screen>` or
`WIP: <screen>` is held by an unmarked frame), `missing-component`,
`unknown-prop`, `unknown-option`, `prop-type` (a boolean given to a TEXT prop, etc.),
`missing-swap-target`, `unknown-variable`, `variable-kind` (a gap bound to a
variable without `gap`, a fill to one without `colour`), `unknown-text-style`,
`unknown-mode`. `nearest` is up to three names ranked by shared folded prefix,
then edit distance. Matching: sets and swap targets by `normalizeName`-style fold
(inline a local copy; the module stays import-free); prop names fold and drop the
`#…` suffix; variant values fold and resolve to the set's casing.
`plan` (only when `ok`) is the same tree with every name replaced by what Step 2
writes: `setId`, `variantProps` and `otherProps`, each keyed by real key with real
values (variant values in the set's casing; swap → component id), variable ids
per field, text style id, enum values already in Figma's spelling
(`layoutMode`, `primaryAxisAlignItems`, `counterAxisAlignItems`,
`layoutSizingHorizontal`/`Vertical` as `FILL`/`HUG`), and per-collection
`{ collectionId, modeId }`. Names in the module must not clash with
`figma-adherence.mjs` or `figma-variables-read.figma.js` top-level names.

Fixtures (one JSON each: `inventory`, `description`, `expected: { ok, errors: [kind] }`):
`sign-in-ok` (frame + text + Button/Input/Checkbox, swap icon), `slot-ok`,
`casing-and-suffix` (`State`, `label`, `DEFAULT`), `missing-component`,
`unknown-prop-and-option`, `wrong-kind` (gap bound to `font/size/400`, fill to
`space/4`), `raw-number` (`gap: 16`), `fill-in-unlaid-slot`, `name-taken`
(unmarked `<screen>`; a marked one is fine), `many-errors` (four at once, all
reported).
Verify: `node --test scripts/lib/figma-compose.test.mjs` → all pass; also break
each matching rule once by hand and confirm a test goes red, then restore.

### Step 2 — the Figma reader/writer

Files: `scripts/lib/figma-compose.figma.js`
Change: not a Node module. Takes `MODE` and `SPEC`:
- `'inventory'` — `SPEC = { componentsPage, iconsPage? }`. Loads only those pages;
  reads COMPONENT_SETs and standalone COMPONENTs with `findAllWithCriteria`;
  local variables tagged by kind (COLOR → `colour`; FLOAT → `dimensionBuckets`);
  local text styles; collections and modes. Returns the INVENTORY, plus a compact
  `summary` (sets with prop names and options) for the planner to read.
- `'build'` — `SPEC = { componentsPage, iconsPage?, description, fileKey }`. Reads
  the inventory, loads the target page if it exists and fills `inventory.target`,
  calls `resolveScreen`; on errors returns them and writes nothing. Otherwise
  creates the target page if absent, removes a marked `WIP: <screen>`, and builds a
  new one to the right of existing content, writing the description to its shared
  plugin data (`throughline` / `composedScreen`) first: frames with the plan's
  auto-layout settings and bound `itemSpacing`, padding and radius
  (`setBoundVariable`) and paints (`setBoundVariableForPaint`), stroke weight 1;
  instances via `set.defaultVariant.createInstance()`, then
  `setProperties(variantProps)`, then the Constraints' font loading for TEXT
  props, then `setProperties(otherProps)`; slot content appended to the
  instance's SLOT (found by `componentPropertyReferences.slotContentId` equal to
  the prop key) after removing its default children; sizing set after a node is
  appended to its parent; text with its style's font loaded, `characters`, then
  `setTextStyleIdAsync` and a bound fill. Applies `modes` on the root. Returns
  `{ wipId, wipName, link, ms }`.
- `'finalize'` — `SPEC = { page, screen, fileKey }`. Finds `WIP: <screen>` (exactly
  one; throws otherwise). If a top-level frame named `<screen>` exists: marked →
  take its x/y and remove it; unmarked → throw naming the collision, leaving the
  WIP frame. Renames. Returns `{ id, link, replaced }`.
- `'discard'` — `SPEC = { page, screen }`. Removes a marked `WIP: <screen>`; run
  only when the user asks.
Async APIs only; never `mainComponent`; never `getNodeByIdAsync` in a loop (ids
come from the inventory and are resolved through the loaded page).
Verify: exercised by Step 4's fake-Figma test and Step 6's live run.

### Step 3 — the gate reads slot content

Files: `scripts/lib/figma-adherence-read.figma.js`, `scripts/build-figma-checks.test.mjs`
Change: when the walk meets an INSTANCE, after `overriddenRecords`, find its SLOT
descendants (`findAllWithCriteria({ types: ['SLOT'] })`, keeping those whose
nearest INSTANCE ancestor is this instance) and walk each SLOT child whose id
doesn't start with `I` as an ordinary screen node (`inInstance: false`), with the
path running through the instance and slot names. Placeholder children (ids
starting `I`) are skipped. Instances inside slot content are handled by the same
rule, recursively. Also: one line in
`docs/specs/2026-10-13-figma-adherence-gate.md` "What shipped" pointing at this
spec for the widened reach.
Verify: two new fake-Figma cases in `build-figma-checks.test.mjs`: an instance
whose SLOT holds an added frame (plain id) with a raw gap 16 equal to a `GAP`
variable fails `raw-dimension` on that frame; the same with the frame's id starting
`I` (a placeholder) passes. Then live (Step 6), read-only: re-run the gate on
Zygarden `Templates`, 01. Design System `↳ Templates` and `↳ Archtypes`, and
compare with `docs/notes/2026-10-13-figma-adherence-live-run.md`. Each changed
failure must sit inside a slot and name added content. A change that doesn't, or
any failure on a placeholder, is a wrong result: narrow it before release, as
0.25.0's were.

### Step 4 — generate it

Files: `scripts/build-figma-checks.mjs`, `scripts/build-figma-checks.test.mjs`, `references/figma-compose.md` (generated), `scripts/install.mjs`, `scripts/install.test.mjs`
Change: `buildFigmaCompose({ adherenceSource, composeSource, variablesSource, writerSource })`
inlines `figma-adherence.mjs` (for `dimensionBuckets`), `figma-compose.mjs`,
`figma-variables-read.figma.js` and `figma-compose.figma.js` under a header that
says it's generated and how to call each `MODE`. Add it to `outputs` so bare runs
write it and `--check` gates it. `PLUGIN_INTERNAL` gains `lib/figma-compose.mjs`
and `lib/figma-compose.figma.js`, asserted skipped in `install.test.mjs`.
Tests: inlines its sources with no module syntax left; deterministic; on-disk copy
in sync; and a fake-Figma end-to-end: `build` on a page with a Button set and a
spacing and colour variable creates a marked `WIP:` frame holding an instance
whose `setProperties` calls were the variant props then the text prop, with a
bound gap and fill; `build` with an unknown component returns `missing-component`
and creates nothing; `build` with an unmarked `<screen>` on the page returns
`name-taken` and creates nothing; `finalize` replaces a marked frame, and on an
unmarked one throws and leaves the WIP frame.
Verify: `node --test scripts/build-figma-checks.test.mjs scripts/install.test.mjs` → pass; `node scripts/build-figma-checks.mjs --check` → three "in sync" lines.

### Step 5 — the command

Files: `commands/compose-figma.md`, `agents/reviewer.md`, regenerated adapters, `ci/figma-checks-pointers.test.mjs`, `README.md`, `scripts/README.md`, `ci/README.md`
Change: the command, in the shape of `commands/check-figma.md`: know the file
(`figma.fileKey`), confirm and pin it, ask for the components page and the target
page; run `MODE = 'inventory'`; if the plan wants an INSTANCE_SWAP value, ask
which page holds the swap targets and run `inventory` again with `iconsPage`;
plan the description from the user's request using only the inventory's names;
when the request needs a component the inventory lacks, say so and ask (drop,
alternative, stop) before building; run `'build'`; on resolver errors fix the
description and re-run; run the screen gate on `WIP: <screen>`; on failure stop,
report the failures as a composer bug, and leave the WIP frame; on pass run
`'finalize'`; dispatch `throughline:reviewer` (Figma-visual) with the screen's
node id and the user's request; unpin; report link, gate counts, the reviewer's
verdict, and any gaps. Never edits a component or a token. `agents/reviewer.md`
Figma-visual mode gains: when given a screen's node id, screenshot that node with
`figma_capture_screenshot` instead of locating a component. Then
`node scripts/adapters/generate.mjs`; a pointer test that the command names
`references/figma-compose.md` and `references/figma-adherence.md`; a README
paragraph after the check-figma one; `scripts/README.md` lists the two new lib
files and the generated `references/figma-compose.md` next to the adherence
entries; `ci/README.md` adds `figma-compose.md` to what
`build-figma-checks.mjs --check` gates.
Verify: `node --test` → all pass; `node ci/validate-plugin.mjs`, `node ci/validate-skills.mjs`, `node ci/validate-install-sets.mjs`, `node scripts/adapters/generate.mjs --check` → pass.

### Step 6 — live run

Files: `docs/notes/2026-10-13-compose-figma-live-run.md`
Change: run `references/figma-compose.md` verbatim (pasted with its slots filled;
if any call uses a trimmed copy, the note says which and why). On the sample, with
the file pinned: run `inventory`; compose a "Sign in" screen (390 wide,
`Color / Semantic` = Light) on a new `Screens` page from styled text, Input ×2,
Checkbox, and a Button with a trailing icon swap; gate it; finalize; screenshot.
Then: re-run to confirm a marked screen is replaced in place; draw an unmarked
frame named "Sign up", compose a "Sign up" screen, and confirm `build` returns
`name-taken` with nothing written; ask for a `DatePicker` and confirm
`missing-component` with nothing written. Once, dispatch a fresh agent to drive
`/throughline:compose-figma` end to end from `commands/compose-figma.md` for a
small second screen, and record whether it followed the command without help; if
this isn't done, the note says so. Record each `figma_execute` call's time. For slots, create a temporary `TMP Panel` component with a `Body` slot
on the sample's Cover page, compose a screen that fills it, confirm the gate sees
the slot content (Step 3), then remove the screen and the component. Step 3's
re-measure on Zygarden and 01. Design System is read-only. Leave the `Screens`
page and the "Sign in" screen on the sample as the reference result.
Verify: the note records each result and timing, the screenshot was looked at,
the `check-figma` gate passes on the finalized screen, and the note states plainly
what ran verbatim, what ran as a copy, and whether the command was agent-driven.

### Step 7 — release 0.26.0

Files: `package.json`, `.claude-plugin/plugin.json`, README install lines, `scripts/README.md` version line, `CHANGELOG.md`
Change: bump to 0.26.0; CHANGELOG intro and `### Added` in the owner's voice
(`write-like-jordan`), naming what the live run found, and a `### Changed` line
saying the screen gate now reads content added to slots, with any count change
the re-measure found.
Verify: the CI command list (`node --test` and the nine checks in `.github/workflows/ci.yml`) all pass.
