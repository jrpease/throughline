#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rewritePluginRoot } from './adapters/translate.mjs';

export const BASE = '.throughline';
export const TARGETS = ['cursor', 'codex', 'generic'];
const START = '<!-- throughline:start -->';
const END = '<!-- throughline:end -->';

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
    try {
      const parsed = JSON.parse(existing);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed;
    } catch { /* malformed → start fresh */ }
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
    ...stagePayload(join(pkgRoot, 'scripts'), join(dir, BASE, 'scripts'), (r) => r.startsWith('adapters/') || r.endsWith('.test.mjs')),
  ];
  return { target, dir, written, payload };
}
