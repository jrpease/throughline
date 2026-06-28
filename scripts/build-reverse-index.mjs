// Reverse-index generator: codeToken -> newToken, from crosswalk.json.
// Semi-automates the SCSS/Tailwind swaps. Zero dependencies.
//
// Usage:
//   node build-reverse-index.mjs --crosswalk crosswalk.json --out crosswalk.reverse.json
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadCrosswalk } from './lib/crosswalk.mjs';

export function buildReverseIndex(crosswalk) {
  const raw = {};
  const conflicts = [];
  for (const row of crosswalk.tokens) {
    for (const code of row.codeTokens) {
      if (code in raw && raw[code] !== row.newToken) {
        conflicts.push({ codeToken: code, tokens: [raw[code], row.newToken] });
      } else {
        raw[code] = row.newToken;
      }
    }
  }
  // Sort keys longest-first so a literal find-and-replace can't clobber a longer
  // symbol via a shorter substring (e.g. replace "$blue-100" before "$blue").
  const index = {};
  for (const key of Object.keys(raw).sort((a, b) => b.length - a.length || a.localeCompare(b))) {
    index[key] = raw[key];
  }
  return { index, conflicts };
}

function main() {
  const { values } = parseArgs({
    options: {
      crosswalk: { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (!values.crosswalk || !values.out) {
    console.error('usage: build-reverse-index.mjs --crosswalk <crosswalk.json> --out <reverse.json>');
    process.exit(2);
  }
  const crosswalk = loadCrosswalk(values.crosswalk);
  const { index, conflicts } = buildReverseIndex(crosswalk);
  writeFileSync(values.out, JSON.stringify(index, null, 2) + '\n');
  console.log(`reverse index: ${Object.keys(index).length} code symbol(s) -> ${values.out}`);
  if (conflicts.length) {
    console.error(`\n${conflicts.length} conflict(s) — one code symbol maps to multiple new tokens:`);
    for (const c of conflicts) console.error(`  - ${c.codeToken}: ${c.tokens.join(' vs ')}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
