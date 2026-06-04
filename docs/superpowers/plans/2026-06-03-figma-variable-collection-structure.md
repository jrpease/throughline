# Figma Variable Collection Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the design-system skills so a generated token system uses per-category Figma variable collections (each owning its own mode axis), adds border-width tokens, and reverses the anti-redundancy doctrine — fixing the mode-collision and missing-border-width bugs at the source.

**Architecture:** Pure markdown edits to plugin skill/reference files. No code, no test runner. Each task edits one file (or one tight cluster), with `grep` checks standing in for tests: verify the *old* guidance is gone and the *new* guidance is present, then a read-through for internal consistency. Frequent commits, one per task.

**Tech Stack:** Markdown skill files under `skills/`, `references/`, `commands/`. Source of truth: `docs/superpowers/specs/2026-06-03-figma-variable-collection-structure-design.md`.

**Conventions for every task:**
- Edits use the Edit tool with the exact anchor strings quoted below.
- "Verify" steps run from repo root: `/Users/jordansstudio/dev/throughline/.claude/worktrees/nervous-mestorf-38e650`.
- Commit messages end with the repo's `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

### Task 1: Rewrite `token-builder` Step 1 — Tiers bullet → collection structure

**Files:**
- Modify: `skills/token-builder/SKILL.md:76-80` (the `**Tiers**` bullet)

- [ ] **Step 1: Replace the Tiers bullet with a Collection-structure bullet**

Anchor to replace (the bullet currently at lines 76-80):

```
- **Tiers** — default to **two-tier** (primitive + semantic). Only raise the
  option of a third **component** tier if the user signals multi-brand,
  white-labeling, or a very large/robust component library — for a single-brand
  project it adds complexity without payoff, so don't even surface it. If the
  user opts in, component tokens alias onto semantic tokens (e.g.
  `button.bg.primary` → `{color.bg.emphasis}`).
```

New text:

```
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
```

- [ ] **Step 2: Verify the new bullets are present**

Run: `grep -n "Collection structure" skills/token-builder/SKILL.md && grep -n "Professional cap" skills/token-builder/SKILL.md`
Expected: both match (one line each).

- [ ] **Step 3: Commit**

```bash
git add skills/token-builder/SKILL.md
git commit -m "token-builder: add per-category collection + multi-brand structure to Step 1

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Reverse the anti-redundancy rule in `token-builder` → structural consistency

**Files:**
- Modify: `skills/token-builder/SKILL.md:85-100` (the `### The anti-redundancy rule` section)

- [ ] **Step 1: Replace the entire anti-redundancy section**

Anchor to replace (heading + body, lines 85-100):

```
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
```

New text:

```
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
```

- [ ] **Step 2: Verify the doctrine flipped**

Run: `grep -n "structural-consistency rule" skills/token-builder/SKILL.md && ! grep -n "keep that category single-tier" skills/token-builder/SKILL.md`
Expected: heading matches; the old "single-tier" phrase is gone (command exits 0).

- [ ] **Step 3: Commit**

```bash
git add skills/token-builder/SKILL.md
git commit -m "token-builder: replace anti-redundancy rule with structural-consistency doctrine

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Rewrite `token-builder` Step 2 (primitive tier) for per-category collections + privacy + border width

**Files:**
- Modify: `skills/token-builder/SKILL.md:102-124` (Step 2 body, through the manifest-update line)

- [ ] **Step 1: Replace the Step 2 body**

Anchor to replace — from the heading line `## Step 2 — Build the PRIMITIVE tier, then PAUSE` through the line `Do not proceed to the semantic tier until the user confirms.` (lines 102-124).

New text:

```
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
```

- [ ] **Step 2: Verify**

Run: `grep -n "_Border/Primitive" skills/token-builder/SKILL.md && grep -n "Make \*\*\`Spacing/Primitive\` public" skills/token-builder/SKILL.md && ! grep -n "Create the primitive variable collection (e.g. named" skills/token-builder/SKILL.md`
Expected: border + public-spacing matches present; old singular-collection phrasing gone (exit 0).

- [ ] **Step 3: Commit**

```bash
git add skills/token-builder/SKILL.md
git commit -m "token-builder: rewrite primitive tier for per-category collections, privacy, border width

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Rewrite `token-builder` Step 3 (semantic tier) for per-category collections, per-axis modes, border-width semantics

**Files:**
- Modify: `skills/token-builder/SKILL.md:126-152` (Step 3 body)

- [ ] **Step 1: Replace the Step 3 body**

Anchor to replace — from `## Step 3 — Build the SEMANTIC tier as aliases` through the manifest-update line ending `add the semantic collection to tokens.collections.` (lines 126-152).

New text:

```
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
```

- [ ] **Step 2: Verify**

Run: `grep -n "width/{default,focus,emphasis}" skills/token-builder/SKILL.md && grep -n "up to three independent modes" skills/token-builder/SKILL.md && ! grep -n "Create the semantic variable collection (e.g." skills/token-builder/SKILL.md`
Expected: border-width semantic + three-modes matches present; old singular phrasing gone.

- [ ] **Step 3: Read-through consistency check**

Read `skills/token-builder/SKILL.md` Steps 1-3 end to end. Confirm: collection names are spelled identically everywhere (`_Color/Primitive`, `Spacing/Primitive`, `Color/Semantic`, …); no remaining reference to a single `Primitives`/`Semantic` collection; the "Notes that matter" section (still below) doesn't contradict the new structure.

- [ ] **Step 4: Commit**

```bash
git add skills/token-builder/SKILL.md
git commit -m "token-builder: rewrite semantic tier for per-category collections and per-axis modes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Update `token-builder` "Notes that matter" for privacy + multi-mode primitives

**Files:**
- Modify: `skills/token-builder/SKILL.md:188-198` (the `## Notes that matter` list)

- [ ] **Step 1: Add three notes to the list**

Anchor — the existing first bullet:

```
- **Never flatten semantic into literals.** Aliases are the whole point.
```

Replace with:

```
- **Never flatten semantic into literals.** Aliases are the whole point.
- **One collection per category per tier.** Modes belong to the collection, so
  splitting by category is what keeps color's Light/Dark from infecting spacing.
- **Privacy is the `_` prefix.** Only `Spacing/Primitive` is public by default;
  all other primitives are private.
- **Primitives can be multi-mode.** Brand lives on `_Color/Primitive`; the sync
  layer must emit brand themes from the primitive tier, not just light/dark from
  semantics.
```

- [ ] **Step 2: Verify**

Run: `grep -n "One collection per category per tier" skills/token-builder/SKILL.md`
Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add skills/token-builder/SKILL.md
git commit -m "token-builder: add structure/privacy/multi-mode-primitive notes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Reverse the second anti-redundancy copy in `brainstorm-before-build.md` (import mode)

**Files:**
- Modify: `references/brainstorm-before-build.md:52-67` (Import bullet) and `:53` two-tier wording

- [ ] **Step 1: Replace the "Flag redundancy as a cleanup opportunity" paragraph**

Anchor to replace (lines 58-67):

```
  **Flag redundancy as a cleanup opportunity.** While ingesting, apply the
  anti-redundancy test (see token-builder Step 1). If their existing set
  contains redundant structure — e.g. a "semantic" collection that just mirrors
  primitives 1:1 with no real mapping decision — don't silently preserve it and
  don't silently collapse it. Surface it: "Your imported system has a few places
  that look redundant — for example, your semantic border tokens just pass
  through to single primitives. I can collapse those to keep things lean, or
  preserve your structure exactly as-is. Which would you prefer?" Let the user
  choose per case (or all at once). Cleaning up is often the more valuable
  service, but it's their system, so it's their call.
```

New text:

```
  **Organize into per-category collections.** While ingesting, map their values
  onto the structural-consistency model (see token-builder Step 1): one
  primitive and one semantic collection per category, split so each category owns
  its own mode axis. Passthrough dimensional semantics (e.g. border-width
  semantics that alias a single primitive) are **expected and kept** — they exist
  to carry a future mode axis — so do not collapse them. The only thing to flag
  is a genuine naming problem: a "semantic" token that's just a renamed primitive
  step with no real role (`space-12` rather than `inset/md`). Surface those:
  "A few of your semantic names mirror primitive steps rather than naming a role
  — want me to rename them to usage roles, or keep them as-is?" Let the user
  choose. Keep structure; fix only fake roles.
```

- [ ] **Step 2: Update the two-tier framing in the Import bullet**

Anchor (line 53): `existing system) and wants it ingested and organized into the two-tier Figma`
Replace with: `existing system) and wants it ingested and organized into the per-category Figma`

- [ ] **Step 3: Verify**

Run: `! grep -n "I can collapse those to keep things lean" references/brainstorm-before-build.md && grep -n "Organize into per-category collections" references/brainstorm-before-build.md`
Expected: old collapse phrasing gone (exit 0); new heading present.

- [ ] **Step 4: Commit**

```bash
git add references/brainstorm-before-build.md
git commit -m "brainstorm-before-build: align import mode with structural-consistency doctrine

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Update the sync layer for N collections, single-mode-non-themed, multi-mode primitives, and a name-mapping rule

**Files:**
- Modify: `skills/token-sync-layer/SKILL.md:74-93`
- Modify: `references/sync-adapters.md:88-95`

- [ ] **Step 1: Replace the extraction paragraph in `token-sync-layer`**

Anchor (lines 74-79):

```
Using the active write mechanism (`figma.mechanism`, default Console MCP —
prefer its full-design-system extraction, which works on any Figma plan), read
the variable collections and normalize them into **DTCG-format JSON** (`$value`,
`$type`, with semantic tokens expressed as `{group.token}` references to
primitives, not flattened literals). Preserve modes (light/dark/brand) as the
DTCG structure the adapters expect.
```

New text:

```
Using the active write mechanism (`figma.mechanism`, default Console MCP —
prefer its full-design-system extraction, which works on any Figma plan), read
**every variable collection** (there are now several per tier, e.g.
`_Color/Primitive`, `Spacing/Primitive`, `Color/Semantic`, …) and normalize them
into **DTCG-format JSON** (`$value`, `$type`, with semantic tokens expressed as
`{group.token}` references to primitives, not flattened literals).

Three rules for the multi-collection structure:
- **Iterate N collections**, not a fixed two. Don't assume one `Primitives` +
  one `Semantic`.
- **Single-mode collections are non-themed** — a collection with one mode (e.g.
  `Spacing/Semantic`) emits flat values, never a phantom `default` theme
  alongside `:root`/`.dark`.
- **Primitives can be multi-mode** — `_Color/Primitive` carries a Brand axis, so
  emit **brand themes from the primitive tier**, not just light/dark from
  semantics. Preserve modes (light/dark/brand/device) as the DTCG structure the
  adapters expect.
- **Name mapping:** collapse the tier/category prefix into clean token names —
  `_Color/Primitive` + `gray/500` → `color.gray.500` (not
  `color.primitive.gray.500`); `Color/Semantic` + `text/primary` →
  `color.text.primary`. The category drives the top-level group; the tier (and
  the `_`) is dropped from the emitted name.
```

- [ ] **Step 2: Update the adapter modes note in `sync-adapters.md`**

Anchor (lines 88-91):

```
- **Web adapters** (`shadcn`, `tailwind`, `mui`, `vanilla-css`): set
  `outputReferences: true` so `--color-bg-default: var(--color-gray-50)` is
  emitted, preserving the cascade. Modes map to selectors: primitives in
  `:root`, semantic mode overrides under `.dark` / `[data-theme="..."]`. The
```

New text:

```
- **Web adapters** (`shadcn`, `tailwind`, `mui`, `vanilla-css`): set
  `outputReferences: true` so `--color-bg-default: var(--color-gray-50)` is
  emitted, preserving the cascade. Modes map to selectors per axis: theme
  overrides (from `Color/Semantic`) under `.dark` / `[data-theme="..."]`, and
  **brand overrides (from the multi-mode `_Color/Primitive`)** under a
  `[data-brand="..."]` selector. Single-mode collections emit flat values in
  `:root` with no theme selector. The
```

- [ ] **Step 3: Verify**

Run: `grep -n "Iterate N collections" skills/token-sync-layer/SKILL.md && grep -n "brand themes from the primitive tier" skills/token-sync-layer/SKILL.md && grep -n "data-brand" references/sync-adapters.md`
Expected: all three match.

- [ ] **Step 4: Commit**

```bash
git add skills/token-sync-layer/SKILL.md references/sync-adapters.md
git commit -m "token-sync-layer: handle N collections, multi-mode primitives, name mapping

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Add border-width binding + spacing-tier rule to `component-builder`

**Files:**
- Modify: `skills/component-builder/SKILL.md:88-92` (the "Bind every visual property" bullet)

- [ ] **Step 1: Replace the binding bullet**

Anchor (lines 88-92):

```
- **Bind every visual property to the system's tokens/styles** — fills to
  semantic color variables, padding to spacing variables, corners to radius
  variables, text to text styles, shadows to effect styles. A component must
  *consume* the design system, never hardcode values. This is what makes the
  token cascade reach components.
```

New text:

```
- **Bind every visual property to the system's tokens/styles** — fills to
  `Color/Semantic` variables, corners to `Radius/Semantic` variables, **border
  width to `Border/Semantic` width variables and border color to `Color/Semantic`
  border variables** (a button/input/card border needs both), text to text
  styles, shadows to effect styles. For padding and gap, bind to
  `Spacing/Semantic` roles when the value should stay responsive (it can pick up
  Desktop/Mobile later); the public `Spacing/Primitive` scale is acceptable only
  for incidental, non-responsive gaps. A component must *consume* the design
  system, never hardcode values. This is what makes the token cascade reach
  components.
```

- [ ] **Step 2: Verify**

Run: `grep -n "Border/Semantic" skills/component-builder/SKILL.md && grep -n "non-responsive gaps" skills/component-builder/SKILL.md`
Expected: both match.

- [ ] **Step 3: Commit**

```bash
git add skills/component-builder/SKILL.md
git commit -m "component-builder: bind component borders to border-width tokens; spacing-tier rule

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Update the manifest schema example + low-touch wording

**Files:**
- Modify: `references/manifest-schema.md:150-151`
- Modify: `skills/token-sheet-builder/SKILL.md:41-43` (default sections list)

- [ ] **Step 1: Update the `collections` example in the manifest schema**

Anchor (lines 150-151):

```
- `collections` — names of the Figma variable collections created (e.g.
  `["Primitives", "Semantic"]`).
```

New text:

```
- `collections` — names of the Figma variable collections created. With the
  per-category structure this is several names per tier, e.g.
  `["_Color/Primitive", "Spacing/Primitive", "_Typography/Primitive",
  "_Radius/Primitive", "_Border/Primitive", "Color/Semantic", "Spacing/Semantic",
  "Typography/Semantic", "Radius/Semantic", "Border/Semantic"]`.
```

- [ ] **Step 2: Add Border width to the token-sheet default sections**

Anchor (lines 41-43):

```
itself (the page should feel like the brand it documents). Default to a clean,
sectioned layout: Color (ramps as rows of swatches), Typography (the type scale
rendered in the actual text styles), Spacing (visual bars), Radius (sample
shapes), Elevation (sample cards with the effect styles).
```

New text:

```
itself (the page should feel like the brand it documents). Default to a clean,
sectioned layout, one section per collection/style group: Color (ramps as rows
of swatches), Typography (the type scale rendered in the actual text styles),
Spacing (visual bars), Radius (sample shapes), Border width (sample rules at
each width), Elevation (sample cards with the effect styles).
```

- [ ] **Step 3: Verify**

Run: `grep -n "_Color/Primitive" references/manifest-schema.md && grep -n "Border width (sample rules" skills/token-sheet-builder/SKILL.md && ! grep -n '"Primitives", "Semantic"' references/manifest-schema.md`
Expected: new manifest example + border-width section present; old `["Primitives", "Semantic"]` example gone (exit 0).

- [ ] **Step 4: Commit**

```bash
git add references/manifest-schema.md skills/token-sheet-builder/SKILL.md
git commit -m "manifest + token-sheet: per-category collections example and border-width section

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Final sweep for stale two-collection assumptions

**Files:**
- Read-only audit across `skills/`, `references/`, `commands/`

- [ ] **Step 1: Grep for any surviving "two collection" / `["Primitives", "Semantic"]` assumption**

Run:
```bash
grep -rniE "two collection|both collections|the primitives collection|the semantic collection|\"Primitives\", ?\"Semantic\"" skills references commands --include="*.md"
```
Expected: no matches. If any appear, fix them in place to reference the per-category structure, then re-run until clean.

- [ ] **Step 2: Confirm spec coverage**

Open `docs/superpowers/specs/2026-06-03-figma-variable-collection-structure-design.md` and confirm each of the 7 change targets in its "Files to change" list maps to a task above (token-builder → Tasks 1-5; brainstorm-before-build → Task 6; token-sheet-builder → Tasks 9; token-sync-layer + sync-adapters → Task 7; component-builder → Task 8; manifest-schema → Task 9; low-touch files → Task 10 sweep). Note any gap and add a task.

- [ ] **Step 3: Commit any fixes from Step 1**

```bash
git add -A
git commit -m "Sweep: remove residual two-collection assumptions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(If Step 1 was already clean and nothing changed, skip the commit.)

---

## Self-Review

**Spec coverage** — every "Files to change" item in the spec maps to a task:
- `token-builder/SKILL.md` → Tasks 1 (structure), 2 (doctrine), 3 (primitives), 4 (semantics), 5 (notes) ✓
- `brainstorm-before-build.md` → Task 6 ✓
- `token-sheet-builder/SKILL.md` → Task 9 (border-width section; N-collection wording already present at line 48) ✓
- `token-sync-layer/SKILL.md` + `sync-adapters.md` → Task 7 ✓
- `component-builder/SKILL.md` → Task 8 ✓
- `manifest-schema.md` → Task 9 ✓
- low-touch (`figma-component-standards`, `storybook-chromatic-builder`, `component-pipeline`, `design-system-status`) → Task 10 sweep ✓

**Placeholder scan** — no TBD/TODO; every edit step contains the exact replacement prose and exact grep anchors.

**Name consistency** — collection names are spelled identically across tasks: `_Color/Primitive`, `Spacing/Primitive` (public, no underscore), `_Typography/Primitive`, `_Radius/Primitive`, `_Border/Primitive`, `Color/Semantic`, `Spacing/Semantic`, `Typography/Semantic`, `Radius/Semantic`, `Border/Semantic`. Border-width roles: primitive `width/{0,1,2,4}`, semantic `width/{default,focus,emphasis}`.
