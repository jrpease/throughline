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
   interview. Authored prose follows
   `${CLAUDE_PLUGIN_ROOT}/references/doc-writing-standard.md`. Once the record is
   written, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/docs-lint.mjs
   design-system/docs/components/<Name>.doc.json` and fix its warnings. Do not
   raise a separate confirmation for a warning on an `imported`/`user` block:
   draft the rewrite and carry it into the approval gate below, shown as
   before/after and labelled with the block's provenance, so one approval covers
   the whole record. The user approves the drafted record before anything is
   projected (Figma description, doc card, manifest). Blocks the user did not
   clear keep their existing text; blocks the user did clear are stamped
   `imported+user` so a later run neither re-asks nor rewrites them.
2. **Project it.** Write `design-system/docs/components/<Name>.doc.json`, set the
   Figma component `description`, rebuild the doc card's `Usage` band with the
   canonical builder (`${CLAUDE_PLUGIN_ROOT}/references/doc-card-builder.md` —
   verify its returned summary and stamp `surfaces.docCard.{src,render,renderer}`
   from it), and (if the repo/code side exists) render MDX/JSDoc and run
   `docs:digest` per the `storybook-chromatic-builder` render step.
3. **Reconcile drift.** Before trusting `docs:check`, confirm the repo's copy of
   the doc scripts is current: compare `DOC_CARD_RENDERER_VERSION` in the repo's
   `scripts/lib/doc-card-plan.mjs` against the same constant in
   `${CLAUDE_PLUGIN_ROOT}/scripts/lib/doc-card-plan.mjs`. If the repo file is
   missing, or its version is lower, `docs:check` is reading stale rules and its
   "no drift" is meaningless — say so plainly, and offer to refresh the repo's
   doc scripts from the plugin copy. Refresh the whole set and re-check the npm
   registrations, both per **Documentation scripts — install as a set** in
   `${CLAUDE_PLUGIN_ROOT}/scripts/README.md` — a refreshed file whose script was
   never registered is the same failure in a new place. Run `docs:check` (with the
   refreshed scripts, if any). For each drifted surface, offer a per-item
   choice — **re-render** (canonical wins) or **pull-back**
   (fold the surface edit into the record) — and land the result as a reviewable
   change. On a brownfield component's first pass, adopt existing content
   (`provenance: imported`) rather than overwriting it.
   `docs:check` may also report `layout-upgrade-available` (informational, never
   failing): the card's layout predates the current builder. Offer to re-render
   the `Usage` band now — rebuild happens on this touch, never unprompted.
4. **Close the flow.** Hand back in the four-beat guide voice from
   `${CLAUDE_PLUGIN_ROOT}/references/guide-voice.md`: the outcome, what you set
   aside and why, one recommended next step, and at most one light alternative.
   Read existing state to name what is actually outstanding rather than guessing —
   a component at `status: "draft"` with no code surface in `meta[name].doc.surfaces`
   means the code side is deferred. Do not close with a grid of co-equal options.

See `${CLAUDE_PLUGIN_ROOT}/references/component-doc-schema.md` for the record schema,
fingerprint contract, and projection mapping. If a component was never built in
Figma, point the user at `component-builder` first.
