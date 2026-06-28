import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCrosswalk, statusCounts, STATUS_VALUES, STATUS_COUNT_KEY } from './crosswalk.mjs';

function writeTemp(obj) {
  const dir = mkdtempSync(join(tmpdir(), 'crosswalk-'));
  const path = join(dir, 'crosswalk.json');
  writeFileSync(path, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return path;
}

const validRow = {
  newToken: 'color.gray.900',
  newValue: '#111827',
  tier: 'primitive',
  figmaOld: 'grey/900',
  codeTokens: ['$grey-900'],
  status: 'renamed',
  recommendedSemantic: null,
};
const validDoc = { version: 1, tokens: [validRow] };

test('loads a valid crosswalk', () => {
  const cw = loadCrosswalk(writeTemp(validDoc));
  assert.equal(cw.tokens.length, 1);
  assert.equal(cw.tokens[0].newToken, 'color.gray.900');
});

test('rejects a missing file', () => {
  assert.throws(() => loadCrosswalk('/no/such/file.json'), /cannot read file/);
});

test('rejects invalid JSON', () => {
  assert.throws(() => loadCrosswalk(writeTemp('{ not json')), /invalid JSON/);
});

test('rejects a doc without a tokens array', () => {
  assert.throws(() => loadCrosswalk(writeTemp({ version: 1 })), /"tokens" array/);
});

test('rejects a bad status', () => {
  const bad = { version: 1, tokens: [{ ...validRow, status: 'frobnicated' }] };
  assert.throws(() => loadCrosswalk(writeTemp(bad)), /status must be one of/);
});

test('rejects a bad tier', () => {
  const bad = { version: 1, tokens: [{ ...validRow, tier: 'tertiary' }] };
  assert.throws(() => loadCrosswalk(writeTemp(bad)), /tier must be/);
});

test('rejects a missing required string field', () => {
  const bad = { version: 1, tokens: [{ ...validRow, newValue: '' }] };
  assert.throws(() => loadCrosswalk(writeTemp(bad)), /newValue must be a non-empty string/);
});

test('rejects codeTokens that is not a string array', () => {
  const bad = { version: 1, tokens: [{ ...validRow, codeTokens: [1, 2] }] };
  assert.throws(() => loadCrosswalk(writeTemp(bad)), /codeTokens must be an array of strings/);
});

test('allows figmaOld null for added tokens', () => {
  const added = { version: 1, tokens: [{ ...validRow, status: 'added', figmaOld: null, codeTokens: [] }] };
  assert.doesNotThrow(() => loadCrosswalk(writeTemp(added)));
});

test('rejects figmaOld that is not a string or null', () => {
  const bad = { version: 1, tokens: [{ ...validRow, figmaOld: 42 }] };
  assert.throws(() => loadCrosswalk(writeTemp(bad)), /figmaOld must be a string or null/);
});

test('rejects a row missing figmaOld entirely', () => {
  const row = { ...validRow };
  delete row.figmaOld;
  const bad = { version: 1, tokens: [row] };
  assert.throws(() => loadCrosswalk(writeTemp(bad)), /figmaOld must be a string or null/);
});

test('rejects duplicate newToken', () => {
  const dup = { version: 1, tokens: [validRow, { ...validRow }] };
  assert.throws(() => loadCrosswalk(writeTemp(dup)), /duplicate newToken/);
});

test('rejects a missing or wrong version', () => {
  assert.throws(() => loadCrosswalk(writeTemp({ tokens: [validRow] })), /version/);
  assert.throws(() => loadCrosswalk(writeTemp({ version: 99, tokens: [validRow] })), /version/);
});

test('rejects an unknown top-level key', () => {
  const bad = { version: 1, tokens: [validRow], bogus: true };
  assert.throws(() => loadCrosswalk(writeTemp(bad)), /unknown key|unexpected key/i);
});

test('rejects an unknown row key (typo guard)', () => {
  const bad = { version: 1, tokens: [{ ...validRow, codeToken: ['oops'] }] };
  assert.throws(() => loadCrosswalk(writeTemp(bad)), /unknown key|unexpected key/i);
});

test('accepts a row with all valid keys including optional recommendedSemantic', () => {
  assert.doesNotThrow(() => loadCrosswalk(writeTemp({ version: 1, tokens: [validRow] })));
});

test('rolls up status counts in camelCase', () => {
  const doc = {
    version: 1,
    tokens: [
      { ...validRow, newToken: 'a', status: 'aligned' },
      { ...validRow, newToken: 'b', status: 'renamed' },
      { ...validRow, newToken: 'c', status: 'drift-fix' },
      { ...validRow, newToken: 'd', status: 'added', figmaOld: null },
      { ...validRow, newToken: 'e', status: 'mapped-nearest' },
      { ...validRow, newToken: 'f', status: 'renamed' },
    ],
  };
  const counts = statusCounts(loadCrosswalk(writeTemp(doc)));
  assert.deepEqual(counts, { aligned: 1, renamed: 2, driftFix: 1, added: 1, mappedNearest: 1 });
});

test('exposes the enum and the kebab->camel map', () => {
  assert.deepEqual(STATUS_VALUES, ['aligned', 'renamed', 'drift-fix', 'added', 'mapped-nearest']);
  assert.equal(STATUS_COUNT_KEY['drift-fix'], 'driftFix');
  assert.equal(STATUS_COUNT_KEY['mapped-nearest'], 'mappedNearest');
});
