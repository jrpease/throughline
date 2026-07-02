import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSources } from './read-sources.mjs';
import { emitCursor } from './emit-cursor.mjs';
import { emitCodex } from './emit-codex.mjs';
import { emitGeneric } from './emit-generic.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_ROOT = join(REPO_ROOT, 'adapters');

export function generate(model) {
  return { cursor: emitCursor(model), codex: emitCodex(model), generic: emitGeneric(model) };
}

export function writeTargets(outRoot, result) {
  for (const [target, files] of Object.entries(result)) {
    for (const file of files) {
      const abs = join(outRoot, target, file.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.content);
    }
  }
}

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs));
    else out.push(abs);
  }
  return out;
}

// Returns a list of drift descriptions ([] === in sync) comparing result to disk.
export function diffTargets(outRoot, result) {
  const problems = [];
  const expected = new Set();
  for (const [target, files] of Object.entries(result)) {
    for (const file of files) {
      const abs = join(outRoot, target, file.path);
      expected.add(abs);
      if (!existsSync(abs)) { problems.push(`missing: ${target}/${file.path}`); continue; }
      if (readFileSync(abs, 'utf8') !== file.content) problems.push(`changed: ${target}/${file.path}`);
    }
  }
  for (const target of Object.keys(result)) {
    for (const abs of walkFiles(join(outRoot, target))) {
      if (!expected.has(abs)) problems.push(`orphan: ${abs.slice(outRoot.length + 1)}`);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = generate(readSources(REPO_ROOT));
  if (process.argv.includes('--check')) {
    const problems = diffTargets(OUT_ROOT, result);
    if (problems.length) {
      console.error(`✗ adapters out of date (${problems.length}); run: node scripts/adapters/generate.mjs`);
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }
    console.log('✓ adapters in sync');
  } else {
    writeTargets(OUT_ROOT, result);
    const n = Object.values(result).reduce((a, f) => a + f.length, 0);
    console.log(`✓ wrote ${n} adapter files to adapters/`);
  }
}
