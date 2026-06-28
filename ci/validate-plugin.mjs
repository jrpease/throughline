// Validates the plugin's two manifest files. Pure function + CLI.
// Run from anywhere: paths resolve relative to this file (repo root is `..`).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function validatePlugin({ plugin, marketplace }) {
  const problems = [];

  // plugin.json
  if (!isNonEmptyString(plugin.name)) {
    problems.push('plugin.json: "name" must be a non-empty string');
  }
  if (!isNonEmptyString(plugin.description)) {
    problems.push('plugin.json: "description" must be a non-empty string');
  }
  if (!isNonEmptyString(plugin.version)) {
    problems.push('plugin.json: "version" must be a non-empty string');
  } else if (!SEMVER.test(plugin.version)) {
    problems.push(`plugin.json: "version" is not valid semver: ${plugin.version}`);
  }
  if (plugin.author === undefined || plugin.author === null) {
    problems.push('plugin.json: "author" is required');
  }
  if (plugin.keywords !== undefined) {
    if (!Array.isArray(plugin.keywords) || !plugin.keywords.every(isNonEmptyString)) {
      problems.push('plugin.json: "keywords" must be an array of non-empty strings');
    }
  }

  // marketplace.json
  if (!isNonEmptyString(marketplace.name)) {
    problems.push('marketplace.json: "name" must be a non-empty string');
  }
  if (marketplace.owner === undefined || marketplace.owner === null) {
    problems.push('marketplace.json: "owner" is required');
  }
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    problems.push('marketplace.json: "plugins" must be a non-empty array');
  } else {
    marketplace.plugins.forEach((p, i) => {
      if (p === null || typeof p !== 'object') {
        problems.push(`marketplace.json: plugins[${i}] must be an object`);
        return;
      }
      if (!isNonEmptyString(p.name)) problems.push(`marketplace.json: plugins[${i}].name must be a non-empty string`);
      if (!isNonEmptyString(p.source)) problems.push(`marketplace.json: plugins[${i}].source must be a non-empty string`);
      if (!isNonEmptyString(p.description)) problems.push(`marketplace.json: plugins[${i}].description must be a non-empty string`);
    });
    if (isNonEmptyString(plugin.name) && !marketplace.plugins.some((p) => p !== null && typeof p === 'object' && p.name === plugin.name)) {
      problems.push(`marketplace.json: no plugin entry has name "${plugin.name}" (must match plugin.json)`);
    }
  }

  return problems;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(path) {
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (err) {
    return { error: `${path}: ${err.message}` };
  }
}

function main() {
  const p = readJson(join(REPO_ROOT, '.claude-plugin', 'plugin.json'));
  const m = readJson(join(REPO_ROOT, '.claude-plugin', 'marketplace.json'));
  const problems = [];
  if (p.error) problems.push(p.error);
  if (m.error) problems.push(m.error);
  if (!p.error && !m.error) {
    problems.push(...validatePlugin({ plugin: p.value, marketplace: m.value }));
  }
  if (problems.length === 0) {
    console.log('✓ plugin.json + marketplace.json OK');
    return;
  }
  console.error(`✗ ${problems.length} problem(s):`);
  for (const pr of problems) console.error(`  ${pr}`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
