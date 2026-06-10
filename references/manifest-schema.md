# The `design-system.json` manifest

This file is the single source of truth for **what has been set up** in a user's
design system. It lives at the root of the user's working directory. It does NOT
store token values (Figma owns those) — it stores decisions, progression state,
and pointers.

Every skill's first action is to read this file (creating it with defaults if
absent). Every skill's last action is to update the fields it owns and report
what changed. Gating decisions are made by reading this file: if a prerequisite
field is unset, the skill **offers** to run the prerequisite skill rather than
bailing or running silently.

## Schema (schemaVersion 3)

```json
{
  "schemaVersion": 3,
  "user": {
    "codingLevel": "new"
  },
  "project": {
    "uiFramework": null
  },
  "workspace": {
    "name": "my-design-system",
    "localPath": ".",
    "stage": "folder",
    "origin": null,
    "detectedLayers": {
      "monorepo": null,
      "storybook": null,
      "tokens": null,
      "syncLayer": null
    }
  },
  "figma": {
    "mechanism": null,
    "fileKey": null,
    "connected": false,
    "lastVerified": null,
    "coverPageBuilt": false,
    "canPublish": null,
    "libraryPublished": false,
    "publishedAt": null
  },
  "tokens": {
    "intakeMode": null,
    "tiers": 2,
    "primitivesBuilt": false,
    "semanticBuilt": false,
    "stylesBuilt": false,
    "collections": [],
    "styleGroups": [],
    "lastSync": null
  },
  "sheets": { "built": false },
  "icons": {
    "library": null,
    "version": null,
    "built": false,
    "packageInstalled": false,
    "subset": []
  },
  "components": {
    "built": [],
    "meta": {},
    "instanceSwapUpgradePending": []
  },
  "repo": {
    "stage": "none",
    "packageManager": "pnpm",
    "monorepo": "turborepo",
    "remote": null
  },
  "sync": {
    "platforms": [],
    "customAdapters": [],
    "lastRun": null
  },
  "storybook": {
    "initialized": false,
    "chromatic": false,
    "codeConnect": false
  },
  "completedSkills": []
}
```

## Field reference

### `user`
- `codingLevel` — `"new"`, `"some"`, or `"comfortable"`. Governs how much
  code/git/terminal concepts are explained in the code-touching skills. Set in
  `figma-environment-setup` via concrete anchoring questions; changeable
  anytime. See `${CLAUDE_PLUGIN_ROOT}/references/coding-level.md`. Changes explanation only, never
  capability. Default `"new"` (over-explaining is recoverable; under-explaining
  strands beginners).

### `project`
- `uiFramework` — the target UI framework (e.g. `"shadcn"`, `"mui"`,
  `"vanilla"`, or a generated target). Captured **lazily at first relevance** —
  by whichever of `component-builder` or `token-sync-layer` runs first — and read
  by both, so it's asked once. It does **not** affect tokens (framework-neutral)
  and does **not** affect Figma component *structure* (also neutral); it informs
  component **variant vocabulary and naming** so the Figma component API lines up
  with the framework's code component API. For multi-framework targets, use a
  neutral vocabulary and let each adapter map it.

### `workspace`
- `name` — human-friendly project name the user picked.
- `localPath` — path to the working directory, relative to the manifest. Almost
  always `"."` since the manifest lives in the working dir.
- `stage` — the folder→git→github progression. One of:
  - `"folder"` — a plain local folder, no version control. The default. The
    entire Figma authoring phase (skills 0–4) is fully usable in this stage.
  - `"local-git"` — `git init` has been run; local history exists, no remote.
  - `"github"` — connected to a GitHub remote; PRs and CI are possible.

  Advancing stages is the job of the repository-builder skill (5). Downstream
  skills that need a later stage (e.g. token-sync wants at least `local-git`)
  read this field and offer to advance it.

- `origin` — how the user's project was configured at intake time. Set **once** by
  `figma-environment-setup` Step 0 and never overwritten by any downstream skill.
  Values:
  - `"greenfield"` — empty or newly created folder; no repo or tooling detected
  - `"existing-repo"` — `package.json` present but no monorepo config; user will need
    to convert to monorepo before the code phase
  - `"existing-monorepo"` — `detectedLayers.monorepo` is `true` (see detection criteria there); code
    phase skills should adapt rather than scaffold from scratch
  - `"unknown"` — scan was inconclusive; treat conservatively (prompt the user)
  - `null` — intake has not yet run (default)

- `detectedLayers` — snapshot of tooling found in the working directory at intake time.
  Written by `figma-environment-setup` Step 0, read by downstream skills to adapt
  behavior. `null` = not yet scanned. `false` = scanned, not found. `true` = found.
  `detectedLayers` records pre-existing tooling found before any skill ran; it does not replace the canonical per-skill flags (`storybook.initialized`, `repo.monorepo`, etc.) which track whether this project's skills have set those layers up.
  - `monorepo` — both `turbo.json` and `pnpm-workspace.yaml` are present
  - `storybook` — `.storybook/` directory is present
  - `tokens` — `tokens.json` or a `tokens/` directory is present
  - `syncLayer` — `style-dictionary.config.js` or `*.style-dictionary.js` files present at the project root or within immediate subdirectories

### `figma`
- `mechanism` — which write mechanism is active. One of `"console-mcp"`
  (default, recommended) or `"official-plugin"` (lower-setup fallback). Set by
  skill 0. The adapter layer in every Figma skill reads this to know which tool
  names to use.
- `fileKey` — the Figma file key the system writes into (extracted from the
  file URL). Lets skills target the right file without re-asking.
- `connected` — whether setup completed successfully at least once. Note this is
  a record of *setup completion*, not live connection state — connection is
  verified live each run (see skill 0's liveness check).
- `lastVerified` — ISO timestamp of the last successful liveness check.
- `coverPageBuilt` — whether the branded **Cover** page has been generated in the
  file (set by `token-sheet-builder`, *not* `figma-environment-setup` — the Cover
  is built after tokens and styles exist so it can be on-brand). The plugin cannot
  set the file thumbnail via the API, so "set as thumbnail" stays a one-time manual
  user step.
- `canPublish` — whether the user can publish a Figma **team library** (requires
  a paid plan, Professional+). `true` / `false` / `null` (unknown / not yet
  asked). Asked once and recorded; gates the typed instance-swap dropdown path.
  See `${CLAUDE_PLUGIN_ROOT}/references/figma-publishing.md`.
- `libraryPublished` — whether the user has published the file as a library at
  least once (so local component keys resolve for `INSTANCE_SWAP`). User-driven
  and manual; the plugin verifies, never publishes.
- `publishedAt` — ISO timestamp the user last confirmed a publish, for "you may
  need to re-publish after adding components" messaging.

### `tokens`
- `intakeMode` — how the user started: `"generative"` (seed expanded by AI),
  `"descriptive"` (from aesthetic direction), or `"import"` (existing set
  organized). Recorded so later runs know how the system was built.
- `tiers` — `2` (primitive + semantic, default) or `3` (adds a component tier,
  multi-brand opt-in only).
- `primitivesBuilt` / `semanticBuilt` / `stylesBuilt` — phase completion flags.
  The primitive→semantic checkpoint seam depends on the first two; `stylesBuilt`
  covers the text/effect/grid styles phase.
- `collections` — names of the Figma variable collections created. With the
  per-category structure this is several names per tier, e.g.
  `["_Color/Primitive", "Spacing/Primitive", "_Typography/Primitive",
  "_Radius/Primitive", "_Border/Primitive", "Color/Semantic", "Spacing/Semantic",
  "Typography/Semantic", "Radius/Semantic", "Border/Semantic"]`.
- `styleGroups` — names of Figma style groups created (e.g.
  `["Text", "Elevation"]`). Styles are distinct from variables.
- `lastSync` — ISO timestamp tokens were last extracted to code (set by skill 6,
  not by the token builder).

### `sheets`
- `built` — whether the visual "Foundations" page has been generated. Swatches
  live-bind to variables; labels/descriptions are snapshots refreshed by
  re-running the token-sheet-builder.

### `icons`
- `library` — `"lucide"`, `"material"`, or `"custom"`.
- `version` — the library version the Figma mirror was built from (e.g. Lucide
  `"0.424.0"`). The drift check compares this against the installed npm package
  so the Figma icons and code icons stay the same generation. `null` for custom.
- `built` — whether the Figma Icons page has been populated.
- `packageInstalled` — whether the code-side npm package (`lucide-react`,
  `@mui/icons-material`) has been installed. Library icons reach code via install
  + name mapping, never by generating component code; custom icons reach code via
  the sync layer's SVGR pipeline instead.
- `subset` — the curated list of icon names imported (most projects need a
  subset, not the full library). Grows by re-running icon-system-builder.

### `components`
- `built` — array of component names created in Figma (e.g. `["Button",
  "Input"]`). Each component's spec, including icon-slot contracts, is recorded
  for the code side (via Code Connect when available, else the repo component
  spec).
- `meta` — object keyed by component name holding the values stamped onto each
  component's documentation artboard (see
  `${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md`): `{ "Button":
  { "status": "stable", "updatedAt": "<ISO>" } }`. `status` is one of
  `"draft"` / `"beta"` / `"stable"` / `"deprecated"`. **Lifecycle:** a component
  is created at `"draft"` by `component-builder` (Figma exists, no code yet) and
  promoted to `"stable"` by `storybook-chromatic-builder` when its code + stories
  are built and approved. That promotion also writes the new chip color +
  last-updated date back into the Figma doc card (see "Promoting a component's
  status" in `${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md`) — so
  the manifest and the artboard never disagree. Re-running a component refreshes
  its `updatedAt`. Keep `built` (names) as the source of truth for "exists";
  `meta` is supplementary doc metadata.
- `instanceSwapUpgradePending` — array of component names whose icon/component
  slots were built with the **toggle + manual-swap fallback** because the
  library wasn't published yet, so the typed `INSTANCE_SWAP` dropdown is still
  owed. A later run (after the user publishes) reads this, adds the typed
  dropdowns, and clears the entry. See
  `${CLAUDE_PLUGIN_ROOT}/references/figma-publishing.md`.

### `repo`
- `stage` — mirrors `workspace.stage` for the repo concern; kept here so repo
  tooling reads one place. Keep in sync with `workspace.stage`.
- `packageManager` / `monorepo` — defaults `pnpm` / `turborepo`. Recorded so
  later skills don't re-ask.
- `remote` — the GitHub remote URL once `stage` is `"github"`, else `null`.

### `sync`
- `platforms` — array of adapter targets configured, e.g.
  `["shadcn", "ios-swift"]`. Curated adapters map to vetted presets; any other
  name is a generated (Tier 2) adapter.
- `customAdapters` — names of validated generated adapters saved to
  `packages/tokens/adapters/` for reuse, so future syncs don't regenerate them.
- `lastRun` — ISO timestamp the sync command last ran.

### `storybook`
- `initialized` / `chromatic` / `codeConnect` — setup flags. `codeConnect` stays
  `false` when the user's Figma plan doesn't support it (the storybook skill
  degrades gracefully).

### `completedSkills`
- Append-only list of skill identifiers that have run to completion at least
  once. Useful for the `/design-system-status` command and for friendly
  "you've already done X" messaging. Never used as the *sole* gate — always
  pair with the specific field (e.g. check `tokens.primitivesBuilt`, not just
  presence in this list).

## Rules for skills touching the manifest

1. **Read first, create if absent.** If the file doesn't exist, create it with
   the defaults above. Never assume it exists.
2. **Migrate forward on `schemaVersion` mismatch.** If you read a lower
   `schemaVersion` than you expect, add missing fields with defaults and bump
   the version. Never delete fields you don't recognize (forward-compat).
3. **Only write the fields you own.** The token builder doesn't touch
   `storybook`; the storybook skill doesn't touch `tokens.primitivesBuilt`.
4. **The manifest is human-readable on purpose.** A designer should be able to
   open it (or run `/design-system-status`) and understand the state of their
   system. Keep it tidy; don't dump opaque blobs into it.
5. **Never store secrets.** No Figma tokens, no Chromatic tokens, no
   credentials of any kind. The manifest is committed to the repo once
   `workspace.stage` advances — treat it as public.
6. **`workspace.origin` is immutable after intake.** Written once by
   `figma-environment-setup` Step 0 and must not be overwritten by any downstream
   skill. Skills read it to adapt behavior — they do not modify it.
