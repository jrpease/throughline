# Figma component standards

Best practices for constructing components in Figma so they're consistent,
maintainable, and translate cleanly to code. The component-builder skill follows
these; getting them right in Figma directly improves the quality of the code the
storybook skill generates (auto layout → flex/padding, variants → props).

## Auto layout on everything

Every component and meaningful container uses **auto layout**. This is
non-negotiable:

- Components must resize correctly with their content (a button grows with its
  label; a card grows with its body).
- Auto layout structure maps directly to code: direction → flex-direction,
  spacing → gap, padding → padding, alignment → justify/align. A component built
  with proper auto layout generates clean flex-based code; one built with
  absolute positioning generates brittle, hard-to-maintain code.
- Bind padding and gap to **spacing tokens**, not hardcoded numbers, so the
  token cascade reaches layout.

## Variants vs. component properties — use the right tool

Figma offers variants (a matrix of discrete options) and component properties
(boolean, text, instance-swap). Use them deliberately:

- **Variants** — for discrete, mutually-exclusive style states that change the
  component's appearance: `type` (primary/secondary/...), `size` (sm/md/lg),
  `state` (default/hover/disabled). These become the code component's variant
  props.
- **Boolean property** — for show/hide of an element. But remember: in code this
  collapses into prop *optionality* (passing the slot shows it), so don't model
  things as booleans that are really "is this slot filled."
- **Text property** — for editable labels.
- **Instance-swap property** — for slots that hold another component (icons,
  avatars). These become the typed slot props (icon-set / typed-component).

Avoid variant explosion: don't create a variant axis for something that should
be a property. A button with type × size × state as variants, plus icon slots as
instance-swap properties, is correct. Making "has icon" a variant axis doubles
the matrix needlessly.

## State handling

- Model the **states that are component variants** (default, hover, focus,
  active, disabled, loading) as a `state` variant axis where they change
  appearance meaningfully.
- Distinguish *component states* (part of the component's definition) from
  *interaction states* shown only for documentation. Don't over-model.
- Keep state styling bound to tokens (a disabled state uses
  `color.text.disabled`, not a hardcoded gray) so it themes correctly.

## Slots and nesting

- Slots that hold other components use instance-swap properties, typed per the
  slot-contract model (icon-set / typed-component / general content).
- Build **atoms before composites** so a composite's slot points at a real,
  already-built component.
- Keep nesting shallow and intentional; deep nesting is hard to maintain and
  generates convoluted code.

## Slots — for composites with freeform content (cards, modals, lists)

Figma slots (open beta since early 2026) create flexible areas inside a
component where content can be freely added, removed, and reordered *inside an
instance* without detaching — the Figma expression of React's `children` / Vue's
`<slot>`. They map closer to code than the old workarounds (hidden layers,
variant explosion), so **prefer them for composite components**.

**Variants vs. slots — the dividing line:**
- **Variants** describe the component's *state*: open/closed, active, size, type.
  Atoms and molecules (button, input, checkbox) use variants for state.
- **Slots** describe *what content can be inserted*. Organisms and sections
  (cards, modals, dialogs, lists, panels, page layouts) use slots for their
  variable content. These are the "variant magnet" components — every content
  combination would otherwise become another variant; slots collapse that.

**How slots interact with the three slot-contract types:**
- **General content area** (card body, modal content) → a **Figma slot**. Code:
  `children` / a composition prop.
- **Constrained swap** (avatar in a card, an action button slot) → a slot with
  **preferred instances** set, which keeps a "typed" feel. Code: a typed
  component prop. (A single fixed element like a button's leading icon can stay a
  plain instance-swap property instead — slots are for freeform/repeating areas.)
- **Single icon** (button leading icon) → instance-swap property, not a slot.

**Practical rules (from Figma's constraints):**
- **Auto layout must be clean first.** Slots depend on a correct auto layout
  setup — a messy one makes everything shift. This is why auto-layout-on-
  everything is a prerequisite, not just a nicety.
- **Slots can't go on the top-level layer** of a component — put them on nested
  frames.
- **Set sensible default content** in slots (a card with a default title/body)
  rather than empty voids — default content gives context; reserve empty slots
  for where inserting is the expected action.
- Use a slot's **description/preferred-instances** to document what belongs
  there — it doubles as team guidance and as the spec the code side reads.
- Slots are in **open beta** — prefer them for composites, but expect occasional
  beta rough edges; the slot→`children` mapping is the natural code translation.

**Capture for code:** record each slot in the component spec as a composition
prop (general → `children`/named composition prop; constrained → typed prop with
the preferred-instance type). The storybook skill implements these as React
composition / `children`.

## Naming

- Components: deterministic, matching the code counterpart (`Button` ↔ `Button`,
  `Avatar` ↔ `Avatar`).
- Variant property values: consistent and, where a single framework is targeted,
  matching that framework's vocabulary (see below).
- Layers inside components: meaningful names, not "Frame 47" — they can surface
  in generated code and in dev handoff.

## Framework vocabulary (single-framework targets)

When `project.uiFramework` is a single framework, align the **variant
vocabulary** to it so the Figma component API matches the code component API:

- `shadcn` button variants: `default`, `secondary`, `destructive`, `outline`,
  `ghost`, `link`.
- `mui` button: `contained`, `outlined`, `text` (with `color` as a separate
  axis); honor Material's state-layer and elevation conventions.
- Other frameworks: follow their documented variant vocabulary.

**Structure stays neutral regardless** — anatomy (slots, layout, what parts
exist) is the same across frameworks; only the variant *names/vocabulary* adapt.

For **multi-framework** targets, use a **neutral vocabulary** (e.g. `primary`,
`secondary`, `tertiary`) and let each code adapter map it — a single Figma
component can't simultaneously match two frameworks' variant names, so accept a
slightly looser fit and map per platform.
