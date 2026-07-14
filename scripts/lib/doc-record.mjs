// Loads, validates, and fingerprints a component documentation record
// (design-system/docs/components/<Name>.doc.json). Zero dependencies.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Blocks that get PROJECTED to surfaces. `provenance` is authoring metadata and
// is intentionally excluded from the fingerprint.
const PROJECTED_KEYS = [
  'name', 'summary', 'description', 'whenToUse', 'whenNotToUse',
  'variants', 'states', 'dos', 'donts', 'accessibility', 'tokensUsed',
  'status', 'updatedAt',
];

const REQUIRED_KEYS = ['name', 'summary', 'description'];

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function fingerprint(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

export function canonicalFingerprint(record) {
  const projected = {};
  for (const k of PROJECTED_KEYS) {
    if (record[k] !== undefined) projected[k] = record[k];
  }
  return fingerprint(stableStringify(projected));
}

export function validateRecord(record) {
  const problems = [];
  for (const k of REQUIRED_KEYS) {
    if (typeof record[k] !== 'string' || record[k].trim() === '') {
      problems.push(`missing or empty required field "${k}"`);
    }
  }
  return problems;
}

export function loadRecord(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
