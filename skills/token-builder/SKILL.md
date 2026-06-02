---
name: token-builder
description: Build a modern two-tier (primitive + semantic) design token system as Figma variables — color ramps, spacing, type scale, radius, shadows — with light/dark or brand modes, where semantic tokens alias onto primitives so changing a primitive cascades everywhere. Use this when the user wants to create design tokens, design variables, a color system, a type scale, a spacing system, or "build my tokens" in Figma. Also trigger when the user mentions primitives and semantic tokens, variable collections, design system foundations, or modes/themes in Figma. Make sure to use this skill whenever someone is starting the foundation of a design system in Figma, even if they just say "let's build the foundation" — tokens are the base everything else (sheets, components, code sync) depends on.
---

# Token builder

> **Model tip (#3):** building a coherent token system (ramps, type scale, modes,
> primitive→semantic aliasing) is reasoning-heavy. It runs on your session model —
> Sonnet is a solid default; Opus helps for large or multi-mode systems. See the
> model guide in the plugin README.

Creates a two-tier design token system as Figma variables:

- **Primitives** — raw values with no meaning attached. `color.gray.50`,
  `space.4`, `font.size.300`. The full palette of possible values.
- **Semantic** — meaning-bearing tokens that **alias onto primitives**.
  `color.bg.default` → `{color.gray.50}`, `color.text.primary` →
  `{color.gray.900}`. This is the layer the rest of the system consumes.

The power of two tiers: change a primitive once and every semantic token
referencing it updates automatically, which cascades through sheets, components,
and synced code. Preserving these aliases (not flattening them) is what makes
runtime theming work later, so **always create semantic tokens as references to
primitives, never as copied literal values.**

## Prerequisites

This skill needs a live Figma connection. Read the manifest
(`${CLAUDE_PLUGIN_ROOT}/references/manifest-schema.md` for the schema) and check `figma.connected`.
Then do a cheap liveness read to confirm the connection is actually live right
now. If it isn't, say so plainly and offer to run the `figma-environment-setup`
skill first: "Figma isn't connected yet — want me to set that up? It's a
one-time thing." Don't proceed until Figma is reachable.

Use the write mechanism recorded in `figma.mechanism` (default `console-mcp`).
With Console MCP, prefer `figma_execute` to create variables in scripted loops
rather than one tool call per variable — this is dramatically more
token-efficient for the potentially hundreds of primitives across modes.

## Step 1 — Brainstorm the structure (before building anything)

Run the protocol in `${CLAUDE_PLUGIN_ROOT}/references/brainstorm-before-build.md`. **First establish
the intake mode** (generative / descriptive / import) per that reference — it
changes how much you generate versus preserve. Then lock the structure with the
user, in readable chunks:

- **Seeds and direction** — capture what the user actually has: brand color(s),
  font(s), aesthetic words (modern, rounded, dense, comfortable), reference
  images/URLs, or an existing token set to import. In generative mode, this is
  the seed you expand from; in import mode, this is the set you organize.
- **Color ramps** — which hues (e.g. gray, brand primary, success, warning,
  danger), and how many steps each (a 50–900 ramp of ~10 steps is a sensible
  default). In generative mode, derive a full tonal ramp and harmonized
  supporting families from the user's seed color(s).
- **Modes** — does the system need light + dark? Brand variants? Density? This
  is high-impact and shapes everything downstream (it determines how many values
  each variable holds and how the sync layer emits themes), so brainstorm it
  carefully. Default: light + dark.
- **Spacing scale** — base unit and steps (e.g. 4px base: 0, 1, 2, 3, 4, 6, 8,
  12, 16, 24...). Default to a 4px-based scale; "dense" pulls it tighter,
  "comfortable" looser.
- **Type scale** — font families, the size ramp, weights, line-heights. In
  generative mode, propose complementary font pairings from the user's seed
  font. Default to a modular scale.
- **Radius / border / shadow** scales as needed. "Rounded" → larger radius
  scale.
- **Primitive naming convention** — the single most important decision, because
  the semantic tier aliases onto these names and renaming later breaks every
  alias. Lock it explicitly. Default: `category.subcategory.step`
  (`color.gray.50`, `space.4`, `font.size.300`). Keep names **neutral and
  semantic — never framework-specific** (don't name a token `--background` to
  match shadcn; the adapter sync layer renames per framework later). Figma is
  framework-agnostic; the adapter absorbs all framework-specific shaping.
- **Tiers** — default to **two-tier** (primitive + semantic). Only raise the
  option of a third **component** tier if the user signals multi-brand,
  white-labeling, or a very large/robust component library — for a single-brand
  project it adds complexity without payoff, so don't even surface it. If the
  user opts in, component tokens alias onto semantic tokens (e.g.
  `button.bg.primary` → `{color.bg.emphasis}`).

Show the proposed full structure back to the user and get sign-off before
creating anything.

### The anti-redundancy rule (prevents the "different every time" problem)

A semantic token earns its existence **only when it represents a genuine mapping
decision** — a role that could plausibly point at a different primitive, or that
changes across modes. Do **not** manufacture a semantic token that is a 1:1
passthrough to the only primitive that could fill it, and do **not** create a
parallel semantic collection for a category that has no real mapping choices
(this is the redundant-borders trap: a "semantic" border layer that just mirrors
the one primitive border value adds pure overhead).

Apply this test per category: *"Could this semantic role sensibly point at a
different primitive, now or in another mode?"* If yes, it's a real semantic
token. If no, keep that category single-tier — consumers reference the primitive
directly, and you don't build a mirror collection. This is what makes the output
consistent run-to-run instead of an arbitrary guess about which categories to
duplicate.

## Step 2 — Build the PRIMITIVE tier, then PAUSE

Create the primitive variable collection (e.g. named `Primitives`) and all
primitive variables, using a scripted loop via the active write mechanism.

Mode handling: create the mode structure the user chose. For light/dark,
primitives are usually mode-independent raw values (a gray ramp is the same in
both modes) OR you define both — follow what the brainstorm settled. Keep the
mode setup consistent with how the semantic tier will use it.

Then **stop and checkpoint.** This is the critical seam: semantic tokens are
about to alias onto these primitives, so the primitive names and values must be
right *before* you build on them. Show the user the created primitive collection
— summarize the ramps and scales, and if helpful, note that the
token-sheet-builder skill can render them visually later. Ask for explicit
confirmation: "Here are your primitives. Once you're happy, I'll build the
semantic layer on top — and after that, renaming primitives gets disruptive, so
this is the moment to adjust names or values."

Update the manifest: `tokens.primitivesBuilt` = `true`, add the collection name
to `tokens.collections`.

Do not proceed to the semantic tier until the user confirms.

## Step 3 — Build the SEMANTIC tier as aliases

Create the semantic variable collection (e.g. `Semantic`) where every variable
**references a primitive**, not a literal value. In Figma variable terms, bind
each semantic variable to its primitive variable so the alias is live.

Organize semantics by role, e.g.:
- `color.bg.default`, `color.bg.subtle`, `color.bg.emphasis`
- `color.text.primary`, `color.text.secondary`, `color.text.disabled`
- `color.border.default`, `color.border.focus`
- `space.inset.sm/md/lg`, `space.stack.*`
- `radius.sm/md/lg`, etc.

If the system has light/dark modes, the **semantic** tier is typically where the
mode switch lives: `color.bg.default` points at `{color.gray.50}` in light mode
and `{color.gray.900}` in dark mode. The primitives stay fixed; the semantic
aliases differ per mode. This keeps theming clean and is exactly what lets the
sync layer emit `:root` / `.dark` (or equivalent) for web adapters later.

Verify the aliases resolve (a quick read showing semantic tokens point at
primitives, not literals). Then checkpoint with the user: show the semantic
layer and demonstrate the cascade if useful ("if you change `color.gray.50`,
`color.bg.default` follows automatically").

Update the manifest: `tokens.semanticBuilt` = `true`, add the semantic
collection to `tokens.collections`.

## Step 4 — Build Figma STYLES (the third phase)

Figma variables can't express everything a design system needs. Composed
**styles** must be created as a distinct phase *after* the variables exist, so
they can **bind to the tokens you just built** rather than duplicating values:

- **Text styles** — a full type scale needs one text style per role/size
  (e.g. `Heading/XL`, `Body/Default`, `Caption`), each composing family + size +
  weight + line-height + letter-spacing. Bind size and family to the
  corresponding `font.*` variables where Figma supports it, so changing a font
  primitive updates the text styles. A type scale is NOT just variables — these
  composed text styles are what designers actually apply to text layers.
- **Effect styles** — drop shadows and elevation levels (e.g. `Elevation/1`
  through `Elevation/5`). These can't be variables; create them as effect
  styles, driven by the shadow scale from the brainstorm.
- **Grid styles** — layout grids if the user wants them (column/row grids for
  their breakpoints). Optional; only if requested.

Generate styles via the active write mechanism (scripted where possible). Bind
to variables wherever Figma allows so styles consume tokens rather than
duplicating them. Checkpoint with the user: show the created styles.

Update the manifest: set `tokens.stylesBuilt` = `true` and record which style
groups were created in `tokens.styleGroups`. Append `token-builder` to
`completedSkills`.

## Step 5 — Hand off

Tell the user what's unlocked and offer natural next steps without forcing them:
generate a visual stylesheet of all tokens (token-sheet-builder), build an icon
system (icon-system-builder), or start on components (component-builder). If
they're heading toward code, mention that the token-sync skill will later turn
these exact variables into code files — but only when they have a repo, which
comes later.

## Notes that matter

- **Never flatten semantic into literals.** Aliases are the whole point.
- **Lock primitive names before building semantics.** The checkpoint between
  tiers exists precisely to prevent rename cascades.
- **Think in DTCG terms even though you're writing Figma variables.** Each token
  has a value and a type (color, dimension, fontFamily, etc.). The sync layer
  will later normalize these Figma variables into DTCG-format JSON, so keep
  types clean and consistent — it makes the downstream sync trivial.
- **Token-efficiency:** scripted loops via `figma_execute`, batched per tier —
  not per-variable tool calls.
