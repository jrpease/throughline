# Doc-card dogfood fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the seven plugin-side defects found by the combined v3-layout + voice dogfood, and make the doc-card builder's stated contract true.

**Architecture:** Three of the defects trace to one false sentence in the builder's contract ("rebuilds ONLY the frame named `Usage`; the header and specimen bands are never touched"). The new contract — *the builder owns the `Usage` band and the header's record-derived content; it reads the specimen and never writes it* — is implemented by measuring the specimen from its variant children instead of its frame width, and by writing the header's description and date on every render. The remaining defects are a lint rule, an installer filter, and four documentation corrections. Pure-Node work is sequenced first so it lands without a Figma session.

**Tech Stack:** Node 20+ ESM (zero dependencies), `node --test` with `node:assert/strict`, Figma Plugin API via `figma_execute` (dynamic-page mode), markdown references consumed by Claude Code skills and commands.

**Design spec:** `docs/superpowers/specs/2026-08-12-doc-card-dogfood-fixes-design.md`

**Branch:** `fix/doc-card-dogfood-batch` (already created off `main`, spec committed as `2204aec`)

## Global Constraints

- **Zero runtime dependencies.** Every script in `scripts/` is zero-dependency Node ESM. Do not add packages.
- **`scripts/lib/doc-card-plan.mjs` must stay import-free.** It is inlined verbatim into the Figma snippet. Only bare top-level `export const` / `export function` at column 0 survive `buildDocCardBuilder`; `export async function`, `export default`, `export { … }`, `export let`, indented exports, and any `import` all throw at build time.
- **Name collisions are unguarded.** The inlined planner and the renderer share one global scope and the build performs no collision check. Reserved: `fnv1a`, `REQUIRED_VARS`, `boundPaint`, `renderDocCard`, `RECORD`, `CANONICAL_FP`, `columnUnit`, `cardColumns`, `listBlock`, `definitionBlock`, `planDocCard`, `DOC_CARD_RENDERER_VERSION`. This plan adds no new planner exports.
- **`references/doc-card-builder.md` is GENERATED.** Never hand-edit. Regenerate with `node scripts/build-doc-card-builder.mjs` in the same commit as any change to `scripts/lib/doc-card-plan.mjs` or `scripts/lib/doc-card-render.figma.js`. CI gates it at `.github/workflows/ci.yml:25` and `release.yml:43`.
- **Tests run from the repo root** with `node --test` (no npm test script exists). CI runs the same command.
- **`docs-lint.mjs` is warnings-only** and must always exit 0 on a parseable record.
- **Figma rules** (`references/figma-scripting.md`): async APIs only, fonts loaded before `.characters` is set, sizing modes re-asserted after `resize()`, one card per `figma_execute` call with an explicit `timeout: 30000`.

---

### Task 1: Ban inline code in record prose

Backticks render three ways from one record string: MDX styles them, Figma's plain-text `description` silently strips them, and the doc card shows the literal character to the reader. The record is the wrong place for presentation markup — `Button.mdx` shows the established convention is that the *template* supplies formatting. This task makes the standard say so, adds the lint rule that enforces it, and fixes the two worked examples that violate their own rules.

**Files:**
- Modify: `scripts/docs-lint.mjs` (inside the `for (const [path, text] of prose)` loop, ~line 69-80)
- Modify: `references/doc-writing-standard.md:40` (the "six" count), `:78-79` (the backtick example), the Vocabulary section (~`:88`), and the rules table (~`:110`)
- Test: `scripts/docs-lint.test.mjs`

**Interfaces:**
- Consumes: `lintRecord(record)` from `scripts/docs-lint.mjs`, already exported.
- Produces: a new warning rule id `no-inline-code`. No signature changes.

- [ ] **Step 1: Write the failing test**

Append to `scripts/docs-lint.test.mjs`:

```js
test('no-inline-code flags backticked terms in prose', () => {
  const ws = lintRecord({
    name: 'Input',
    accessibility: {
      notes: [
        'Set `aria-invalid` and link the message with `aria-describedby`.',
        'Give every field a label that points at it.',
      ],
    },
  });
  const hits = byRule(ws, 'no-inline-code');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, 'accessibility.notes[0]');
});

test('no-inline-code ignores a lone backtick and plain prose', () => {
  const ws = lintRecord({
    name: 'Input',
    summary: 'Collects a short typed value.',
    accessibility: { notes: ['Use the ` character sparingly.'] },
  });
  assert.equal(byRule(ws, 'no-inline-code').length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/docs-lint.test.mjs`
Expected: FAIL — the first new test reports `hits.length` is `0`, not `1`.

- [ ] **Step 3: Add the rule**

In `scripts/docs-lint.mjs`, inside the existing `for (const [path, text] of prose) { … }` loop, directly after the `machinery-vocabulary` block and before the `run-on-sentence` loop:

```js
    if (/`[^`]+`/.test(String(text))) {
      warn(path, 'no-inline-code',
        'inline-code backticks render as literal characters on the doc card and are stripped from the Figma description — write the term as plain text');
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/docs-lint.test.mjs`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Document the rule in the standard**

In `references/doc-writing-standard.md`, add this row to the rules table immediately after the `empty-meaning` row:

```markdown
| `no-inline-code` | backticks in user-facing prose (the card renders them literally; Figma strips them from `description`) | — |
```

Then, in the **Vocabulary** section, after the paragraph ending "…it is a structured field, machine-useful, and never rendered as prose.", add:

```markdown
**No inline-code markup.** Write `aria-label`, `Enter`, `role` as plain words.
One record string is projected to three surfaces that render backticks three
different ways — MDX styles them, Figma's plain-text `description` strips them,
and the doc card shows the literal character — so the record carries no
presentation markup at all. Where formatting is wanted, the projection template
supplies it: the Storybook MDX wraps variant and state keys in backticks itself.
```

- [ ] **Step 6: Fix the two worked examples that break their own rules**

In `references/doc-writing-standard.md`, the `description` After example currently contains a variant count, which `:30-31` bans nine lines above it. Change:

```
> confirming a choice, opening a dialog. Its six emphasis levels signal how
```

to:

```
> confirming a choice, opening a dialog. Its emphasis levels signal how
```

And the `accessibility.notes` example demonstrates the markup this task bans. Change:

```
> **Before:** "An icon-only button needs an aria-label" → **After:** "An
> icon-only button needs an `aria-label` so screen readers can announce it."
```

to:

```
> **Before:** "An icon-only button needs an aria-label" → **After:** "An
> icon-only button needs an aria-label so screen readers can announce it."
```

Leave the **Cut:** line above it unchanged — it is a negative example and its backticks are quoting the framework trivia being cut.

- [ ] **Step 7: Verify the standard has no remaining self-violations**

Run: `grep -n 'six emphasis\|`aria-label`' references/doc-writing-standard.md`
Expected: no output (exit 1).

- [ ] **Step 8: Commit**

```bash
git add scripts/docs-lint.mjs scripts/docs-lint.test.mjs references/doc-writing-standard.md
git commit -m "feat(docs-lint): no-inline-code rule, and fix the standard's self-violating examples"
```

---

### Task 2: Settle provenance semantics and the re-voice gate

Two related gaps. The schema assigns regeneration behavior to four of six provenance values, leaving `best-practice` and `w3c-apg` undefined — and between them they cover most of every record. Separately, a lint warning on an `imported` block currently triggers a second confirmation stacked on top of the record-approval gate that already runs once per component, with no defined provenance for the outcome, so the same question recurs on every run.

**Files:**
- Modify: `references/component-doc-schema.md:59-63`
- Modify: `commands/document-component.md:10-22` (step 1)

**Interfaces:**
- Consumes: nothing.
- Produces: `imported+user` as the defined post-approval provenance value, relied on by no code (provenance is excluded from the fingerprint) but read by every authoring agent.

- [ ] **Step 1: Define the regeneration policy**

In `references/component-doc-schema.md`, replace:

```markdown
- **`provenance`** — per-block author source, one of `imported`, `ai-inferred`,
  `best-practice`, `w3c-apg`, `framework`, `user`, or a `+`-joined combination
  (e.g. `best-practice+user`). Regeneration re-infers `ai-inferred`/`framework`
  blocks and **never overwrites** a block whose provenance includes `user` or
  `imported`.
```

with:

```markdown
- **`provenance`** — per-block author source, one of `imported`, `ai-inferred`,
  `best-practice`, `w3c-apg`, `framework`, `user`, or a `+`-joined combination
  (e.g. `best-practice+user`). Regeneration **re-infers** a block whose
  provenance includes `ai-inferred`, `framework`, `best-practice`, or `w3c-apg`,
  and **never overwrites** one whose provenance includes `user` or `imported`.
  Every value is assigned to exactly one of those two tiers: generated content is
  re-inferred, human input (`user`) and pre-existing external content
  (`imported`) are protected. A protected block may still be rewritten when the
  user approves the rewrite at the record-approval gate; the result is stamped
  `imported+user`, which is protected from then on and never re-proposed.
```

- [ ] **Step 2: Fold the imported-block decision into the approval gate**

In `commands/document-component.md`, replace:

```markdown
   design-system/docs/components/<Name>.doc.json` and fix its warnings — for
   `imported`/`user` blocks, surface the warning and let the user decide per
   item. The user approves the drafted record before anything is projected
   (Figma description, doc card, manifest); `imported`/`user` blocks are
   never overwritten.
```

with:

```markdown
   design-system/docs/components/<Name>.doc.json` and fix its warnings. Do not
   raise a separate confirmation for a warning on an `imported`/`user` block:
   draft the rewrite and carry it into the approval gate below, shown as
   before/after and labelled with the block's provenance, so one approval covers
   the whole record. The user approves the drafted record before anything is
   projected (Figma description, doc card, manifest). Blocks the user did not
   clear keep their existing text; blocks the user did clear are stamped
   `imported+user` so a later run neither re-asks nor rewrites them.
```

- [ ] **Step 3: Verify no stale cross-reference survives**

Run: `grep -n 'decide per' commands/document-component.md`
Expected: no output (exit 1).

- [ ] **Step 4: Commit**

```bash
git add references/component-doc-schema.md commands/document-component.md
git commit -m "docs: assign every provenance value a regeneration tier; fold re-voice into the approval gate"
```

---

### Task 3: Close the install path

`scripts/docs-lint.mjs` is copied into consuming repos but its npm script is registered only by the one-time setup skill, so every repo the voice layer exists to upgrade gets the file with no entry point. The root cause is that the copy list and the registration are written down twice and only one copy was maintained. `scripts/README.md` already has the per-script table that should be the single source; it is missing rows and currently makes a false claim.

**Files:**
- Modify: `scripts/install.mjs` (the `stagePayload` scripts filter, ~line 127)
- Modify: `scripts/README.md` (the script table)
- Modify: `skills/storybook-chromatic-builder/SKILL.md:35-42`
- Modify: `commands/document-component.md` (step 3 refresh list)
- Test: `scripts/install.test.mjs`

**Interfaces:**
- Consumes: `stagePayload(srcRoot, destRoot, skipPredicate)` in `scripts/install.mjs`, already defined.
- Produces: `export const skipScript = (relPosix: string) => boolean` from `scripts/install.mjs` — the staging exclusion predicate, now named and testable.

- [ ] **Step 1: Write the failing test**

Append to `scripts/install.test.mjs`, and add `skipScript` to the existing import from `./install.mjs`:

```js
test('skipScript excludes plugin-internal scripts, adapters and tests', () => {
  assert.ok(skipScript('install.mjs'), 'the installer itself');
  assert.ok(skipScript('build-doc-card-builder.mjs'), 'generator, never run downstream');
  assert.ok(skipScript('lib/doc-card-render.figma.js'), 'read only by the generator');
  assert.ok(skipScript('docs-check.test.mjs'), 'tests stay in the plugin');
  assert.ok(skipScript('adapters/generate.mjs'), 'adapters have their own target');
});

test('skipScript keeps every script a consuming repo runs', () => {
  for (const keep of [
    'build-docs-digest.mjs', 'docs-check.mjs', 'docs-lint.mjs',
    'lib/doc-record.mjs', 'lib/doc-card-plan.mjs',
    'validate-crosswalk.mjs', 'lib/crosswalk.mjs',
  ]) {
    assert.ok(!skipScript(keep), `${keep} must be installed`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/install.test.mjs`
Expected: FAIL — `SyntaxError` or `skipScript is not a function`, because nothing exports it yet.

- [ ] **Step 3: Extract and extend the predicate**

In `scripts/install.mjs`, add above the `install()` function:

```js
// Scripts that never run from a consuming repo: the installer itself, the
// doc-card builder generator, and the renderer template it inlines (the
// renderer reaches Figma pre-inlined inside references/doc-card-builder.md).
const PLUGIN_INTERNAL = new Set([
  'install.mjs',
  'build-doc-card-builder.mjs',
  'lib/doc-card-render.figma.js',
]);

export const skipScript = (relPosix) =>
  relPosix.startsWith('adapters/') || relPosix.endsWith('.test.mjs') || PLUGIN_INTERNAL.has(relPosix);
```

Then replace the inline predicate in the `payload` array:

```js
    ...stagePayload(join(pkgRoot, 'scripts'), join(dir, BASE, 'scripts'), (r) => r.startsWith('adapters/') || r.endsWith('.test.mjs') || r === 'install.mjs'),
```

with:

```js
    ...stagePayload(join(pkgRoot, 'scripts'), join(dir, BASE, 'scripts'), skipScript),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/install.test.mjs`
Expected: PASS.

- [ ] **Step 5: Make the README table the single source of truth**

In `scripts/README.md`, add two missing rows after the `docs-lint.mjs` row:

```markdown
| `lib/doc-record.mjs` | Canonical record load + `canonicalFingerprint` (sha256 over the record minus `provenance`). The fingerprint every surface is stamped with. | copied alongside docs-check.mjs |
| `lib/doc-card-render.figma.js` | Figma renderer template for the doc card's `Usage` band and header. Inlined into `references/doc-card-builder.md`; never executed as a module. | plugin-internal (not installed) |
```

Then, immediately below the table, add the registration block so the copy list and the npm entry points live in one place:

```markdown
**Documentation scripts — install as a set.** Copying these files without
registering them leaves a repo with a script on disk and no entry point, which
is how a stale `docs:check` went unnoticed for a full release. Both
`storybook-chromatic-builder` (first-time setup) and `/document-component`
(freshness refresh) install the same five files and register the same three
scripts:

| File | npm script |
| --- | --- |
| `build-docs-digest.mjs` | `"docs:digest": "node scripts/build-docs-digest.mjs"` |
| `docs-check.mjs` | `"docs:check": "node scripts/docs-check.mjs"` |
| `docs-lint.mjs` | `"docs:lint": "node scripts/docs-lint.mjs"` |
| `lib/doc-record.mjs` | — (imported by the above) |
| `lib/doc-card-plan.mjs` | — (imported by the above) |

A refresh that adds a file must also add its npm script; check `package.json`
for all three every time, not just the file that changed.
```

- [ ] **Step 6: Point both consumers at the table**

In `skills/storybook-chromatic-builder/SKILL.md`, replace the copy-list paragraph and the three bullets:

```markdown
Install the documentation scripts alongside the token scripts (copy from the
plugin's `scripts/` — `build-docs-digest.mjs`, `docs-check.mjs`,
`lib/doc-record.mjs`, `lib/doc-card-plan.mjs`, and `docs-lint.mjs` — into the
repo and register npm scripts):

- `"docs:digest": "node scripts/build-docs-digest.mjs"`
- `"docs:check": "node scripts/docs-check.mjs"`
- `"docs:lint": "node scripts/docs-lint.mjs"`
```

with:

```markdown
Install the documentation scripts alongside the token scripts: copy the five
files and register the three npm scripts listed under **Documentation scripts —
install as a set** in `${CLAUDE_PLUGIN_ROOT}/scripts/README.md`. That table is
the single source of truth for what a consuming repo gets; do not restate the
list here.
```

In `commands/document-component.md` step 3, replace:

```markdown
   "no drift" is meaningless — say so plainly, and offer to refresh the repo's
   doc scripts from the plugin copy (`build-docs-digest.mjs`, `docs-check.mjs`,
   `lib/doc-record.mjs`, `lib/doc-card-plan.mjs`, `docs-lint.mjs` — the same
   files `storybook-chromatic-builder` installed at setup). Run `docs:check` (with the
```

with:

```markdown
   "no drift" is meaningless — say so plainly, and offer to refresh the repo's
   doc scripts from the plugin copy. Refresh the whole set and re-check the npm
   registrations, both per **Documentation scripts — install as a set** in
   `${CLAUDE_PLUGIN_ROOT}/scripts/README.md` — a refreshed file whose script was
   never registered is the same failure in a new place. Run `docs:check` (with the
```

- [ ] **Step 7: Verify the list now exists in exactly one place**

Run: `grep -rn 'build-docs-digest.mjs' skills/ commands/`
Expected: no output (exit 1) — both consumers now reference the README instead of restating the list.

- [ ] **Step 8: Run the full suite and commit**

Run: `node --test`
Expected: PASS.

```bash
git add scripts/install.mjs scripts/install.test.mjs scripts/README.md skills/storybook-chromatic-builder/SKILL.md commands/document-component.md
git commit -m "fix(install): one source of truth for the doc-script set, and stop shipping plugin-internal scripts"
```

---

### Task 4: Make the Figma description projection reproducible

`skills/component-builder/SKILL.md` specifies this projection as "a compact markdown rendering", which reads as an instruction to compose new prose — and that is what the v2 pass did. All three components' Figma descriptions contained sentences appearing nowhere in their records, on the exact surface Dev Mode and Code Connect read.

**Files:**
- Modify: `skills/component-builder/SKILL.md:280-284`

**Interfaces:**
- Consumes: the record fields `summary`, `whenToUse`, `whenNotToUse`, `dos`, `donts`, `accessibility.keyboard`, `accessibility.notes`, and the canonical fingerprint `<fp>` from `lib/doc-record.mjs`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the prose instruction with an explicit template**

In `skills/component-builder/SKILL.md`, replace:

```markdown
- **Figma component description.** Set the component's native `description` field
  (via `figma_set_description`) to a compact markdown rendering — summary,
  when-to-use/not, do's/don'ts, and the a11y summary — and append a fingerprint
  marker line `<!-- tl:doc <fp> -->` (this is the surface Dev Mode and Code Connect
  read).
```

with:

````markdown
- **Figma component description.** Set the component's native `description` field
  (via `figma_set_description`) from this exact template — this is the surface
  Dev Mode and Code Connect read, and it must be reproducible byte-for-byte by
  any agent from the same record:

  ```
  <summary>

  **When to use**
  - <whenToUse[n]>

  **When not to use**
  - <whenNotToUse[n]>

  **Do**
  - <dos[n]>

  **Don't**
  - <donts[n]>

  **Accessibility**
  - <accessibility.keyboard[n]>
  - <accessibility.notes[n]>

  <!-- tl:doc <fp> -->
  ```

  Rules: every line is a record string **verbatim** — no re-wording, no added
  connectives, no sentences that appear nowhere in the record. A block whose
  source array is empty is omitted along with its bold label. Sections are
  separated by exactly one blank line, and the fingerprint marker is always
  last. Under **Don't**, strip each entry's leading `Don't ` / `Never ` /
  `Avoid ` and re-capitalize the first letter, so the output reads
  `- Use a button to navigate. Use a Link.` rather than
  `- Don't use a button to navigate. Use a Link.` under a heading already
  reading "Don't".
````

- [ ] **Step 2: Verify the old prose is gone**

Run: `grep -n 'compact markdown rendering' skills/component-builder/SKILL.md`
Expected: no output (exit 1).

- [ ] **Step 3: Commit**

```bash
git add skills/component-builder/SKILL.md
git commit -m "docs(component-builder): explicit template for the Figma description projection"
```

---

### Task 5: Reconnaissance — read the 14 doc cards

**This task writes nothing.** It resolves two questions the renderer work depends on, and its output is recorded in this plan file so Tasks 6–8 can be implemented against measured facts rather than assumptions.

**Requires a live Figma session:** the desktop app open on "Throughline Plugin Test" (`OCiZiGpsJ4ncPD8r205BjC`) with the Desktop Bridge plugin running. Verify with `figma_get_status` before starting, and assert the active file key matches — `figma_execute` targets whichever file is active, which can drift.

**Files:**
- Modify: `docs/superpowers/plans/2026-08-12-doc-card-dogfood-fixes.md` (the Findings block below)

**Interfaces:**
- Consumes: nothing.
- Produces: two decisions — (a) whether intrinsic specimen width is stable across both component-set regimes, which selects Task 6's branch; (b) the positional rule that identifies the header description node, which Task 8 encodes.

- [ ] **Step 1: Confirm the bridge and the active file**

Run the `figma_get_status` tool. Expected: connected, and the active file key is `OCiZiGpsJ4ncPD8r205BjC`. If the key differs, stop — do not run the read against the wrong file.

- [ ] **Step 2: Read every card's band and specimen structure**

Run via `figma_execute` with `timeout: 30000`:

```js
await figma.loadAllPagesAsync();
const cards = figma.root.findAll((n) => n.type === 'FRAME' && /—\s*Documentation$/.test(n.name));
const out = cards.map((card) => {
  const specimen = card.findOne((n) => n.type === 'COMPONENT_SET');
  const kids = specimen ? specimen.children : [];
  const bbox = kids.length
    ? Math.max(...kids.map((c) => c.x + c.width)) - Math.min(...kids.map((c) => c.x))
    : null;
  return {
    card: card.name,
    cardWidth: card.width,
    cardCounterSizing: card.counterAxisSizingMode,
    bands: card.children.map((n) => ({
      name: n.name, type: n.type, width: n.width,
      hSizing: n.layoutSizingHorizontal,
    })),
    specimen: specimen && {
      width: specimen.width,
      layoutMode: specimen.layoutMode,
      hSizing: specimen.layoutSizingHorizontal,
      childCount: kids.length,
      childHSizings: [...new Set(kids.map((c) => c.layoutSizingHorizontal))],
      bboxWidth: bbox,
    },
  };
});
return JSON.stringify(out, null, 2);
```

- [ ] **Step 3: Read every card's header band internals**

Run via `figma_execute` with `timeout: 30000`:

```js
await figma.loadAllPagesAsync();
const cards = figma.root.findAll((n) => n.type === 'FRAME' && /—\s*Documentation$/.test(n.name));
const out = cards.map((card) => {
  const specimen = card.findOne((n) => n.type === 'COMPONENT_SET');
  const header = card.children.find((n) =>
    n.type === 'FRAME' && n.name !== 'Usage'
    && (!specimen || (n.id !== specimen.id && !n.findOne((d) => d.id === specimen.id))));
  return {
    card: card.name,
    headerBand: header ? header.name : null,
    headerChildren: header ? header.children.map((n) => ({
      name: n.name, type: n.type, width: n.width,
      hSizing: n.layoutSizingHorizontal,
      chars: n.type === 'TEXT' ? String(n.characters).slice(0, 60) : undefined,
    })) : null,
  };
});
return JSON.stringify(out, null, 2);
```

- [ ] **Step 4: Record the findings in this file**

Replace the Findings block below with the measured results. Answer both questions explicitly.

```markdown
## Findings from Task 5 (recon)

**Run date:** _(not yet run)_

**Q1 — Is intrinsic specimen width stable across both regimes?**
_(not yet answered — record per-card `layoutMode`, `childHSizings`, and whether
any set has `layoutMode !== 'NONE'` with `FILL` children. If every set is either
`layoutMode: 'NONE'` or has no `FILL` children, the answer is YES.)_

**Decision:** _(YES → Task 6 Branch A. NO → Task 6 Branch B.)_

**Q2 — What positional rule identifies the header description node?**
_(not yet answered — record the header band's name per card, and the shape of
its direct TEXT children. The rule must hold for all 14 cards.)_

**Header band name(s):** _(not yet recorded)_
**Rule:** _(not yet recorded)_
```

- [ ] **Step 5: Commit the findings**

```bash
git add docs/superpowers/plans/2026-08-12-doc-card-dogfood-fixes.md
git commit -m "docs(plan): record doc-card reconnaissance findings"
```

---

## Findings from Task 5 (recon)

**Run date:** _(not yet run)_

**Q1 — Is intrinsic specimen width stable across both regimes?**
_(not yet answered — record per-card `layoutMode`, `childHSizings`, and whether
any set has `layoutMode !== 'NONE'` with `FILL` children. If every set is either
`layoutMode: 'NONE'` or has no `FILL` children, the answer is YES.)_

**Decision:** _(YES → Task 6 Branch A. NO → Task 6 Branch B.)_

**Q2 — What positional rule identifies the header description node?**
_(not yet answered — record the header band's name per card, and the shape of
its direct TEXT children. The rule must hold for all 14 cards.)_

**Header band name(s):** _(not yet recorded)_
**Rule:** _(not yet recorded)_

---

### Task 6: Break the specimen feedback loop

`planDocCard` reads `specimen.width` to derive the column count. The render then widens the `Usage` band, the card's auto-layout hug follows it, and `FILL` siblings — including the `COMPONENT_SET` — follow the card. Measured on Button: 1536 → 2040 across one render. The builder feeds its own next invocation a mutated measurement.

**Implement exactly one branch, selected by the Task 5 Findings decision.** Do not implement both.

**Files (Branch A):**
- Modify: `scripts/lib/doc-card-render.figma.js:74-82`
- Regenerate: `references/doc-card-builder.md`

**Files (Branch B):**
- Modify: `scripts/lib/doc-card-plan.mjs:20-25` and `:42`, `:81`
- Modify: `scripts/lib/doc-card-render.figma.js:74-82`
- Modify: `scripts/lib/doc-card-plan.test.mjs`
- Regenerate: `references/doc-card-builder.md`

**Interfaces:**
- Consumes: `planDocCard(record, specimenWidth, bodyTextStyle)` (Branch A, unchanged) — see Branch B for its replacement signature.
- Produces (Branch A): no signature change. `cardColumns(specimenWidth, unit, maxBlocksPerRow)` keeps its three-parameter form and all existing tests.
- Produces (Branch B): `cardColumns(maxBlocksPerRow) => number` and `planDocCard(record, bodyTextStyle) => plan`. Task 8 calls whichever form lands here.

#### Branch A — intrinsic specimen width (if Q1 answered YES)

- [ ] **Step A1: Replace the measurement**

In `scripts/lib/doc-card-render.figma.js`, replace:

```js
  // Measure the specimen: the card's COMPONENT_SET is the specimen contract —
  // its width drives the column calculation. (No named "Specimen" band lookup:
  // no real card has ever used one, so that path never executed.)
  const specimen = card.findOne((n) => n.type === 'COMPONENT_SET');
  if (!specimen) {
    throw new Error('renderDocCard: no COMPONENT_SET found inside the card — the specimen band must contain the component set');
  }

  const plan = planDocCard(record, specimen.width, { fontSize: bodyTextStyle.fontSize });
```

with:

```js
  // Measure the specimen: the card's COMPONENT_SET is the specimen contract —
  // its width drives the column calculation. (No named "Specimen" band lookup:
  // no real card has ever used one, so that path never executed.)
  const specimen = card.findOne((n) => n.type === 'COMPONENT_SET');
  if (!specimen) {
    throw new Error('renderDocCard: no COMPONENT_SET found inside the card — the specimen band must contain the component set');
  }

  // Measure the VARIANTS, not the frame. This render widens the Usage band, the
  // card hugs it, and every FILL sibling — the specimen included — follows. So
  // specimen.width is a value this render mutates, and reading it feeds the next
  // invocation a measurement its predecessor moved. Variant coordinates do not
  // move when the set is stretched, so the children's bounding box is stable.
  const variants = specimen.children;
  if (!variants || variants.length === 0) {
    throw new Error('renderDocCard: the COMPONENT_SET has no children — cannot measure the specimen');
  }
  const specimenWidth = Math.max(...variants.map((v) => v.x + v.width))
                      - Math.min(...variants.map((v) => v.x));

  const plan = planDocCard(record, specimenWidth, { fontSize: bodyTextStyle.fontSize });
```

- [ ] **Step A2: Regenerate the builder snippet**

Run: `node scripts/build-doc-card-builder.mjs`
Then: `node scripts/build-doc-card-builder.mjs --check`
Expected: `✓ doc-card builder in sync`

- [ ] **Step A3: Run the full suite**

Run: `node --test`
Expected: PASS — the planner is untouched, so all existing `cardColumns` and `planDocCard` tests still hold.

- [ ] **Step A4: Commit**

```bash
git add scripts/lib/doc-card-render.figma.js references/doc-card-builder.md
git commit -m "fix(doc-card): measure the specimen from its variants, not the frame it resizes"
```

#### Branch B — content-only columns (if Q1 answered NO)

- [ ] **Step B1: Write the failing test**

In `scripts/lib/doc-card-plan.test.mjs`, delete the whole existing block — the test named `'cardColumns: clamp(maxBlocksPerRow, 3, ceil(specimenWidth / unit)) — content-capped, width-ceilinged, 3-unit floored'` and all seven of its assertions — and replace it with:

```js
test('cardColumns: content decides, with a floor of 3', () => {
  assert.equal(cardColumns(1), 3);   // sparse record still gets the 3-unit floor
  assert.equal(cardColumns(3), 3);
  assert.equal(cardColumns(4), 4);   // Button: two variant axes + states + a11y
  assert.equal(cardColumns(6), 6);
});

test('planDocCard derives columns from content alone', () => {
  const plan = planDocCard(
    { name: 'Input', description: 'x', whenToUse: ['a'], whenNotToUse: ['b'] },
    { fontSize: 16 },
  );
  assert.equal(plan.columns, 3);
  assert.equal(plan.cardWidth, 3 * plan.columnUnit);
});
```

- [ ] **Step B2: Run test to verify it fails**

Run: `node --test scripts/lib/doc-card-plan.test.mjs`
Expected: FAIL — `cardColumns(1)` returns `3` only by coincidence of the old signature, and `planDocCard` called with two arguments throws or misreads `bodyTextStyle`.

- [ ] **Step B3: Drop the specimen term from the planner**

In `scripts/lib/doc-card-plan.mjs`, replace:

```js
// columns = clamp(max blocks in any row, 3, ceil(specimenWidth / unit)) —
// the grid never exceeds what the content can fill (a wide specimen must not
// mint dead columns), and never drops below the 3-unit floor.
export function cardColumns(specimenWidth, unit, maxBlocksPerRow) {
  return Math.max(3, Math.min(Math.ceil(specimenWidth / unit), maxBlocksPerRow));
}
```

with:

```js
// columns = max(max blocks in any row, 3). Content alone decides: the grid
// never mints a column no row can fill, and never drops below the 3-unit floor.
// The specimen is deliberately NOT an input — the render widens the card, the
// card's hug propagates into FILL siblings including the specimen, so any
// specimen measurement is a value this render mutates and the next one reads.
export function cardColumns(maxBlocksPerRow) {
  return Math.max(3, maxBlocksPerRow);
}
```

Then change the signature at `:42`:

```js
export function planDocCard(record, specimenWidth, bodyTextStyle) {
```

to:

```js
export function planDocCard(record, bodyTextStyle) {
```

and the call at `:81`:

```js
  const columns = cardColumns(specimenWidth, unit, maxBlocksPerRow);
```

to:

```js
  const columns = cardColumns(maxBlocksPerRow);
```

- [ ] **Step B4: Run test to verify it passes**

Run: `node --test scripts/lib/doc-card-plan.test.mjs`
Expected: PASS.

- [ ] **Step B5: Update the renderer's call site**

In `scripts/lib/doc-card-render.figma.js`, replace:

```js
  const plan = planDocCard(record, specimen.width, { fontSize: bodyTextStyle.fontSize });
```

with:

```js
  const plan = planDocCard(record, { fontSize: bodyTextStyle.fontSize });
```

Leave the `specimen` lookup and its throw in place — the card must still contain a component set; it is simply no longer measured.

- [ ] **Step B6: Update the layout contract in the reference**

In `references/figma-component-standards.md`, replace:

```
grid whose text fills its block, not the card — and rebuilds only the `Usage`
```

with:

```
grid whose text fills its block, not the card. The column count comes from the
record's content — the widest row's block count, with a floor of three — and
```

- [ ] **Step B7: Regenerate, run the full suite, and commit**

Run: `node scripts/build-doc-card-builder.mjs`
Run: `node --test`
Expected: PASS.

```bash
git add scripts/lib/doc-card-plan.mjs scripts/lib/doc-card-plan.test.mjs scripts/lib/doc-card-render.figma.js references/figma-component-standards.md references/doc-card-builder.md
git commit -m "fix(doc-card): content decides the column count; the specimen is no longer measured"
```

---

### Task 7: Carry the header content in the plan

The header's text must be under `renderHash` so the stored `render` value describes the whole card, not just the `Usage` band. `renderHash = fnv1a(JSON.stringify(plan))`, so the fields have to be in the plan object before Task 8 writes them.

**Files:**
- Modify: `scripts/lib/doc-card-plan.mjs` (the `planDocCard` return, ~line 83-91)
- Modify: `scripts/lib/doc-card-plan.test.mjs`
- Regenerate: `references/doc-card-builder.md`

**Interfaces:**
- Consumes: `planDocCard` as it stands after Task 6 (either signature).
- Produces: `plan.header = { summary: string, updatedAt: string }`, read by Task 8's renderer. Both fields are always strings — never `undefined` — so `JSON.stringify(plan)` is stable across records that omit them.

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/doc-card-plan.test.mjs`. **Use whichever `planDocCard` signature Task 6 landed** — the three-argument form is shown here; drop the middle argument if Branch B was taken:

```js
test('plan carries the header fields the builder writes', () => {
  const plan = planDocCard(
    { name: 'Button', summary: 'Starts an action.', updatedAt: '2026-08-12', description: 'x' },
    1536, { fontSize: 16 },
  );
  assert.deepEqual(plan.header, { summary: 'Starts an action.', updatedAt: '2026-08-12' });
});

test('plan header is always strings, so the render hash stays stable', () => {
  const plan = planDocCard({ name: 'Button', description: 'x' }, 1536, { fontSize: 16 });
  assert.deepEqual(plan.header, { summary: '', updatedAt: '' });
  assert.doesNotThrow(() => JSON.stringify(plan));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/doc-card-plan.test.mjs`
Expected: FAIL — `plan.header` is `undefined`.

- [ ] **Step 3: Add the header to the plan**

In `scripts/lib/doc-card-plan.mjs`, replace the return statement:

```js
  return {
    rendererVersion: DOC_CARD_RENDERER_VERSION,
    columnUnit: unit,
    columns,
    cardWidth: columns * unit,
    termColumn: Math.round(unit * 0.3),
    rows,
  };
```

with:

```js
  return {
    rendererVersion: DOC_CARD_RENDERER_VERSION,
    columnUnit: unit,
    columns,
    cardWidth: columns * unit,
    termColumn: Math.round(unit * 0.3),
    // The header band's record-derived content. Carried in the plan (not read
    // straight off the record by the renderer) so renderHash describes every
    // string the builder writes onto the card, header included. Always strings:
    // an undefined would drop the key from JSON.stringify and move the hash.
    header: {
      summary: typeof record.summary === 'string' ? record.summary : '',
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    },
    rows,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/doc-card-plan.test.mjs`
Expected: PASS.

- [ ] **Step 5: Regenerate and run the full suite**

Run: `node scripts/build-doc-card-builder.mjs`
Run: `node --test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/doc-card-plan.mjs scripts/lib/doc-card-plan.test.mjs references/doc-card-builder.md
git commit -m "feat(doc-card): carry header summary and date in the plan so renderHash covers them"
```

---

### Task 8: Give the header an owner and flip the contract

Nothing owns the header. The builder rebuilds only the `Usage` band, and the status write-back fires only on a status change — so a component already at `stable` that gets re-voiced keeps its original machinery-voice blurb and its old date forever, above the corrected copy, with `docs:check` green because the header is not a tracked surface. This task makes the builder write it, and makes the contract sentence true in all three places it is authored.

**Files:**
- Modify: `scripts/lib/doc-card-render.figma.js` (after the `Doc Fingerprint` node, before the `return`)
- Modify: `scripts/lib/doc-card-plan.mjs:11` (version bump)
- Modify: `scripts/build-doc-card-builder.mjs:25-26` (contract sentence — the authored source of the generated file)
- Modify: `references/figma-component-standards.md:296-297` (second copy of the same claim)
- Modify: `scripts/lib/doc-card-plan.test.mjs:5-6, :49`, `scripts/build-doc-card-builder.test.mjs:15`, `scripts/docs-check.test.mjs:154-156`
- Regenerate: `references/doc-card-builder.md`

**Interfaces:**
- Consumes: `plan.header.summary` and `plan.header.updatedAt` from Task 7; `plan.columnUnit` for the clamp.
- Produces: `summary.headerWritten: boolean` on the builder's return, so the caller can confirm the header was reached without re-reading the card.

- [ ] **Step 1: Write the header**

In `scripts/lib/doc-card-render.figma.js`, insert immediately after the `Doc Fingerprint` block (`fp.visible = false; usage.appendChild(fp);`) and before the `return {`:

```js
  // The header band's record-derived content. The builder owns this: the status
  // write-back only fires on a status change, so a re-voiced component that is
  // already `stable` would otherwise keep its original blurb and date forever.
  // The status chip is NOT touched — the finalize write-back still owns it.
  const headerBand = card.children.find((n) =>
    n.type === 'FRAME'
    && n.name !== 'Usage'
    && n.id !== specimen.id
    && !n.findOne((d) => d.id === specimen.id));
  if (!headerBand) {
    throw new Error('renderDocCard: no header band found — expected a child frame holding the component name, description, status chip and date');
  }

  // Load a text node's own fonts before writing, and never touch its style:
  // the header's type is card chrome, not part of this projection.
  const writeChars = async (node, chars) => {
    const len = Math.max(1, node.characters.length);
    for (const f of node.getRangeAllFontNames(0, len)) await figma.loadFontAsync(f);
    node.characters = chars;
  };

  // Self-migrating locator: prefer the deterministic name, fall back once to
  // position, then rename so every later run is deterministic. Throw rather
  // than guess — a mis-identified node would overwrite the component name.
  let headerDesc = headerBand.findChild((n) => n.name === 'Header Description');
  if (!headerDesc) {
    const texts = headerBand.children.filter((n) => n.type === 'TEXT' && n.name !== 'Last Updated');
    if (texts.length !== 2) {
      throw new Error('renderDocCard: cannot identify the header description node — expected the component name and the description as the only unnamed text children, found ' + texts.length + '; name the node "Header Description" by hand and re-run');
    }
    headerDesc = texts[1];
    headerDesc.name = 'Header Description';
  }
  await writeChars(headerDesc, plan.header.summary);
  // Re-assert the one-column clamp (figma-component-standards.md): the header
  // description never stretches across a wide matrix.
  headerDesc.textAutoResize = 'HEIGHT';
  headerDesc.resize(plan.columnUnit, headerDesc.height);
  headerDesc.layoutSizingHorizontal = 'FIXED';

  const lastUpdated = headerBand.findChild((n) => n.name === 'Last Updated');
  if (lastUpdated && plan.header.updatedAt) {
    await writeChars(lastUpdated, plan.header.updatedAt);
  }
```

- [ ] **Step 2: Report it in the returned summary**

In the same file, add `headerWritten` to the returned object, immediately after `blocksCreated`:

```js
    blocksCreated,
    headerWritten: true,
```

- [ ] **Step 3: Bump the renderer version**

In `scripts/lib/doc-card-plan.mjs`, change:

```js
export const DOC_CARD_RENDERER_VERSION = '3';
```

to:

```js
export const DOC_CARD_RENDERER_VERSION = '4';
```

- [ ] **Step 4: Make the contract sentence true where it is authored**

In `scripts/build-doc-card-builder.mjs`, replace these two array entries:

```js
  'construction — never hand-build the usage body. The snippet rebuilds ONLY the',
  'frame named `Usage`; the header and specimen bands are never touched.',
```

with:

```js
  'construction — never hand-build the usage body. The builder owns the `Usage`',
  'band and the header\'s record-derived content (its short description and date);',
  'it reads the specimen and never writes it. The status chip keeps its own owner',
  '— the finalize write-back in `references/figma-component-standards.md`.',
```

Then in `references/figma-component-standards.md`, replace:

```
grid whose text fills its block, not the card — and rebuilds only the `Usage`
frame, leaving header and specimen untouched. The header's short-description
```

with:

```
grid whose text fills its block, not the card. It rebuilds the `Usage` frame and
rewrites the header's short description and date from the record; it reads the
specimen and never writes it, and the status chip keeps its own owner (the
finalize write-back below). The header's short-description
```

**Note:** if Task 6 Branch B was taken, its Step B6 already edited the first of these two lines. Apply this edit on top of that result rather than expecting the original text.

- [ ] **Step 5: Update the five assertions that pin version 3**

In `scripts/lib/doc-card-plan.test.mjs`, change the test name and both assertions:

```js
test('DOC_CARD_RENDERER_VERSION is the string "3"', () => {
  assert.equal(DOC_CARD_RENDERER_VERSION, '3');
```

to:

```js
test('DOC_CARD_RENDERER_VERSION is the string "4"', () => {
  assert.equal(DOC_CARD_RENDERER_VERSION, '4');
```

and at `:49`:

```js
  assert.equal(plan.rendererVersion, '3');
```

to:

```js
  assert.equal(plan.rendererVersion, '4');
```

In `scripts/build-doc-card-builder.test.mjs:15`:

```js
  assert.match(md, /const DOC_CARD_RENDERER_VERSION = '3'/);
```

to:

```js
  assert.match(md, /const DOC_CARD_RENDERER_VERSION = '4'/);
```

In `scripts/docs-check.test.mjs`, the fixture at `:154-156` stamps `'3'` and asserts no upgrade is reported; with `expectedRenderer` now `'4'`, that card *is* upgradable. Change:

```js
test('checkAll: a stamped docCard (renderer "3") reports no layout upgrade', () => {
```

to:

```js
test('checkAll: a docCard stamped at the current renderer reports no layout upgrade', () => {
```

and at `:156`, replace the hardcoded `'3'` with the imported constant so this test never pins a version again:

```js
  manifest.components.meta.Button.doc.surfaces.docCard = { src: fp, render: 'whatever', renderer: DOC_CARD_RENDERER_VERSION };
```

`scripts/docs-check.test.mjs` has no import from the planner today — its imports are `./docs-check.mjs` and `./lib/doc-record.mjs`. Add a third, after the `doc-record.mjs` line:

```js
import { DOC_CARD_RENDERER_VERSION } from './lib/doc-card-plan.mjs';
```

Leave `:130` alone — it passes `expectedRenderer: '2'` explicitly against a literal `renderer: '3'`, so it tests the comparison itself and is version-independent.

- [ ] **Step 6: Regenerate and run the full suite**

Run: `node scripts/build-doc-card-builder.mjs`
Run: `node scripts/build-doc-card-builder.mjs --check`
Expected: `✓ doc-card builder in sync`

Run: `node --test`
Expected: PASS, all tests.

- [ ] **Step 7: Verify the false claim is gone everywhere**

Run: `grep -rln 'never touched' references/ scripts/ skills/ commands/`
Expected: exactly two files, both unrelated to the doc-card contract:
- `scripts/lib/doc-card-render.figma.js` — the comment about recreating a component set detaching instances. Specimen-specific; stays true.
- `references/figma-scripting.md` — about a `WIP:` frame leaving the real component alone during a resumed run. Nothing to do with doc cards.

`scripts/build-doc-card-builder.mjs` and `references/doc-card-builder.md` must **not** appear. If the generated file still matches, the regeneration in Step 6 did not run.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/doc-card-render.figma.js scripts/lib/doc-card-plan.mjs scripts/lib/doc-card-plan.test.mjs scripts/build-doc-card-builder.mjs scripts/build-doc-card-builder.test.mjs scripts/docs-check.test.mjs references/figma-component-standards.md references/doc-card-builder.md
git commit -m "feat(doc-card): builder owns the header's record-derived content; renderer 4"
```

---

### Task 9: Validate against the live file

Everything above is proven in Node except the two Figma-side reads and the header write. This task proves them on real cards and demonstrates the feedback loop is closed.

**Requires a live Figma session** on `OCiZiGpsJ4ncPD8r205BjC`, same preflight as Task 5.

**Files:**
- Modify: `docs/superpowers/plans/2026-08-12-doc-card-dogfood-fixes.md` (record the results)

**Interfaces:**
- Consumes: the builder as it stands after Task 8, invoked per `references/doc-card-builder.md`'s call contract.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Preflight**

Run `figma_get_status`; assert the active file key is `OCiZiGpsJ4ncPD8r205BjC`. Capture each target card's current state first, so the before/after comparison is real:

```js
await figma.loadAllPagesAsync();
const names = ['Button', 'Input', 'Card'];
const out = names.map((n) => {
  const card = figma.root.findOne((x) => x.type === 'FRAME' && x.name === n + ' — Documentation');
  const specimen = card && card.findOne((x) => x.type === 'COMPONENT_SET');
  return card && {
    card: n, cardWidth: card.width,
    specimenId: specimen.id, specimenWidth: specimen.width,
    variantCount: specimen.children.length,
  };
});
return JSON.stringify(out, null, 2);
```

- [ ] **Step 2: Render Button, one call**

Follow the call contract in `references/doc-card-builder.md`: load `Button.doc.json`, compute its canonical fingerprint with `node -e` against `scripts/lib/doc-record.mjs`, resolve the nine semantic variables and the `Body/Default` text style, fill the `RECORD` and `CANONICAL_FP` slots, and run one `figma_execute` with `timeout: 30000`.

Expected from the returned summary: `rendererVersion: '4'`, `headerWritten: true`, and a `blocksCreated` list matching the record's populated blocks.

- [ ] **Step 3: Prove idempotency — the loop is closed**

Run the identical call a second time, changing nothing.

Expected: `cardWidth` and `columns` identical to the first run. Then re-run Step 1's capture script and confirm `specimenWidth` is unchanged between the two renders. **This is the proof the feedback loop is closed** — under the old code, Button's specimen moved 1536 → 2040 across a single render.

- [ ] **Step 4: Confirm nothing detached**

Run Step 1's capture script again and compare against its first output: `specimenId` identical, `variantCount` identical (108 for Button, 18 for Input, 2 for Card). Then confirm both of Card's footer Button instances are still attached to the main component rather than detached.

- [ ] **Step 5: Confirm the header actually changed**

Read back the header band of the rendered card and verify the description now matches `record.summary`, the date matches `record.updatedAt`, the node is named `Header Description`, and its width equals the returned `summary.columnUnit`.

- [ ] **Step 6: Repeat for Input and Card**

Run Steps 2–5 for Input and for Card. Card is the important one: it is the small auto-layout component set, so it is the case Task 5's Q1 was about.

- [ ] **Step 7: Confirm the Select Menu guard still refuses**

Read `Select Menu — Documentation` read-only and confirm its bands still include `Usage — Select Menu`, so the foreign-band predicate matches and the builder would throw before mutating. **Do not invoke the renderer on it.**

- [ ] **Step 8: Record results and commit**

Append a "Task 9 validation" section to this plan with the before/after widths, the idempotency result, and the node ids confirmed unchanged.

```bash
git add docs/superpowers/plans/2026-08-12-doc-card-dogfood-fixes.md
git commit -m "docs(plan): record live validation of the doc-card fix batch"
```

---

## Out of scope, noted

Neither is a task in this plan; both are worth filing after it lands.

- **`buildDocCardBuilder` has no name-collision check.** The inlined planner and the renderer share one global scope. A planner export named `fnv1a` would silently overwrite the renderer's hash function at build time; one named `REQUIRED_VARS` would be a `SyntaxError` at `figma_execute` time rather than at build time. This plan adds no planner exports, so it is not exposed.
- **`throughline-sample` is not a faithful install.** It carries an orphan `lib/doc-card-render.figma.js`, five `.test.mjs` files, and a `test:scripts` npm script that no documented install path produces. After Task 3, an install produces a strictly smaller set; the sample should be reconciled to it.
