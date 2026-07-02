import { translateBody, firstSentence, applyPhrasing } from './translate.mjs';

const BASE = '.throughline';

function indexSection(title, items, ext) {
  const lines = [`## ${title}`, ''];
  for (const it of items) {
    lines.push(`- \`${it.name}\` — ${applyPhrasing(firstSentence(it.description), 'generic')} → read \`${ext(it.name)}\`.`);
  }
  lines.push('');
  return lines.join('\n');
}

export function emitGeneric(model) {
  const files = [];
  const agents = [
    '# ThroughLine (generic AGENTS.md adapter)',
    '',
    'ThroughLine builds a design system end to end. Read the matching skill file for the task at hand.',
    '',
    indexSection('ThroughLine skills', model.skills, (n) => `skills/${n}/SKILL.md`),
    indexSection('ThroughLine commands', model.commands, (n) => `commands/${n}.md`),
    '## MCP servers',
    '',
    'Add the following MCP server to your agent (Figma access):',
    '',
    '```json',
    JSON.stringify(model.mcp, null, 2),
    '```',
    '',
  ].join('\n');
  files.push({ path: 'AGENTS.md', content: agents });

  for (const skill of model.skills) {
    files.push({ path: `skills/${skill.name}/SKILL.md`, content: `${translateBody(skill.body, { baseDir: BASE, target: 'generic' })}\n` });
  }
  for (const cmd of model.commands) {
    files.push({ path: `commands/${cmd.name}.md`, content: `${translateBody(cmd.body, { baseDir: BASE, target: 'generic' })}\n` });
  }
  return files;
}
