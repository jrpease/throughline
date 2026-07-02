import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitCodex } from './emit-codex.mjs';

const model = {
  mcp: { mcpServers: { 'figma-console': { command: 'npx', args: ['-y', 'figma-console-mcp@latest'], env: { FIGMA_ACCESS_TOKEN: '${FIGMA_ACCESS_TOKEN}' } } } },
  skills: [{ name: 'token-builder', description: 'Build tokens. Use when X.', body: 'Use ${CLAUDE_PLUGIN_ROOT}/references/x.md.' }],
  commands: [{ name: 'start', description: 'Start it.', body: 'Invoke the `figma-environment-setup` skill.' }],
};

test('emitCodex builds a routing index in AGENTS.md', () => {
  const files = emitCodex(model);
  const agents = files.find((f) => f.path === 'AGENTS.md');
  assert.match(agents.content, /## ThroughLine skills/);
  assert.match(agents.content, /- `token-builder` — Build tokens\. → load `prompts\/token-builder\.md`\./);
  assert.match(agents.content, /## ThroughLine commands/);
});

test('emitCodex emits translated prompt bodies and a toml mcp config', () => {
  const files = emitCodex(model);
  const prompt = files.find((f) => f.path === 'prompts/token-builder.md');
  assert.match(prompt.content, /Use \.throughline\/references\/x\.md\./);
  const cmd = files.find((f) => f.path === 'prompts/start.md');
  assert.match(cmd.content, /Invoke the `figma-environment-setup` prompt\./);
  const toml = files.find((f) => f.path === 'codex-mcp.toml');
  assert.match(toml.content, /\[mcp_servers\.figma-console\]/);
  assert.match(toml.content, /command = "npx"/);
  assert.match(toml.content, /args = \["-y", "figma-console-mcp@latest"\]/);
});
