// Checks that every documented install set is closed under relative imports.
//
// The copy lists skills follow to put scripts into a consumer's repo are not
// documentation about an install — they are the install. A list that omits a
// file one of its scripts imports ships a gate that throws ERR_MODULE_NOT_FOUND
// before it checks anything. Every other gate here runs scripts in place, where
// every sibling already exists, so that miss stays green. It shipped twice on
// the same list (#103, then #105). This reads the lists from the docs
// themselves, never a copy of them, and follows each listed script's relative
// imports transitively:
//
//   - the "Documentation scripts — install as a set" table in scripts/README.md
//   - every `src` → `dest` copy line in skills/*/SKILL.md, one list per skill
//
// It also checks the file and npm-script counts restated in prose about the
// docs set ("the same eight files"), which drift from the table independently.
//
// Imports are found by regex, not a parser — `ci/` is stdlib-only. A missed
// import form fails open, so keep scripts/ to static `from './x.mjs'` imports.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DOCS_SET_MARKER = '**Documentation scripts — install as a set.**';

// Parses the docs install-set table. Returns null when the marker is gone, so
// a renamed heading fails loudly instead of checking an empty list. The set
// installs into the consumer's scripts/ with its layout intact, so dest = src.
export function parseDocsSet(readme) {
  const start = readme.indexOf(DOCS_SET_MARKER);
  if (start === -1) return null;
  const end = readme.indexOf('\n## ', start);
  const section = readme.slice(start, end === -1 ? undefined : end);
  const entries = [];
  for (const line of section.split('\n')) {
    const match = /^\|\s*`([^`]+)`\s*\|(.*)\|\s*$/.exec(line);
    if (match) entries.push({ src: match[1], dest: match[1], registersScript: !match[2].trim().startsWith('—') });
  }
  return { section, entries };
}

// Parses `- \`lib/x.mjs\` → \`packages/tokens/scripts/lib/x.mjs\`` lines.
export function parseCopyLines(source) {
  const entries = [];
  for (const line of source.split('\n')) {
    const match = /^\s*[-*]\s+`([^`]+)`\s+→\s+`([^`]+)`/.exec(line);
    if (match) entries.push({ src: match[1], dest: match[2] });
  }
  return entries;
}

const IMPORT_RE = /(?:\bfrom|\bimport)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

export function relativeImports(code) {
  return [...code.matchAll(IMPORT_RE)].map((match) => match[1]);
}

const isModule = (path) => /\.m?js$/.test(path);

// `entries` paths are relative to scripts/. `readSource(path)` returns the
// file's text, or null when it does not exist.
export function closureProblems({ label, entries, readSource }) {
  const problems = [];
  const bySrc = new Map(entries.map((entry) => [entry.src, entry]));
  const queue = entries.map((entry) => entry.src).filter(isModule);
  const seen = new Set(queue);
  while (queue.length > 0) {
    const file = queue.shift();
    const code = readSource(file);
    if (code === null) {
      problems.push(`${label}: \`${file}\` does not exist in scripts/`);
      continue;
    }
    const importer = bySrc.get(file);
    for (const specifier of relativeImports(code)) {
      const target = posix.join(posix.dirname(file), specifier);
      const listed = bySrc.get(target);
      if (!listed) {
        problems.push(
          `${label}: \`${file}\` imports \`${specifier}\`, but \`${target}\` is not in the list — ` +
            'a consumer who copies exactly this list cannot run it',
        );
      } else if (importer) {
        const expected = posix.join(posix.dirname(importer.dest), specifier);
        if (listed.dest !== expected) {
          problems.push(
            `${label}: \`${target}\` is copied to \`${listed.dest}\`, but \`${importer.dest}\` imports it from \`${expected}\``,
          );
        }
      }
      if (isModule(target) && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return problems;
}

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
];
const COUNT_RE = new RegExp(`\\b(${NUMBER_WORDS.join('|')}|\\d+)\\s+(?:npm\\s+)?(file|script)s?\\b`, 'gi');

// "the same eight files and register the same four scripts" → two claims.
export function statedCounts(text) {
  return [...text.matchAll(COUNT_RE)].map((match) => {
    const word = match[1].toLowerCase();
    const count = /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS.indexOf(word);
    return { phrase: match[0].replace(/\s+/g, ' '), noun: `${match[2].toLowerCase()}s`, count };
  });
}

export function countProblems({ label, text, entries }) {
  const actual = {
    files: entries.length,
    scripts: entries.filter((entry) => entry.registersScript).length,
  };
  return statedCounts(text)
    .filter(({ noun, count }) => count !== actual[noun])
    .map(
      ({ phrase, noun }) =>
        `${label} says "${phrase}", but the install-set table in scripts/README.md has ${actual[noun]} ${noun}`,
    );
}

// Blank-line-separated paragraphs that point at the docs set by name.
export function paragraphsNamingDocsSet(source) {
  return source.split(/\n\s*\n/).filter((paragraph) => paragraph.replace(/\s+/g, ' ').includes('install as a set'));
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(REPO_ROOT, 'scripts');

function readSource(path) {
  const full = join(SCRIPTS, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

function main() {
  const problems = [];
  const checked = [];
  let skillLists = 0;
  let claims = 0;

  const docsSet = parseDocsSet(readFileSync(join(SCRIPTS, 'README.md'), 'utf8'));
  if (!docsSet || docsSet.entries.length === 0) {
    problems.push(`scripts/README.md: found no install-set table under ${DOCS_SET_MARKER}`);
  } else {
    const label = 'scripts/README.md docs install set';
    problems.push(...closureProblems({ label, entries: docsSet.entries, readSource }));
    problems.push(...countProblems({ label: 'scripts/README.md', text: docsSet.section, entries: docsSet.entries }));
    claims += statedCounts(docsSet.section).length;
    checked.push(`docs set (${docsSet.entries.length} files)`);
  }

  const proseSources = [
    ...readdirSync(join(REPO_ROOT, 'skills')).map((name) => `skills/${name}/SKILL.md`),
    ...readdirSync(join(REPO_ROOT, 'commands')).map((name) => `commands/${name}`),
  ].filter((path) => path.endsWith('.md') && existsSync(join(REPO_ROOT, path)));

  for (const path of proseSources) {
    const source = readFileSync(join(REPO_ROOT, path), 'utf8');
    const entries = parseCopyLines(source);
    if (entries.length > 0) {
      problems.push(...closureProblems({ label: `${path} copy list`, entries, readSource }));
      checked.push(`${path.split('/')[1]} (${entries.length} files)`);
      skillLists += 1;
    }
    if (docsSet) {
      for (const paragraph of paragraphsNamingDocsSet(source)) {
        problems.push(...countProblems({ label: path, text: paragraph, entries: docsSet.entries }));
        claims += statedCounts(paragraph).length;
      }
    }
  }

  if (skillLists === 0) {
    problems.push('found no `src` → `dest` copy lines in any skills/*/SKILL.md — has the list format changed?');
  }

  if (problems.length === 0) {
    console.log(`✓ install sets closed under imports: ${checked.join(', ')}; ${claims} stated count(s) agree`);
    return;
  }
  console.error(`✗ ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
