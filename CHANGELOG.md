# Changelog

All notable changes to Throughline are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org).

## [Unreleased]

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

[Unreleased]: https://github.com/jrpease/throughline/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jrpease/throughline/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jrpease/throughline/releases/tag/v0.1.0
