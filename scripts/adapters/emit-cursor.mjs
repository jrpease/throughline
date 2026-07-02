import { translateBody } from './translate.mjs';

const BASE = '.throughline';

function oneLine(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function yamlString(s) {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function emitCursor(model) {
  const files = [];
  for (const skill of model.skills) {
    const body = translateBody(skill.body, { baseDir: BASE, target: 'cursor' });
    const content = `---\ndescription: ${yamlString(oneLine(skill.description))}\nalwaysApply: false\n---\n${body}\n`;
    files.push({ path: `.cursor/rules/${skill.name}.mdc`, content });
  }
  for (const cmd of model.commands) {
    const body = translateBody(cmd.body, { baseDir: BASE, target: 'cursor' });
    files.push({ path: `.cursor/commands/${cmd.name}.md`, content: `${body}\n` });
  }
  files.push({ path: '.cursor/mcp.json', content: `${JSON.stringify(model.mcp, null, 2)}\n` });
  return files;
}
