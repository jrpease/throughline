# ThroughLine (Codex adapter)

ThroughLine builds a design system end to end. Load the matching prompt for the task at hand.

## ThroughLine skills

- `component-builder` — Build Figma components — buttons, inputs, cards, badges, chips, modals, and more — with variant matrices (types, sizes, states) and icon/component/content slots bound to the design system's tokens and styles. → load `prompts/component-builder.md`.
- `component-pipeline` — Take a single new component from Figma to fully-built-and-storied code, end to end — build it in Figma, sync any new tokens it introduced, then build its code component and stories. → load `prompts/component-pipeline.md`.
- `design-system-audit` — Measure a pre-existing design system before retrofitting it onto tokens, so the retrofit is right-sized. → load `prompts/design-system-audit.md`.
- `figma-environment-setup` — Set up the local working folder and connect Codex to Figma so the design-system skills can read and write variables, styles, and components. → load `prompts/figma-environment-setup.md`.
- `icon-system-builder` — Build an icon system in Figma — a dedicated "Icons" page of well-named, scalable icon components from Lucide, Tabler, Phosphor, Material, or custom SVGs. → load `prompts/icon-system-builder.md`.
- `repository-builder` — Graduate the local design-system folder into a real monorepo — a pnpm + Turborepo workspace with packages for tokens and UI components — and walk the user from a plain folder to local git to a GitHub remote with PRs and CI. → load `prompts/repository-builder.md`.
- `retrofit-planner` — Orchestrate a full brownfield design-system retrofit end to end — audit, refine, rebind, sync, baseline, code, docs, cleanup — with a human confirmation gate between every phase. → load `prompts/retrofit-planner.md`.
- `storybook-chromatic-builder` — Stand up Storybook in the monorepo, build code components matching the Figma design system, generate stories for every component, set up Chromatic for visual regression testing, and wire Code Connect when the user's Figma plan supports it. → load `prompts/storybook-chromatic-builder.md`.
- `token-builder` — Build a two-tier (primitive + semantic) design token system as Figma variables — color ramps, spacing, type scale, radius, shadows — with light/dark or brand modes, using one collection per category per tier. → load `prompts/token-builder.md`.
- `token-crosswalk-builder` — Build the brownfield token crosswalk — a persistent three-way map between each new token, the old Figma variable, and the old code identifier(s) — then wire the tokens:validate CI gate. → load `prompts/token-crosswalk-builder.md`.
- `token-sheet-builder` — Build an on-brand "Foundations" page in Figma that visually documents every variable collection and style — color ramps with swatches, the type scale, spacing, radius, shadows/elevations. → load `prompts/token-sheet-builder.md`.
- `token-sync-layer` — Sync Figma design variables into code-ready token files via DTCG JSON and Style Dictionary, emitting framework-specific outputs (shadcn/Tailwind, MUI, vanilla CSS, iOS Swift, Android Kotlin, or custom), and set up the reusable "sync figma tokens" command. → load `prompts/token-sync-layer.md`.

## ThroughLine commands

- `design-system-status` — Show a plain-language summary of the current design system state — what's set up, what's not, and sensible next steps — read from design-system.json. → load `prompts/design-system-status.md`.
- `document-component` — Author, refresh, or reconcile the usage documentation for one existing component — draft its canonical doc record from four sources, project it to Figma, the doc card, and code, and resolve any drift via a reviewable per-item choice. → load `prompts/document-component.md`.
- `new-component` — Build a single new component end to end — in Figma, then sync any new tokens, then build its code component and stories — with a confirmation between each stage. → load `prompts/new-component.md`.
- `start` — Start building your design system — the deterministic entry point. → load `prompts/start.md`.
- `sync-figma-tokens` — Re-run the Figma-to-code token sync — extract current Figma variables, rebuild code outputs via Style Dictionary, and open a PR with the changes for review. → load `prompts/sync-figma-tokens.md`.

## MCP servers

Figma access is provided by the `figma-console` MCP server. See `codex-mcp.toml` for the config to add to your Codex `mcp_servers`.
