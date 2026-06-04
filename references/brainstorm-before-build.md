# Brainstorm before build

A shared protocol that every Figma **authoring** skill (token-builder,
token-sheet-builder, icon-system-builder, component-builder) runs *before*
generating anything in Figma. Its job is to lock the spec with the user while
changes are still free — i.e. in conversation, not in the Figma file after
tokens have been burned creating the wrong thing.

This is distinct from the checkpoint gates that come *after* generation
("here's what I built, approve it?"). Brainstorming happens *before*: "what are
we even building?" For a design-fluent, code-unsure user, this is where their
expertise drives the machine — they can't read the generation script, but they
can absolutely answer "should buttons have a loading state?"

## The protocol

1. **Don't jump to generating.** When the user asks for something ("build my
   tokens", "make a button"), resist producing Figma output immediately. First
   surface the decisions that shape it.

2. **Ask in small, readable chunks.** Present choices a few at a time, in plain
   language, with a recommended default for each so the user has something to
   react to rather than a blank page. Prefer concrete either/or framings over
   open questions. Use the question-asking UI (tappable options) when available
   — it's much easier for the user than typing.

3. **Show the proposed spec back before building.** Once decisions are made,
   restate the full spec in a short, digestible form the user can sign off on:
   "Here's what I'll create: [the spec]. Good to go?" This is the gate between
   brainstorm and generation.

4. **Only then generate.** After explicit sign-off, proceed to the skill's
   generation step (and its own post-generation checkpoints).

## Intake mode (token-builder runs this FIRST)

Before brainstorming structure, the token-builder must establish **which
starting point the user is at**, because the three modes are genuinely different
behaviors. Ask this first, route accordingly:

- **Generative** — the user gives a seed (e.g. one brand color, one font) and
  wants AI to expand it into a full system: a complete tonal ramp from the brand
  color, supporting/semantic color families (success/warning/danger derived to
  harmonize), complementary font pairings, and full spacing/type/radius scales.
  Here you generate the most; confirm the seed and the aesthetic direction, then
  propose the expanded system for sign-off.
- **Descriptive** — the user gives aesthetic direction (words like simple,
  rounded, modern, dense, comfortable) and/or a reference image/URL, but not
  exact values. Derive concrete scales and ramps from the description, mapping
  adjectives to decisions (e.g. "rounded" → larger radius scale, "dense" →
  tighter spacing base). Propose values back for sign-off.
- **Import** — the user already has a token set (a JSON file, a list, an
  existing system, or source like a marketing site + brand guide) and wants it
  ingested and organized into the per-category Figma structure. Import has **two
  distinct responsibilities — keep them separate so they don't fight each other**:
  *(1)* preserve and organize what they gave, and *(2)* run a completeness pass
  that recommends what a fuller system adds. Preserve their actual values and
  names exactly — never overwrite or silently invent values **in place**. But do
  not stop at a 1:1 transcription: a brand guide or website is almost always a
  *partial* system (a few brand colors, two fonts, ad-hoc paddings), so a faithful
  import alone produces a thin, rigid token set. The completeness pass below is
  what turns it into a flexible one.

  **Completeness pass (gap analysis — the high-value step).** After organizing,
  diff what they gave against the reference model of a full, flexible system (the
  checklist below). Then **proactively propose the missing pieces, derived from
  their existing values so they harmonize** — e.g. extend a single brand color
  into a full 50–900 tonal ramp, add a neutral/gray ramp, derive success/warning/
  danger/info families tuned to their palette, add dark-mode values, an elevation/
  shadow scale, a radius scale, and the semantic role layer (bg/surface/text/
  border roles). This is **preserve-first and opt-in**, which is how it coexists
  with "don't invent values": you are not overwriting their brand or inventing
  silently — you surface a derived, clearly-labeled upgrade menu and let them
  choose. Present it grouped by category: *"Here's what you have (kept as-is).
  Here's what a fuller system adds, and what I'd derive for each — accept all, pick
  some, or skip."* Nothing recommended is created until the user accepts. Keep it
  proportional (see "Keep it proportional" below): lead with the high-impact gaps
  (tonal ramps, neutral ramp, state colors, dark mode, semantic roles), offer the
  rest lightly.

  **What a full, flexible system includes (the reference model to diff against):**
  - **Color** — a neutral/gray ramp (~10 steps); each brand/accent as a full
    tonal ramp (50–900), not just its base; state families (success, warning,
    danger, info) as ramps; a semantic role layer (bg/surface layers, text
    hierarchy: primary/secondary/muted/disabled, border/divider, interactive
    states: hover/active/focus/selected/disabled); **dark mode** values.
  - **Typography** — a full size ramp with line-heights, weights, and
    letter-spacing; semantic roles (display, heading h1–h6, body, label, caption,
    code); responsive (Desktop/Mobile) sizing where relevant.
  - **Spacing** — a consistent base-unit scale (replacing ad-hoc one-off
    paddings), spanning tight insets up to large layout steps.
  - **Radius / border-width / elevation(shadow)** — each a real scale
    (none→full, hairline→thick, sm→xl) rather than one hardcoded value;
    elevation should be dark-mode-aware.
  - **Often-absent optional layers** — opacity scale, z-index/layer tokens,
    motion (duration + easing). Mention these exist; don't force them.
  - **Modes** — note which axes are missing (dark mode, density, brand) since
    a partial import usually has none.

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

Many users are a blend (e.g. "here's my 2 brand colors and a font, fill in the
rest" is generative with seeds). Identify the dominant mode, confirm it, and
proceed. The rest of the token brainstorm (below) then runs within that mode.

## What each skill brainstorms

- **token-builder** — after intake mode, the structure of the scales: which
  color ramps and how many steps, the spacing scale, the type scale,
  radius/border/shadow scales, and which modes exist (light/dark, brand
  variants, density). Critically, the primitive naming convention, since the
  semantic tier aliases onto it. Also: whether a third (component) tier is
  warranted — default two-tier; only raise three-tier if the user signals
  multi-brand, white-labeling, or a very large component library.
- **token-sheet-builder** — layout and grouping of the visual stylesheets; which
  collections get their own artboard; how much per-token detail to show.
- **icon-system-builder** — which icon library (lucide / material / custom),
  which subset of icons, the naming convention, and sizing/grid conventions.
- **component-builder** — the variant matrix for each component: types, sizes,
  states (hover/focus/disabled/loading), icon slots, and which tokens each
  variant binds to.

## Keep it proportional

Brainstorming should be thorough for high-impact, hard-to-undo decisions (the
primitive naming convention, the mode structure) and light for low-stakes ones.
Don't interrogate the user about trivia — the goal is to prevent expensive
regeneration, not to slow them down. If a decision is cheap to change later, note
the default and move on.
