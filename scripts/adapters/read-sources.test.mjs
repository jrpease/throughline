import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, userConfigToEnv } from './read-sources.mjs';

test('parseFrontmatter splits attrs and body', () => {
  const src = '---\nname: token-builder\ndescription: "Build tokens. Use when X."\n---\n# Token builder\n\nBody text.\n';
  const { attrs, body } = parseFrontmatter(src);
  assert.equal(attrs.name, 'token-builder');
  assert.equal(attrs.description, 'Build tokens. Use when X.');
  assert.equal(body, '# Token builder\n\nBody text.\n');
});

test('parseFrontmatter tolerates no frontmatter', () => {
  const { attrs, body } = parseFrontmatter('# Just a heading\n');
  assert.deepEqual(attrs, {});
  assert.equal(body, '# Just a heading\n');
});

test('userConfigToEnv maps a Claude Code user_config reference to its env var', () => {
  assert.equal(
    userConfigToEnv('{"FIGMA_ACCESS_TOKEN": "${user_config.figma_access_token}"}'),
    '{"FIGMA_ACCESS_TOKEN": "${FIGMA_ACCESS_TOKEN}"}',
  );
});
