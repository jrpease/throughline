// Extracts one version's section from CHANGELOG.md. Pure function + CLI.
// Run from anywhere: paths resolve relative to this file (repo root is `..`).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function extractChangelog(markdown, version) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) {
    throw new Error(`CHANGELOG.md has no section for version ${version}`);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    // Stop at the next section heading or at the link-definition footer.
    if (lines[i].startsWith('## ') || /^\[[^\]]+\]:\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}

function main() {
  const version = process.argv[2];
  if (!version) {
    console.error('usage: node ci/extract-changelog.mjs <version>');
    process.exit(1);
  }
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const markdown = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
  try {
    console.log(extractChangelog(markdown, version));
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
