<div align="center">

# Throughline

### One unbroken line from design to production.

**Build a real design system from Figma, generate a production-ready codebase, and keep design and code in sync over time.**

[![Version](https://img.shields.io/badge/version-0.5.0-6366f1)](.claude-plugin/plugin.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built for Claude Code](https://img.shields.io/badge/built%20for-Claude%20Code-d97757)](https://docs.claude.com/en/docs/claude-code)
[![See it live — Storybook](https://img.shields.io/badge/See%20it%20live-Storybook-FF4785?logo=storybook&logoColor=white)](https://main--6a1ee089ae3a37b70a6e4559.chromatic.com)
[![Public Figma file](https://img.shields.io/badge/Public-Figma%20file-F24E1E?logo=figma&logoColor=white)](https://www.figma.com/design/OCiZiGpsJ4ncPD8r205BjC/Throughline-Plugin-Test?node-id=0-1&t=5ERihD6fMqMuTEXD-1)

</div>

Throughline helps designers create:

- **Design tokens**
- **Foundations**
- **Icons**
- **Components**
- **A synced codebase**
- **Storybook documentation**
- **Visual testing and CI**

All from the same source of truth. **No code experience required.**

<!-- TODO: hero demo GIF — a 10–20s capture of "let's set up my design system" → tokens/components appearing in Figma → synced code PR. Drop it here. -->
<!-- <img src="docs/assets/demo.gif" alt="Throughline in action" width="100%" /> -->

---

## Why Throughline?

Most design systems eventually break down for the same reason.

Design lives in Figma.

Code lives somewhere else.

Documentation lives somewhere else.

Keeping them aligned becomes a full-time job.

Throughline solves that problem by creating a single workflow from design to implementation.

Create tokens in Figma.
Generate code.
Review changes.
Stay in sync.

Instead of rebuilding the same decisions in multiple places, the system flows from one source of truth.

## See it in action

| | |
|---|---|
| 🧩 **[Sample repo](https://github.com/jrpease/throughline-sample)** | The full monorepo — tokens, 14 components, Storybook, CI |
| 📚 **[Live Storybook](https://main--6a1ee089ae3a37b70a6e4559.chromatic.com)** | Every component, all props, auto-generated docs |
| 🎨 **[Public Figma file](https://www.figma.com/design/OCiZiGpsJ4ncPD8r205BjC/Throughline-Plugin-Test?node-id=0-1&t=5ERihD6fMqMuTEXD-1)** | The design source of truth it was generated from |

Everything shown below was created during a single working session and synced directly from Figma to a production-ready codebase.

**A token system, visualized.** Every color, space, type, radius, and elevation value lives as a Figma variable. The Foundations page is generated directly from those variables — live-bound, so it always reflects the current state of the system.

<img src="https://raw.githubusercontent.com/jrpease/throughline-sample/main/.github/assets/foundations.png" alt="Foundations page — color primitives, semantic tokens, typography, spacing, radius, and elevation" width="100%" />

**Components as full variant matrices.** Each component is built in Figma as a single artboard documenting every variant — here, 90 Button variants across types, sizes, and states — then implemented in React consuming the synced tokens, without you ever moving a pixel by hand.

<img src="https://raw.githubusercontent.com/jrpease/throughline-sample/main/.github/assets/button-artboard.png" alt="Button component artboard — 90 variants across types, sizes, and states" width="100%" />

**Documented and visually tested in code.** Every component ships in Storybook with a live props panel and auto-generated docs, and is visual-regression-tested on every push via Chromatic.

<img src="https://raw.githubusercontent.com/jrpease/throughline-sample/main/.github/assets/storybook.png" alt="Storybook — Button component docs with props panel and live controls" width="100%" />

## What Throughline does

### Design system foundations

- Primitive and semantic token architecture
- Multi-brand support
- Light and dark themes
- Typography
- Elevation
- Spacing
- Radius
- Effects

### Component systems

- Variant-based component architecture
- Slot patterns
- Accessibility checks
- Auto-layout best practices
- Deterministic naming conventions

### Code generation

- Framework-specific outputs
- Style Dictionary integration
- Storybook setup
- Chromatic visual testing
- CI configuration

### Ongoing synchronization

This is the part most tools never solve.

Change a token in Figma.

Run sync.

Review the pull request.

Merge.

Design and code stay aligned.

## Getting started

### Requirements

| | |
|---|---|
| **[Claude Code](https://docs.claude.com/en/docs/claude-code)** | Required — Throughline is a Claude Code plugin. |
| **Figma** | Required, **desktop app** (the browser version causes connection errors). **Professional plan or higher recommended** — multi-mode variables (Light/Dark, brand themes) need it. |
| **Figma access token** | Required — read/write your file. The setup skill walks you through it; your token stays yours and is never shared in chat. |
| **GitHub** (or similar) | Optional — only when you're ready to graduate to a real remote repo with PRs and CI. |

### Install

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

## The workflow

1. **Connect Figma**
2. **Create tokens**
3. **Generate foundations**
4. **Build components**
5. **Create repository**
6. **Sync to code**
7. **Publish Storybook**
8. **Ship**

After that, you're operating in the daily workflow:

**Figma → Sync → Review → Merge**

Tweak a token in Figma → run `/sync-figma-tokens` → Throughline opens a PR with regenerated code and Chromatic visual diffs → review → merge. Add a component → `/new-component`.

## Core concepts

### Figma leads

Design remains the source of truth.

You change the design.

Throughline updates the implementation.

You never hand-edit generated code — change the design and re-sync.

### Learn while building

Every step teaches concepts as they appear.

Beginners get explanations.

Experienced builders get concise guidance.

The safety rules never relax, regardless of which mode you're in.

### Start anywhere

A brand color.
A mood board.
An existing design system.
A mature token library.

Throughline adapts to what already exists — meeting you where you are and filling the gaps (proposing the missing ramps, modes, and roles rather than transcribing a thin system 1:1).

## Architecture

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

### The nitty gritty

For the technically curious — how the machine actually runs.

**The sync layer.** Figma variables are extracted to **DTCG-format** JSON (the W3C design-tokens standard), run through **Style Dictionary**, and shaped by a framework **adapter** into the exact output your stack expects — shadcn CSS variables, a Tailwind theme, MUI theme objects, Swift/Kotlin constants, or plain CSS. Because the code is *generated* from the extract, design and code can't drift: you never hand-edit outputs, you change Figma and re-run. The sync lands as a **pull request**, so every design change is reviewable, diffable, and CI-checked before it merges.

**The monorepo.** A **pnpm + Turborepo** workspace: `packages/` holds the generated tokens and the component library; `apps/` is where you build the actual product against your own design system. Throughline grows it in stages — plain folder → local git → GitHub remote with PRs and CI — introducing each concept only when its payoff is concrete, so you're never dropped into the deep end.

**The manifest.** `design-system.json` is the single source of truth for *state*: a versioned schema, canonical per-skill flags, an immutable record of how your project began (greenfield vs. existing repo), and a snapshot of tooling detected at setup. Skills read it to know what's done and what's safe to do next — which is how the system stays coherent across many sessions.

**Modes, within Figma's limits.** Light/Dark lives on the semantic collections; brand variants live on the primitive palette. Splitting the two axes across two collections keeps each one under Figma's 4-modes-per-collection cap on the Professional plan while still resolving correctly (`bg/default` → `{gray/50}` → the active brand's gray).

**Model routing.** Setup runs on **Haiku** automatically to keep first-run costs low. Everyday work runs on whatever model your session is set to — **Sonnet** is a sensible default. For the heaviest authoring (large token systems, intricate variant matrices), **Opus** gives the best results: `/model opus`, then back to `/model sonnet`. Nothing forces an expensive model on you.

## Who it's for

- **Product designers** moving closer to code
- **Design teams** building their first design system
- **Agencies** creating reusable systems
- **Startups** building foundations before scale

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

## Roadmap

Future improvements and planned capabilities. Have a request? **[Open an issue](https://github.com/jrpease/throughline/issues)** — the roadmap is shaped by what people actually build.

- **More framework adapters** — broaden the Style Dictionary output targets beyond the current set.
- **Deeper Code Connect coverage** — richer Figma-to-code mappings as more plans support it.
- **Expanded component starters** — a larger foundational kit out of the box.
- **Richer status & auditing** — more from `/design-system-status`, including drift detection between Figma and code.

Versioning follows [Semantic Versioning](https://semver.org). The current version lives in [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json); every release is recorded in [`CHANGELOG.md`](CHANGELOG.md).

## License

[MIT](LICENSE) © Jordan Pease
