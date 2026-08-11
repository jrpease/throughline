import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOC_CARD_RENDERER_VERSION, columnUnit, cardColumns, planDocCard } from './doc-card-plan.mjs';

test('DOC_CARD_RENDERER_VERSION is the string "3"', () => {
  assert.equal(DOC_CARD_RENDERER_VERSION, '3');
});

test('columnUnit: clamp(round(fontSize × 30), 280, 480)', () => {
  assert.equal(columnUnit(14), 420);  // 14 × 30 = 420, inside the clamp
  assert.equal(columnUnit(16), 480);  // 16 × 30 = 480, exactly the ceiling
  assert.equal(columnUnit(9), 280);   // 270 clamps up to the floor
  assert.equal(columnUnit(20), 480);  // 600 clamps down to the ceiling
  assert.equal(columnUnit(13.5), 405); // rounds: 13.5 × 30 = 405
});

test('cardColumns: clamp(maxBlocksPerRow, 3, ceil(specimenWidth / unit)) — content-capped, width-ceilinged, 3-unit floored', () => {
  assert.equal(cardColumns(1500, 420, 10), 4); // ceil(3.57) = 4, uncapped by content
  assert.equal(cardColumns(1260, 420, 10), 3); // exact multiple stays 3
  assert.equal(cardColumns(2010, 480, 3), 3);  // Input's dogfood case: was 5 (dead columns) — content caps it at 3
  assert.equal(cardColumns(1440, 480, 4), 3);  // Button's case: specimen ceiling still binds; 4th block wraps
  assert.equal(cardColumns(200, 480, 1), 3);   // narrow specimen, sparse content: 3-unit floor
  assert.equal(cardColumns(0, 480, 2), 3);     // degenerate specimen width still floors at 3
  assert.equal(cardColumns(2010, 480, 0), 3);  // degenerate content count still floors at 3
});

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
  assert.equal(plan.rendererVersion, '3');
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

test('planDocCard: columns are capped by content, not just specimen width — a wide specimen with sparse rows does not mint dead columns', () => {
  // Row 1 has 3 blocks (the widest row); row 2 has 2; row 3 has 1 — max is 3.
  // A 2010px specimen would ceil to 5 columns on width alone; content caps it.
  const plan = planDocCard(
    {
      name: 'Input',
      summary: 's',
      description: 'A single-line field for entering text.',
      whenToUse: ['Collecting a short piece of free text.'],
      whenNotToUse: ['Choosing from a fixed set. Use a Select instead.'],
      dos: ['Label every input.'],
      donts: ["Don't rely on placeholder text as the only label."],
      states: { focused: 'The input has keyboard focus.' },
    },
    2010, { fontSize: 16 },
  );
  assert.equal(plan.columns, 3);
  assert.equal(plan.cardWidth, 1440);
});

test('planDocCard: empty arrays and empty objects are skipped like absent fields', () => {
  const plan = planDocCard(
    { name: 'X', summary: 's', description: 'd', whenToUse: [], variants: {}, dos: [] },
    200, { fontSize: 16 },
  );
  assert.deepEqual(plan.rows.map((r) => r.name), ['Usage Row 1']);
  assert.deepEqual(plan.rows[0].blocks.map((b) => b.name), ['Block: Overview']);
});
