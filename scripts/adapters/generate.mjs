import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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

// Returns a list of drift descriptions ([] === in sync) comparing result to disk.
export function diffTargets(outRoot, result) {
  const problems = [];
  for (const [target, files] of Object.entries(result)) {
    for (const file of files) {
      const abs = join(outRoot, target, file.path);
      if (!existsSync(abs)) { problems.push(`missing: ${target}/${file.path}`); continue; }
      if (readFileSync(abs, 'utf8') !== file.content) problems.push(`changed: ${target}/${file.path}`);
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
