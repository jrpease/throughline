// Repo-wide token-removal guard: grep .ts/.tsx (minus generated + tests) for
// references to about-to-be-deleted symbols. Zero dependencies.
//
// Cleanup must not proceed until this returns zero references — deleted Tailwind
// utilities become silent no-ops that tsc/build will not catch (guardrail 4).
//
// Usage:
//   node guard-token-removal.mjs --root <dir> --symbols <symbols.txt>
//     symbols file: one symbol per line (blank lines and # comments ignored)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const DEFAULT_EXCLUDES = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)generated(\/|$)/,
  /\.generated\./,
  /\.test\./,
  /\.spec\./,
  /(^|\/)__tests__(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)\.next(\/|$)/,
];

export function* walk(root, excludes = DEFAULT_EXCLUDES) {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (excludes.some((re) => re.test(full))) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full, excludes);
    } else if (/\.tsx?$/.test(full)) {
      yield full;
    }
  }
}

export function scanFile(path, symbols) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    for (const sym of symbols) {
      if (line.includes(sym)) {
        hits.push({ line: i + 1, symbol: sym, text: line.trim() });
      }
    }
  });
  return hits;
}

export function guard(root, symbols, excludes = DEFAULT_EXCLUDES) {
  const findings = [];
  for (const file of walk(root, excludes)) {
    for (const hit of scanFile(file, symbols)) {
      findings.push({ file: relative(root, file), ...hit });
    }
  }
  return findings;
}

function readSymbols(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function main() {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      symbols: { type: 'string' },
    },
  });
  if (!values.root || !values.symbols) {
    console.error('usage: guard-token-removal.mjs --root <dir> --symbols <symbols.txt>');
    process.exit(2);
  }
  const symbols = readSymbols(values.symbols);
  const findings = guard(values.root, symbols);
  if (findings.length === 0) {
    console.log(`token-removal guard: 0 references to ${symbols.length} symbol(s) — safe to remove.`);
    return;
  }
  console.error(`token-removal guard: ${findings.length} remaining reference(s) — do NOT remove yet:`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.symbol}  | ${f.text}`);
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
