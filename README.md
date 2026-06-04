<div align="center">

# Throughline

### The end-to-end design system plugin for Claude Code

**Build a modern, performant, production-grade design system — tokens, icons, components, a synced code monorepo, and CI — starting from a blank Figma file. No code experience required.**

[![Version](https://img.shields.io/badge/version-0.5.0-6366f1)](.claude-plugin/plugin.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built for Claude Code](https://img.shields.io/badge/built%20for-Claude%20Code-d97757)](https://docs.claude.com/en/docs/claude-code)
[![See it live — Storybook](https://img.shields.io/badge/See%20it%20live-Storybook-FF4785?logo=storybook&logoColor=white)](https://main--6a1ee089ae3a37b70a6e4559.chromatic.com)
[![Public Figma file](https://img.shields.io/badge/Public-Figma%20file-F24E1E?logo=figma&logoColor=white)](https://www.figma.com/design/OCiZiGpsJ4ncPD8r205BjC/Throughline-Plugin-Test?node-id=0-1&t=5ERihD6fMqMuTEXD-1)

<!-- TODO: hero demo GIF — a 10–20s capture of "let's set up my design system" → tokens/components appearing in Figma → synced code PR. Drop it here. -->
<!-- <img src="docs/assets/demo.gif" alt="Throughline in action" width="100%" /> -->

</div>

---

Throughline draws **one unbroken line from design to code**. You author tokens, icons, and components in **Figma** — the source of truth — and Throughline generates a framework-specific codebase, a Storybook, and CI, then keeps them in sync. It guides you one step at a time from your CLI, explaining every concept the first time it appears and scaling the detail to your comfort level.

> **Who it's for:** designers becoming developers. You bring the design judgment; Throughline handles the monorepo, the build pipeline, the Style Dictionary config, and the Git. From *"I've never made a GitHub repo"* to *"just scaffold it."*

## Why Throughline

- 🎚️ **Built for any skill level** — no code experience needed; it teaches as it builds.
- 🌱 **Start from anywhere** — a single hex value, a reference website, a brand guide, or a full existing token library.
- 🧩 **Works with any UI framework** — shadcn, MUI, vanilla, or your own.
- 🔄 **Syncs to any code target** — React, Tailwind, Angular, Swift, Kotlin, plain CSS, and more, via Style Dictionary.
- 🏢 **Enterprise-ready** — built-in Figma Code Connect setup for plans that support it.
- 🧠 **Designed to be thorough** — shared standards, a state-tracking manifest, and read-back audits keep every run consistent.

## See it in action

Everything below was authored in Figma using the plugin, then synced to code automatically — a complete, production-grade design system generated **in a single 2-hour session**.

| | |
|---|---|
| 🧩 **[Sample repo](https://github.com/jrpease/throughline-sample)** | The full monorepo — tokens, 14 components, Storybook, CI |
| 📚 **[Live Storybook](https://main--6a1ee089ae3a37b70a6e4559.chromatic.com)** | Every component, all props, auto-generated docs |
| 🎨 **[Public Figma file](https://www.figma.com/design/OCiZiGpsJ4ncPD8r205BjC/Throughline-Plugin-Test?node-id=0-1&t=5ERihD6fMqMuTEXD-1)** | The design source of truth it was generated from |

**A token system, visualized.** Every color, space, type, radius, and elevation value lives as a Figma variable. The Foundations page is generated directly from those variables — live-bound, so it always reflects the current state of the system.

<img src="https://raw.githubusercontent.com/jrpease/throughline-sample/main/.github/assets/foundations.png" alt="Foundations page — color primitives, semantic tokens, typography, spacing, radius, and elevation" width="100%" />

**Components as full variant matrices.** Each component is built in Figma as a single artboard documenting every variant — here, 90 Button variants across types, sizes, and states — then implemented in React consuming the synced tokens, without you ever moving a pixel by hand.

<img src="https://raw.githubusercontent.com/jrpease/throughline-sample/main/.github/assets/button-artboard.png" alt="Button component artboard — 90 variants across types, sizes, and states" width="100%" />

**Documented and visually tested in code.** Every component ships in Storybook with a live props panel and auto-generated docs, and is visual-regression-tested on every push via Chromatic.

<img src="https://raw.githubusercontent.com/jrpease/throughline-sample/main/.github/assets/storybook.png" alt="Storybook — Button component docs with props panel and live controls" width="100%" />

## Requirements

| | |
|---|---|
| **[Claude Code](https://docs.claude.com/en/docs/claude-code)** | Required — Throughline is a Claude Code plugin. |
| **Figma** | Required, **desktop app** (the browser version causes connection errors). **Professional plan or higher recommended** — multi-mode variables (Light/Dark, brand themes) need it. |
| **Figma access token** | Required — read/write your file. The setup skill walks you through it; your token stays yours and is never shared in chat. |
| **GitHub** (or similar) | Optional — only when you're ready to graduate to a real remote repo with PRs and CI. |

## Get started

Install from this repo's plugin marketplace:

```
/plugin marketplace add jrpease/throughline
/plugin install throughline@throughline-marketplace
```

Then just say:

> **"let's set up my design system"**

The setup skill takes it from there — connecting Figma and scanning your environment before anything else runs. Update anytime with:

```
/plugin marketplace update throughline-marketplace
```

## What's inside

Throughline is more than a pile of skills — it's a small system designed to stay consistent across dozens of generation steps. Four layers work together:

**🛠 Nine skills — the steps.** Each owns one stage of the journey, from connecting Figma to standing up CI. They're sequenced, and each knows its prerequisites.

**📐 Seven reference docs — the constitution.** Shared standards every skill obeys: Figma component rules (auto-layout-on-everything, slot contracts, naming-as-contract, a required post-build audit), the brainstorm-before-build protocol, the sync-adapter specs, the manifest schema, coding-level adaptivity, and the publishing flow. This is *why* two different runs produce the same structure — the rules live in one place, not scattered per skill.

**🧭 An orchestration layer — the memory.** A `design-system.json` manifest in your project records exactly what's set up, with a versioned schema and immutability rules. Every skill reads it, tells you what it's about to do, and offers to run anything missing first. Run **`/design-system-status`** anytime for a plain-language picture of where you stand.

**🔌 An adapter layer — the bridge.** A Style Dictionary pipeline that translates your Figma variables into whatever code framework you target — and re-translates on every change, so design and code never drift.

### The skills

| Skill | What it does |
|---|---|
| **figma-environment-setup** | Create your working folder, connect Claude to Figma, scan what already exists. **Start here.** |
| **token-builder** | A two-tier (primitive + semantic) token system as Figma variables, plus text/effect styles. Generative, descriptive, or import-your-own. |
| **token-sheet-builder** | A beautiful, on-brand **Foundations** page visualizing every token, live-bound to the variables. |
| **icon-system-builder** | An **Icons** page with your chosen library (Lucide, Material, or custom) as clean components — the cheap, fast way. |
| **component-builder** | Your foundational components (button, input, card, modal…) with full variant matrices, slots, and token bindings. |
| **repository-builder** | Graduate your folder into a pnpm + Turborepo monorepo — folder → local git → GitHub, one gentle step at a time. |
| **token-sync-layer** | Sync Figma variables to framework-specific code via Style Dictionary, landed as a reviewable PR. Installs `/sync-figma-tokens`. |
| **storybook-chromatic-builder** | Storybook, component stories, Chromatic visual testing, and Code Connect (where your Figma plan supports it). |
| **component-pipeline** | Add one new component end to end: Figma → tokens → code + stories. Installs `/new-component`. |

## How it works

Throughline walks a blank Figma file all the way to a production system. A few principles shape the whole journey:

- **You can start anywhere.** A single brand color, a reference site, or an existing token set — Throughline meets you where you are and fills the gaps (proposing the missing ramps, modes, and roles rather than transcribing a thin system 1:1).
- **Every concept is explained once, at your level.** New to repos and env files? You get plain-language teaching. Comfortable? You get terse action statements. The safety rules never relax.
- **Figma leads, code follows.** You never hand-edit generated code. Change the design; re-sync.

The path:

1. **Set up** — connect Figma, create the workspace, scan for anything that already exists.
2. **Tokens** — build the primitive + semantic variable system, with modes (light/dark, brand) where you need them.
3. **Foundations** — generate the visual stylesheet so the whole team can see the system.
4. **Icons** — bring in a curated, on-brand icon set as components.
5. **Components** — build the component library in Figma, fully variant-mapped and token-bound.
6. **Repository** — stand up the monorepo and (when you're ready) push it to GitHub.
7. **Sync** — wire the adapter layer so Figma variables flow into your framework's code.
8. **Storybook + CI** — implement the code components, document them, and turn on visual regression testing.

From there you're in **the everyday loop:** tweak a token in Figma → run `/sync-figma-tokens` → Throughline opens a PR with regenerated code and Chromatic visual diffs → review → merge. Add a component → `/new-component`.

## What you get

A real, maintainable system — not a pile of disconnected files:

- 🔗 **Figma connected to Claude** via the Figma Console MCP (with the official Figma MCP / Figma Claude Code plugin as a fallback path).
- 🎨 **A robust multi-collection variable system** — primitive *and* semantic tiers, one collection per category, with light/dark and multi-brand modes.
- 📋 **A live Foundations stylesheet** documenting every variable, re-synced on command.
- 🔤 **Ready-built Figma styles** — type ramps, elevations, effects — all bound to semantic tokens.
- ✨ **An icon system** — your chosen library as clean, swappable components.
- 🧩 **A fully custom, extensible component library** in Figma, adhering to best practices: auto-layout everywhere, instance-swap slots, variant matrices, deterministic naming, accessibility checks.
- 🧠 **A `design-system.json` manifest** tracking the whole system's state — the orchestration brain.
- 🔌 **A custom adapter layer** syncing Figma → code via Style Dictionary, for your exact framework.
- 📚 **A code-ready component library** documented in Storybook.
- ✅ **Full CI via Chromatic** — visual-regression tested on every push.
- 📦 **A production monorepo on GitHub** (pnpm + Turborepo) housing it all, ready for app development in `apps/`.
- ♻️ **A living sync loop** — one command regenerates code, opens a PR with visual diffs, and waits for green CI before you merge.
- 🏢 **Figma Code Connect** wiring, for enterprise plans.

## The nitty gritty

For the technically curious — how the machine actually runs.

**The sync layer.** Figma variables are extracted to **DTCG-format** JSON (the W3C design-tokens standard), run through **Style Dictionary**, and shaped by a framework **adapter** into the exact output your stack expects — shadcn CSS variables, a Tailwind theme, MUI theme objects, Swift/Kotlin constants, or plain CSS. Because the code is *generated* from the extract, design and code can't drift: you never hand-edit outputs, you change Figma and re-run. The sync lands as a **pull request**, so every design change is reviewable, diffable, and CI-checked before it merges.

**The monorepo.** A **pnpm + Turborepo** workspace: `packages/` holds the generated tokens and the component library; `apps/` is where you build the actual product against your own design system. Throughline grows it in stages — plain folder → local git → GitHub remote with PRs and CI — introducing each concept only when its payoff is concrete, so you're never dropped into the deep end.

**The manifest.** `design-system.json` is the single source of truth for *state*: a versioned schema, canonical per-skill flags, an immutable record of how your project began (greenfield vs. existing repo), and a snapshot of tooling detected at setup. Skills read it to know what's done and what's safe to do next — which is how the system stays coherent across many sessions.

**Modes, within Figma's limits.** Light/Dark lives on the semantic collections; brand variants live on the primitive palette. Splitting the two axes across two collections keeps each one under Figma's 4-modes-per-collection cap on the Professional plan while still resolving correctly (`bg/default` → `{gray/50}` → the active brand's gray).

**Model routing.** Setup runs on **Haiku** automatically to keep first-run costs low. Everyday work runs on whatever model your session is set to — **Sonnet** is a sensible default. For the heaviest authoring (large token systems, intricate variant matrices), **Opus** gives the best results: `/model opus`, then back to `/model sonnet`. Nothing forces an expensive model on you.

## Why I built it

I'm a designer who got tired of the handoff. Design systems live in two places that never quite agree — the Figma file and the codebase — and keeping them in sync is a full-time job nobody wants. Throughline is the tool I wished existed: it lets a designer drive the whole pipeline, learn the engineering one concept at a time, and end up with a real, shippable system instead of a pile of redlines. If you're a designer who's becoming a developer, this was built for you.

## Works well with

**[Superpowers](https://github.com/obra/superpowers)** — a great planning and engineering partner for the moments that grow bigger than a single skill. Throughline owns the design-system line; Superpowers owns the heavier, open-ended engineering work — and the two hand off cleanly.

- **Big, ambiguous changes mid-build.** When a step turns into a real project, Throughline lays out the risks and major pieces and switches into brainstorm-and-plan mode before building — handing off to Superpowers when it's installed, or planning natively when it isn't (the recognition is Throughline's; Superpowers is an upgrade, not a requirement). Real example: on [radicool.studio](https://radicool.studio), an existing vanilla-React app with a full custom motion layer — custom cursors, magnetic buttons — was retrofitted onto shadcn to make it formal and ready to scale.
- **Building the app itself.** Once your system is synced to code and you're building in `apps/`, Superpowers' subagent-driven development methodology is a natural next step.

It's never required to use Throughline.

## Show it off

Built your own system with Throughline? Add the badge so others can find it:

```markdown
[![Built with Throughline](https://img.shields.io/badge/Built%20with-Throughline-6366f1)](https://github.com/jrpease/throughline)
```

[![Built with Throughline](https://img.shields.io/badge/Built%20with-Throughline-6366f1)](https://github.com/jrpease/throughline)

## Contributing

Throughline is open source and contributions are welcome. Found a bug or have an idea? **[Open an issue](https://github.com/jrpease/throughline/issues)**. Want to improve a skill or reference doc? PRs are encouraged — the skills are Markdown, so they're approachable to edit.

A couple of ground rules:
- **Figma is the source of truth.** Generated code files are build artifacts — never hand-edited; change things in Figma and re-sync.
- **Secrets stay yours.** Tokens and keys are never sent through chat or committed to code.

## Versioning

Throughline follows [Semantic Versioning](https://semver.org). The current version lives in [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json); every release is recorded in [`CHANGELOG.md`](CHANGELOG.md). Pick up updates with `/plugin marketplace update throughline-marketplace`.

## License

[MIT](LICENSE) © Jordan Pease
