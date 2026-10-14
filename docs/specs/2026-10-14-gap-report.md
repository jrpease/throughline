# Gap report: record what composers couldn't find, and triage it

Status: built
Reviewed: 2026-10-14 — needs revision (two existing nearest-name tests break, the Figma flow has no `--system`, fold and sort helpers undecided, icon gaps excluded, majority undefined, open questions already implemented, short-name cost unrecorded). Revised the same day; every finding is addressed.
Date: 2026-10-14
Backlog: #112, Phase 5 — #43, folding in #174
Builds on: `docs/specs/2026-10-13-compose-figma-screen.md` and
`docs/specs/2026-10-13-compose-code-screen.md`, whose `missing-component` error
(`{ kind, path, asked, nearest }`) is the record this collects

The owner asked to continue the backlog (2026-10-14), under the session's
standing instruction: "Take your recommendations when you have a question. Only
pull me in when there is an important P0 question." Every decision below was made
by Claude on that instruction, after reading both composers, the proof bundle's
store, and the status command. None was put to the owner one by one, and any can
be reopened. The ones most worth the owner's glance are the ninth command, the
file living in the system repo and committed, recording icons as gaps, and
folding #174 in.

## Goal

Both composers refuse to invent a component the system lacks, but the refusal
lives only in the chat reply and is gone when the session ends. After this ships,
every missing part a composer hits (a component, or an icon the system doesn't
provide) is written to one file in the system's repo, with what was asked, on
which screen, what the user chose instead, and the nearest existing names. The
maintainer runs `/throughline:gap-report` to see those gaps ranked by how many
screens hit them, and marks each one as something to build, an existing thing the
composer missed, or not needed. The roadmap gets a demand signal from real
screens instead of intuition.

## Non-goals

- **Filing issues anywhere.** The report renders each open gap as a draft
  request the maintainer can copy. Posting to GitHub, Linear or Jira is
  outward-facing and differs per team.
- **Building the component.** A gap marked `build` points at
  `/throughline:new-component`; it doesn't run it.
- **Fixing the docs.** A gap marked `exists` points at
  `/throughline:document-component` for the existing component's `whenToUse`; it
  doesn't edit the record.
- **A plan's own mistakes.** Unknown variables, text styles, modes, props and
  options are the planner naming something wrongly, not the system missing
  something. They stay chat-only.
- **Collecting across repos.** One system, one file.
- **Pruning gaps that later ship.** A gap marked `build` stays `build` after the
  component exists. A follow-up can have `report` notice it in `components.built`.
- **#173** (FLOAT aliases in the Figma gate). A different file, a different fix.

## Decisions

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| What gets recorded | A missing part of the system, once the user has chosen what to do about it: `missing-component` from either composer, `missing-swap-target` from the Figma composer, and, on the code side, an icon or other import the package doesn't export (compose-code step 5's "gap in the same way"). Each is recorded with a `kind`: `component`, or `icon` for an icon or swap target. | These mean the system lacks something. Icons are the one real gap both live runs found on the sample, so excluding them would hide the gap the system actually has. Recording after the choice captures the resolution, which is half the signal. | Recording plan mistakes; recording before the user answers |
| Where it lives | `design-system/gaps.json` in the directory holding `design-system.json`. compose-code passes its `--system`; compose-figma passes the working directory where `design-system.json` is (its step 8's directory). Plain committed JSON. No manifest key and no `schemaVersion` bump: the path is fixed, like `design-system/docs/index.json`. | The house convention for a durable record is folder-resident JSON under `design-system/` (the proof bundle, the docs). Committed so a team's runs add up in one place. A fixed path needs no pointer. | `.throughline/` (the adapters' install directory, not state); a manifest key; a gitignored local log |
| Its shape | `{ gaps: { <folded name>: { name, kind, status, note?, nearest, hits: { "<side>:<folded screen>": { side, screen, target, resolution, need?, from?, at } } } } }`. `name` is the first spelling recorded; `nearest` is the latest offered. `side` is `code` or `figma`. `target` is the file path (code) or the Figma page (figma). `resolution` is `left-out`, `used:<Name>` or `stopped`. `need` is one sentence on what the screen needed it for; `from` lists what it would have been built from. `at` is a `YYYY-MM-DD` date. The fold is `composeFold`, exported from `lib/figma-compose.mjs`. Keys are written sorted by a small recursive sort in the script, two-space indented, trailing newline. | Keyed by folded name so `DatePicker` and `date-picker` are one gap. One hit per side and screen, latest wins, so re-running a screen doesn't double-count: the proof bundle's rule. The issue asks for what, where, what it would compose from, and what's closest; each is a field. Sorted keys keep diffs small. Exporting the fold keeps the one import the Shipping row allows. | An append-only log; counting runs instead of screens; importing `normalizeName` or `stableStringify` |
| Who writes it | A new script, `scripts/gap-report.mjs`, with `record`, `report` and `triage` modes. The compose commands run `record` once per gap, after the user's choice. | The agent shouldn't hand-edit JSON the report reads; a script validates it. One script serves both composers. | Each composer writing its own file; prose-only instructions to edit the JSON |
| `record` input | Flags, one gap per call: `--system --side --screen --target --asked --resolution` required; optional `--kind` (default `component`), `--need`, `--from` and `--nearest` (both comma-separated), `--at` (default today). A hit on a gap already marked `build`, `exists` or `dropped` keeps the status. A gap recorded under one `kind` keeps it. | Flags are what the commands already pass. A required screen keeps every hit attributable. A re-hit shouldn't reopen a decided gap; the report still shows the new count. | A JSON input file; reopening triaged gaps on a new hit |
| `report` output | Markdown by default, `--json` for the raw store. Open gaps first, ranked by distinct screens (one screen composed on both sides counts once), then by name; then triaged gaps grouped by status. Each open gap is a draft request: name and kind, the screens and sides that hit it, what each needed it for, what it would be built from, how users got by, and the nearest names. A gap whose hits are mostly (strictly more than half) `used:X` for one `X` is flagged as a likely docs gap for `X`; a single such hit counts. Exits 0, also when the file doesn't exist (it says so). | The maintainer triages from this, so it reads as a list of requests. A user substituting the same existing component is the issue's "composer failed to find it" signal; one hit is still worth a look. | A dump of raw records; failing when there are no gaps |
| Triage | `triage --system <dir> --name <asked> --status build\|exists\|dropped\|open [--note <text>]`. `exists` needs `--note` naming the existing component. An unknown name exits 1 with the nearest gap names. | The issue's two outcomes, plus "not needed" and a way back. `exists` without the component's name answers nothing. | Free-form statuses; deleting gaps |
| Exit codes | 0 ok; 1 a store error (unknown gap name, unreadable or malformed `gaps.json`); 2 usage, which covers every missing required flag (including `--note` on `exists`) and an invalid enum value. | One rule for a missing flag, matching `compose-code.mjs`. | Mixing usage errors into 1 |
| Who runs triage | A new command, `/throughline:gap-report` (the ninth). It runs `report`, walks the open gaps with the maintainer, records each choice with `triage`, and offers the next command for each (`new-component` for `build`, `document-component` for `exists`). `/throughline:design-system-status` gains one bullet: if `design-system/gaps.json` exists, read it and give the count of gaps with `status: "open"`, pointing at the command. It reads the file; it runs no script. | Triage is a user-facing act like composing. Status stays a reading command. | Folding triage into status; status running scripts |
| Nearest names (#174, folded in) | `nearestNames` returns nothing for an asked name that folds to empty, ignores candidates that fold to empty, and keeps a candidate only when one of these holds: the edit distance is at most `max(2, floor(len/3))` of the asked name's folded length; one folded name contains the other; or the asked name is an abbreviation of it (same first character, every character in order). It still returns at most three, ranked as before, and can return none. Applies to every caller in both composers. | `DatePicker` → Spinner, Textarea, Avatar is noise, and the gap file would keep it. Measured: a typo (`Buton`), a qualified name (`PrimaryButton` → Button) and abbreviations (`md` → medium, `lg` → large, `color/bg` → color/background, `Btn` → Button) still get hints. What's lost: a short name with no shared letters in order (a mode `Dark` against Desktop, Tablet, Mobile) gets none, and `Btn` still also offers `Box`. Accepted. | Per-caller thresholds; dropping hints entirely |
| Shipping | `gap-report.mjs` ships in the adapter payload like `compose-code.mjs`: run from the plugin, `.throughline/scripts` in the adapters. It imports only `lib/figma-compose.mjs` (`nearestNames`, `composeFold`) and node built-ins. | The Cursor, Codex and generic commands must run the same script. | A copy in consumer repos |

## Open questions

None open.

## What shipped

- `scripts/lib/figma-compose.mjs`: `nearestNames` cut-off, `composeFold` exported; `references/figma-compose.md` regenerated.
- `scripts/gap-report.mjs` and its test: `record`, `report`, `triage`.
- `commands/gap-report.md` (the ninth command); recording steps in `commands/compose-code.md` and `commands/compose-figma.md`; a gaps bullet in `commands/design-system-status.md`; adapters regenerated.
- `scripts/README.md` row, `scripts/install.test.mjs` payload assertion, README paragraph, CHANGELOG under Unreleased.
- Live run: `docs/notes/2026-10-14-gap-report-live-run.md`.

## Where it diverged

- **Where the gap is recorded.** The Plan put recording in the plan step. Nearest names only exist after `check` (code) or the build (Figma), so both commands record on that error instead. An icon on the code side never produces a `check` error, so it is asked about and recorded at the plan step.
- **Screen names fold.** The hit key and the screen count use `composeFold(screen)`, so one screen spelled two ways on two sides counts once. The Decisions row said "one hit per side and screen" without saying how screens match.
- **The docs-gap line says what it counted** ("used instead in 1 of 1 ask") rather than "most screens", since the rule counts asks, not screens.
- **A triage replaces the note.** Unstated in the Decisions; now in the script header and the command.
- **An icon marked `build`** is pointed at the `icon-system-builder` skill, not `new-component`.
- **The Figma half of Step 5 didn't run live.** The bridge wasn't attached to this session. Its hits were written with the command's own `record` line; the note says what that leaves unmeasured.

## Plan

### Step 1 — `nearestNames` cut-off (#174)

Files: `scripts/lib/figma-compose.mjs`, `scripts/lib/figma-compose.test.mjs`,
`scripts/compose-code.test.mjs`, `scripts/lib/fixtures/figma-compose/missing-component.json`
(only if its expectation names the nearest list), `references/figma-compose.md` (regenerated)
Change: export `composeFold`. In `nearestNames`, return `[]` when `want` is empty;
drop candidates whose fold is empty; keep a candidate only when
`dist <= Math.max(2, Math.floor(want.length / 3)) || x.f.includes(want) || want.includes(x.f) || isAbbrev(want, x.f)`,
where `isAbbrev` is "same first character, and every character of `want` appears in
`x.f` in order". Then sort and slice as today. Update the comment. Existing tests
that assert three names for `DatePicker` (`compose-code.test.mjs:55`,
`figma-compose.test.mjs:75`) change to assert `[]`, and the fixture's `covers`
text follows. New tests: `Buton` → Button first; `PrimaryButton` → Button; `md`
against small/medium/large → medium; `color/bg` → color/background; an empty
fold → `[]`. Regenerate the inlined reference with `node scripts/build-figma-checks.mjs`.
Verify: `node --test scripts/lib/figma-compose.test.mjs scripts/compose-code.test.mjs`
→ all pass; `node scripts/build-figma-checks.mjs --check` → exit 0.

### Step 2 — `scripts/gap-report.mjs`

Files: `scripts/gap-report.mjs`, `scripts/gap-report.test.mjs`
Change: the three modes as decided, with the header comment shape of
`compose-code.mjs`, and the exit codes as decided. `record` creates
`design-system/` if missing. Tests pass `--at` explicitly. Tests cover: record
creates the file; a second screen adds a hit; the same side and screen replaces
its hit; a folded duplicate name joins the existing gap; a triaged gap keeps its
status on a new hit; `report` ranks by distinct screens, counting a screen hit on
both sides once; a single `used:X` hit, and a strict majority of them, flags a
docs gap and an even split doesn't; `report` with no file exits 0; `triage exists`
without `--note` exits 2; an unknown name exits 1 with nearest; a missing
`--screen` exits 2; the written file's keys are sorted.
Verify: `node --test scripts/gap-report.test.mjs` → all pass.

### Step 3 — commands

Files: `commands/gap-report.md` (new), `commands/compose-code.md`,
`commands/compose-figma.md`, `commands/design-system-status.md`
Change: the new command as decided. In compose-code, after the user answers a
gap (step 5, step 6), run
`node ${CLAUDE_PLUGIN_ROOT}/scripts/gap-report.mjs record` once per gap with
`--system` (its own), `--side code`, `--screen`, `--target` (the file path),
`--kind` (`icon` for an un-exported icon), and the resolution chosen. In
compose-figma, after the user answers a `missing-component` or
`missing-swap-target` (step 4, step 5), the same with `--system` the directory
holding `design-system.json`, `--side figma`, `--screen` the description's
`screen`, `--target` its page, `--kind icon` for a swap target. Both report steps
say the gaps were recorded and name `/throughline:gap-report`. Status gets its
bullet. Don't write "copy" or "install" in a paragraph that names a
`${CLAUDE_PLUGIN_ROOT}/scripts/…` path: `ci/validate-install-sets.mjs:62-63`
reads that as an install list.
Verify: `node ci/validate-skills.mjs` → exit 0; `node ci/validate-install-sets.mjs` → exit 0; prose reviewed by eye.

### Step 4 — payload, adapters, docs

Files: `scripts/README.md`, `scripts/install.test.mjs`, `adapters/**`
(regenerated), `README.md`, `CHANGELOG.md`
Change: a `scripts/README.md` row; add `gap-report.mjs` to the must-install list
in `scripts/install.test.mjs:179`; regenerate adapters with
`node scripts/adapters/generate.mjs`; a README paragraph next to the compose
commands; CHANGELOG under Unreleased.
Verify: `node scripts/adapters/generate.mjs --check` → exit 0;
`node ci/validate-install-sets.mjs` → exit 0; `node --test` → all pass.

### Step 5 — live run

On the scratch copy of throughline-sample (`no-repo-has-a-consuming-app` memory),
with the scratch copy as the working directory for both halves so both hits land
in one `gaps.json`: a fresh agent runs `/throughline:compose-code` for "Book a
demo" with a DatePicker and chooses to leave it out. Then `/throughline:compose-figma`
against the sample's Figma file (`figma.fileKey` `OCiZiGpsJ4ncPD8r205BjC`) for a
screen asking for a component the file lacks, resolved with `used:` an existing
one. Then `/throughline:gap-report`, triaging one gap. The file must show both
hits, the report must rank and render them, and the triage must persist. Written
up in `docs/notes/2026-10-14-gap-report-live-run.md`.
Verify: the note, with the file's contents and the report output pasted.
