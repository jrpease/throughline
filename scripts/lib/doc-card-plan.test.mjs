import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOC_CARD_RENDERER_VERSION, CARD_MIN_WIDTH, cardWidth, STATUS_OPTIONS, statusVariant,
  isUnprotected, bandUnreviewed, planDocCard, fnv1a,
} from './doc-card-plan.mjs';

test('DOC_CARD_RENDERER_VERSION is the string "5"', () => {
  assert.equal(DOC_CARD_RENDERER_VERSION, '5');
});

test('cardWidth: the 1440 floor, or the set plus band padding, plus the card padding', () => {
  assert.equal(CARD_MIN_WIDTH, 1440);
  assert.equal(cardWidth({ specimenWidth: 600, bandPad: 32, cardPad: 0 }), 1440);   // floor wins
  assert.equal(cardWidth({ specimenWidth: 600, bandPad: 32, cardPad: 24 }), 1488);  // floor + card padding
  assert.equal(cardWidth({ specimenWidth: 2000, bandPad: 32, cardPad: 0 }), 2064);  // a wide set wins
  assert.equal(cardWidth({ specimenWidth: 2000, bandPad: 32, cardPad: 24 }), 2112); // …plus card padding
  assert.equal(cardWidth({ specimenWidth: 1376, bandPad: 32, cardPad: 0 }), 1440);  // exactly the floor
});

test('statusVariant folds case and refuses anything outside the four options', () => {
  assert.deepEqual(STATUS_OPTIONS, ['draft', 'beta', 'stable', 'deprecated']);
  assert.equal(statusVariant('Stable'), 'stable');
  assert.equal(statusVariant('draft'), 'draft');
  assert.throws(() => statusVariant('final'), /status "final" is not one of draft \/ beta \/ stable \/ deprecated/);
  assert.throws(() => statusVariant(undefined), /is not one of/);
});

test('isUnprotected: only user and imported protect a block', () => {
  for (const v of ['ai-inferred', 'best-practice', 'w3c-apg', 'framework', 'ai-inferred+best-practice', undefined, '']) {
    assert.equal(isUnprotected(v), true, String(v));
  }
  for (const v of ['user', 'imported', 'best-practice+user', 'imported+user', 'w3c-apg+imported']) {
    assert.equal(isUnprotected(v), false, v);
  }
});

test('bandUnreviewed: judged only on the keys that have content', () => {
  const keys = ['description', 'dos', 'states'];
  // dos is protected; states is empty so it doesn't count.
  assert.equal(bandUnreviewed({ description: 'd', dos: ['x'], states: {}, provenance: { description: 'ai-inferred', dos: 'best-practice+user' } }, keys), false);
  // every block with content is generated, and states has no provenance at all.
  assert.equal(bandUnreviewed({ description: 'd', states: { hover: 'h' }, provenance: { description: 'framework' } }, keys), true);
  // no provenance object at all: unprotected.
  assert.equal(bandUnreviewed({ description: 'd' }, keys), true);
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
  updatedAt: '2026-08-12',
};

test('planDocCard: full record → one Usage band with the blocks in order', () => {
  const plan = planDocCard(FULL_RECORD);
  assert.equal(plan.rendererVersion, '5');
  assert.deepEqual(plan.header, { title: 'Button', summary: 'Triggers an action or event.', updatedAt: '2026-08-12' });
  assert.deepEqual(plan.bands.map((b) => b.name), ['Band: Usage']);
  const usage = plan.bands[0];
  assert.equal(usage.title, 'Usage');
  assert.equal(usage.lede, 'A clickable control that starts an action.');
  assert.deepEqual(usage.blocks.map((b) => b.name), [
    'Block: When to use',
    'Block: Use something else',
    "Block: Do and Don't",
    'Block: What each variant means',   // Step 1 carry-over, one per axis in record order
    'Block: What each size means',
    'Block: What each state means',
    'Block: Accessibility',
  ]);
});

test('planDocCard: Do and Don\'t share one two-column block with the v4 headings', () => {
  const block = planDocCard(FULL_RECORD).bands[0].blocks[2];
  assert.equal(block.type, 'dosDonts');
  assert.deepEqual(block.do, { eyebrow: '✓ Do', items: ['Start the label with a verb.'] });
  assert.deepEqual(block.dont, { eyebrow: "✕ Don't", items: ["Don't use a button to navigate. Use a Link."] });
  // Only one side present: the block still renders, with an empty other side.
  const onlyDos = planDocCard({ name: 'X', dos: ['a'] }).bands[0].blocks;
  assert.deepEqual(onlyDos.map((b) => [b.type, b.dont && b.dont.items]), [['dosDonts', []]]);
});

test('planDocCard: definition terms keep record order; accessibility = keyboard then notes, role dropped', () => {
  const blocks = planDocCard(FULL_RECORD).bands[0].blocks;
  assert.deepEqual(blocks[3].terms, [
    { term: 'default', meaning: 'The one main action in a view.' },
    { term: 'secondary', meaning: 'Sits alongside a main action.' },
  ]);
  assert.deepEqual(blocks[6].items, [
    'Enter and Space activate it.',
    'An icon-only button needs an aria-label so screen readers can announce it.',
  ]);
});

test('planDocCard: a record with no usage content has no Usage band', () => {
  const plan = planDocCard({ name: 'Spacer', summary: 's' });
  assert.deepEqual(plan.bands, []);
  assert.deepEqual(planDocCard({ name: 'X', description: '  ', whenToUse: [], variants: {} }).bands, []);
});

test('planDocCard: a description alone still makes a Usage band, as its lede', () => {
  const plan = planDocCard({ name: 'Badge', description: 'A small label.' });
  assert.equal(plan.bands[0].lede, 'A small label.');
  assert.deepEqual(plan.bands[0].blocks, []);
});

test('planDocCard: the Usage band carries the Unreviewed flag from provenance', () => {
  assert.equal(planDocCard({ ...FULL_RECORD, provenance: { description: 'ai-inferred' } }).bands[0].unreviewed, true);
  assert.equal(planDocCard({ ...FULL_RECORD, provenance: { dos: 'imported' } }).bands[0].unreviewed, false);
});

test('plan header is always strings, so the record hash stays stable', () => {
  const plan = planDocCard({ name: 'Button', description: 'x' });
  assert.deepEqual(plan.header, { title: 'Button', summary: '', updatedAt: '' });
});

test('record hash ignores top-level key order but follows display order', () => {
  const reordered = Object.fromEntries(Object.entries(FULL_RECORD).reverse());
  assert.equal(fnv1a(JSON.stringify(planDocCard(reordered))), fnv1a(JSON.stringify(planDocCard(FULL_RECORD))));
  const statesSwapped = { ...FULL_RECORD, states: { disabled: FULL_RECORD.states.disabled, hover: FULL_RECORD.states.hover } };
  assert.notEqual(fnv1a(JSON.stringify(planDocCard(statesSwapped))), fnv1a(JSON.stringify(planDocCard(FULL_RECORD))));
});

test('fnv1a: 32-bit FNV-1a, 8 lowercase hex chars', () => {
  assert.equal(fnv1a(''), '811c9dc5');      // the offset basis
  assert.equal(fnv1a('a'), 'e40c292c');     // published FNV-1a test vector
  assert.match(fnv1a(JSON.stringify({ x: 1 })), /^[0-9a-f]{8}$/);
});
