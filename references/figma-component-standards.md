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

## Clip content — off by default

Figma creates every new frame with **`clipsContent = true`**, so if you don't set
it, your layout and component frames silently clip. That clipping cuts off anything
a child draws **at or past the frame's edge**, which is exactly the stuff that makes
a component read as polished:

- **Outer strokes / borders.** A child with `strokeAlign = "OUTSIDE"` (or a flush-to-
  edge border) gets the outer half of its stroke sliced away — borders look thin,
  uneven, or missing on one side.
- **Focus rings.** A focus ring extends *beyond* the control's edge by design (see
  *State handling*), so a clipping **ancestor** eats it — keep the doc card, variant
  rows, and component set unclipped. One deliberate exception: a *filled* control that
  casts its focus ring as a **drop-shadow effect** must have `clipsContent = true` on
  that control frame itself — a frame's own effect isn't clipped by its own clip, and
  clipping gives it a clean ring silhouette. The no-clip rule is about *ancestors*, not
  that control frame.
- **Shadows / elevation.** Drop shadows on a child near the edge get cut at the frame
  boundary instead of feathering out.

**The rule:** explicitly set **`clipsContent = false`** on component frames, variant
rows, component sets, and the layout frames that hold them. Don't rely on the default —
set it, and read it back.

**Turn clipping ON only for a deliberate cutoff** — a frame whose *job* is to crop its
contents to a fixed window: a scroll container, an image/media crop frame, an
avatar/thumbnail masked to its bounds, or anything emulating CSS `overflow: hidden`.
The one other legitimate ON case is a **filled control frame that casts its focus ring
as a drop-shadow effect** — clip ON gives that ring a clean silhouette (see *State
handling*), and clipping the frame's *children* doesn't clip the frame's own effect.
Everywhere else, leave content unclipped so strokes, focus rings, and shadows render in
full.

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

## Component set arrangement (the variant matrix layout)

A `ComponentSet` (the frame holding all variants) must itself be a clean
**auto-layout** frame, not a scatter of variants at arbitrary coordinates. The
layout law is fixed: **variants are rows, states are columns.** Lay the matrix out
as a readable grid so it's scannable in Figma and predictable run-to-run:

- **Variants are always their own row; states are always the columns.** Each row is
  a single variant (one `type`, or one `type`+`size` combination) and steps through
  every `state` left-to-right (default → hover → focus → active → disabled →
  loading…) as the columns. The next row is the next variant. Reading down the rows
  enumerates the variants; reading across a row enumerates the states. This holds
  for every component — never put states on rows or variants on columns.
- **Size variations are variants — each size gets its own row.** A different size is
  a distinct variant, not a state, so treat `type × size` as the row identity (one
  row per `type`+`size` combination, still stepping through states across the
  columns) and **stack the size groups vertically** (all `sm` rows, then all `md`,
  then `lg`), so the layout stays a 2-D grid instead of sprawling sideways. Never
  model size as a column or as anything other than its own row.
- **Always include the full relevant state set per row** — don't ship a component
  with only `default`. Every component renders its complete, applicable state set
  across the columns (see "State handling" for the per-component checklist), so the
  set documents the real interaction surface, not a single resting state.
- **Small sets — build with auto layout, bound to spacing tokens.** For a handful of
  variants, set the component set's `layoutMode` (a vertical outer auto layout of
  horizontal rows) with `itemSpacing`/padding bound to `Spacing/*` tokens. Verify the
  result is genuinely auto-layout (read back `layoutMode`), not just tidy coordinates.
- **Large matrices — use deterministic grid coordinates, not layout hacks.** For big
  sets (many variants, more than ~1 row), lay the showcase out by positioning each
  variant into a uniform grid cell **centered on its hugged size**, with
  `layoutMode = "NONE"` on the set. This keeps every variant hugging/flush while the
  grid stays aligned. Specifically:
  - **Never set `minWidth` or a fixed width on variants to line up columns.** Width is
    an **intrinsic component property** — it ships to every instance, so the visual
    control ends up floating inside a wider component (and stretches any focus ring).
    Alignment is a *display* concern; solve it with cell coordinates, not variant width.
  - **Don't rely on `layoutMode = "GRID"`.** CSS-grid auto layout does not lay out
    reliably through the plugin bridge today — it reads back correct but renders as a
    single squished row. Use explicit coordinates for matrices larger than ~1 row.
  - **Don't use `figma_arrange_component_set` on a set already inside a doc card** — it
    **recreates the set inside its own labeled white container**, detaching it from a
    hand-built card. Use it only for a standalone set you haven't yet placed.

This ordering is deterministic: given the same matrix, the set looks the same every
run, and it mirrors how the states/types map to code props.

## State handling

- **Always include every relevant state for the component — completeness is the
  default, not a judgment call.** A component's `state` axis must enumerate its full
  applicable interaction surface, not just `default`. The baseline interactive set
  is **default, hover, focus, active (pressed), disabled**; add the **conditional**
  states whenever they apply to that component: **loading** (anything that triggers
  async work — buttons, submit inputs), **selected** (toggles, segmented controls,
  list/menu items, chips), and **success / error** (validated inputs, form fields,
  async-result buttons). Decide *which* conditional states apply, but never drop a
  state that does apply to keep the matrix small.
  - **Button:** default, hover, focus, active (pressed), disabled — plus loading
    (and selected / success / error where the button supports them).
  - **Input / text field:** default, hover, focus, disabled — plus error, success,
    and (where async) loading.
  - **Checkbox / radio / toggle / chip:** default, hover, focus, active, disabled —
    plus selected (and indeterminate where it applies).
- Keep these on a `state` variant axis where they change appearance meaningfully;
  each becomes a column in the set per "Component set arrangement".
- Distinguish *component states* (part of the component's definition) from
  purely *decorative* states. Include every interaction state a user can actually
  reach; only omit a state when the component genuinely cannot enter it.
- Keep state styling bound to tokens (a disabled state uses
  `color.text.disabled`, not a hardcoded gray) so it themes correctly.
- **Focus states are derived from the target library, not a house style.** Do not
  invent a custom focus ring. Build the focus state to match `project.uiFramework`'s
  real `:focus-visible` idiom (the same value `component-builder` already reads for
  variant vocabulary), keeping the ring color bound to `border/focus` and its width to
  `width/focus`:
  - **shadcn / tailwind / default / null / multi-framework** — the modern ring:
    recolor the control's border to `border/focus` **plus** a `0 0 0 3px`-equivalent
    ring at ~50% opacity (spread bound to `width/focus`). This is the default whenever
    no single library is set.
  - **mui** — per component: inputs thicken + recolor their border to `width/focus` /
    `border/focus`; buttons and other clickables get a `0 0 0 N` ring. (The ripple
    isn't represented in Figma.)
  - **vanilla-css** — an offset **outline stroke**: a ring layer with
    `strokeAlign = "OUTSIDE"` sitting `offset/focus` clear of the edge (maps to real
    `outline` / `outline-offset`, satisfying WCAG 2.4.11 / 2.4.13). This is the **only**
    recipe that uses `offset/focus`; `strokeAlign = "INSIDE"` here grows the stroke
    inward, eats the gap, and is a fail.
  - **ios-swift** — no web focus ring; skip (native focus handling).
  - **tier-2 / other framework** — research that library's focus-visible idiom and
    replicate it (shadow vs. outline vs. border); fall back to the shadcn ring if
    unknown.
- **How you build the ring depends on the control's fill, because a Figma
  `DROP_SHADOW` only casts from opaque pixels** (unlike CSS `box-shadow`, which draws
  from the border-box). For the shadow-based recipes:
  - **Filled control** (has an opaque fill) → a **drop-shadow effect** on the control
    (offset 0, blur 0, spread = ring width, color = `border/focus`). No extra node. The
    control frame carrying the effect must have **`clipsContent = true`** so it casts a
    clean rectangular ring (a frame's own effect isn't clipped by its own clip); its
    **ancestor** frames stay `clipsContent = false` so the ring isn't sliced.
  - **Transparent control** (outline / ghost / link, unfilled input — no opaque fill to
    cast from) → an **absolutely-positioned ring child**: a `RECTANGLE` with
    `layoutPositioning = "ABSOLUTE"`, `strokeAlign = "OUTSIDE"`, stroke weight = ring
    width, sized to the parent with `STRETCH` constraints, parent `clipsContent =
    false`. A **child, never a wrapper** — so it doesn't inflate layout and coexists
    with any existing border. `clipsContent` does **not** make a transparent frame cast
    a drop-shadow; use the ring-child instead.
  Both mechanisms map to the same `box-shadow: 0 0 0 3px var(--ring)` in code.
- **Never wrap the control to make room for the ring.** Do not add a parent frame with
  `offset/focus` padding around the control, and do not reserve ring padding on
  non-focus states — a wrapper makes the component bounds larger than the visual
  control on every variant (the control floats inside an oversized frame). The ring is
  an effect or a stroke **child** on the control itself; component bounds stay flush.
- **Retrofitting a previously-built focus state.** Earlier builds used a house-style
  **inside/outside offset stroke** or a **padded wrapper** for focus. Whenever you
  rebuild or touch an existing component, migrate it to the recipe above: replace a
  padded focus wrapper with an effect or ring-child on the control, replace an
  inside-aligned stroke, and add the missing ring to any **transparent** variant that
  has none (the shadow-based recipe silently skips transparent controls — see the
  fill-based mechanism above). The old pattern is a fail in the post-build audit.

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

**Coloring an icon slot by tone/state:** line/outline icons (Lucide, Material
Symbols outlined, most icon sets here) draw with a **stroke and no fill**, so
their color must be bound on the icon vectors' **stroke** — to the *same*
variable as the adjacent text/label (e.g. a badge icon's stroke = the tone's
`fg`). Do **not** bind the icon's *fill* (a filled outline-icon path renders as a
solid blob), and never leave a fixed dark stroke across tones. Bind the override
on the instance's vectors (never edit the shared `icon/*` source component — that
would recolor every other usage).

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

## Documentation artboards & canvas layout

The rules above govern the *inside* of a component. These govern how each
generated component is **presented** (its documentation card) and how cards are
**arranged on the canvas** — separate concerns the auto-layout-on-everything rule
doesn't fully cover, and a common source of overlapping text and overlapping
frames. Applies to `component-builder`, `icon-system-builder`, and
`token-sheet-builder`.

### Every component sits on its own documentation card

Wrap each generated component in a "doc card" — a frame that holds the component
plus a small header. Never leave components floating on bare canvas. The card
shows:

- **Component name** (the deterministic name, matching code).
- **Short description** (what it is / when to use it).
- **Status indicator** — a chip reading `draft` / `beta` / `stable` /
  `deprecated`, colored from semantic tokens (e.g. warning for draft/beta,
  success for stable, neutral/danger for deprecated). Source the value from
  `components.meta[name].status`. **Name the chip frame `Status` and its label
  text node `Status Label`** so the finalize write-back (below) can find and
  update them later — a chip with no deterministic name can't be promoted.
- **Last updated** — a date, from `components.meta[name].updatedAt`, refreshed
  whenever the component is rebuilt. **Name this text node `Last Updated`** for
  the same reason.

**Always separate the header from the component area with a division element.** The
header block (name, description, status, date) and the component/variant area below
it must be **visually segmented** — never let them run together as one undivided
block. Use one of two approaches, both token-bound:

- **A divider line** between the header and the component area — a 1px rule (or a
  bottom border on the header container) bound to `Border/Semantic`. Name it
  `Header Divider` so it's findable. This is the simplest default.
- **A distinct header surface** — give the header container a slightly different
  surface fill (e.g. header → `bg/subtle`/`bg/muted`, component area → `bg/surface`)
  so the change in surface color creates the segmentation on its own.

Pick whichever reads better for the card's styling, but **one of them is required** —
a doc card with no header/component division is a fail in the post-build audit.
Whichever you choose, bind it to variables (border or surface tokens), never a
hardcoded hex.

**The component area's surface must contrast with every variant's fill.** Choose a
doc-card component-area background that differs from **all** of the component's resting
variant fills — default to `bg/default` — and never reuse a token that any variant
fills with. If the area used `bg/subtle` while a `secondary` variant also fills
`bg/subtle`, that variant renders invisible against the panel. This is a token-choice
check, not a visual one: verify the area's token against the variant fills, since a
low-contrast overlap can still look fine at a glance in the screenshot.

### Promoting a component's status (write-back on finalize)

A component's status is not static: it starts at `draft` (built in Figma, no code
yet) and is **promoted to `stable` when its code component and stories are built
and approved** (the `storybook-chromatic-builder` finalize step / pipeline
stage 3). Promotion must update **both** the manifest and the live Figma doc card,
or the card lies — it keeps showing `draft` after the component is actually done.
This is the canonical routine; the finalize step references it rather than
re-describing it:

0. **Confirm the Figma write-back first (single batched checkpoint).** A doc-card
   write is an external-system write, so get explicit consent before it — both
   because the user's "I approve the component" is *not* the same as "write to my
   Figma file," and because an unannounced external write trips the safety
   classifier and forces an extra round-trip anyway. State the concrete change in
   one line and proceed on confirmation — e.g. *"I'll update the 9 doc cards in
   Figma: flip the status chips amber → green and set Last Updated to today.
   Confirm?"* One confirmation covers the whole batch; don't ask per card.
1. Set `components.meta[name].status` to the new status (`stable` on finalize) and
   `components.meta[name].updatedAt` to today (ISO date). The manifest is the
   source of truth.
2. If Figma is connected (use `figma.mechanism`), locate the component's doc card
   by its deterministic name (script the write-back per
   `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md` — `getNodeByIdAsync`, and
   an explicit `timeout` since multi-card font-loading writes blow past the default
   ~5s budget), then inside it:
   - set the `Status Label` text to the new status (e.g. `stable`);
   - re-bind the `Status` chip fill to the matching semantic color variable
     (`stable` → success, `draft`/`beta` → warning, `deprecated` → neutral/danger)
     — re-bind the variable, don't hardcode a hex, so it stays mode-aware;
   - set the `Last Updated` text to today's date.
   Then run the visual-validation loop (screenshot → confirm the chip recolored
   and the date changed → re-screenshot).
3. If Figma is **not** connected, still do step 1, and tell the user the card will
   reconcile to the manifest the next time a Figma session runs (the doc card
   always renders from `components.meta[name]`). Offer to reconnect and update it
   now if they want it reflected immediately.

**Icons are the one exception:** the whole icon set lives on a *single* doc card
holding the icon grid — one card for all icons, not one card per icon.

### The doc card must dogfood the design system

The card chrome itself — background, header text, status chip, dividers, padding,
gaps, corner radius — uses **only design-system tokens and styles**, bound to
variables where Figma allows. **No hardcoded hex or px anywhere in the
documentation frame.** Tokens are guaranteed to exist (token-builder runs first),
so the doc cards double as live proof the tokens actually work; if a card can't be
built cleanly from tokens, that's surfacing a real gap in the token set (add the
token — don't hardcode around it).

**How to actually bind it — this is where it goes wrong: the model hardcodes
because it never fetched the variable IDs.** Binding requires the variable's ID,
so *before* styling the card: (1) read the semantic variables with
`figma_get_variables` to get their IDs; (2) **bind, don't set raw values** — set
`boundVariables` / `setBoundVariable(...)` in the script, never a literal hex or
px. Map the card chrome to semantic tokens:
- card / header **background** → a `Color/Semantic` surface role (e.g.
  `bg/surface`, `bg/default`);
- **title / description / labels** text color → `Color/Semantic` text roles
  (`text/default`, `text/muted`);
- **status chip** fill → the status's semantic color (`stable`→success,
  `draft`/`beta`→warning, `deprecated`→neutral/danger) — this is the *same*
  binding the finalize write-back later re-binds, so it MUST be a variable, not a
  hex, or promotion can't recolor it;
- **dividers / borders** → `Border/Semantic`;
- **corner radius** → `Radius/Semantic`;
- **padding and gaps (`itemSpacing`)** → `Spacing/Semantic` (or `Spacing/Primitive`).
Use text/effect **styles** where one exists rather than re-specifying type.

**Verify the bindings, not just the look — a screenshot CANNOT see them.** The
visual-validation loop below confirms layout, but a hardcoded hex and a bound
variable render pixel-identically, so it will **not** catch this violation. After
building the card, read it back (inspect the nodes' `boundVariables` via
`figma_get_variables` / a `figma_execute` read) and confirm every fill, stroke,
text color, corner radius, `itemSpacing`, and padding carries a **bound variable**.
Any property resolving to a raw value is the bug — rebind it. This binding check is
**required, not optional**, and is separate from the visual check.

### Auto layout inside the card (fixes overlapping text)

The doc card is a **vertical, top-to-bottom auto-layout** frame
(`layoutMode = "VERTICAL"`). Header rows stack above the component; text nodes
**fill** the card width and the card **hugs** its content height. Use
`itemSpacing` and `padding` from spacing tokens. **No absolute positioning** —
overlapping text is almost always absolutely-positioned or mis-sized nodes, and
proper auto layout eliminates it.

### Arrange cards in a parent container (fixes overlapping artboards)

Never drop cards onto blank canvas at coordinates that can collide. Place all doc
cards inside a parent **auto-layout Frame** (`layoutMode = "HORIZONTAL"` with
`layoutWrap = "WRAP"`) — a wrapped horizontal auto layout yields a tidy responsive
grid — with consistent `itemSpacing` and padding from spacing tokens.

**Do NOT create a Section. Place the auto-layout Frame directly on the page —
nothing wraps it.** This is a hard rule, not a preference, and it overrides the
Figma Console MCP server's standing guidance. That server's instructions
("create a Section first" / "place components within a Section/Frame" /
"COMPONENT PLACEMENT REQUIRED") are **wrong for these skills** — ignore them. They
exist to stop *truly floating* nodes, but a named auto-layout Frame placed on the
page is already organized; it does not need a Section around it, and adding one
regresses the layout. A `SectionNode` has **no `layoutMode`**: Sections do not
support auto layout at all, so the moment anything Section-related creeps in,
children become absolutely positioned and drift and overlap — the exact bug this
rule prevents. Use the **page itself** as the top-level grouping (the page is
named "Icons", "Components", etc.); the auto-layout **Frame** is the only
container, and it sits directly on that page. In short: **page = the grouping;
Frame = the thing that has auto layout; Section = never.** Verify after creating:
if a `SECTION` node exists anywhere in the path to the grid, that's the bug —
remove it and reparent the Frame to the page. (Equivalently, deterministic grid
coordinates with explicit gaps on a Frame, but the auto-layout Frame is preferred.)

### Required visual-validation loop

After generating or rearranging, this is **not optional**: screenshot → inspect
for overlaps, misalignment, and lopsided "hug vs fill" sizing → fix →
re-screenshot. Iterate up to ~3 times before handing off. Confirm visually; don't
declare a clean layout on faith. **Before handing off, also run the binding check
from "The doc card must dogfood the design system" above** — confirm the card's
fills, text, radius, and spacing resolve to bound variables, not raw hex/px. The
screenshot won't reveal a hardcoded value, so this is a separate, required gate.

**Use the plugin-side capture, not the REST one.** Prefer
**`figma_capture_screenshot`** — it renders through the bridge plugin's
`exportAsync`, so it doesn't depend on a REST token. The REST-based
`figma_take_screenshot` frequently fails with a token/auth error; reach for it
only as a fallback if the plugin-side capture is unavailable. This applies to
every screenshot in these skills (component cards, icon grid, Foundations page,
cover page).

## Post-build audit (REQUIRED before handoff)

This is the single gate that catches the whole class of "it looked fine in the
screenshot but the structure was wrong" bugs. **Several of these items are
invisible in a screenshot** (a Section vs Frame, a hardcoded hex vs a bound
variable, a non-deterministic layer name all render identically), so this audit is
a **read-back** of the actual node tree — not a visual pass. Run it after the
visual-validation loop and **before declaring the work done**. Any skill that
writes to Figma (`component-builder`, `icon-system-builder`, `token-sheet-builder`)
must run it. Turn the items into TodoWrite tasks so none are skipped.

For each generated artboard / doc card / icon grid, read the nodes back (via
`figma_get_variables` and a `figma_execute` inspection of node types,
`layoutMode`, `boundVariables`, and `name`) and confirm:

1. **Container type** — the layout/grid container is a `FRAME` with `layoutMode`
   set, **never a `SECTION`**, and it sits **directly on the page** with no Section
   anywhere above it. (Read the node `type` and walk its parent chain; if any
   ancestor up to the page is a `SECTION`, that's a fail — remove it and reparent
   the Frame to the page.)
2. **Auto layout present and not axis-locked** — every component and meaningful
   container has auto layout (`layoutMode` is `HORIZONTAL`/`VERTICAL`, not `NONE`);
   no absolute positioning; text nodes **fill** width, cards **hug** height. **Read
   back `primaryAxisSizingMode`/`counterAxisSizingMode`** (or `layoutSizing*`): a
   `resize()` call silently flips the opposite axis to `FIXED`, collapsing a frame
   to ~10px — invisible in a screenshot. See the `resize()` trap in
   `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`. **Exception:** a component
   **set** laid out with deterministic grid coordinates (the large-matrix case in
   "Component set arrangement") legitimately uses `layoutMode = "NONE"`; the variants
   *inside* it must still be auto-layout.
3. **Variables bound** — every fill, stroke, text color, corner radius,
   `itemSpacing`, and padding resolves to a **bound variable** (`boundVariables`
   present), not a raw hex/px. No hardcoded values anywhere in the doc-card chrome.
   **Check container and component-set background fills specifically** — a paint bind
   that didn't stick renders the placeholder color instead (a pure-black placeholder
   reads as accidental dark mode), so read back `fills[0].boundVariables.color` on
   those container fills and re-bind any that resolve to a raw value.
4. **Names deterministic** — components match their code counterpart names; the
   `Status` chip, `Status Label`, and `Last Updated` nodes are named exactly so
   finalize write-back can find them; no `Frame 47`-style auto names on meaningful
   layers.
5. **Scope / status correct** — icons are the curated subset (not the full 1,700),
   and each doc card's status value matches `components.meta[name].status` in the
   manifest.
6. **Content not clipped** — component frames, variant rows, sets, and layout
   frames have **`clipsContent = false`** (read it back), so outer strokes, focus
   rings, and shadows aren't sliced at the edge. `clipsContent = true` is allowed
   **only** on deliberate cutoffs (scroll containers, image/avatar crop frames).
7. **Header division present** — each doc card has a division between its header and
   the component area: either a `Header Divider` rule bound to `Border/Semantic`, or
   a header container whose surface fill differs from the component area (both
   token-bound). A card with no header/component segmentation is a fail.
8. **States complete** — each component set's `state` axis includes every relevant
   state for that component (default/hover/focus/active/disabled plus the applicable
   conditional states — loading/selected/success/error), with variants (incl. each
   size) as rows and states as columns. A set shipping only `default` is a fail.
9. **Focus state matches the library idiom** — the focus state is built as
   `project.uiFramework`'s real pattern (see "State handling"), not a house-style
   stroke, and with no padded wrapper inflating the component. Shadow-based recipes: a
   filled control carries a **drop-shadow** ring (effect present; that control frame
   `clipsContent = true`), a transparent control carries an **absolutely-positioned
   ring child** (not a wrapper). `vanilla-css`: an **outside-aligned** offset stroke
   (`strokeAlign = "OUTSIDE"`; `"INSIDE"` is a fail). A wrapper frame that makes the
   component bounds larger than the visual control is a fail. **This applies to
   previously-built components too** — when you touch an existing one, a legacy padded
   wrapper, an inside-aligned stroke, or a transparent variant with no ring at all must
   be retrofitted to the current recipe (see "State handling").
10. **Visual** — the screenshot (from the validation loop) shows no overlaps,
   misalignment, lopsided hug/fill sizing, or clipped strokes/focus rings.

If any item fails, **fix and re-audit** — don't hand off a partial pass. Iterate
with the same ~3-pass budget as the visual loop. Only when all ten pass is the
build done.

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
