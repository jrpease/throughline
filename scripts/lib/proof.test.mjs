import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGES,
  PER_COMPONENT_STAGES,
  entryProblems,
  mergeEntry,
  stageFingerprint,
  stageExempt,
  stageAdoptedAt,
} from './proof.mjs';

function wellFormedEntry() {
  return {
    at: '2026-09-12T00:00:00Z',
    advancedBecause: 'looked fine',
    changed: ['Button.tsx'],
    checks: [
      { name: 'build', method: 'attested', result: 'pass', evidence: 'ci run 123' },
    ],
  };
}

test('entryProblems: [] for a well-formed entry', () => {
  assert.deepEqual(entryProblems(wellFormedEntry()), []);
});

test('entryProblems: one problem for a missing "at"', () => {
  const entry = wellFormedEntry();
  delete entry.at;
  const problems = entryProblems(entry);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"at"/);
});

test('entryProblems: one problem for an empty "checks"', () => {
  const entry = wellFormedEntry();
  entry.checks = [];
  const problems = entryProblems(entry);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"checks"/);
});

test('entryProblems: one problem for a check method of "guessed"', () => {
  const entry = wellFormedEntry();
  entry.checks[0].method = 'guessed';
  const problems = entryProblems(entry);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /method/);
});

test('entryProblems: one problem for a check result of "maybe"', () => {
  const entry = wellFormedEntry();
  entry.checks[0].result = 'maybe';
  const problems = entryProblems(entry);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /result/);
});

test('mergeEntry: on a null stage file creates { stage, subjects: { Button: … } }', () => {
  const entry = wellFormedEntry();
  const result = mergeEntry(null, 'component-builder', 'Button', entry);
  assert.deepEqual(result, {
    stage: 'component-builder',
    subjects: { Button: entry },
  });
});

test('mergeEntry: on an existing file replaces one subject, leaves the other untouched, keys sorted', () => {
  const existingButton = wellFormedEntry();
  const existingCard = { ...wellFormedEntry(), advancedBecause: 'card looked fine' };
  const stageFile = {
    stage: 'component-builder',
    subjects: { Card: existingCard, Button: existingButton },
  };
  const newButton = { ...wellFormedEntry(), advancedBecause: 'rebuilt' };
  const result = mergeEntry(stageFile, 'component-builder', 'Button', newButton);
  assert.deepEqual(Object.keys(result.subjects), ['Button', 'Card']);
  assert.deepEqual(result.subjects.Button, newButton);
  assert.deepEqual(result.subjects.Card, existingCard);
});

test('stageFingerprint: stable across key insertion order', () => {
  const a = { stage: 'component-builder', subjects: { Button: wellFormedEntry() } };
  const entry = wellFormedEntry();
  const b = { subjects: { Button: entry }, stage: 'component-builder' };
  assert.equal(stageFingerprint(a), stageFingerprint(b));
});

test('stageFingerprint: changes when any value changes', () => {
  const a = { stage: 'component-builder', subjects: { Button: wellFormedEntry() } };
  const changed = { ...wellFormedEntry(), advancedBecause: 'different reason' };
  const b = { stage: 'component-builder', subjects: { Button: changed } };
  assert.notEqual(stageFingerprint(a), stageFingerprint(b));
});

test('stageExempt: returns the recorded names as a set', () => {
  const manifest = { verification: { stages: { 'component-builder': { exempt: ['Card', 'Dialog'] } } } };
  assert.deepEqual(stageExempt(manifest, 'component-builder'), new Set(['Card', 'Dialog']));
});

test('stageExempt: empty set when the manifest does not list the stage', () => {
  const manifest = { verification: { stages: {} } };
  assert.deepEqual(stageExempt(manifest, 'component-builder'), new Set());
});

test('stageExempt: empty set when the manifest has no "verification" at all', () => {
  const manifest = {};
  assert.deepEqual(stageExempt(manifest, 'component-builder'), new Set());
});

test('stageExempt: empty set when a listed stage has no "exempt" key — missing key exempts nothing, not everything', () => {
  const manifest = { verification: { stages: { 'component-builder': { adoptedAt: '2026-09-12T00:00:00Z' } } } };
  assert.deepEqual(stageExempt(manifest, 'component-builder'), new Set());
});

test('stageExempt: unchanged by mergeEntry replacing a subject\'s "at" with a later one', () => {
  const manifest = { verification: { stages: { 'component-builder': { exempt: ['Card'] } } } };
  const before = stageExempt(manifest, 'component-builder');
  const stageFile = { stage: 'component-builder', subjects: { Button: wellFormedEntry() } };
  const laterEntry = { ...wellFormedEntry(), at: '2026-10-01T00:00:00Z' };
  mergeEntry(stageFile, 'component-builder', 'Button', laterEntry);
  const after = stageExempt(manifest, 'component-builder');
  assert.deepEqual(before, after);
});

test('stageAdoptedAt: returns the manifest\'s recorded adoptedAt', () => {
  const manifest = { verification: { stages: { 'component-builder': { adoptedAt: '2026-09-12T00:00:00Z' } } } };
  assert.equal(stageAdoptedAt(manifest, 'component-builder'), '2026-09-12T00:00:00Z');
});

test('stageAdoptedAt: null when the manifest does not list the stage', () => {
  const manifest = { verification: { stages: {} } };
  assert.equal(stageAdoptedAt(manifest, 'component-builder'), null);
});

test('stageAdoptedAt: null when the manifest has no "verification" at all', () => {
  const manifest = {};
  assert.equal(stageAdoptedAt(manifest, 'component-builder'), null);
});

test('PER_COMPONENT_STAGES: holds component-builder and not token-sync-layer', () => {
  assert.ok(PER_COMPONENT_STAGES.has('component-builder'));
  assert.ok(!PER_COMPONENT_STAGES.has('token-sync-layer'));
});

test('PER_COMPONENT_STAGES: every member is in STAGES', () => {
  for (const stage of PER_COMPONENT_STAGES) {
    assert.ok(STAGES.includes(stage), `${stage} should be in STAGES`);
  }
});
