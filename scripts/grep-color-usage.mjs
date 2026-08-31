// Color-usage grep scaffold: size a codebase's color-decision surface by category.
// Repo-shaped by nature — ships sensible DEFAULT_CATEGORIES and accepts a --config
// override; logs which categories used the assumed default vs. a detected pattern so
// coverage is never silently partial. Zero dependencies.
//
// Usage:
//   node grep-color-usage.mjs --root <dir> [--config <patterns.json>] [--out <counts.json>]
//     patterns.json: { "<category>": { "files": "<regex>", "pattern": "<regex with g flag>" }, ... }
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { walk, DEFAULT_EXCLUDES, SOURCE_EXT } from './lib/source-scan.mjs';

// This script has exported `walk` and DEFAULT_EXCLUDES since it was written;
// keep that surface intact now that both live one file over. SOURCE_EXT is not
// re-exported because it was never exported from here — import it from
// lib/source-scan.mjs. `walk`'s second parameter is now an options object.
export { walk, DEFAULT_EXCLUDES };

// The five categories from the case study. Each: which files it applies to, and the
// (global) match pattern. Tuned defaults — design-system-audit may override per repo.
export const DEFAULT_CATEGORIES = {
  scssColorVars: {
    files: /\.(scss|sass|css)$/,
    pattern: /\$[\w-]*(?:color|colour|primary|secondary|tertiary|grey|gray|red|blue|green|yellow|orange|purple|pink|teal|cyan|black|white|brand|accent|surface|ink)[\w-]*/gi,
  },
  tailwindColorClasses: {
    files: /\.(tsx?|jsx?|html|vue|svelte)$/,
    pattern: /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|placeholder|caret|accent|shadow)-(?:primary|secondary|tertiary|grey|gray|red|blue|green|yellow|orange|purple|pink|teal|cyan|brand|accent|surface|ink)[\w-]*/g,
  },
  jsColorsUsages: {
    files: /\.(tsx?|jsx?|mjs|cjs)$/,
    pattern: /\bColors\.[A-Za-z_$][\w$]*/g,
  },
  rawHexRgba: {
    files: /\.(scss|sass|css|tsx?|jsx?|vue|svelte|html|svg)$/,
    pattern: /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g,
  },
  svgFills: {
    files: /\.svg$/,
    pattern: /(?:fill|stroke)="(?!none|currentColor|url\()[^"]+"/g,
  },
};

// Count matches per category in one file. A category contributes only if its `files`
// regex matches this path. Returns { <category>: count } for every category key.
export function scanFile(path, categories) {
  const counts = {};
  for (const key of Object.keys(categories)) counts[key] = 0;
  const text = readFileSync(path, 'utf8');
  for (const [key, { files, pattern }] of Object.entries(categories)) {
    if (!files.test(path)) continue;
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    const m = text.match(re);
    counts[key] = m ? m.length : 0;
  }
  return counts;
}

export function grepColorUsage(root, categories = DEFAULT_CATEGORIES, excludes = DEFAULT_EXCLUDES) {
  const counts = {};
  for (const key of Object.keys(categories)) counts[key] = 0;
  const byFile = [];
  for (const file of walk(root, { excludes, fileFilter: SOURCE_EXT })) {
    const fileCounts = scanFile(file, categories);
    const total = Object.values(fileCounts).reduce((a, b) => a + b, 0);
    if (total > 0) {
      byFile.push({ file: relative(root, file), counts: fileCounts });
      for (const key of Object.keys(fileCounts)) counts[key] += fileCounts[key];
    }
  }
  return { counts, byFile };
}

// Parse a --config JSON of { category: { files, pattern } } string regexes into RegExp.
function loadCategories(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const out = {};
  for (const [key, { files, pattern }] of Object.entries(raw)) {
    out[key] = { files: new RegExp(files), pattern: new RegExp(pattern, 'g') };
  }
  return out;
}

function main() {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      config: { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (!values.root) {
    console.error('usage: grep-color-usage.mjs --root <dir> [--config <patterns.json>] [--out <counts.json>]');
    process.exit(2);
  }
  const categories = values.config ? loadCategories(values.config) : DEFAULT_CATEGORIES;
  // §11: never let coverage be silently partial — say which patterns were assumed.
  const source = values.config ? `detected (from ${values.config})` : 'ASSUMED defaults';
  console.log(`color-usage grep — pattern source: ${source}`);
  console.log(`categories: ${Object.keys(categories).join(', ')}`);

  const { counts, byFile } = grepColorUsage(values.root, categories);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log('\ncolor-decision surface:');
  for (const [key, n] of Object.entries(counts)) {
    console.log(`  ${key.padEnd(24)} ${n}`);
  }
  console.log(`  ${'TOTAL'.padEnd(24)} ${total}  (across ${byFile.length} file(s))`);
  if (!values.config) {
    console.log('\nnote: patterns are the shipped defaults. Tune them to this repo and re-run with --config for accurate counts.');
  }

  if (values.out) {
    writeFileSync(values.out, JSON.stringify({ counts, byFile }, null, 2) + '\n');
    console.log(`\nwrote ${values.out}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
