// The records a Figma run keeps when there is no throughline system to hang them
// from (mode b): the file it builds in, the library links it was given, and a
// cache of the library's variable values. Run by /throughline:compose-figma, from
// the plugin (or .throughline/scripts).
//
//   node scripts/design-workspace.mjs workspace get --dir <working directory>
//   node scripts/design-workspace.mjs workspace set --dir <dir> [--file-key <k>] [--library <url>]... [--mode a|b|c]
//   node scripts/design-workspace.mjs cache init --dir <dir> --from <file>    runCompose('library-list') saved unchanged
//   node scripts/design-workspace.mjs cache merge --dir <dir> --from <file>   runCompose('library-import') or a build's staleCache, saved unchanged
//   node scripts/design-workspace.mjs cache get --dir <dir>
//   node scripts/design-workspace.mjs cache missing --dir <dir> [--from <file>]  keys listed that no import has filled: [key]
//     With --from (a fresh library-list), its keys count too, so a variable added since cache init is caught.
//   node scripts/design-workspace.mjs tokens --dir <dir>                      SPEC.library.tokens and TARGET.libraryTokens
//   node scripts/design-workspace.mjs system keys --dir <dir> --from <file> [--library <name>]
//     runCompose('signals') saved unchanged. Records figma.collectionKeys in <dir>/design-system.json:
//     the file's own collection keys (run in the system file), or that library's (a consumer file).
//
// FILES: <dir>/design/workspace.json  { at, fileKey, libraries: [url], mode }
//        the library cache: <dir>/design-system/library-cache.json when <dir> holds
//        design-system.json (a system repo writes nothing under design/), else
//        <dir>/design/library-cache.json
//   { readAt, skipped?: [key], libraries: { <library>: {
//       collections: { <key>: { name, modes: [{ id, name }], variables: [key] } },
//       variables: { <key>: { name, collection, resolvedType, kinds, values: { <mode>: hex | number | null } } } } } }
//   A null value is a reference that couldn't be followed: it can still be bound by
//   name, but never matches a raw value. A collection's variables are the keys
//   library-list named; one with no entry under variables is missing (an import
//   that timed out), and cache missing lists it for re-import. skipped: variables an
//   import couldn't place (their collection couldn't be read); cache missing leaves
//   them out until cache init starts a fresh cache.
//
// tokens prints { colours: { <hex>: [names] }, gap: { <n>: [names] }, radius: { <n>: [names] }, unresolved }
// in the adherence gate's own table shape (lib/figma-adherence.mjs).
//
// Exit: 0 ok, 1 a file error (malformed input or store), 2 usage.
//
// Spec: docs/specs/2026-10-30-design-modes.md (Q6, Q9, Q27, Q29, Q35, Q36)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { serialize } from './gap-report.mjs';

export const WORKSPACE_FILE = 'design/workspace.json';
export const CACHE_FILE = 'design/library-cache.json';
export const SYSTEM_CACHE_FILE = 'design-system/library-cache.json';
export const cacheFileFor = (dir) => (existsSync(join(dir, 'design-system.json')) ? SYSTEM_CACHE_FILE : CACHE_FILE);
const MODES = ['a', 'b', 'c'];

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const today = () => new Date().toISOString().slice(0, 10);

export function setWorkspace(prev, { fileKey, libraries = [], mode, at }) {
  const next = { libraries: [], ...(prev ?? {}) };
  if (fileKey) next.fileKey = fileKey;
  if (mode) next.mode = mode;
  for (const url of libraries) if (!next.libraries.includes(url)) next.libraries.push(url);
  next.at = at;
  return next;
}

// From runCompose('library-list'): { collections: [{ library, key, name, variables? }] }.
// A fresh cache: every collection, no values yet.
export function initCache(list, readAt) {
  if (!isObject(list) || !Array.isArray(list.collections)) throw new Error('expected { collections: [...] } from library-list');
  const libraries = {};
  for (const c of list.collections) {
    if (!c || !c.library || !c.key || !c.name) throw new Error('each collection needs library, key and name');
    const lib = libraries[c.library] || (libraries[c.library] = { collections: {}, variables: {} });
    const variables = Array.isArray(c.variables) ? c.variables.map((v) => v && v.key).filter(Boolean) : [];
    lib.collections[c.key] = { name: c.name, modes: [], variables };
  }
  return { readAt, libraries };
}

// Keys library-list named (at cache init, or in a fresh list) that no merge has filled yet.
export function missingKeys(cache, list) {
  if (list !== undefined && (!isObject(list) || !Array.isArray(list.collections))) {
    throw new Error('expected { collections: [...] } from library-list');
  }
  const filled = new Set(Array.isArray(cache?.skipped) ? cache.skipped : []);
  const listed = [];
  for (const lib of Object.values(cache?.libraries ?? {})) {
    for (const key of Object.keys(lib.variables ?? {})) filled.add(key);
    for (const c of Object.values(lib.collections ?? {})) listed.push(...(c.variables ?? []));
  }
  for (const c of list?.collections ?? []) for (const v of c.variables ?? []) if (v && v.key) listed.push(v.key);
  return [...new Set(listed)].filter((key) => !filled.has(key));
}

// From runCompose('library-import') or a build's staleCache:
// { entries: [{ key, name, resolvedType, kinds, values, collection: { key, name, modes } }],
//   skipped?: [{ key, name }] }.
// Each entry lands in the library that holds its collection; skipped keys go to the
// cache's skipped list, and leave it once they merge as an entry.
export function mergeCache(cache, input) {
  if (!isObject(cache) || !isObject(cache.libraries)) throw new Error('no cache to merge into; run cache init first');
  if (!isObject(input) || !Array.isArray(input.entries)) throw new Error('expected { entries: [...] } from library-import');
  const next = structuredClone(cache);
  const libraryOf = (collectionKey) => Object.keys(next.libraries).find((l) => next.libraries[l].collections[collectionKey]);
  for (const e of input.entries) {
    if (!e || !e.key || !e.name || !e.resolvedType || !isObject(e.values) || !isObject(e.collection) || !e.collection.key) {
      throw new Error(`malformed entry ${JSON.stringify(e && e.name)}: needs key, name, resolvedType, values and collection.key`);
    }
    const library = libraryOf(e.collection.key);
    if (!library) throw new Error(`entry ${e.name} is in collection ${e.collection.name || e.collection.key}, which the cache doesn't hold; re-run cache init`);
    const lib = next.libraries[library];
    if (Array.isArray(e.collection.modes) && e.collection.modes.length) lib.collections[e.collection.key].modes = e.collection.modes;
    lib.variables[e.key] = {
      name: e.name, collection: e.collection.key, resolvedType: e.resolvedType,
      kinds: Array.isArray(e.kinds) ? e.kinds : [], values: e.values,
    };
  }
  if (input.skipped !== undefined && !Array.isArray(input.skipped)) throw new Error('skipped must be [{ key, name }]');
  const skipped = new Set(Array.isArray(next.skipped) ? next.skipped : []);
  for (const s of input.skipped ?? []) {
    if (!s || !s.key) throw new Error(`malformed skipped entry ${JSON.stringify(s)}: needs key`);
    skipped.add(s.key);
  }
  for (const e of input.entries) skipped.delete(e.key);
  if (skipped.size) next.skipped = [...skipped].sort();
  else delete next.skipped;
  return next;
}

// From runCompose('signals'): the keys to record as design-system.json's
// figma.collectionKeys. Without a library, this must be the system file and its own
// collections are taken; with one, that library's connected collections.
export function systemKeysFrom(signals, library) {
  if (!isObject(signals) || !isObject(signals.signals)) throw new Error('expected runCompose(\'signals\') output, saved unchanged');
  const s = signals.signals;
  let keys;
  if (library === undefined) {
    if (!s.manifestFileKey || s.manifestFileKey !== s.openFileKey) {
      throw new Error('not the system file: run this from a compose in the file design-system.json names, or pass --library');
    }
    keys = Array.isArray(signals.localCollectionKeys) ? signals.localCollectionKeys : [];
  } else {
    const all = Array.isArray(s.libraryCollectionKeys) ? s.libraryCollectionKeys : [];
    keys = all.filter((c) => c && c.library === library).map((c) => c.key);
    if (!keys.length) {
      const names = [...new Set(all.map((c) => c && c.library).filter(Boolean))].sort();
      throw new Error(`no connected library named ${library}; connected: ${names.join(', ') || 'none'}`);
    }
  }
  keys = [...new Set(keys.filter((k) => typeof k === 'string' && k))].sort();
  if (!keys.length) throw new Error('no collection keys to record');
  return keys;
}

// Sets figma.collectionKeys and leaves every other field, and its position, alone.
export function withCollectionKeys(manifest, keys) {
  const next = structuredClone(manifest);
  if (!isObject(next.figma)) next.figma = {};
  next.figma.collectionKeys = keys;
  return next;
}

export function tokensFrom(cache) {
  const out = { colours: {}, gap: {}, radius: {}, unresolved: 0 };
  const add = (table, value, name) => {
    const names = table[String(value)] || (table[String(value)] = []);
    if (!names.includes(name)) names.push(name);
  };
  for (const lib of Object.values(cache?.libraries ?? {})) {
    for (const v of Object.values(lib.variables ?? {})) {
      for (const value of Object.values(v.values ?? {})) {
        if (value === null) { out.unresolved += 1; continue; }
        if (v.resolvedType === 'COLOR' && typeof value === 'string') add(out.colours, value.toLowerCase(), v.name);
        if (v.resolvedType === 'FLOAT' && typeof value === 'number') {
          if (v.kinds.includes('gap')) add(out.gap, value, v.name);
          if (v.kinds.includes('radius')) add(out.radius, value, v.name);
        }
      }
    }
  }
  return out;
}

function main() {
  let positionals, values;
  try {
    ({ positionals, values } = parseArgs({
      allowPositionals: true,
      options: {
        dir: { type: 'string' }, from: { type: 'string' }, 'file-key': { type: 'string' },
        library: { type: 'string', multiple: true }, mode: { type: 'string' },
      },
    }));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const usage = (why) => {
    if (why) console.error(why);
    console.error('usage: design-workspace.mjs workspace get|set, cache init|merge|get|missing, tokens, system keys --dir <dir> … (see the header of design-workspace.mjs)');
    process.exit(2);
  };
  const [group, action] = positionals;
  const ok = (group === 'workspace' && ['get', 'set'].includes(action))
    || (group === 'cache' && ['init', 'merge', 'get', 'missing'].includes(action))
    || (group === 'tokens' && action === undefined)
    || (group === 'system' && action === 'keys');
  if (!ok || !values.dir) usage();

  const path = (rel) => join(values.dir, rel);
  const load = (rel) => {
    const file = path(rel);
    if (!existsSync(file)) return null;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      if (!isObject(data)) throw new Error('not an object');
      return data;
    } catch (e) {
      console.error(`cannot read ${file}: ${e.message}`);
      process.exit(1);
    }
  };
  const save = (rel, data) => {
    mkdirSync(dirname(path(rel)), { recursive: true });
    writeFileSync(path(rel), serialize(data));
  };
  const input = () => {
    if (!values.from) usage(`${group} ${action} needs --from <file>`);
    try {
      return JSON.parse(readFileSync(values.from, 'utf8'));
    } catch (e) {
      console.error(`cannot read ${values.from}: ${e.message}`);
      process.exit(1);
    }
  };
  const guard = (fn) => {
    try {
      return fn();
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  };

  if (group === 'workspace' && action === 'get') {
    console.log(JSON.stringify(load(WORKSPACE_FILE), null, 2));
    return;
  }
  if (group === 'workspace') {
    if (values.mode && !MODES.includes(values.mode)) usage(`--mode is ${MODES.join(', ')}`);
    const next = setWorkspace(load(WORKSPACE_FILE), {
      fileKey: values['file-key'], libraries: values.library ?? [], mode: values.mode, at: today(),
    });
    save(WORKSPACE_FILE, next);
    console.log(`wrote ${WORKSPACE_FILE}`);
    return;
  }
  if (group === 'system') {
    if ((values.library ?? []).length > 1) usage('system keys takes one --library');
    const manifestFile = path('design-system.json');
    if (!existsSync(manifestFile)) {
      console.error(`no design-system.json in ${values.dir}`);
      process.exit(1);
    }
    const signals = input();
    const keys = guard(() => systemKeysFrom(signals, values.library?.[0]));
    const manifest = load('design-system.json');
    const reformatted = readFileSync(manifestFile, 'utf8') !== `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync(manifestFile, `${JSON.stringify(withCollectionKeys(manifest, keys), null, 2)}\n`);
    console.log(`recorded ${keys.length} collection keys in design-system.json`);
    if (reformatted) console.log('design-system.json was also rewritten in two-space JSON; nothing else in it changed');
    return;
  }
  const cacheFile = cacheFileFor(values.dir);
  if (group === 'cache' && action === 'get') {
    console.log(JSON.stringify(load(cacheFile), null, 2));
    return;
  }
  if (group === 'cache' && action === 'missing') {
    const list = values.from ? input() : undefined;
    console.log(JSON.stringify(guard(() => missingKeys(load(cacheFile), list))));
    return;
  }
  if (group === 'cache' && action === 'init') {
    const cache = guard(() => initCache(input(), today()));
    save(cacheFile, cache);
    console.log(`wrote ${cacheFile} with ${Object.values(cache.libraries).reduce((n, l) => n + Object.keys(l.collections).length, 0)} collections`);
    return;
  }
  if (group === 'cache') {
    const entries = input();
    const cache = guard(() => mergeCache(load(cacheFile), entries));
    save(cacheFile, cache);
    console.log(`merged ${entries.entries.length} variables into ${cacheFile}`);
    return;
  }
  const cache = load(cacheFile);
  console.log(JSON.stringify(cache ? tokensFrom(cache) : null, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
