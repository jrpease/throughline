This is the **first step** with ThroughLine, whether the user is building a
design system or designing screens on a Figma library their team already uses.
The user invoked it explicitly, so begin immediately — do **not** invoke any
brainstorming or planning skill first. There is nothing to brainstorm until the
environment exists: Figma must be connected before any design work can happen.

**Ask which way in, before anything else.** If `design-system.json` already
exists in this folder, skip the question and go straight to the setup skill
below. Otherwise ask one question, before the setup skill runs (it writes
`design-system.json` early, and a manifest makes a product file read as a
system):

> Are you building a design system, or designing screens on a Figma library your
> team already uses?

- **A library:** follow only the `figma-environment-setup` prompt's
  "Step 4 — Connect to Figma". Write nothing else: no `design-system.json`, no
  working folder. Skip its Step 6 liveness check too, because that check writes
  `figma.connected` into a manifest that won't exist; `/throughline:compose-figma`
  checks the connection itself (its step 0). Don't add a check that writes a
  manifest. Then tell the user to open the product file in Figma and run
  `/throughline:compose-figma`.
- **A design system:** carry on below.

Invoke the `figma-environment-setup` prompt now and follow it exactly. It will:

1. Locate or create the project directory and scan what's already there.
2. Create the local working folder and write the `design-system.json` manifest.
3. Connect Codex to Figma and verify the connection.

If `design-system.json` already exists in this folder, the setup skill will
detect it and route the user to the right next step rather than starting over —
let it make that call. That routing now covers brownfield systems too: an
existing/mature repo or populated Figma file is sent to `design-system-audit`
first, and an in-progress retrofit (`retrofit.phase` set) resumes at its phase
via `retrofit-planner` — the setup skill makes that call.

Scale all explanation to the user's coding level. Assume they may be
design-fluent but new to developer tooling, terminals, and API tokens.

