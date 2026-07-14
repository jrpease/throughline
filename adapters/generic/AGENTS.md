# ThroughLine (generic AGENTS.md adapter)

ThroughLine builds a design system end to end. Read the matching skill file for the task at hand.

## ThroughLine skills

- `component-builder` — Build a foundational set of Figma components — buttons, inputs, cards, badges, chips, modals, and more — as properly structured components with variant matrices (types, sizes, states) and icon/component/content slots, bound to the design system's tokens and styles. → read `skills/component-builder/SKILL.md`.
- `component-pipeline` — Take a single new component from Figma to fully-built-and-storied code, end to end — build it in Figma, sync any new tokens it introduced, then build its code component and stories. → read `skills/component-pipeline/SKILL.md`.
- `design-system-audit` — Measure a pre-existing design system before retrofitting it onto tokens — size the code-side color surface and inventory the existing Figma file with verified per-class reads, then compute how semantic the system already is so the retrofit is right-sized. → read `skills/design-system-audit/SKILL.md`.
- `figma-environment-setup` — Set up the local working folder and connect the agent to Figma so the design-system skills can read and write variables, styles, and components. → read `skills/figma-environment-setup/SKILL.md`.
- `icon-system-builder` — Build an icon system in Figma — a dedicated "Icons" page populated with the user's chosen icon library (Lucide, Material, or custom SVGs) as well-named, scalable components — using the fastest, most-automated mechanism per library (for Lucide, batch-fetching the curated subset's official SVGs from the source repo and componentizing them hands-off; for Material, the official community file or importer plugin) rather than hand-generating icons or making the user copy components by hand. → read `skills/icon-system-builder/SKILL.md`.
- `repository-builder` — Graduate the local design-system folder into a real monorepo — a pnpm + Turborepo workspace with packages for tokens and UI components and room for apps — and walk the user from a plain folder to local git to a GitHub remote with PRs and CI. → read `skills/repository-builder/SKILL.md`.
- `retrofit-planner` — Orchestrate a full brownfield design-system retrofit end to end — audit, refine variables in place, rebind components, sync, capture a Chromatic baseline, retrofit the code with dual output, adopt existing documentation then fill gaps, then remove the old tokens only after a zero-reference grep — with a human confirmation gate between every phase. → read `skills/retrofit-planner/SKILL.md`.
- `storybook-chromatic-builder` — Stand up Storybook in the monorepo, build code components matching the Figma design system (consuming the synced tokens and implementing the captured slot contracts), generate stories for every component, set up Chromatic for visual regression testing, and wire Code Connect when the user's Figma plan supports it. → read `skills/storybook-chromatic-builder/SKILL.md`.
- `token-builder` — Build a two-tier (primitive + semantic) design token system as Figma variables — color ramps, spacing, type scale, radius, shadows — with light/dark or brand modes. → read `skills/token-builder/SKILL.md`.
- `token-crosswalk-builder` — Build the brownfield token crosswalk — a persistent three-way map between each new token, the old Figma variable, and the old code identifier(s) — as crosswalk.json, then install the vetted validator/reverse-index scripts into the monorepo and wire the tokens:validate CI gate. → read `skills/token-crosswalk-builder/SKILL.md`.
- `token-sheet-builder` — Build a beautiful, on-brand "Foundations" page in Figma that visually documents every variable collection and style — color ramps with swatches, the type scale, spacing, radius, shadows/elevations — with swatches live-bound to the actual variables where Figma allows. → read `skills/token-sheet-builder/SKILL.md`.
- `token-sync-layer` — Sync Figma design variables into code-ready token files by extracting them to DTCG-format JSON, running them through Style Dictionary, and emitting framework-specific outputs via per-platform adapters (shadcn/Tailwind, MUI, vanilla CSS, iOS Swift, Android Kotlin, or custom). → read `skills/token-sync-layer/SKILL.md`.

## ThroughLine commands

- `design-system-status` — Show a plain-language summary of the current design system state — what's set up, what's not, and sensible next steps — read from design-system.json. → read `commands/design-system-status.md`.
- `new-component` — Build a single new component end to end — in Figma, then sync any new tokens, then build its code component and stories — with a confirmation between each stage. → read `commands/new-component.md`.
- `start` — Start building your design system — the deterministic entry point. → read `commands/start.md`.
- `sync-figma-tokens` — Re-run the Figma-to-code token sync — extract current Figma variables, rebuild code outputs via Style Dictionary, and open a PR with the changes for review. → read `commands/sync-figma-tokens.md`.

## MCP servers

Add the following MCP server to your agent (Figma access):

```json
{
  "mcpServers": {
    "figma-console": {
      "command": "npx",
      "args": [
        "-y",
        "figma-console-mcp@latest"
      ],
      "env": {
        "FIGMA_ACCESS_TOKEN": "${FIGMA_ACCESS_TOKEN}"
      }
    }
  }
}
```
