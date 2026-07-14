# Component Documentation Layer ("ThroughLine Docs") — design

**Date:** 2026-07-14
**Status:** Approved (design), pending implementation plan
**Scope:** v1 — **components only**. Token documentation is an explicit v2 follow-on
reusing the same machinery (see *Phasing*).

## Problem

ThroughLine builds high-quality tokens, icons, and components in Figma and syncs
them to code — but it authors almost **no usage documentation**. Today each
component gets a Figma "doc card" carrying only a *name*, a one-line *short
description*, a *status chip*, and a *last-updated date*
(`references/figma-component-standards.md:273+`). There is:

- **No** account of what a component *is*, when to use it (and when not), what its
  variants and states *mean*, its do's and don'ts, or its accessibility behavior —
  in either Figma or code.
- **No** use of Figma's native component/variable `description` fields (the
  `figma_set_description` / `figma_generate_component_doc` MCP tools exist but are
  never called) — the exact surface Dev Mode and **Code Connect** (enterprise) read
  from.
- **No** code-side documentation pages: `storybook-chromatic-builder` generates
  stories, Chromatic tests, and Code Connect mappings, but **no** autodocs/MDX/JSDoc.
- **No** place in `design-system.json` to store or point at documentation content
  (`components.meta[name]` holds only `status` + `updatedAt`).

The gap is the **semantic usage layer**: the "what IS this / how do I use it /
do's & don'ts / a11y" that a human designer *and* an AI agent both need to build
correctly. The future consumer is increasingly an AI reading docs to build against
the system, so the documentation must be **structured, machine-legible, and
deterministic**, not just prose on a canvas.

## Goals

1. A **structured, AI-first canonical documentation record** per component, authored
   once and rendered to every surface.
2. Content produced from **four layered sources**: inferred from the built artifact,
   enriched from best-practice systems, specialized to the target framework, and
   confirmed/augmented by interviewing the user.
3. **Resilient multi-surface projection** — Figma description fields, the enriched
   doc card, Storybook autodocs/MDX, and an AI digest — such that if any one surface
   breaks, the data still lives in the others and in the canonical file.
4. **Sequencing-safe:** works during the Figma-only *folder* stage, before any repo
   exists, and gracefully lights up code surfaces once the repo is scaffolded.
5. A **drift/sync mechanism** so surfaces never silently disagree with the canonical
   source.

## Non-goals (v1)

- Token documentation (v2).
- A live MCP documentation endpoint (considered, deferred — see *Alternatives*).
- Fully-automatic bidirectional merge across surfaces (rejected as fragile — see
  *Sync*).
- The `anatomy`, `content-writing`, and `examples` content blocks (deferred to keep
  the v1 generation/review burden lean).

## Architecture — one source, many surfaces

```
                 ┌──────────────────────────────────────┐
                 │  CANONICAL  (folder-resident)         │
                 │  design-system/docs/components/        │
                 │    Button.doc.yaml   ← authoritative   │
                 └───────────────┬──────────────────────┘
        render (one-directional, deterministic projection)
        ┌──────────────┬─────────┴───────┬────────────────┐
        ▼              ▼                 ▼                ▼
  Figma component   Enriched          Storybook         AI digest
  description field  doc card         autodocs (MDX)    llms.txt +
  (Dev Mode /        (canvas)         + JSDoc           docs/index.json
   Code Connect)
```

**The canonical store is the working folder, not "the repo."** This mirrors how
`design-system.json` already works: `figma-environment-setup` creates the manifest
in the working folder at `stage: "folder"`, and the entire Figma authoring phase
runs there long before `repository-builder` scaffolds a monorepo. The doc records
follow that exact pattern — folder-resident sibling files, written at
component-build time, brought under git when the stage advances. **The path stays
stable at `design-system/docs/` across folder→repo so files never move.**

Every non-canonical surface is a **projection**: rendered *from* the canonical
record, never authored independently. This resolves the sequencing concern (data
exists from the first component, repo or no repo) and delivers the resilience/
fallback property: even at folder stage with no code, the full doc data lives in a
plain file **and** in Figma's native description fields.

### Surfaces come online progressively by stage

| Stage | Skills | Canonical store | Live projections |
|---|---|---|---|
| **folder** | tokens → components | `.doc.yaml` files written to the working folder | Figma component `description` field + enriched doc card render immediately |
| **repo** | `repository-builder` onward | same files, now under git (adopted into a package) | + Storybook autodocs/MDX + JSDoc + AI digest + `docs:check` gate |

There is never a moment where the canonical data does not exist.

## Content model (trimmed v1 core)

One canonical YAML record per component. YAML is chosen for the canonical file
because it is both human-editable and cleanly AI-legible; the machine index
(`docs/index.json`) is emitted as JSON for deterministic parsing.

```yaml
# design-system/docs/components/Button.doc.yaml
name: Button
summary: Triggers an action or event.            # one line — supersedes today's "short description"
description: >                                    # a paragraph — what it IS, its role in the system
  A clickable control that initiates an action…
whenToUse:    [ "Submitting a form", "Confirming a decision" ]
whenNotToUse: [ "Navigating to a new page — use a Link" ]
variants:                                         # each axis value → its MEANING and when to use it
  type: { primary: "Highest-emphasis action…", secondary: "…", ghost: "…" }
  size: { sm: "…", md: "…", lg: "…" }
states:       { hover: "…", focus: "…", disabled: "…", loading: "…" }
dos:    [ "Lead with a verb", "One primary button per view" ]
donts:  [ "Don't use for navigation", "Don't stack >2 primaries" ]
accessibility:
  role: button
  keyboard: [ "Enter / Space activates" ]
  notes:    [ "Icon-only buttons need an aria-label" ]
tokensUsed:   [ color.bg.primary, spacing.sm, radius.md ]   # inferred from real bindings
provenance:                                       # which source authored each block
  description: ai-inferred
  dos: best-practice+user
  accessibility: w3c-apg
status: stable
updatedAt: 2026-07-14
```

**v1 blocks:** `summary`, `description`, `whenToUse`, `whenNotToUse`, `variants`,
`states`, `dos`, `donts`, `accessibility`, `tokensUsed`, `provenance`, plus the
existing lifecycle fields (`status`, `updatedAt`).
**Deferred to a follow-on:** `anatomy`, `content` (writing guidelines), `examples`.

Two blocks carry the design intent:

- **`provenance`** (per block) ties the record back to the four content sources and
  makes regeneration *smart*: AI-inferred blocks are re-inferred when the component
  changes, but a user-authored `dos` entry is **never clobbered**. It is also the
  trust signal for readers ("this a11y note came from the APG; this do/don't you
  wrote").
- **`tokensUsed` + discrete `dos`/`donts`** are the AI-facing payload —
  machine-readable relationships and *checkable* rules an agent builds against,
  not just prose.

## Generation pipeline (four sources, layered)

Runs at component-build time (in `component-builder`) and on demand (via
`/document-component`). Each layer only fills what it legitimately knows; every
block is stamped with `provenance`.

1. **Infer from the built Figma artifact.** Read the real component — variants,
   slots, states, and bound tokens — to author `description`, `variants`, `states`,
   and `tokensUsed`. Always accurate to what was actually built.
2. **Enrich from a best-practice archetype knowledge base** (new baked-in
   reference). Keyed by archetype (button, input, modal, card, …), seeded from the
   W3C ARIA APG, Material, Polaris, and Carbon → seeds `dos`, `donts`,
   `accessibility`, `whenToUse` / `whenNotToUse`.
3. **Specialize to `project.uiFramework`.** Framework-specific variant-vocabulary
   meanings and a11y idioms (reuses the same `project.uiFramework` field
   `component-builder` already reads for variant vocabulary).
4. **Interview the user** for the non-inferable — brand/product-specific do's &
   don'ts, product intent, voice. **The user approves/edits every block before it is
   written** to any surface.

## Projection mapping

| Canonical block(s) | Figma component `description` field | Enriched doc card | Storybook autodocs (MDX) + JSDoc | AI digest |
|---|---|---|---|---|
| summary, description | ✔ (header) | ✔ (existing short-desc slot, expanded) | ✔ | ✔ |
| whenToUse / whenNotToUse | ✔ | ✔ | ✔ | ✔ |
| variants, states (meanings) | ✔ (compact) | ✔ (legend under the matrix) | ✔ (argTypes descriptions) | ✔ |
| dos / donts | ✔ | ✔ | ✔ | ✔ |
| accessibility | ✔ | ✔ | ✔ | ✔ |
| tokensUsed | — | — | ✔ | ✔ (component→token map) |

- The **Figma component `description` field** is the enterprise / Dev Mode / Code
  Connect read surface — this is why mirroring there matters. Rendered as compact
  markdown via `figma_set_description`.
- The **enriched doc card** extends today's card (name/short-desc/status/date) with
  a usage body: when-to-use, do's/don'ts, a11y summary, and a variant/state legend —
  all token-bound, following `references/figma-component-standards.md` doc-card
  rules (no hardcoded hex/px; deterministic node names).
- **Storybook autodocs**: an MDX docs page per component rendered from the record,
  plus JSDoc on the code component so `argTypes` descriptions surface in the Storybook
  controls table. This is greenfield — the storybook skill generates no doc pages
  today.
- **AI digest** (the "Records + digest" decision): a generated
  `design-system/docs/llms.txt` (human+AI narrative index of every component, its
  usage rules, and its token map) plus `design-system/docs/index.json` (the same as a
  machine map) so an agent can load the whole system in one read.

## Sync / drift

The default flow is **one-directional** (canonical → surfaces), so in the common
case there is nothing to merge. Out-of-band edits are handled by fingerprinting.

- **Fingerprint.** Each render stamps a hash of the canonical record (normalized)
  into/alongside the surface:
  - Figma: a marker line appended to the `description` field
    (e.g. `<!-- tl:doc <hash> -->`) and/or a named metadata node on the card.
  - MDX: a frontmatter field.
  - The manifest records the current canonical hash and each surface's stamped hash.
- **`docs:check`** (a repo gate, exactly analogous to the existing `tokens:validate`
  / token-crosswalk validator) reports two drift types:
  - **stale** — the canonical record changed; a surface still carries an older hash
    (surface is behind).
  - **edited** — a surface's live content no longer matches what the canonical record
    renders (someone edited the surface directly).
- **Reconciliation** is **per item and reviewable** (the chosen policy): for each
  drifted item the user chooses **re-render** (canonical wins) or **pull-back** (fold
  the surface edit into the canonical record), landed as a **PR** — matching
  ThroughLine's existing PR-gated ethos. No automatic bidirectional merge.

## Skills, references, and manifest changes

**New reference asset**
- `references/component-doc-schema.md` — the canonical `.doc.yaml` schema + the
  projection mapping + the fingerprint/`docs:check` contract.
- Best-practice **archetype knowledge base** (baked-in do's/don'ts + a11y keyed by
  archetype, sourced from APG/Material/Polaris/Carbon). Format (single reference vs.
  structured data file) to be decided in the implementation plan.

**`component-builder`** (Figma phase) — gains a **doc-authoring step**: run the
generation pipeline, write `Button.doc.yaml`, populate the Figma component
`description` field, and enrich the doc card. Follows the existing doc-card and
post-build-audit discipline in `references/figma-component-standards.md`.

**`storybook-chromatic-builder`** (code phase) — gains a **doc-rendering step**:
generate MDX autodocs + JSDoc from the record and install the `docs:check` gate.

**`repository-builder`** — adopts the folder-resident doc store into git when the
stage advances (no relocation; the path is already `design-system/docs/`).

**New command `/document-component`** — author or refresh docs for existing
components and run the reconciliation flow (drift report → per-item re-render or
pull-back → PR).

**Manifest** — bump to **schemaVersion 5**. Extend `components.meta[name]` with a
`doc` object holding **pointers and state, never content**:

```json
"components": {
  "meta": {
    "Button": {
      "status": "stable",
      "updatedAt": "2026-07-14",
      "doc": {
        "path": "design-system/docs/components/Button.doc.yaml",
        "fingerprint": "<hash of canonical record>",
        "provenance": { "…": "…" },
        "surfaces": {
          "figmaDescription": { "fingerprint": "<hash>", "renderedAt": "<ISO>" },
          "docCard":          { "fingerprint": "<hash>", "renderedAt": "<ISO>" },
          "storybookMdx":     { "fingerprint": "<hash>", "renderedAt": "<ISO>" }
        }
      }
    }
  }
}
```

Follows the manifest rules (`references/manifest-schema.md`): forward-migrate on
version mismatch, only write owned fields, no content blobs, no secrets.

## Alternatives considered

- **Figma as canonical** (matching the token flow's direction). Rejected: the user
  optimized explicitly for AI consumption, which favors a structured repo-side file;
  and Figma-canonical would strand the data whenever Figma is disconnected.
- **Store doc content inside `design-system.json`.** Rejected: the manifest's own
  rules forbid content blobs; folder-resident sibling files give the same
  "exists-from-day-one" property without bloating the manifest.
- **Full bidirectional auto-sync.** Rejected as fragile (silent clobbering, conflict
  resolution). Per-item reviewable reconciliation gives editors a pull-back path
  without the fragility.
- **Live MCP docs endpoint.** Deferred: powerful for AI consumers but meaningfully
  larger scope; the generated `llms.txt` + `index.json` digest serves "AIs build
  correctly" for v1.

## Phasing

- **v1 (this spec):** everything above, **components only**.
- **v2 (follow-on):** token documentation reusing the same machinery — variable
  `description` fields via `figma_set_description`, Foundations-page enrichment in
  `token-sheet-builder`, and token records in the same canonical store.

## Success criteria

1. Building a component produces a canonical `.doc.yaml`, a populated Figma
   `description` field, and an enriched doc card — during the folder stage, with no
   repo.
2. At repo stage, the same records render Storybook MDX autodocs + JSDoc and generate
   `llms.txt` + `index.json`.
3. `docs:check` correctly flags a hand-edited Figma description (edited drift) and a
   changed canonical record (stale drift), and reconciliation lands a reviewable PR.
4. Regenerating a changed component re-infers AI-provenanced blocks and preserves
   user-authored blocks (verified via `provenance`).
5. The manifest migrates a schemaVersion-4 file forward to 5 without data loss.
