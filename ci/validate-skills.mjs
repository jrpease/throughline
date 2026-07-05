// Validates skill frontmatter (skills/*/SKILL.md), command frontmatter
// (commands/*.md), and the manifest doc's example JSON. Pure functions + CLI.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFrontmatter } from './lib/frontmatter.mjs';

export const MAX_DESCRIPTION = 1024;

export function validateSkill({ dirName, source }) {
  let data;
  try {
    ({ data } = parseFrontmatter(source));
  } catch (err) {
    return [`skills/${dirName}/SKILL.md: ${err.message}`];
  }
  const problems = [];
  if (!isNonEmptyString(data.name)) {
    problems.push(`skills/${dirName}/SKILL.md: "name" is required`);
  } else if (data.name !== dirName) {
    problems.push(`skills/${dirName}/SKILL.md: "name" (${data.name}) must equal the directory name (${dirName})`);
  }
  if (!isNonEmptyString(data.description)) {
    problems.push(`skills/${dirName}/SKILL.md: "description" is required`);
  } else if (data.description.length > MAX_DESCRIPTION) {
    problems.push(`skills/${dirName}/SKILL.md: "description" is ${data.description.length} chars (max ${MAX_DESCRIPTION})`);
  }
  return problems;
}

export function validateCommand({ fileName, source }) {
  let data;
  try {
    ({ data } = parseFrontmatter(source));
  } catch (err) {
    return [`commands/${fileName}: ${err.message}`];
  }
  const problems = [];
  if (!isNonEmptyString(data.description)) {
    problems.push(`commands/${fileName}: "description" is required`);
  }
  return problems;
}

export function validateAgent({ fileName, source }) {
  let data;
  try {
    ({ data } = parseFrontmatter(source));
  } catch (err) {
    return [`agents/${fileName}: ${err.message}`];
  }
  const problems = [];
  const expectedName = fileName.replace(/\.md$/, '');
  if (!isNonEmptyString(data.name)) {
    problems.push(`agents/${fileName}: "name" is required`);
  } else if (data.name !== expectedName) {
    problems.push(`agents/${fileName}: "name" (${data.name}) must equal the file name (${expectedName})`);
  }
  if (!isNonEmptyString(data.description)) {
    problems.push(`agents/${fileName}: "description" is required`);
  }
  if (data.model !== 'inherit') {
    problems.push(`agents/${fileName}: "model" must be exactly "inherit" (agents never hardcode a concrete model)`);
  }
  return problems;
}

export function validateManifestDoc(source) {
  const match = source.match(/```json\n([\s\S]*?)\n```/);
  if (!match) {
    return ['references/manifest-schema.md: no ```json example block found'];
  }
  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch (err) {
    return [`references/manifest-schema.md: example JSON does not parse: ${err.message}`];
  }
  if (!Number.isInteger(parsed.schemaVersion)) {
    return ['references/manifest-schema.md: example "schemaVersion" must be an integer'];
  }
  return [];
}

export function validateAgentRouting(source) {
  const missing = ['fast', 'balanced', 'deep'].filter((tier) => !new RegExp(`\`${tier}\``).test(source));
  if (missing.length) {
    return [`references/agent-routing.md: must define tier(s): ${missing.join(', ')}`];
  }
  return [];
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const problems = [];

  const skillsDir = join(REPO_ROOT, 'skills');
  const skillDirs = readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory());
  for (const dirName of skillDirs) {
    const skillPath = join(skillsDir, dirName, 'SKILL.md');
    if (!existsSync(skillPath)) {
      problems.push(`skills/${dirName}: missing SKILL.md`);
      continue;
    }
    problems.push(...validateSkill({ dirName, source: readFileSync(skillPath, 'utf8') }));
  }

  const commandsDir = join(REPO_ROOT, 'commands');
  const commandFiles = readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
  for (const fileName of commandFiles) {
    problems.push(...validateCommand({ fileName, source: readFileSync(join(commandsDir, fileName), 'utf8') }));
  }

  const agentsDir = join(REPO_ROOT, 'agents');
  let agentCount = 0;
  if (existsSync(agentsDir)) {
    const agentFiles = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
    agentCount = agentFiles.length;
    for (const fileName of agentFiles) {
      problems.push(...validateAgent({ fileName, source: readFileSync(join(agentsDir, fileName), 'utf8') }));
    }
  }

  const routingPath = join(REPO_ROOT, 'references', 'agent-routing.md');
  if (existsSync(routingPath)) {
    problems.push(...validateAgentRouting(readFileSync(routingPath, 'utf8')));
  }

  problems.push(...validateManifestDoc(readFileSync(join(REPO_ROOT, 'references', 'manifest-schema.md'), 'utf8')));

  if (problems.length === 0) {
    console.log(`✓ ${skillDirs.length} skills, ${commandFiles.length} commands, ${agentCount} agents, manifest doc OK`);
    return;
  }
  console.error(`✗ ${problems.length} problem(s):`);
  for (const pr of problems) console.error(`  ${pr}`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
