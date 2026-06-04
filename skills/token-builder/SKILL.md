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
- **Collection structure** — two *tiers*, but **one collection per category per
  tier**, never one giant `Primitives` + one giant `Semantic`. In Figma a mode
  axis (Light/Dark, Desktop/Mobile, Brand) belongs to the *collection*, so every
  variable in a collection is forced to share its modes. Putting `space` in the
  same collection as `color` drags spacing into Light/Dark, which is meaningless.
  Default layout (single-brand): private primitive collections `_Color/Primitive`,
  `_Typography/Primitive`, `_Radius/Primitive`, `_Border/Primitive`, and a
  **public** `Spacing/Primitive`; published semantic collections `Color/Semantic`
  (Light/Dark), `Spacing/Semantic`, `Typography/Semantic`, `Radius/Semantic`,
  `Border/Semantic`. Privacy is the leading-`_` prefix. `size/icon/*` lives in
  `Spacing/Primitive`; don't create a `Sizing` collection unless control
  heights/avatars become real tokens.
- **Multi-brand** — keep two axes in two collections so they don't multiply.
  Brand lives on `_Color/Primitive` (modes = Brand A, Brand B = raw palettes);
  Theme lives on `Color/Semantic` (modes = Light, Dark). A frame sets both
  independently and Figma resolves `bg/default`(Light) → `{gray/50}` → Brand A's
  gray. This keeps each collection ≤2 modes — under the Figma **Professional cap
  of 4 modes/collection**. (Brand-on-primitive assumes brands differ in raw
  palette, same role mapping; if a brand needs a *different* mapping, it also
  becomes a mode on `Color/Semantic`.)

Show the proposed full structure back to the user and get sign-off before
creating anything.

### The structural-consistency rule (prevents the "different every time" problem)

Every token concern gets **both** a primitive and a semantic collection, even
when the semantic tier is a 1:1 passthrough today. A dimensional semantic tier
(`Spacing/Semantic`, `Radius/Semantic`, `Border/Semantic`) is justified by a
**plausible future mode axis** — e.g. adding Desktop/Mobile to spacing later —
which only works if the semantic collection already exists to carry that axis.
Building every concern the same way is also what makes the output consistent
run-to-run instead of an arbitrary guess about which categories to duplicate.

The one guardrail: **consistency does not license invented roles.** Semantic
names must be real usage roles (`inset/md`, `width/focus`, `text/primary`),
never just renamed primitive steps (`space/12`, `width/1`). A passthrough role
with a meaningful name is fine; a fake role nobody applies is not. If you can't
name a genuine role for a category, give it semantic roles that map to actual
usage rather than mirroring the primitive scale step-for-step.

## Step 2 — Build the PRIMITIVE tier, then PAUSE

Create the **per-category primitive collections** and their variables via a
scripted loop on the active write mechanism. Default set:

- `_Color/Primitive` — color ramps (`gray/50…900`, `brand/50…900`,
  `success`/`warning`/`danger`, `white`, `black`).
- `Spacing/Primitive` — the spacing scale (`space/0,2,4,8,12,16,24,32,48,64`)
  **plus** `size/icon/{sm,md,lg}`.
- `_Typography/Primitive` — `family/*`, `size/*`, `weight/*`, `lineHeight/*`,
  `letterSpacing/*`.
- `_Radius/Primitive` — `radius/{none,sm,md,lg,xl,full}`.
- `_Border/Primitive` — `width/{0,1,2,4}`. **Do not skip border width** — borders
  need a width primitive, not only a color.

**Privacy:** the leading-`_` prefix hides a collection from the published
library. Keep color/type/radius/border primitives private (they're always
consumed through semantics or styles). Make **`Spacing/Primitive` public** (no
underscore) — spacing semantics are intentionally minimal, so designers will grab
raw `space/*` for one-off gaps. Note the trade-off in your checkpoint summary: a
value applied directly from `Spacing/Primitive` is *frozen across device modes*;
only `Spacing/Semantic` carries future Desktop/Mobile responsiveness.

**Modes at the primitive tier:** primitives are usually mode-free (a single
*Value* mode). The exception is multi-brand: give `_Color/Primitive` a Brand mode
axis (Brand A, Brand B) holding each brand's raw palette. All other primitive
collections stay single-mode.

Then **stop and checkpoint.** This is the critical seam: semantic tokens are
about to alias onto these primitives, so the primitive names and values must be
right *before* you build on them. Show the user the created collections —
summarize the ramps and scales, note which are public vs private, and if helpful
mention the token-sheet-builder skill can render them visually later. Ask for
explicit confirmation: "Here are your primitives. Once you're happy, I'll build
the semantic layer on top — and after that, renaming primitives gets disruptive,
so this is the moment to adjust names or values."

Update the manifest: `tokens.primitivesBuilt` = `true`, add every created
collection name to `tokens.collections`.

Do not proceed to the semantic tier until the user confirms.

## Step 3 — Build the SEMANTIC tier as aliases

Create the **per-category semantic collections**, where every variable
**references a primitive**, not a literal value. Bind each semantic variable to
its primitive so the alias is live. Default set and modes:

- `Color/Semantic` — modes **Light, Dark** (+ a Brand mode only if a brand needs
  a different *mapping*, not just a different palette). Roles: `bg/{default,
  subtle,muted,emphasis,inverse}`, `text/{primary,secondary,disabled,inverse,
  link}`, `border/{default,subtle,focus,emphasis}`, `status/{success,warning,
  danger}/{bg,text,border}`.
- `Spacing/Semantic` — single *Default* mode now, structured so Desktop/Mobile
  can be added later. Roles: `inset/{xs,sm,md,lg,xl}`, `stack/*`, `inline/*`.
- `Typography/Semantic` — single *Default* mode (room for Desktop/Mobile). Roles:
  `size/{body,bodyLg,heading/sm…xl,caption}` and role line-heights; these feed
  the text styles built in Step 4.
- `Radius/Semantic` — single mode. Roles: `control`, `card`, `pill`, `field`.
- `Border/Semantic` — single mode. Roles: `width/{default,focus,emphasis}`
  aliasing `_Border/Primitive` widths.

These dimensional semantic tiers are often passthroughs today — that's expected
under the structural-consistency rule; keep the role names real (`inset/md`, not
`space/16`).

The **color** semantic tier is where the Light/Dark switch lives:
`color.bg.default` → `{gray/50}` in Light and `{gray/900}` in Dark. Primitives
stay fixed; the semantic aliases differ per mode. This is exactly what lets the
sync layer emit `:root`/`.dark` for web later.

**Mode-application reality (state this to the user):** a frame can now carry up
to three independent modes — Brand (`_Color/Primitive`), Theme (`Color/Semantic`),
and later Device (`Spacing`/`Typography`). That's the cost of independent axes.

Verify the aliases resolve (a quick read showing semantic tokens point at
primitives, not literals). Then checkpoint: show the semantic layer and
demonstrate the cascade if useful ("change `gray/50` and `bg/default` follows").

Update the manifest: `tokens.semanticBuilt` = `true`, add every semantic
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
