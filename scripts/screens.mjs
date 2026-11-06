// The composed-screens store: every screen a composer built, with the plan or
// description it was built from and the contract fingerprint of each component it
// used at the time, so drift-check.mjs can say later what moved under it. Run by
// /throughline:compose-code and /throughline:compose-figma (record) and
// /throughline:drift (forget), from the plugin (or .throughline/scripts).
//
//   node scripts/screens.mjs record --system <dir> --side code|figma --screen <name>
//        --target <file or page> --plan <file.json>
//        [--components-page <page>] [--icons-page <page>] [--at <YYYY-MM-DD>]
//        [--file-key <key> --library-pages <page,page>]
//   node scripts/screens.mjs forget --system <dir> --side code|figma --screen <name> [--file-key <key>]
//
// --plan: for code, the plan passed to compose-code.mjs check (its input, not the
//   resolved plan it prints); for figma, the description the build used.
//   --components-page is required for figma in the system's file: the live drift
//   pass reads its inventory from there. A product-file screen may have none.
//   A page name with a comma in it can't be passed in --library-pages.
// --file-key / --library-pages: a figma screen composed in a product file that uses
//   the system as its library (a consumer run). Both or neither. The entry is kept
//   under its own key, so a product file's screen never overwrites the system
//   file's screen of the same name, and drift re-reads it in that file through
//   the library parts on those pages (design-modes Q40–Q43).
//
// STORE: <system>/design-system/screens.json
//   { screens: { "<side>:<folded screen>" | "figma@<fileKey>:<folded screen>": {
//     side, screen, target, at, plan,
//     components: { <components.meta key>: contract fingerprint | null },
//     componentsPage?, iconsPage?, fileKey?, library?: { pages } } } }
//   A code target is stored relative to --system. A re-record replaces the entry.
//
// Exit: 0 ok, 1 a store error (forget with no such entry, unreadable store),
// 2 usage or unreadable input.
//
// Spec: docs/specs/2026-10-14-drift.md
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { composeFold } from './lib/figma-compose.mjs';
import { codeInventory, checkPlan } from './compose-code.mjs';
import { contractOf, serialize, SCREENS_FILE } from './drift-check.mjs';

const SIDES = ['code', 'figma'];
export const screenKey = (side, screen, fileKey) => (fileKey ? `${side}@${fileKey}` : side) + `:${composeFold(screen)}`;

// Every component a figma description instances: a node with `component` (its
// set's name), reached through `children` and through `slots`, the two places
// resolveScreen recurses. Starts at the description's root.
export function describedComponents(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.root) return describedComponents(node.root, out);
  if (typeof node.component === 'string') out.push(node.component);
  for (const children of Object.values(node.slots ?? {})) for (const c of Array.isArray(children) ? children : []) describedComponents(c, out);
  for (const c of Array.isArray(node.children) ? node.children : []) describedComponents(c, out);
  return out;
}

// The names a code plan uses, sub-parts recorded under their owner.
export function plannedComponents(plan, inventory) {
  const res = checkPlan(plan, inventory);
  if (!res.ok) return null;
  return res.plan.components.map((c) => c.partOf ?? c.name);
}

export function recordScreen(store, entry, names, lookup) {
  const components = {};
  for (const name of names) {
    const hit = lookup(name);
    if (hit) components[hit.key] = hit.fingerprint;
  }
  return { screens: { ...(store?.screens ?? {}), [screenKey(entry.side, entry.screen, entry.fileKey)]: { ...entry, components } } };
}

export function forgetScreen(store, side, screen, fileKey) {
  const key = screenKey(side, screen, fileKey);
  if (!store?.screens?.[key]) return null;
  const screens = { ...store.screens };
  delete screens[key];
  return { screens };
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  let values;
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        system: { type: 'string' }, side: { type: 'string' }, screen: { type: 'string' },
        target: { type: 'string' }, plan: { type: 'string' }, at: { type: 'string' },
        'components-page': { type: 'string' }, 'icons-page': { type: 'string' },
        'file-key': { type: 'string' }, 'library-pages': { type: 'string' },
      },
    }));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const usage = (why) => {
    if (why) console.error(why);
    console.error('usage: screens.mjs record|forget --system <dir> --side code|figma --screen <name> … (see the header of screens.mjs)');
    process.exit(2);
  };
  if (!['record', 'forget'].includes(mode) || !values.system) usage();
  if (!SIDES.includes(values.side)) usage(`--side is ${SIDES.join(' or ')}`);
  if (!values.screen?.trim() || !composeFold(values.screen)) usage('--screen needs a name with a letter or digit in it');
  if (values['file-key'] !== undefined && (values.side !== 'figma' || !values['file-key'].trim())) usage('--file-key is a figma product file\'s key');

  const system = values.system;
  const read = (p, what, code = 2) => {
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch (e) {
      console.error(`cannot read ${what} at ${p}: ${e.message}`);
      process.exit(code);
    }
  };
  const file = join(system, SCREENS_FILE);
  const store = existsSync(file) ? read(file, 'the screens store', 1) : null;
  const save = (value) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, serialize(value));
  };

  if (mode === 'forget') {
    const next = forgetScreen(store, values.side, values.screen, values['file-key']);
    if (!next) {
      console.error(`no ${values.side} screen named ${values.screen}${values['file-key'] ? ` in file ${values['file-key']}` : ''} in ${SCREENS_FILE}`);
      process.exit(1);
    }
    save(next);
    console.log(`forgot ${values.screen} (${values.side})`);
    return;
  }

  const missing = ['target', 'plan'].filter((k) => !values[k]?.trim());
  if (missing.length) usage(`record needs --${missing.join(', --')}`);
  if (values.side === 'figma' && !values['components-page'] && !values['file-key']) usage('a figma record needs --components-page (a product-file screen, with --file-key, may leave it out)');
  const libraryPages = (values['library-pages'] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (Boolean(values['file-key']) !== libraryPages.length > 0) usage('a product-file screen needs both --file-key and --library-pages');
  if (values.at && !/^\d{4}-\d{2}-\d{2}$/.test(values.at)) usage('--at is YYYY-MM-DD');
  const manifest = read(join(system, 'design-system.json'), 'the manifest');
  const plan = read(values.plan, 'the plan');
  // The marker the gate wrote, and the frame finalize named, carry the plan's
  // own screen name. Recorded under any other, the screen reads as released on
  // every check and hides whatever breaks later.
  if (plan?.screen !== values.screen) usage(`--screen is "${values.screen}" but the plan's screen is "${plan?.screen}": record it under the plan's name`);
  if (values.side === 'code' && resolve(String(plan.file)) !== resolve(values.target)) {
    usage(`--target is ${values.target} but the plan's file is ${plan.file}: pass the file the screen was written to`);
  }

  let names;
  if (values.side === 'code') {
    const index = read(join(system, 'design-system/docs/index.json'), 'the docs index (run docs:digest first)');
    names = plannedComponents(plan, codeInventory({ manifest, index }));
    if (!names) usage('the plan does not check: record a screen only after compose-code.mjs check and its gate pass');
  } else {
    names = describedComponents(plan);
  }
  const entry = {
    side: values.side,
    screen: values.screen,
    target: values.side === 'code' ? relative(system, resolve(values.target)).split(sep).join('/') : values.target,
    at: values.at ?? new Date().toISOString().slice(0, 10),
    plan,
  };
  if (values.side === 'figma') {
    if (values['components-page']) entry.componentsPage = values['components-page'];
    if (values['icons-page']) entry.iconsPage = values['icons-page'];
    if (values['file-key']) {
      entry.fileKey = values['file-key'];
      entry.library = { pages: libraryPages };
    }
  }
  const next = recordScreen(store, entry, [...new Set(names)], (name) => contractOf(system, manifest, name));
  save(next);
  const recorded = next.screens[screenKey(entry.side, entry.screen, entry.fileKey)].components;
  console.log(`recorded ${values.screen} (${values.side}${entry.fileKey ? `, file ${entry.fileKey}` : ''}), ${Object.keys(recorded).length} components, in ${SCREENS_FILE}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
