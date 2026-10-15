# Component drift

Status: built
Reviewed: 2026-10-15 — ready to build (second pass; its three notes applied)
Date: 2026-10-15
Issues: #46 (the case `docs/specs/2026-10-14-drift.md` left out: "a Figma component changed and its code counterpart did not")

## Goal

`/throughline:drift` reports composed screens, token output and Figma variables,
but not the components themselves. A designer can add a size to Button in Figma
and nothing notices that the code Button never got it. After this ships, drift
reports both halves of that, measured against the one thing both sides are meant
to follow, the component's doc record:

- **Figma against the record** (live, with the bridge open): a component set whose
  variant axes or options no longer match the record's `variants` and `states`, or
  a documented component whose set is gone from Figma.
- **Code against the record** (no Figma needed, so it runs in `drift:check` and
  CI): a component whose code was built against an older shape than the record's
  now. The code builder stamps the shape when it builds a component, and the check
  compares that stamp to the record.

Together they cover the chain a Figma change takes: Figma moves, the live check
names the axes and options the record is missing, `/document-component` folds
them in, and the code check then says the code is behind until it's rebuilt.
Neither half sees the other's side: the Figma half needs the bridge and a person,
and CI only ever sees the code half.

## Non-goals

- **Reading code props.** No parser for component declarations in any framework.
  The code half is a stamp: it says the code wasn't rebuilt since the record's
  shape moved, not that the code differs. The report says exactly that.
- **Non-variant Figma properties.** Text, boolean, instance-swap and slot
  properties (`label`, `hasLeading`, `leadingIcon`) aren't in the record's schema,
  so there's nothing to compare them to. Extending the schema is separate work.
- **Bound variables against `tokensUsed`.** The record's `tokensUsed` is curated,
  and a Figma set binds many more variables than it lists. Comparing them would be
  noise.
- **Changing what a screen's "stale" compares.** Screens keep `contractFingerprint`.
  Moving them to the new shape fingerprint would mark every recorded screen stale
  once, on upgrade. Worth its own issue if the noise shows up.
- **The Figma half of `docs:check`** (the description marker and the doc card's
  `Doc Fingerprint`). Still the separate gap the drift spec named.
- **Code Connect.** Nothing generates it, and this doesn't depend on it.
- **Fixing drift.** As before, the report names the command that fixes each thing.
- **Backfilling stamps automatically.** See the decision on unstamped components.

## Decisions

Jordan delegated these on 2026-10-14 ("take your recommendations when you have a
question; only pull me in for an important P0 question") and repeated it for this
item. Each row is Claude's call under that delegation, not a choice Jordan made in
conversation.

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| What each side is compared to | The doc record, separately for each side. Never Figma directly against code | The record is canonical by design (`references/component-doc-schema.md`: every surface is "a projection rendered from this file"). Each half then has one known fix, and neither needs the other open | A Figma↔code comparison, which needs a code-props reader per framework |
| What the code side fingerprints | A new `shapeFingerprint(record)` in `scripts/lib/doc-record.mjs`: the same `fingerprint(stableStringify(...))` over `{ name, variants: { <axis>: sorted option keys }, states: sorted keys, tokensUsed: sorted }`. Meanings (the strings under each option and state) are left out | `contractFingerprint` hashes the meaning text and the order of `tokensUsed`. `/document-component` re-infers both routinely (every sample record's `tokensUsed` is `ai-inferred`), so the code would go behind on every doc pass. Code implements the keys, not the prose. `tokensUsed` stays as a set: a token added or dropped is a code change, so a re-inference that changes membership puts the code behind, accepted. The drift spec ruled out a new hash over source or Figma structure, not a narrower projection of the same record | Reusing `contractFingerprint`; hashing component source |
| How the code side is judged | A stamp. `drift-check.mjs stamp-code --system <dir> --component <Name>…` writes `design-system/code-stamp.json`, shaped `{ components: { <built name>: { shape, at } } }`. `check` compares each stamp to the record's `shapeFingerprint` now: different is **behind** | No parser. Same "stamp at build, compare later" shape as the token stamp | Parsing props |
| Who stamps code | `storybook-chromatic-builder` Step 2, after it builds each component's code. Exit 3 there means the component has no doc record yet (a brownfield build ahead of its docs): the builder says so and carries on. Exit 2 is a real error: it stops and reports. `/throughline:drift` offers `stamp-code` for a behind component when the user says its code already matches, and runs it only on a yes (as it does `screens.mjs forget`) | The builder is where code is made from the record. A person who updated code by hand needs a way to say so. A build shouldn't stop over missing docs | Stamping from `/document-component`, which changes the record and not the code |
| `stamp-code` refusals | Writing nothing either way: exit 3 when a name has no doc record, exit 2 when a name isn't in `components.built` (folded match; stored under the built spelling) or on any usage or read error | A stamp without a record can't go behind, and a stamp for a component that doesn't exist is a typo. Its own exit code keeps the builder from reading a broken manifest as "no docs yet". All-or-nothing keeps a half-written stamp from looking complete | Stamping `null`; stamping the good names and failing the rest |
| Unstamped components | With no `code-stamp.json`, the report says so in one line ("No code stamp yet: storybook-chromatic-builder writes one as it builds each component") and lists nothing. With one, documented components with no stamp are listed on one line as **code not stamped**. A stamp for a component no longer built or documented is ignored. Exit 0 either way. No automatic backfill | Every system that upgrades has built code and no stamps. Listing all of it, or stamping it unseen, claims something nobody checked | A backfill that stamps every component as matching; failing on unstamped |
| What fails CI | Nothing new. Behind and not-stamped exit 0 | Behind means "wasn't rebuilt since", not "is wrong": hand-updated code is behind too. Same rule as a stale screen | Failing a build on a stamp |
| How Figma is read | A third, small snippet in `references/figma-drift.md`, `runDriftComponents(SPEC)`, `SPEC = { names, componentsPage? }`, from a new `scripts/lib/figma-drift-components.figma.js` with its own page lookup (no inlined modules). It returns `{ page, components: { <name as asked>: { axes: { <axis>: [options] } } \| null } }`, `null` when no set on the page folds to that name. Without `componentsPage` it uses the one page whose folded name is `components` and throws naming the pages when there's none or several | Small, because an agent carries it by hand (the drift live run's lesson; the screens snippet is 31 KB). One page, because loading every page stalled the bridge on a large file. Folding lets a decorated name like `    ↳ Components` match (01. Design System indents its page names that way; whether its components page is named so is unverified) | Reusing the screens snippet's inventory reader, which drags in the adherence and compose modules; whole-file loads |
| Where the page name comes from | The command passes the `componentsPage` of a Figma entry in `design-system/screens.json` when there is one, else omits it. When the snippet throws, the command asks the user for the page once | No manifest field holds it. The composers already recorded it | A new manifest field |
| How Figma is compared | In Node: `drift-check.mjs compare-components --system <dir> --from <live.json>`. A Figma axis that folds to `state` is compared to the record's `states` keys; the record's `states` are compared only when Figma has such an axis. Every other axis is compared to `variants[<axis>]` keys, both ways: an axis or option on one side only is reported. Names are compared folded (`composeFold`), as sets, and reported as the side that has them spells them. A `null` set is **gone from Figma** | Matches how component-builder lays out a set: a `state` axis beside the variant axes. Many records list states Figma doesn't draw as variants (a tooltip's `hidden`/`visible`, a badge's lone `default`); comparing them to an absent axis would be a standing finding nobody can fix in Figma. Variant axes have no such excuse | Treating `state` as one more variant axis; comparing option order; a built-in list of states to ignore |
| Which components the live check covers | Every `components.built` name that `contractOf` resolves to a record (folded lookup). `check --json` lists them under `components.documented`, and the rest under `components.undocumented`, so the command doesn't derive the list by hand. Undocumented components get one line, labelled **no doc record** | No record, nothing to compare to. A folded lookup matches how the rest of drift-check finds records | Asking for every set on the page; exact-key lookup |
| Exit of `compare-components` | 1 when any component differs or is gone, else 0 | Same as `compare-figma`: a live check that found something is a result | Exit 0 on a finding |
| Where it's surfaced | `/throughline:drift` gets a **Components** section: Figma differences (live) first, then code behind, then one line each for code not stamped and no doc record. Labels differ from the token section's `unstamped` and the screens' `untracked`, which mean other things. `drift:check` carries the code half. `/design-system-status`'s drift line adds the behind count. The fixes it names: run `/throughline:document-component <Name>` and fold in the axes and options the report names (or change Figma back); rebuild the component's code with `storybook-chromatic-builder` (which re-stamps), or `stamp-code` if the code already matches | One report. The chain reads in order: Figma, then record, then code. `/document-component` infers variants rather than copying Figma's, so the report has to name what to fold | A separate components command |
| Empty run | A code stamp counts as something checked, so `check` without `--allow-empty` passes on a system with only a code stamp | The rule is "a run that examined nothing fails" | — |

## Open questions

- **Rebuilding one component's code.** The fix text names `component-pipeline`
  Stage 3, which invokes `storybook-chromatic-builder` "for this one component".
  The live run didn't exercise it. Unresolved until a real rebuild runs.
- **Should screens move to `shapeFingerprint` too?** A reworded meaning marks a
  screen stale today. Recommendation: only if that noise shows up in use, since
  switching marks every recorded screen stale once. Unresolved.

## What shipped

- `scripts/lib/doc-record.mjs`: `shapeFingerprint`, tolerant of malformed blocks.
- `scripts/drift-check.mjs`: `documented`, `checkCode`, `compareComponents` (with
  renames), `formatComponentComparison`; `stamp-code` and `compare-components`
  modes; the code half in `check`, its `--json` (`code`, `components`) and counts.
- `scripts/lib/figma-drift-components.figma.js` and the third snippet in
  `references/figma-drift.md`; the generator, `install.mjs` exclusion and tests.
- `commands/drift.md`, `commands/design-system-status.md`, the builder's Step 2
  stamp; adapters regenerated.
- `README.md`, `scripts/README.md`, `ci/README.md`, `CHANGELOG.md`.
- `docs/notes/2026-10-15-component-drift-live-run.md`.

## Where it diverged

- **Renames.** Not in the design. The live run showed Radio (`selected`/`checked`)
  and Tooltip (`side`/`Placement`) as two unrelated axes, and the fix text would
  have had someone add both. A whole record axis and a whole Figma axis with the
  same options are now reported as `renamed`.
- **A record variant axis named `state`** is folded into the state comparison
  instead of being compared twice (whole-branch review).
- **Malformed records.** `shapeFingerprint` and the comparer treat a `null` or
  non-object block as absent; the first version threw, which `drift:check` would
  have reported as drift (whole-branch review).
- **No `scripts/README.md` row for the new reader.** Step 4 asked for one "like
  its siblings'", but none of the `.figma.js` readers has its own row; the
  generator's row names it instead.
- **The fix line** says "to bring the record in line" rather than "fold these
  in", which is wrong for a rename.
- **The command** now says behind exits 0 and how to report a "no stamp yet"
  line, both from the fresh agent's run.

## Plan

### Step 1 — The Figma reader and its snippet

Files: `scripts/lib/figma-drift-components.figma.js` (new),
`scripts/build-figma-checks.mjs`, `scripts/build-figma-checks.test.mjs`,
`references/figma-drift.md` (generated), `scripts/install.mjs`,
`scripts/install.test.mjs`
Change: Write the reader. A header like `figma-drift-screens.figma.js`'s, naming
the entry point and return shape from the Decisions table. A local fold
(`String(s).toLowerCase().replace(/[^a-z0-9]/g, '')`, the same as `composeFold`).
A page lookup: with `componentsPage`, the exact name, else the one page whose
trimmed name matches (as `composeFindPage`); without it, the one page whose folded
name is `components`. Throw naming the candidates when none or several match.
`await page.loadAsync()`, then `page.findAllWithCriteria({ types:
['COMPONENT_SET'] })`. For each asked name, the first set whose folded name
matches. Axes from `variantGroupProperties` (`{ <axis>: { values } }` → `{ <axis>:
values }`). When the getter throws (a conflicting set), collect each child's
`variantProperties` keys **and values**, unlike `groupProperties` in
`figma-checks-read.figma.js`, which keeps only the keys. Entry `async function
runDriftComponents(SPEC)`. In the generator, add the file as a third snippet in
`buildFigmaDrift`, bare (no inlined modules), under a `## The components snippet`
heading, and extend the header comment and the generated "How to call it" text
with its SPEC and the `compare-components` call. Add `'lib/figma-drift-components.figma.js'`
to `PLUGIN_INTERNAL` in `install.mjs` and an assertion for it in the
`skipScript` test. Add a generator test asserting the third snippet exists,
contains `runDriftComponents`, and contains none of `resolveScreen`,
`dimensionBuckets`, `composeReadInventory`.
Verify: `node scripts/build-figma-checks.mjs && node scripts/build-figma-checks.mjs --check && node --test scripts/build-figma-checks.test.mjs ci/figma-checks-pointers.test.mjs scripts/install.test.mjs` → all pass; `awk '/^## The components snippet/,0' references/figma-drift.md | wc -c` → under 4096.

### Step 2 — `shapeFingerprint` and `drift-check.mjs`

Files: `scripts/lib/doc-record.mjs`, `scripts/lib/doc-record.test.mjs`,
`scripts/drift-check.mjs`, `scripts/drift-check.test.mjs`
Change:
- `doc-record.mjs`: `export function shapeFingerprint(record)` per the Decisions
  table (absent `variants`/`states`/`tokensUsed` stay absent). Tests: unchanged by
  rewording an option's meaning, a state's meaning, or reordering `tokensUsed`;
  changed by adding an option, a state, or a token.
- `drift-check.mjs`:
  - `export const CODE_STAMP_FILE = 'design-system/code-stamp.json'`.
  - `export function documented(system, manifest)` → `{ documented, undocumented }`,
    sorted `components.built` names split by whether `contractOf` returns a
    non-null fingerprint. (A shape-returning sibling of `contractOf`, `shapeOf`,
    reads the same record for the stamp.)
  - `export function compareComponents(system, manifest, live)` → a sorted list,
    one entry per documented component with a difference: `{ name, gone: true }`
    when `live.components[name]` is `null` or absent, else `{ name, figmaOnly: {
    <axis>: [options] }, recordOnly: { <axis>: [options] } }`, per the Decisions
    table's rules. A whole axis on one side lists all its options.
  - `formatComponentComparison(result, checked)`: one block per component ending
    "run /throughline:document-component <Name> and fold these in, or change
    Figma back"; "Figma components match their doc records (N checked)." when
    empty.
  - `compare-components` mode: `--from`, `--json`, exit 1 on any finding, 2 when
    `--from` has no `components` object.
  - `stamp-code` mode: `--component` (multiple), all-or-nothing per the Decisions
    table (exit 3 no record, 2 not built), merged into `code-stamp.json` with `serialize`, `at` today.
  - `export function checkCode(system, manifest, stamp)` → `null` with no stamp,
    else `{ behind: [names], notStamped: [names] }` over documented components.
  - `check`: load the code stamp; `--json` gains `components: { documented,
    undocumented }` (always) and `code` (`checkCode`'s result); `counts` gains
    `behind` and `notStamped`; `formatReport` gains a `## Components (code)`
    section: "No code stamp yet: …" with no stamp, else one line per behind
    component ("code built against an older shape: rebuild it with
    storybook-chromatic-builder, or stamp-code if it already matches"), a "code
    not stamped:" line and a "no doc record:" line. The summary line names
    behind. A code stamp counts as checked for `empty`, and the "nothing checked"
    message names the code stamp too.
  - Header comment: the two new modes, the code stamp's shape, the exits.
- Tests: compareComponents on fixture records (a `state` axis against `states`,
  folded `Default`/`default`, a Figma-only option, a record-only variant axis, a
  record with `states` and no Figma state axis reporting nothing, a gone set,
  order ignored); stamp-code refusals writing nothing (exit 3 no record, 2 not built) and a merge; checkCode
  behind after an option is added, not after a meaning is reworded; not-stamped
  listed only when the stamp exists; a stamp for an unbuilt component ignored;
  empty-run exit with only a code stamp; compare-components and stamp-code exit
  codes through the CLI.
Verify: `node --test scripts/lib/doc-record.test.mjs scripts/drift-check.test.mjs` → all pass; `node --test` → all pass.

### Step 3 — The commands and the builder

Files: `commands/drift.md`, `commands/design-system-status.md`,
`skills/storybook-chromatic-builder/SKILL.md`, adapters (generated)
Change: In `drift.md`, extend the frontmatter `description` with components. In
step 3, add the components call: run `check --system <dir> --allow-empty --json`
a second time (step 2's human report stays as it is) and take `names` from its
`components.documented`; `SPEC = { names }`, plus `componentsPage` from a Figma
entry in `screens.json` when there is one; on a thrown page error ask the user for
the page once; write the result to a scratch file and run `compare-components`.
In step 4, a **Components** item between edited token output and Figma variables,
with both fixes (naming the axes and options to fold, and the per-component
`storybook-chromatic-builder` run as `component-pipeline` Stage 3 invokes it),
the stamp-code offer (yes only), and the not-stamped and no-doc-record lines with
the other one-liners. In `design-system-status.md`, add `behind` to the counts it
names. In the builder's Step 2, after each component's code is built: run `node
${CLAUDE_PLUGIN_ROOT}/scripts/drift-check.mjs stamp-code --system <dir> --component
<Name>`; exit 3 means no doc record yet, so say so and carry on; exit 2 is an
error, so stop and report it; commit
`design-system/code-stamp.json` with the code. Then `node
scripts/adapters/generate.mjs`.
Verify: `node scripts/adapters/generate.mjs --check && node ci/validate-skills.mjs && node ci/validate-plugin.mjs` → pass.

### Step 4 — Docs and release notes

Files: `scripts/README.md`, `ci/README.md`, `README.md`, `CHANGELOG.md`
Change: In `scripts/README.md`, the `drift-check.mjs` row lists `stamp-code`,
`compare-components` and `code-stamp.json`; the `build-figma-checks.mjs` row names
the third drift snippet and its source; add a row for
`lib/figma-drift-components.figma.js` like its siblings'. In `ci/README.md`, the
figma-drift sentence names three readers. The README's drift paragraph gains one
sentence on components. A CHANGELOG `Unreleased` entry, in Jordan's voice
(`write-like-jordan`).
Verify: `node ci/validate-install-sets.mjs && node ci/check-pinned-runs.mjs` → pass; `grep -c figma-drift-components scripts/README.md ci/README.md` → nonzero each; read by eye.

### Step 5 — Live run on the sample

Files: `docs/notes/2026-10-15-component-drift-live-run.md` (new)
Change: In a scratch copy of `~/Dev/throughline-sample` (the
`no-repo-has-a-consuming-app` recipe), with the sample Figma file. Expected first
run of `compare-components`, derived 2026-10-15 from the sample's 14 records and a
read of its Components page by these rules:

| Component | Expected |
|---|---|
| Button | state: Figma-only `Active` |
| Input | state: Figma-only `Hover`, `Active` |
| Switch | state: Figma-only `Hover`, `Active` |
| Select | variant axis `error` record-only; state: Figma-only `Hover`, `Active` |
| Textarea | variant axis `error` record-only; axis `size` Figma-only; state: Figma-only `Hover`, `Active` |
| Radio | axis `selected` record-only; axis `checked` Figma-only |
| Tooltip | axis `side` record-only; axis `Placement` Figma-only |
| Select Menu Item | axes `selected`, `disabled` record-only |
| Avatar, Badge, Card, Checkbox, Select Menu, Spinner | nothing |

Then `stamp-code` Button and Input: `check` shows them clean and the other twelve
code not stamped. Add a size to Input's record `variants`: Input is behind. Reword
a Button variant's meaning and reorder its `tokensUsed`: Button stays clean. Then a
fresh agent runs `/throughline:drift` from the command alone, and the note records
what it reported against this table. No writes to the Figma file or the real
sample repo.
Verify: the note's table has a reported column matching the expected column for
every row and planted change, or names each difference and its cause.
