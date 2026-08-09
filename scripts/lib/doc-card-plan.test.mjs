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
