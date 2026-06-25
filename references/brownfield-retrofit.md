# Brownfield retrofit — read discipline, guardrails, safe sequence

Canonical reference for retrofitting a design system onto a **mature codebase and
an already-populated Figma file** (the brownfield path), as opposed to building
greenfield. Read this before running `design-system-audit`, `token-crosswalk-builder`,
`retrofit-planner`, or any brownfield branch of `token-builder`, `token-sync-layer`,
or `storybook-chromatic-builder`.

## The read-discipline principle (fixes bugs B1–B4)

**Never assert that something is absent, empty, unpublished, or stale without an
explicit, completed read that returned that result.** "I didn't find X" must mean
"I queried for X and the result was empty (after the file and all pages fully
loaded)," never "I assumed X from Y." When a result is genuinely undetectable, ask
the user once and persist the answer in the manifest — never guess.

Concrete applications:

- **Variables (B1).** Before counting variables, `await figma.loadAllPagesAsync()`.
  Treat a `0` count on a first read as suspect — re-read before reporting. An
  unexpectedly-empty result is a possible read/cache error, not ground truth. Prefer
  the dedicated `figma_get_variables` tool over a hand-written probe.
- **Styles vs. variables (B2).** Text styles, effect/paint styles, and variables are
  **different surfaces**. Absence of variables says nothing about styles. Query each
  independently — variables (`figma_get_variables`), text styles
  (`figma_get_text_styles`), effect/paint styles (`figma_get_styles`) — and only
  report "none" for the specific class whose own read returned empty.
- **Publish state (B3).** Treat a default/`false` `figma.libraryPublished` as
  _unverified_. Attempt detection first (`figma_get_library_components` /
  `figma_get_library_variables`, library component keys). If inconclusive, ask once
  ("Is this library published to a team library?") and persist to
  `figma.libraryPublished` / `figma.canPublish`. Frame the unpublished path as a
  graceful choice, not a failure.
- **Bridge ports (B4).** Distinguish *live* concurrent bridge instances from
  *dead/stale* entries. Only block on genuinely live ones; reap or offer one-click
  cleanup for stale ones. See the bridge-instance preflight in
  `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`.

## The 7 guardrails (hard "DON'T" rules)

Each cost real debugging time on a live retrofit. Treat each as a hard rule.

1. **Don't bind line-height / letter-spacing variables to text styles.** Figma stores
   them as PERCENT; a unitless ratio var (`1.6`) rebinds as `1.6px` — catastrophic.
   **Font-size binding only** (px→px is safe).
2. **Don't normalize float32 in Figma** — it is a no-op (Figma re-quantizes to float32
   on store). Normalize at the export boundary instead (`Math.round(v*100)/100`).
3. **Don't delete-and-recreate variables to rename** — it unbinds everything. Rename
   in place to preserve Figma IDs (and therefore every existing binding).
4. **Don't trust `tsc` / build to catch Tailwind color-utility removal** — deleted
   utilities become *silent no-ops*. Guard repo-wide across all `.tsx`/`.ts` files
   except generated and test files, and let Chromatic be the net.
5. **Don't assume `build-storybook` exercises all SCSS** — story-unreachable modules
   (and a dead `@import` of a deleted partial) only fail when the real app renders.
   Run the app and spot-check 5–7 routes before declaring an SCSS change done.
6. **Don't carry `/opacity` modifiers onto var-based tokens** — convert to
   `color-mix(in srgb, var(--…) NN%, transparent)` or channel-based alpha.
7. **Don't hand-edit generated files** — change the source and re-run `tokens:sync`.

## The safe retrofit sequence

Run these phases in order; `retrofit-planner` gates each one with a human
confirmation. The ordering rules are not arbitrary — each prevents a specific class
of damage.

1. **audit** — measure both sides (`design-system-audit`). Size the code surface and
   inventory the Figma file with verified per-class reads. Compute `percentSemantic`
   (manifest `audit.percentSemantic`): a system that is already largely semantic is a
   **rename-in-place + cleanup** job; a low-semantic one is closer to a **rewrite**.
   The higher the percentage, the lighter the retrofit — let it right-size the effort.
2. **refine** — rename/realign variables **in place** (`token-builder` brownfield
   branch). Never delete-and-recreate (guardrail 3); run a binding-survival audit.
3. **rebind** — reconcile components onto the refined variables, preserving IDs. No
   dedicated tool — the `retrofit-planner` orchestrator drives this step directly.
4. **sync** — run the sync layer with the brownfield transforms (alpha channels,
   opacity 0–100→0–1, float32 rounding at the export boundary).
5. **baseline** — capture a Chromatic baseline **before** any code retrofit, so
   intended drift-fixes are distinguishable from regressions.
6. **code** — retrofit the codebase with **dual output**: new and old tokens coexist
   during the transition.
7. **cleanup** — remove old outputs **only** after a zero-reference grep passes (the
   repo-wide token-removal guard).

## The verification triad

No single check catches everything; all three are necessary on every retrofit:

1. **`check-types`** (TypeScript) — blind to Tailwind silent no-ops.
2. **`build-storybook` + Chromatic snapshots** — the visual-regression net; blind to
   story-unreachable code. **Chromatic, not `tsc`/build, is the source of truth** for
   color-utility removal.
3. **Run the actual app** + spot-check real routes — the only thing that exercises
   story-unreachable SCSS.
