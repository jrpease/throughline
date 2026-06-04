# Scaling up: when a step outgrows a single skill

Throughline skills are built for **bounded design-system work** — author tokens,
build a component, scaffold a repo. Sometimes a step inflates into **open-ended
engineering** with real architectural risk: retrofitting an existing app onto a
new component library (e.g. → shadcn), migrating a whole motion/interaction layer,
a multi-package refactor — anything where "build the component" has quietly become
"re-architect the system." When that happens, **do not just start building.**

The valuable behavior here is **recognizing the inflection and planning before
building** — that behavior is Throughline's, and it works whether or not any other
plugin is installed. Handing off to a planning partner (below) is an *enhancement*
of that behavior, never a requirement for it.

## Recognize the inflection

Signs the work has outgrown the skill:

- The user wants to **retrofit or migrate an existing codebase**, not start clean.
- The change touches **many files / packages / systems at once**.
- There are **real risks** to name — breaking existing behavior, a custom layer to
  preserve (e.g. bespoke cursors, magnetic buttons, a motion system), a framework
  migration, design↔code drift.
- The honest answer to "can this be done in a few well-understood steps?" is no.

## What to do at the inflection (the portable behavior)

1. **Stop and surface the shape.** Lay out the **risks** and the **major parts** of
   the work before touching code. Make the scope visible to the user.
2. **Confirm the scope.** "This is now a real project — do you want to take on all
   of it, or a slice first?" Let the user choose the bite size.
3. **Switch into structured brainstorm → plan before building.** Big, ambiguous
   work needs a plan, not improvisation.

## Where the plan comes from (degrade gracefully — no hard dependency)

- **If the Superpowers skills are available** — check the available-skills list for
  `superpowers:brainstorming` and `superpowers:writing-plans` — **hand off to
  them.** They are purpose-built for open-ended engineering: brainstorm the
  approach, then write an executable plan. Announce the handoff so the user
  understands the switch and why.
- **If Superpowers is not installed** — do **not** stall and do **not** require it.
  Run Throughline's own `brainstorm-before-build.md` protocol, scaled to the larger
  scope, and produce a written plan (goals, risks, major parts, ordered steps,
  checkpoints) before building. You may note **once** that Superpowers is a great
  optional partner for this kind of work — then proceed. Never nag, never block.

Throughline must be able to complete the work **with or without** Superpowers.
Superpowers makes the big-scope path better; it is never a prerequisite.

## The routing rule (keep both directions consistent)

This is one rule with two directions — getting one right but not the other is how
the wrong skill ends up driving:

- **Bounded design-system work** (tokens, icons, a single component, repo scaffold)
  → Throughline owns it directly. Do **not** hand a simple setup prompt off to a
  generic brainstorming skill — that is the inverse mistake (see the priority note
  in `figma-environment-setup`).
- **Open-ended engineering** (retrofits, migrations, app builds) → brainstorm and
  plan first; hand off to Superpowers if present, else plan natively.
