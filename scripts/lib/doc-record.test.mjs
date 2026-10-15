import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stableStringify,
  fingerprint,
  canonicalFingerprint,
  contractFingerprint,
  shapeFingerprint,
  validateRecord,
} from './doc-record.mjs';

test('stableStringify is key-order independent', () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
});

test('stableStringify recurses into nested objects and arrays', () => {
  const a = stableStringify({ x: { b: [1, 2], a: 3 } });
  const b = stableStringify({ x: { a: 3, b: [1, 2] } });
  assert.equal(a, b);
});

test('fingerprint is deterministic and 16 lowercase hex chars', () => {
  const fp = fingerprint('hello');
  assert.match(fp, /^[0-9a-f]{16}$/);
  assert.equal(fp, fingerprint('hello'));
  assert.notEqual(fp, fingerprint('world'));
});

test('canonicalFingerprint ignores provenance', () => {
  const base = { name: 'Button', summary: 's', description: 'd' };
  const withProv = { ...base, provenance: { summary: 'ai-inferred' } };
  assert.equal(canonicalFingerprint(base), canonicalFingerprint(withProv));
});

test('canonicalFingerprint changes when a projected field changes', () => {
  const a = { name: 'Button', summary: 's', description: 'd' };
  const b = { name: 'Button', summary: 's2', description: 'd' };
  assert.notEqual(canonicalFingerprint(a), canonicalFingerprint(b));
});

test('validateRecord passes a complete record and flags missing required fields', () => {
  assert.deepEqual(validateRecord({ name: 'B', summary: 's', description: 'd' }), []);
  const problems = validateRecord({ name: 'B' });
  assert.ok(problems.some((p) => /summary/.test(p)));
  assert.ok(problems.some((p) => /description/.test(p)));
});

test('contractFingerprint ignores prose and dates, and moves with a variant', () => {
  const rec = { name: 'Button', summary: 'Press it.', updatedAt: '2026-10-01', variants: { size: { sm: 'x' } } };
  const base = contractFingerprint(rec);
  assert.equal(contractFingerprint({ ...rec, summary: 'Press it now.', updatedAt: '2026-10-14', status: 'stable' }), base);
  assert.notEqual(contractFingerprint({ ...rec, variants: { size: { sm: 'x', lg: 'y' } } }), base);
});

test('shapeFingerprint ignores meanings and token order, and moves with an option, a state or a token', () => {
  const rec = {
    name: 'Button', summary: 'Press it.',
    variants: { size: { sm: 'Small.', md: 'Medium.' } },
    states: { default: 'At rest.', hover: 'Pointer over.' },
    tokensUsed: ['color.bg.primary', 'radius.md'],
  };
  const base = shapeFingerprint(rec);
  assert.equal(shapeFingerprint({ ...rec, summary: 'Press it now.', variants: { size: { md: 'Mid.', sm: 'Tiny.' } } }), base, 'option meanings');
  assert.equal(shapeFingerprint({ ...rec, states: { hover: 'Over it.', default: 'Idle.' } }), base, 'state meanings');
  assert.equal(shapeFingerprint({ ...rec, tokensUsed: ['radius.md', 'color.bg.primary'] }), base, 'token order');
  assert.notEqual(shapeFingerprint({ ...rec, variants: { size: { sm: 'x', md: 'y', lg: 'z' } } }), base, 'an option');
  assert.notEqual(shapeFingerprint({ ...rec, states: { ...rec.states, active: 'Pressed.' } }), base, 'a state');
  assert.notEqual(shapeFingerprint({ ...rec, tokensUsed: [...rec.tokensUsed, 'spacing.sm'] }), base, 'a token');
  assert.notEqual(contractFingerprint({ ...rec, tokensUsed: ['radius.md', 'color.bg.primary'] }), contractFingerprint(rec), 'the contract, unlike the shape, moves on order');
  const bare = { name: 'Button' };
  for (const malformed of [{ variants: null }, { states: null }, { tokensUsed: 5 }, { variants: 'x' }]) {
    assert.equal(shapeFingerprint({ ...bare, ...malformed }), shapeFingerprint(bare), `${JSON.stringify(malformed)} hashes as absent`);
  }
});
