# Figma Variable Collection Structure — Redesign

**Date:** 2026-06-03
**Scope:** Plugin skill instructions only (fix the defaults that future design systems are built from). Does **not** touch any existing live Figma file.
**Status:** Approved for planning

## Problem

The `token-builder` skill conflated "two-tier" (two *layers* of tokens: primitive → semantic) with "two *collections*" (one `Primitives`, one `Semantic`). It instructs the model to put every token category — color, spacing, typography, radius, borders — into those two collections.

In Figma, a **mode axis** (Light/Dark, Desktop/Mobile, Density) is a property of a **collection**: every variable in a collection is forced to share its modes. So grouping `space` into the same collection as `color` forces spacing to inherit Light/Dark modes, which is meaningless, and leaves no clean place to give spacing its own Desktop/Mobile axis later.

Two concrete bugs result:
1. **Mode collision** — non-color categories inherit color's Light/Dark modes.
2. **Missing border-width tokens** — only border *color* was ever created; there are no variables representing border *width*.

## Decision

Restructure the default into **per-category collections, split by tier** ("full Option B"). Two tiers remain the standard (primitive → semantic). The number of *collections* grows so that each category owns its own independent mode axes.

This reverses the skill's current **anti-redundancy rule**, which must be rewritten (see below), not left to contradict the new doctrine.

### Why per-category primitives (not one shared primitives collection)

Multi-brand is plausible for this system, and per-category primitives is what makes it clean. Figma modes are a **flat list** per collection — they do not stack into dimensions. Putting brand × theme on a single `Color/Semantic` collection needs `BrandA-Light, BrandA-Dark, BrandB-Light, BrandB-Dark` = 4 flat modes, which is exactly the **Professional plan cap (4 modes/collection)**; a third brand or a high-contrast variant breaks it.

Splitting the axes across collections dissolves this:

- **`_Color/Primitive`** carries the **Brand** axis (Brand A, Brand B = raw palettes)
- **`Color/Semantic`** carries the **Theme** axis (Light, Dark = role mapping)

A frame sets both modes independently; Figma resolves `bg/default` (Light) → `{gray/50}` → Brand A's gray. Each collection stays at ≤2 modes, well under the Professional cap, and brands scale without touching spacing/radius/type. (This works because brands differ in *raw palette*, same role mapping. If a brand ever needed a *different* mapping, that brand would also become a mode on `Color/Semantic`.)

## Target Structure (10 collections: 5 primitive + 5 semantic)

### Primitive tier — mode-free unless noted

| Collection | Privacy | Modes | Contents |
|-----------|---------|-------|----------|
| `_Color/Primitive` | private | **Brand A, Brand B** (single *Value* until multi-brand) | `gray/50…900`, `brand/50…900`, `success`·`warning`·`danger` ramps, `white`, `black` |
| `Spacing/Primitive` | **public** | *Value* | `space/0,2,4,8,12,16,24,32,48,64`; `size/icon/{sm,md,lg}` folded in here |
| `_Typography/Primitive` | private | *Value* | `family/{sans,serif,mono}`, `size/100…900`, `weight/{regular,medium,semibold,bold}`, `lineHeight/{tight,normal,relaxed}`, `letterSpacing/{tight,normal,wide}` |
| `_Radius/Primitive` | private | *Value* | `radius/{none,sm,md,lg,xl,full}` |
| `_Border/Primitive` | private | *Value* | `width/{0,1,2,4}` |

### Semantic tier — published, named by role

| Collection | Modes | Contents |
|-----------|-------|----------|
| `Color/Semantic` | **Light, Dark** | `bg/{default,subtle,muted,emphasis,inverse}`, `text/{primary,secondary,disabled,inverse,link}`, `border/{default,subtle,focus,emphasis}`, `status/{success,warning,danger}/{bg,text,border}` |
| `Spacing/Semantic` | *Default* (→ Desktop/Mobile later) | `inset/{xs,sm,md,lg,xl}`, `stack/{xs…xl}`, `inline/{xs…xl}` |
| `Typography/Semantic` | *Default* (→ Desktop/Mobile later) | `size/{body,bodyLg,heading/sm…xl,caption}`, role line-heights → feed text styles |
| `Radius/Semantic` | *Default* | `control`, `card`, `pill`, `field` |
| `Border/Semantic` | *Default* | `width/{default,focus,emphasis}` |

**`Sizing` is intentionally not created.** `size/icon/*` lives in `Spacing/Primitive`; a dedicated `Sizing` pair is added later only if control heights / avatars become real tokens (they're often derived, not tokenized).

### Not variables

Shadows / elevation remain **Figma effect styles**, created in the styles phase and bound to any primitive numbers they need. Unchanged from today.

## Doctrine change: replace the anti-redundancy rule

The current rule (`skills/token-builder/SKILL.md:85-100`) says *don't* build a semantic mirror for a category with no real mapping decision. Under the new structure, dimensional semantic tiers (`Spacing/Semantic`, `Radius/Semantic`, `Border/Semantic`) are **1:1 passthroughs today**, justified by future mode-axis flexibility. The rule must be **rewritten**, not appended, to:

> **Structural consistency.** Every token concern gets both a primitive and a semantic collection. A dimensional semantic tier is justified by a plausible future mode axis even when it is a passthrough today. *Consistency does not license invented roles* — semantic names must still be real usage roles (`inset/md`, `width/focus`), never just renamed primitive steps (`space/12`).

## Privacy

- Privacy mechanism is the **`_` name prefix** (hides a collection from the published library).
- **`Spacing/Primitive` is public** (no underscore) — spacing semantics are intentionally minimal, so designers will reach for raw `space/*` for one-off gaps.
- All other primitives stay private; color/radius/border/type are always consumed via semantics or styles.
- **Device-mode caveat to document:** a value applied directly from `Spacing/Primitive` is *frozen across device modes* — only the `Spacing/Semantic` layer carries future Desktop/Mobile responsiveness. Rule: grab a raw `space/*` for incidental non-responsive gaps; anything that should shrink on mobile must go through a semantic role.

## Mode-application reality to document

A frame may now carry up to three independent modes: **Brand** (`_Color/Primitive`), **Theme** (`Color/Semantic`), and later **Device** (`Spacing`/`Typography`). This is the cost of the flexibility and should be stated plainly in the skill so it isn't a surprise.

## Files to change

1. **`skills/token-builder/SKILL.md`** — primary rewrite:
   - Replace the two-collection model (Steps 2–3) with the per-category primitive + semantic structure above.
   - Rewrite the anti-redundancy rule → structural-consistency doctrine.
   - Add **border-width** primitives + semantics to the worked examples.
   - Add the brand-on-primitive / theme-on-semantic multi-brand guidance and the Professional 4-mode cap note.
   - Add the privacy (`_` prefix), public-spacing-primitive, and device-mode caveats.
   - Document the up-to-three-modes application reality.
   - Update the checkpoint structure (primitive tier is now several collections; checkpoint still happens before semantics).
   - Update frontmatter description if it implies "two collections."

2. **`references/brainstorm-before-build.md`** — **second copy of the anti-redundancy doctrine.** Lines 60–64 (import-mode intake) tell the model to *collapse* passthrough dimensional semantics (it literally names "semantic border tokens just pass through to single primitives… I can collapse those"). Rewrite to the structural-consistency doctrine so import mode **preserves** per-category passthrough semantics instead of collapsing them. Also update the two-tier/collections framing (lines 53–55) to describe per-category collections. Keep two-tier as the default tier count.

3. **`skills/token-sheet-builder/SKILL.md`** — iterate **N collections** when rendering the Foundations page (don't assume exactly Primitives + Semantic). Render border-width swatches.

4. **`skills/token-sync-layer/SKILL.md`** (+ `references/sync-adapters.md` as needed) — three changes:
   - Extraction iterates **N collections**, not two.
   - **Single-mode collections are non-themed** (no phantom `default` theme alongside `:root`/`.dark`).
   - **Primitives can now be multi-mode** (Brand axis on `_Color/Primitive`). The sync layer historically assumes primitives are mode-free; it must now emit **brand themes from the primitive tier**, not only light/dark from the semantic tier.
   - Define a **collection-name → token-name mapping rule** so the tier/category prefix collapses cleanly (`_Color/Primitive` + `gray/500` → `color.gray.500`, not `color.primitive.gray.500`; `Color/Semantic` + `text/primary` → a clean role name). Border-width tokens flow through to outputs.

5. **`skills/component-builder/SKILL.md`** — add **border-width binding** (button/input/card borders bind to `Border/Semantic` width + `Color/Semantic` border color); currently only color/spacing/radius are covered. Add an explicit **spacing-tier rule**: responsive padding/gaps bind to `Spacing/Semantic`; incidental non-responsive gaps may use the public `Spacing/Primitive`. Binding is by-variable so collection moves don't otherwise break it.

6. **`references/manifest-schema.md`** — update the literal example at lines 150–151 (`["Primitives", "Semantic"]`) to the new per-category set; confirm `tokens.collections` array holds the larger set. `tiers` (2/3) and the `primitivesBuilt`/`semanticBuilt` tier-level flags stay valid.

7. **Low-touch wording (no functional break — bind-by-role):** `references/figma-component-standards.md`, `skills/storybook-chromatic-builder/SKILL.md`, `skills/component-pipeline/SKILL.md`, `commands/design-system-status.md` — remove any "two collections" assumption, report/handle N collections, and fold in border-width awareness where components/status reference borders.

## Out of scope

- The user's existing live Figma file (separate future session).
- Component-tier tokens (third tier) — still only surfaced for multi-brand/large libraries, unchanged.
- Building a `Sizing` collection now.

## Success criteria

- A fresh run of `token-builder` produces per-category collections with correctly scoped modes (color carries Light/Dark; spacing/radius/etc. do not inherit them).
- Border-width primitives and semantics exist.
- `Spacing/Primitive` is public; other primitives are private.
- No contradictory anti-redundancy guidance remains in **any** skill or reference (both `token-builder` and `brainstorm-before-build` import mode).
- `token-sheet-builder` and `token-sync-layer` operate over N collections without assuming two, don't emit phantom themes for single-mode collections, and **emit brand themes from multi-mode primitive collections**.
- `component-builder` binds component borders to the new border-width tokens.
