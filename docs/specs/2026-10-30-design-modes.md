# Design modes: build in Figma with a system, a library, or nothing

Status: built (phase 1); phases 2–4 not yet planned
Reviewed: 2026-10-30 — Plan re-review: needs revision, narrowly (Step 1 test import, Step 0 stop rule, raw padding form, local values for valueIndex, token key names and colour form, reaching a library collection with no bound variable); Steps 6–12 executable as written. All six fixed the same day, not re-reviewed after.
Date: 2026-10-30
Builds on: `docs/specs/2026-10-13-compose-figma-screen.md`,
`docs/specs/2026-10-13-compose-code-screen.md`, `docs/specs/2026-10-14-gap-report.md`

The owner set the direction (2026-10-29): throughline becomes the all-in-one
plugin for building screens with agents, in Figma or in code, with a design
system or without one, in three modes. In the grilling session (2026-10-30)
the owner said to take Claude's recommendations on every question. So every row
under Decisions is Claude's recommendation, adopted on that instruction rather
than put to the owner one by one, and any of them can be reopened. The ones
most worth the owner's glance are what decides the mode (Q3), the raw values
mode b allows (Q9), the new `design/` folder (Q6), library-wins (Q7), and the
repositioning (Q22). The exceptions are Q14, which the owner decided directly
(2026-10-30), removing Mobbin and the measured canon from the plugin, and
Q23–Q25, which Claude proposed and the owner approved the same day.

The same day a critic review found five things to settle and several to clarify.
The owner asked for the spec to be revised; the answers, folded into Q3, Q5–Q7,
Q9, Q11, Q12, Q16 and Q18–Q22, are Claude's recommendations on that instruction,
not put to the owner one by one. The same holds for the re-review's fixes to Q3,
Q7, Q9, Q12, Q19 and Q21, and for the Plan review's amendment to Q8, where the
owner was offered the choice and left it to Claude ("i trust you, keep going").

## Goal

Today throughline only builds screens inside a throughline design system:
compose-figma needs `design-system.json` and reads only the open file's own
components, variables and text styles. After this ships, `/throughline:design`
takes a flow and builds it in Figma whatever the file has: a throughline system
(mode a), a library connected to the file and the file's own components and
variables filling the gaps (mode b), or nothing (mode c, frames built to auto-layout standards). The
same design method applies in every mode: intake, the hardest screen in two
directions, every state as its own frame, an organized file with prototype links, and annotations. Code gets the same
three modes last.

## Non-goals

- **Editing anything a person made.** No moving, renaming or deleting existing
  pages, sections, frames or components. Throughline touches only what it created.
- **Building or changing library components or variables.** In mode b the
  library is read-only, the same rule compose-figma has for the system.
- **Creating variables without being asked** in mode c.
- **Drift tracking outside mode a.** Modes b and c have no sync records to compare against.
- **Checking motion in Figma.** Motion becomes annotations, not something verified.
- **Mobbin, or any reference-gathering step.** No Mobbin calls, no References page.
  Mobbin belongs to claude-bootstrap's `product-design`, where it will become a core
  part of that skill.
- **The measured canon** (`product-design/canon.md`). Not copied into the plugin.
- **Annotations that come from doc records** (`whenToUse` and so on). Possible later; not in scope.

## Decisions

| # | Decision | Chose | Why | Rules out |
|---|---|---|---|---|
| Q1 | How many specs | One spec covering the mode model and the design method, built in phases (Q21). A phase may get its own spec when it's planned. | The modes and the method share one entry point and one detection step; splitting them now would split the decision record. | Separate specs written up front for each piece |
| Q2 | Entry point | New command `/throughline:design`, working at the flow level and running the method. compose-figma and compose-code stay the single-screen tools, gain modes, and are called once per frame. | Keeps today's commands working as they are and gives the method layer one home. | Growing compose-figma into a flow tool; a separate design plugin |
| Q3 | Choosing the mode | Detected automatically, and the **open Figma file** decides. Mode a only when `design-system.json`'s `figma.fileKey` is the open file. Otherwise mode b when the file has any of: an enabled library variable collection (`figma_get_library_variables` returns any), an instance whose main component is remote on the pages the run loads (Q5), or local variables or component sets of its own. A file with only local parts is mode b with an empty library side. Otherwise mode c. Two of the three signals depend on the pages the run loads, so detection is a function of the file and the pages named, not the file alone: library instances only on an unloaded page, in a file with no local variables or sets, read as mode c. A product file that uses a throughline system as a library is therefore mode b; when `design-system.json` exists, its gaps go to the system's gap file (Q20). Announced in one line with what the mode gives up. The user can force a lower mode, never a higher one. | The open file is what the agent builds in, and compose-figma's preflight already stops when the open file isn't the system file. Figma can list enabled variable libraries but not enabled component libraries, so a component-only library is visible only through its instances. Forcing up would claim guarantees the file can't back. | The repo alone deciding the mode; a mode-picker question at the start of every run; mode a guarantees in a consumer file (a follow-up if wanted) |
| Q4 | Figma or code first | Figma. Code-side modes ship last (Q21). | Code mode c overlaps claude-bootstrap's `product-design`, and the owner's stated case is Figma with a library. | Building both sides together |
| Q5 | Reading library components | Always: collect library components from instances already on the pages the run loads (the target page, plus any page the user names), never a whole-file walk; each instance points back to its library component by key, no token needed. Additionally, when the library's link is known and `FIGMA_ACCESS_TOKEN` is set: the full list from `figma_get_library_components`. Without a token, the run says which components it could and couldn't see. Library variables always come from `figma_get_library_variables` (no token). | Figma's plugin API can list library variables but not library components; the REST route needs the library's link and a token. Instances already in the file cover the common case for free. The compose-figma spec records a whole-file walk stalling the bridge, so the scan stays page-scoped. | Requiring a token for mode b; mode b covering variables only; scanning every page |
| Q6 | Where mode b keeps records | A `design/` folder in the working directory: `design/workspace.json` (file key, library links, last detected mode), `design/library-cache.json` (Q9) and `design/gaps.json` (same shape as `design-system/gaps.json`). claude-bootstrap's `product-design` also writes `design/precedent/` in a project; the two coexist on purpose, since both are design records for the same project and no file names collide. | Mode b has no `design-system.json` to hang records from, and `.throughline/` is the adapters' install directory, not state (gap-report spec). | Requiring `design-system.json` for mode b; storing state in `.throughline/` |
| Q7 | Same name in library and file | The library wins, judged against the library components the run can see (Q5). A local component is used only when no visible library component has that name; the report lists every local component used. When a library was detected (Q3) and there's no token, each local pick is flagged as possibly standing in for a library component the run couldn't see, and the report suggests giving the library's link. A file with no library gets no such flag. | Files often hold detached copies of library components under the same name, and the library is the source of truth. | Local-first; asking the user on every conflict |
| Q8 | Reusing the checker | The mode b reader returns the same inventory summary as `figma-compose-read.figma.js`; the resolver in `scripts/lib/figma-compose.mjs` keeps its name resolution unchanged. Its one change is Q9's raw-value path: only when the inventory says `allowRaw` (mode b), a value written `{ raw: … }` is accepted when no variable holds it, refused with the variable's name when one does, and listed in the plan. Library items are imported by key at build time. (Amended 2026-10-30 after the Plan review found phase 1 could not build Q9 otherwise; the owner left the choice to Claude.) | The checking logic (unknown names refused, nothing drawn to fake a missing component) is the part that makes compose-figma trustworthy, and it doesn't care where names came from. Without a raw-value path, mode b only works when variables cover every value, which Q9 rules out. | A second resolver for libraries; deferring Q9's allowance |
| Q9 | What the mode b check requires | A value is tied to a variable whenever a library or local variable holds that value. A raw value is allowed only when none matches, and each one is listed in the report. Library variable values come from `design/library-cache.json`: Figma's library listing gives names, keys and types but no values, so a separate "read the library" step imports the variables in batches of at most 20 calls per bridge script, records each one's value and kind, and is re-run when the library's collections change or the user asks. Because a value edited in the library changes no collection, each build also compares the variables it imports (the ones the plan names) against the cache; any difference refreshes those entries and the report says the cache was stale and suggests a full re-read. Every report prints the date of the last full read. Kind (spacing, radius, colour and so on) comes from the imported variable's scopes, falling back to its name. At build time only the variables the plan names are imported. | A library may not cover every value a screen needs; refusing would make mode b unusable on partial libraries. Importing every variable on every build would repeat the stall the compose-figma spec records at about twenty awaits. | The full mode a rule (no raw values at all) in mode b; importing the whole library on every build |
| Q10 | Mode c builder | The agent builds frames with `figma_execute`, following a new reference, `references/figma-frame-standards.md`, drawn from the auto-layout and naming sections of `figma-component-standards.md`. A generated structure check gates each screen, the way `figma-adherence.md` gates mode a. | "The script is the gate" is the house rule; prose standards without a check drift. | Mode c with no gate; reusing the mode a resolver (it resolves names that don't exist in mode c) |
| Q11 | Mode c "built properly" | Auto layout on every frame. An overlay is the one exception, and "deliberate" has one test: a child with `layoutPositioning: 'ABSOLUTE'` inside an auto-layout parent. A frame with no auto layout fails. Every layer named; spacing and radius from one consistent scale; colours from one small palette that gets reused. | These are the properties that make a hand-built file editable later and are checkable by a script. | Pixel-placed layouts; unnamed layers |
| Q12 | Variables in mode c | Never created on its own. The run ends with an offer: "N one-off colours and M spacing values. Turn them into variables?" Accepting creates local variables and binds the screen to them, which makes the next run mode b (the file now has variables). The same offer is made in mode b when the library side is empty, so later screens' one-off values get it too. The report then names `/throughline:start` as the way to turn them into a full throughline system. | Creating variables is a system decision. Only throughline's setup writes `design-system.json`, so the offer alone can't make a file mode a; naming the next step keeps that honest. | Making variables automatically; calling the offer itself a move into mode a |
| Q13 | Method steps | From product-design: an intake stop (flow, surfaces, hardest screen) and a two-direction comp on the hardest screen. The user drops one, and the dropped direction moves to an `Explorations` page, never deleted. | These are the parts that don't depend on code and that most improve the result. | Building the whole flow without an intake stop; deleting the dropped direction |
| Q14 | References | None in the plugin. No Mobbin, no measured canon, no References page. (Owner's decision, 2026-10-30.) | Mobbin is a premium tool, and both it and the canon predate Mobbin's MCP; the owner plans to make the Mobbin MCP a core part of `product-design` instead. | A Mobbin step, optional or not; shipping `canon.md`; a References page |
| Q15 | States | The hardest screen gets every state as its own frame: first-run empty, cleared empty, no-results, loading, error, dense, overflow. Other screens get only the states they really have. | Generated screens skip states, and the hardest screen is where they matter. | Happy-path-only screens; every state for every screen |
| Q16 | File organization | One `Flows` page, one section per flow. Screens run left to right with numbered names ("01 Sign in"), and their state frames sit in rows below them. Screens are joined by prototype links rather than drawn arrows. Placement is an input to compose-figma, not a move afterwards: its `build` and `finalize` take an optional `place = { section, x, y }`, `/throughline:design` computes each frame's place, and the frame is built there. Without `place`, compose-figma behaves as today. | Prototype links make the flow clickable and are real Figma data; connectors are FigJam-only. Building in place keeps one writer for every frame, and finalize already owns where a replaced screen lands. | Drawn arrows; one page per screen; `/design` moving frames after finalize |
| Q17 | Existing content | Never moved, renamed or deleted. Throughline creates and owns only its own sections and frames, through the existing `WIP:` and finalize convention. | A designer's file is theirs; the convention already exists and is tested. | Reorganizing the user's file |
| Q18 | Annotations | Five categories, created when missing (no MCP tool creates a category, so creation goes through a `figma_execute` script using the plugin API's annotation-category call; verify that call first in phase 2): Behaviour, State, Motion, Accessibility, Content. Every state frame gets a State annotation naming what causes it. Interactive elements whose behaviour isn't obvious get a Behaviour note. Motion is written as annotations. Annotations go only on nodes throughline made. | Annotations are how a static file tells a developer what it can't show; `figma_set_annotations` already supports categories and pinned properties. | Free-form sticky notes; annotating the user's nodes |
| Q19 | Checking the result | Each frame passes its mode's gate (a: adherence gate; b: adherence check with the Q9 allowance; c: structure check), plus the tell warnings (Q24). Then throughline's `reviewer` agent judges the screenshots with the rubric in Q25. Its Figma-visual preflight takes the file key from `design-system.json` only when that key is the open file (mode a); otherwise from `design/workspace.json`, else from the open file via `figma_get_status`. It no longer returns `BLOCKED` because `design-system.json` is absent or names a different file, as in the consumer-file case (Q3). | `reviewer` ships with the plugin; `design-critic` lives in claude-bootstrap and isn't available to public users. Today's preflight would block every mode b and c run. | Shipping frames without a gate; depending on a claude-bootstrap agent |
| Q20 | Records by mode | a: as today (screens recorded for drift, gaps in `design-system/gaps.json`). b: gaps in `design-system/gaps.json` when `design-system.json` exists (a consumer file of a throughline system, Q3), else `design/gaps.json`; no drift. c: none. `scripts/gap-report.mjs` and `/throughline:gap-report` choose the file the same way: `design-system/gaps.json` when `--system` holds `design-system.json`, else `design/gaps.json`. | Each mode records only what it can back. Gaps nobody can triage are pointless, and today gap-report hardcodes `design-system/gaps.json`. | Fake drift records in mode b; a mode b gap file nothing reads |
| Q21 | Phase order | 1. Mode detection plus mode b in compose-figma, including the library cache (Q9) and gap-report reading `design/gaps.json` (Q20), and the reviewer preflight (Q19), since compose-figma dispatches the reviewer on every run. 2. `/throughline:design` with file organization, states, annotations, the craft reference (Q23), the tell warnings (Q24), the reviewer rubric (Q25), placement (Q16), and the README repositioning (Q22). 3. Mode c. 4. Code-side modes. | Mode b is the owner's stated case; the method layer is what makes it more than compose-figma; code comes last (Q4). | Building everything in one release |
| Q22 | Positioning | The README reframes throughline as an agent design studio, with the design system as the deepest mode. (Amended 2026-10-30 by the owner: it landed in 0.32.1, right after phase 1, rather than waiting for phase 2. It describes only what's built and lists the rest of the modes and `/throughline:design` on the roadmap.) Copy follows `references/guide-voice.md`. Version goes up a minor step per phase. The website (radicool.studio/throughline) lives outside this repo; updating it is a note for the owner, not part of this spec. | The plugin's purpose changes; its own voice guide governs its copy. Shipping the README with phase 1 would pitch a method that doesn't exist yet. | Shipping the modes while still pitching only the design-system builder |
| Q23 | How the agent designs well without Mobbin | A new reference, `references/screen-craft.md`, read at intake and at build in every mode. It states general product-screen rules as rules, not as measurements: type on work screens stays quiet and hierarchy comes from weight, colour and position before size; density follows the task and holds across the screen; one small spacing scale; a small palette with the accent reserved for the primary action and current state, and status colour treated as functional; elevation means what sits above what, with no cards nested in cards; a flow is a few reused layout templates (list, detail, list plus detail, form, dashboard), and empty states live inside the template; chrome (header, sidebar, toolbar) is designed, not left at defaults; skeletons rather than spinners when the arriving layout is known; real content, never placeholders. It also carries product-design's twelve tells as the things to avoid. (Owner approved, 2026-10-30.) | Models handle the mechanics on their own but drift to the median screen, and the tells are exactly where they drift. In modes a and b the system supplies the look and the agent supplies composition; mode c has nothing to inherit, so this reference carries it. | Assuming the model designs well unaided; shipping the measured canon (Q14) |
| Q24 | Tell checks in the gates | Each mode's gate also reports the tells a script can see in a Figma file, as warnings: placeholder text ("Lorem", "Item 1", "John Doe"), more than one primary action on a screen, a card nested inside a card, a heading far larger than the body text on a work screen, and a missing state frame on the hardest screen (Q15). (Owner approved, 2026-10-30.) | Throughline's rule is that a rule holds only if something checks it; these are the tells that can be checked from node data. | Tells that live only in prose; checking taste a script can't see (those go to the reviewer) |
| Q25 | Reviewer rubric | The `reviewer` scores the screenshots against the intake (did it build what was asked) and against `screen-craft.md`, naming every visible tell. Any references the user pasted into the prompt are used too; the plugin has no step that gathers them. (Owner approved, 2026-10-30.) | Judging only against the intake checks completeness, not quality. | A reviewer that only checks the request was met |

## Open questions

- **Sharing the craft and states guidance with claude-bootstrap.** Q15's states and
  Q23's `screen-craft.md` come from `product-design`'s `states.md`, `craft.md`,
  `systems.md` and its list of tells, with the measured numbers and company examples
  stripped out. That makes throughline's version a derived copy.
  Options: (a) throughline owns the text and product-design points to it, though the
  plugin's install path carries a version number, so pointing at it is fragile;
  (b) two copies, plus a check in claude-bootstrap that flags drift; (c) two copies,
  accepting drift. Recommendation: (b). Unresolved.
- **Mode c's scale numbers.** Q11 requires one consistent spacing scale and one
  small palette, but not the values (a 4-point grid? how many colours count as
  "small"?). Recommendation: a 4px base with at most 8 spacing steps, and at most 12
  distinct colours per screen, in line with `screen-craft.md` (Q23) and enforced by
  the structure check. Unresolved; settle it when phase 3 is planned.
- **Thresholds for the tell warnings** (Q24): how much larger than body text a heading
  can be before it warns, and what counts as a "primary action" in modes b and c,
  where there's no throughline variant name to read. Recommendation: warn above 3×
  the body size on a work screen; in mode b, read a variant named primary or similar;
  in mode c, count fills in the accent colour on buttons. Unresolved; settle it when
  phase 2 is planned.
- **Finding library links without asking.** Q5 needs the library file's link for the
  full component list, and listing a team's libraries over REST needs a team id the
  plugin doesn't have. Recommendation: ask once per library and save the answer in
  `design/workspace.json`. Unresolved.
- **Code-side mode b detection** (phase 4): what counts as "a component library" in
  a codebase (shadcn's `components.json`, an installed UI package?). Recommendation:
  defer to phase 4's own spec. Unresolved.
- **Library text styles** (found while planning phase 1). Q8 and Q9 cover library
  components and variables, but the resolver refuses any text style that isn't local
  (`unknown-text-style`), and Figma's plugin API can't list a library's text styles
  either. The phase 1 live run made this urgent: Zygarden.gg has no local
  text styles at all, so a mode b screen there can hold only components. Options: (a) phase 1 uses local text styles only and says so in the mode
  line; (b) collect library text styles from text nodes already on the loaded pages
  (their `textStyleId` points at the imported style), the same way Q5 collects
  components. Recommendation: (b), deferred to a follow-up after phase 1 ships with
  (a). Unresolved.
- **The cost of reading instances** (found while planning phase 1). Detection (Q3) and
  the library inventory (Q5) need each instance's main component, which is one
  `getMainComponentAsync` await per instance; a busy page can hold hundreds. The
  compose-figma spec records a stall at about twenty sequential awaits.
  Recommendation: detection stops at the first remote instance; the inventory runs
  `Promise.all` in chunks of 20 and de-duplicates by main component key. Measure on a
  real file in Step 10 before relying on it. Measured in the phase 1 live run on a page of 151 instances: `signals` 10–26 ms,
  the inventory with the library 137 ms. Settled for pages that size; a much busier
  page is unmeasured.
- **The architect and figma-executor preflights** (found while planning phase 1).
  `agents/architect.md:16` and `agents/figma-executor.md:16` block on a missing
  `design-system.json` the same way the reviewer did. compose-figma doesn't dispatch
  either, so phase 1 leaves them; `/throughline:design` (phase 2) may. Recommendation:
  apply Q19's fallback to both in phase 2. Unresolved.

- **Repeated variable names across library collections** (found in the phase 1
  live run). Zygarden's library has `spacing/space/12` in both Spacing Primitives
  and Spacing Semantic, and `radius/pill` twice. The resolver binds the first match,
  so which one a plan gets depends on cache order, and the summary shows the name
  twice. Options: qualify library names with their collection (`Spacing Semantic /
  spacing/space/12`) when they repeat; prefer the semantic collection; or refuse an
  ambiguous name and list both. Recommendation: qualify only repeated names, and
  have the resolver refuse the bare name with both qualified names as nearest.
  Unresolved.
- **Variant combinations** (found in the phase 1 live run). The resolver checks each
  variant option on its own, so a combination the set doesn't have passes the plan
  and throws at `setProperties` (rolled back, nothing written). This is true in
  mode a too. Recommendation: have the reader record each set's existing variant
  combinations and the resolver refuse a missing one with the nearest. Unresolved.

## What shipped

Phase 1, on branch `feat/design-modes`:

- `scripts/lib/design-mode.mjs` (+ test): `detectMode`, inlined into the compose snippet.
- `scripts/lib/figma-compose-library.mjs` (+ test): `mergeLibraryInventory`, `libraryLocalPicks`.
- `scripts/lib/design-mode-read.figma.js`, `scripts/lib/library-read.figma.js`: the `signals`,
  `library-list` and `library-import` modes of `runCompose`.
- `scripts/lib/figma-compose.mjs`: the mode b `{ raw }` path and `raw-has-variable`.
- `scripts/lib/figma-compose-read.figma.js`: the library branch (`composeReadLibrary`), and
  `composeSetProps` / `composeSetAutoLayout` pulled out for both sides.
- `scripts/lib/figma-compose.figma.js`: library nodes into the live maps, imports by key
  for the rest, raw values written, `localPicks` / `raws` / `staleCache` returned.
- `scripts/lib/figma-adherence-read.figma.js`: `TARGET.libraryTokens`.
- `scripts/design-workspace.mjs` (+ test): `design/workspace.json`, `design/library-cache.json`, `cache missing`, `tokens`.
- `scripts/gap-report.mjs` (+ test): `gapFileFor`, `design/gaps.json`.
- `scripts/build-figma-checks.mjs` (+ test): four new sources, headers documented, five
  fake-Figma end-to-end cases; `references/figma-compose.md`, `figma-adherence.md` and
  `figma-drift.md` regenerated.
- `scripts/lib/figma-compose.test.mjs`: every pair of compose-snippet sources checked
  for a shared top-level name.
- `commands/compose-figma.md`, `commands/gap-report.md`, `agents/reviewer.md`,
  `references/figma-scripting.md`, and the three adapter copies of each command.
- `scripts/install.mjs` (+ test), `scripts/README.md`, `ci/README.md`, `README.md`,
  `CHANGELOG.md`, `package.json` and `.claude-plugin/plugin.json` at 0.32.0.
- `docs/notes/2026-10-30-design-modes-phase-1-live-run.md`.

Verified: `node --test` (1074 pass, 0 fail) and every gate in `.github/workflows/ci.yml`
exiting 0, on Node 22 locally (CI runs Node 24). Live in Zygarden.gg (the note):
detection, the library read, the inventory, a refused raw value, a rolled-back build,
a built and finalized mode b screen, and the gate with and without library tokens.

## Where it diverged

- **Component imports by key hung live; variable imports didn't.** Steps 4–5
  assumed sets and swap targets would be imported by key like variables. Live,
  `importComponentSetByKeyAsync` and `importComponentByKeyAsync` each ran past 6 s
  on the library button, its variant and an icon, with the file in front. Step 0
  had probed only variables. Changed in the build: a set or component reached
  through a library instance goes to the writer as it is (`live.libraryNodes`), and
  only `figma_get_library_components` results are imported by key. That path is
  unverified live (the MCP had no `FIGMA_ACCESS_TOKEN`), and the command says to
  re-run without `components` if it times out.
- **The drift screens snippet gained nothing.** Step 6 said to inline
  `figma-compose-library.mjs` there. The library code only runs with
  `spec.library`, which the drift snippet never passes, so a reference to it is
  never evaluated there; adding it was dead weight.
- **Step 4's fixtures folder wasn't created.** The library tests build their
  inventory in the test file from the existing `fixtures/figma-compose/inventory.json`.
- **Mode c stops.** Step 9 didn't say what a mode c detection does in phase 1; the
  command says mode c isn't built yet and stops.
- **The live run didn't follow the command to the letter.** The 66 KB snippet went
  over once and was kept on plugin globals, the cache was built in Figma with the
  same shapes rather than on disk, the reviewer wasn't dispatched (no screenshot was
  possible for a non-active connected file), and Runs 2 and 3 weren't run. Each is
  explained in the live-run note.
- **Step 11 renumbered.** The live run is Step 11 and the gates Step 12, as written;
  the run used `Throughline phase 1 test`, a new page in Zygarden.gg. It held one
  finalized screen and was deleted on 2026-10-30 at the owner's request.
- **A diff review before commit found three bugs, fixed the same day.** The build's
  stale-cache check compared values by key order, so any collection whose modes
  aren't alphabetical read as stale on every build; it now compares per mode. A
  cache left short by a timed-out import looked complete, so `{ raw }` values a
  missing variable holds would have passed; `cache init` now records each
  collection's listed keys, and `cache missing` names the ones never filled for
  re-import. `components` had no stated shape; it is now
  `[{ key, type }]`, reshaped from `figma_get_library_components`, and the reader
  refuses anything else. Smaller fixes: a variable whose collection can't be read
  is `skipped` rather than failing its whole chunk; the forced-to-c reason no
  longer says the file has no system; `workspace set` runs in mode b only, so mode
  a writes no `design/` (Q6, Q20); the components page is asked for and read in
  every mode, so a local-only file isn't misread as mode c; step 0 no longer runs
  the identity preflight before step 1 has picked the target; and the command's
  description names the library. A second review passed these, and `cache missing`
  then took `--from` a fresh list, so a variable the library added since `cache
  init` is caught too.

## Facts checked

Step 0, run 2026-10-30 on `Zygarden.gg` (`948SPugP1tqqLpLleHZOsU`), page
`↳ Registration` (151 instances, 210 nodes with bound fills), library `Zygarden
Design System`. The file was connected but not the active tab; every probe ran
with `figma_execute`'s `fileKey`.

- **Probe 1 passed.** `getMainComponentAsync()` on a library `button` instance gave
  `remote: true` and a `parent` of type `COMPONENT_SET` (`button`, key `a58cbedf…`).
  Its `componentPropertyDefinitions` keys (`icon left#44:0`, `icon right#44:17`,
  `type`, `state`, `size`) and `defaultVariant.key` were readable. Library icons
  (`li:plus`, `li:chevron-down`) are remote standalone components with
  `parent: null`, as Step 4 assumes.
- **Probe 2 passed, without importing.** A variable already used in the file (found
  through a node's `boundVariables.fills`), `color/bg/canvas`, is `remote: true` with
  `scopes: ['ALL_SCOPES']`, in collection `Color Semantic` (modes Dark, Light). Its
  value is a `VARIABLE_ALIAS`, which `getVariableByIdAsync` followed to
  `color/neutral/950` (remote) and a concrete RGBA. 132ms in all.
- **Listing works:** `getAvailableLibraryVariableCollectionsAsync` returned 10
  collections in 2ms; `getVariablesInLibraryCollectionAsync` returned `Color
  Semantic`'s 42 variables (names, keys, types; no values) in 262ms.
- **Importing works only with the file in front.** With Zygarden.gg behind another
  tab, `figma.variables.importVariableByKeyAsync` on one `Color Semantic` key timed
  out at 30s, twice. With Zygarden.gg in front, one import took 201ms, and a
  `Promise.all` of 20 took 396ms. 15 of those 20 were aliases, and
  `getVariableByIdAsync` resolved all 15. So chunks of 20 are comfortably inside
  the 30s snippet limit. The bridge's `isActive` flag still named the other file
  while Zygarden.gg was in front, so it can't be used to tell whether an import
  will hang. Importing adds invisible library-variable references to the file; no
  layers change.
- **What this changes in the Plan:** Step 9's "Read the library" step tells the
  user, before importing, that the file must be the tab in front. A `library-import`
  or build that times out is reported as "bring the file to the front and re-run",
  not as a composer bug. Nothing else moves; Steps 3–6 stand as written.

## Plan

Phase 1 only (Q21): mode detection, mode b in compose-figma with the library cache
and the raw-value allowance (Q8, Q9), gap-report reading `design/gaps.json`, and the
reviewer preflight. Not in phase 1: library text styles (screens use the file's own;
open question above), and Q12's variables offer in mode b, which ships with mode c's
offer in phase 3. Phases 2–4 get their own Plan sections when planned. Steps 3 and 4
build the "cost of reading instances" recommendation provisionally; Step 10 measures
it, and that open question is settled by the measurement, not by this Plan.

Conventions every step follows:
- **Tests:** `*.test.mjs` sits beside its module, using `node:test` and
  `node:assert/strict`. Fixtures go under `scripts/lib/fixtures/`.
- **No dependencies.**
- **Generated files:** anything under `references/` marked GENERATED is regenerated
  with `node scripts/build-figma-checks.mjs`, never edited by hand.
- **Inlined sources:** every source inlined into a snippet (`.figma.js` files, plus
  `design-mode.mjs` and `figma-compose-library.mjs`) has no `import` lines and may
  use top-level `export const` / `export function`, which `assertInlinable` strips
  (`scripts/build-figma-checks.mjs:281-290`). The two `.mjs` files therefore keep
  `export function`, like `figma-compose.mjs`, and their tests import them normally.
  None reuses a top-level name of anything it is inlined with (Step 6 extends the
  static test).
- **No hand-written JSON:** the agent never assembles JSON that a script reads. Every
  file a script consumes is either written by a script, or is a snippet's return
  value saved to a scratch file unchanged.
- **Snippet entry point:** every new Figma read is a `MODE` of `runCompose`, called
  with the same `return await runCompose(MODE, SPEC);` line.

### Step 0 — Check the two Figma assumptions first

Files: this spec (a `## Facts checked` section, added above `## Plan`)
Change: with Figma Desktop and the bridge running, open a file that has a library
enabled and at least one library instance. Run two `figma_execute` probes:
1. **Can a library instance's component set be read?** For a library instance,
   `const m = await inst.getMainComponentAsync()`. Then read `m.remote`,
   `m.parent && m.parent.type`, `m.parent.key`, the keys of
   `m.parent.componentPropertyDefinitions`, and `m.parent.defaultVariant &&
   m.parent.defaultVariant.key`.
2. **Can a library colour's references be followed?** For a library colour variable
   whose value is an alias (from `figma.teamLibrary.getVariablesInLibraryCollectionAsync`),
   `const v = await figma.variables.importVariableByKeyAsync(key)`. Then read the
   first mode's value, and if it is `{ type: 'VARIABLE_ALIAS', id }`, read
   `await figma.variables.getVariableByIdAsync(id)` and whether that resolves to a
   colour. Also read `(await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId)).modes`.

Record what each returned. **If probe 1 can't read the set's properties, stop:**
Q5's no-token path and Steps 3–6 depend on it, so amend the spec before going on
(build-spec's rule). Probe 2 is not a stop: it decides how Step 3 follows
references (`getVariableByIdAsync`, or importing the target by key). If neither
works, Step 3 records `null` values, which Step 2's cache shape already handles.
Verify: reviewed by eye. `## Facts checked` records both probes' raw output and the
file they ran on.

### Step 1 — Mode detection as a pure, inlinable function

Files: `scripts/lib/design-mode.mjs` (new), `scripts/lib/design-mode.test.mjs` (new)
Change: `export function detectMode(signals)`, with no `import` lines, because the
file is inlined into the compose snippet. The test imports it normally, as
`figma-compose.test.mjs:4` imports `figma-compose.mjs`.

Input: `{ manifestFileKey, openFileKey, libraryCollections, remoteInstances,
localVariables, localSets, forced }`. The keys are strings or null, the rest are
counts, and `forced` is `'b' | 'c' | null`. `openFileKey` always comes from
`figma_get_status`'s `currentFileKey`, never from `figma.fileKey`.

Output: `{ mode, libraryDetected, reason }`, by Q3:
- **Mode a** only when `manifestFileKey` is non-null and equals `openFileKey`.
- **Else mode b** when `libraryCollections + remoteInstances + localVariables +
  localSets > 0`.
- **Else mode c.**
- **`libraryDetected`** is `libraryCollections + remoteInstances > 0`.
- **`forced`** can lower the mode, never raise it. Forcing up returns the detected
  mode, with a reason saying why.
- **`reason`** is Q3's one-line announcement naming what the mode gives up. In mode
  b it also says text styles come from the file only.

Tests: each mode; the consumer-file case (keys differ, library present → b); a
local-only file (b, `libraryDetected: false`); a null `manifestFileKey`; forcing
down; forcing up refused; the text-style clause.
Verify: `node --test scripts/lib/design-mode.test.mjs` → all pass.

### Step 2 — The workspace and cache script

Files: `scripts/design-workspace.mjs` (new), `scripts/design-workspace.test.mjs` (new)
Change: one consumer-run script. Every subcommand takes `--dir <working directory>`.

Subcommands:
- **`workspace get`**, and **`workspace set --file-key <k> [--library <url>]...
  [--mode a|b|c]`**, read and write `design/workspace.json` (`{ fileKey, libraries:
  [url], mode, at }`).
- **`cache init --from <file>`** takes `runCompose('library-list')`'s saved output
  and writes a fresh `design/library-cache.json`, with `readAt` set to today and the
  collections filled in.
- **`cache merge --from <file>`** takes `runCompose('library-import')`'s saved output
  or a build's `staleCache`, all cache-shaped entries, and writes them in.
- **`cache get`** prints the cache.
- **`tokens`** prints `{ colours: { <hex>: [names] }, gap: { <n>: [names] }, radius:
  { <n>: [names] } }` from the cache, using the gate's own key names
  (`scripts/lib/figma-adherence.mjs:65`). Colours are hex across every mode, in
  `colorHex`'s lowercase `#rrggbb[aa]` form; aliases are already resolved at import
  (Step 3). This output is passed unchanged as
  `SPEC.library.tokens` (Step 4) and `TARGET.libraryTokens` (Step 6).

Cache shape: `{ readAt, libraries: { <name>: { collections: { <key>: { name, modes:
[{ id, name }] } }, variables: { <key>: { name, collection, resolvedType, kinds,
values: { <modeName>: <hex | number | null> } } } } } }`. A `null` value is a
reference that couldn't be followed: it can still be bound by name, but it never
matches a raw value, and `tokens` counts how many there are.

Files are written with sorted keys, two-space indent and a trailing newline (the
gap-report convention). A malformed input exits 1 with a message. `get` or `tokens`
on a missing file prints `null` and exits 0.
Verify: `node --test scripts/design-workspace.test.mjs` → all pass. Covers a round
trip of each file, init then merge then tokens, a merge that changes one value, an
unresolved reference counted, and malformed input.

### Step 3 — Signals and library reads in Figma

Files: `scripts/lib/design-mode-read.figma.js` (new),
`scripts/lib/library-read.figma.js` (new), `scripts/lib/figma-compose.figma.js`
(`runCompose` only)
Change: `runCompose` gains three modes, all read-only:
- **`'signals'`, `SPEC = { pages, manifestFileKey, openFileKey, forced }`.**
  - Count enabled library variable collections
    (`figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync`).
  - On each page in `pages`, after `loadAsync`, walk `INSTANCE` nodes and stop at the
    first whose `getMainComponentAsync()` result has `remote === true`.
  - Count local variables and local `COMPONENT_SET`s.
  - Call `detectMode`.
  - Return `{ signals, mode, libraryDetected, reason }`.
- **`'library-list'`, `SPEC = {}`.** Returns each enabled collection as `{ library,
  key, name }`, with its variables as `{ key, name, resolvedType }`.
- **`'library-import'`, `SPEC = { keys }`.** Takes at most 20 keys; more throws.
  Imports each key with `figma.variables.importVariableByKeyAsync`. Each result
  becomes a cache-shaped entry:
  - **values:** taken per mode name, from the collection's modes via
    `getVariableCollectionByIdAsync`. A `VARIABLE_ALIAS` is followed through
    `getVariableByIdAsync` until it reaches a concrete value, or is set to `null`
    when the reference can't be followed, using whatever Step 0 established.
  - **kinds:** COLOR gives `['colour']`; FLOAT kinds come from `dimensionBuckets`
    over the imported variable's `scopes`.
  - **collection:** the entry also carries its collection's `{ key, name, modes }`.

  The agent saves each chunk's return unchanged and runs `cache merge` on it.

The `throw` for an unknown `MODE` lists all seven modes.
Verify: Step 6's fake-Figma cases for `'signals'` (stops at the first remote
instance; correct counts; mode a only on matching keys), `'library-list'`, and
`'library-import'` (21 keys throws; an alias resolves; an unresolvable alias gives
`null`).

### Step 4 — The library side of the inventory, and raw values in mode b

Files: `scripts/lib/figma-compose-library.mjs` (new, inlined only),
`scripts/lib/figma-compose-library.test.mjs` (new), `scripts/lib/figma-compose.mjs`,
`scripts/lib/figma-compose.test.mjs`, `scripts/lib/figma-compose-read.figma.js`,
`scripts/lib/fixtures/figma-compose-library/` (new)
Change:
- **`figma-compose-library.mjs`** defines `mergeLibraryInventory(local, library)`. It
  returns the resolver's inventory shape (`sets`, `components`, `variables`,
  `textStyles`, `collections`, `target`), plus `allowRaw: true` and `valueIndex`
  (`library.tokens` merged with the local variables' values, same shape).
  - **Library ids** have the form `lib:<key>`.
  - **Name clashes:** the library entry wins on a folded-name collision (Q7, using
    `composeFold`).
  - **Library collections** come from the cache, with their modes.
  - **Library variables** come from the cache, with their `kinds`.
  - **Text styles** stay local.
- **The reader** gains an optional `spec.library = { pages, components, cache,
  tokens }`. Without it, the reader is unchanged. With it, the reader:
  - collects the distinct main components of remote instances on `spec.library.pages`
    (chunks of 20 via `Promise.all`, de-duplicated by key). A main component inside a
    `COMPONENT_SET` contributes that set (name, key, `componentPropertyDefinitions`,
    `autoLayout`); a standalone one contributes to `components` (swap targets);
  - adds `spec.library.components`, the REST results the agent passes unchanged from
    `figma_get_library_components`;
  - reads local variable values for `valueIndex` with `variableColors` /
    `variableNumbers`, inside the `spec.library` branch only. The drift screens
    snippet doesn't inline `figma-variables-read.figma.js` and never passes
    `spec.library`;
  - calls `mergeLibraryInventory`.

  A missing `componentsPage` is allowed when `spec.library` is present (the local
  side is then empty).
- **The resolver** (`figma-compose.mjs`) changes only in `variable()` and the
  dimension readers it feeds, and only when `inv.allowRaw` is true. A value written
  as `{ raw: '#1A2B3C' }` (colour) or `{ raw: 12 }` (gap, radius, or one padding
  side) is checked against `inv.valueIndex`. Raw colours are folded to `colorHex`'s
  lowercase form before lookup. Padding stays per side
  (`padding: { top: { raw: 12 }, … }`), because the parser at
  `figma-compose.mjs:196-206` reads any object under `padding` as sides; a bare
  `padding: { raw: 12 }` is an `invalid` error.
  - **A variable holds that value:** a new error kind, `raw-has-variable`, that
    names the variable(s) (added to `COMPOSE_ERROR_KINDS`).
  - **No variable holds it:** the plan carries `{ raw }`, and the plan's new `raws`
    list records `{ path, kind, value }`.
  - **Without `allowRaw`** (mode a), `{ raw }` stays an `invalid` error, as any
    non-string does today.

  This is Q8's one change (see Q8).
Verify: `node --test scripts/lib/figma-compose-library.test.mjs scripts/lib/figma-compose.test.mjs`
→ all pass. New cases: library-wins; a local set kept; a library icon landing in
swap targets; a library collection's mode resolving; `{ raw }` refused in mode a,
refused with `raw-has-variable` when a variable holds the value, and accepted and
listed when none does. Every existing fixture still passes unchanged.
Expected red until Step 6: `build-figma-checks.test.mjs` (around lines 210 and
508), because `references/` isn't regenerated yet.

### Step 5 — Import library items, and write raw values, at build time

Files: `scripts/lib/figma-compose.figma.js`
Change: in `composeBuild`, after `resolveScreen` and before `composeFontsFor`:
- **Imports.** Collect every `lib:` id in the plan and import in chunks of 20:
  - sets: `figma.importComponentSetByKeyAsync`;
  - swap targets: `figma.importComponentByKeyAsync`;
  - variables: `figma.variables.importVariableByKeyAsync`;
  - collections: `figma.variables.getVariableCollectionByIdAsync` on an imported
    variable's `variableCollectionId`. When the plan sets a library collection's
    mode but binds none of its variables, import one variable of that collection
    (its key is in the cache) to reach it.

  Put each imported node into `live.setNodes`, `live.variableNodes` or
  `live.collectionNodes` under its `lib:` id. For swap targets, rewrite the `lib:`
  value in `plan.otherProps` to the imported component's node id before
  `setProperties` (line 141).
- **Raw values.** Where the plan carries `{ raw }`, the writer sets the plain value
  instead of binding a variable: a solid paint for a colour, a number for
  gap/padding/radius (the binding sites at lines 58–60, 76–85, 130).
- **Return value.** The build result also returns:
  - `localPicks`: the names of local sets and components the plan used (ids without
    `lib:`), as Q7 requires;
  - `raws`: from the plan;
  - `staleCache`: cache-shaped entries with fresh values, for every imported
    variable whose values differ from `spec.library.cache` (Q9).
- **Failure.** An import failure is a build error and writes nothing.
Verify: Step 6's fake-Figma cases.

### Step 6 — Mode b in the gate, the generator, and every test that covers them

Files: `scripts/lib/figma-adherence-read.figma.js`, `scripts/build-figma-checks.mjs`,
`scripts/build-figma-checks.test.mjs`, `scripts/lib/figma-compose.test.mjs` (the
no-clash test), `references/figma-scripting.md`, then regenerate
`references/figma-compose.md`, `references/figma-adherence.md`, `references/figma-drift.md`
Change:
- **Gate.** `readTokens` merges `TARGET.libraryTokens` (the `tokens` output from
  Step 2) into its tables. A raw value a library variable holds fails; a value none
  holds stays a listed advisory, as today (Q9). With library tokens present,
  `colour-rule-inert` and `dimension-rule-inert` count them.
- **Generator.**
  - `buildFigmaCompose` inlines `design-mode.mjs`, `figma-compose-library.mjs`,
    `design-mode-read.figma.js` and `library-read.figma.js` with the existing
    sources.
  - `buildFigmaDrift` adds only `figma-compose-library.mjs`, since the screens
    snippet calls the reader.
  - Add all four to `assertInlinable`, to `COMPOSE_HEADER`'s and `DRIFT_HEADER`'s
    source lists, and to the file's top comment.
  - In `COMPOSE_HEADER`'s "How to call it", document the three new modes,
    `SPEC.library`, `{ raw }` values and the `raw-has-variable` error. In
    `ADHERENCE_HEADER`, document `TARGET.libraryTokens`.
- **Preflight reference.** In `references/figma-scripting.md` step 1 (lines 54–56),
  replace "If that field is absent, stop and ask" with Q19's chain:
  `design-system.json`'s key when it is the open file, else `design/workspace.json`,
  else the open file from `figma_get_status`.
- **No-clash test.** Extend it to every pair of sources inlined into the compose
  snippet and the drift screens snippet.
- **Fake Figma.** Extend `build-figma-checks.test.mjs`'s fake with `teamLibrary`,
  remote instances (with and without a parent set), the import calls, aliases and
  library collections. Add end-to-end cases:
  - Step 3's three modes, with the cases listed there;
  - a mode b build that resolves a library set, binds a library variable, sets a
    library collection's mode, uses a library icon as a swap target, writes a raw
    value, and returns `localPicks`, `raws` and `staleCache`;
  - a gate failing a raw colour a library variable holds;
  - a gate listing an unmatched raw value as an advisory.

Then run the generator.
Verify: `node scripts/build-figma-checks.mjs && node scripts/build-figma-checks.mjs --check`
→ no drift; `node --test scripts/build-figma-checks.test.mjs scripts/lib/figma-compose.test.mjs`
→ all pass, including the cases red since Step 4.

### Step 7 — gap-report finds the right file

Files: `scripts/gap-report.mjs`, `scripts/gap-report.test.mjs`, `commands/gap-report.md`
Change:
- **`gapFileFor`.** Replace the join at line 141 with `gapFileFor(systemDir)`, which
  returns `design-system/gaps.json` when `<systemDir>/design-system.json` exists,
  else `design/gaps.json` (Q20).
- **Messages.** Keep exporting `GAP_FILE`. Messages at lines 173 and 180 name the
  file actually used.
- **Existing tests.** The CLI cases (lines 105–133) write a `design-system.json`
  into their tmp dir so they keep testing the mode a path, and the malformed-store
  case does the same. Add cases for a directory without a manifest, writing,
  reporting and triaging `design/gaps.json`.
- **The command.** In `commands/gap-report.md` step 1, accept a directory holding
  `design-system.json` or a `design/` folder. Stop only when neither exists.
Verify: `node --test scripts/gap-report.test.mjs` → all pass.

### Step 8 — The reviewer preflight

Files: `agents/reviewer.md`
Change: rewrite the Figma-visual preflight sentence (line 29) to Q19's chain:
- use `design-system.json`'s `figma.fileKey` only when it equals `currentFileKey`;
- otherwise use `design/workspace.json`'s `fileKey`, read from the working directory
  the dispatcher passes;
- else accept `currentFileKey`.

Return `BLOCKED` only when a key from the dispatcher or from `design/workspace.json`
doesn't match the open file. Keep the phrase "active-file preflight".
Verify: `node --test ci/figma-preflight.test.mjs` → pass.

### Step 9 — compose-figma learns the modes

Files: `commands/compose-figma.md`, then `node scripts/adapters/generate.mjs`
(rewrites the three adapter copies under `adapters/`)
Change:
- **New first step, "Know the mode."** Get `currentFileKey` from `figma_get_status`,
  and `design-system.json`'s `figma.fileKey` if the file exists. Run
  `runCompose('signals')` on the target page plus any page the user named, with
  `forced` set when the user asked to ignore the library or the system ("ignore the
  library" → `'c'`, "ignore the system" → `'b'`). Announce `reason`.
- **Step 1, the file key.** Take it per Q19's chain and record it with
  `design-workspace.mjs workspace set`. In mode a, step 2's preflight is unchanged.
- **New step, "Read the library" (mode b, when `libraryDetected`).** First tell the
  user the file must be the tab in front, because imports hang otherwise (Facts
  checked). A `library-import` or build that times out is reported as "bring the
  file to the front and re-run", not as a composer bug.
  - If `design/library-cache.json` is missing, or `runCompose('library-list')`'s
    collection keys differ from the cache, run `cache init` on the list output, then
    `runCompose('library-import')` in chunks of 20 with `cache merge` on each saved
    return.
  - If the user gave a library link and `FIGMA_ACCESS_TOKEN` is set, call
    `figma_get_library_components` and pass its results unchanged.
- **Step 3, inventory.** In mode b, pass `SPEC.library = { pages, components, cache,
  tokens }`, with `cache` from `cache get` and `tokens` from `tokens`. Don't ask for
  a components page when the file has no local sets.
- **Step 4, the plan.** Mode b may write `{ raw }` where the summary has no
  matching variable.
- **Step 5, build and gaps.** The gap record passes `--system <working directory>`,
  and gap-report picks the file. After the build, save `staleCache` and run `cache
  merge` on it.
- **Step 6, the gate.** Mode b passes `TARGET.libraryTokens` from `tokens`.
- **Step 7, the drift record.** `screens.mjs record` runs in mode a only (Q20).
- **Step 8, the reviewer.** Pass the working directory in every mode.
- **Step 9, the report.** Add the mode line; `localPicks`, each flagged per Q7 when
  `libraryDetected` and there's no token; `raws`; the stale-cache note; the cache's
  `readAt`; and the count of library references the cache couldn't follow.
- **Pinned mentions.** Keep `references/figma-compose.md`,
  `references/figma-adherence.md` and `MODE = 'finalize'`
  (`ci/figma-checks-pointers.test.mjs`). Add the phrase "active-file preflight" where
  the command first mentions `figma_execute` (`ci/figma-preflight.test.mjs`).
Verify: `node --test ci/figma-checks-pointers.test.mjs ci/figma-preflight.test.mjs && node ci/validate-skills.mjs && node ci/validate-install-sets.mjs`
→ all pass.

### Step 10 — Install payload and source lists

Files: `scripts/install.mjs`, `scripts/install.test.mjs`, `scripts/README.md`, `ci/README.md`
Change: add `lib/design-mode.mjs`, `lib/design-mode-read.figma.js`,
`lib/library-read.figma.js` and `lib/figma-compose-library.mjs` to `PLUGIN_INTERNAL`
(lines 110–126), since they are inlined only. Add them to the skip assertions in
`install.test.mjs` (lines 160–174). Add `design-workspace.mjs` to the must-install
list (lines 181–187), since consumers run it. List the new sources and the script in
`scripts/README.md` and `ci/README.md` beside their neighbours.
Verify: `node --test scripts/install.test.mjs && node ci/validate-install-sets.mjs` → pass.

### Step 11 — Live run on real files

Files: `docs/notes/2026-10-30-design-modes-phase-1-live-run.md` (new)
Change: with Figma Desktop and the bridge running, run `/throughline:compose-figma`
three times:
1. **A product file with a library enabled and library instances.** Expect: mode b;
   a library set and a library variable used; the cache written; one raw value
   accepted and listed; the gate passing.
2. **The same file, with a detached local copy sharing a library component's name.**
   Expect: the library one used, and the local one absent from `localPicks`.
3. **A throughline system's own file.** Expect: mode a, with output identical to
   today's.

Time the `'signals'` and inventory reads on the busiest page (open question on the
cost of reading instances). Record the announcements, gate counts, reviewer verdicts
and timings.
Verify: reviewed by eye. The note exists, and each run matches its expectations or
the mismatch is recorded as a divergence.

### Step 12 — Full gates, changelog, version

Files: `CHANGELOG.md`, `package.json`, `.claude-plugin/plugin.json`, `README.md`,
`scripts/README.md`
Change: add the phase 1 entry under `## [Unreleased]`:
- **Added:** mode detection; mode b for compose-figma; the library cache;
  `design/` records; raw values in mode b.
- **Changed:** gap-report's file choice; the reviewer and `figma-scripting.md`
  preflight.

Bump `package.json` and `.claude-plugin/plugin.json` to `0.32.0` (Q22), and update
the `@0.31.0` pins in `README.md` (lines 116, 158–160) and `scripts/README.md`
(line 271) that `ci/check-pinned-runs.mjs` compares. The `## [0.32.0]` heading for a
release tag stays the owner's call.
Verify: run every CI gate: `node --test && node ci/validate-plugin.mjs && node ci/validate-skills.mjs && node ci/validate-install-sets.mjs && node ci/check-pinned-runs.mjs && node scripts/adapters/generate.mjs --check && node scripts/build-doc-card-builder.mjs --check && node scripts/build-native-adapter-config.mjs --check && node scripts/build-state-baseline.mjs --check && node scripts/build-figma-checks.mjs --check`
→ every command exits 0.
