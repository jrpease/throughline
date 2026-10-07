// Checks that every package the repo tells something to run is pinned to an
// exact version.
//
// The marketplace entry's source is "./", so the whole repository is the
// plugin, and Anthropic's directory review reads every file in it — skills,
// scripts, tests, workflows, docs and history alike. It rejected 0.21.1 for an
// unpinned `npx` in script text after the MCP launcher itself was pinned. A run
// counts as pinned only when its package carries an exact version:
//
//   - `npx`, `bunx`, `pnpm dlx`, `yarn dlx`, `npm exec`: name@1.2.3
//   - `uvx`, `pipx run`: name==1.2.3
//   - `pnpm add`, `npm i`, `npm install`, `yarn add`, `bun add`: name@1.2.3 —
//     an install line is the version a consumer runs, so it is held to the same
//     bar. A bare `npm install` with no package installs the lockfile and passes
//   - a "latest" or "next" tag, or a caret, tilde or star range, is unpinned
//
// Prose that names a runner without a package after it ("started by `npx`")
// is not a run and passes. A run split across a line break is not seen.
//
// Pinning the README's own install command means every release must bump it,
// so this also fails when a pinned @radicool/throughline differs from
// package.json's version.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NPM_RUNNER = /(?<![\w-])(?:npx|bunx|pnpm dlx|yarn dlx|npm exec)((?:\s+-{1,2}[a-z][\w-]*)*)\s+(@?[a-z0-9][\w./-]*(?:@[^\s`'")\]|,]*)?)/gi;
const NPM_INSTALL = /(?<![\w-])(?:pnpm add|npm (?:i|install|add)|yarn add|bun add)((?:\s+-{1,2}[a-z][\w-]*)*)\s+(@?[a-z0-9][\w./-]*(?:@[^\s`'")\]|,]*)?)/gi;
const PY_RUNNER = /(?<![\w-])(?:uvx|pipx run)((?:\s+-{1,2}[a-z][\w-]*)*)\s+([a-z0-9][\w.-]*(?:[=<>~!]=?[^\s`'")\]|,]*)?)/gi;
const LOOSE_TAG = /(?<![\w-])(@?[a-z0-9][\w./-]*@(?:latest|next|[\^~*][^\s`'")\]|,]*))/gi;

const EXACT_NPM = /^(?:@[\w.-]+\/)?[\w.-]+@(?:\d+\.\d+\.\d+(?:-[\w.]+)?|<[\w.-]+>)$/;
const EXACT_PY = /^[\w.-]+==\d+(?:\.\d+)*$/;

export function unpinnedRuns(text) {
  const found = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(NPM_RUNNER)) {
      if (!EXACT_NPM.test(m[2])) found.push({ line: i + 1, run: m[0].trim() });
    }
    for (const m of line.matchAll(NPM_INSTALL)) {
      if (!EXACT_NPM.test(m[2])) found.push({ line: i + 1, run: m[0].trim() });
    }
    for (const m of line.matchAll(PY_RUNNER)) {
      if (!EXACT_PY.test(m[2])) found.push({ line: i + 1, run: m[0].trim() });
    }
    for (const m of line.matchAll(LOOSE_TAG)) {
      if (!found.some((f) => f.line === i + 1 && f.run.includes(m[1]))) found.push({ line: i + 1, run: m[1] });
    }
  });
  return found;
}

export function staleSelfPins(text, version) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/@radicool\/throughline@(\d+\.\d+\.\d+)/g)) {
      if (m[1] !== version) found.push({ line: i + 1, run: m[0] });
    }
  });
  return found;
}

// Files that tell someone to install the current release. CHANGELOG and docs
// pin past releases on purpose.
export const SELF_PIN_FILES = ['README.md', 'scripts/README.md'];

const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|tgz)$/i;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && !BINARY.test(f));
  const problems = [];
  for (const file of files) {
    for (const { line, run } of unpinnedRuns(readFileSync(join(REPO_ROOT, file), 'utf8'))) {
      problems.push(`${file}:${line}: ${run}`);
    }
  }
  const { version } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  for (const file of SELF_PIN_FILES) {
    for (const { line, run } of staleSelfPins(readFileSync(join(REPO_ROOT, file), 'utf8'), version)) {
      problems.push(`${file}:${line}: ${run} — package.json is ${version}`);
    }
  }
  if (problems.length) {
    console.error(`✗ ${problems.length} problem(s) — pin each run to an exact version, and the README's install command to package.json's:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`✓ every package run in ${files.length} files is pinned to an exact version`);
}
