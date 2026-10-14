// The gap report: every missing part a composer hit (a component, or an icon the
// system doesn't provide), kept in one committed file so the maintainer can see
// what screens keep asking for, and triage it. Run by /throughline:compose-code
// and /throughline:compose-figma (record) and /throughline:gap-report (report,
// triage), from the plugin (or .throughline/scripts).
//
//   node scripts/gap-report.mjs record --system <dir> --side code|figma --screen <name>
//        --target <file or page> --asked <name> --resolution left-out|stopped|used:<Name>
//        [--kind component|icon] [--need <text>] [--from <a,b>] [--nearest <a,b>] [--at <YYYY-MM-DD>]
//   node scripts/gap-report.mjs report --system <dir> [--json]
//   node scripts/gap-report.mjs triage --system <dir> --name <asked>
//        --status build|exists|dropped|open [--note <text>]
//
// STORE: <system>/design-system/gaps.json
//   { gaps: { <folded name>: { name, kind, status, note?, nearest,
//     hits: { "<side>:<folded screen>": { side, screen, target, resolution, need?, from?, at } } } } }
//   One hit per side and screen, latest wins. A re-hit keeps a triaged status.
//   A triage replaces the note: one set without --note clears the old one.
//
// Exit: 0 ok, 1 a store error (unknown gap, unreadable store), 2 usage.
//
// Spec: docs/specs/2026-10-14-gap-report.md
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { composeFold, nearestNames } from './lib/figma-compose.mjs';

export const GAP_FILE = 'design-system/gaps.json';
const SIDES = ['code', 'figma'];
const KINDS = ['component', 'icon'];
const STATUSES = ['open', 'build', 'exists', 'dropped'];

const validResolution = (r) => r === 'left-out' || r === 'stopped' || /^used:\S/.test(String(r));
const list = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);

export function recordGap(store, h) {
  const gaps = { ...(store?.gaps ?? {}) };
  const key = composeFold(h.asked);
  const prev = gaps[key];
  const hit = { side: h.side, screen: h.screen, target: h.target, resolution: h.resolution, at: h.at };
  if (h.need) hit.need = h.need;
  if (h.from?.length) hit.from = h.from;
  gaps[key] = {
    ...(prev ?? { name: h.asked, kind: h.kind ?? 'component', status: 'open' }),
    nearest: h.nearest ?? [],
    hits: { ...(prev?.hits ?? {}), [`${h.side}:${composeFold(h.screen)}`]: hit },
  };
  return { gaps };
}

// { store } on success, { error, nearest } for a name no gap holds.
export function triageGap(store, { name, status, note }) {
  const key = composeFold(name);
  const gap = store?.gaps?.[key];
  if (!gap) return { error: `no gap named ${name}`, nearest: nearestNames(name, Object.values(store?.gaps ?? {}).map((g) => g.name)) };
  const next = { ...gap, status };
  if (note) next.note = note;
  else delete next.note;
  return { store: { gaps: { ...store.gaps, [key]: next } } };
}

const screensOf = (gap) => new Set(Object.values(gap.hits).map((h) => composeFold(h.screen)));

// The existing component most asks used instead, when strictly more than half did:
// { name, used, of }, or null.
export function docsGapFor(gap) {
  const hits = Object.values(gap.hits);
  const counts = {};
  for (const h of hits) if (h.resolution.startsWith('used:')) counts[h.resolution.slice(5)] = (counts[h.resolution.slice(5)] ?? 0) + 1;
  const [top] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return top && top[1] * 2 > hits.length ? { name: top[0], used: top[1], of: hits.length } : null;
}

const RESOLVED = { 'left-out': 'left out', stopped: 'stopped' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function renderReport(store) {
  const gaps = Object.values(store?.gaps ?? {});
  const rank = (a, b) => screensOf(b).size - screensOf(a).size || a.name.localeCompare(b.name);
  const open = gaps.filter((g) => g.status === 'open').sort(rank);
  const out = ['# Gaps', '', `${plural(open.length, 'open gap')}, ${gaps.length - open.length} triaged.`];
  if (open.length) out.push('', '## Open');
  for (const g of open) {
    const hits = Object.values(g.hits).sort((a, b) => a.screen.localeCompare(b.screen) || a.side.localeCompare(b.side));
    out.push('', `### ${g.name} (${g.kind}), ${plural(screensOf(g).size, 'screen')}`, '');
    out.push(`- **Asked for by:** ${hits.map((h) => `${h.screen} (${h.side}: ${h.target}, ${h.at})`).join('; ')}`);
    const needs = hits.filter((h) => h.need).map((h) => `${h.need} (${h.screen})`);
    if (needs.length) out.push(`- **Needed for:** ${needs.join('; ')}`);
    const from = [...new Set(hits.flatMap((h) => h.from ?? []))];
    if (from.length) out.push(`- **Would be built from:** ${from.join(', ')}`);
    const how = {};
    for (const h of hits) {
      const label = RESOLVED[h.resolution] ?? `used ${h.resolution.slice(5)}`;
      how[label] = (how[label] ?? 0) + 1;
    }
    out.push(`- **How people got by:** ${Object.entries(how).map(([l, n]) => `${l} (${n})`).join(', ')}`);
    out.push(`- **Nearest names:** ${g.nearest.length ? g.nearest.join(', ') : 'none close'}`);
    const used = docsGapFor(g);
    if (used) out.push(`- **Likely a docs gap:** ${used.name} was used instead in ${used.used} of ${plural(used.of, 'ask')}. Check ${used.name}'s whenToUse before building a new one.`);
  }
  for (const status of ['build', 'exists', 'dropped']) {
    const done = gaps.filter((g) => g.status === status).sort(rank);
    if (!done.length) continue;
    out.push('', `## ${status}`, '');
    for (const g of done) out.push(`- ${g.name} (${g.kind}), ${plural(screensOf(g).size, 'screen')}${g.note ? `: ${g.note}` : ''}`);
  }
  return out;
}

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
    : v);
export const serialize = (store) => `${JSON.stringify(sortKeys(store), null, 2)}\n`;

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  let values;
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        system: { type: 'string' }, side: { type: 'string' }, screen: { type: 'string' },
        target: { type: 'string' }, asked: { type: 'string' }, resolution: { type: 'string' },
        kind: { type: 'string', default: 'component' }, need: { type: 'string' }, from: { type: 'string' },
        nearest: { type: 'string' }, at: { type: 'string' }, json: { type: 'boolean', default: false },
        name: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' },
      },
    }));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const usage = (why) => {
    if (why) console.error(why);
    console.error('usage: gap-report.mjs record|report|triage --system <dir> … (see the header of gap-report.mjs)');
    process.exit(2);
  };
  if (!['record', 'report', 'triage'].includes(mode) || !values.system) usage();

  const file = join(values.system, GAP_FILE);
  const load = () => {
    if (!existsSync(file)) return null;
    try {
      const store = JSON.parse(readFileSync(file, 'utf8'));
      if (!store || typeof store.gaps !== 'object' || Array.isArray(store.gaps)) throw new Error('no gaps object');
      return store;
    } catch (e) {
      console.error(`cannot read the gap file at ${file}: ${e.message}`);
      process.exit(1);
    }
  };
  const save = (store) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, serialize(store));
  };

  if (mode === 'record') {
    const missing = ['side', 'screen', 'target', 'asked', 'resolution'].filter((k) => !values[k]?.trim());
    if (missing.length) usage(`record needs --${missing.join(', --')}`);
    if (!SIDES.includes(values.side)) usage(`--side is ${SIDES.join(' or ')}`);
    if (!KINDS.includes(values.kind)) usage(`--kind is ${KINDS.join(' or ')}`);
    if (!validResolution(values.resolution)) usage('--resolution is left-out, stopped or used:<Name>');
    if (!composeFold(values.asked)) usage('--asked needs a name with a letter or digit in it');
    if (values.at && !/^\d{4}-\d{2}-\d{2}$/.test(values.at)) usage('--at is YYYY-MM-DD');
    const store = recordGap(load(), {
      side: values.side, screen: values.screen, target: values.target, asked: values.asked,
      resolution: values.resolution, kind: values.kind, need: values.need, from: list(values.from),
      nearest: list(values.nearest), at: values.at ?? new Date().toISOString().slice(0, 10),
    });
    save(store);
    const gap = store.gaps[composeFold(values.asked)];
    console.log(`recorded ${gap.name} (${gap.status}), ${plural(screensOf(gap).size, 'screen')}, in ${GAP_FILE}`);
    return;
  }

  if (mode === 'report') {
    const store = load();
    if (!store) {
      console.log(values.json ? JSON.stringify({ gaps: {} }, null, 2) : `No gaps recorded yet (${GAP_FILE} doesn't exist).`);
      return;
    }
    console.log(values.json ? JSON.stringify(store, null, 2) : renderReport(store).join('\n'));
    return;
  }

  if (!values.name || !values.status) usage('triage needs --name and --status');
  if (!STATUSES.includes(values.status)) usage(`--status is ${STATUSES.join(', ')}`);
  if (values.status === 'exists' && !values.note?.trim()) usage('--status exists needs --note naming the existing component');
  const res = triageGap(load() ?? { gaps: {} }, { name: values.name, status: values.status, note: values.note });
  if (res.error) {
    console.error(`${res.error}${res.nearest.length ? `. Nearest: ${res.nearest.join(', ')}` : ''}`);
    process.exit(1);
  }
  save(res.store);
  console.log(`${values.name} is now ${values.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
