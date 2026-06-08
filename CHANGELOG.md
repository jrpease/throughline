# Changelog

All notable changes to Throughline are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org).

## [Unreleased]

## [0.7.0] - 2026-06-08

Hardening pass from real build-session testing (token → foundations → icons →
components → Storybook on a pnpm + Turborepo + Next.js 16 + Tailwind v4 monorepo).

### Added
- **New `references/figma-scripting.md` — one home for every `figma_execute`
  gotcha.** A shared reference, wired into `token-builder`, `component-builder`,
  `icon-system-builder`, `token-sheet-builder`, and the status write-back routine.
  Covers: the single-bridge-instance preflight (concurrent writes corrupt the
  file), the `dynamic-page` async APIs (reads, setters, and `getNodeByIdAsync`),
  the `resize()` axis-lock trap, the explicit-`timeout` rule for batch writes
  (`node_count * 3000`), and why large `layoutWrap = "WRAP"` builds time out.
- **Opacity token category (`token-builder`).** First-class `_Opacity/Primitive` +
  `Opacity/Semantic` (disabled, muted, overlay/scrim, hover) on the **0–100 scale**.
- **`text/onEmphasis` color role.** The label/icon color that contrasts a
  `bg/emphasis` fill in every mode — emitted by `token-builder`, consumed by
  `component-builder` for primary/filled controls (distinct from `text/inverse`).
- **"Clip content — off by default" standard.** New section in
  `figma-component-standards.md` and a post-build audit gate: component/layout
  frames set `clipsContent = false` so outer strokes, focus rings, and shadows
  aren't sliced; clipping is reserved for deliberate cutoffs (scroll/crop frames).

### Changed
- **Figma write-back now confirms once, up front.** The status-promotion routine
  and `storybook-chromatic-builder` Step 6 surface a single batched confirmation
  before writing to Figma ("update N doc cards…"), matching the user's mental model
  and pre-empting the safety classifier instead of eating a forced round-trip.
- **Figma scripts default to the async APIs** (`getNodeByIdAsync`,
  `setCurrentPageAsync`, `setTextStyleIdAsync`, …) — the synchronous forms throw
  under the Console MCP's `dynamic-page` document mode.

### Fixed
- **Opacity rendered everything invisible.** Opacity tokens stored `0.1–0.9` were
  divided again by Figma's 0–100 `opacity` binding (→ ~0.004), blanking every
  disabled/overlay state. Primitives are now authored 0–100; `token-sync-layer`
  normalizes ÷100 on extraction so CSS/native get correct 0–1 values. The two
  skills are documented as a matched pair.
- **`resize()` silently collapsed auto-layout frames.** Calling `resize()` on an
  auto-layout frame pinned the opposite axis to `FIXED` (frames stuck at ~10px).
  Documented the re-assert pattern; the post-build audit now reads sizing modes back.
- **Storybook Controls panel was dead.** Generated stories used
  `render: () => …`, so control changes never re-rendered. Step 3 now mandates
  `render: (args) => <Component {...args} />`, and `ReactElement` slot props get
  `control: false` plus a boolean helper arg (e.g. `showAvatar`) instead of a
  broken `[object Object]` control.
- **Typography `@utility` rules were duplicated into Storybook and drifted.**
  Step 1 now checks the app's global stylesheet first and wires a single shared
  `@import` (extracted to the UI package), keeping Storybook-only concerns in a
  separate layer.
- **Storybook wouldn't start on fresh pnpm installs.** Documented adding `esbuild`
  to the root `onlyBuiltDependencies` allowlist when installing
  `@storybook/react-vite` in a pnpm workspace.
- **Icon subset names weren't validated against the package version.** Names
  removed between versions (e.g. `lucide-react` 1.x dropping brand icons) would
  build Figma components with no code counterpart. `icon-system-builder` now
  resolves every subset name against the installed/published library before
  building and reports unavailable ones.
- **Large `WRAP` grids timed out.** Skills now chunk big swatch/variant/icon grids
  into manual rows instead of one wrapped-auto-layout `figma_execute` call.

## [0.6.0] - 2026-06-06

### Added
- **Component sets are laid out as an auto-layout grid.** New "Component set
  arrangement" standard in `figma-component-standards.md`: the `ComponentSet` is a
  real auto-layout frame — one row per variant (type) stepping through its states
  across the columns, with size groups stacked vertically — instead of variants
  scattered at arbitrary coordinates. Wired into `component-builder` Step 3.
- **Focus rings get an accessibility offset.** New `Border/Semantic` `offset/focus`
  token (the `outline-offset` equivalent, aliasing the `2` width primitive). The
  component standards now require focus rings to sit 2px clear of the control edge,
  bound to that token rather than drawn flush, per WCAG focus-visibility guidance.

### Fixed
- **No more Section wrapper around artboards (regression from v0.1).** The skills
  removed the "Section may only wrap the Frame for grouping" escape hatch that was
  letting the agent re-wrap component/icon/token artboards in a `SectionNode`. The
  auto-layout Frame now sits **directly on the page**, and the skills explicitly
  override the Figma Console MCP server's "create a Section first" instruction.
  Applied across `figma-component-standards.md`, `component-builder`,
  `icon-system-builder`, and `token-sheet-builder`; the post-build audit now walks
  the parent chain to the page to catch any stray Section.

## [0.5.0] - 2026-06-04

### Added
- **Import mode runs a completeness pass.** `token-builder` import no longer does
  a 1:1 transcription of a partial source (e.g. a marketing site + brand guide).
  After preserving and organizing the user's values, it diffs them against a
  reference model of a full, flexible system and proactively proposes the missing
  pieces — derived from their existing values — as a preserve-first, opt-in menu
  (tonal ramps, neutral ramp, state colors, dark mode, elevation/radius scales,
  semantic role layer). Adds an explicit full-system checklist.
- **Post-build audit gate for all Figma-writing skills.** A single canonical
  "Post-build audit (REQUIRED before handoff)" checklist in
  `figma-component-standards.md` that reads back the actual node tree (container
  type, auto layout, bound variables, deterministic names, scope/status, visual)
  rather than trusting a screenshot. Wired into `component-builder`,
  `icon-system-builder`, and `token-sheet-builder`.
- **Scope-recognition handoff.** New `references/scaling-up-handoff.md`: when a
  step outgrows a single skill (retrofits, migrations, multi-package refactors),
  skills now surface risks and major parts, confirm scope, and brainstorm/plan
  before building — handing off to Superpowers when available, else planning
  natively. Never a hard dependency. Wired into `component-builder` (retrofit) and
  `repository-builder` (existing app).

### Fixed
- **Setup routes before brainstorming.** `figma-environment-setup` is now labelled
  a setup/process skill that runs before generic brainstorming, with explicit
  trigger phrases, so prompts like "let's set up my design system" no longer get
  hijacked by `superpowers:brainstorming`.
- **Per-category collection segmentation enforced.** `token-builder` description
  and body now lead with the one-collection-per-category-per-tier rule, so it
  stops defaulting to a two-collection (Primitives + Semantic) approach.
- **Deterministic icon acquisition.** `icon-system-builder` now treats the
  cheapest-first mechanism order as a hard gate: a known library (Lucide, Material)
  always uses a community file (#1) or importer plugin (#2), never website-SVG
  fetching (#3, the last resort). Provides named default resources so the choice is
  consistent across runs instead of improvised.
- **Layout container must be an auto-layout Frame, never a Section.** Corrected the
  self-contradictory "Section or Frame with auto layout" rule (Sections have no
  `layoutMode`), across `figma-component-standards.md` and the three skills that
  restate it. Adds a verify step.
- **Doc-card token binding enforced.** The "dogfood the design system" rule now
  includes the binding mechanics (fetch variable IDs, bind don't hardcode), a map
  of card chrome → semantic tokens, and a required read-back gate — since a
  hardcoded hex and a bound variable render identically in a screenshot.

### Changed
- **README** documents the Superpowers partner handoff for big, ambiguous work,
  framed as graceful degradation (plans natively when Superpowers isn't installed).
- **`plugin.json` version** corrected to track the release (was left at `0.3.0`
  through the `0.4.0` tag).

## [0.4.0] - 2026-06-04

### Added
- **Skill 0 intake step (Locate → Scan → Brief).** `figma-environment-setup` now
  opens by asking where to work — use the current directory, point to an existing
  project, or create a new folder — then scans for existing tooling (monorepo,
  Storybook, token pipeline, sync layer) and gives a plain-language situational
  briefing before taking any action. This replaces the old assumption that the user
  is always starting from scratch in the current directory.
- **`workspace.origin` manifest field.** Records how the user's project was
  configured at intake: `"greenfield"`, `"existing-repo"`,
  `"existing-monorepo"`, or `"unknown"`. Set once, immutable after intake.
  Downstream skills will read this to adapt behavior in future brownfield modes.
- **`workspace.detectedLayers` manifest field.** Snapshot of tooling found at
  intake time (`monorepo`, `storybook`, `tokens`, `syncLayer`) with three-state
  semantics (`null` = not yet scanned, `false` = scanned/not found, `true` =
  found). Distinct from the canonical per-skill flags — records what existed
  *before* any skill ran.
- **Manifest schemaVersion 3** — adds the two new workspace fields above and a
  new immutability rule (rule 6: `workspace.origin` must not be overwritten after
  intake).

### Fixed
- **`token-builder` read-backs now use the dynamic-page-safe APIs.** The Console
  MCP bridge runs in Figma's `dynamic-page` document mode, where the synchronous
  document-wide variable getters throw. The verification read-back now prefers the
  `figma_get_variables` tool (with `resolveAliases`), and a Prerequisites note
  directs any hand-written `figma_execute` reads to the async APIs
  (`getLocalVariableCollectionsAsync`, `getVariableByIdAsync`,
  `getVariablesByCollectionAsync`). Avoids a fail-then-retry round trip; creation
  paths were never affected.

## [0.3.0] - 2026-06-04

### Changed
- **Token systems now use per-category variable collections instead of one
  `Primitives` + one `Semantic` collection.** In Figma a mode axis (Light/Dark,
  Desktop/Mobile, Brand) belongs to the *collection*, so the old two-collection
  layout forced every category to share one mode set — dragging spacing, radius,
  and type into color's Light/Dark, where modes are meaningless. `token-builder`
  now creates one collection per category per tier (`_Color/Primitive`,
  `Color/Semantic`, `Spacing/Primitive`, `Spacing/Semantic`, `_Radius/Primitive`,
  `Radius/Semantic`, `_Typography/Primitive`, `Typography/Semantic`,
  `_Border/Primitive`, `Border/Semantic`), so each category owns its own mode
  axis and spacing can take Desktop/Mobile later without disturbing color.
- **Anti-redundancy rule replaced with a structural-consistency doctrine.** Every
  concern now gets both a primitive and a semantic collection; passthrough
  dimensional semantics are kept (they exist to carry a future mode axis) rather
  than collapsed. The one guardrail: semantic names must be real usage roles
  (`inset/md`, `width/focus`), never renamed primitive steps (`space/12`). Applied
  in both `token-builder` and the `brainstorm-before-build` import-mode guidance.
- **Naming model clarified.** In Figma, variables are `/`-grouped and omit the
  category prefix (`gray/50`, `text/primary`); the dotted form (`color.gray.50`)
  is the logical/code identity the sync layer derives by prefixing the
  collection's category.
- **`token-sync-layer` now handles the multi-collection structure** — it iterates
  N collections, treats single-mode collections as non-themed (no phantom
  `default` theme), emits brand themes from multi-mode primitive collections, and
  applies a collection→token-name mapping rule. Adapters gain a `[data-brand]`
  selector for the brand axis.

### Added
- **Border-width tokens.** Primitive `width/{0,1,2,4}` (`_Border/Primitive`) and
  semantic `width/{default,focus,emphasis}` (`Border/Semantic`). `component-builder`
  now binds component borders to them, and `token-sheet-builder` renders a
  border-width section on the Foundations page. Previously borders only had color.
- **Multi-brand model.** Brand lives as a mode axis on `_Color/Primitive` (raw
  palettes) and Theme on `Color/Semantic` (Light/Dark) — two independent axes in
  two collections, keeping each under the Figma Professional 4-modes-per-collection
  cap instead of multiplying brand × theme into one collection.

### Fixed
- **Non-color categories no longer inherit color's Light/Dark modes.** Grouping
  `space` in the same collection as `color` forced spacing to carry Light/Dark,
  which made no sense and left no room for spacing's own Desktop/Mobile axis. The
  per-category split resolves this. Verified end to end against a live Figma file.

## [0.2.3] - 2026-06-03

### Fixed
- **Finalizing a component now updates its Figma doc card.** When a component
  reached the end of the pipeline (code + stories built and approved), its Figma
  artboard kept showing the `draft` pill forever — nothing promoted it. Components
  now have an explicit lifecycle: `component-builder` creates them at `draft`, and
  `storybook-chromatic-builder` promotes them to `stable` on finalize, writing the
  new chip color (→ success) and last-updated date back into the doc card (a new
  Step 6). The status chip, its label, and the date node are now built with
  deterministic names (`Status`, `Status Label`, `Last Updated`) so the write-back
  can find them, and a canonical "Promoting a component's status" routine in
  `references/figma-component-standards.md` keeps the manifest and the artboard in
  sync. Falls back gracefully (manifest-only) when Figma isn't connected.

## [0.2.2] - 2026-06-03

### Fixed
- **`token-sheet-builder` now fully binds the Foundations page chrome to the
  system, not just the swatches.** Previously section titles, labels, and
  hex/value text kept raw fonts and hardcoded colors, and section/background
  fills were unbound — so switching the file from Dark to Light left titles and
  panels stranded (e.g. black text on a black surface) and the showcase looked
  broken. The skill now requires every text node to use a text style and every
  fill (text *and* chrome/background) to bind to a semantic color variable, and
  adds a both-modes validation step (set the non-default mode, screenshot,
  confirm legibility, restore) to catch any unbound fill before the checkpoint.

## [0.2.1] - 2026-06-03

### Fixed
- Visual-validation loop now prefers the plugin-side **`figma_capture_screenshot`**
  (bridge `exportAsync`) over the REST-based `figma_take_screenshot`, which
  frequently fails with a token/auth error. Applies to all screenshot steps
  (component cards, icon grid, Foundations page, cover page).

### Changed
- **README marketing refresh** — lead with proof badges (live Storybook, public
  Figma file) and a pipeline diagram, add a "See a real system built with it"
  showcase embedding screenshots from the
  [sample repo](https://github.com/jrpease/throughline-sample), and a "Show it off"
  badge for users. The full skill walkthrough and docs are preserved below.

## [0.2.0] - 2026-06-02

### Added
- **Cover page** — `figma-environment-setup` now builds a branded **Cover** page
  (name, author, last-updated, a clean graphic) as the file's first page, with a
  prompt to manually "Set as thumbnail" (the API can't set it).
- **`references/figma-publishing.md`** — when/how the user publishes their Figma
  file as a team library, the plan/automation constraints, and how it gates typed
  `INSTANCE_SWAP` dropdowns.
- **Manifest schemaVersion 2** — added `figma.coverPageBuilt`, `figma.canPublish`,
  `figma.libraryPublished`, `figma.publishedAt`, `components.meta` (per-component
  status + last-updated), and `components.instanceSwapUpgradePending`.
- **Documentation artboards & canvas layout** standards in
  `references/figma-component-standards.md` — token-styled doc cards, orderly
  in-Section arrangement, and a required visual-validation loop.
- **Model recommendations** documented in the README.

### Changed
- `component-builder` — soft-gates icons first (recommend, not block); wraps each
  component in a token-styled documentation card; publish-aware instance swap
  (typed dropdown when published, toggle + manual-swap fallback otherwise, with a
  tracked upgrade pass); records component status/last-updated.
- `icon-system-builder` — lays the icon set on a single documentation card and
  adds an (optional, plan-aware) library **publish checkpoint** after icons.
- `token-sheet-builder` — applies the layout discipline + visual-validation loop
  to the Foundations page.
- `repository-builder` — when `gh` is absent, **actively recommends and guides**
  installing the GitHub CLI before falling back to the manual browser path.
- `storybook-chromatic-builder` — Code Connect step notes publish state and
  pending instance-swap upgrades (without blocking the code side). **Chromatic
  defaults to full snapshots (TurboSnap off):** TurboSnap's incremental model is
  fragile for token-driven systems — token changes are global, and it misses them
  both by not tracing linked-workspace token packages and by diffing only against
  the previous branch build. Guidance now recommends snapshotting every story
  (cheap at typical counts, never misses a global token change); TurboSnap only at
  large story counts. `token-sync-layer` cross-references this on the sync PR.
- `figma-environment-setup` — now pinned to **Haiku** (lightweight scripted
  setup); also retains the launch-vs-connection troubleshooting split from before
  (npm cache `EACCES` remedy, network, missing Node).

### Deferred
- Improvement-capture → auto-PR self-improvement feature (its own future session).

## [0.1.0] - 2026-06-02

### Added
- Initial release.
- Nine skills covering the full design-to-code line: `figma-environment-setup`,
  `token-builder`, `token-sheet-builder`, `icon-system-builder`,
  `component-builder`, `repository-builder`, `token-sync-layer`,
  `storybook-chromatic-builder`, and `component-pipeline`.
- Three slash commands: `/design-system-status`, `/sync-figma-tokens`, and
  `/new-component`.
- Bundled Figma Console MCP server config (`.mcp.json`).
- Reference docs for coding level, manifest schema, sync adapters, Figma
  component standards, and brainstorm-before-build.

[Unreleased]: https://github.com/jrpease/throughline/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/jrpease/throughline/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jrpease/throughline/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/jrpease/throughline/compare/v0.2.1...v0.2.3
[0.2.1]: https://github.com/jrpease/throughline/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jrpease/throughline/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jrpease/throughline/releases/tag/v0.1.0
