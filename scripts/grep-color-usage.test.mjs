import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grepColorUsage, scanFile, DEFAULT_CATEGORIES } from './grep-color-usage.mjs';

function fixtureTree() {
  const root = mkdtempSync(join(tmpdir(), 'grep-color-'));
  // SCSS color vars + a raw hex literal on the same file
  writeFileSync(join(root, 'theme.scss'), '$primary-red: #ff0000;\n$grey-900: #111827;\n.x { color: $primary-red; }\n');
  // Tailwind color classes + a Colors.* usage
  writeFileSync(join(root, 'App.tsx'), 'const c = "bg-primary-red text-grey-900";\nconst d = Colors.primaryRed;\n');
  // SVG hardcoded fill (and one that must be ignored)
  writeFileSync(join(root, 'logo.svg'), '<path fill="#ff0000"/><path fill="none"/><path fill="currentColor"/>\n');
  // excluded surfaces
  mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(root, 'node_modules', 'pkg', 'index.ts'), 'const m = "bg-primary-red";\n');
  mkdirSync(join(root, 'generated'), { recursive: true });
  writeFileSync(join(root, 'generated', 'tokens.scss'), '$primary-red: #ff0000;\n');
  writeFileSync(join(root, 'App.test.tsx'), 'const t = "bg-primary-red";\n');
  return root;
}

test('scanFile counts SCSS color vars in a .scss file', () => {
  const root = fixtureTree();
  const counts = scanFile(join(root, 'theme.scss'), DEFAULT_CATEGORIES);
  // $primary-red (decl + usage) + $grey-900 = 3 occurrences
  assert.equal(counts.scssColorVars, 3);
});

test('scanFile counts raw hex + rgba in any source file', () => {
  const root = fixtureTree();
  const counts = scanFile(join(root, 'theme.scss'), DEFAULT_CATEGORIES);
  assert.equal(counts.rawHexRgba, 2); // #ff0000 and #111827
});

test('scanFile counts Tailwind color classes and Colors.* usages in .tsx', () => {
  const root = fixtureTree();
  const counts = scanFile(join(root, 'App.tsx'), DEFAULT_CATEGORIES);
  assert.equal(counts.tailwindColorClasses, 2); // bg-primary-red, text-grey-900
  assert.equal(counts.jsColorsUsages, 1);        // Colors.primaryRed
});

test('scanFile counts SVG fills but ignores none/currentColor', () => {
  const root = fixtureTree();
  const counts = scanFile(join(root, 'logo.svg'), DEFAULT_CATEGORIES);
  assert.equal(counts.svgFills, 1); // only fill="#ff0000"
});

test('file-type gating: tailwind pattern does not apply to .scss', () => {
  const root = fixtureTree();
  const counts = scanFile(join(root, 'theme.scss'), DEFAULT_CATEGORIES);
  assert.equal(counts.tailwindColorClasses, 0);
});

test('grepColorUsage aggregates counts and honors excludes', () => {
  const root = fixtureTree();
  const { counts } = grepColorUsage(root, DEFAULT_CATEGORIES);
  assert.equal(counts.scssColorVars, 3);      // generated/tokens.scss excluded
  assert.equal(counts.tailwindColorClasses, 2); // node_modules + .test.tsx excluded
  assert.equal(counts.jsColorsUsages, 1);
  assert.equal(counts.rawHexRgba, 3);          // 2 in theme.scss + 1 in logo.svg
  assert.equal(counts.svgFills, 1);
});

test('grepColorUsage reports per-file hits only for files with matches', () => {
  const root = fixtureTree();
  const { byFile } = grepColorUsage(root, DEFAULT_CATEGORIES);
  const files = byFile.map((f) => f.file).sort();
  assert.deepEqual(files, ['App.tsx', 'logo.svg', 'theme.scss']);
});

test('a custom category config overrides the defaults', () => {
  const root = fixtureTree();
  const custom = { brandColors: { files: /\.scss$/, pattern: /\$primary-[\w-]+/g } };
  const { counts } = grepColorUsage(root, custom);
  assert.deepEqual(Object.keys(counts), ['brandColors']);
  assert.equal(counts.brandColors, 2); // decl + usage of $primary-red
});
