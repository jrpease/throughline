Compose the screen the user asked for in Figma, from what the file already has:
a throughline system (mode a), either in the system's own file or in a product
file that uses it as a library, or a connected library with the file's own parts
filling the gaps (mode b). Use the settings already in `design-system.json` and
`design/workspace.json` rather than re-asking them. Scale explanation to
`user.codingLevel`. `<dir>` below is the working directory.

0. **Know the mode.** Run `figma_get_status` for `currentFileKey` (this also
   confirms the bridge is connected; which file is the target is checked in step
   2), and read `figma.fileKey` and `figma.collectionKeys` from
   `design-system.json` if the file exists.
   Unless the user named them, ask which page the screen goes on (it's created if
   missing), and which page holds the file's own component sets, if it has any. Run the snippet
   in `.throughline/references/figma-compose.md` verbatim, called as its
   "How to call it" section says (`MODE` and `SPEC` declared above it,
   `return await runCompose(MODE, SPEC);` below it), with `MODE = 'signals'` and
   `SPEC = { pages, manifestFileKey, openFileKey, systemCollectionKeys, forced }`:
   `pages` is the target page, the component sets' page, and any page the user
   named (when the target page is new and the file uses a library, ask for a page
   that already uses it: library parts and text styles are read only from `pages`),
   `manifestFileKey` is that `figma.fileKey` or null,
   `systemCollectionKeys` is that `figma.collectionKeys` or null, `openFileKey` is
   `currentFileKey`, and `forced` is `'c'` when the user said to ignore the
   library, `'b'` to ignore the system, else null. Save the return unchanged to a
   scratch file.
   - Mode a and not `consumer` (the system's own file): once step 2 has confirmed
     the active file, record its collection keys with
     `node .throughline/scripts/design-workspace.mjs system keys --dir <dir> --from <signals file>`.
     If it says the file was rewritten, tell the user why the diff is bigger than
     one field. If it exits 1, stop and report it: the file read wasn't the system's.
   - `askSystem` not empty: ask once, naming each library, whether one of them is
     this repo's throughline system. On a pick, run
     `design-workspace.mjs system keys --dir <dir> --from <signals file> --library <name>`
     and run `signals` again. On no, go on in mode b and say it will ask again
     next run.
   - A mode a run with `consumer: true` is a product file that uses the system as
     its library: mode a's rules, with the library read as in mode b.

   Tell the user the `reason` it returns. Mode c (no system, library or
   variables) isn't built yet: say so, as mode 3, and stop.
1. **Know the file.** In mode a the file is `design-system.json`'s
   `figma.fileKey`, or `currentFileKey` in a consumer run. In mode b it is
   `design/workspace.json`'s `fileKey` if that names the open file, else
   `currentFileKey`. Record it, in mode b only and only when there is no
   `design-system.json` (a system repo gets nothing under `design/`), with
   `node .throughline/scripts/design-workspace.mjs workspace set --dir <dir> --file-key <fileKey> --mode <mode>`,
   adding `--library <url>` for each library link the user gives.
2. **Confirm the active file.** Run the preflight in
   `.throughline/references/figma-scripting.md` ("confirm the *active*
   file is your target") against that fileKey, and pin it with `figma_navigate`
   (`lock: true`) for the run. Unpin when done. Then record the system's keys if
   step 0 said to.
2b. **Read the library** (when `libraryDetected`: mode b, or a consumer run). The
   script keeps the cache under `design-system/` when `design-system.json` exists,
   else under `design/`. Tell the user the file
   must be the tab in front in Figma: library imports hang otherwise. Run
   `MODE = 'library-list'`, `SPEC = {}`, and save its return unchanged to a scratch
   file. If `design-workspace.mjs cache get --dir <dir>` prints `null`, or its
   collection keys differ from the list's, run
   `design-workspace.mjs cache init --dir <dir> --from <list file>`, then
   `MODE = 'library-import'` with `SPEC = { keys }` for every variable key in the
   list, 20 keys a call; save each return unchanged and run
   `design-workspace.mjs cache merge --dir <dir> --from <that file>`. Otherwise
   run `design-workspace.mjs cache missing --dir <dir> --from <list file>`: any
   keys it prints are variables no import has filled (one timed out, or the
   library added them since), so import and merge those the same way. Name to the
   user any variable a return lists under `skipped`. A call that
   times out means the file isn't in front: say "bring the file to the front and
   re-run", not a composer bug. If the user gave a library link and
   `FIGMA_ACCESS_TOKEN` is set, also call `figma_get_library_components` with that
   link, and reshape its results into `[{ key, type }]` (`type` is
   `'COMPONENT_SET'` for a component set, else `'COMPONENT'`) to pass as
   `components`. Those are imported by key,
   which hung live on 2026-10-30 for components (variables imported fine): if the
   inventory times out with them, run it again without `components` and say which
   library parts the run could only see through instances already placed.
3. **Read what exists.** Run the snippet with `MODE = 'inventory'` and
   `SPEC = { componentsPage }`. In mode b add
   `library = { pages, components, cache, tokens }`: `pages` as in step 0,
   `components` from step 2b (or leave it out), `cache` from
   `design-workspace.mjs cache get --dir <dir>` and `tokens` from
   `design-workspace.mjs tokens --dir <dir>`, both unchanged; `componentsPage` may
   be left out when the file has no component sets of its own. A consumer run
   passes the same `library` with `systemCollectionKeys` (`figma.collectionKeys`)
   inside it, and needs no `componentsPage`. If the plan will set
   an instance-swap property (an icon, say), ask which page holds the swap targets
   and run `inventory` again with `iconsPage` (in mode b, library icons placed on
   `pages` are swap targets already).
4. **Plan.** Write the screen description (its shape is the `DESCRIPTION` comment
   in the snippet, at the top of the resolver) using only names from the
   inventory's summary: component sets and their properties and options, variables
   by kind, text styles, modes. Leave `sizing` off an instance unless it should
   fill; `hug` works only on a set whose summary says `autoLayout: true`. Frames
   carry layout only (auto layout, gap, padding, fill, stroke, radius); everything
   the user sees is a component instance or styled text. Library text styles in
   use on the loaded pages are in the summary. In a consumer run only library
   parts are in the summary and `{ raw }` is refused, so a request only one of the
   file's own parts would meet is a gap, handled as below. In mode b only, a colour,
   gap, radius or one padding side the summary has no variable for may be written
   `{ raw: '#rrggbb' }` or `{ raw: 12 }`; the build refuses one a variable holds
   (`raw-has-variable`, naming it), and you use that variable instead. When the
   request needs a component the inventory doesn't have, keep it in the description
   under the name asked for, and don't ask yet: the build (step 5) refuses it,
   names its nearest and writes nothing, and the user is asked on that error
   whether to leave it out, use a named existing component instead, or stop. An
   icon the swap-target page doesn't hold is a gap in the same way. Never draw a
   lookalike from frames.
5. **Build.** Run the snippet with `MODE = 'build'` and
   `SPEC = { componentsPage, iconsPage, description, fileKey }`, plus `library` in
   mode b and a consumer run (as in step 3). If it returns errors, nothing was written. A `missing-component` or
   `missing-swap-target` error goes back to the user as in step 4. Once they
   answer, record each gap, once per gap rather than per attempt:
   `node .throughline/scripts/gap-report.mjs record --system <dir> --side figma --screen <screen> --target <page> --asked <name> --resolution <left-out | used:<Component> | stopped>`.
   Add `--kind icon` for an icon or swap target; `--nearest` with the names the
   build offered, comma-separated (leave it off when there were none); `--need`
   with one sentence on what the screen needed it for; and `--from` with the
   existing components or parts it would have been made of, comma-separated, where that's clear (leave it
   off rather than guess). gap-report keeps them in the system's gap file, or in
   `design/gaps.json` without one. Then
   fix the description and build again. A `name-taken` error on
   `<screen>` means a screen a person made already has that name: ask for another
   name. On `WIP: <screen>` it means an unmarked frame holds the working name: ask
   the user to rename or remove it. If the call throws instead, the build rolled
   itself back and nothing was written: stop, and report the error as a composer
   bug rather than reworking the screen around it (in mode b, a timeout means the
   file isn't in front, as in step 2b). In mode b and a consumer run, save the build's `staleCache`
   unchanged and run `design-workspace.mjs cache merge --dir <dir> --from <that file>`
   when it holds any entries.
6. **Gate.** Run the screen gate in
   `.throughline/references/figma-adherence.md` verbatim with
   `TARGET = { page, screens: ['WIP: <screen>'], fileKey }` (in mode b and a consumer run, add
   `libraryTokens`: `design-workspace.mjs tokens --dir <dir>`, unchanged) and
   `SKIP = []`. If it fails, stop: report its failures as a composer bug, with
   their links, and leave the `WIP:` frame for inspection. Don't change the
   description to make it pass. Remove that frame with `MODE = 'discard'` and
   `SPEC = { page, screen }` only when the user asks.
7. **Finalize.** Run the snippet with `MODE = 'finalize'` and
   `SPEC = { page, screen, fileKey }`. It replaces an earlier screen of that name
   only if throughline composed it. In mode a in the system's own file (not a
   consumer run, whose screens aren't tracked for drift yet), then record the screen so
   `/throughline:drift` can tell later when what it uses moves: write the
   description the build used to a scratch file, and run
   `node .throughline/scripts/screens.mjs record --system <dir> --side figma --screen <screen> --target <page> --plan <description file> --components-page <componentsPage>`,
   adding `--icons-page <iconsPage>` when the build had one. Mode b records no
   drift.
8. **Review.** Dispatch the `reviewer` agent in Figma-visual mode with the screen's
   node id (from finalize), the fileKey, the working directory and the user's
   request as its spec, unless the host can't dispatch agents, in which case
   screenshot the screen yourself and say so.
9. **Report.** The mode line from step 0, the screen's link, whether it replaced
   an earlier one, the gate's counts, the reviewer's verdict, and every gap: each
   component or icon that was asked for and doesn't exist, with the nearest names
   the script offered, and anything left out of the request because of it. Say
   where the gaps were recorded (`design-system/gaps.json`, or `design/gaps.json`
   in mode b without `design-system.json`), and that `/throughline:gap-report`
   ranks them for triage. In mode a in the system's file, say the screen was
   recorded for `/throughline:drift`. In a consumer run, say drift isn't tracked
   for this file yet, and that components from other connected libraries aren't
   checked against the system; also give the cache lines below. In mode b, also list: the
   local parts the screen used (`localPicks`; when a library was detected and
   `figma_get_library_components` wasn't run, say each may be standing in for a
   library component the run couldn't see, and that giving the library's link lets
   it check); each raw value (`raws`), with its path; whether the cache was stale
   and has been refreshed (naming the cache file the script used); when the
   library was last read in full (the cache's
   `readAt`); and how many library references couldn't be followed to a value (the
   `unresolved` count from `tokens`).

Never edit a component, a variable or a text style, and never write a raw value
except a mode b `{ raw }` no variable holds. A consumer run uses library parts
only. If the screen can't be built from what
the system or library has, the gap is the finding.

