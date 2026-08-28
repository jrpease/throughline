// Compiles generated native token output to prove it is buildable, not merely
// well-formed. Kotlin typechecks to bytecode against ci/stubs/*.kt; Swift is
// parsed only, because Tokens.swift imports UIKit and -typecheck must resolve
// imports where -parse need not.
//
// Runs at e2e time, NOT in CI — see ci/README.md for that decision (#81).
// Pure functions + CLI.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

export const STUB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'stubs');

export const PLATFORMS = [
  {
    id: 'kotlin',
    file: 'Tokens.kt',
    compiler: 'kotlinc',
    strength: 'typechecked to bytecode',
  },
  {
    id: 'swift',
    file: 'Tokens.swift',
    compiler: 'swiftc',
    strength: 'parsed only (UIKit unavailable; -typecheck impossible)',
  },
];

export function compileNativeOutput(dir, { allowMissing = false, env } = {}) {
  const results = [];
  for (const platform of PLATFORMS) {
    const source = join(dir, platform.file);
    if (!env.fileExists(source)) {
      results.push({ id: platform.id, status: 'absent', detail: `${platform.file} not present` });
      continue;
    }
    if (!env.commandExists(platform.compiler)) {
      results.push({
        id: platform.id,
        status: allowMissing ? 'skipped' : 'fail',
        detail: `${platform.compiler} not found on PATH`,
      });
      continue;
    }
    const run = platform.id === 'kotlin' ? env.runKotlin(source) : env.runSwift(source);
    if (run.code !== 0) {
      results.push({ id: platform.id, status: 'fail', detail: run.stderr });
    } else if (platform.id === 'kotlin' && !run.classProduced) {
      results.push({
        id: platform.id,
        status: 'fail',
        detail: 'kotlinc exited 0 but produced no Tokens.class',
      });
    } else {
      results.push({ id: platform.id, status: 'pass', detail: platform.strength });
    }
  }
  const compiled = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  return { results, exitCode: failed > 0 ? 1 : 0, compiled, failed };
}

const LABEL = { pass: 'PASS', fail: 'FAIL', absent: '----', skipped: 'SKIP' };

export function formatCompileReport({ results }) {
  const lines = ['compile-native-output — do the emitted native tokens build?', ''];
  for (const r of results) {
    lines.push(`  [${LABEL[r.status]}] ${r.id}: ${r.detail}`);
  }
  lines.push(
    '',
    '  Kotlin is typechecked to bytecode; Swift is parsed only. swiftc -typecheck',
    '  cannot run here: Tokens.swift imports UIKit, which is unavailable on the',
    '  macOS command line. Swift syntax is asserted; Swift types are not.',
  );
  return lines;
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (findFile(full, name)) return true;
    } else if (entry.name === name) {
      return true;
    }
  }
  return false;
}

export function realEnv() {
  return {
    fileExists: (path) => existsSync(path),
    commandExists(cmd) {
      try {
        execFileSync('which', [cmd], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    },
    runKotlin(source) {
      const outDir = mkdtempSync(join(tmpdir(), 'tl-kotlinc-'));
      const stubs = [join(STUB_DIR, 'compose-unit.kt'), join(STUB_DIR, 'compose-graphics.kt')];
      try {
        // execFileSync throws on a non-zero exit and carries stderr on the
        // error. No shell, no pipe — a pipeline would report the wrong status.
        execFileSync('kotlinc', [...stubs, source, '-d', outDir], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        return { code: err.status ?? 1, stderr: String(err.stderr ?? err.message).trim(), classProduced: false };
      }
      return { code: 0, stderr: '', classProduced: findFile(outDir, 'Tokens.class') };
    },
    runSwift(source) {
      try {
        execFileSync('swiftc', ['-parse', source], { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        return { code: err.status ?? 1, stderr: String(err.stderr ?? err.message).trim() };
      }
      return { code: 0, stderr: '' };
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const allowMissing = args.includes('--allow-missing');
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) {
    console.error('usage: node ci/compile-native-output.mjs <dir> [--allow-missing]');
    process.exit(2);
  }
  const outcome = compileNativeOutput(dir, { allowMissing, env: realEnv() });
  for (const line of formatCompileReport(outcome)) console.log(line);
  process.exit(outcome.exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
