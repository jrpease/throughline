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
