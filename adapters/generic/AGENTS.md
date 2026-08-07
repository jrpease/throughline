# ThroughLine (generic AGENTS.md adapter)

ThroughLine builds a design system end to end. Read the matching skill file for the task at hand.

## ThroughLine skills

- `component-builder` — Build Figma components — buttons, inputs, cards, badges, chips, modals, and more — with variant matrices (types, sizes, states) and icon/component/content slots bound to the design system's tokens and styles. → read `skills/component-builder/SKILL.md`.
- `component-pipeline` — Take a single new component from Figma to fully-built-and-storied code, end to end — build it in Figma, sync any new tokens it introduced, then build its code component and stories. → read `skills/component-pipeline/SKILL.md`.
- `design-system-audit` — Measure a pre-existing design system before retrofitting it onto tokens, so the retrofit is right-sized. → read `skills/design-system-audit/SKILL.md`.
- `figma-environment-setup` — Set up the local working folder and connect the agent to Figma so the design-system skills can read and write variables, styles, and components. → read `skills/figma-environment-setup/SKILL.md`.
- `icon-system-builder` — Build an icon system in Figma — a dedicated "Icons" page of well-named, scalable icon components from Lucide, Tabler, Phosphor, Material, or custom SVGs. → read `skills/icon-system-builder/SKILL.md`.
- `repository-builder` — Graduate the local design-system folder into a real monorepo — a pnpm + Turborepo workspace with packages for tokens and UI components — and walk the user from a plain folder to local git to a GitHub remote with PRs and CI. → read `skills/repository-builder/SKILL.md`.
- `retrofit-planner` — Orchestrate a full brownfield design-system retrofit end to end — audit, refine, rebind, sync, baseline, code, docs, cleanup — with a human confirmation gate between every phase. → read `skills/retrofit-planner/SKILL.md`.
- `storybook-chromatic-builder` — Stand up Storybook in the monorepo, build code components matching the Figma design system, generate stories for every component, set up Chromatic for visual regression testing, and wire Code Connect when the user's Figma plan supports it. → read `skills/storybook-chromatic-builder/SKILL.md`.
- `token-builder` — Build a two-tier (primitive + semantic) design token system as Figma variables — color ramps, spacing, type scale, radius, shadows — with light/dark or brand modes, using one collection per category per tier. → read `skills/token-builder/SKILL.md`.
- `token-crosswalk-builder` — Build the brownfield token crosswalk — a persistent three-way map between each new token, the old Figma variable, and the old code identifier(s) — then wire the tokens:validate CI gate. → read `skills/token-crosswalk-builder/SKILL.md`.
- `token-sheet-builder` — Build an on-brand "Foundations" page in Figma that visually documents every variable collection and style — color ramps with swatches, the type scale, spacing, radius, shadows/elevations. → read `skills/token-sheet-builder/SKILL.md`.
- `token-sync-layer` — Sync Figma design variables into code-ready token files via DTCG JSON and Style Dictionary, emitting framework-specific outputs (shadcn/Tailwind, MUI, vanilla CSS, iOS Swift, Android Kotlin, or custom), and set up the reusable "sync figma tokens" command. → read `skills/token-sync-layer/SKILL.md`.

## ThroughLine commands

- `design-system-status` — Show a plain-language summary of the current design system state — what's set up, what's not, and sensible next steps — read from design-system.json. → read `commands/design-system-status.md`.
- `document-component` — Author, refresh, or reconcile the usage documentation for one existing component — draft its canonical doc record from four sources, project it to Figma, the doc card, and code, and resolve any drift via a reviewable per-item choice. → read `commands/document-component.md`.
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
