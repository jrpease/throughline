// Shared loader + structural validation for crosswalk.json.
// Zero dependencies. Mirrors scripts/crosswalk.schema.json's required/enum rules.
import { readFileSync } from 'node:fs';

export const STATUS_VALUES = ['aligned', 'renamed', 'drift-fix', 'added', 'mapped-nearest'];

// Row status (kebab) -> manifest tokenCrosswalk.statusCounts key (camelCase).
export const STATUS_COUNT_KEY = {
  'aligned': 'aligned',
  'renamed': 'renamed',
  'drift-fix': 'driftFix',
  'added': 'added',
  'mapped-nearest': 'mappedNearest',
};

const TIERS = ['primitive', 'semantic'];

export function loadCrosswalk(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    throw new Error(`crosswalk: cannot read file at ${path}: ${e.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`crosswalk: invalid JSON in ${path}: ${e.message}`);
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.tokens)) {
    throw new Error('crosswalk: expected an object with a "tokens" array');
  }
  const seen = new Set();
  data.tokens.forEach((row, i) => validateRow(row, i, seen));
  return data;
}

function validateRow(row, i, seen) {
  const where = `tokens[${i}]`;
  if (!row || typeof row !== 'object') {
    throw new Error(`crosswalk: ${where} is not an object`);
  }
  for (const field of ['newToken', 'newValue', 'tier', 'status']) {
    if (typeof row[field] !== 'string' || row[field] === '') {
      throw new Error(`crosswalk: ${where}.${field} must be a non-empty string`);
    }
  }
  if (!TIERS.includes(row.tier)) {
    throw new Error(`crosswalk: ${where}.tier must be one of ${TIERS.join(', ')}, got "${row.tier}"`);
  }
  if (!STATUS_VALUES.includes(row.status)) {
    throw new Error(`crosswalk: ${where}.status must be one of ${STATUS_VALUES.join(', ')}, got "${row.status}"`);
  }
  if (!Array.isArray(row.codeTokens) || row.codeTokens.some((t) => typeof t !== 'string')) {
    throw new Error(`crosswalk: ${where}.codeTokens must be an array of strings`);
  }
  if (row.figmaOld === undefined || (row.figmaOld !== null && typeof row.figmaOld !== 'string')) {
    throw new Error(`crosswalk: ${where}.figmaOld must be a string or null`);
  }
  if (row.recommendedSemantic != null && typeof row.recommendedSemantic !== 'string') {
    throw new Error(`crosswalk: ${where}.recommendedSemantic must be a string or null`);
  }
  if (seen.has(row.newToken)) {
    throw new Error(`crosswalk: duplicate newToken "${row.newToken}"`);
  }
  seen.add(row.newToken);
}

export function statusCounts(crosswalk) {
  const counts = { aligned: 0, renamed: 0, driftFix: 0, added: 0, mappedNearest: 0 };
  for (const row of crosswalk.tokens) {
    counts[STATUS_COUNT_KEY[row.status]] += 1;
  }
  return counts;
}
