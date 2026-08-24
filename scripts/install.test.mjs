import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeAgentsBlock, mergeMcpJson, skipScript } from './install.mjs';

const START = '<!-- throughline:start -->';
const END = '<!-- throughline:end -->';
const BLOCK = '# ThroughLine\n\nindex here';

test('mergeAgentsBlock creates a wrapped block when no file exists', () => {
  const out = mergeAgentsBlock(undefined, BLOCK);
  assert.ok(out.includes(START) && out.includes(END), 'has delimiters');
  assert.ok(out.includes('index here'), 'has block content');
});

test('mergeAgentsBlock appends after existing non-delimited content', () => {
  const out = mergeAgentsBlock('# My project\n\nnotes', BLOCK);
  assert.ok(out.startsWith('# My project'), 'keeps existing content first');
  assert.ok(out.indexOf('My project') < out.indexOf(START), 'block comes after');
});

test('mergeAgentsBlock replaces an existing block in place', () => {
  const first = mergeAgentsBlock('# My project\n', BLOCK);
  const out = mergeAgentsBlock(first, '# ThroughLine\n\nNEW index');
  assert.ok(out.includes('NEW index'), 'has new content');
  assert.ok(!out.includes('index here'), 'old content gone');
  assert.equal(out.match(new RegExp(START, 'g')).length, 1, 'exactly one block');
});

test('mergeAgentsBlock is idempotent', () => {
  const once = mergeAgentsBlock('# My project\n', BLOCK);
  const twice = mergeAgentsBlock(once, BLOCK);
  assert.equal(twice, once);
});

test('mergeMcpJson preserves user servers and adds ours', () => {
  const existing = JSON.stringify({ mcpServers: { other: { command: 'x' } } });
  const parsed = JSON.parse(mergeMcpJson(existing, { 'figma-console': { command: 'figma' } }));
  assert.ok(parsed.mcpServers.other, 'kept user server');
  assert.ok(parsed.mcpServers['figma-console'], 'added ours');
});

test('mergeMcpJson writes ours when no file exists', () => {
  const parsed = JSON.parse(mergeMcpJson(undefined, { 'figma-console': { command: 'figma' } }));
  assert.deepEqual(parsed.mcpServers, { 'figma-console': { command: 'figma' } });
});

test('mergeMcpJson is idempotent', () => {
  const ours = { 'figma-console': { command: 'figma' } };
  const once = mergeMcpJson(undefined, ours);
  assert.equal(mergeMcpJson(once, ours), once);
});

test('mergeMcpJson recovers from malformed existing JSON', () => {
  const parsed = JSON.parse(mergeMcpJson('{ not valid json', { 'figma-console': { command: 'figma' } }));
  assert.ok(parsed.mcpServers['figma-console'], 'still yields our config');
});

import { mkdtempSync, readFileSync as rfs, existsSync as exists, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from './install.mjs';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const toPosix = (p) => p.split(sep).join('/');

function walkTree(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTree(abs, base));
    else out.push(toPosix(relative(base, abs)));
  }
  return out;
}

const freshDir = (tag) => mkdtempSync(join(tmpdir(), `tl-${tag}-`));

test('cursor install writes rules, merged mcp.json, and payload', () => {
  const dir = freshDir('cursor');
  const res = install({ target: 'cursor', dir, pkgRoot: PKG_ROOT });
  const files = walkTree(dir);
  assert.ok(files.some((f) => f.startsWith('.cursor/rules/') && f.endsWith('.mdc')), 'has rules');
  assert.ok(files.includes('.cursor/mcp.json'), 'has mcp.json');
  assert.ok(files.some((f) => f.startsWith('.throughline/references/')), 'has references');
  assert.ok(files.some((f) => f.startsWith('.throughline/scripts/')), 'has scripts');
  assert.ok(res.written.length > 0 && res.payload.length > 0);
});

test('codex/generic install merges a single AGENTS.md block', () => {
  for (const target of ['codex', 'generic']) {
    const dir = freshDir(target);
    install({ target, dir, pkgRoot: PKG_ROOT });
    const agents = rfs(join(dir, 'AGENTS.md'), 'utf8');
    assert.equal(agents.match(/throughline:start/g).length, 1, `${target}: one start marker`);
    assert.equal(agents.match(/throughline:end/g).length, 1, `${target}: one end marker`);
  }
});

test('no installed file leaks CLAUDE_PLUGIN_ROOT, and scripts/adapters is excluded', () => {
  const dir = freshDir('leak');
  install({ target: 'generic', dir, pkgRoot: PKG_ROOT });
  const files = walkTree(dir);
  assert.ok(!files.some((f) => f.startsWith('.throughline/scripts/adapters/')), 'adapters excluded');
  assert.ok(!files.includes('.throughline/scripts/install.mjs'), 'installer itself excluded');
  for (const f of files) {
    if (/\.(md|mdc|json|mjs|toml|txt)$/.test(f)) {
      assert.doesNotMatch(rfs(join(dir, f), 'utf8'), /CLAUDE_PLUGIN_ROOT/, `${f} leaked the var`);
    }
  }
});

test('a second install produces a byte-identical tree (idempotent)', () => {
  for (const target of ['cursor', 'codex', 'generic']) {
    const dir = freshDir(`idem-${target}`);
    install({ target, dir, pkgRoot: PKG_ROOT });
    const snap1 = walkTree(dir).sort().map((f) => [f, rfs(join(dir, f), 'utf8')]);
    install({ target, dir, pkgRoot: PKG_ROOT });
    const snap2 = walkTree(dir).sort().map((f) => [f, rfs(join(dir, f), 'utf8')]);
    assert.deepEqual(snap2, snap1, `${target}: byte-identical on reinstall`);
  }
});

test('install throws on an unknown target', () => {
  assert.throws(() => install({ target: 'windsurf', dir: freshDir('bad'), pkgRoot: PKG_ROOT }), /unknown target/);
});

import { execFileSync } from 'node:child_process';
import { parseArgs } from './install.mjs';

const INSTALL = join(PKG_ROOT, 'scripts', 'install.mjs');

test('parseArgs reads command, target, and dir', () => {
  const a = parseArgs(['init', '--target=codex', '--dir=/tmp/x']);
  assert.equal(a.cmd, 'init');
  assert.equal(a.target, 'codex');
  assert.equal(a.dir, '/tmp/x');
});

test('parseArgs flags --help', () => {
  assert.equal(parseArgs(['--help']).help, true);
});

test('CLI init installs into --dir and prints a summary', () => {
  const dir = freshDir('cli');
  const out = execFileSync('node', [INSTALL, 'init', '--target=cursor', `--dir=${dir}`], { encoding: 'utf8' });
  assert.match(out, /installed cursor adapter/);
  assert.ok(exists(join(dir, '.cursor', 'mcp.json')), 'wrote mcp.json');
});

test('CLI exits non-zero on a bad target', () => {
  assert.throws(() => execFileSync('node', [INSTALL, 'init', '--target=nope'], { stdio: 'pipe' }));
});

test('skipScript excludes plugin-internal scripts, adapters and tests', () => {
  assert.ok(skipScript('install.mjs'), 'the installer itself');
  assert.ok(skipScript('build-doc-card-builder.mjs'), 'generator, never run downstream');
  assert.ok(skipScript('build-native-adapter-config.mjs'), 'generator, never run downstream');
  assert.ok(skipScript('lib/doc-card-render.figma.js'), 'read only by the generator');
  assert.ok(skipScript('docs-check.test.mjs'), 'tests stay in the plugin');
  assert.ok(skipScript('adapters/generate.mjs'), 'adapters have their own target');
});

test('skipScript keeps every script a consuming repo runs', () => {
  for (const keep of [
    'build-docs-digest.mjs', 'docs-check.mjs', 'docs-lint.mjs',
    'lib/doc-record.mjs', 'lib/doc-card-plan.mjs',
    'validate-crosswalk.mjs', 'lib/crosswalk.mjs',
    'lib/native-literal.mjs',
  ]) {
    assert.ok(!skipScript(keep), `${keep} must be installed`);
  }
});

import { symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('npx-style invocation through a node_modules/.bin symlink actually installs', () => {
  const binDir = freshDir('npx-bin');
  const workDir = freshDir('npx-work');
  const symlinkPath = join(binDir, 'throughline');
  symlinkSync(INSTALL, symlinkPath);

  const res = spawnSync('node', [symlinkPath, 'init', '--target=generic'], {
    cwd: workDir,
    encoding: 'utf8',
  });

  assert.equal(res.status, 0, `expected exit 0, got ${res.status}; stderr: ${res.stderr}`);
  assert.ok(exists(join(workDir, 'AGENTS.md')), 'AGENTS.md scaffolded into cwd');
  assert.ok(exists(join(workDir, 'skills')), 'skills/ scaffolded into cwd');
  assert.match(res.stdout, /✓ throughline: installed/, 'prints success line');
});
