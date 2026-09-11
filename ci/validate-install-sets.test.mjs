import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DOCS_SET_MARKER,
  parseDocsSet,
  parseCopyLines,
  relativeImports,
  closureProblems,
  statedCounts,
  countProblems,
  paragraphsNamingDocsSet,
} from './validate-install-sets.mjs';

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url));
const readRealSource = (path) => (existsSync(`${SCRIPTS}${path}`) ? readFileSync(`${SCRIPTS}${path}`, 'utf8') : null);
const fromMap = (files) => (path) => (path in files ? files[path] : null);
const same = (...paths) => paths.map((src) => ({ src, dest: src }));

test('parseDocsSet reads only the table under the marker, and which rows register a script', () => {
  const readme = [
    '| Script | Purpose |',
    '| --- | --- |',
    '| `outside.mjs` | not part of the set |',
    '',
    `${DOCS_SET_MARKER} Copy the two files.`,
    '',
    '| File | npm script |',
    '| --- | --- |',
    '| `check.mjs` | `"check": "node scripts/check.mjs"` |',
    '| `lib/shared.mjs` | — (imported by the above) |',
    '',
    '## Usage',
    '| `after.mjs` | not part of the set either |',
  ].join('\n');
  const { entries, section } = parseDocsSet(readme);
  assert.deepEqual(entries, [
    { src: 'check.mjs', dest: 'check.mjs', registersScript: true },
    { src: 'lib/shared.mjs', dest: 'lib/shared.mjs', registersScript: false },
  ]);
  assert.ok(section.includes('Copy the two files.'));
  assert.ok(!section.includes('Usage'));
});

test('parseDocsSet returns null when the marker is gone', () => {
  assert.equal(parseDocsSet('| `check.mjs` | x |\n'), null);
});

test('parseCopyLines reads src → dest bullets and nothing else', () => {
  const source = [
    'Copy these:',
    '',
    '- `lib/dtcg.mjs` → `packages/tokens/scripts/lib/dtcg.mjs` (required by',
    '  `validate-crosswalk.mjs`)',
    '- `crosswalk.schema.json` → `packages/tokens/crosswalk.schema.json`',
    '- `not-a-copy.mjs` is mentioned here',
  ].join('\n');
  assert.deepEqual(parseCopyLines(source), [
    { src: 'lib/dtcg.mjs', dest: 'packages/tokens/scripts/lib/dtcg.mjs' },
    { src: 'crosswalk.schema.json', dest: 'packages/tokens/crosswalk.schema.json' },
  ]);
});

test('relativeImports finds static, multi-line, side-effect and dynamic imports, and skips packages', () => {
  const code = [
    "import { readFileSync } from 'node:fs';",
    "import { walk } from './lib/source-scan.mjs';",
    'import {',
    '  flattenDtcg,',
    '} from "./dtcg.mjs";',
    "import './side-effect.mjs';",
    "const lazy = await import('../up.mjs');",
    "import StyleDictionary from 'style-dictionary';",
  ].join('\n');
  assert.deepEqual(relativeImports(code), ['./lib/source-scan.mjs', './dtcg.mjs', './side-effect.mjs', '../up.mjs']);
});

test('a list that carries everything its scripts import passes', () => {
  const readSource = fromMap({
    'gate.mjs': "import { a } from './lib/a.mjs';",
    'lib/a.mjs': "import { b } from './b.mjs';",
    'lib/b.mjs': '',
  });
  const entries = same('gate.mjs', 'lib/a.mjs', 'lib/b.mjs');
  assert.deepEqual(closureProblems({ label: 'set', entries, readSource }), []);
});

test('a list missing a direct import fails, naming the importer and the missing file', () => {
  // The #105 shape: the gate imports two libraries and the list carries one.
  const readSource = fromMap({
    'gate.mjs': "import { walk } from './lib/source-scan.mjs';\nimport { flattenDtcg } from './lib/dtcg.mjs';",
    'lib/source-scan.mjs': '',
    'lib/dtcg.mjs': '',
  });
  const problems = closureProblems({ label: 'set', entries: same('gate.mjs', 'lib/source-scan.mjs'), readSource });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /`gate\.mjs` imports `\.\/lib\/dtcg\.mjs`, but `lib\/dtcg\.mjs` is not in the list/);
});

test('a gap behind a gap is reported in the same run', () => {
  const readSource = fromMap({
    'gate.mjs': "import { a } from './lib/a.mjs';",
    'lib/a.mjs': "import { b } from './b.mjs';",
    'lib/b.mjs': '',
  });
  const problems = closureProblems({ label: 'set', entries: same('gate.mjs'), readSource });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /`lib\/a\.mjs` is not in the list/);
  assert.match(problems[1], /`lib\/a\.mjs` imports `\.\/b\.mjs`, but `lib\/b\.mjs` is not in the list/);
});

test('a listed file that does not exist fails', () => {
  const problems = closureProblems({ label: 'set', entries: same('gone.mjs'), readSource: fromMap({}) });
  assert.deepEqual(problems, ['set: `gone.mjs` does not exist in scripts/']);
});

test('a listed import copied to the wrong place fails', () => {
  const readSource = fromMap({ 'gate.mjs': "import { a } from './lib/a.mjs';", 'lib/a.mjs': '' });
  const entries = [
    { src: 'gate.mjs', dest: 'pkg/scripts/gate.mjs' },
    { src: 'lib/a.mjs', dest: 'pkg/scripts/a.mjs' },
  ];
  const problems = closureProblems({ label: 'set', entries, readSource });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /copied to `pkg\/scripts\/a\.mjs`, but `pkg\/scripts\/gate\.mjs` imports it from `pkg\/scripts\/lib\/a\.mjs`/);
});

test('non-module entries are listed but never read for imports', () => {
  const entries = [{ src: 'crosswalk.schema.json', dest: 'pkg/crosswalk.schema.json' }];
  assert.deepEqual(closureProblems({ label: 'set', entries, readSource: fromMap({}) }), []);
});

test('statedCounts reads number words and digits before files, scripts and npm scripts', () => {
  const claims = statedCounts('install the same eight files and register the same four\nnpm scripts, or 1 script');
  assert.deepEqual(claims, [
    { phrase: 'eight files', noun: 'files', count: 8 },
    { phrase: 'four npm scripts', noun: 'scripts', count: 4 },
    { phrase: '1 script', noun: 'scripts', count: 1 },
  ]);
});

test('countProblems flags a prose count that disagrees with the table', () => {
  const entries = [
    { src: 'a.mjs', dest: 'a.mjs', registersScript: true },
    { src: 'lib/b.mjs', dest: 'lib/b.mjs', registersScript: false },
  ];
  assert.deepEqual(countProblems({ label: 'doc', text: 'the two files and one npm script', entries }), []);
  assert.deepEqual(countProblems({ label: 'doc', text: 'the two files and two npm scripts', entries }), [
    'doc says "two npm scripts", but the install-set table in scripts/README.md has 1 scripts',
  ]);
  assert.deepEqual(countProblems({ label: 'doc', text: 'copy the seven files and the one script', entries }), [
    'doc says "seven files", but the install-set table in scripts/README.md has 2 files',
  ]);
});

test('paragraphsNamingDocsSet finds the reference even when it wraps', () => {
  const source = 'Unrelated.\n\nCopy the eight files listed under **Documentation scripts —\ninstall\nas a set**.\n\nAlso unrelated.';
  assert.equal(paragraphsNamingDocsSet(source).length, 1);
});

test('the real docs install set is closed, and dropping lib/dtcg.mjs from it fails', () => {
  const { entries } = parseDocsSet(readFileSync(`${SCRIPTS}README.md`, 'utf8'));
  assert.ok(entries.some((entry) => entry.src === 'validate-adherence.mjs'), 'parsed no adherence row — has the table moved?');
  assert.deepEqual(closureProblems({ label: 'docs set', entries, readSource: readRealSource }), []);

  const without = entries.filter((entry) => entry.src !== 'lib/dtcg.mjs');
  const problems = closureProblems({ label: 'docs set', entries: without, readSource: readRealSource });
  assert.ok(
    problems.some((problem) => problem.includes('`validate-adherence.mjs` imports `./lib/dtcg.mjs`')),
    `expected the #105 gap to be reported, got: ${JSON.stringify(problems)}`,
  );
});
