import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guard, scanFile } from './guard-token-removal.mjs';

function fixtureTree() {
  const root = mkdtempSync(join(tmpdir(), 'guard-'));
  writeFileSync(join(root, 'app.tsx'), 'const x = "bg-primary-red";\nconst y = 1;\n');
  writeFileSync(join(root, 'clean.ts'), 'const z = "bg-surface";\n');
  mkdirSync(join(root, 'generated'), { recursive: true });
  writeFileSync(join(root, 'generated', 'tokens.ts'), 'export const c = "bg-primary-red";\n');
  writeFileSync(join(root, 'app.test.tsx'), 'expect("bg-primary-red").toBe(x);\n');
  mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(root, 'node_modules', 'pkg', 'index.ts'), 'const m = "bg-primary-red";\n');
  return root;
}

test('scanFile reports each line containing a symbol', () => {
  const root = fixtureTree();
  const hits = scanFile(join(root, 'app.tsx'), ['bg-primary-red']);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 1);
  assert.equal(hits[0].symbol, 'bg-primary-red');
});

test('guard finds references in source, ignoring generated/tests/node_modules', () => {
  const root = fixtureTree();
  const findings = guard(root, ['bg-primary-red']);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, 'app.tsx');
  assert.equal(findings[0].symbol, 'bg-primary-red');
});

test('guard returns empty when no source references remain', () => {
  const root = fixtureTree();
  const findings = guard(root, ['bg-does-not-exist']);
  assert.deepEqual(findings, []);
});

test('guard scans multiple symbols at once', () => {
  const root = fixtureTree();
  const findings = guard(root, ['bg-primary-red', 'bg-surface']);
  const files = findings.map((f) => f.file).sort();
  assert.deepEqual(files, ['app.tsx', 'clean.ts']);
});
