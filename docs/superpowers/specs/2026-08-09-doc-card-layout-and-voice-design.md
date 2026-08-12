# Doc-card layout system & documentation voice — design

**Date:** 2026-08-09
**Status:** Approved (design), pending implementation plan
**Scope:** The **Figma component doc card** (the documentation that lives on
component artboards) and the **writing standard** for all doc-record content.
Builds directly on the Component Documentation Layer
(`2026-07-14-component-documentation-layer-design.md`); the record schema, the
four-source authoring pipeline, provenance, and the projection model are
unchanged. The Foundations/token sheet and the icon card are out of scope.

## Problem

The v0.14.0 documentation layer works — records are authored, projected, and
drift-checked — but the first real output surfaced two defects.

**1. The doc card has no layout system.** The card chrome (frame, header, status
chip, divider, token binding, audit gates) is specified in detail, but the
documentation *body* gets one sentence of instruction
(`skills/component-builder/SKILL.md:276`): "extend the existing doc card … with a
usage body." An agent improvises the rest from scratch, differently every time.
Worse, the existing card rules mandate that text nodes **fill the card width**
(`references/figma-component-standards.md:407-408`) while the card is as wide as
the variant matrix inside it — so a Button with 6 variants × 5 states produces a
very wide card whose paragraphs stretch into unreadable single lines. On wide
artboards the documentation looks broken; on all artboards it is plain text with
none of the structure a published design system's documentation page has.

**2. The copy is written for the machine that made it.** From the real dogfooded
record (`throughline-sample/design-system/docs/components/Button.doc.json`):

> "…It comes in six emphasis variants across three sizes, supports optional
> leading and trailing icons and a loading state, and **binds every color,
> spacing, radius, and type value to the system's semantic tokens**."

Five recurring habits: inventory instead of guidance ("six emphasis variants
across three sizes" — the specimen above already shows this); build-compliance
assertions in user-facing prose (the token-binding clause); `whenToUse[0]`
restating `summary` nearly verbatim; variant/state meanings written as verb-less
spec fragments; and framework trivia in accessibility notes ("Renders a native
`<button>`, so `role="button"` is implicit"). The archetype seeds read well —
the drift happens in the AI-inferred blocks, where no writing standard holds the
line.

Both defects share a root cause: **the layout and the voice are produced by
prose instruction and model judgment**, the same mechanism whose drift the rest
of the plugin exists to prevent.

## Goals

1. A **designer-complete** doc card: everything a designer needs without leaving
   Figma (what it is, when to use/not use, do's & don'ts, variant + state
   meanings, accessibility). Engineering depth (props, tokens, code) stays in
   Storybook.
2. A **closed, deterministic layout system** whose line lengths stay readable at
   any specimen width — the wider the variant matrix, the more columns, never
   longer lines.
3. Layout produced by a **canonical builder function**, not per-run
   improvisation: every card identical by construction, verified from a
   structured return value rather than a screenshot.
4. A **writing standard** that reads like published design-system documentation
   (Polaris/Carbon register), with a narrow mechanical lint for the observed
   failure modes.
5. **One set of strings** for humans and AI. Machine-legibility comes from the
   record's structure (named blocks, arrays, stable keys), which already exists;
   the jargon was never helping.
6. **Safe migration**: rebuild on next touch, no unprompted Figma writes, no
   standing warning wall for untouched cards.

## Non-goals

- The Foundations/token-sheet page and the icon card (this spec is scoped to
  component artboards).
- The deferred `anatomy`, `content`, and `examples` blocks — the card reads as
  finished without them.
- Tokenizing the column unit (it is a layout measure, not a design value).
- Gating CI on the copy lint (warnings only).
- Balanced column heights / masonry packing — **explicitly rejected**, even if
  requested later: every increment of layout intelligence moves decisions out of
  the testable planner and back into judgment, and judgment is what produced the
  current cards. The design's value is that it is boring and closed.

## The layout system

Three stacked bands, top to bottom:

1. **Header** — name, `summary` as a lede, status chip, last-updated. Unchanged
   from today's card except the lede is clamped to one column unit.
2. **Specimen** — the ComponentSet under a "Variants & states" eyebrow label.
   Structurally unchanged. **Amendment (post-dogfood):** the specimen contract
   the builder measures against is the card's `COMPONENT_SET` node — not a
   band named "Specimen". No real card has ever used a named-band lookup, so
   that path never executed; it has been removed rather than left as dead code.
3. **Usage** — new. The documentation body, built from the rules below.

### The column unit

One fixed width per card, **computed** from the resolved body text style so a
line of body text lands near a 60-character measure:

```
columnUnit = clamp(round(bodyFontSize × 30), 280, 480)   // px
```

(30 ≈ 60ch × ~0.5em average glyph width for UI text faces.) Every usage block is
exactly one unit wide; **text fills its block, not the card**. This is the
literal fix for the wrapping defect. The computation is deterministic — same
record, same body style, same width — and lives in the planner where its output
is unit-tested.

**The body text style is the user's `Body/Default` text style** —
token-builder's naming convention (`skills/token-builder/SKILL.md:323`). The
prose blocks bind this same style, so the existing bind-or-throw policy already
guarantees it exists by render time; the unit derivation reads `fontSize` from
it.

The column unit is **layout chrome, not a design value**: it is the one
documented exception to the no-hardcoded-px audit rule. Everything else in the
usage band — padding, gaps (`itemSpacing`), radius, colors, dividers — stays
token-bound exactly as the existing audit requires
(`references/figma-component-standards.md:486-492`).

### Card width

```
cardWidth = max(specimenWidth, 3 × columnUnit)  rounded UP to a whole unit
```

A wider matrix buys more columns rather than longer lines; a narrow specimen
(Badge) still gets a minimum three-column card; and cards across the page share
one modular rhythm instead of being raggedly sized. `specimenWidth` is measured
in Figma at run time and passed to the planner as an input.

**Amendment (post-dogfood): columns are also capped by content.** The formula
above under-specified `columns` — deriving it from specimen width alone let a
wide specimen with sparse Usage content mint dead columns (Input's real card:
5 columns of mostly-empty grid). The full clamp, computed after rows are built:

```
columns = clamp(maxBlocksPerRow, 3, ceil(specimenWidth / columnUnit))
cardWidth = columns × columnUnit
```

where `maxBlocksPerRow` is the largest number of blocks in any of the card's
(non-empty) rows. The grid never exceeds what the content can fill, and never
drops below the 3-unit floor. This changes rendered layout, so
`DOC_CARD_RENDERER_VERSION` bumps to `"3"` (see *Renderer version stamp*).

The planner's `cardWidth` is the **content-grid** width. At render time the
builder derives the `Usage` frame's outer width as
`cardWidth + 2·padding + (columns − 1)·blockGap`, reading the resolved px of
the bound spacing tokens via `resolveForConsumer`, and widens the card
(its own padding included) when it is fixed-width and narrower. Without this,
padding and gutters eat the content box and the last column always wraps. The
card itself must be a VERTICAL auto-layout frame — the builder throws otherwise.

**Amendment (post-dogfood): the `Usage` frame sets `clipsContent = false`.**
Figma defaults every new frame to `clipsContent = true`; a layout frame with
clipping on silently crops content that grows past its planned bounds. Audit
item 6 in `references/figma-component-standards.md` already requires this for
layout frames — the builder now asserts it explicitly rather than relying on
the ambient default staying safe.

### Four block types — a closed set

| Type | Renders | Used for |
|---|---|---|
| `prose` | eyebrow + paragraph | Overview (`description`) |
| `list` | eyebrow + bulleted list | `whenToUse`, `whenNotToUse`, `accessibility` |
| `list·tone` | tone-colored eyebrow (✓ green / ✕ red) + list | `dos` / `donts` |
| `definition` | eyebrow + term/meaning pairs | `variants` axes, `states` |

Closed is the point: a closed set is what makes a deterministic builder
possible. Definition blocks use a fixed term column at **30% of the column
unit**; long terms **wrap, never truncate**. **One definition block per variant
axis** — "What each variant means", "What each size means", etc. — plus one
"What each state means" block, so multi-axis components (Button's `variant` +
`size`) have a defined home for every axis.

### Three rows, wrapping independently

Each row is its own `layoutWrap: "WRAP"` auto-layout frame, filling the card
width:

1. **Overview · When to use · When not to use**
2. **Do · Don't** (same row, so a wrap boundary can never separate them)
3. **Definition blocks (one per axis, then states) · Accessibility**

Absent blocks are skipped; empty rows collapse entirely. Rows are top-aligned
and left-packed (`counterAxisAlignItems = "MIN"`,
`primaryAxisAlignItems = "MIN"` — blocks never center or space-between); ragged
bottoms are accepted (see *Risks*). A 1px rule bound to `Border/Semantic`
separates rows.

## The deterministic builder

**`renderDocCard({ card, record, vars, bodyTextStyle })`** — one canonical
function, run verbatim inside `figma_execute`. The generated snippet inlines
**both** `planDocCard` and the renderer; `renderDocCard` measures
`specimenWidth` itself from the card's `COMPONENT_SET` node (the specimen
contract — see the amendment under *Specimen*, above), calls the
inlined `planDocCard(record, specimenWidth, bodyTextStyle) → plan` (the plan
contains `columnUnit`), then renders the plan. **`columnUnit` is never a caller
input.** Six contractual behaviors:

1. **Idempotent, and scoped.** Finds the frame named `Usage` inside the card,
   removes it, rebuilds it. **Header and specimen are never touched.** This
   scoping is what keeps re-rendering safe to run repeatedly: deleting and
   recreating a component set detaches every downstream instance
   (`skills/component-builder/SKILL.md:347-351`), so the rebuild never crosses
   into the specimen band.
2. **One component per card (amendment, post-dogfood).** Before the specimen
   lookup and the idempotency guard run, the builder checks for a foreign
   band — any direct child whose name starts with `Usage` but isn't exactly
   `Usage` (deliberately broad: any unexpected Usage-prefixed band fails
   loudly, not just the "Usage — Component Name" shape). A band like
   "Usage — Select Menu Item" means the card documents more than one
   component; rendering here would append a band the builder doesn't own and
   silently accumulate. The builder throws instead, naming the offending band,
   and asks for the card to be split so each component owns its own card.
3. **Fonts loaded up front.** Every font style is `loadFontAsync`'d before the
   first text node exists, and callers pass an explicit `timeout` — the default
   ~5s budget is already documented as too short for multi-card font-loading
   writes (`references/figma-component-standards.md:349-350`).
4. **Binds or throws — with one chrome carve-out.** The caller resolves variable
   IDs via `figma_get_variables` and passes them as `vars`; the builder uses
   `setBoundVariable` throughout. **Colors and semantic content type styles
   (body text, definition terms) bind-or-throw**: a missing variable or style
   throws rather than falling back to a hex — a card that can't be built from
   tokens is surfacing a real gap in the token set. **Card-chrome type (the
   eyebrow labels) is derived, not bound**: the user's system has no reason to
   contain a tiny-uppercase-label style, so the builder derives one from
   `Body/Default` — `fontSize × 0.65` rounded (minimum 8), weight Bold,
   uppercase, letter-spacing +8%. These constants live in the renderer template
   and are locked by the `--check` like everything else generated. Chrome
   derivation is documented alongside the column-unit exception. The `Usage`
   frame itself sets `clipsContent = false` (amendment, post-dogfood — see the
   *Card width* section, above).
5. **Deterministic node names**: `Usage`, `Usage Row 1..3`, `Block: Overview`,
   `Block: Do`, `Block: Don't`, `Doc Fingerprint`, etc. — same discipline as the
   existing `Status` / `Status Label` / `Last Updated` contract.
6. **Returns a structured summary**: blocks created, rows rendered, computed
   card width, the canonical fingerprint, and the **rendered-content hash**. The
   executor verifies against this return value instead of squinting at a
   screenshot, and **the skill stamps the manifest from the return value** —
   `surfaces.docCard.{src, render, renderer}` — never by re-reading the card.

### Planner / renderer split (how it gets tested)

The renderer needs the Figma plugin API and cannot run in Node, so the logic
splits:

- **`scripts/lib/doc-card-plan.mjs`** — pure function
  `(record, specimenWidth, bodyTextStyle) → plan`: which blocks exist, which row
  each lands in, per-axis definition blocks, computed column unit and card
  width, what is skipped for a sparse record. Unit-tested in
  `doc-card-plan.test.mjs` like every other `scripts/lib` module.
- A **thin Figma renderer** walks the plan and makes the API calls.
- **`scripts/build-doc-card-builder.mjs`** stitches the planner source and the
  renderer template into the generated reference
  **`references/doc-card-builder.md`** — the snippet skills hand to
  `figma_execute`. A `--check` mode is wired into CI next to the existing
  adapter check (`.github/workflows/ci.yml:23`, `release.yml:41`;
  same idiom as `scripts/adapters/generate.mjs --check`). The generated file is
  never hand-edited.

The rejected alternative — hand-maintaining the snippet with no tests — would
leave the only deterministic thing in this design unverified, in a repo whose
whole thesis is drift detection.

## Renderer version stamp

Content fingerprints cannot drive layout migration: a card built with the old
layout from an unchanged record has a matching fingerprint and would look clean
forever. So:

- The builder stamps **`renderer: "3"`** into the manifest's
  `surfaces.docCard` entry (additive optional field; documented in
  `references/component-doc-schema.md`; no schemaVersion bump — absence simply
  means "built before the current version").
- The current version has **one source of truth**: an exported constant
  `DOC_CARD_RENDERER_VERSION` in `scripts/lib/doc-card-plan.mjs`.
  `docs-check.mjs` imports it; the build script embeds it into the generated
  builder snippet. One source, three consumers.
- `scripts/docs-check.mjs` reports a missing or lower `renderer` as a
  **separate, informational** classification — **`layout-upgrade-available`** —
  never mixed into the failing drift set (`canonical-changed` / `stale` /
  `edited` / `missing-record` / `missing-surface`, `scripts/docs-check.mjs:75`).
  Untouched brownfield cards do not generate a standing warning wall; warning
  fatigue is how real drift gets ignored. Migration still happens on next touch.

**Amendment (post-dogfood): version bumped `"2"` → `"3"`.** The column-count
formula changed (see the amendment under *Card width*, above) — this alters
rendered layout for existing cards, so cards stamped `renderer: "2"` correctly
re-flag `layout-upgrade-available` and pick up the new column math on next
touch.

## The writing standard

New reference: **`references/doc-writing-standard.md`**, applied by the
authoring pipeline in `component-builder` and `/document-component`.

**Governing rule: describe the thing and how to use it, never how it was
made.**

**Register:** plain reference — neutral and declarative for descriptions,
imperative for guidance; the register Polaris and Carbon use. This is *not* the
conversational guide voice of `references/guide-voice.md`, which remains the
register for skill conversation, not doc content.

Per-block rules, with before/after from the real
`throughline-sample/design-system/docs/components/Button.doc.json`:

- **`description`** — 2–3 sentences: what it is, what it's for, and the one
  thing that most changes how you use it. Never variant/size counts (the
  specimen and legend already show them), never token binding, never a slot
  inventory.
  > **Before:** "A clickable control that triggers an action — submitting a
  > form, confirming a decision, or opening a dialog. It comes in six emphasis
  > variants across three sizes, supports optional leading and trailing icons
  > and a loading state, and binds every color, spacing, radius, and type value
  > to the system's semantic tokens."
  > **After:** "A clickable control that starts an action: saving a form,
  > confirming a choice, opening a dialog. Its six emphasis levels signal how
  > important an action is."
- **`whenToUse` / `whenNotToUse`** — situations, never an echo of `summary`;
  `whenNotToUse` always names the alternative.
  > **Before:** summary "Triggers an action or event." → whenToUse[0] "Trigger
  > an action or event — submit, confirm, open a dialog"
  > **After:** "Something happens on the current page — save, confirm, open a
  > dialog"
- **`variants` / `states`** — lead with meaning; visual treatment is optional
  and never the whole entry.
  > **Before:** "Highest-emphasis, solid brand fill — the one primary action in
  > a view." → **After:** "The one main action in a view."
  > **Before:** "Non-interactive and not focusable; reduced opacity." →
  > **After:** "Can't be clicked or tabbed to."
- **`dos` / `donts`** — imperative, one action per entry, ≤ 14 words, full
  stop. Don'ts open with *Don't / Never / Avoid* and name the alternative.
  > **Before:** "Don't use a button for navigation — use a Link" →
  > **After:** "Don't use a button to navigate. Use a Link."
- **`accessibility.notes`** — what the reader must do, not what the framework
  emits.
  > **Cut:** "Renders a native `<button>`, so `role=\"button\"` is implicit."
  > **Before:** "An icon-only button needs an aria-label" → **After:** "An
  > icon-only button needs an `aria-label` so screen readers can announce it."

**The vocabulary line, precisely:** technical terms that are the real names of
things stay — `aria-label`, `role`, `Enter`, `Space` are what a reader would
search for. What is banned from user-facing prose is the system's own machinery
vocabulary: tokens, variables, bindings, fingerprints, provenance, projections,
surfaces (in the machinery sense). `tokensUsed` keeps its token names — it is a
structured field, machine-useful, and never rendered as prose.

**Global rules:** write full sentences (no em-dash label-fragments bolting a
clause onto a fragment); **one set of strings** for humans and AI — no dual
copy; the digest (`llms.txt` / `index.json`) inherits the same text.

`references/component-doc-archetypes.md` gets a light compliance pass so the
seeds follow the standard — most already do; the accessibility entries carry the
most jargon.

## The lint — `scripts/docs-lint.mjs`

Zero-dependency, **warnings only, always exits 0**, takes a `.doc.json` file
path. Checks only what is mechanically reliable:

| Check | Rule |
|---|---|
| Machinery vocabulary | banned-word list in user-facing strings (all prose fields; `tokensUsed`, `name`, `status`, `provenance` exempt) |
| Summary echo | flag when > 60% of the **summary's** content words (stopwords removed, naive plural/verb-s stemming) appear in `whenToUse[0]`. On the worked example this yields 100% — *triggers*, *action*, *event* all appear in "Trigger an action or event — submit, confirm, open a dialog" |
| Run-on sentence | any sentence > 35 words |
| Summary length | `summary` > 12 words |
| Description length | `description` outside 15–70 words |
| Guidance length | any `dos` / `donts` entry > 14 words |
| Don't shape | a `donts` entry not opening with *Don't / Never / Avoid* |
| Terminal stop | a `dos` / `donts` entry not ending with a full stop (catches "Don't use a button for navigation — use a Link") |
| Treatment lead | any of {fill, filled, solid, stroke, border, bordered, outline, shadow, opacity, elevation} in the first 4 words of a variant/state meaning (catches "Highest-emphasis, solid brand fill — …") |
| Empty meanings | a variant or state meaning under 3 words |

Deliberately **not** linted: verb-presence. It is not reliably detectable in
plain JS without an NLP dependency, and a rule that fires wrongly is worse than
no rule — it stays a prose rule, caught by the authoring pipeline and the user
approval step.

**Output contract:** always exits 0; prints one warning per line as
`<file>: <block-path>: <rule>: <message>`; a `--json` flag emits
`{warnings: [{path, rule, message}]}` for programmatic use. This is a
deliberate departure from `docs-check.mjs`'s exit-code contract — lint warnings
are advisory by design.

**Sequencing:** draft record → write the file to disk → `docs-lint <file>` →
the agent fixes warnings → show the user the draft. The lint shapes the output
before approval rather than nagging afterward. Also exposed standalone as the
`docs:lint` npm script, wired into the user's repo the same way `docs:check`
and `docs:digest` are (`scripts/README.md`).

## Migration

**Rebuild on next touch only.** New cards use the new layout and voice
immediately; an existing card is rebuilt whenever its component is next
documented or rebuilt. No unprompted writes to anyone's Figma file; a file may
hold mixed old and new cards for a while, and `docs:check` reports the old ones
as `layout-upgrade-available` (informational), not as drift.

`imported` / `user` provenance blocks are **never rewritten** — that is the
record model working correctly, which means a voice sweep genuinely cannot fix
hand-written copy that reads badly. The lint warns on those blocks; the proposed
rewrite is carried into the record-approval gate, shown as before/after and
labelled with provenance — one approval covers the whole record, never a silent
overwrite.

**Amendment (post-dogfood): a freshness gate in `/document-component`.**
`storybook-chromatic-builder` copies the doc scripts (`build-docs-digest.mjs`,
`docs-check.mjs`, `lib/doc-record.mjs`, `lib/doc-card-plan.mjs`) into a repo
**once**, at setup — nothing refreshed them afterward, so a repo whose copy
predates a plugin update ran `docs:check` against stale rules and reported a
meaningless "no drift" (this cost a real dogfooder real time). Before trusting
`docs:check`, `/document-component`'s drift-reconcile step now compares the
repo's `DOC_CARD_RENDERER_VERSION` against the plugin's; if the repo file is
missing or behind, it says so and offers to refresh the copied scripts from
the plugin before re-running the check. The one-time copy in
`storybook-chromatic-builder` remains setup, not a forever-fork — freshness is
enforced downstream, on every documentation pass.

## Files

**New**

| File | What |
|---|---|
| `references/doc-writing-standard.md` | the copy rules |
| `references/doc-card-builder.md` | **generated** — the inlined `renderDocCard` snippet |
| `scripts/lib/doc-card-plan.mjs` + `.test.mjs` | the pure layout planner |
| `scripts/build-doc-card-builder.mjs` + `.test.mjs` | generator with `--check` |
| `scripts/docs-lint.mjs` + `.test.mjs` | the copy lint |

**Changed**

- `references/figma-component-standards.md` — the doc-card body section becomes
  the three-band architecture and points at the builder; the *layout* audit
  items collapse to "the builder ran and returned the expected summary"; the
  token-binding read-back (audit item 3) stays intact.
- `skills/component-builder/SKILL.md` — the *Doc card body* bullet (line 276)
  points at the builder; the authoring pipeline references the writing standard
  and runs the lint before showing the user the draft.
- `commands/document-component.md` — the same two changes.
- `references/component-doc-archetypes.md` — light copy pass.
- `references/component-doc-schema.md` — document the `renderer` field on the
  `docCard` surface entry.
- `references/manifest-schema.md` — the `meta[name].doc.surfaces` shape
  (`references/manifest-schema.md:253-256`) gains the additive `renderer`
  field.
- `scripts/docs-check.mjs` + `.test.mjs` — the `layout-upgrade-available`
  classification.
- `scripts/README.md` — rows for the new scripts.
- `.github/workflows/ci.yml` + `release.yml` — builder `--check` alongside the
  adapter check.
- `adapters/` — regenerated via `scripts/adapters/generate.mjs`, never
  hand-edited.

**Free wins:** Storybook MDX, the Figma component `description` field, and the
AI digest are all projections of the record, so the voice rewrite reaches them
with no additional work. Only the Figma card needs layout work.

## Phasing

Implementation lands as **two plans**:

1. **Layout** — planner + builder + renderer stamp + the `docs:check`
   classification. Highest risk; gates the dogfood.
2. **Voice** — writing standard + archetype pass + lint + authoring-pipeline
   wiring.

They share only the additive `renderer` manifest field and are independently
shippable.

## Risks

1. **Ragged row bottoms.** Blocks hug their own content, so a long Overview
   beside a two-item list leaves uneven bottoms. Rows top-align and it stops
   there — equalizing heights is where the design would start getting fussy for
   little gain.
2. **Long lists inflate a block.** Ten do's make a tall column. Not solved
   structurally; the writing standard caps entry length and the lint surfaces
   bloat.
3. **Bad hand-written copy survives** (see *Migration*) — by design; lint
   warns, proposed rewrite is carried into the approval gate with provenance
   labeling.
4. **The dogfood is the acceptance test** (below); until it runs, the builder's
   Figma-side behavior is validated only by the planner's unit tests.

## Success criteria

1. Building or re-documenting a component produces a card in the three-band
   layout with every usage block one column unit wide, at any specimen width.
2. The planner's unit tests lock block selection, row assignment, per-axis
   definition blocks, column-unit computation, and card-width rounding;
   `build-doc-card-builder.mjs --check` passes in CI.
3. Re-rendering rebuilds only the `Usage` frame; header and specimen node IDs
   are unchanged.
4. `docs-lint` flags the mechanically detectable subset of this spec's
   before-examples (vocabulary, echo, terminal-stop, treatment-lead, and length
   rules) and none of the after-examples. The framework-trivia and
   jargon-phrasing examples (the implicit `role="button"` note,
   "Non-interactive and not focusable") are prose-standard catches, verified at
   the user-approval gate — the same reasoning as the verb-presence exemption.
5. `docs:check` reports an old-layout card as `layout-upgrade-available`
   without failing, and a re-rendered card stamps `renderer: "3"`.
6. **Dogfood on `throughline-sample`:** re-documenting Button, Input, and Card
   rebuilds their cards in the new layout and voice, the renderer stamp flips
   to `"2"`, `docs:check` goes quiet, and the specimen's downstream instances
   stay attached.
