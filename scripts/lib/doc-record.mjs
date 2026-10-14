// Loads, validates, and fingerprints a component documentation record
// (design-system/docs/components/<Name>.doc.json). Zero dependencies.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Blocks that get PROJECTED to surfaces. `provenance` is authoring metadata and
// is intentionally excluded from the fingerprint.
// MAINTENANCE: keep this in sync with the record schema — any NEW projected field
// (see references/component-doc-schema.md) must be added here, or it will be
// silently excluded from the fingerprint and its drift will go undetected.
const PROJECTED_KEYS = [
  'name', 'summary', 'description', 'whenToUse', 'whenNotToUse',
  'variants', 'states', 'dos', 'donts', 'accessibility', 'tokensUsed',
  'status', 'updatedAt',
];

// The part of a record a composed screen relies on. A screen goes stale when this
// moves, not when the prose around it is reworded (docs/specs/2026-10-14-drift.md).
export const CONTRACT_KEYS = ['name', 'variants', 'states', 'tokensUsed'];

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

function projectedFingerprint(record, keys) {
  const projected = {};
  for (const k of keys) {
    if (record[k] !== undefined) projected[k] = record[k];
  }
  return fingerprint(stableStringify(projected));
}

export function canonicalFingerprint(record) {
  return projectedFingerprint(record, PROJECTED_KEYS);
}

export function contractFingerprint(record) {
  return projectedFingerprint(record, CONTRACT_KEYS);
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
