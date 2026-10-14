// Drift: what moved under the things built from the system. Composed screens
// (design-system/screens.json, written by screens.mjs) are re-checked against
// today's components, and generated token output and Figma variables are compared
// to the stamp the last sync left (design-system/token-stamp.json). Run by
// /throughline:drift and /throughline:sync-figma-tokens, and as `drift:check` in CI.
//
//   node scripts/drift-check.mjs check --system <dir> [--json] [--allow-empty]
//   node scripts/drift-check.mjs stamp --system <dir> --out <dir> [--out <dir>...]
//   node scripts/drift-check.mjs stamp-figma --system <dir> --from <live.json>
//   node scripts/drift-check.mjs compare-figma --system <dir> --from <live.json> [--json]
//
// SCREENS: broken (something the screen uses is gone, or its file is), released
//   (the file's marker no longer names this screen: a person took it over), stale
//   (a component's contract fingerprint moved since composition), untracked (a
//   component with no doc record). Figma screens are re-resolved only in the live
//   pass (references/figma-drift.md); here they get the stale check.
// TOKENS: edited, missing or unstamped files under the roots the last stamp recorded.
//   Hashes are over the text with line endings normalised.
// STAMP: { roots, files: { <path from system>: sha256 }, at, figma?: { at, collections } }
//   figma.collections: { "<collection>": { variables, hash } }, as the live reader
//   (the variables snippet in references/figma-drift.md) returns it.
//
// Exit (check): 1 on a broken screen or an edited or missing token file, and when
// nothing was checked unless --allow-empty; else 0. (compare-figma): 1 when a
// collection moved, else 0. 2 usage or unreadable input.
//
// Spec: docs/specs/2026-10-14-drift.md
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { contractFingerprint, loadRecord } from './lib/doc-record.mjs';
import { composeFold } from './lib/figma-compose.mjs';
import { codeInventory, checkPlan, readMarker } from './compose-code.mjs';

export const SCREENS_FILE = 'design-system/screens.json';
export const STAMP_FILE = 'design-system/token-stamp.json';

// The component a name folds to, as `components.built` (what exists) or
// `components.meta` (what's documented, added lazily) spells it, and its contract
// fingerprint now: { key, fingerprint }, fingerprint null without a doc record;
// null when the system has no such component.
export function contractOf(system, manifest, name) {
  const meta = manifest?.components?.meta ?? {};
  const fold = composeFold(name);
  const key = Object.keys(meta).find((k) => composeFold(k) === fold)
    ?? (manifest?.components?.built ?? []).find((k) => composeFold(k) === fold);
  if (key === undefined) return null;
  const path = meta[key]?.doc?.path;
  if (!path || !existsSync(join(system, path))) return { key, fingerprint: null };
  return { key, fingerprint: contractFingerprint(loadRecord(join(system, path))) };
}

// readText(path relative to system) → text, or null when the file is gone.
export function checkScreens(store, { system, manifest, index, readText }) {
  const out = [];
  for (const entry of Object.values(store?.screens ?? {})) {
    const r = { side: entry.side, screen: entry.screen, target: entry.target, broken: [], stale: [], untracked: [], released: false };
    if (entry.side === 'code') {
      const text = readText(entry.target);
      if (text === null) r.broken.push(`${entry.target} is gone`);
      else if (readMarker(text) !== entry.screen) r.released = true;
      else {
        const res = checkPlan(entry.plan, codeInventory({ manifest, index }));
        for (const e of res.errors) {
          const asked = typeof e.asked === 'string' ? e.asked : JSON.stringify(e.asked);
          const offer = e.options?.length ? ` (options now: ${e.options.join(', ')})` : e.nearest?.length ? ` (nearest: ${e.nearest.join(', ')})` : '';
          r.broken.push(`${e.kind} at ${e.path}: ${asked}${offer}`);
        }
      }
    }
    if (!r.released) {
      for (const [key, recorded] of Object.entries(entry.components ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        if (recorded === null) { r.untracked.push(key); continue; }
        // A component gone altogether is the plan check's finding (code) or the
        // live pass's (figma), not a stale contract.
        const now = contractOf(system, manifest, key);
        if (now && now.fingerprint !== recorded) r.stale.push(key);
      }
    }
    out.push(r);
  }
  return out.sort((a, b) => a.screen.localeCompare(b.screen) || a.side.localeCompare(b.side));
}

export const hashText = (text) => createHash('sha256').update(String(text).replace(/\r\n?/g, '\n'), 'utf8').digest('hex');

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

const posix = (p) => p.split(sep).join('/');

// { [path from system]: hash } for every file under the roots (paths from system).
export function hashRoots(system, roots) {
  const files = {};
  for (const root of roots) {
    for (const file of filesUnder(join(system, root))) files[posix(relative(system, file))] = hashText(readFileSync(file, 'utf8'));
  }
  return files;
}

export function checkTokens(stamp, current) {
  if (!stamp?.files) return null;
  const edited = [];
  const missing = [];
  for (const [path, hash] of Object.entries(stamp.files)) {
    if (!(path in current)) missing.push(path);
    else if (current[path] !== hash) edited.push(path);
  }
  const unstamped = Object.keys(current).filter((p) => !(p in stamp.files));
  return { roots: stamp.roots ?? [], edited: edited.sort(), missing: missing.sort(), unstamped: unstamped.sort() };
}

// Stored and live collection fingerprints → { added, changed: [{ name, from, to }], removed },
// from and to being variable counts.
export function compareCollections(stored, live) {
  const added = Object.keys(live).filter((k) => !(k in stored)).sort();
  const removed = Object.keys(stored).filter((k) => !(k in live)).sort();
  const changed = Object.keys(live)
    .filter((k) => k in stored && stored[k].hash !== live[k].hash)
    .sort()
    .map((name) => ({ name, from: stored[name].variables, to: live[name].variables }));
  return { added, changed, removed };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatFigmaComparison(diff) {
  const total = diff.added.length + diff.changed.length + diff.removed.length;
  if (total === 0) return ['Figma variables match the last sync.'];
  const out = [`Figma variables moved since the last sync, in ${plural(total, 'collection')}: re-run /throughline:sync-figma-tokens, whose diff shows each variable.`];
  for (const name of diff.added) out.push(`  added    ${name}`);
  for (const c of diff.changed) out.push(`  changed  ${c.name} (${c.from === c.to ? plural(c.to, 'variable') : `${c.from} → ${c.to} variables`})`);
  for (const name of diff.removed) out.push(`  removed  ${name}`);
  return out;
}

export function counts(screens, tokens) {
  return {
    screens: screens.length,
    broken: screens.filter((s) => s.broken.length).length,
    stale: screens.filter((s) => !s.broken.length && s.stale.length).length,
    released: screens.filter((s) => s.released).length,
    edited: tokens ? tokens.edited.length : 0,
    missing: tokens ? tokens.missing.length : 0,
    unstamped: tokens ? tokens.unstamped.length : 0,
  };
}

export function formatReport(screens, tokens) {
  const out = [];
  if (!screens.length && !tokens) return ['nothing checked: no composed screens recorded and no token stamp'];
  out.push('## Screens', '');
  if (!screens.length) out.push('No composed screens recorded.');
  for (const s of screens) {
    const where = `${s.screen} (${s.side}: ${s.target})`;
    if (s.released) { out.push(`- released  ${where}: its marker is gone, so a person owns it now. Stop tracking it with screens.mjs forget.`); continue; }
    const state = s.broken.length ? 'broken' : s.stale.length ? 'stale' : 'clean';
    out.push(`- ${state.padEnd(8)}  ${where}`);
    for (const b of s.broken) out.push(`    ${b}`);
    if (s.stale.length) out.push(`    contract changed since composition: ${s.stale.join(', ')}`);
    if (s.untracked.length) out.push(`    untracked (no doc record): ${s.untracked.join(', ')}`);
    if (s.side === 'figma' && !s.broken.length) out.push('    the rest is checked live (/throughline:drift with the bridge open)');
  }
  out.push('', '## Token output', '');
  if (!tokens) out.push('No token stamp yet: the next /throughline:sync-figma-tokens writes one.');
  else {
    const n = tokens.edited.length + tokens.missing.length + tokens.unstamped.length;
    if (!n) out.push(`Matches the last sync (${tokens.roots.join(', ')}).`);
    for (const p of tokens.edited) out.push(`- edited     ${p}: generated output changed by hand; the next sync overwrites it`);
    for (const p of tokens.missing) out.push(`- missing    ${p}`);
    for (const p of tokens.unstamped) out.push(`- unstamped  ${p}: not written by the last sync`);
  }
  const c = counts(screens, tokens);
  out.push('', `${c.screens} screens: ${c.broken} broken, ${c.stale} stale, ${c.released} released. Token output: ${c.edited} edited, ${c.missing} missing, ${c.unstamped} unstamped.`);
  return out;
}

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
    : v);
export const serialize = (value) => `${JSON.stringify(sortKeys(value), null, 2)}\n`;

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  let values;
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        system: { type: 'string' }, out: { type: 'string', multiple: true, default: [] },
        from: { type: 'string' }, json: { type: 'boolean', default: false },
        'allow-empty': { type: 'boolean', default: false },
      },
    }));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const usage = (why) => {
    if (why) console.error(why);
    console.error('usage: drift-check.mjs check|stamp|stamp-figma|compare-figma --system <dir> … (see the header of drift-check.mjs)');
    process.exit(2);
  };
  if (!['check', 'stamp', 'stamp-figma', 'compare-figma'].includes(mode) || !values.system) usage();
  const system = values.system;
  const read = (p, what) => {
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch (e) {
      console.error(`cannot read ${what} at ${p}: ${e.message}`);
      process.exit(2);
    }
  };
  const stampPath = join(system, STAMP_FILE);
  const loadStamp = () => (existsSync(stampPath) ? read(stampPath, 'the token stamp') : null);
  const save = (path, value) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serialize(value));
  };
  const today = new Date().toISOString().slice(0, 10);

  if (mode === 'stamp') {
    if (!values.out.length) usage('stamp needs --out with each directory the sync wrote');
    const roots = values.out.map((d) => posix(relative(system, resolve(d))));
    const empty = roots.filter((root) => !Object.keys(hashRoots(system, [root])).length);
    if (empty.length) usage(`no files under ${empty.join(', ')}: pass only the directories the sync wrote`);
    const files = hashRoots(system, roots);
    save(stampPath, { ...(loadStamp() ?? {}), roots, files, at: today });
    console.log(`stamped ${Object.keys(files).length} files under ${roots.join(', ')} in ${STAMP_FILE}`);
    return;
  }

  if (mode === 'stamp-figma' || mode === 'compare-figma') {
    if (!values.from) usage(`${mode} needs --from <live.json>`);
    const live = read(values.from, 'the live variables');
    if (mode === 'stamp-figma') {
      const bad = Object.entries(live).filter(([, v]) => typeof v?.hash !== 'string' || typeof v?.variables !== 'number');
      if (!Object.keys(live).length || bad.length) usage('--from must be the variables snippet\'s result: { "<collection>": { variables, hash } }');
      save(stampPath, { ...(loadStamp() ?? {}), figma: { at: today, collections: live } });
      console.log(`stamped ${Object.keys(live).length} Figma variable collections in ${STAMP_FILE}`);
      return;
    }
    const stored = loadStamp()?.figma?.collections;
    const diff = stored ? compareCollections(stored, live) : null;
    if (values.json) console.log(JSON.stringify(diff ?? { stamped: false }, null, 2));
    else console.log(diff ? formatFigmaComparison(diff).join('\n') : 'No Figma stamp yet: the next /throughline:sync-figma-tokens writes one.');
    process.exit(diff && diff.added.length + diff.changed.length + diff.removed.length ? 1 : 0);
  }

  const manifest = read(join(system, 'design-system.json'), 'the manifest');
  const screensPath = join(system, SCREENS_FILE);
  const store = existsSync(screensPath) ? read(screensPath, 'the screens store') : { screens: {} };
  const hasCode = Object.values(store.screens ?? {}).some((e) => e.side === 'code');
  const index = hasCode ? read(join(system, 'design-system/docs/index.json'), 'the docs index (run docs:digest first)') : null;
  const readText = (p) => (existsSync(join(system, p)) ? readFileSync(join(system, p), 'utf8') : null);
  const screens = checkScreens(store, { system, manifest, index, readText });
  const stamp = loadStamp();
  const tokens = stamp?.files ? checkTokens(stamp, hashRoots(system, stamp.roots ?? [])) : null;
  const c = counts(screens, tokens);
  const empty = !screens.length && !tokens;
  if (values.json) console.log(JSON.stringify({ screens, tokens, counts: c, empty }, null, 2));
  else console.log(formatReport(screens, tokens).join('\n'));
  const failed = c.broken + c.edited + c.missing > 0 || (empty && !values['allow-empty']);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
