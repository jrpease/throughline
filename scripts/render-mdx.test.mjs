import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { renderMdx, storiesBeside, mdxText } from './render-mdx.mjs';
import { fingerprint } from './lib/doc-record.mjs';

// Records and MDX copied from throughline-sample, where these files build in
// Storybook. The renderer must reproduce them byte for byte (#188).
const F = new URL('./lib/fixtures/render-mdx/', import.meta.url);
const read = (p) => readFileSync(new URL(p, F), 'utf8');
const record = (name) => JSON.parse(read(`${name}.doc.json`));
const SCRIPT = new URL('./render-mdx.mjs', import.meta.url).pathname;

test('a component with a stories file renders exactly as the sample (Button)', () => {
  const { text } = renderMdx(record('Button'), { recordFile: 'Button.doc.json', stories: 'Button.stories' });
  assert.equal(text, read('Button/Button.mdx'));
});

test('a component with no stories file gets a titled Meta (Select Menu Item)', () => {
  const { text } = renderMdx(record('SelectMenuItem'), { recordFile: 'SelectMenuItem.doc.json', stories: null });
  assert.equal(text, read('SelectMenu/SelectMenuItem.mdx'));
  assert.match(text, /^<Meta title="Components\/Select Menu Item" \/>$/m);
  assert.doesNotMatch(text, /Stories/);
});

test('record prose with <tags> is escaped so MDX does not read it as JSX (Select)', () => {
  const { text } = renderMdx(record('Select'), { recordFile: 'Select.doc.json', stories: 'Select.stories' });
  assert.equal(text, read('Button/Select.mdx'));
  assert.equal(mdxText('a <select> and {x}'), 'a &lt;select&gt; and &#123;x&#125;');
  assert.equal(mdxText('use `<label>` for <b>'), 'use `<label>` for &lt;b&gt;');
});

test('empty sections are left out, and the fingerprint line is first', () => {
  const r = { name: 'Bare', summary: 'S.', description: 'D.', whenToUse: [], variants: {}, states: {}, accessibility: { keyboard: [], notes: [] } };
  const { text, src } = renderMdx(r, { recordFile: 'Bare.doc.json', stories: null });
  assert.ok(text.startsWith(`{/* docFingerprint: ${src} — generated from Bare.doc.json`));
  assert.doesNotMatch(text, /^## /m);
  assert.ok(text.endsWith('D.\n'));
});

test('cli: writes the file, finds the stories file beside it, prints the stamps', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mdx-'));
  copyFileSync(new URL('Button.doc.json', F), join(dir, 'Button.doc.json'));
  writeFileSync(join(dir, 'Button.stories.tsx'), '');
  assert.equal(storiesBeside(join(dir, 'Button.mdx')), 'Button.stories');
  assert.equal(storiesBeside(join(dir, 'Other.mdx')), null);
  const out = JSON.parse(execFileSync('node', [SCRIPT, join(dir, 'Button.doc.json'), '--out', join(dir, 'Button.mdx')], { cwd: dir, encoding: 'utf8' }));
  const written = readFileSync(join(dir, 'Button.mdx'), 'utf8');
  assert.equal(written, read('Button/Button.mdx'));
  assert.deepEqual(out, { component: 'Button', src: 'e191e5aa0ddd1abe', render: fingerprint(written), file: 'Button.mdx' });
  // The sample's manifest stamp for this very file.
  assert.equal(out.render, 'b869f6dd3d1dbae2');
});
