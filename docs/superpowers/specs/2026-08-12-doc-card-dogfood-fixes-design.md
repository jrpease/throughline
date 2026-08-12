# Doc-card dogfood fixes — design

**Date:** 2026-08-12
**Status:** Approved (design), pending implementation plan
**Scope:** The seven plugin-side defects found by the combined v3-layout + voice
dogfood against `throughline-sample` (records re-authored and three cards
re-rendered; repo-side work landed as throughline-sample#19). Builds on
`2026-08-09-doc-card-layout-and-voice-design.md`; the record schema, the
four-source authoring pipeline, and the projection model are unchanged. No new
features — this is a defect batch.

## Problem

The doc-card redesign shipped in two phases (plugin PR #30 layout, PR #31 voice)
and both work: the builder renders correctly, the freshness gate fires, and the
writing standard took three records from 35 lint warnings to 0. The dogfood that
proved that also surfaced eight findings. One is a non-issue on inspection,
leaving seven real defects plus a false claim in the documentation.

They are not seven unrelated bugs. Three of them trace to a single sentence in
the builder's contract:

> "The snippet rebuilds ONLY the frame named `Usage`; the header and specimen
> bands are never touched."

That sentence is false about the specimen and misleading about the header, and
its second clause is the reason the header rots unobserved.

**The specimen.** `planDocCard` reads `specimen.width` to derive the column
count. The render then widens the `Usage` band, the card's auto-layout hug
follows it, and `FILL` siblings — the header and the `COMPONENT_SET` — follow
the card. Measured on Button: the specimen went 1536 → 2040 across one render.
The builder feeds its own next invocation a mutated measurement. It converges
today only because the content cap (`maxBlocksPerRow`) happens to sit below the
specimen cap in every observed case; a record with five or more blocks in a row
would ratchet wider on every run.

The report's suggested fix — cache `specimen.width` before any resize — is a
no-op. `doc-card-render.figma.js:82` already reads it before the frame is
created (`:127`) and before `card.resize` (`:145-149`). The loop is
*cross-invocation*, through state persisted in the Figma file. Nor can it be
fixed by changing when the resize happens: Input's card **shrank** (2656 →
2122), which `card.resize` cannot do, so the propagation path is auto-layout
hug, not that call. The only exit is to change what the planner measures.

**The header.** Nothing owns it. The builder rebuilds only the `Usage` band, and
the status write-back in `figma-component-standards.md:340` fires only on a
status change — so a component already at `stable` that gets re-voiced keeps its
original blurb forever. After a fully successful re-voice, Button's card still
led with "shadcn variants x sizes x states (90). Bound to semantic color tokens,
radius/md, spacing, and text styles." — exactly the machinery voice the voice
layer exists to eliminate — above the corrected copy, dated July 14 while the
record said 2026-08-11. `docs:check` stayed green and honest by its own
contract, because the header is not a tracked surface.

The remaining defects are independent: an install path that copies files without
registering them, a projection specified as prose that produces dual copy,
inline-code markup rendering literally on the card, a worked example that
violates its own rule, and two provenance values with no stated regeneration
policy.

## Goals

1. Break the specimen feedback loop with a measurement that cannot be mutated by
   the render.
2. Give the header an owner, so a re-voice reaches every band of the card.
3. Make the builder's stated contract true, everywhere it is stated.
4. Close the install path so a script that exists on disk also exists as an
   entry point.
5. Replace prose-specified projections with explicit templates where two agents
   could reasonably compose differently.

## Non-goals

- **No new manifest surfaces.** See "Rejected: the `docCardHeader` surface".
- **No new shared helpers.** See "Rejected: two helper modules".
- **No cross-component batch mode** for re-voicing. `/document-component` is
  single-component by construction; the fix is to stop asking twice per
  component, not to ask once per run.
- **No re-render of the 11 remaining cards.** That is repo-side work, gated on
  this batch landing.

## Design

### The contract

The builder's contract sentence becomes:

> The builder owns the `Usage` band and the header's record-derived content. It
> reads the specimen and never writes it.

This sentence lives in **four** places and one of them is generated:

| Location | Action |
|---|---|
| `scripts/build-doc-card-builder.mjs:25-26` | **The edit site.** Prose is authored here. |
| `references/doc-card-builder.md:10-11` | Generated. Regenerate; never hand-edit. |
| `references/figma-component-standards.md:296-297` | Second copy of the same claim. Edit directly. |
| `scripts/lib/doc-card-render.figma.js:89` | Specimen-specific. Stays true; no change. |

`node scripts/build-doc-card-builder.mjs --check` gates `.github/workflows/ci.yml:25`
and `release.yml:43`, so the regenerated markdown must land in the same commit as
any planner or renderer change.

### 1. Specimen measurement — `doc-card-render.figma.js`, `doc-card-plan.mjs`

Replace `specimen.width` with a measurement the render cannot move: the bounding
box of the component set's children.

```js
const kids = specimen.children;
const intrinsic = Math.max(...kids.map((c) => c.x + c.width))
                - Math.min(...kids.map((c) => c.x));
const plan = planDocCard(record, intrinsic, { fontSize: bodyTextStyle.fontSize });
```

`cardColumns(specimenWidth, unit, maxBlocksPerRow)` keeps its signature and its
existing tests.

**This is conditional on reconnaissance.** `figma-component-standards.md`
defines two construction regimes, and the fix is only verified sound for one:

- **Large matrices** — `layoutMode = "NONE"`, variants at explicit grid
  coordinates. Children cannot move when the frame resizes, so the bounding box
  is genuinely stable. Button (108 variants) is this case.
- **Small sets** — built as auto-layout, "a vertical outer auto layout of
  horizontal rows". If those rows are `layoutSizingHorizontal: FILL`, the
  bounding box tracks the parent and **the feedback loop survives the fix.**
  Card (2 variants) is this case.

The reconnaissance pass (below) reads `layoutMode` and per-child
`layoutSizingHorizontal` for all 14 sets. **Decision rule:** if intrinsic width
is stable in both regimes, implement as above. If it is not stable for small
sets, the planner drops the specimen term entirely and goes content-only —
`columns = max(3, maxBlocksPerRow)` — for every component. One measurement path,
never two. Content-only is verified to change nothing for Button (4), Input (3),
or Card (3); it differs only for a narrow-specimen component with 4+ blocks in a
row, which would then get a band wider than its own matrix.

### 2. Header ownership — `doc-card-render.figma.js`, `doc-card-plan.mjs`

The builder writes two header fields on every render:

- `Header Description` ← `record.summary`
- `Last Updated` ← `record.updatedAt`

It does **not** touch the status chip (the finalize write-back owns it), the
component name (deterministic, cannot drift), or the `COMPONENT_SET`.

`figma-component-standards.md:297-299` already specifies that the header's
short-description node is clamped to one column unit wide using
`summary.columnUnit` from the builder's return. **That clamp must survive the
write**, or wide-matrix cards regress.

The plan object gains a `header: { summary, updatedAt }` key so that
`renderHash = fnv1a(JSON.stringify(plan))` describes the header text actually
rendered, not just the `Usage` band.

**Node identification and self-migration.** The header's description node has no
deterministic name. `figma-component-standards.md:304` lists "Short description"
in a bulleted list where `Status Label` and `Last Updated` *are* explicitly
named, with the stated rationale that the write-back must find them. So the
builder must locate the node positionally on first touch, rename it to
`Header Description`, then write — making every subsequent run deterministic.
The positional rule is defined by the reconnaissance pass, and the builder
**throws rather than guesses** when the header band does not match the
established shape, consistent with its existing bind-or-throw discipline.

Drift remains detectable through the existing `docCard` surface: a record change
that is not re-rendered makes `docCard.src` differ from the canonical
fingerprint, which flags `stale` (a failing class) and exits 1. Re-rendering then
corrects both bands in one call.

### 3. Install path — `scripts/README.md`, two referencing docs

`scripts/README.md` already carries a per-script table with an "Installed as"
column stating exactly the facts that need pinning. Extend it rather than adding
a second source of truth:

- Add rows for `lib/doc-record.mjs` and `lib/doc-card-render.figma.js`.
- Fix `scripts/install.mjs` so the README's existing claim becomes true. It says
  `build-doc-card-builder.mjs` is "plugin-internal (not installed)", but the
  filter skips only `adapters/`, `*.test.mjs`, and `install.mjs`, so the file
  ships anyway. Extend the filter to exclude `build-doc-card-builder.mjs` and
  `lib/doc-card-render.figma.js` — the latter is read only by the former, and
  nothing in a consuming repo runs either.
- Record the npm-script registration (`docs:digest`, `docs:check`, `docs:lint`)
  in the same table.

`skills/storybook-chromatic-builder/SKILL.md:35-42` and
`commands/document-component.md:29-38` both point at that table instead of
restating the list. This is the actual fix: the registration existed in the
setup skill and not in the refresh instruction because the same fact was written
down twice, and only one copy was maintained.

### 4. Figma description template — `skills/component-builder/SKILL.md:280-284`

Replace "a compact markdown rendering" with an explicit, reproducible template:

```
<summary>

**When to use**
- <whenToUse[n]>

**When not to use**
- <whenNotToUse[n]>

**Do**
- <dos[n]>

**Don't**
- <donts[n], leading "Don't "/"Never "/"Avoid " stripped, first letter re-capitalized>

**Accessibility**
- <accessibility.keyboard[n]>
- <accessibility.notes[n]>

<!-- tl:doc <fp> -->
```

Blocks whose source array is empty are omitted entirely, along with their label.
Sections are separated by one blank line; the fingerprint marker is always last.
The stripping rule under "Don't" is what stops the output reading `Don't — Don't
use a button to navigate.`

Every sentence is composed from record strings verbatim — no re-wording, no
added connectives. The v2 pass composed novel prose: "Six emphasis variants
(default / secondary / destructive / outline / ghost / link) × three sizes"
appears in no record, and that is dual copy on the exact surface Dev Mode and
Code Connect read.

### 5. Inline code — `references/doc-writing-standard.md`, `scripts/docs-lint.mjs`

Ban inline-code markup in record prose, correct the worked example at
`doc-writing-standard.md:79`, and add a warnings-only `no-inline-code` rule to
the `docs-lint.mjs` rules table.

Backticks render three ways from one record string: MDX styles them, Figma's
plain-text `description` silently strips them, and the doc card shows the
literal character to the reader. The record is the wrong place to carry
presentation markup — `Button.mdx` shows the established convention is that the
*template* supplies formatting, wrapping plain record keys in backticks itself.
No record currently contains one, so the rule codifies existing practice rather
than forcing a migration.

### 6. Worked example — `references/doc-writing-standard.md:39-41`

Drop "six" from the After example. `:30-31` bans variant/size counts nine lines
above an example that contains one, no lint rule covers counts, and an agent
following the example reproduces the violation.

### 7. Provenance regeneration policy — `references/component-doc-schema.md:59-63`

Add `best-practice` and `w3c-apg` to the re-inferred set. The schema currently
names six provenance values and assigns behavior to four (`ai-inferred` and
`framework` re-inferred, `user` and `imported` never overwritten), leaving two
that between them cover `whenToUse`, `whenNotToUse`, `dos`, `donts` and
`accessibility` — the majority of every record.

**This is a behavior change to a protection rule, not a documentation
clarification**, so it is stated here to be reviewed as one. The blast radius is
smaller than it first looks: across the sample's 14 records, 13 `accessibility`
blocks are `w3c-apg+framework` and only one is bare `w3c-apg`. Since `framework`
is already in the re-inferred set, and the protection side of the rule is
written as "provenance **includes** `user` or `imported`", those 13 are already
re-inferrable under any consistent reading. This change makes explicit what is
already true for almost every block, and settles the one case that genuinely
isn't.

The protected tier exists for human input (`user`) and pre-existing external
content (`imported`); generated content is neither, and a third "regenerate but
preserve user edits" tier would be speculative. The `user` protection still
catches anything a human has touched — including any block cleared for re-voicing
under §8, which is stamped `imported+user`.

### 8. Re-voice approval gate — `commands/document-component.md`

Fold the imported-block decision into the step-1 record-approval gate that
already runs once per component. Proposed rewrites of `imported` blocks are
presented inline with before/after text and flagged as such; approving the
record approves them. Stamp the result `imported+user`.

Because `imported+user` includes `user`, the existing never-overwrite rule
covers it, so a second run neither re-asks nor auto-rewrites. Today there is no
defined post-decision value at all, which is why the same question recurs.

## Rejected

### The `docCardHeader` surface

An earlier draft added a per-component `docCardHeader` surface to the manifest so
`docs:check` could see header drift. It detects nothing, and the reasoning that
justified it was wrong.

`docs-check.mjs:57` iterates surfaces generically, but `classifySurface`
(`:25-40`) does not:

- `edited` is unreachable. `currentRenderHash` is computed only for
  `REPO_SURFACES`, which is `new Set(['storybookMdx'])` (`:23`). For any other
  surface it stays `null` and the `else if (currentRenderHash === null) →
  edit-unverified` branch short-circuits first.
- `layout-upgrade-available` cannot fire — `expectedRenderer` is passed only for
  `docCard` (`:70`).
- `stale` compares `surface.src` against a single per-component canonical
  fingerprint. Every surface is compared against the same number.

Since the builder writes both bands in one call and stamps from one summary,
`docCardHeader.src` could never differ from `docCard.src`. Two entries, always
identical, always flipping together. The header's *behavior* fix is kept; the
tracking half was ceremony.

### Two helper modules

- **`composeFigmaDescription(record)`** was justified by the claim that two
  agents composing differently produce different `render` hashes that read as
  drift. `figmaDescription` is also outside `REPO_SURFACES`, so its `render`
  hash is write-only and nothing ever compares it. What remains of the finding
  is dual copy, which an explicit template fixes completely.
- **`stripInlineCode()`** would have normalized backticks at projection time so
  records could keep them for MDX. It serves zero existing records, the MDX
  template supplies its own formatting, and the cost is a normalizer living in
  the zero-import module inlined into the Figma snippet *and* imported into
  `doc-record.mjs`. A lint rule is cheaper and is actually enforced.

Dropping both leaves the renderer as the only behavioral change in the batch.

### The "Button stays 3 columns" correction

The dogfood report asked for this expectation to be corrected "wherever that's
written down". It is not written down in this repo. The only matches are
`docs/superpowers/plans/2026-08-09-doc-card-builder.md:138` and
`scripts/lib/doc-card-plan.test.mjs:19`, both asserting
`cardColumns(1260, 420, …) === 3` — a legitimate exact-multiple assertion. The
wrong expectation lived in the PR #19 prose. No action.

## Reconnaissance gate

The renderer changes cannot be fully validated without a live Figma session. A
**read-only** pass over all 14 doc cards in `Throughline Plugin Test`
(`OCiZiGpsJ4ncPD8r205BjC`) runs before the renderer is written, and establishes:

1. **Header band structure** — the band's name (`Header` on some cards, `Frame`
   on others), its direct children, and a positional rule that identifies the
   short-description text node unambiguously across all 14. If no such rule
   exists, the header write is deferred rather than guessed.
2. **Component-set regime** — `layoutMode` and per-child
   `layoutSizingHorizontal` for each set, which decides the §1 measurement per
   the rule stated there.

This pass writes nothing and stamps nothing.

## Rollout and CI consequences

`DOC_CARD_RENDERER_VERSION` goes `'3'` → `'4'` (`doc-card-plan.mjs:11`).

**Five existing assertions break and must move in the same commit:**

| File | Assertion |
|---|---|
| `scripts/lib/doc-card-plan.test.mjs:5-6` | constant equals `'3'` |
| `scripts/lib/doc-card-plan.test.mjs:49` | `plan.rendererVersion === '3'` |
| `scripts/build-doc-card-builder.test.mjs:15` | generated markdown contains `'3'` |
| `scripts/build-doc-card-builder.test.mjs:45` | generated output matches on-disk |
| `scripts/docs-check.test.mjs:154-156` | a card stamped `'3'` reports no layout upgrade |

`docs-check.test.mjs:130` passes `expectedRenderer` explicitly and is unaffected.
`references/doc-card-builder.md` must be regenerated or `--check` exits 1.

**`docs:check` output changes, exit code does not.** The three components stamped
`renderer: "3"` gain `layout-upgrade-available`. The other eleven have **no
`renderer` key at all** (not `"2"`, as the handoff records) and already flag it
via the version-independent `!surface.renderer` branch — no change. The flag is
absent from `FAILING` (`docs-check.mjs:86`), so `docs:check` stays exit 0.

**`renderHash` changes for every card** even with identical content, because
`rendererVersion` sits inside the hashed plan (`doc-card-plan.mjs:84`).
`docs:check` cannot observe this — `docCard` is outside `REPO_SURFACES`, so the
CLI never recomputes it. Stored `render` values become historical on the next
re-render.

**Consuming repos must refresh.** A repo whose `doc-card-plan.mjs` still says
`'3'` while the plugin says `'4'` gets a silently-wrong "no drift". The
freshness gate at `commands/document-component.md:29-38` already prescribes this
comparison, but it is an agent instruction, not a machine gate.

## Verification

Only two things need a live Figma session: the header node write and the
`specimen.children` read. Everything downstream of them — including the planner
maths they feed — is pure Node. Sequence the Node work first so it can land
independently:

- **Unit** — intrinsic-width (or content-only) plumbing through `planDocCard`;
  the `header` key in the plan and its effect on `renderHash`; the
  `no-inline-code` lint rule; the five updated version assertions.
- **Build** — `node scripts/build-doc-card-builder.mjs --check` in sync.
- **Live Figma** — re-render Button, Input and Card; confirm the header
  description and date update, the `columnUnit` clamp holds, node ids and
  variant counts are unchanged, no instance detaches, and a second render
  returns identical card and specimen widths (the idempotency proof that the
  loop is closed).

## Out of scope, noted

- **Name collisions in the inlined snippet.** The planner and renderer share one
  global scope and `buildDocCardBuilder` performs no collision check. A planner
  export named `fnv1a` would silently overwrite the renderer's hash function at
  build time; one named `REQUIRED_VARS` would be a `SyntaxError` at
  `figma_execute` time, not at build time. This batch adds no planner exports, so
  it is not exposed — but the guard is missing.
- **`throughline-sample` is not a faithful install.** It carries an orphan
  `lib/doc-card-render.figma.js`, five `.test.mjs` files, and a `test:scripts`
  script that no documented install path produces. Repo-side cleanup.
