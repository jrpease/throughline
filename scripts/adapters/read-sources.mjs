import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { attrs: {}, body: text };
  const attrs = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') v = v.slice(1, -1);
    attrs[kv[1]] = v;
  }
  const body = text.slice(m[0].length).replace(/^\n+/, '');
  return { attrs, body };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function readSources(repoRoot) {
  const plugin = readJson(join(repoRoot, '.claude-plugin', 'plugin.json'));
  const mcp = readJson(join(repoRoot, '.mcp.json'));

  const skillsDir = join(repoRoot, 'skills');
  const skills = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const { attrs, body } = parseFrontmatter(readFileSync(join(skillsDir, d.name, 'SKILL.md'), 'utf8'));
      return { name: attrs.name || d.name, description: attrs.description || '', body };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const cmdDir = join(repoRoot, 'commands');
  const commands = readdirSync(cmdDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { attrs, body } = parseFrontmatter(readFileSync(join(cmdDir, f), 'utf8'));
      return { name: f.replace(/\.md$/, ''), description: attrs.description || '', body };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { plugin, mcp, skills, commands };
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const model = readSources(REPO_ROOT);
  console.log(`skills: ${model.skills.length}, commands: ${model.commands.length}`);
}
