# Component Documentation Layer — dogfood handoff

> **For the next session.** This is a handoff, not a plan. The feature is
> **built, merged, and released** (`v0.14.0`). What remains is the first real
> end-to-end **dogfood** against a live repo + Figma file — the one thing the
> synthetic tests could not cover. You have zero context from the session that
> shipped this; everything you need is here or linked.

## Status

- **Shipped:** PR #25 squash-merged to `main` (`9531b56`); released as **`v0.14.0`**
  (npm `@radicool/throughline@0.14.0`, `latest` dist-tag; GitHub Release live).
- **Scope:** v1 is **components only**. Token documentation is deferred to v2.
- **Never dogfooded.** All logic is prose skills + zero-dep scripts validated by
  synthetic temp-dir tests. No `.doc.json` has yet been generated from a real
  component and projected end-to-end. That is the next session's job.

## How to start

1. Read the design of record: `docs/superpowers/specs/2026-07-14-component-documentation-layer-design.md` — content model, four-source generation pipeline, projection surfaces, sync/drift contract, retrofit lane.
2. Read the implementation plan for exact interfaces: `docs/superpowers/plans/2026-07-14-component-documentation-layer.md`.
3. Read the canonical schema + fingerprint contract: `references/component-doc-schema.md`, and the archetype knowledge base: `references/component-doc-archetypes.md`.
4. Then run the dogfood (below). No new spec/plan cycle is needed — this is validation, not new design.

## What shipped (merged on `main`) — the pieces to exercise

- **Canonical record:** `design-system/docs/components/<Name>.doc.json` — folder-resident source of truth from day one (stable across folder→repo, like `design-system.json`). **JSON, not YAML** — a deliberate deviation from the spec's YAML, because the toolchain is zero-dependency and has no YAML parser. Documented in the PR/plan.
- **Scripts (zero-dep):** `scripts/lib/doc-record.mjs` (`stableStringify`, `fingerprint`, `canonicalFingerprint`, `validateRecord`, `loadRecord`), `scripts/docs-check.mjs` (the drift gate), `scripts/build-docs-digest.mjs` (emits `index.json` + `llms.txt`).
- **Projection surfaces:** `figmaDescription`, `docCard`, `storybookMdx` (+ the AI digest). One-directional projection from the record; fingerprint stamps detect drift per surface.
- **Skills touched:** `component-builder` (Step 4.5 author the record), `storybook-chromatic-builder` (Step 5.5 render to code), `design-system-audit` (Step 1.5 size the doc surface), `retrofit-planner` (Phase 6.5 adopt-first), `repository-builder` (adopt the store + wire `docs:check` into the generated repo's CI).
- **Command:** `/document-component`.
- **Manifest:** schemaVersion **5** (`components.meta[name].doc`, `audit.docSurface`, `docs` retrofit phase enum).

## What to dogfood — the flow, and what to verify

Run against your sample repo (a real component library + its Figma file). The confidence gates:

1. **Authoring.** Run `/document-component` (or `component-builder` Step 4.5) on a real component. **Verify:** it produces a `design-system/docs/components/<Name>.doc.json` that `validateRecord` accepts (required: `name`, `summary`, `description`), with per-block `provenance` set, and a canonical fingerprint stamped into `design-system.json`.
2. **Four-source generation.** Confirm the pipeline order works on real input: ingest existing (code JSDoc/MDX/README + Figma `description`, marked `provenance: imported`) → infer from the built artifact → enrich from the archetype base → specialize to the framework → user interview. **Regeneration must never overwrite `user` or `imported` blocks.**
3. **Projection to code.** Run `storybook-chromatic-builder` Step 5.5. **Verify** the `storybookMdx` surface renders and the manifest records its `file` + render hash.
4. **Projection to Figma.** **Verify** the record projects into the component's Figma `description` field. *(Needs the Figma bridge — see below.)*
5. **AI digest.** Run `docs:digest`. **Verify** `index.json` (machine map, includes `description`) + `llms.txt` are emitted and coherent.
6. **The drift gate.** Run `docs:check`. **Verify:**
   - a clean system passes, with Figma surfaces reported as `edit-unverified` (informational);
   - hand-editing the record → `canonical-changed` (fails);
   - hand-editing a rendered MDX file → `edited` (fails);
   - **deleting** a rendered MDX file → **`missing-surface` (fails)** — this is the hardening fix added post-review; confirm it does *not* silently pass as `edit-unverified`.
7. **Brownfield / retrofit.** If the sample repo has existing docs, confirm Phase 6.5 is **adopt-first**: the first pass claims existing content as `provenance: imported` and must **not** clobber it.

## Dispatch reality (same as the routing dogfoods — reuse, don't relearn)

The `agents/` files (`throughline:architect`, etc.) are **not registered as dispatchable subagent *types*** in a fresh Claude Code session — only `general-purpose`, `Explore`, etc. are. If the doc-generation steps dispatch subagents, emulate the ladder by dispatching `general-purpose` with the role contract and an **explicit `model` per tier**. Most doc-authoring work is prose-generation on a strong tier; the mechanical projection/rendering is `fast`.

## Environment dependency

- **Figma bridge required** for surface #4 (projection into the Figma `description` field) and any read of existing Figma `description` during ingest. Confirm `figma_get_status` (probe) and reap stale instances before any Figma dispatch. **The bridge targets the ACTIVE Figma file and can drift** — assert file identity, not just connection (see the `figma-bridge-active-file-drift` memory).
- Surfaces #1–3, #5, #6 (record, MDX, digest, gate) need **no bridge** — they are pure repo operations and can be dogfooded offline first.

## Verification gates (current baseline)

- `node --test` → **141 passing** on `main`.
- `node ci/validate-plugin.mjs` → OK.
- `node ci/validate-skills.mjs` → 12 skills, 5 commands, 4 agents OK.
- `node scripts/adapters/generate.mjs --check` → adapters in sync (regenerate after any `SKILL.md` edit; `agents/` and `references/` are **not** bundled).
- **CI/release now run on Node 24** (bumped from the deprecated Node 20; `npm@latest` dropped Node 20, which broke the first `v0.14.0` tag push before it was fixed and re-tagged).

## Deferred / known follow-ups

- **Token documentation (v2)** — the whole token-docs half of the original idea is out of v1 scope; components only.
- **JSON-not-YAML** — the canonical record is JSON by design (zero-dep). If a YAML-authoring UX is ever wanted, it needs a parser dependency decision first.
- Anything the dogfood surfaces (a projection that doesn't round-trip, an archetype that misfits a real component, a provenance block that gets clobbered) is the real signal — capture it and fix from there.
