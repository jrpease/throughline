Document a single existing component end to end, using the settings already in
`design-system.json` (`project.uiFramework`, `figma.mechanism`, `sync.platforms`)
rather than re-asking configuration. Scale explanation to `user.codingLevel`.

Ask which component to document (e.g. "Button"), then:

1. **Author/refresh the record.** Run the doc-authoring pipeline from
   the `component-builder` skill's *Author the documentation record* step —
   ingest any existing docs first (brownfield), then infer → enrich (from
   `.throughline/references/component-doc-archetypes.md`) → specialize →
   interview. On a refresh (the record already exists), re-read the sources and
   re-infer as usual, but interview only on blocks that are new or whose contract
   changed (`name`, `variants`, `states`, `tokensUsed`); keep every other block
   as it is, without asking. Record the matched archetype id in the record's `archetype` field (`button`, `input`, `choice`, `card`, `modal`, `badge` or `other`); it is excluded from the fingerprint, so setting it forces no re-render. Authored prose follows
   `.throughline/references/doc-writing-standard.md`. Set `updatedAt` to
   today's date (ISO, `YYYY-MM-DD`) only when the record's content changed:
   compare the record before and after with `updatedAt` set aside, and keep the
   old date if they match. It is a projected field and the doc card's header
   renders it, so a bump alone marks every surface stale and forces a re-render.
   Once the record is
   written, run `node .throughline/scripts/docs-lint.mjs
   design-system/docs/components/<Name>.doc.json` and fix its warnings, except on
   blocks stamped `imported+user`: list those in the closing summary as something
   the user may fix, and never rewrite or re-ask them. Do not
   raise a separate confirmation for a warning on an `imported`/`user` block:
   draft the rewrite and carry it into the approval gate below, shown as
   before/after and labelled with the block's provenance, so one approval covers
   the whole record. The user approves the drafted record before anything is
   projected (Figma description, doc card, manifest). Blocks the user did not
   clear keep their existing text; blocks the user did clear are stamped
   `imported+user` so a later run neither re-asks nor rewrites them.
   On a refresh of a component that already has a doc card, leave `components.meta[<Name>].status` as it is. The `draft` first write in component-builder's Step 4.5 applies only to a component being built; finalize owns status after that. The renderer reads status only when it creates a card header (`scripts/lib/doc-card-render.figma.js:202`), so a refresh cannot change the chip, but it would demote the manifest value.
2. **Project it.** Write `design-system/docs/components/<Name>.doc.json`, set the
   Figma component `description`, rebuild the doc card's header and bands with the
   canonical builder (`.throughline/references/doc-card-builder.md` —
   assemble the call by record with `node .throughline/scripts/doc-card-payload.mjs <record>`,
   which finds the card by its tag. If the render throws `no doc card is tagged "<Name>"`, pass `--node-id <card frame id>` once and re-run: the render tags the card, and its summary then returns `tagged: true`. `--node-id` is ignored when the card is already tagged, so the Figma tag is the signal, not the manifest's `renderer`. Check the returned
   `summary.recordHash` against the `expectedRecordHash` it printed. Then read the rest of the summary: `rendererVersion` should be "5"; `kitDrawn: true` means write `figma.docKit = { fileKey }` back to `design-system.json`; `migrated: true` means a v4-shaped card had its header rebuilt; `tagged: true` means this render tagged the card. `cardWidth` and `bandsRendered` have no expected value in code, so report them rather than gate on them. Stamp `components.meta[<Name>].doc.surfaces.docCard = { src: summary.fingerprint, recordHash: summary.recordHash, render: summary.render, renderer: summary.rendererVersion }` from the summary, never from a re-read of the card. The summary is the check; take one screenshot of the card only when `kitDrawn`, `migrated` or `tagged` is true, the renders that change its layout), and (if the repo/code side exists) render MDX/JSDoc and run
   `docs:digest` per the `storybook-chromatic-builder` render step.
   Before the Figma writes, run both preflights in `.throughline/references/figma-scripting.md`, since this command writes inline and no executor checks for you: the single live bridge instance check (`figma_get_status`, `otherInstances`), then the active-file preflight (`currentFileKey` must equal `figma.fileKey`). Repeat the active-file preflight before any replace. Run the payload command from the project root: `--manifest` defaults to `./design-system.json` and the record path resolves from the same directory. Write the payload with `--out <scratch>/payload.js`, pass `timeout: 30000` on the `figma_execute` call, and render one card per call, never batched.
3. **Reconcile drift.** This step governs `docs:check` only. The render in step 2 already runs the plugin's copy, because `scripts/doc-card-payload.mjs:20-21` imports from its own `lib/`, so the card does not depend on the repo copy being current. Before trusting `docs:check`, confirm the repo's copy of
   the doc scripts is current: compare `DOC_CARD_RENDERER_VERSION` in the repo's
   `scripts/lib/doc-card-plan.mjs` against the same constant in
   `.throughline/scripts/lib/doc-card-plan.mjs`. If the repo file is
   missing, or its version is lower, `docs:check` is reading stale rules and its
   "no drift" is meaningless — say so plainly, and offer to refresh the repo's
   doc scripts from the plugin copy. Refresh the whole set and re-check the npm
   registrations, both per **Documentation scripts — install as a set** in
   `.throughline/scripts/README.md` — a refreshed file whose script was
   never registered is the same failure in a new place. Two of the registrations,
   `adherence:check` and `verify:check`, carry placeholder paths and a
   `--package` specifier: substitute the repo's real ones per the paragraphs under
   that table, run each once, and use the documented `--skip` for a rule the
   system doesn't fit, rather than registering a placeholder that fails every
   run. A repo refreshed from before 0.20.0 gets both for the first time, so say
   so. Run `docs:check` (with the
   refreshed scripts, if any). For each drifted surface, offer a per-item
   choice — **re-render** (canonical wins) or **pull-back**
   (fold the surface edit into the record) — and land the result as a reviewable
   change. On a brownfield component's first pass, adopt existing content
   (`provenance: imported`) rather than overwriting it.
   `docs:check` may also report `layout-upgrade-available` (informational, never
   failing): the card's layout predates the current builder. Offer to re-render
   the card now — rebuild happens on this touch, never unprompted.
4. **Close the flow.** Hand back in the four-beat guide voice from
   `.throughline/references/guide-voice.md`: the outcome, what you set
   aside and why, one recommended next step, and at most one light alternative.
   Read existing state to name what is actually outstanding rather than guessing —
   a component at `status: "draft"` with no code surface in `components.meta[name].doc.surfaces`
   means the code side is deferred. Do not close with a grid of co-equal options.

See `.throughline/references/component-doc-schema.md` for the record schema,
fingerprint contract, and projection mapping. If a component was never built in
Figma, point the user at `component-builder` first.

