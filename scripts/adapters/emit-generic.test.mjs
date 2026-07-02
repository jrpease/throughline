import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitGeneric } from './emit-generic.mjs';

const model = {
  mcp: { mcpServers: { 'figma-console': { command: 'npx' } } },
  skills: [{ name: 'token-builder', description: 'Build tokens. Use when X.', body: 'Use ${CLAUDE_PLUGIN_ROOT}/references/x.md.' }],
  commands: [{ name: 'start', description: 'Start it.', body: 'Begin.' }],
};

test('emitGeneric writes an index pointing at skills/ and inline mcp JSON', () => {
  const files = emitGeneric(model);
  const agents = files.find((f) => f.path === 'AGENTS.md');
  assert.match(agents.content, /- `token-builder` — Build tokens\. → read `skills\/token-builder\/SKILL\.md`\./);
  assert.match(agents.content, /"figma-console"/);
});

test('emitGeneric writes translated skill and command bodies', () => {
  const files = emitGeneric(model);
  const skill = files.find((f) => f.path === 'skills/token-builder/SKILL.md');
  assert.match(skill.content, /Use \.throughline\/references\/x\.md\./);
  assert.doesNotMatch(skill.content, /CLAUDE_PLUGIN_ROOT/);
  assert.ok(files.find((f) => f.path === 'commands/start.md'));
});
