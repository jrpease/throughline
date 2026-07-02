import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitCursor } from './emit-cursor.mjs';

const model = {
  mcp: { mcpServers: { 'figma-console': { command: 'npx' } } },
  skills: [{ name: 'token-builder', description: 'Build tokens.\nUse when X.', body: 'Read ${CLAUDE_PLUGIN_ROOT}/references/x.md.' }],
  commands: [{ name: 'start', description: 'Start.', body: 'Invoke the `figma-environment-setup` skill.' }],
};

test('emitCursor produces a description-triggered rule per skill', () => {
  const files = emitCursor(model);
  const rule = files.find((f) => f.path === '.cursor/rules/token-builder.mdc');
  assert.ok(rule, 'rule file exists');
  assert.match(rule.content, /^---\ndescription: Build tokens\. Use when X\.\nalwaysApply: false\n---\n/);
  assert.match(rule.content, /Read \.throughline\/references\/x\.md\./);
  assert.doesNotMatch(rule.content, /CLAUDE_PLUGIN_ROOT/);
});

test('emitCursor writes commands and mcp.json', () => {
  const files = emitCursor(model);
  const cmd = files.find((f) => f.path === '.cursor/commands/start.md');
  assert.match(cmd.content, /Invoke the `figma-environment-setup` rule\./);
  const mcp = files.find((f) => f.path === '.cursor/mcp.json');
  assert.match(mcp.content, /"figma-console"/);
});
