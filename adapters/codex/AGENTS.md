# ThroughLine (Codex adapter)

ThroughLine builds a design system end to end. Load the matching prompt for the task at hand.

## ThroughLine skills

- `component-builder` — Build a foundational set of Figma components — buttons, inputs, cards, badges, chips, modals, and more — as properly structured components with variant matrices (types, sizes, states) and icon/component/content slots, bound to the design system's tokens and styles. → load `prompts/component-builder.md`.
- `component-pipeline` — Take a single new component from Figma to fully-built-and-storied code, end to end — build it in Figma, sync any new tokens it introduced, then build its code component and stories. → load `prompts/component-pipeline.md`.
- `design-system-audit` — Measure a pre-existing design system before retrofitting it onto tokens — size the code-side color surface and inventory the existing Figma file with verified per-class reads, then compute how semantic the system already is so the retrofit is right-sized. → load `prompts/design-system-audit.md`.
- `figma-environment-setup` — Set up the local working folder and connect Codex to Figma so the design-system skills can read and write variables, styles, and components. → load `prompts/figma-environment-setup.md`.
- `icon-system-builder` — Build an icon system in Figma — a dedicated "Icons" page populated with the user's chosen icon library (Lucide, Material, or custom SVGs) as well-named, scalable components — using the fastest, most-automated mechanism per library (for Lucide, batch-fetching the curated subset's official SVGs from the source repo and componentizing them hands-off; for Material, the official community file or importer plugin) rather than hand-generating icons or making the user copy components by hand. → load `prompts/icon-system-builder.md`.
- `repository-builder` — Graduate the local design-system folder into a real monorepo — a pnpm + Turborepo workspace with packages for tokens and UI components and room for apps — and walk the user from a plain folder to local git to a GitHub remote with PRs and CI. → load `prompts/repository-builder.md`.
- `retrofit-planner` — Orchestrate a full brownfield design-system retrofit end to end — audit, refine variables in place, rebind components, sync, capture a Chromatic baseline, retrofit the code with dual output, adopt existing documentation then fill gaps, then remove the old tokens only after a zero-reference grep — with a human confirmation gate between every phase. → load `prompts/retrofit-planner.md`.
- `storybook-chromatic-builder` — Stand up Storybook in the monorepo, build code components matching the Figma design system (consuming the synced tokens and implementing the captured slot contracts), generate stories for every component, set up Chromatic for visual regression testing, and wire Code Connect when the user's Figma plan supports it. → load `prompts/storybook-chromatic-builder.md`.
- `token-builder` — Build a two-tier (primitive + semantic) design token system as Figma variables — color ramps, spacing, type scale, radius, shadows — with light/dark or brand modes. → load `prompts/token-builder.md`.
- `token-crosswalk-builder` — Build the brownfield token crosswalk — a persistent three-way map between each new token, the old Figma variable, and the old code identifier(s) — as crosswalk.json, then install the vetted validator/reverse-index scripts into the monorepo and wire the tokens:validate CI gate. → load `prompts/token-crosswalk-builder.md`.
- `token-sheet-builder` — Build a beautiful, on-brand "Foundations" page in Figma that visually documents every variable collection and style — color ramps with swatches, the type scale, spacing, radius, shadows/elevations — with swatches live-bound to the actual variables where Figma allows. → load `prompts/token-sheet-builder.md`.
- `token-sync-layer` — Sync Figma design variables into code-ready token files by extracting them to DTCG-format JSON, running them through Style Dictionary, and emitting framework-specific outputs via per-platform adapters (shadcn/Tailwind, MUI, vanilla CSS, iOS Swift, Android Kotlin, or custom). → load `prompts/token-sync-layer.md`.

## ThroughLine commands

- `design-system-status` — Show a plain-language summary of the current design system state — what's set up, what's not, and sensible next steps — read from design-system.json. → load `prompts/design-system-status.md`.
- `new-component` — Build a single new component end to end — in Figma, then sync any new tokens, then build its code component and stories — with a confirmation between each stage. → load `prompts/new-component.md`.
- `start` — Start building your design system — the deterministic entry point. → load `prompts/start.md`.
- `sync-figma-tokens` — Re-run the Figma-to-code token sync — extract current Figma variables, rebuild code outputs via Style Dictionary, and open a PR with the changes for review. → load `prompts/sync-figma-tokens.md`.

## MCP servers

Figma access is provided by the `figma-console` MCP server. See `codex-mcp.toml` for the config to add to your Codex `mcp_servers`.
