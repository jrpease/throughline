import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sliceSections, assertCovered } from './build-native-adapter-config.mjs';

test('sliceSections extracts the text between a marker pair', () => {
  const sections = sliceSections(
    ['before', '// @doc-section alpha', 'const a = 1;', '// @doc-section-end alpha', 'after'].join('\n'),
  );
  assert.equal(sections.get('alpha'), 'const a = 1;');
});

test('sliceSections extracts several sections in order', () => {
  const sections = sliceSections(
    [
      '// @doc-section one',
      'A',
      '// @doc-section-end one',
      '',
      '// @doc-section two',
      'B',
      '// @doc-section-end two',
    ].join('\n'),
  );
  assert.deepEqual([...sections.keys()], ['one', 'two']);
  assert.equal(sections.get('two'), 'B');
});

test('sliceSections throws on an unclosed section', () => {
  assert.throws(
    () => sliceSections(['// @doc-section alpha', 'x'].join('\n')),
    /unclosed/i,
  );
});

test('sliceSections throws when an end marker does not match the open one', () => {
  assert.throws(
    () => sliceSections(['// @doc-section alpha', 'x', '// @doc-section-end beta'].join('\n')),
    /beta/,
  );
});

test('sliceSections throws on a duplicate section id', () => {
  assert.throws(
    () =>
      sliceSections(
        [
          '// @doc-section alpha',
          'x',
          '// @doc-section-end alpha',
          '// @doc-section alpha',
          'y',
          '// @doc-section-end alpha',
        ].join('\n'),
      ),
    /duplicate/i,
  );
});

test('the checked-in reference doc is up to date with the module', async () => {
  const { render, sliceSections: slice, SOURCE, OUT } = await import('./build-native-adapter-config.mjs');
  const { readFileSync } = await import('node:fs');
  assert.equal(readFileSync(OUT, 'utf8'), render(slice(readFileSync(SOURCE, 'utf8'))));
});

test('assertCovered accepts blank lines, comments and markers outside a section', () => {
  assertCovered(
    [
      '// leading banner',
      '',
      '// @doc-section alpha',
      'const a = 1;',
      '// @doc-section-end alpha',
      '',
    ].join('\n'),
  );
});

test('assertCovered rejects module code outside every section', () => {
  assert.throws(
    () =>
      assertCovered(
        [
          "import { readFileSync } from 'node:fs';",
          '// @doc-section alpha',
          'const a = 1;',
          '// @doc-section-end alpha',
        ].join('\n'),
      ),
    (err) => {
      assert.match(err.message, /fall outside every @doc-section pair/);
      assert.match(err.message, /1: import \{ readFileSync \}/);
      return true;
    },
  );
});

test('assertCovered rejects code added after the last section', () => {
  assert.throws(
    () =>
      assertCovered(
        ['// @doc-section alpha', 'const a = 1;', '// @doc-section-end alpha', 'export const b = 2;'].join('\n'),
      ),
    /export const b = 2;/,
  );
});

test('the shipped module has no code outside a documented section', async () => {
  const { SOURCE } = await import('./build-native-adapter-config.mjs');
  const { readFileSync } = await import('node:fs');
  assertCovered(readFileSync(SOURCE, 'utf8'));
});
