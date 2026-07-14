import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIndex, buildLlmsTxt, loadAllRecords } from './build-docs-digest.mjs';

const RECORDS = [
  {
    name: 'Button', summary: 'Triggers an action.', description: 'A control…',
    whenToUse: ['Submit a form'], whenNotToUse: ['Navigation'],
    dos: ['Lead with a verb'], donts: ["Don't use for links"],
    tokensUsed: ['color.bg.primary'], status: 'stable',
  },
  { name: 'Input', summary: 'Accepts text.', description: 'A field…' },
];

test('buildIndex maps every record with defaulted fields', () => {
  const index = buildIndex(RECORDS);
  assert.equal(index.components.length, 2);
  const input = index.components.find((c) => c.name === 'Input');
  assert.deepEqual(input.dos, []);
  assert.deepEqual(input.tokensUsed, []);
  assert.equal(input.status, 'draft');
  const button = index.components.find((c) => c.name === 'Button');
  assert.equal(button.description, 'A control…');
});

test('buildLlmsTxt includes each component name and its rules', () => {
  const txt = buildLlmsTxt(RECORDS);
  assert.match(txt, /## Button/);
  assert.match(txt, /## Input/);
  assert.match(txt, /Lead with a verb/);
  assert.match(txt, /Don't use for links/);
});

test('loadAllRecords reads and sorts *.doc.json from the store', () => {
  const root = mkdtempSync(join(tmpdir(), 'digest-'));
  const dir = join(root, 'design-system', 'docs', 'components');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'Button.doc.json'), JSON.stringify(RECORDS[0]));
  writeFileSync(join(dir, 'Input.doc.json'), JSON.stringify(RECORDS[1]));
  writeFileSync(join(dir, 'notes.txt'), 'ignored');
  const loaded = loadAllRecords(root);
  assert.deepEqual(loaded.map((r) => r.name), ['Button', 'Input']);
});
