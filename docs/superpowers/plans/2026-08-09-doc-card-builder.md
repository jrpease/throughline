# Doc-Card Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the improvised, per-run doc-card documentation body with a deterministic, tested builder — a pure layout planner unit-tested in Node, a Figma renderer template stitched into a generated reference snippet, a renderer version stamp in the manifest, and an informational `layout-upgrade-available` classification in `docs:check`.

**Architecture:** A pure planner (`scripts/lib/doc-card-plan.mjs`, zero imports) decides everything testable — block selection, row assignment, column-unit and card-width math. A Figma-API renderer template (`scripts/lib/doc-card-render.figma.js`) walks the plan and makes the plugin-API calls. A build script inlines both into the generated `references/doc-card-builder.md` — the snippet skills hand to `figma_execute` — and a `--check` mode gates CI exactly like the existing adapter check. `docs:check` learns to report old-layout cards informationally via a `renderer` stamp.

**Tech Stack:** Node ≥20 (built-in `node:test`, `node:assert/strict`), zero third-party dependencies. Figma plugin API (dynamic-page mode) via the Figma Console MCP's `figma_execute`. GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-08-09-doc-card-layout-and-voice-design.md` — this is **plan 1 of 2** (the *Layout* phase in the spec's Phasing section). Plan 2 (writing standard, archetype pass, `docs-lint`, authoring-pipeline wiring) is separate; nothing in this plan touches `references/doc-writing-standard.md` or `scripts/docs-lint.mjs`.

## Global Constraints

- **Zero runtime dependencies** in every `scripts/*.mjs` — stdlib only (matches every existing script).
- **`scripts/lib/doc-card-plan.mjs` must have ZERO imports** (not even `node:` builtins) and use only `export const` / `export function` — it is inlined verbatim into the Figma snippet, which runs where no module system exists. The build script enforces this and throws otherwise.
- **Scripts are pure-functions + a CLI guard:** export the logic; guard the CLI with `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)`. Every runnable script has a colocated `*.test.mjs`; tests run via bare `node --test` from the repo root.
- **Column unit (exact):** `columnUnit = clamp(round(bodyFontSize × 30), 280, 480)` px. The body font size comes from the user's `Body/Default` text style.
- **Card width (exact):** `cardWidth = max(specimenWidth, 3 × columnUnit)` rounded UP to a whole unit — i.e. `columns = max(3, ceil(specimenWidth / columnUnit))`, `cardWidth = columns × columnUnit`.
- **Definition term column:** `round(columnUnit × 0.3)`; long terms wrap, never truncate.
- **Eyebrow chrome (exact):** derived from `Body/Default` — `fontSize × 0.65` rounded, minimum 8; weight Bold (fall back to the body style's own weight if the family has no Bold); uppercase; letter-spacing +8%.
- **Deterministic node names:** `Usage`, `Usage Row 1..3` (canonical numbering — an absent row's number is skipped, never renumbered), `Block: <Eyebrow>` (e.g. `Block: Overview`, `Block: Do`, `Block: Don't`, `Block: What each variant means`, `Block: Accessibility`), `Row Divider`, `Doc Fingerprint`.
- **Bind-or-throw:** colors and the `Body/Default` content type style resolve to the user's variables/styles or the builder throws — never a hex/px fallback. The two documented exceptions (layout chrome, not design values): the computed column unit, and the derived eyebrow type.
- **Rebuild scope:** the builder removes and rebuilds ONLY the frame named `Usage`. Header and specimen are never touched (delete-and-recreate of a component set detaches downstream instances — `skills/component-builder/SKILL.md:347-351`).
- **Row alignment:** every usage row sets `counterAxisAlignItems = "MIN"` AND `primaryAxisAlignItems = "MIN"` (top-aligned, left-packed — never center or space-between).
- **Renderer version:** `DOC_CARD_RENDERER_VERSION = '2'`, exported from `scripts/lib/doc-card-plan.mjs` — the single source; `docs-check.mjs` imports it; the build script inlines it into the generated snippet.
- **`figma_execute` discipline** (from `references/figma-scripting.md`): async APIs only (`getNodeByIdAsync`, `setTextStyleIdAsync`); set the text style/font BEFORE writing `.characters`; load all fonts up front; explicit `timeout` (~30s cap); after any `resize()` on an auto-layout frame, re-assert the sizing modes (VERTICAL frames: counter = width, primary = height); seed bound paints with a light-gray approximation, never pure black.
- **CI gates that must stay green:** `node --test`, `node ci/validate-plugin.mjs`, `node ci/validate-skills.mjs`, `node scripts/adapters/generate.mjs --check` — plus, after Task 6, `node scripts/build-doc-card-builder.mjs --check`.
- **Any skill/command edit REQUIRES regenerating adapters** (`node scripts/adapters/generate.mjs`) and committing the regenerated `adapters/` tree, or CI's `--check` fails.
- **Branch:** all work lands on `feat/doc-card-builder` (created in Task 1).

---

## Interface contracts (used by every task — read first)

**Planner** (pure, inlinable, Node-tested):

```
planDocCard(record, specimenWidth, bodyTextStyle) → plan
  record        — a parsed .doc.json record (see references/component-doc-schema.md)
  specimenWidth — number, px (measured in Figma at run time)
  bodyTextStyle — { fontSize: number }  (only fontSize is read; passing a full
                  Figma TextStyle object is fine)

plan = {
  rendererVersion: '2',
  columnUnit: number,       // clamp(round(fontSize×30), 280, 480)
  columns: number,          // max(3, ceil(specimenWidth / columnUnit))
  cardWidth: number,        // columns × columnUnit
  termColumn: number,       // round(columnUnit × 0.3)
  rows: [ { name: 'Usage Row 1'|'Usage Row 2'|'Usage Row 3', blocks: [Block] } ],
                            // empty rows omitted; names keep canonical numbers
}

Block =
  { type: 'prose',      name: 'Block: Overview',            eyebrow: 'Overview',            text: string }
| { type: 'list',       name: 'Block: <Eyebrow>',           eyebrow: string,                items: string[] }
| { type: 'list-tone',  name: 'Block: Do'|"Block: Don't",   eyebrow: '✓ Do'|"✕ Don't",      tone: 'positive'|'negative', items: string[] }
| { type: 'definition', name: 'Block: What each <x> means', eyebrow: 'What each <x> means', terms: [{ term: string, meaning: string }] }
```

Row composition (spec §"Three rows, wrapping independently"):
- **Usage Row 1:** Overview (`description`) · When to use (`whenToUse`) · When not to use (`whenNotToUse`)
- **Usage Row 2:** Do (`dos`) · Don't (`donts`)
- **Usage Row 3:** one definition block per `variants` axis in key order (`What each <axis> means`), then `What each state means` (`states`), then Accessibility (`accessibility.keyboard` entries followed by `accessibility.notes`; `accessibility.role` is not rendered — it lives in the description field/MDX surfaces)

**Renderer** (Figma-API, inlined into the generated snippet, never imported):

```
renderDocCard({ card, record, vars, bodyTextStyle }) → summary   (async)
  card          — the doc-card FrameNode (caller resolves via getNodeByIdAsync)
  record        — the parsed .doc.json record
  vars          — map of resolved Figma Variable OBJECTS (not ids), all 9 required:
                  textDefault, textMuted, tonePositive, toneNegative, border,
                  spacePadding, spaceRowGap, spaceBlockGap, spaceItemGap
  bodyTextStyle — the user's Body/Default TextStyle (caller finds it by name;
                  renderer throws if missing)

summary = {
  rendererVersion: '2', columnUnit, columns, cardWidth,
  rowsRendered: number, blocksCreated: string[],   // the Block names, in order
  fingerprint: string,   // CANONICAL_FP (snippet slot, filled by the caller)
  renderHash: string,    // fnv1a(JSON.stringify(plan)) — 8 hex chars
}
```

The snippet has two **slots** the calling agent fills before executing:
`const RECORD = <parsed .doc.json>;` and `const CANONICAL_FP = '<fp>';` where
`<fp>` is `canonicalFingerprint(RECORD)` computed in Node via
`scripts/lib/doc-record.mjs` (sha256 is unavailable inside the Figma sandbox, so
the canonical fingerprint is computed outside and passed in; the render hash uses
in-snippet FNV-1a, which only ever compares against itself).

**Manifest stamping (the skill writes this from the summary, never by re-reading
the card):** `components.meta[<Name>].doc.surfaces.docCard = { src: summary.fingerprint, render: summary.renderHash, renderer: summary.rendererVersion }`.

---

## Task 1: Planner — renderer version, column unit, card width

**Files:**
- Create: `scripts/lib/doc-card-plan.mjs`
- Create: `scripts/lib/doc-card-plan.test.mjs`

**Interfaces:**
- Consumes: nothing (pure module, zero imports).
- Produces: `DOC_CARD_RENDERER_VERSION` (`'2'`, string), `columnUnit(bodyFontSize) → number`, `cardColumns(specimenWidth, unit) → number`. Task 2 adds `planDocCard` to this same file; Task 3 imports `DOC_CARD_RENDERER_VERSION`; Task 5 inlines the whole file.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/doc-card-builder
```

- [ ] **Step 2: Write the failing test**

Create `scripts/lib/doc-card-plan.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOC_CARD_RENDERER_VERSION, columnUnit, cardColumns } from './doc-card-plan.mjs';

test('DOC_CARD_RENDERER_VERSION is the string "2"', () => {
  assert.equal(DOC_CARD_RENDERER_VERSION, '2');
});

test('columnUnit: clamp(round(fontSize × 30), 280, 480)', () => {
  assert.equal(columnUnit(14), 420);  // 14 × 30 = 420, inside the clamp
  assert.equal(columnUnit(16), 480);  // 16 × 30 = 480, exactly the ceiling
  assert.equal(columnUnit(9), 280);   // 270 clamps up to the floor
  assert.equal(columnUnit(20), 480);  // 600 clamps down to the ceiling
  assert.equal(columnUnit(13.5), 405); // rounds: 13.5 × 30 = 405
});

test('cardColumns: max(3, ceil(specimenWidth / unit)) — width rounds UP to whole units', () => {
  assert.equal(cardColumns(1500, 420), 4); // ceil(3.57) = 4
  assert.equal(cardColumns(1260, 420), 3); // exact multiple stays 3
  assert.equal(cardColumns(200, 480), 3);  // narrow specimen: 3-unit floor
  assert.equal(cardColumns(0, 480), 3);    // degenerate specimen still floors at 3
});
```

- [ ] **Step 3: Run the test — verify it fails**

```bash
node --test scripts/lib/doc-card-plan.test.mjs
```

Expected failure: `Cannot find module … doc-card-plan.mjs` (the module doesn't exist yet).

- [ ] **Step 4: Implement**

Create `scripts/lib/doc-card-plan.mjs`:

```js
// Pure layout planner for the component doc card's Usage band.
// ZERO imports, `export const`/`export function` only — this module is inlined
// verbatim into the generated Figma snippet (references/doc-card-builder.md) by
// build-doc-card-builder.mjs, so it must run in both Node and the Figma plugin
// sandbox. build-doc-card-builder.mjs enforces the no-imports rule.
//
// Layout contract: docs/superpowers/specs/2026-08-09-doc-card-layout-and-voice-design.md

// Single source of truth for the doc-card layout version. Imported by
// docs-check.mjs and embedded (via inlining) into the generated builder snippet.
export const DOC_CARD_RENDERER_VERSION = '2';

// columnUnit = clamp(round(bodyFontSize × 30), 280, 480) px.
// 30 ≈ 60ch × ~0.5em average glyph width for UI text faces. Layout chrome, not
// a design value — the one documented exception to the no-hardcoded-px rule.
export function columnUnit(bodyFontSize) {
  return Math.min(480, Math.max(280, Math.round(bodyFontSize * 30)));
}

// cardWidth = max(specimenWidth, 3 units) rounded UP to a whole unit.
export function cardColumns(specimenWidth, unit) {
  return Math.max(3, Math.ceil(specimenWidth / unit));
}
```

- [ ] **Step 5: Run the test — verify it passes**

```bash
node --test scripts/lib/doc-card-plan.test.mjs
```

Expected: all 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/doc-card-plan.mjs scripts/lib/doc-card-plan.test.mjs
git commit -m "feat(docs): doc-card layout planner — renderer version, column unit, card width"
```

---

## Task 2: Planner — block selection and row assignment

**Files:**
- Modify: `scripts/lib/doc-card-plan.mjs` (append `planDocCard` after `cardColumns`)
- Modify: `scripts/lib/doc-card-plan.test.mjs` (append tests)

**Interfaces:**
- Consumes: `columnUnit`, `cardColumns` (Task 1, same file).
- Produces: `planDocCard(record, specimenWidth, bodyTextStyle) → plan` with the exact plan/Block shapes from *Interface contracts* above. Tasks 4–5 inline it; the renderer walks `plan.rows`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/doc-card-plan.test.mjs` (add `planDocCard` to the existing import):

```js
import { planDocCard } from './doc-card-plan.mjs';

const FULL_RECORD = {
  name: 'Button',
  summary: 'Triggers an action or event.',
  description: 'A clickable control that starts an action.',
  whenToUse: ['Something happens on the current page'],
  whenNotToUse: ['Moving to another page or URL. Use a Link instead.'],
  variants: {
    variant: { default: 'The one main action in a view.', secondary: 'Sits alongside a main action.' },
    size: { sm: 'Dense layouts and toolbars.', md: 'The default size.' },
  },
  states: { hover: 'The pointer is over the button.', disabled: "Can't be clicked or tabbed to." },
  dos: ['Start the label with a verb.'],
  donts: ["Don't use a button to navigate. Use a Link."],
  accessibility: {
    role: 'button',
    keyboard: ['Enter and Space activate it.'],
    notes: ['An icon-only button needs an aria-label so screen readers can announce it.'],
  },
};

test('planDocCard: full record → three rows with the canonical block layout', () => {
  const plan = planDocCard(FULL_RECORD, 1500, { fontSize: 14 });
  assert.equal(plan.rendererVersion, '2');
  assert.equal(plan.columnUnit, 420);
  assert.equal(plan.columns, 4);          // ceil(1500 / 420)
  assert.equal(plan.cardWidth, 1680);     // 4 × 420
  assert.equal(plan.termColumn, 126);     // round(420 × 0.3)
  assert.deepEqual(plan.rows.map((r) => r.name), ['Usage Row 1', 'Usage Row 2', 'Usage Row 3']);
  assert.deepEqual(plan.rows[0].blocks.map((b) => b.name),
    ['Block: Overview', 'Block: When to use', 'Block: When not to use']);
  assert.deepEqual(plan.rows[1].blocks.map((b) => [b.name, b.tone]),
    [['Block: Do', 'positive'], ["Block: Don't", 'negative']]);
  assert.deepEqual(plan.rows[2].blocks.map((b) => b.name), [
    'Block: What each variant means',   // one definition block per variants axis, in key order
    'Block: What each size means',
    'Block: What each state means',
    'Block: Accessibility',
  ]);
});

test('planDocCard: definition terms preserve key order; accessibility = keyboard then notes, role dropped', () => {
  const plan = planDocCard(FULL_RECORD, 1500, { fontSize: 14 });
  const variantBlock = plan.rows[2].blocks[0];
  assert.equal(variantBlock.type, 'definition');
  assert.deepEqual(variantBlock.terms, [
    { term: 'default', meaning: 'The one main action in a view.' },
    { term: 'secondary', meaning: 'Sits alongside a main action.' },
  ]);
  const a11y = plan.rows[2].blocks[3];
  assert.equal(a11y.type, 'list');
  assert.deepEqual(a11y.items, [
    'Enter and Space activate it.',
    'An icon-only button needs an aria-label so screen readers can announce it.',
  ]);
});

test('planDocCard: tone blocks carry the glyph eyebrows, plain deterministic names', () => {
  const plan = planDocCard(FULL_RECORD, 1500, { fontSize: 14 });
  assert.deepEqual(plan.rows[1].blocks.map((b) => b.eyebrow), ['✓ Do', "✕ Don't"]);
});

test('planDocCard: sparse record → only Usage Row 1 with Overview; empty rows collapse', () => {
  const plan = planDocCard(
    { name: 'Badge', summary: 's', description: 'A small label.' }, 200, { fontSize: 16 },
  );
  assert.equal(plan.columnUnit, 480);
  assert.equal(plan.columns, 3);         // 3-unit floor
  assert.equal(plan.cardWidth, 1440);
  assert.deepEqual(plan.rows.map((r) => r.name), ['Usage Row 1']);
  assert.deepEqual(plan.rows[0].blocks.map((b) => b.name), ['Block: Overview']);
});

test('planDocCard: row names keep canonical numbers when an earlier row is absent', () => {
  const plan = planDocCard(
    { name: 'X', summary: 's', description: '', states: { hover: 'Pointer over it.' } },
    200, { fontSize: 16 },
  );
  // No description/whenToUse (row 1 empty), no dos/donts (row 2 empty) — the
  // states row is still named Usage Row 3, never renumbered.
  assert.deepEqual(plan.rows.map((r) => r.name), ['Usage Row 3']);
});

test('planDocCard: empty arrays and empty objects are skipped like absent fields', () => {
  const plan = planDocCard(
    { name: 'X', summary: 's', description: 'd', whenToUse: [], variants: {}, dos: [] },
    200, { fontSize: 16 },
  );
  assert.deepEqual(plan.rows.map((r) => r.name), ['Usage Row 1']);
  assert.deepEqual(plan.rows[0].blocks.map((b) => b.name), ['Block: Overview']);
});
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
node --test scripts/lib/doc-card-plan.test.mjs
```

Expected failure: `planDocCard` is not exported (SyntaxError on the named import).

- [ ] **Step 3: Implement**

Append to `scripts/lib/doc-card-plan.mjs`:

```js
function listBlock(eyebrow, items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return { type: 'list', name: `Block: ${eyebrow}`, eyebrow, items };
}

function definitionBlock(eyebrow, meanings) {
  const terms = Object.keys(meanings || {}).map((k) => ({ term: k, meaning: meanings[k] }));
  if (terms.length === 0) return null;
  return { type: 'definition', name: `Block: ${eyebrow}`, eyebrow, terms };
}

// The whole layout decision, as data. Rows keep canonical numbering (an absent
// row's number is skipped, never renumbered) so node names stay stable across
// sparse records. bodyTextStyle: only .fontSize is read — passing a full Figma
// TextStyle object is fine.
export function planDocCard(record, specimenWidth, bodyTextStyle) {
  const unit = columnUnit(bodyTextStyle.fontSize);
  const columns = cardColumns(specimenWidth, unit);

  const row1 = [];
  if (typeof record.description === 'string' && record.description.trim() !== '') {
    row1.push({ type: 'prose', name: 'Block: Overview', eyebrow: 'Overview', text: record.description });
  }
  const whenTo = listBlock('When to use', record.whenToUse);
  if (whenTo) row1.push(whenTo);
  const whenNot = listBlock('When not to use', record.whenNotToUse);
  if (whenNot) row1.push(whenNot);

  const row2 = [];
  if (Array.isArray(record.dos) && record.dos.length) {
    row2.push({ type: 'list-tone', name: 'Block: Do', eyebrow: '✓ Do', tone: 'positive', items: record.dos });
  }
  if (Array.isArray(record.donts) && record.donts.length) {
    row2.push({ type: 'list-tone', name: "Block: Don't", eyebrow: "✕ Don't", tone: 'negative', items: record.donts });
  }

  const row3 = [];
  for (const axis of Object.keys(record.variants || {})) {
    const block = definitionBlock(`What each ${axis} means`, record.variants[axis]);
    if (block) row3.push(block);
  }
  const stateBlock = definitionBlock('What each state means', record.states);
  if (stateBlock) row3.push(stateBlock);
  const a11y = record.accessibility || {};
  // role is not rendered on the card — it lives in the description field / MDX.
  const a11yBlock = listBlock('Accessibility', [...(a11y.keyboard || []), ...(a11y.notes || [])]);
  if (a11yBlock) row3.push(a11yBlock);

  const rows = [
    { name: 'Usage Row 1', blocks: row1 },
    { name: 'Usage Row 2', blocks: row2 },
    { name: 'Usage Row 3', blocks: row3 },
  ].filter((r) => r.blocks.length > 0);

  return {
    rendererVersion: DOC_CARD_RENDERER_VERSION,
    columnUnit: unit,
    columns,
    cardWidth: columns * unit,
    termColumn: Math.round(unit * 0.3),
    rows,
  };
}
```

- [ ] **Step 4: Run the tests — verify they pass**

```bash
node --test scripts/lib/doc-card-plan.test.mjs
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/doc-card-plan.mjs scripts/lib/doc-card-plan.test.mjs
git commit -m "feat(docs): doc-card planner — block selection and row assignment"
```

---

## Task 3: `docs:check` — the `layout-upgrade-available` classification

**Files:**
- Modify: `scripts/docs-check.mjs` — header comment (line 5), `classifySurface` (line 21), the surface loop in `checkComponent` (line 60), the info print in `main()` (line 92). The `FAILING` set (line 75) is NOT modified.
- Modify: `scripts/docs-check.test.mjs` (append tests)

**Interfaces:**
- Consumes: `DOC_CARD_RENDERER_VERSION` from `scripts/lib/doc-card-plan.mjs` (Task 1).
- Produces: `classifySurface({ …, expectedRenderer })` — a new optional param, `null` by default (existing call sites unaffected). When set and `surface.renderer` is missing or numerically lower, the flags include `'layout-upgrade-available'`. `checkComponent` passes `expectedRenderer` only for the `docCard` surface.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/docs-check.test.mjs`:

```js
test('classifySurface: layout-upgrade-available when docCard renderer is missing', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'a', surface: { src: 'a', render: 'r' }, currentRenderHash: 'r', expectedRenderer: '2' }),
    ['layout-upgrade-available'],
  );
});

test('classifySurface: layout-upgrade-available when renderer is lower; silent when equal or higher', () => {
  const base = { currentCanonical: 'a', currentRenderHash: 'r' };
  assert.deepEqual(
    classifySurface({ ...base, surface: { src: 'a', render: 'r', renderer: '1' }, expectedRenderer: '2' }),
    ['layout-upgrade-available'],
  );
  assert.deepEqual(
    classifySurface({ ...base, surface: { src: 'a', render: 'r', renderer: '2' }, expectedRenderer: '2' }),
    [],
  );
  assert.deepEqual(
    classifySurface({ ...base, surface: { src: 'a', render: 'r', renderer: '3' }, expectedRenderer: '2' }),
    [],
  );
});

test('classifySurface: no renderer check when expectedRenderer is null (non-docCard surfaces)', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'a', surface: { src: 'a', render: 'r' }, currentRenderHash: 'r' }),
    [],
  );
});

test('checkAll: an old-layout docCard is informational, never in the failing set', () => {
  const { root, manifest, fp } = fixture();
  manifest.components.meta.Button.doc.surfaces.docCard = { src: fp, render: 'whatever' };
  const results = checkAll(manifest, root);
  const docCard = results.find((r) => r.surface === 'docCard');
  assert.ok(docCard, 'docCard surface should be reported');
  assert.ok(docCard.flags.includes('layout-upgrade-available'));
  // Every docCard flag must be informational — none from the failing set.
  const failing = new Set(['canonical-changed', 'stale', 'edited', 'missing-record', 'missing-surface']);
  assert.ok(docCard.flags.every((f) => !failing.has(f)), `unexpected failing flag in ${docCard.flags.join(',')}`);
});

test('checkAll: a stamped docCard (renderer "2") reports no layout upgrade', () => {
  const { root, manifest, fp } = fixture();
  manifest.components.meta.Button.doc.surfaces.docCard = { src: fp, render: 'whatever', renderer: '2' };
  const results = checkAll(manifest, root);
  const docCard = results.find((r) => r.surface === 'docCard');
  // Still edit-unverified (the CLI can't read Figma), but no layout flag.
  assert.ok(!docCard || !docCard.flags.includes('layout-upgrade-available'));
});
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
node --test scripts/docs-check.test.mjs
```

Expected: the first two new `classifySurface` renderer tests and the first new `checkAll` test fail (`layout-upgrade-available` never appears — `expectedRenderer` is silently ignored as an unknown property). The `expectedRenderer`-null test and the stamped-docCard test pass even now (they assert absences) — they are regression guards. The existing 9 tests still pass.

- [ ] **Step 3: Implement**

In `scripts/docs-check.mjs`:

**(a)** Replace the drift-class comment (lines 5–9):

```js
// Drift classes: canonical-changed | stale | edited | missing-surface | edit-unverified
//                | layout-upgrade-available
// (edit-unverified = a surface the CLI cannot read, e.g. Figma — informational;
//  it is checked live by the Figma-connected skill instead.
//  missing-surface = a repo surface that declares a file which is now gone — failing;
//  distinct from edit-unverified, which has no file to read in the first place.
//  layout-upgrade-available = informational, docCard only: the card's layout
//  predates DOC_CARD_RENDERER_VERSION — re-render on next touch, never a failure.)
```

**(b)** Add the import (after line 16, below the existing `doc-record.mjs` import):

```js
import { DOC_CARD_RENDERER_VERSION } from './lib/doc-card-plan.mjs';
```

**(c)** Replace `classifySurface` (lines 21–32):

```js
export function classifySurface({ currentCanonical, surface, currentRenderHash, fileMissing = false, expectedRenderer = null }) {
  const flags = [];
  if (surface.src !== currentCanonical) flags.push('stale');
  if (fileMissing) {
    flags.push('missing-surface');
  } else if (currentRenderHash === null) {
    flags.push('edit-unverified');
  } else if (surface.render !== currentRenderHash) {
    flags.push('edited');
  }
  if (expectedRenderer !== null
      && (!surface.renderer || Number(surface.renderer) < Number(expectedRenderer))) {
    flags.push('layout-upgrade-available');
  }
  return flags;
}
```

**(d)** In `checkComponent`, replace the `classifySurface` call (line 60):

```js
    const flags = classifySurface({
      currentCanonical, surface, currentRenderHash, fileMissing,
      expectedRenderer: surfaceName === 'docCard' ? DOC_CARD_RENDERER_VERSION : null,
    });
```

**(e)** In `main()`, replace the info print (line 92) so the Figma-session suffix only appears where it applies:

```js
  for (const r of info) {
    const note = r.flags.includes('edit-unverified') ? ' (check in a Figma session)' : '';
    console.log(`  ~ ${r.name} · ${r.surface}: ${r.flags.join(', ')}${note}`);
  }
```

Wait — step 1's new `classifySurface` tests pass a `currentRenderHash` that matches `render`, so `edit-unverified`/`edited` don't fire and the renderer flag is isolated. The `checkAll` docCard tests exercise the real path where `currentRenderHash` is `null` (Figma surface), so `edit-unverified` co-occurs — that's why the first `checkAll` assertion checks `includes`, not `deepEqual`.

- [ ] **Step 4: Run the full suite — verify everything passes**

```bash
node --test
```

Expected: all tests pass (the 5 new ones and every pre-existing test across the repo).

- [ ] **Step 5: Commit**

```bash
git add scripts/docs-check.mjs scripts/docs-check.test.mjs
git commit -m "feat(docs): informational layout-upgrade-available classification in docs:check"
```

---

## Task 4: The Figma renderer template

**Files:**
- Create: `scripts/lib/doc-card-render.figma.js`

**Interfaces:**
- Consumes: `planDocCard`, `DOC_CARD_RENDERER_VERSION` — NOT via import: the build script (Task 5) concatenates the planner source above this template, so the template references them as in-scope globals. It also references two slot constants the calling agent defines: `RECORD` (unused by the template itself — the caller passes it into `renderDocCard`) and `CANONICAL_FP`.
- Produces: `renderDocCard({ card, record, vars, bodyTextStyle }) → summary` (shapes in *Interface contracts*), plus `fnv1a(str) → 8-hex-char string`. This file is plain text to Node — never imported, never tested directly; it is validated by `node --check` (syntax) here and by the build test (Task 5).

- [ ] **Step 1: Write the template**

Create `scripts/lib/doc-card-render.figma.js`:

```js
// Figma plugin-API renderer for the doc-card Usage band. This file is NOT a
// Node module — build-doc-card-builder.mjs concatenates it after the inlined
// planner (doc-card-plan.mjs) into references/doc-card-builder.md, and the
// result runs inside figma_execute (dynamic-page mode). Constraints honored
// here (see references/figma-scripting.md): async APIs only, style/font set
// BEFORE .characters, fonts loaded up front, resize() sizing modes re-asserted,
// bound paints seeded light-gray (never pure black).
//
// In-scope globals when assembled: planDocCard, DOC_CARD_RENDERER_VERSION
// (inlined planner) and the caller-filled slots RECORD, CANONICAL_FP.

// 32-bit FNV-1a — the render hash. Only ever compared against itself (the
// manifest's surfaces.docCard.render), so it does not need to match the
// sha256-based canonical fingerprint, which cannot run in the Figma sandbox.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const REQUIRED_VARS = [
  'textDefault', 'textMuted', 'tonePositive', 'toneNegative', 'border',
  'spacePadding', 'spaceRowGap', 'spaceBlockGap', 'spaceItemGap',
];

// Bound paint, seeded with a light-gray approximation — a failed/late bind must
// never render pure black (reads as accidental dark mode).
function boundPaint(variable) {
  return figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.87 } }, 'color', variable,
  );
}

async function renderDocCard({ card, record, vars, bodyTextStyle }) {
  // Bind-or-throw: a missing variable or style is a gap in the token set —
  // never fall back to a hex/px.
  for (const key of REQUIRED_VARS) {
    if (!vars || !vars[key]) {
      throw new Error('renderDocCard: missing required variable "' + key
        + '" — resolve it via figma_get_variables / getVariableByIdAsync and pass the Variable object in vars');
    }
  }
  if (!bodyTextStyle) {
    throw new Error('renderDocCard: bodyTextStyle is required — find the "Body/Default" text style via getLocalTextStylesAsync');
  }

  // Fonts, up front — before any text node exists. Eyebrow chrome is Bold of
  // the body family; fall back to the body style's own font if no Bold exists.
  const bodyFont = bodyTextStyle.fontName;
  await figma.loadFontAsync(bodyFont);
  let eyebrowFont = { family: bodyFont.family, style: 'Bold' };
  try { await figma.loadFontAsync(eyebrowFont); } catch (e) { eyebrowFont = bodyFont; }

  // Measure the specimen: the band named "Specimen", or (older cards) the
  // component set inside the card.
  const specimen = card.findChild((n) => n.name === 'Specimen')
    || card.findOne((n) => n.type === 'COMPONENT_SET');
  if (!specimen) {
    throw new Error('renderDocCard: no "Specimen" frame or COMPONENT_SET found inside the card');
  }

  const plan = planDocCard(record, specimen.width, { fontSize: bodyTextStyle.fontSize });

  // Eyebrow chrome (derived, not bound — layout chrome like the column unit):
  // fontSize × 0.65 rounded, min 8; Bold; uppercase; letter-spacing +8%.
  const eyebrowSize = Math.max(8, Math.round(bodyTextStyle.fontSize * 0.65));

  // Idempotent + scoped: rebuild ONLY the Usage frame. Header and specimen are
  // never touched — recreating a component set detaches downstream instances.
  const existing = card.findChild((n) => n.name === 'Usage');
  if (existing) existing.remove();

  const eyebrowText = (chars, colorVar) => {
    const t = figma.createText();
    t.fontName = eyebrowFont;          // loaded above — set BEFORE .characters
    t.fontSize = eyebrowSize;
    t.letterSpacing = { value: 8, unit: 'PERCENT' };
    t.textCase = 'UPPER';
    t.characters = chars;
    t.fills = [boundPaint(colorVar)];
    return t;
  };

  const bodyText = async (chars, colorVar) => {
    const t = figma.createText();
    await t.setTextStyleIdAsync(bodyTextStyle.id);  // style BEFORE characters
    t.characters = chars;
    t.fills = [boundPaint(colorVar)];
    return t;
  };

  // Appends `t` to `parent` as a full-width, height-hugging text node.
  const fillWidth = (parent, t) => {
    parent.appendChild(t);
    t.textAutoResize = 'HEIGHT';
    t.layoutSizingHorizontal = 'FILL';
  };

  const usage = figma.createFrame();
  usage.name = 'Usage';
  usage.layoutMode = 'VERTICAL';
  usage.fills = [];
  card.appendChild(usage);
  usage.resize(plan.cardWidth, usage.height);
  usage.counterAxisSizingMode = 'FIXED';  // VERTICAL frame: counter = width
  usage.primaryAxisSizingMode = 'AUTO';   // height hugs — re-asserted after resize()
  usage.setBoundVariable('paddingLeft', vars.spacePadding);
  usage.setBoundVariable('paddingRight', vars.spacePadding);
  usage.setBoundVariable('paddingTop', vars.spacePadding);
  usage.setBoundVariable('paddingBottom', vars.spacePadding);
  usage.setBoundVariable('itemSpacing', vars.spaceRowGap);

  // If the card is narrower than the computed width and not hugging, widen it —
  // this touches only the card's own size, never its children.
  if (card.width < plan.cardWidth && !(card.layoutMode === 'VERTICAL' && card.counterAxisSizingMode === 'AUTO')) {
    card.resize(plan.cardWidth, card.height);
    if (card.layoutMode === 'VERTICAL') card.primaryAxisSizingMode = 'AUTO';
  }

  const blocksCreated = [];
  let first = true;
  for (const row of plan.rows) {
    if (!first) {
      const divider = figma.createFrame();
      divider.name = 'Row Divider';
      divider.fills = [boundPaint(vars.border)];
      usage.appendChild(divider);
      divider.layoutSizingHorizontal = 'FILL';
      divider.resize(divider.width, 1);
    }
    first = false;

    const rowFrame = figma.createFrame();
    rowFrame.name = row.name;
    rowFrame.layoutMode = 'HORIZONTAL';
    rowFrame.layoutWrap = 'WRAP';
    rowFrame.fills = [];
    rowFrame.counterAxisAlignItems = 'MIN';  // top-aligned…
    rowFrame.primaryAxisAlignItems = 'MIN';  // …left-packed; never center/space-between
    usage.appendChild(rowFrame);
    rowFrame.layoutSizingHorizontal = 'FILL';
    rowFrame.layoutSizingVertical = 'HUG';
    rowFrame.setBoundVariable('itemSpacing', vars.spaceBlockGap);
    rowFrame.setBoundVariable('counterAxisSpacing', vars.spaceRowGap);

    for (const block of row.blocks) {
      const bf = figma.createFrame();
      bf.name = block.name;
      bf.layoutMode = 'VERTICAL';
      bf.fills = [];
      rowFrame.appendChild(bf);
      bf.resize(plan.columnUnit, bf.height);   // every block is exactly one unit wide
      bf.counterAxisSizingMode = 'FIXED';
      bf.primaryAxisSizingMode = 'AUTO';
      bf.setBoundVariable('itemSpacing', vars.spaceItemGap);

      const eyebrowColor = block.type === 'list-tone'
        ? (block.tone === 'positive' ? vars.tonePositive : vars.toneNegative)
        : vars.textMuted;
      const eb = eyebrowText(block.eyebrow, eyebrowColor);
      bf.appendChild(eb);
      eb.textAutoResize = 'HEIGHT';
      eb.layoutSizingHorizontal = 'FILL';

      if (block.type === 'prose') {
        fillWidth(bf, await bodyText(block.text, vars.textDefault));
      } else if (block.type === 'list' || block.type === 'list-tone') {
        for (const item of block.items) {
          fillWidth(bf, await bodyText('• ' + item, vars.textDefault));
        }
      } else if (block.type === 'definition') {
        for (const pair of block.terms) {
          const pf = figma.createFrame();
          pf.name = 'Definition: ' + pair.term;
          pf.layoutMode = 'HORIZONTAL';
          pf.fills = [];
          bf.appendChild(pf);
          pf.layoutSizingHorizontal = 'FILL';
          pf.layoutSizingVertical = 'HUG';
          pf.setBoundVariable('itemSpacing', vars.spaceItemGap);
          const term = await bodyText(pair.term, vars.textDefault);
          pf.appendChild(term);
          term.textAutoResize = 'HEIGHT';        // long terms wrap, never truncate
          term.resize(plan.termColumn, term.height);
          term.layoutSizingHorizontal = 'FIXED'; // fixed term column: 30% of the unit
          const meaning = await bodyText(pair.meaning, vars.textMuted);
          pf.appendChild(meaning);
          meaning.textAutoResize = 'HEIGHT';
          meaning.layoutSizingHorizontal = 'FILL';
        }
      }
      blocksCreated.push(block.name);
    }
  }

  // Metadata node — hidden, machine-read by the drift check's Figma-side pass.
  const fp = eyebrowText(CANONICAL_FP, vars.textMuted);
  fp.name = 'Doc Fingerprint';
  fp.visible = false;
  usage.appendChild(fp);

  return {
    rendererVersion: DOC_CARD_RENDERER_VERSION,
    columnUnit: plan.columnUnit,
    columns: plan.columns,
    cardWidth: plan.cardWidth,
    rowsRendered: plan.rows.length,
    blocksCreated,
    fingerprint: CANONICAL_FP,
    renderHash: fnv1a(JSON.stringify(plan)),
  };
}
```

- [ ] **Step 2: Verify the template is syntactically valid JavaScript**

```bash
node --check scripts/lib/doc-card-render.figma.js
```

Expected: exits 0 with no output (`figma`, `planDocCard`, `DOC_CARD_RENDERER_VERSION`, `RECORD`, and `CANONICAL_FP` are unresolved identifiers, which is fine — `--check` parses without executing).

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/doc-card-render.figma.js
git commit -m "feat(docs): Figma renderer template for the doc-card Usage band"
```

---

## Task 5: The build script and the generated reference

**Files:**
- Create: `scripts/build-doc-card-builder.mjs`
- Create: `scripts/build-doc-card-builder.test.mjs`
- Create (generated): `references/doc-card-builder.md`

**Interfaces:**
- Consumes: `scripts/lib/doc-card-plan.mjs` (read as text), `scripts/lib/doc-card-render.figma.js` (read as text).
- Produces: `buildDocCardBuilder({ plannerSource, rendererSource }) → string` (the full markdown), CLI `node scripts/build-doc-card-builder.mjs` (writes `references/doc-card-builder.md`) and `--check` (exit 1 + diff message when out of date — the CI gate Task 6 wires). Skills consume `references/doc-card-builder.md` via `${CLAUDE_PLUGIN_ROOT}` (Task 8).

- [ ] **Step 1: Write the failing tests**

Create `scripts/build-doc-card-builder.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocCardBuilder } from './build-doc-card-builder.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const realPlanner = () => readFileSync(join(HERE, 'lib', 'doc-card-plan.mjs'), 'utf8');
const realRenderer = () => readFileSync(join(HERE, 'lib', 'doc-card-render.figma.js'), 'utf8');

test('build: inlines the planner with export keywords stripped, no module syntax survives', () => {
  const md = buildDocCardBuilder({ plannerSource: realPlanner(), rendererSource: realRenderer() });
  assert.match(md, /function planDocCard\(/);
  assert.match(md, /const DOC_CARD_RENDERER_VERSION = '2'/);
  assert.match(md, /async function renderDocCard\(/);
  const snippet = md.slice(md.indexOf('```js'), md.lastIndexOf('```'));
  assert.ok(!/^\s*(import|export)\b/m.test(snippet), 'snippet must contain no import/export lines');
});

test('build: refuses a planner that has imports (the inlinability guard)', () => {
  assert.throws(
    () => buildDocCardBuilder({
      plannerSource: "import { x } from 'node:fs';\nexport function planDocCard() {}\n",
      rendererSource: realRenderer(),
    }),
    /import-free/,
  );
});

test('build: the generated markdown carries the do-not-edit warning and the slot instructions', () => {
  const md = buildDocCardBuilder({ plannerSource: realPlanner(), rendererSource: realRenderer() });
  assert.match(md, /GENERATED FILE — do not edit by hand/);
  assert.match(md, /const RECORD =/);
  assert.match(md, /const CANONICAL_FP =/);
  assert.match(md, /spaceItemGap/); // the vars contract is documented
});

test('build: output is deterministic', () => {
  const args = { plannerSource: realPlanner(), rendererSource: realRenderer() };
  assert.equal(buildDocCardBuilder(args), buildDocCardBuilder(args));
});

test('generated reference on disk is in sync with the sources', () => {
  const expected = buildDocCardBuilder({ plannerSource: realPlanner(), rendererSource: realRenderer() });
  const onDisk = readFileSync(join(HERE, '..', 'references', 'doc-card-builder.md'), 'utf8');
  assert.equal(onDisk, expected, 'run: node scripts/build-doc-card-builder.mjs');
});
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
node --test scripts/build-doc-card-builder.test.mjs
```

Expected failure: `Cannot find module … build-doc-card-builder.mjs`.

- [ ] **Step 3: Implement the build script**

Create `scripts/build-doc-card-builder.mjs`. The markdown header/footer are built as line arrays (not template literals) so the emitted `` ` `` and `${…}` need no escaping:

```js
// Generates references/doc-card-builder.md — the canonical figma_execute
// snippet that renders a doc card's Usage band — by inlining the pure planner
// (lib/doc-card-plan.mjs) above the Figma renderer template
// (lib/doc-card-render.figma.js). Mirrors the adapters generate.mjs idiom:
// run bare to write, run with --check to gate CI. Zero dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLANNER = join(REPO_ROOT, 'scripts', 'lib', 'doc-card-plan.mjs');
const RENDERER = join(REPO_ROOT, 'scripts', 'lib', 'doc-card-render.figma.js');
const OUT = join(REPO_ROOT, 'references', 'doc-card-builder.md');

const HEADER = [
  '# Doc-card Usage-band builder (GENERATED)',
  '',
  '> **GENERATED FILE — do not edit by hand.** Sources: `scripts/lib/doc-card-plan.mjs`',
  '> (the pure planner, unit-tested in Node) + `scripts/lib/doc-card-render.figma.js`',
  '> (the Figma renderer). Regenerate with `node scripts/build-doc-card-builder.mjs`;',
  '> CI gates freshness with `--check`.',
  '',
  'The canonical `figma_execute` snippet that renders a component doc card\'s',
  '`Usage` band from its `.doc.json` record. Every card is identical by',
  'construction — never hand-build the usage body. The snippet rebuilds ONLY the',
  'frame named `Usage`; the header and specimen bands are never touched.',
  '',
  '## How to call it',
  '',
  '1. Load the record and compute its canonical fingerprint in Node',
  '   (`canonicalFingerprint` in `scripts/lib/doc-record.mjs`).',
  '2. Resolve the nine required semantic variables via `figma_get_variables`,',
  '   then in the script fetch each as a Variable object with',
  '   `figma.variables.getVariableByIdAsync(id)`:',
  '   `textDefault`, `textMuted` (text colors), `tonePositive`, `toneNegative`',
  '   (Do/Don\'t eyebrow colors — success/danger roles), `border` (row dividers),',
  '   `spacePadding`, `spaceRowGap`, `spaceBlockGap`, `spaceItemGap` (spacing',
  '   roles: band padding, row gap, block gutter, within-block gap).',
  '3. Find the body text style: `(await figma.getLocalTextStylesAsync())',
  '   .find((s) => s.name === \'Body/Default\')`. Missing variables or style =',
  '   the builder throws (bind-or-throw — the gap is in the token set; fix it',
  '   there, never hardcode around it).',
  '4. Prepend the two slots, then the snippet below, then the call:',
  '',
  '```js',
  'const RECORD = /* the parsed .doc.json object */;',
  'const CANONICAL_FP = \'/* canonicalFingerprint(RECORD), 16 hex chars */\';',
  '// … the generated snippet …',
  'const card = await figma.getNodeByIdAsync(cardNodeId);',
  'const summary = await renderDocCard({ card, record: RECORD, vars, bodyTextStyle });',
  '```',
  '',
  '5. Pass an explicit `timeout` (30000 is right for one card; the ~30s',
  '   `figma_execute` ceiling fits a single card comfortably — render cards one',
  '   call at a time, never batched).',
  '6. Verify from the returned summary — `rowsRendered`, `blocksCreated`,',
  '   `cardWidth` — not from a screenshot, then stamp the manifest from it:',
  '   `surfaces.docCard = { src: summary.fingerprint, render: summary.renderHash,',
  '   renderer: summary.rendererVersion }`. Never re-read the card to stamp.',
  '',
  '## The snippet',
  '',
  '```js',
].join('\n');

const FOOTER = [
  '```',
  '',
  'Layout contract and rationale:',
  '`docs/superpowers/specs/2026-08-09-doc-card-layout-and-voice-design.md`.',
  '',
].join('\n');

export function buildDocCardBuilder({ plannerSource, rendererSource }) {
  const inlined = plannerSource
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ');
  for (const [name, src] of [['doc-card-plan.mjs', inlined], ['doc-card-render.figma.js', rendererSource]]) {
    if (/^\s*(import|export)\b/m.test(src)) {
      throw new Error(`${name} must stay import-free (only top-level \`export const\`/\`export function\` allowed in the planner) — it is inlined into the Figma snippet where no module system exists`);
    }
  }
  return `${HEADER}\n${inlined}\n${rendererSource}${FOOTER}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = buildDocCardBuilder({
    plannerSource: readFileSync(PLANNER, 'utf8'),
    rendererSource: readFileSync(RENDERER, 'utf8'),
  });
  if (process.argv.includes('--check')) {
    let onDisk = null;
    try { onDisk = readFileSync(OUT, 'utf8'); } catch (e) { /* missing counts as drift */ }
    if (onDisk !== result) {
      console.error('✗ references/doc-card-builder.md out of date; run: node scripts/build-doc-card-builder.mjs');
      process.exit(1);
    }
    console.log('✓ doc-card builder in sync');
  } else {
    writeFileSync(OUT, result);
    console.log('✓ wrote references/doc-card-builder.md');
  }
}
```

- [ ] **Step 4: Generate the reference, then run the tests — verify they pass**

```bash
node scripts/build-doc-card-builder.mjs
node --test scripts/build-doc-card-builder.test.mjs
```

Expected: `✓ wrote references/doc-card-builder.md`, then all 5 tests pass (the in-sync test now finds the file on disk).

- [ ] **Step 5: Verify the --check mode gates drift**

```bash
node scripts/build-doc-card-builder.mjs --check && echo IN-SYNC
printf '\n' >> references/doc-card-builder.md
node scripts/build-doc-card-builder.mjs --check; echo "exit: $?"
node scripts/build-doc-card-builder.mjs
```

Expected: `IN-SYNC`; then the drift message with `exit: 1`; then the file is regenerated clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-doc-card-builder.mjs scripts/build-doc-card-builder.test.mjs references/doc-card-builder.md
git commit -m "feat(docs): generate references/doc-card-builder.md from planner + renderer (--check gate)"
```

---

## Task 6: CI wiring and the scripts README

**Files:**
- Modify: `.github/workflows/ci.yml` (insert after line 23 — the `node scripts/adapters/generate.mjs --check` run line)
- Modify: `.github/workflows/release.yml` (insert after line 41 — same run line)
- Modify: `scripts/README.md` (append two table rows after the `docs-check.mjs` row, line 16)

**Interfaces:**
- Consumes: `node scripts/build-doc-card-builder.mjs --check` (Task 5).
- Produces: CI/release gates; no code interfaces.

- [ ] **Step 1: Wire ci.yml**

In `.github/workflows/ci.yml`, after the existing adapter check (lines 22–23):

```yaml
      - name: Check adapters are up to date
        run: node scripts/adapters/generate.mjs --check
```

insert:

```yaml
      - name: Check doc-card builder is up to date
        run: node scripts/build-doc-card-builder.mjs --check
```

- [ ] **Step 2: Wire release.yml**

In `.github/workflows/release.yml`, insert the identical two lines after the adapter check at lines 40–41.

- [ ] **Step 3: Add the README rows**

In `scripts/README.md`, after the `docs-check.mjs` row (line 16), append to the table:

```markdown
| `lib/doc-card-plan.mjs` | Pure layout planner for the doc card's `Usage` band + `DOC_CARD_RENDERER_VERSION` (single source of the layout version). Inlined into `references/doc-card-builder.md`; imported by `docs-check.mjs`. | inlined into the generated builder |
| `build-doc-card-builder.mjs` | Generate `references/doc-card-builder.md` from the planner + the Figma renderer template (`lib/doc-card-render.figma.js`). `--check` gates CI. | plugin-internal (not installed) |
```

- [ ] **Step 4: Verify the gates run clean locally**

```bash
node scripts/build-doc-card-builder.mjs --check && node scripts/adapters/generate.mjs --check && node --test
```

Expected: `✓ doc-card builder in sync`, `✓ adapters in sync`, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml scripts/README.md
git commit -m "ci: gate doc-card builder generation in CI and release"
```

---

## Task 7: Document the `renderer` field in the schema references

**Files:**
- Modify: `references/component-doc-schema.md` — the manifest-pointer JSON (line 108) + the bullet list under it (after line 118) + the drift contract (after line 129)
- Modify: `references/manifest-schema.md` — the `meta[name].doc` shape (line 256) + a following sentence

**Interfaces:**
- Consumes: the `renderer` semantics from Tasks 3–5 (`DOC_CARD_RENDERER_VERSION`, `layout-upgrade-available`).
- Produces: documentation only — the contract Task 8's skill wiring cites.

- [ ] **Step 1: Update component-doc-schema.md**

**(a)** In the manifest-pointer JSON block, replace line 108:

```json
      "docCard":          { "src": "<fp>", "render": "<hash of card content>" },
```

with:

```json
      "docCard":          { "src": "<fp>", "render": "<hash of card content>", "renderer": "2" },
```

**(b)** After the `file` bullet (line 118), add:

```markdown
- `renderer` — (docCard only) the layout version of the builder that last
  rendered the card: `DOC_CARD_RENDERER_VERSION` in `scripts/lib/doc-card-plan.mjs`,
  currently `"2"`. Additive and optional — absence means the card predates the
  versioned builder. Stamped from the builder's returned summary, never by
  re-reading the card.
```

**(c)** In the drift contract list (after the `edited` entry at line 125), add:

```markdown
- **layout-upgrade-available** — informational, never failing, docCard only:
  `surfaces.docCard.renderer` is missing or lower than the current
  `DOC_CARD_RENDERER_VERSION`. The card's content is not in drift — its layout
  predates the current builder. Re-render on next touch (no unprompted Figma
  writes; untouched brownfield cards must not generate a standing warning wall).
```

- [ ] **Step 2: Update manifest-schema.md**

Replace the shape on line 256:

```markdown
  `{ path, fingerprint, surfaces: { <surfaceName>: { src, render, file? } } }`,
```

with:

```markdown
  `{ path, fingerprint, surfaces: { <surfaceName>: { src, render, file?, renderer? } } }`,
```

and, in the explanatory sentences that follow (lines 257–263), after the `render` explanation, add:

```markdown
  `renderer` (docCard only) is the layout version of the builder that last
  rendered the card (`DOC_CARD_RENDERER_VERSION`); missing/lower is reported by
  `docs:check` as the informational `layout-upgrade-available`, never as drift.
```

- [ ] **Step 3: Verify plugin validation still passes**

```bash
node ci/validate-plugin.mjs && node ci/validate-skills.mjs
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add references/component-doc-schema.md references/manifest-schema.md
git commit -m "docs: renderer version field on the docCard surface (schema + manifest references)"
```

---

## Task 8: Wire the builder into the standards doc, skill, and command; regenerate adapters

**Files:**
- Modify: `references/figma-component-standards.md` — the doc-card intro (lines 284–286), the auto-layout section (line 406+), the audit exception in item 3 (line 486+), a new audit item 11 (after item 10, line 523–524), the closing count (line 527–528)
- Modify: `skills/component-builder/SKILL.md` — the *Doc card body* bullet (lines 276–280), the manifest bullet (lines 284–288)
- Modify: `commands/document-component.md` — step 2 (lines 17–20), step 3 (lines 21–25)
- Modify: `CHANGELOG.md` — add an `## [Unreleased]` section (after line 6)
- Modify (generated): `adapters/**` — regenerated, never hand-edited

**Interfaces:**
- Consumes: `references/doc-card-builder.md` (Task 5), the summary/manifest-stamping contract (*Interface contracts*), `layout-upgrade-available` (Task 3).
- Produces: the prose wiring skills follow at run time. No code.

- [ ] **Step 1: Rewrite the doc-card intro to the three-band architecture**

In `references/figma-component-standards.md`, replace lines 284–286:

```markdown
Wrap each generated component in a "doc card" — a frame that holds the component
plus a small header. Never leave components floating on bare canvas. The card
shows:
```

with:

```markdown
Wrap each generated component in a "doc card" — a **vertical, three-band
auto-layout frame**: a **header** band, a **specimen** band (a frame named
`Specimen` holding the component set), and a **`Usage`** band holding the
documentation body. Never leave components floating on bare canvas.

**The `Usage` band is never hand-built.** It is rendered by the canonical
builder snippet in `${CLAUDE_PLUGIN_ROOT}/references/doc-card-builder.md`
(generated — that file carries the full call contract: the record/fingerprint
slots, the nine required semantic variables, the `Body/Default` text style, and
the returned summary you verify and stamp the manifest from). The builder
computes the card's width from the specimen and the body type — a column-unit
grid whose text fills its block, not the card — and rebuilds only the `Usage`
frame, leaving header and specimen untouched. The header's short-description
text node is clamped to one column unit wide (`summary.columnUnit` from the
builder's return), so it never stretches across a wide matrix.

The header shows:
```

- [ ] **Step 2: Point the auto-layout section at the builder**

In the same file, in "### Auto layout inside the card" (lines 404–411), after the sentence ending "proper auto layout eliminates it." (line 411), append to the paragraph:

```markdown
The `Usage` band's internal layout (rows, wrapping, block widths) is entirely
the builder's job — these auto-layout rules apply to the header band and any
hand-built chrome, not to nodes inside `Usage`.
```

- [ ] **Step 3: Amend audit item 3's exception and add audit item 11**

**(a)** In audit item 3 ("Variables bound", lines 486–492), after "No hardcoded values anywhere in the doc-card chrome." (line 488), insert:

```markdown
   **Two documented exceptions inside the `Usage` band** (layout chrome, not
   design values, both produced by the builder): the computed column-unit width
   on blocks, and the derived eyebrow type (size/case/tracking/weight). All
   other `Usage` properties — padding, gaps, text colors, dividers — must still
   resolve to bound variables.
```

**(b)** After item 10 ("Visual", lines 523–524), add:

```markdown
11. **Usage band rendered by the builder** — the card's `Usage` frame was
   created by `renderDocCard`
   (`${CLAUDE_PLUGIN_ROOT}/references/doc-card-builder.md`) in this session, and
   the returned summary matches the record: `rowsRendered` and `blocksCreated`
   line up with the record's populated blocks, `cardWidth` is a whole multiple
   of `columnUnit` (minimum 3), and the frame contains the deterministic names
   (`Usage`, `Usage Row 1..3`, `Block: …`, `Doc Fingerprint`). Verify from the
   summary, not a screenshot. A hand-assembled usage body is a fail.
```

**(c)** Update the closing count (lines 527–528): replace "Only when all ten pass is the build done." with "Only when all eleven pass is the build done."

- [ ] **Step 4: Update the component-builder skill**

In `skills/component-builder/SKILL.md`:

**(a)** Replace the *Doc card body* bullet (lines 276–280):

```markdown
- **Doc card body.** Extend the existing doc card (name/short-desc/status/date, per
  `${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md`) with a usage body:
  when-to-use, do's/don'ts, an a11y line, and a variant/state legend — all
  token-bound (no hardcoded hex/px). Add a metadata text node named
  `Doc Fingerprint` holding `<fp>`.
```

with:

```markdown
- **Doc card body.** Render the card's `Usage` band with the canonical builder
  snippet in `${CLAUDE_PLUGIN_ROOT}/references/doc-card-builder.md` (via
  `figma_execute` with an explicit `timeout`, one card per call): fill the
  RECORD/CANONICAL_FP slots, resolve the nine required semantic variables and
  the `Body/Default` text style per that file's call contract, run it, and
  verify the returned summary (`rowsRendered`, `blocksCreated`, `cardWidth`) —
  not a screenshot. The builder creates the `Doc Fingerprint` node itself and
  is the only thing that may build the usage body — never hand-assemble it.
```

**(b)** Replace the manifest bullet (lines 284–288):

```markdown
**Update the manifest (fields this skill owns):** set
`components.meta[<Name>].doc` to `{ path, fingerprint: <fp>, surfaces: {
figmaDescription: { src: <fp>, render: <hash of the description text> }, docCard: {
src: <fp>, render: <hash of the card body content> } } }`. The code surfaces
(`storybookMdx`) are added later by `storybook-chromatic-builder`.
```

with:

```markdown
**Update the manifest (fields this skill owns):** set
`components.meta[<Name>].doc` to `{ path, fingerprint: <fp>, surfaces: {
figmaDescription: { src: <fp>, render: <hash of the description text> }, docCard: {
src: <fp>, render: <summary.renderHash>, renderer: <summary.rendererVersion> } } }`
— the docCard entry is stamped from the builder's returned summary, never by
re-reading the card. The code surfaces (`storybookMdx`) are added later by
`storybook-chromatic-builder`.
```

- [ ] **Step 5: Update the document-component command**

In `commands/document-component.md`:

**(a)** Replace step 2 (lines 17–20):

```markdown
2. **Project it.** Write `design-system/docs/components/<Name>.doc.json`, set the
   Figma component `description`, enrich the doc card, and (if the repo/code side
   exists) render MDX/JSDoc and run `docs:digest` per the
   `storybook-chromatic-builder` render step.
```

with:

```markdown
2. **Project it.** Write `design-system/docs/components/<Name>.doc.json`, set the
   Figma component `description`, rebuild the doc card's `Usage` band with the
   canonical builder (`${CLAUDE_PLUGIN_ROOT}/references/doc-card-builder.md` —
   verify its returned summary and stamp `surfaces.docCard.{src,render,renderer}`
   from it), and (if the repo/code side exists) render MDX/JSDoc and run
   `docs:digest` per the `storybook-chromatic-builder` render step.
```

**(b)** In step 3 (lines 21–25), after the sentence ending "rather than overwriting it." (line 25), append:

```markdown
   `docs:check` may also report `layout-upgrade-available` (informational, never
   failing): the card's layout predates the current builder. Offer to re-render
   the `Usage` band now — rebuild happens on this touch, never unprompted.
```

- [ ] **Step 6: Add the CHANGELOG entry**

In `CHANGELOG.md`, after the intro paragraph (line 6, before `## [0.14.0]`), insert:

```markdown
## [Unreleased]

### Added
- **Deterministic doc-card builder (layout phase).** The doc card's `Usage` band
  is now rendered by a canonical, generated `figma_execute` snippet
  (`references/doc-card-builder.md`) built from a pure, unit-tested layout
  planner (`scripts/lib/doc-card-plan.mjs`) — a column-unit grid (three
  wrapping rows, four closed block types) whose width grows with the variant
  matrix instead of stretching text. Cards stamp a `renderer` version into the
  manifest; `docs:check` reports old-layout cards as the informational
  `layout-upgrade-available`, never as drift. CI gates the generated snippet
  with `build-doc-card-builder.mjs --check`.
```

- [ ] **Step 7: Regenerate adapters and verify everything**

```bash
node scripts/adapters/generate.mjs
node scripts/adapters/generate.mjs --check
node scripts/build-doc-card-builder.mjs --check
node ci/validate-plugin.mjs && node ci/validate-skills.mjs
node --test
```

Expected: adapters regenerated then `✓ adapters in sync`; `✓ doc-card builder in sync`; both validators exit 0; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add references/figma-component-standards.md skills/component-builder/SKILL.md commands/document-component.md CHANGELOG.md adapters/
git commit -m "feat(docs): three-band doc card — builder wiring in standards, skill, and command"
```

---

## Done — acceptance check against the spec

Plan-1 slice of the spec's success criteria (the dogfood on `throughline-sample`, criterion 6, runs after this plan lands and needs a live Figma session — it is the acceptance test, not a task here):

- Criterion 2: `node --test` locks block selection, row assignment, per-axis definition blocks, column-unit computation, and card-width rounding (Tasks 1–2); `build-doc-card-builder.mjs --check` passes in CI (Tasks 5–6).
- Criterion 3: rebuild scoped to the `Usage` frame only (Task 4's renderer; audit item 11 in Task 8 enforces it at run time).
- Criterion 5: `docs:check` reports an old-layout card as `layout-upgrade-available` without failing, and a re-rendered card stamps `renderer: "2"` (Task 3; stamping contract in Tasks 5 and 8).
- Criteria 1 and 4 belong to run-time skill behavior (1) and plan 2 (4).
