import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walk, DEFAULT_EXCLUDES, SOURCE_EXT, normalizeName } from './source-scan.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'scan-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'src', 'a.tsx'), '');
  writeFileSync(join(root, 'src', 'b.css'), '');
  writeFileSync(join(root, 'src', 'c.md'), '');
  writeFileSync(join(root, 'node_modules', 'd.tsx'), '');
  return root;
}

test('walk applies the caller file filter, not a built-in one', () => {
  const root = fixture();
  const tsx = [...walk(root, { fileFilter: /\.tsx?$/ })].map((f) => f.split('/').pop());
  assert.deepEqual(tsx, ['a.tsx']);
  const src = [...walk(root, { fileFilter: SOURCE_EXT })].map((f) => f.split('/').pop()).sort();
  assert.deepEqual(src, ['a.tsx', 'b.css']);
});

test('walk excludes node_modules by default', () => {
  const files = [...walk(fixture(), { fileFilter: /\.tsx?$/ })];
  assert.equal(
    files.some((f) => f.includes('node_modules')),
    false,
  );
});

test('DEFAULT_EXCLUDES is one array, not two that agree today', () => {
  assert.ok(DEFAULT_EXCLUDES.some((re) => re.test('/x/node_modules/y')));
  assert.ok(DEFAULT_EXCLUDES.some((re) => re.test('/x/dist/y')));
});

// A local `storybook build` leaves minified bundles in packages/ui/storybook-static.
// It is gitignored build output, the same class as dist and .next (#124).
test('walk skips a storybook-static build by default', () => {
  const root = fixture();
  mkdirSync(join(root, 'storybook-static', 'assets'), { recursive: true });
  writeFileSync(join(root, 'storybook-static', 'assets', 'e.js'), '');
  writeFileSync(join(root, 'storybook-static', 'index.html'), '');
  const files = [...walk(root)].map((f) => f.slice(root.length + 1)).sort();
  assert.deepEqual(files, ['src/a.tsx', 'src/b.css']);
});

// The display-name problem, measured: components.built holds "Select Menu"
// while the code exports <SelectMenu>.
test('normalizeName folds display names onto code identifiers', () => {
  assert.equal(normalizeName('Select Menu'), normalizeName('SelectMenu'));
  assert.equal(normalizeName('select_menu'), normalizeName('SelectMenu'));
  assert.notEqual(normalizeName('SelectMenu'), normalizeName('SelectMenuItem'));
});
