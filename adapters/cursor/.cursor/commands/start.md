This is the **first step** for building a design system with ThroughLine. The
user invoked it explicitly, so begin immediately — do **not** invoke any
brainstorming or planning skill first. There is nothing to brainstorm until the
environment exists: the local working folder must be created and Figma must be
connected before any design work can happen.

Invoke the `figma-environment-setup` rule now and follow it exactly. It will:

1. Locate or create the project directory and scan what's already there.
2. Create the local working folder and write the `design-system.json` manifest.
3. Connect Cursor to Figma and verify the connection.

If `design-system.json` already exists in this folder, the setup skill will
detect it and route the user to the right next step rather than starting over —
let it make that call. That routing now covers brownfield systems too: an
existing/mature repo or populated Figma file is sent to `design-system-audit`
first, and an in-progress retrofit (`retrofit.phase` set) resumes at its phase
via `retrofit-planner` — the setup skill makes that call.

Scale all explanation to the user's coding level. Assume they may be
design-fluent but new to developer tooling, terminals, and API tokens.

