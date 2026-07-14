import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stableStringify,
  fingerprint,
  canonicalFingerprint,
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
