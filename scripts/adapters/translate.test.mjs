import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewritePluginRoot, applyPhrasing, translateBody, firstSentence } from './translate.mjs';

test('rewritePluginRoot replaces every occurrence', () => {
  const t = 'Read ${CLAUDE_PLUGIN_ROOT}/references/a.md and ${CLAUDE_PLUGIN_ROOT}/scripts/b.mjs';
  assert.equal(
    rewritePluginRoot(t, '.throughline'),
    'Read .throughline/references/a.md and .throughline/scripts/b.mjs',
  );
});

test('applyPhrasing rewrites a named cross-skill reference per target', () => {
  const t = 'Invoke the `component-builder` skill now.';
  assert.equal(applyPhrasing(t, 'cursor'), 'Invoke the `component-builder` rule now.');
  assert.equal(applyPhrasing(t, 'codex'), 'Invoke the `component-builder` prompt now.');
  assert.equal(applyPhrasing(t, 'generic'), 'Invoke the `component-builder` skill now.');
});

test('translateBody composes path rewrite then phrasing', () => {
  const t = 'See ${CLAUDE_PLUGIN_ROOT}/references/x.md then run the `token-builder` skill.';
  assert.equal(
    translateBody(t, { baseDir: '.throughline', target: 'codex' }),
    'See .throughline/references/x.md then run the `token-builder` prompt.',
  );
});

test('firstSentence extracts the leading sentence', () => {
  assert.equal(firstSentence('Build tokens. Use when the user wants X.'), 'Build tokens.');
  assert.equal(firstSentence('No period here'), 'No period here');
});

test('applyPhrasing rewrites bare Claude to the target agent, without doubling Claude Code', () => {
  assert.equal(applyPhrasing('Connect Claude to Figma.', 'cursor'), 'Connect Cursor to Figma.');
  assert.equal(applyPhrasing('Connect Claude to Figma.', 'codex'), 'Connect Codex to Figma.');
  assert.equal(applyPhrasing('Connect Claude to Figma.', 'generic'), 'Connect the agent to Figma.');
  assert.equal(applyPhrasing('Use Claude Code now.', 'cursor'), 'Use Cursor now.');
});
