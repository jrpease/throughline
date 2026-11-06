# Design modes: build in Figma with a system, a library, or nothing

Status: built (phases 1, 1b and 1c, 1c not yet run live); phases 2–4 not yet planned
Reviewed: 2026-11-02 (phase 1b) — ready to build, with two design ambiguities (forced-b consumer writing `design/`, the ask under `forced`) and eight Plan notes. All folded in the same day (Q36, Q37), not re-reviewed after.
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

Phase 1b's decisions (Q26–Q35) came in two parts. Q26, the where of Q27, Q28,
Q32 and Q33 are the five recommendations in the phase 1b handoff
(`docs/notes/2026-10-30-design-modes-phase-1b-handoff.md`), which the owner
approved on 2026-10-30 ("take Claude's recommendations"). The rest (the how of
Q27 and what a no does, Q29–Q31, Q34, Q35) were put to the owner as seven
questions on 2026-11-02, and the owner accepted every recommendation ("yes on all
recs"). Q36 and Q37 came from the critic's review the same day; the owner took both
recommendations ("take the rec").

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
| Q3 | Choosing the mode | Detected automatically, and the **open Figma file** decides. Mode a only when `design-system.json`'s `figma.fileKey` is the open file. Otherwise mode b when the file has any of: an enabled library variable collection (`figma_get_library_variables` returns any), an instance whose main component is remote on the pages the run loads (Q5), or local variables or component sets of its own. A file with only local parts is mode b with an empty library side. Otherwise mode c. Two of the three signals depend on the pages the run loads, so detection is a function of the file and the pages named, not the file alone: library instances only on an unloaded page, in a file with no local variables or sets, read as mode c. A product file that uses a throughline system as a library is therefore mode b; when `design-system.json` exists, its gaps go to the system's gap file (Q20). (Amended 2026-11-02: phase 1b makes a file that uses the repo's own system as its library mode a, by Q26; the rest of this row stands.) Announced in one line with what the mode gives up. The user can force a lower mode, never a higher one. | The open file is what the agent builds in, and compose-figma's preflight already stops when the open file isn't the system file. Figma can list enabled variable libraries but not enabled component libraries, so a component-only library is visible only through its instances. Forcing up would claim guarantees the file can't back. | The repo alone deciding the mode; a mode-picker question at the start of every run; mode a guarantees in a consumer file (a follow-up if wanted) |
| Q4 | Figma or code first | Figma. Code-side modes ship last (Q21). | Code mode c overlaps claude-bootstrap's `product-design`, and the owner's stated case is Figma with a library. | Building both sides together |
| Q5 | Reading library components | Always: collect library components from instances already on the pages the run loads (the target page, plus any page the user names), never a whole-file walk; each instance points back to its library component by key, no token needed. Additionally, when the library's link is known and `FIGMA_ACCESS_TOKEN` is set: the full list from `figma_get_library_components`. Without a token, the run says which components it could and couldn't see. Library variables always come from `figma_get_library_variables` (no token). | Figma's plugin API can list library variables but not library components; the REST route needs the library's link and a token. Instances already in the file cover the common case for free. The compose-figma spec records a whole-file walk stalling the bridge, so the scan stays page-scoped. | Requiring a token for mode b; mode b covering variables only; scanning every page |
| Q6 | Where mode b keeps records | A `design/` folder in the working directory: `design/workspace.json` (file key, library links, last detected mode), `design/library-cache.json` (Q9) and `design/gaps.json` (same shape as `design-system/gaps.json`). claude-bootstrap's `product-design` also writes `design/precedent/` in a project; the two coexist on purpose, since both are design records for the same project and no file names collide. | Mode b has no `design-system.json` to hang records from, and `.throughline/` is the adapters' install directory, not state (gap-report spec). (Amended 2026-11-02 by Q29: when `design-system.json` exists, the library cache lives at `design-system/library-cache.json` instead.) | Requiring `design-system.json` for mode b; storing state in `.throughline/` |
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
| Q20 | Records by mode | a: as today (screens recorded for drift, gaps in `design-system/gaps.json`). b: gaps in `design-system/gaps.json` when `design-system.json` exists (a consumer file of a throughline system, Q3), else `design/gaps.json`; no drift. c: none. `scripts/gap-report.mjs` and `/throughline:gap-report` choose the file the same way: `design-system/gaps.json` when `--system` holds `design-system.json`, else `design/gaps.json`. (Confirmed 2026-11-02 by Q34: after phase 1b, mode b in a system repo is either a consumer forced down to b, whose gaps are the system's, or a file using some other library; the directory still decides, so that rarer case lands in the system's file too.) | Each mode records only what it can back. Gaps nobody can triage are pointless, and today gap-report hardcodes `design-system/gaps.json`. | Fake drift records in mode b; a mode b gap file nothing reads |
| Q21 | Phase order | 1. Mode detection plus mode b in compose-figma, including the library cache (Q9) and gap-report reading `design/gaps.json` (Q20), and the reviewer preflight (Q19), since compose-figma dispatches the reviewer on every run. 1b. Mode a's rules in a product file that uses a throughline system as its library (the follow-up Q3 rules out for phase 1; the owner approved it on 2026-10-30; its decisions are Q26–Q35, and it includes library text styles, Q30). 1c. Drift for screens composed in a consumer file (Q33). 2. `/throughline:design` with file organization, states, annotations, the craft reference (Q23), the tell warnings (Q24), the reviewer rubric (Q25), placement (Q16). 3. Mode c. 4. Code-side modes. | Mode b is the owner's stated case; the method layer is what makes it more than compose-figma; code comes last (Q4). | Building everything in one release |
| Q22 | Positioning | The README reframes throughline as an agent design studio, with the design system as the deepest mode. (Amended 2026-10-30 by the owner: it landed in 0.32.1, right after phase 1, rather than waiting for phase 2. It describes only what's built and lists the rest of the modes and `/throughline:design` on the roadmap.) Copy follows `references/guide-voice.md`. Version goes up a minor step per phase. The website (radicool.studio/throughline) lives outside this repo; updating it is a note for the owner, not part of this spec. | The plugin's purpose changes; its own voice guide governs its copy. Shipping the README with phase 1 would pitch a method that doesn't exist yet, unless it describes only what's built, as 0.32.1 does. | Shipping the modes while still pitching only the design-system builder |
| Q23 | How the agent designs well without Mobbin | A new reference, `references/screen-craft.md`, read at intake and at build in every mode. It states general product-screen rules as rules, not as measurements: type on work screens stays quiet and hierarchy comes from weight, colour and position before size; density follows the task and holds across the screen; one small spacing scale; a small palette with the accent reserved for the primary action and current state, and status colour treated as functional; elevation means what sits above what, with no cards nested in cards; a flow is a few reused layout templates (list, detail, list plus detail, form, dashboard), and empty states live inside the template; chrome (header, sidebar, toolbar) is designed, not left at defaults; skeletons rather than spinners when the arriving layout is known; real content, never placeholders. It also carries product-design's twelve tells as the things to avoid. (Owner approved, 2026-10-30.) | Models handle the mechanics on their own but drift to the median screen, and the tells are exactly where they drift. In modes a and b the system supplies the look and the agent supplies composition; mode c has nothing to inherit, so this reference carries it. | Assuming the model designs well unaided; shipping the measured canon (Q14) |
| Q24 | Tell checks in the gates | Each mode's gate also reports the tells a script can see in a Figma file, as warnings: placeholder text ("Lorem", "Item 1", "John Doe"), more than one primary action on a screen, a card nested inside a card, a heading far larger than the body text on a work screen, and a missing state frame on the hardest screen (Q15). (Owner approved, 2026-10-30.) | Throughline's rule is that a rule holds only if something checks it; these are the tells that can be checked from node data. | Tells that live only in prose; checking taste a script can't see (those go to the reviewer) |
| Q25 | Reviewer rubric | The `reviewer` scores the screenshots against the intake (did it build what was asked) and against `screen-craft.md`, naming every visible tell. Any references the user pasted into the prompt are used too; the plugin has no step that gathers them. (Owner approved, 2026-10-30.) | Judging only against the intake checks completeness, not quality. | A reviewer that only checks the request was met |
| Q26 | Telling a consumer file apart (1b) | A file is a consumer of the repo's system when `design-system.json` exists, its `figma.fileKey` is not the open file, and a connected library variable collection's key is in `figma.collectionKeys` (Q27). A consumer file is mode a. Its announcement names the library and says drift isn't tracked yet (Q33). Detection reads only library *variable* collections, so a file that uses the system's components without any of its variable collections enabled isn't recognised as a consumer: it runs as mode b, with local stand-ins and raw values allowed. | Checked live on 2026-10-30: Zygarden.gg's `teamLibrary` collection keys equal the system file's local `VariableCollection.key`, all 10. A key survives a rename; the library's name doesn't. | Detecting by library name; detecting by component keys (`design-system.json` records none) |
| Q27 | Recording the system's collection keys (1b) | Stored in `design-system.json` as `figma.collectionKeys`. Written by a new subcommand, `design-workspace.mjs system keys --dir <dir> --from <saved signals output> [--library <name>]`. It replaces `figma.collectionKeys` and leaves every other field, and their order, alone. Without `--library` it takes the file's local collection keys, and runs on every mode a compose in the system file, so a collection added later is picked up. With `--library` it takes that library's collection keys. When none are recorded, the open file isn't the system and a library is connected, the run asks once, naming every connected library: "is one of these your throughline system?" On a pick it saves that library's keys; on no it records nothing, runs in mode b, and asks again next run. Documented in `references/manifest-schema.md`. | A script reads the keys back, so the "no hand-written JSON" rule applies. Remembering a "no" would be another field to keep in sync for a rare case (a system repo building against an unrelated library). | The agent editing `design-system.json` by hand for this field; recording a "no" |
| Q28 | Mode a's rules in a consumer file (1b) | No `{ raw }` values. Library parts only: the file's own component sets, swap targets, variables, collections and text styles are left out of the inventory, so a request only a local part would meet is a `missing-component` (or `unknown-…`) error, and a component gap is recorded. Gaps go to `design-system/gaps.json` (Q20, already). Nothing is written under `design/`, and no `design/workspace.json` is written. The gate gets `TARGET.libraryTokens`, so a raw value the system holds fails. | These are mode a's guarantees, made to hold in a file that reaches the system only as a library. | Local stand-ins in a consumer file; raw values in a consumer file |
| Q29 | Where the library cache lives when `design-system.json` exists (1b) | On disk at `design-system/library-cache.json`, in the same shape as `design/library-cache.json`. `design-workspace.mjs` picks the path from the directory the way `gapFileFor` picks the gap file: `design-system/` when `design-system.json` exists, else `design/`. | A consumer run needs the library's values for the gate, and the product file has no variables of its own. Re-reading Zygarden's 10 collections costs about 15 bridge calls a run; a cache costs nothing after the first read, and phase 1's stale-value check still applies. | Re-reading the library into memory on every run; a `design/` folder in a system repo for the cache |
| Q30 | Library text styles (1b, both mode a in consumer files and mode b) | Collected from text nodes already on the pages the run loads (Q5), like library components: a text node whose `textStyleId` points at a remote style contributes that style, by key, de-duplicated. The style is already in the file, so it is applied as it is, never imported by key. In mode b the library style wins a name clash (Q7). Settles the "Library text styles" open question with its option (b). | Without it a consumer screen holds no heading or body copy, since Zygarden.gg has no local text styles and the library rule (Q28) leaves out local ones anyway. Import by key hung live for components; styles reached through text nodes need no import. | Phase 1's text-styles-from-the-file-only in mode b; deferring library text styles past 1b |
| Q31 | Parts from other libraries in a consumer file (1b) | Variables and collections are limited to the system's, by `figma.collectionKeys`. Components and text styles from any connected library are allowed, and the report says components aren't checked against the system. | The plugin API doesn't say which library a remote component or style came from, and `design-system.json` records no component keys. | Refusing every component the run can't prove is the system's |
| Q32 | Forcing a consumer file down (1b) | A consumer file ranks as mode a and can be forced down to b ("ignore the system") or c ("ignore the library"), as Q3 allows for any file. | The same lowering rule as every other file. | A separate consumer mode with its own forcing rules |
| Q33 | Drift for consumer screens | Phase 1c, not 1b. Consumer screens are not recorded in `screens.json` in 1b. 1c: a per-entry `fileKey` in `screens.json`, the drift screens snippet run against that file (`figma_execute` takes `fileKey`), and components resolved through library instances. | Drift's live half (`commands/drift.md` step 3) assumes every screen lives in `figma.fileKey` and finds components on that file's components page; recording consumer screens before it can check them in their own file would report them all as gone. | Recording consumer screens in 1b |
| Q34 | Mode b's gaps in a system repo after 1b | Q20 unchanged: the directory decides (see Q20's note). | A consumer forced down to b is the common case, and its gaps are the system's. | A mode flag on gap-report |
| Q35 | Library variables that can't be imported (1b) | `library-import` returns skipped variables as `[{ key, name }]`; `cache merge` adds their keys to the cache's top-level `skipped` list, and `cache missing` leaves them out. `cache init` starts a fresh cache with no `skipped`, so a full re-read tries them again. | Phase 1 re-imported and re-skipped them on every run. | Trying skipped variables on every run; never trying them again |
| Q36 | `design/` in a system repo (1b) | When `design-system.json` exists, nothing is written under `design/` in any mode: compose-figma skips `workspace set`, the cache goes under `design-system/` (Q29) and gaps go to the system's file (Q20). This covers a consumer forced down to b. | Q28 and Q29 meant to keep `design/` out of a system repo; a forced-down consumer (Q32) would otherwise still write `design/workspace.json`. | `design/workspace.json` beside `design-system/` |
| Q37 | Asking "is this your system?" when a mode was forced (1b) | Not asked when `forced` is set. | The user has already said to ignore the system or the library on this run. | Asking on a run the user lowered |
| Q38 | `system keys` reformatting `design-system.json` (1b, from the live run) | Left as is. It writes two-space JSON like every manifest writer, and when that changes the file's formatting it prints a line saying so. compose-figma passes that line on. Owner accepted the recommendation 2026-11-02 ("keep going with your recs"). | The data and field order are unchanged; only the first write expands hand-wrapped arrays, and saying so explains the bigger diff. | Preserving the owner's hand formatting |
| Q39 | A whole-padding `{ raw }` in a consumer run (1b, from the live run) | Refused as a raw value ("a variable name, not {raw:…}" at `root.padding`), not with mode b's per-side message. The same holds in the system's own file, which allows no `{ raw }` either. Mode b's handling is unchanged. Owner accepted the recommendation 2026-11-02. | The per-side wording sent the reader looking for a side to fix when no raw value is allowed at all. | — |
| Q40 | Phase 1c: the screens.json key for a consumer screen | `figma@<fileKey>:<folded screen>`. Entries in the system's own file keep `figma:<folded screen>` and carry no `fileKey`, so existing stores read unchanged. (Owner said to take Claude's recommendations, 2026-11-06, for Q40–Q47.) | Today's key is `side:folded screen` (`scripts/screens.mjs:36`), so a product file's "Home" and the system file's "Home" would overwrite each other. | A migration of every existing key |
| Q41 | What a consumer entry records beyond today's | `fileKey` (the product file) and `library: { pages }` (the pages compose read library parts from). The system's collection keys are read from `design-system.json` at drift time, not copied. | Drift has to re-read the same library parts compose used, in the same file. One source for the collection keys. | Storing collection keys per entry |
| Q42 | How the live half reaches a product file | Figma entries are grouped by file. The system file's run as today. Each product file's entries go in one call with `figma_execute`'s `fileKey`, which reads a connected file without switching to it. A product file the bridge isn't connected to is reported **not checked**, never `gone`, and the stale check from the offline half stands for its screens. | A screen in a file nobody has open isn't missing. Reads by `fileKey` are what the bridge supports (its tool contract, and the 1b probes, Facts checked). | Recording consumer screens as gone; switching the active file during drift |
| Q43 | How a consumer screen is re-resolved | The screens snippet reads the inventory with `library = { pages, cache, systemCollectionKeys }`, the same reader compose uses, and imports nothing. `cache` is `design-workspace.mjs cache get`'s output. | Variables in a consumer plan resolve only through the library cache, and components only through instances on the library pages. Read-only. | A separate drift resolver |
| Q44 | Compose's side | A consumer run records the screen at finalize with `--file-key <currentFileKey> --library-pages <pages>`. The consumer mode line and the report stop saying drift isn't tracked for this file. | Q33's rule held until drift could check them; 1c is that. | — |
| Q45 | `figma-scripting.md`'s claim that `figma_execute` takes no file key | Corrected: it takes `fileKey` for a connected file. Writes still go through the active-file preflight and the pin. | The claim is stale and would steer 1c away from the one way it works. | — |
| Q46 | Copy (the standing rule, scope-copy Q7/Q19) | The README's mode 1 says screens in a product file are tracked for drift, and the roadmap drops that item. The site's mode cards don't mention drift, so they don't change. | Copy describes what's built. | — |
| Q47 | The offline half | Unchanged. A consumer entry's component fingerprints are the system's, so `stale` and `untracked` apply as they are; `drift-check.mjs` ignores the extra fields. | Nothing in it reads the file or the target. | — |

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
  (a). Settled 2026-11-02 by Q30: option (b), built in phase 1b.
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

Phase 1b, on branch `feat/design-modes-1b`:

- `scripts/lib/design-mode.mjs` (+ test): `detectMode` knows a consumer file from
  the system's collection keys, and returns `consumer`, `systemLibrary` and
  `askSystem` (Q26, Q27, Q32, Q37).
- `scripts/lib/design-mode-read.figma.js`: `signals` passes the keys through and
  returns `signals` and `localCollectionKeys`.
- `scripts/design-workspace.mjs` (+ test): `system keys`, the cache under
  `design-system/` when `design-system.json` exists (Q29), `skipped` kept in the
  cache (Q35), and `cache missing --from` checking its input.
- `scripts/lib/library-read.figma.js`: `skipped` as `[{ key, name }]`.
- `scripts/lib/figma-compose-read.figma.js`, `figma-compose-library.mjs` (+ test),
  `figma-compose.figma.js`, `figma-compose.mjs`: library text styles read from text
  nodes and applied without importing (Q30); a consumer inventory limited to library
  parts and the system's collections, with no `{ raw }` (Q28, Q31).
- `scripts/build-figma-checks.mjs` (+ test): the header documents all of it, with
  five new fake-Figma cases; the references and adapters were regenerated.
- `commands/compose-figma.md`, `references/manifest-schema.md` (`figma.collectionKeys`).
- `scripts/README.md`, `README.md`, `CHANGELOG.md`, `package.json` and
  `.claude-plugin/plugin.json` at 0.33.0.
- `docs/notes/2026-11-02-design-modes-phase-1b-live-run.md`.

Verified: `node --test` (1098 pass, 0 fail) and every gate in `.github/workflows/ci.yml`
exiting 0, run again after the live run's doc fix. Live (the note): B0's text-style
probe; a system-file run that recorded the keys; a consumer run in Zygarden.gg
(cache and gaps under `design-system/`, three raw values refused, a missing
component recorded as a gap, library text styles applied, gate passed, reviewer
"pass with notes"); a run forced to b; and the ask.

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

Phase 1b:

- **B0 ran after B1–B7 and B10, not first.** The bridge had no files connected when
  the build started, so the offline steps ran first, under the stop rule: if B0
  failed, B4's text-style half would come back out and Q30 would be amended. B0
  passed (Facts checked), so nothing was reverted.
- **The live run found the consumer keys documented in the wrong place.** The
  command and the generated header said a consumer run passes "the same `library`
  plus `systemCollectionKeys`". The snippet reads `library.systemCollectionKeys`
  only, so keys placed at the top of `SPEC` quietly gave mode b's rules, and a raw
  gap and colour built. Step 5 also passed `library` to `build` in mode b only.
  The code and tests were right. `commands/compose-figma.md` and `COMPOSE_HEADER`
  were fixed, then the references and adapters regenerated and B10's gates re-run.
- **B8 didn't paste the snippet into each call.** A local relay on
  `localhost:9232` served the snippets once per file and saved every return to
  disk. That way the workspace and gap scripts ran on disk against unedited returns
  (the note explains how). Run 1's screen was discarded while `WIP:`, as planned.
  Run 3 had no reviewer, because it used the same parts as run 2. Run 4 stopped at
  signals once the pick made it a consumer, and the "yes" was scripted.
- **`system keys` reformats the manifest.** It writes with `JSON.stringify`, so
  hand-wrapped one-line arrays come out expanded. The data and field order are
  unchanged. The owner kept it and had the script say so (Q38). The consumer
  raw-padding message was also fixed after the run (Q39).
- **A diff review after the live run found two more gaps in the command, fixed
  the same day.** Step 5 refreshed a stale cache "in mode b" only, though a consumer
  run gets `staleCache` too (Q29), so it now says mode b and a consumer run. Step 0
  ran `system keys` before step 2 had confirmed which file is in front, so a wrong
  active file could record a product file's keys as the system's; it now runs
  after step 2's preflight, and an exit 1 means stop and report. Step 0 also now
  asks for a page that already uses the library when the target page is new,
  because library parts and text styles are read only from `pages`.

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

Phase 1b, Step B0, run 2026-11-02 on `Zygarden.gg` (`948SPugP1tqqLpLleHZOsU`) and
`Zygarden Design System` (`k5EV3vXCZ7eTKFgqS0TMFv`), both through `fileKey`. It ran
after Steps B1–B7 and B10, because the bridge had no files connected until then
(see Where it diverged).

- **Reading passed.** Across Zygarden.gg's pages, 10,873 text nodes held 14
  distinct string `textStyleId`s. `getStyleByIdAsync` read all 14 as `remote: true`,
  `type: 'TEXT'`, with a `key` and a `fontName` (for example `h1`, key `bc295f86…`,
  Nunito Sans Bold). None were local and none were missing. The file has 0 local text
  styles.
- **Applying passed, without importing.** On a scratch frame on `Cover`, a new text
  node took `h1` through `setTextStyleIdAsync(s.id)` after `loadFontAsync(s.fontName)`.
  `textStyleId` read back as the remote id, and the font size came out as the style's
  30. The file still had 0 local text styles afterwards. The frame was removed in
  the same snippet, and a read-back confirmed it was gone.
- **The system's keys.** `getLocalVariableCollectionsAsync()` in the system file
  returned 10 collections, each with a `key` (Color, Spacing, Typography, Radius and
  Stroke, as Primitives and Semantic; 233 variables in all). In Zygarden.gg,
  `getAvailableLibraryVariableCollectionsAsync` lists the same 10 under `Zygarden
  Design System`, and every key matches. Zygarden.gg has no local collections.
- **What this changes in the Plan:** nothing. Q30 stands, and B4's text-style
  half stays.

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

## Plan, phase 1b

Phase 1b only (Q21): a consumer file of the repo's own system runs as mode a
(Q26–Q28, Q31, Q32), library text styles in both mode a consumer runs and mode b
(Q30), the cache's new home (Q29), skipped variables (Q35), and the handoff's
leftovers. Not in 1b: drift for consumer screens (Q33, phase 1c), repeated variable
names, variant combinations, and the by-key component import path (open questions).
Phase 1's conventions apply to every step (tests beside modules, no dependencies,
generated `references/` regenerated, inlinable sources, no hand-written JSON, every
Figma read a `MODE` of `runCompose`). Steps are numbered B0–B10 so they don't clash
with phase 1's.

### Step B0 — Check that a library text style can be applied as it is

Files: this spec (`## Facts checked`, a new "Phase 1b" paragraph)
Change: with Figma Desktop, the bridge, and Zygarden.gg (`948SPugP1tqqLpLleHZOsU`)
in front, run one `figma_execute` probe on a page with library text in it (inside
library instances counts): find a `TEXT` node whose `textStyleId` is a non-empty
string, `const s = await figma.getStyleByIdAsync(node.textStyleId)`, and read
`s.remote`, `s.key`, `s.name`, `s.type` and `s.fontName`. Then create a text node on
a scratch frame, `await figma.loadFontAsync(s.fontName)`, `await
t.setTextStyleIdAsync(s.id)`, read back `t.textStyleId === s.id`, and remove the
frame. Also record `(await figma.variables.getLocalVariableCollectionsAsync()).map(c => c.key)`
in the system file (`k5EV3vXCZ7eTKFgqS0TMFv`), to confirm the field Step B2 reads.
**If a remote style can't be read from a text node or applied without import, stop**:
Q30 depends on it, so amend the spec before going on.
Verify: reviewed by eye. Facts checked records the raw output and the files.

### Step B1 — Detection knows a consumer file

Files: `scripts/lib/design-mode.mjs`, `scripts/lib/design-mode.test.mjs`
Change: `detectMode(signals)` takes two new fields and drops none:
- `systemCollectionKeys`: `design-system.json`'s `figma.collectionKeys`, or null;
- `libraryCollectionKeys`: `[{ library, key }]` for every enabled library collection.
  When present, `libraryCollections` is its length (the count field stays for old
  callers and tests).

Rules, in order (Q26, Q27, Q32):
- **Mode a, system file:** as today. `consumer: false`.
- **Mode a, consumer:** `manifestFileKey` non-null, not equal to `openFileKey`, and
  some `libraryCollectionKeys[].key` is in `systemCollectionKeys`. Returns
  `consumer: true`, `systemLibrary` (that entry's `library` name) and
  `libraryDetected: true` (step 2b reads the library).
- **Ask:** `manifestFileKey` non-null, not the open file, `systemCollectionKeys`
  empty or null, `libraryCollectionKeys` non-empty, and `forced` not set (Q37).
  Detection goes on as today
  (mode b), and the result adds `askSystem`: the distinct library names, sorted.
- **Otherwise** as today.
- **Forcing** lowers a consumer to b or c, as for any mode a (`consumer: false` once
  lowered). A forced run never asks (Q37).

The output gains `consumer` (always a boolean), `systemLibrary` (string or null) and
`askSystem` (array, empty when not asking). The consumer `reason`: "Mode a: building
from <systemLibrary>, this repo's throughline system, used here as a library. Every
value is bound to the system; anything the library doesn't have is recorded as a gap;
components from other connected libraries aren't checked against the system; drift
isn't tracked for this file yet." Mode b's reason drops "text styles come from this
file only" (Q30) and says text styles come from the library where the run sees them
in use, else the file.
Tests: a consumer file (a, consumer, systemLibrary); keys recorded but no match (b);
the ask case and its sorted names; no ask when `manifestFileKey` is null; a consumer
forced to b and to c; the system file unchanged; the updated mode b reason (replace
the "text styles come from the file" test); no ask when `forced` is set. Rename the test "a consumer file of a
throughline system is mode b" to say it covers a file with no recorded keys.
Verify: `node --test scripts/lib/design-mode.test.mjs` → all pass.

### Step B2 — Signals carry the keys

Files: `scripts/lib/design-mode-read.figma.js`
Change: `readModeSignals` takes `SPEC.systemCollectionKeys` and passes it through.
It keeps the collections list from `getAvailableLibraryVariableCollectionsAsync` and
sets `libraryCollectionKeys` to `[{ library: c.libraryName, key: c.key }]`. It also
reads `figma.variables.getLocalVariableCollectionsAsync()` and returns
`localCollectionKeys: [key]` beside `signals` (not inside it), for Step B3's
`system keys`.
Verify: Step B5's fake-Figma cases.

### Step B3 — The workspace script: cache path, skipped keys, system keys, input checks

Files: `scripts/design-workspace.mjs`, `scripts/design-workspace.test.mjs`,
`scripts/lib/library-read.figma.js` (the `skipped` shape only)
Change:
- **Cache path (Q29).** `export const cacheFileFor = (dir) => (existsSync(join(dir,
  'design-system.json')) ? 'design-system/library-cache.json' : CACHE_FILE)`. Every
  cache subcommand and `tokens` uses it. Messages name the file used. Keep exporting
  `CACHE_FILE`. Update the header's FILES block.
- **Skipped (Q35).** `libraryImport` returns `skipped: [{ key, name }]`. `mergeCache`
  accepts an optional `input.skipped` array of those and adds each key to
  `cache.skipped` (sorted, de-duplicated); a key that later merges as an entry is
  removed from `skipped`. `missingKeys` leaves out `cache.skipped`. `initCache` writes
  no `skipped`. compose-figma step 2b's sentence on naming skipped variables stays.
- **Input checks (handoff leftover).** `cache missing --from` runs through `guard`,
  and `missingKeys` throws `expected { collections: [...] } from library-list` when a
  given list has no `collections` array, so a bad file exits 1 with that message, not
  a TypeError.
- **`system keys --dir <dir> --from <signals file> [--library <name>]` (Q27).** Reads
  `<dir>/design-system.json` (missing: exit 1, "no design-system.json in <dir>").
  The signals file is `runCompose('signals')`'s return, saved unchanged.
  - Without `--library`: requires `signals.signals.manifestFileKey ===
    signals.signals.openFileKey` (else exit 1, "not the system file"), and takes
    `signals.localCollectionKeys` (top level, beside `signals`, per Step B2).
  - With `--library`: takes the keys of `signals.signals.libraryCollectionKeys`
    whose `library` equals the name; none is exit 1 naming the libraries present.
    `--library` is declared `multiple: true` in `parseArgs`, so more than one
    `--library` here is exit 2 ("system keys takes one --library").
  - Writes `figma.collectionKeys` (sorted, de-duplicated), creating `figma` if
    absent, and leaves every other field and its position alone:
    `JSON.stringify(data, null, 2) + '\n'`, not `serialize` (which sorts keys).
    Prints `recorded N collection keys in design-system.json`.
  - Add `system` / `keys` to the usage line and header.
Tests: the cache path in both directory shapes; a merge with `skipped`, then
`missing` leaving them out, then a merge that fills one; init clearing `skipped`;
`missing --from` a malformed file exits 1 with the message; `system keys` from the
system file, with `--library`, refused when not the system file, an unknown library,
and a missing manifest; field order of an existing `design-system.json` unchanged.
Verify: `node --test scripts/design-workspace.test.mjs` → all pass. Expected red
until Step B5: `scripts/build-figma-checks.test.mjs:686`, which asserts the old
`skipped` shape (`['color/bg/surface']`).

### Step B4 — Library text styles, and the consumer inventory

Files: `scripts/lib/figma-compose-read.figma.js`, `scripts/lib/figma-compose-library.mjs`,
`scripts/lib/figma-compose-library.test.mjs`, `scripts/lib/figma-compose.figma.js`,
`scripts/lib/figma-compose.mjs` (the INVENTORY comment only)
Change:
- **Reader (Q30).** In `composeReadLibrary`, on each page in `lib.pages` (already
  loaded there), collect the distinct `textStyleId`s of `TEXT` nodes that are
  non-empty strings (skip `figma.mixed`). Read each with `figma.getStyleByIdAsync`,
  in chunks of 20; keep those with `remote === true` as `{ name, key }` in a new
  `textStyles` list, and put the style under `libraryId(key)` in `nodes`. Return
  `textStyles` with the rest.
- **Reader (Q28).** Pass `spec.library.systemCollectionKeys` through to the merge
  (null or absent outside a consumer run).
- **Merge.** `mergeLibraryInventory(local, library)`:
  - `textStyles` becomes `libraryFirst(library text styles as { name, id:
    libraryId(key) }, local.textStyles)` (Q7, Q30).
  - When `library.systemCollectionKeys` is a non-empty array (a consumer run, Q28,
    Q31): `sets`, `components` and `textStyles` are the library's only; `variables`
    and `collections` are the cache's only, limited to collections whose key is in
    `systemCollectionKeys` (and variables whose `collection` is); `allowRaw` is
    `false`; `valueIndex` is still built (the gate's tables are separate).
  - Update the header comment.
- **Writer.** In `composeImportLibrary`, also collect each text node's `styleId`
  that `isLibraryId`. For each, take the node from `live.libraryNodes` (it is always
  there: the inventory lists only styles the reader found; throw "library text
  style <key> wasn't read from the page; re-run" if not). Put it into
  `live.styleNodes` under its real `id`, and rewrite the plan text node's `styleId`
  to that `id` before `composeFontsFor` runs. No import by key.
- **Writer header comment** (`scripts/lib/figma-compose.figma.js:27-32`): document
  `signals`' new SPEC field and return fields, and `library`'s
  `systemCollectionKeys`, to match Step B5's `COMPOSE_HEADER`.
- **INVENTORY comment** in `figma-compose.mjs`: text styles may be library styles in
  mode b and in a consumer run. The resolver itself is unchanged: with `allowRaw`
  false a `{ raw }` stays `invalid`, as in mode a.
Tests (`figma-compose-library.test.mjs`): a library text style winning a clash; a
local text style kept in mode b when no clash; a consumer merge dropping every local
part, limiting variables and collections to the system's keys, and setting
`allowRaw: false`; a consumer plan with `{ raw }` refused as `invalid` by
`resolveScreen`; a request for a local-only set refused as `missing-component`.
Verify: `node --test scripts/lib/figma-compose-library.test.mjs scripts/lib/figma-compose.test.mjs`
→ all pass. Expected red until Step B5: `build-figma-checks.test.mjs`, because
`references/` isn't regenerated yet (and the `skipped` assertion since Step B3).

### Step B5 — Generator and fake-Figma cases

Files: `scripts/build-figma-checks.mjs` (the `COMPOSE_HEADER` text only),
`scripts/build-figma-checks.test.mjs`, then regenerate `references/figma-compose.md`,
`references/figma-adherence.md`, `references/figma-drift.md`
Change:
- **`COMPOSE_HEADER`'s "How to call it":** `signals` takes `systemCollectionKeys`
  and returns `localCollectionKeys`, `consumer`, `systemLibrary` and `askSystem`;
  `SPEC.library` takes `systemCollectionKeys` in a consumer run; library text styles;
  `skipped` is `[{ key, name }]`.
- **Fake Figma:** add `getStyleByIdAsync`, remote text styles on `TEXT` nodes,
  `figma.mixed`, and `key` on local variable collections. End-to-end cases:
  - `signals` in a consumer file (mode a, `consumer: true`, `localCollectionKeys`
    returned), with no recorded keys (`askSystem` lists the library), and in the
    system file;
  - a mode b build that places text with a library text style found on a loaded
    page, and the text node ends with that style's id;
  - a consumer build that uses a library set, a system variable and a library text
    style, and returns no `localPicks` or `raws`;
  - a consumer build refused for a local-only set (`missing-component`, nothing
    written) and for a `{ raw }` value (`invalid`);
  - change the existing assertion at `build-figma-checks.test.mjs:686` to the new
    `skipped` shape, `[{ key, name }]`.

Then run the generator.
Verify: `node scripts/build-figma-checks.mjs && node scripts/build-figma-checks.mjs --check`
→ no drift; `node --test scripts/build-figma-checks.test.mjs scripts/lib/figma-compose.test.mjs`
→ all pass.

### Step B6 — compose-figma runs a consumer file

Files: `commands/compose-figma.md`, `references/manifest-schema.md`, then
`node scripts/adapters/generate.mjs`
Change:
- **Step 0.** Also read `figma.collectionKeys` from `design-system.json` and pass it
  as `systemCollectionKeys`. Save the signals return unchanged to a scratch file.
  - Mode a in the system file (not `consumer`): run `design-workspace.mjs system keys
    --dir <dir> --from <signals file>` (Q27).
  - `askSystem` non-empty: ask once, naming each library, whether one is this repo's
    throughline system. On a pick, run `system keys --dir <dir> --from <signals file>
    --library <name>` and run `signals` again; on no, go on in mode b and say it will
    ask again next run.
  - Tell the user the `reason`.
- **Step 1.** A consumer run's file is `currentFileKey`. When `design-system.json`
  exists, no run writes `design/workspace.json`, whatever the mode (Q36): skip
  `workspace set`.
- **Step 2.** The preflight runs against that key, as in mode b.
- **Step 2b.** Runs for a consumer too (`libraryDetected`). The cache paths are the
  script's to pick (Q29); the command doesn't name `design/library-cache.json` as the
  only place. Split the ~130-character line ("…lists under `skipped`. A call that")
  at a word boundary (handoff leftover).
- **Step 3.** A consumer run passes `library` with `systemCollectionKeys` added, and
  needs no components page.
- **Step 4.** A consumer run has no `{ raw }`, and only library parts: a request
  that only one of the file's own parts would meet is a gap, handled as step 4
  already says. Library text styles are in the summary, in mode b too.
- **Step 6.** A consumer run passes `libraryTokens` as mode b does.
- **Step 7.** `screens.mjs record` runs in mode a only when not `consumer`; a
  consumer screen isn't recorded for drift yet (Q33).
- **Step 9.** For a consumer run: the mode line, gaps in `design-system/gaps.json`,
  that drift isn't tracked for this file yet, and that components from other
  connected libraries aren't checked against the system (Q31). The cache line names
  the file the script used.
- **The opening paragraph and the frontmatter description** add a product file that
  uses the repo's system as its library (mode a there too).
- **The closing paragraph** says `{ raw }` is mode b only and a consumer run uses
  library parts only.
- **`references/manifest-schema.md`:** add `"collectionKeys": []` to the `figma`
  block, and a line saying what it holds, who writes it (`design-workspace.mjs system
  keys`, from compose-figma), and that it decides a consumer file (Q26).
- Keep the pinned mentions phase 1 Step 9 lists.
Verify: `node scripts/adapters/generate.mjs --check && node --test ci/figma-checks-pointers.test.mjs ci/figma-preflight.test.mjs && node ci/validate-skills.mjs && node ci/validate-install-sets.mjs`
→ all pass. `awk 'length>120' commands/compose-figma.md | wc -l` prints at most 5
before the other B6 edits are counted (6 today; the step 2b line split removes one);
any line B6 adds stays under 120.

### Step B7 — Docs and source lists

Files: `scripts/README.md`, `ci/README.md` (only where they describe
`design-workspace.mjs` or the compose sources)
Change: name the `system keys` subcommand and the cache's two homes. No new files are
inlined, so `scripts/install.mjs` is unchanged.
Verify: `node --test scripts/install.test.mjs && node ci/validate-install-sets.mjs` → pass.

### Step B8 — Live run in Zygarden

Files: `docs/notes/2026-11-02-design-modes-phase-1b-live-run.md` (new)
Change: with Figma Desktop and the bridge running, and a scratch working directory
holding a copy of `~/Dev/zygarden-frontend/design-system.json` (so the owner's repo
isn't written to), run `/throughline:compose-figma`:
1. **The system file** (`k5EV3vXCZ7eTKFgqS0TMFv`), a one-button screen on a new page
   `Throughline phase 1b test`. Expect mode a as today, and `figma.collectionKeys`
   written to the copy with 10 keys, every other field in place. This is the first
   compose written into the production system file: once recorded, remove the
   screen with `MODE = 'discard'` if it is still `WIP:`, and leave the page for the
   owner to delete.
2. **Zygarden.gg**, a new page `Throughline phase 1b test`, a screen with a heading,
   body copy and library components. Expect: mode a consumer naming the library; the
   cache at `design-system/library-cache.json`; library text styles used; a `{ raw }`
   refused; a request only a local part would meet recorded as a gap in the copy's
   `design-system/gaps.json`; the gate passing; no `design/` folder; no drift record.
3. **Zygarden.gg forced to b** ("ignore the system"). Expect mode b, with library
   text styles, no question about the system (Q37), and still no `design/` folder in
   the scratch directory (Q36).
4. **The ask:** remove `collectionKeys` from the copy and run once on Zygarden.gg.
   Expect the question naming the library; on yes the keys are recorded and the run
   is mode a consumer.

Record announcements, gate counts, reviewer verdicts (or why none), and timings.
Leave the test pages in both files, and ask the owner whether to delete them (Q17: throughline made
it, but deleting is the owner's call, as in phase 1).
Verify: reviewed by eye. Each run matches its expectations, or the mismatch is
recorded as a divergence.

### Step B9 — Spec housekeeping

Files: this spec
Change: Status to "built (phases 1 and 1b); phases 1c–4 not yet planned"; keep
the 1b `Reviewed:` line current (replace it if 1b is re-reviewed); a "Phase 1b" list under What shipped and Where it diverged.
Verify: reviewed by eye.

### Step B10 — Full gates, changelog, version

Files: `CHANGELOG.md`, `package.json`, `.claude-plugin/plugin.json`, `README.md`,
`scripts/README.md`
Change: a phase 1b entry under `## [Unreleased]`:
- **Added:** mode a in a product file that uses the repo's system as its library;
  `figma.collectionKeys` and `design-workspace.mjs system keys`; library text styles
  in mode b and consumer runs.
- **Changed:** the library cache lives under `design-system/` when
  `design-system.json` exists; skipped library variables aren't retried every run;
  `cache missing --from` checks its input.

Bump `package.json` and `.claude-plugin/plugin.json` to `0.33.0` (Q22), and the
`@0.32.1` pins `ci/check-pinned-runs.mjs` compares (find them with
`grep -rn '@0.32.1' README.md scripts/README.md`). The `## [0.33.0]` heading and the
release tag stay the owner's call.
Verify: every CI gate: `node --test && node ci/validate-plugin.mjs && node ci/validate-skills.mjs && node ci/validate-install-sets.mjs && node ci/check-pinned-runs.mjs && node scripts/adapters/generate.mjs --check && node scripts/build-doc-card-builder.mjs --check && node scripts/build-native-adapter-config.mjs --check && node scripts/build-state-baseline.mjs --check && node scripts/build-figma-checks.mjs --check`
→ every command exits 0.

## Phase 1c: what shipped and where it diverged

Built 2026-11-06 (C1–C5). `screens.mjs` records a product-file screen under
`figma@<fileKey>:<screen>` with `fileKey` and `library.pages`; the drift screens
snippet reads such entries through `library = { cache, systemCollectionKeys }`;
`commands/drift.md` checks each connected product file by `fileKey` and reports an
unconnected one as not checked; compose-figma records consumer screens and its
mode line says so; `figma-scripting.md`'s `fileKey` claim is corrected; README and
CHANGELOG updated. `node --test` and every gate pass.

Where it diverged:
- **The screens snippet needed two more inlined sources**: `figma-compose-library.mjs`
  (the merge) and `figma-variables-read.figma.js` (the library reader resolves
  local variable values). Without them a consumer entry threw at run time.
- **A library part can't "leave the page" while its screen exists.** The screen's
  own instances are on its recorded page, so the inventory always finds the set
  they point at. What drift catches is a library update that changes the set (a
  property dropped, an option renamed): the instances follow the update and the
  plan stops resolving. A set deleted from the library leaves its instances
  pointing at the last published version, which still resolves. Tested as the
  first case.
- **`commands/drift.md` now names the active-file preflight** by that phrase, since
  mentioning `figma_execute` makes it a Figma writer to `ci/figma-preflight.test.mjs`.
- **Not run live.** Only the sample file was connected; a product file on the
  system (Zygarden.gg) wasn't. Reads by `fileKey` are from the bridge's contract and
  this session's runs against the active file, not yet against a file in the
  background.

## Plan, phase 1c

Phase 1c only (Q33, Q40–Q47): drift for screens composed in a product file built on
the system. Same conventions as phases 1 and 1b. Steps are numbered C1–C6.

### Step C1 — Record a consumer screen

Files: `scripts/screens.mjs`, `scripts/screens.test.mjs`
Change: `record` takes `--file-key <key>` and `--library-pages <a,b>`; with
`--file-key`, the entry's key is `figma@<fileKey>:<folded screen>` (Q40) and it
stores `fileKey` and `library: { pages }` (Q41). `forget` takes `--file-key` too.
Without it, nothing changes.
Verify: tests record a system-file and a product-file screen of the same name and
both survive; forget removes only the one named.

### Step C2 — The drift snippet reads through the library

Files: `scripts/lib/figma-drift-screens.figma.js`, `scripts/build-figma-checks.mjs`
(the call contract), `scripts/build-figma-checks.test.mjs`, regenerated
`references/figma-drift.md`
Change: `SPEC = { entries, library? }`, `library = { cache, systemCollectionKeys }`.
An entry with `library` reads its inventory with
`{ componentsPage, iconsPage, library: { pages: entry.library.pages, cache, systemCollectionKeys } }`;
the inventory memo key includes those pages (Q43).
Verify: the fake-Figma test resolves a consumer entry whose component exists only
as a library instance, and reports it `broken` when that instance is gone.

### Step C3 — Drift's live half per file

Files: `commands/drift.md`, `references/figma-scripting.md`
Change: group Figma entries by `fileKey` (none = the system file). Run each product
file's group with `figma_execute`'s `fileKey` and `SPEC.library` from Q43; a file
the bridge isn't connected to (`figma_list_open_files`) is reported not checked,
its screens keeping the offline state (Q42). Fix the stale `fileKey` claim (Q45).
Verify: `node ci/validate-skills.mjs`; read by eye against Q42.

### Step C4 — Compose records consumer screens

Files: `commands/compose-figma.md`, `scripts/lib/design-mode.mjs` (+ test)
Change: step 7 records consumer runs with `--file-key` and `--library-pages`;
step 9 and the consumer `reason` stop saying drift isn't tracked (Q44).
Verify: `node --test scripts/lib/design-mode.test.mjs`; `build-figma-checks --check`.

### Step C5 — Copy

Files: `README.md`, `CHANGELOG.md`
Change: Q46.
Verify: reviewed by eye.

### Step C6 — Gates and a live run when a product file is open

Verify: `node --test` and every `ci.yml` gate exit 0. A live run needs a product
file on the system open in the bridge (Zygarden.gg on the Zygarden Design System);
until one is, say so rather than claim it.

