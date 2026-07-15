---
description: Author, refresh, or reconcile the usage documentation for one existing component — draft its canonical doc record from four sources, project it to Figma, the doc card, and code, and resolve any drift via a reviewable per-item choice.
---

Document a single existing component end to end, using the settings already in
`design-system.json` (`project.uiFramework`, `figma.mechanism`, `sync.platforms`)
rather than re-asking configuration. Scale explanation to `user.codingLevel`.

Ask which component to document (e.g. "Button"), then:

1. **Author/refresh the record.** Run the doc-authoring pipeline from
   the `component-builder` skill's *Author the documentation record* step —
   ingest any existing docs first (brownfield), then infer → enrich (from
   `${CLAUDE_PLUGIN_ROOT}/references/component-doc-archetypes.md`) → specialize →
   interview. The user approves the drafted record; `imported`/`user` blocks are
   never overwritten.
2. **Project it.** Write `design-system/docs/components/<Name>.doc.json`, set the
   Figma component `description`, enrich the doc card, and (if the repo/code side
   exists) render MDX/JSDoc and run `docs:digest` per the
   `storybook-chromatic-builder` render step.
3. **Reconcile drift.** Run `docs:check`. For each drifted surface, offer a per-item
   choice — **re-render** (canonical wins) or **pull-back** (fold the surface edit
   into the record) — and land the result as a reviewable change. On a brownfield
   component's first pass, adopt existing content (`provenance: imported`) rather
   than overwriting it.
4. **Close the flow.** Hand back in the four-beat guide voice from
   `${CLAUDE_PLUGIN_ROOT}/references/guide-voice.md`: the outcome, what you set
   aside and why, one recommended next step, and at most one light alternative.
   Read existing state to name what is actually outstanding rather than guessing —
   a component at `status: "draft"` with no code surface in `meta[name].doc.surfaces`
   means the code side is deferred. Do not close with a grid of co-equal options.

See `${CLAUDE_PLUGIN_ROOT}/references/component-doc-schema.md` for the record schema,
fingerprint contract, and projection mapping. If a component was never built in
Figma, point the user at `component-builder` first.
