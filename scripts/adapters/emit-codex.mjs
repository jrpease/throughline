import { translateBody, firstSentence, applyPhrasing } from './translate.mjs';

const BASE = '.throughline';

function tomlValue(v) {
  if (Array.isArray(v)) return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
  if (v && typeof v === 'object') {
    return `{ ${Object.entries(v).map(([k, x]) => `${k} = ${JSON.stringify(x)}`).join(', ')} }`;
  }
  return JSON.stringify(v);
}

function mcpToToml(mcp) {
  const servers = mcp.mcpServers || {};
  const blocks = [];
  for (const [name, cfg] of Object.entries(servers)) {
    const lines = [`[mcp_servers.${name}]`];
    for (const [k, v] of Object.entries(cfg)) lines.push(`${k} = ${tomlValue(v)}`);
    blocks.push(lines.join('\n'));
  }
  return `${blocks.join('\n\n')}\n`;
}

function indexSection(title, items, note) {
  const lines = [`## ${title}`, ''];
  if (note) { lines.push(note, ''); }
  for (const it of items) {
    lines.push(`- \`${it.name}\` — ${applyPhrasing(firstSentence(it.description), 'codex')} → load \`prompts/${it.name}.md\`.`);
  }
  lines.push('');
  return lines.join('\n');
}

export function emitCodex(model) {
  const files = [];
  const agents = [
    '# ThroughLine (Codex adapter)',
    '',
    'ThroughLine builds a design system end to end. Load the matching prompt for the task at hand.',
    '',
    indexSection('ThroughLine skills', model.skills),
    indexSection('ThroughLine commands', model.commands),
    '## MCP servers',
    '',
    'Figma access is provided by the `figma-console` MCP server. See `codex-mcp.toml` for the config to add to your Codex `mcp_servers`.',
    '',
  ].join('\n');
  files.push({ path: 'AGENTS.md', content: agents });

  for (const skill of model.skills) {
    files.push({ path: `prompts/${skill.name}.md`, content: `${translateBody(skill.body, { baseDir: BASE, target: 'codex' })}\n` });
  }
  for (const cmd of model.commands) {
    files.push({ path: `prompts/${cmd.name}.md`, content: `${translateBody(cmd.body, { baseDir: BASE, target: 'codex' })}\n` });
  }
  files.push({ path: 'codex-mcp.toml', content: mcpToToml(model.mcp) });
  return files;
}
