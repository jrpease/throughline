# Verification proof bundle + negative stop conditions — handoff

> **For the next session.** This is the last of three backlog items that came out
> of the first dogfood and early community feedback. The other two (guide voice,
> Chromatic cost guardrails) are **built and merged** (`#26`, `#27`). This one is
> **mapped but not designed** — it is real engineering, not prose, so it earns a
> proper design pass before any code. You have everything here to pick it up cold.

## Where things stand

- **Item 1 — guide voice + flow-close pattern:** MERGED (`#26`, squash `7f7a740`).
  `references/guide-voice.md` is now the source of truth for how a skill *closes* a
  flow. **Use it** — when you finish a stage of this work, close in the four-beat
  guide voice (outcome; what you set aside and why; one recommended next step; at
  most one light alternative). No grid of co-equal options.
- **Item 2 — Chromatic cost guardrails:** MERGED (`#27`, squash `4c09940`).
- **Item 3 — this doc:** not started.

The local, git-ignored `BACKLOG.md` at the repo root carries all three; item 3 is
entry #3 there.

## What item 3 is

Community feedback, paraphrased: "State machine + manifest is the right shape. Add
**negative stop conditions** — things that *fail* a stage, not just verify
structure exists. And 'run twice, get the same structure' proves idempotency, not
quality; each skill should emit a **proof bundle** (what changed, checks run,
screenshots, why it's allowed to advance) or the state machine becomes a very
organized liar."

## The honest map — what already gates vs. the real gaps

Do not rebuild what exists. Grounded in the actual code:

**Already solved / partial (respond from strength):**

- **Reference doc vs. manifest — SOLVED.** `scripts/docs-check.mjs` is a real drift
  gate. Failing classes: `canonical-changed | stale | edited | missing-record |
  missing-surface` (see the `FAILING` set, ~line 75). `edit-unverified` (Figma,
  unreadable by the CLI) is informational.
- **Token binding — PARTIAL.** `agents/figma-executor.md` (step 4, "Structural
  self-verify loop") does a programmatic read-back that asserts `COMPONENT_SET`
  (not `FRAME`), child count vs. the variant matrix, every child is a `COMPONENT`,
  `variantGroupProperties` names the axes, and spot-checks ≥2 variants that
  fills/strokes/radius resolve to **bound variables, not raw values**. This is
  component-side only.
- **The "organized liar" thesis — already rejected in code.** The read-back exists
  *because* "a screenshot alone is insufficient — 10 tone-colored frames look
  identical to 10 real variants." Structural verification (executor) is kept
  separate from the quality verdict (`agents/reviewer.md`, `approved` /
  `changes-requested`). Executors also verify their own build
  (`agents/code-executor.md`).
- **Required-state baseline — DEFINED, not gated.**
  `references/figma-component-standards.md` (~lines 127–142) prescribes the required
  interaction states per archetype (Button: default/hover/focus/active/disabled +
  loading; Input: + error/success; etc.). It drives planning, but the read-back
  only checks the component against *the spec's declared matrix* — a spec that
  omits `disabled` still passes.

**Genuine gaps — the work to build:**

1. **Orphaned tokens.** A token defined but bound by nothing — the inverse of the
   component-side check. Today "orphan" means orphan *output files* / severed
   bindings, never unbound tokens. No gate.
2. **Required-state completeness as a hard gate.** Fail a component for missing a
   baseline state, rather than trusting the spec's declared matrix.
3. **Component name identity across Figma ↔ code ↔ manifest.** Token *renames* are
   reconciled at retrofit via the crosswalk (`aligned | renamed | drift-fix`);
   ongoing component-name drift across the three surfaces is not asserted.
4. **A persisted, structured proof bundle per stage (the keystone).** The raw
   material already exists — executor verify outcomes + `DONE`/`DONE_WITH_CONCERNS`/
   `BLOCKED`, reviewer verdicts, read-back assertions — but it is **ephemeral
   prose that evaporates after the run.** Nothing persists a structured record of
   "what changed / checks run / screenshot ref / why this was allowed to advance."

**Keystone:** build the proof bundle first. Every negative stop condition above
then becomes an *entry* in the bundle, not a separate bolt-on. That is the frame
that makes the whole thing coherent instead of four scattered checks.

## Open design questions (resolve these in the design pass)

- **Where does the bundle live?** A new field under `components.meta[name]` in
  `design-system.json`? A per-stage log keyed by stage? This is a manifest schema
  change — likely `schemaVersion` 5 → 6 with a migration note (see the v4→v5 note
  in `references/manifest-schema.md`).
- **What's in one bundle entry?** Proposed: `stage`, `changed` (what), `checks`
  (name → pass/fail + evidence ref), `screenshot` (ref), `advancedBecause`
  (justification), `at` (ISO — pass it in; `Date.now()` is unavailable in some
  contexts). Keep it pointers/hashes, never content, matching the `meta[name].doc`
  discipline.
- **How is it read / gated?** A new `verify:check` script analog to `docs:check`?
  Does CI consume it? Zero-dependency, like the rest of `scripts/`.
- **How do executors and the reviewer emit into it?** They return prose today;
  they'll need a structured return or a small writer.

## How to start

1. **This is a full design-flow item, not a skip-ceremony one.** Items 1 and 2 were
   prose with settled designs; this is schema + a gate + agent changes. Run
   `superpowers:brainstorming` → design → `superpowers:writing-plans` → build.
2. Read this map, then the anchors: `scripts/docs-check.mjs`,
   `agents/figma-executor.md`, `agents/reviewer.md`, `agents/code-executor.md`,
   `references/manifest-schema.md`, `references/figma-component-standards.md`.
3. Design the proof-bundle schema first (the keystone), then fold the three
   negative conditions in as entries.

## Process realities (same rails as items 1 and 2)

- **Adapters are generated.** Source is `commands/`, `skills/`, `references/`. After
  editing source, run `node scripts/adapters/generate.mjs` to regenerate
  `adapters/**`. CI runs `node scripts/adapters/generate.mjs --check` and
  `node --test` (see `.github/workflows/ci.yml`). References ship to adapter users
  via `scripts/install.mjs` wholesale-staging the `references/` tree.
- **`main` is protected.** Branch + squash PR per item; end commit messages with the
  Co-Authored-By / Claude-Session trailers; PR bodies with the Claude Code footer.
- **Subagent dispatch reality (if the build dispatches agents):** the `agents/`
  files (`throughline:architect`, etc.) are **not registered as dispatchable
  subagent *types*** in a fresh Claude Code session — only `general-purpose`,
  `Explore`, etc. are. Emulate the ladder by dispatching `general-purpose` with the
  role contract and an explicit `model` per tier.
- **Close each stage in the guide voice** — item 1 shipped exactly so this work has
  a warm, consistent hand-back. Practice it.
