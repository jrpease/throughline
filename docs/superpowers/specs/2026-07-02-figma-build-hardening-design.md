# Figma Build Hardening + Library-Derived Focus States — Design

**Date:** 2026-07-02
**Status:** Approved design → ready for implementation
**Scope:** Documentation/instruction changes only (reference docs + skills). No token-builder, code-gen, or runtime code changes.

## Context

A greenfield run of `figma-environment-setup → token-builder → token-sheet-builder → icon-system-builder → component-builder` shipped a working system but exposed skill/reference gaps that forced rework or produced user-visible wrongness. Those gaps are catalogued in `~/Dev/throughline-brand/throughline-plugin-issues.md` (15 items, A1–A6 / B1–B5 / C1 / D1–D3).

Separately, we reframed how focus states should be built: the plugin was prescribing one house-style focus stroke, ignoring that each component library (`project.uiFramework`) has its own real focus-visible idiom. The report's A2 and B1 are the concrete mechanics of that reframe, so the two efforts merge into one hardening pass.

This spec supersedes the interim edits made earlier this session (which added a flat `strokeAlign="OUTSIDE"` focus-stroke rule + checklist item #9 to `figma-component-standards.md` and `component-builder/SKILL.md`). Those get rewritten by the focus-redesign section below.

## Part 1 — Library-derived focus states (design decisions)

**Decisions locked during brainstorming:**

1. **Scope: Figma build only.** Focus tokens (`border/focus`, `width/focus`, `offset/focus`) and the code-gen side stay untouched. Only the component-*construction* rules change.
2. **Derive the focus idiom from `project.uiFramework`** (already read in `component-builder` for variant vocab, so recipe selection is free).
3. **Default (null / multi-framework / unknown): the shadcn-style ring** — a `0 0 0 3px` spread ring at ~50% opacity, border recolored to the ring color. This is the dominant modern pattern (shadcn and MUI both implement focus as a box-shadow spread ring).

**Two independent axes determine how the ring is built in Figma:**

- **Idiom (by `uiFramework`)** — the *look*: spread/opacity/border-recolor values and per-component behavior.
- **Shape (by control fill, per report A2)** — the *mechanism*: a Figma `DROP_SHADOW` only casts from opaque pixels, so:
  - **Filled control** → drop-shadow effect (no extra node).
  - **Transparent control** (ghost/outline/link, unfilled input) → an **absolutely-positioned ring child** (`RECTANGLE`, `layoutPositioning='ABSOLUTE'`, `strokeAlign='OUTSIDE'`, stroke weight = ring width, size = parent, constraints `STRETCH`), never a wrapper.

Both mechanisms map to the same `box-shadow: 0 0 0 3px var(--ring)` in code.

**Per-library recipe table** (new, in `figma-component-standards.md`, parallel to the existing variant-vocab table):

| Library | Focus idiom |
|---|---|
| shadcn / tailwind / default / null / multi | Border → `border/focus` + `0 0 0 3px` ring @ ~50% (`width/focus` spread, `border/focus` color). Shape per fill (A2). |
| mui | Per-component: inputs thicken+recolor border (`width/focus`/`border/focus`); buttons/clickables get a `0 0 0 N` ring. Ripple omitted. |
| vanilla-css | Outside-aligned offset **stroke** via `offset/focus` + `strokeAlign="OUTSIDE"` (maps to real `outline`/`outline-offset`). |
| ios-swift | No web focus ring — skip (native focus). |
| tier-2 / other | Research that library's `:focus-visible` idiom; default to the shadcn ring if unknown. |

**Wrapper is forbidden (report B1).** Never wrap the control in a padded frame to make room for the ring, and never reserve padding on non-focus states. The ring is an effect or a stroke-child *on the control*, so component bounds stay flush with the visual control.

**clipsContent (reconciles with existing lines 47/403/411):**
- Shadow branch: the **control frame carrying the drop-shadow effect** must have `clipsContent = true` (clean silhouette → crisp ring); a frame's own effect isn't clipped by its own clip.
- All **ancestor** frames (doc card, variant row, component set) stay `clipsContent = false` so the ring isn't sliced.
- Ring-child branch: parent `clipsContent = false` (the child stroke overflows).

## Part 2 — Report items, mapped to target files

Each item is documented exactly as the report specifies (symptom → root cause → fix). IDs match `throughline-plugin-issues.md`.

### `references/figma-scripting.md`
- **A1 🔴** `setBoundVariableForEffect` resets `spread`/`radius`/`offset` to 0 → re-assert geometry after binding, then assign. Include the canonical snippet.
- **A2 🔴** (rendering rule) drop-shadow casts only from opaque alpha; transparent frames need the ring-child; `clipsContent` doesn't change casting. (The *pattern* also lands in component-standards — see Part 1.)
- **A3 🟠** `createText()` starts as Inter Regular; call `setTextStyleIdAsync` **before** writing `.characters`. Canonical helper order.
- **A4 🟠** `resize()` axis mapping: for VERTICAL auto-layout, `primaryAxisSizingMode`=height, `counterAxisSizingMode`=width (inverted vs HORIZONTAL). Prefer `layoutSizingHorizontal/Vertical`; add worked example.
- **A5 🟡** read-after-write: pass `refreshCache: true` on the verifying read after any variable/style write in-session. Add to read-discipline.
- **A6 🟡** use a sensible placeholder color (approx token value, not pure black) so a late/failed paint bind degrades gracefully; read back `fills[0].boundVariables.color` for container fills in the audit.
- **D1 🟡** `figma_execute` is effectively capped ~30s regardless of `timeout` arg → design large builds to chunk (e.g. 108 variants in 3×36).

### `references/figma-component-standards.md`
- **B1 🔴** rewrite the "Focus rings need an offset gap" bullet: forbid the padded wrapper; use the A2 hybrid + the Part 1 recipe table. Fold in / scope down the interim `strokeAlign` edit and rewrite checklist item #9 to "Focus state matches library idiom" (shadow branch: effect present + control frame clipped; ring-child branch: absolute stroke child; vanilla-css: outside stroke).
- **B2 🔴** never use `minWidth`/fixed width on variants for showcase alignment (it's an intrinsic prop that ships to instances). Use deterministic grid coordinates (`layoutMode='NONE'` on the set, position each variant in a uniform cell centered on its hugged size). ("Component set arrangement.")
- **B3 🟠** `layoutMode='GRID'` is unreliable through the bridge → deterministic coordinates for matrices > ~1 row. Note `figma_arrange_component_set` recreates the set in its own container — don't use it when the set already lives in a hand-built doc card.
- **B4 🟠** doc-card component area must use a surface that contrasts with **all** variant fills (default `bg/default`); never the same token as any variant's resting fill. ("Documentation artboards & canvas layout.")
- **B5 🟠** reconcile audit item #2: exempt a component **set** laid out with deterministic coordinates from the auto-layout requirement (variants themselves still must be auto-layout).
- **A6 audit hook** — add the container-fill read-back to the post-build audit (shared with the scripting note).

### `references/figma-publishing.md`
- **C1 🟠** self-publish is not verifiable via `figma_get_library_components` (REST, needs `FIGMA_ACCESS_TOKEN` + `file_content:read`) or `figma_get_library_variables` (bridge, lists only subscribed external libs). Document: attempt detection (expect inconclusive) → trust user confirmation → proceed; treat a later `INSTANCE_SWAP` key rejection as the real re-check signal. Mirror a one-liner in the `component-builder` "Resolve publish state first" note.

### `skills/icon-system-builder/SKILL.md`
- **D2 🟡** promote **Tabler** (and **Phosphor**) to first-class libraries alongside Lucide/Material/custom. The Tabler path (deterministic SVG fetch + `createNodeFromSvg` + `createComponentFromNode`, vector strokes bound to `text/primary`) is proven; brand systems frequently specify Tabler/Phosphor.

### `skills/component-builder/SKILL.md`
- Focus build-step + never-list point at the per-library recipe keyed off `uiFramework`, the A2 hybrid, forbid-wrapper (B1), and the clip-on-control-frame note.
- **D3 🟡** warn that architectural rebuilds of a published/consumed set **detach** downstream instances; require re-instancing and recording which components consume which.
- Mirror the C1 publish note.

## Files touched (summary)

1. `references/figma-scripting.md` — A1, A2 (rule), A3, A4, A5, A6, D1
2. `references/figma-component-standards.md` — focus recipe (Part 1), B1, B2, B3, B4, B5, A6 audit
3. `references/figma-publishing.md` — C1
4. `skills/icon-system-builder/SKILL.md` — D2
5. `skills/component-builder/SKILL.md` — focus recipe pointers, D3, C1 mirror

## Out of scope

- `token-builder` and the focus token trio (unchanged).
- Any code-generation / sync-adapter focus emission.
- The transient A6 root cause itself (only its graceful-degradation + audit guidance is documented).

## Verification

- Each edited reference reads cleanly and its internal cross-references (checklist counts, section names) stay consistent.
- The focus section, B1, and the clipsContent rules (lines 47/403/411) no longer contradict each other.
- A structural pass (existing CI validators) still passes.
