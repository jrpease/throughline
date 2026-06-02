# Throughline

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**One unbroken line from design to code.** Build a complete, code-ready design
system — from a blank Figma file to a synced, story-tested component library —
guided step by step.

**You don't need to know how to code.** This plugin is built for designers who
are getting comfortable with AI-assisted development. It explains every concept
the first time it comes up and scales how much detail it gives you to your
comfort level — from "I've never made a GitHub repo" to "just scaffold it." You
bring the design judgment; it handles the mechanics.

## Install

Throughline is a [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin.
Install it from this repo's plugin marketplace:

```
/plugin marketplace add jrpease/throughline
/plugin install throughline@throughline-marketplace
```

Then just say **"let's set up my design system"** — the setup skill takes it from
there. (See [Setup](#setup) below for the Figma access token and desktop-app
requirements.)

To update to the latest version later:

```
/plugin marketplace update throughline-marketplace
```

## What it does

Nine skills take you from foundations to a real, maintainable system. Figma is
the source of truth for your tokens and components; code is generated from it and
kept in sync.

1. **figma-environment-setup** — create your working folder and connect Claude to
   Figma. Start here.
2. **token-builder** — a two-tier (primitive + semantic) token system as Figma
   variables, plus text/effect styles. Generative ("one color, build me a
   system"), descriptive ("modern, rounded"), or import your existing tokens.
3. **token-sheet-builder** — a beautiful, on-brand **Foundations** page
   visualizing every token.
4. **icon-system-builder** — an **Icons** page with your chosen library (Lucide,
   Material, or custom) as clean components, the cheap way.
5. **component-builder** — your foundational components (button, input, card,
   modal, etc.) with proper variants, slots, and token bindings.
6. **repository-builder** — turn your folder into a pnpm + Turborepo monorepo,
   from a plain folder to local git to GitHub, one gentle step at a time.
7. **token-sync-layer** — sync Figma variables to framework-specific code
   (shadcn, Tailwind, MUI, vanilla CSS, iOS Swift, or any other framework) via
   Style Dictionary, landed as a reviewable pull request. Installs the
   `/sync-figma-tokens` command.
8. **storybook-chromatic-builder** — Storybook, component stories, Chromatic
   visual testing, and Code Connect (where your Figma plan supports it).
9. **component-pipeline** — add one new component end to end: Figma → tokens →
   code + stories.

## How it stays consistent

A small `design-system.json` file in your folder records what's set up. Every
skill reads it, tells you what it's about to do, and offers to run anything
that's missing first. Run **`/design-system-status`** anytime to see where you
stand in plain language.

## The everyday loop

Once set up: tweak tokens in Figma → run **`/sync-figma-tokens`** → review the
pull request → merge. Add a component → run **`/new-component`**.

## Choosing a model

Most skills run on whatever model your session is set to, so you stay in control.
A sensible default is **Sonnet** as the everyday workhorse. Two tips:

- **`figma-environment-setup` runs on Haiku** automatically — it's mostly scripted
  setup, so the cheaper model keeps first-run costs low.
- For the **heaviest authoring** — `token-builder` and `component-builder` (token
  systems, variant matrices, slot contracts) — **Opus** gives the best results on
  large or intricate systems, if you have access. Switch anytime with
  `/model opus`, then back to `/model sonnet`.

Nothing forces an expensive model on you; these are recommendations, plus the one
Haiku default above.

## Setup

This plugin bundles the [Figma Console MCP](https://github.com/southleft/figma-console-mcp)
server config so Claude can read and write your Figma file. You'll provide your
own Figma access token (the setup skill walks you through it — your token stays
yours and is never shared in chat). The Figma **desktop app** is required (the
browser version causes connection errors).

Install, then just say *"let's set up my design system"* and the setup skill
takes it from there.

## Works well with

- **[Superpowers](https://github.com/obra/superpowers)** — when you've got your
  design system synced to code and you're ready to build the actual app in the
  `apps/` folder, Superpowers' subagent-driven development methodology is a great
  next step. It's a heavier, engineering-focused toolkit, so it shines once
  you're getting comfortable with code — not required to use this plugin.

## Notes

- **Figma is the source of truth** for token values and component structure.
  Generated code files are build artifacts — never hand-edited; change things in
  Figma and re-sync.
- **Your secrets stay yours.** Tokens and keys are never sent through chat or
  committed to code; the skills tell you exactly where to put them.
- Figma slots and Console MCP features evolve; the skills note where something is
  in beta.

## Versioning

Throughline follows [Semantic Versioning](https://semver.org). The current version
lives in [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json), and every
release is recorded in [`CHANGELOG.md`](CHANGELOG.md).

When cutting a release:

1. Bump `version` in `.claude-plugin/plugin.json` (`MAJOR.MINOR.PATCH`).
2. Add a matching entry to `CHANGELOG.md`.
3. Commit, then tag and push:

   ```
   git commit -am "Release vX.Y.Z"
   git tag vX.Y.Z
   git push && git push --tags
   ```

Users pick up the update with `/plugin marketplace update throughline-marketplace`.

## License

[MIT](LICENSE) © Jordan Pease
