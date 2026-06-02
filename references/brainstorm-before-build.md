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
  existing system) and wants it ingested and organized into the two-tier Figma
  structure. Generate as little as possible; preserve their values and names
  where sensible, only adding structure (tiers, collections) and flagging gaps.
  Do not invent values they didn't provide unless they ask.

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
