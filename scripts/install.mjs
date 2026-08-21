#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, realpathSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rewritePluginRoot } from './adapters/translate.mjs';

export const BASE = '.throughline';
export const TARGETS = ['cursor', 'codex', 'generic'];
const START = '<!-- throughline:start -->';
const END = '<!-- throughline:end -->';

const MCP_NOTE = {
  cursor: 'Figma MCP written to .cursor/mcp.json — restart Cursor to load it.',
  codex: 'Add the [mcp_servers] block from codex-mcp.toml to your Codex config (e.g. ~/.codex/config.toml).',
  generic: 'Add the MCP server shown under "MCP servers" in AGENTS.md to your agent.',
};

const USAGE = `throughline init --target=cursor|codex|generic [--dir=.]

Stamps the ThroughLine adapter for <target> into your project, plus the
runtime payload it reads (.throughline/references, .throughline/scripts).
Safe to re-run: merges AGENTS.md and .cursor/mcp.json non-destructively.`;

export function parseArgs(argv) {
  const args = { cmd: null, target: null, dir: process.cwd(), help: false };
  for (const a of argv) {
    if (a === '--help' || a === '-h') args.help = true;
    else if (a.startsWith('--target=')) args.target = a.slice('--target='.length);
    else if (a.startsWith('--dir=')) args.dir = a.slice('--dir='.length);
    else if (!a.startsWith('-') && !args.cmd) args.cmd = a;
  }
  return args;
}

export function mergeAgentsBlock(existing, block) {
  const wrapped = `${START}\n${block.trim()}\n${END}`;
  if (!existing || !existing.trim()) return `${wrapped}\n`;
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s !== -1 && e !== -1 && e > s) {
    return existing.slice(0, s) + wrapped + existing.slice(e + END.length);
  }
  return `${existing.replace(/\s*$/, '')}\n\n${wrapped}\n`;
}

export function mergeMcpJson(existing, ourServers) {
  let obj = {};
  if (existing) {
    let usable = false;
    try {
      const parsed = JSON.parse(existing);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed;
        usable = true;
      }
    } catch { /* malformed → start fresh */ }
    if (!usable) {
      console.warn('throughline: existing .cursor/mcp.json is not a JSON object; replacing it with the ThroughLine MCP server config.');
    }
  }
  obj.mcpServers = { ...(obj.mcpServers || {}), ...ourServers };
  return `${JSON.stringify(obj, null, 2)}\n`;
}

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_EXT = /\.(md|mdc|mjs|json|toml|txt)$/;
const toPosix = (p) => p.split(sep).join('/');

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, base));
    else out.push(relative(base, abs));
  }
  return out;
}

function writeText(dest, content) {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
}

// Copy a source tree into destRoot, rewriting ${CLAUDE_PLUGIN_ROOT} on text
// files. `skip(relPosix)` drops entries. Returns posix-relative paths written.
function stagePayload(srcRoot, destRoot, skip) {
  const written = [];
  for (const rel of walk(srcRoot)) {
    const relPosix = toPosix(rel);
    if (skip && skip(relPosix)) continue;
    const src = join(srcRoot, rel);
    const dest = join(destRoot, rel);
    mkdirSync(dirname(dest), { recursive: true });
    if (TEXT_EXT.test(rel)) writeFileSync(dest, rewritePluginRoot(readFileSync(src, 'utf8'), BASE));
    else copyFileSync(src, dest);
    written.push(relPosix);
  }
  return written;
}

// Scripts that never run from a consuming repo: the installer itself, the two
// reference-doc generators, and the renderer template one of them inlines (the
// renderer reaches Figma pre-inlined inside references/doc-card-builder.md).
const PLUGIN_INTERNAL = new Set([
  'install.mjs',
  'build-doc-card-builder.mjs',
  'build-native-adapter-config.mjs',
  'lib/doc-card-render.figma.js',
]);

export const skipScript = (relPosix) =>
  relPosix.startsWith('adapters/') || relPosix.endsWith('.test.mjs') || PLUGIN_INTERNAL.has(relPosix);

export function install({ target, dir, pkgRoot = PKG_ROOT }) {
  if (!TARGETS.includes(target)) {
    throw new Error(`unknown target "${target}"; expected one of: ${TARGETS.join(', ')}`);
  }
  const written = [];
  const adapterDir = join(pkgRoot, 'adapters', target);
  for (const rel of walk(adapterDir)) {
    const relPosix = toPosix(rel);
    const src = join(adapterDir, rel);
    const dest = join(dir, rel);
    if (relPosix === 'AGENTS.md') {
      const existing = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
      writeText(dest, mergeAgentsBlock(existing, readFileSync(src, 'utf8')));
    } else if (relPosix === '.cursor/mcp.json') {
      const ours = JSON.parse(readFileSync(src, 'utf8')).mcpServers || {};
      const existing = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
      writeText(dest, mergeMcpJson(existing, ours));
    } else {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
    written.push(relPosix);
  }
  const payload = [
    ...stagePayload(join(pkgRoot, 'references'), join(dir, BASE, 'references')),
    ...stagePayload(join(pkgRoot, 'scripts'), join(dir, BASE, 'scripts'), skipScript),
  ];
  return { target, dir, written, payload };
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  let invoked = process.argv[1];
  try { invoked = realpathSync(invoked); } catch { /* keep original */ }
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectInvocation()) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }
  if (args.cmd !== 'init') { console.error(`✗ unknown command; expected "init"\n\n${USAGE}`); process.exit(1); }
  if (!TARGETS.includes(args.target)) {
    console.error(`✗ --target must be one of: ${TARGETS.join(', ')}\n\n${USAGE}`);
    process.exit(1);
  }
  const res = install({ target: args.target, dir: args.dir });
  console.log(`✓ throughline: installed ${res.target} adapter (${res.written.length} files) + ${res.payload.length}-file runtime payload into ${res.dir}`);
  console.log(`  ${MCP_NOTE[res.target]}`);
}
