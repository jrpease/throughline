import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recordGap, triageGap, docsGapFor, renderReport, serialize, GAP_FILE } from './gap-report.mjs';

const hit = (over = {}) => ({
  side: 'code', screen: 'Book a demo', target: 'apps/web/src/BookDemo.tsx', asked: 'DatePicker',
  resolution: 'left-out', at: '2026-10-14', nearest: [], ...over,
});

test('record: a second screen adds a hit; the same side and screen replaces its own', () => {
  let s = recordGap(null, hit());
  s = recordGap(s, hit({ screen: 'Booking', side: 'figma', target: 'Screens' }));
  s = recordGap(s, hit({ resolution: 'stopped', at: '2026-10-15' }));
  const g = s.gaps.datepicker;
  assert.deepEqual(Object.keys(g.hits).sort(), ['code:bookademo', 'figma:booking']);
  assert.equal(g.hits['code:bookademo'].resolution, 'stopped');
  assert.equal(g.status, 'open');
});

test('record: a folded duplicate joins the gap and keeps the first spelling and kind', () => {
  let s = recordGap(null, hit({ asked: 'DatePicker' }));
  s = recordGap(s, hit({ asked: 'date-picker', screen: 'Other', kind: 'icon' }));
  assert.deepEqual(Object.keys(s.gaps), ['datepicker']);
  assert.equal(s.gaps.datepicker.name, 'DatePicker');
  assert.equal(s.gaps.datepicker.kind, 'component');
});

test('record: a triaged gap keeps its status and note on a new hit', () => {
  let s = recordGap(null, hit());
  s = triageGap(s, { name: 'datepicker', status: 'build', note: 'Q4' }).store;
  s = recordGap(s, hit({ screen: 'Another' }));
  assert.equal(s.gaps.datepicker.status, 'build');
  assert.equal(s.gaps.datepicker.note, 'Q4');
  assert.equal(Object.keys(s.gaps.datepicker.hits).length, 2);
});

test('triage: an unknown name is an error with the nearest gap names', () => {
  const s = recordGap(null, hit());
  const res = triageGap(s, { name: 'DatePickr', status: 'dropped' });
  assert.match(res.error, /no gap named DatePickr/);
  assert.deepEqual(res.nearest, ['DatePicker']);
});

test('report: ranks open gaps by distinct screens, a screen on both sides counting once', () => {
  let s = recordGap(null, hit({ asked: 'Avatar Group', screen: 'Team' }));
  s = recordGap(s, hit({ asked: 'Avatar Group', screen: 'team', side: 'figma', target: 'Screens' }));
  s = recordGap(s, hit({ asked: 'Stepper', screen: 'Checkout' }));
  s = recordGap(s, hit({ asked: 'Stepper', screen: 'Onboarding' }));
  const out = renderReport(s).join('\n');
  assert.ok(out.indexOf('### Stepper (component), 2 screens') < out.indexOf('### Avatar Group (component), 1 screen'));
  assert.match(out, /2 open gaps, 0 triaged/);
});

test('report: a docs gap needs a strict majority of hits used one component; one hit counts', () => {
  const one = recordGap(null, hit({ resolution: 'used:Input' }));
  assert.deepEqual(docsGapFor(one.gaps.datepicker), { name: 'Input', used: 1, of: 1 });
  let even = recordGap(null, hit({ resolution: 'used:Input' }));
  even = recordGap(even, hit({ screen: 'B', resolution: 'left-out' }));
  assert.equal(docsGapFor(even.gaps.datepicker), null);
  even = recordGap(even, hit({ screen: 'C', resolution: 'used:Input' }));
  assert.equal(docsGapFor(even.gaps.datepicker).name, 'Input');
  assert.match(renderReport(even).join('\n'), /Likely a docs gap:\*\* Input was used instead in 2 of 3 asks/);
});

test('report: triaged gaps are grouped under their status', () => {
  let s = recordGap(null, hit());
  s = triageGap(s, { name: 'DatePicker', status: 'exists', note: 'Input type="date"' }).store;
  const out = renderReport(s).join('\n');
  assert.match(out, /0 open gaps, 1 triaged/);
  assert.match(out, /## exists\n\n- DatePicker \(component\), 1 screen: Input type="date"/);
});

test('report: what each screen needed and what it would be built from', () => {
  let s = recordGap(null, hit({ need: 'Pick the demo date.', from: ['Input', 'Button'] }));
  s = recordGap(s, hit({ screen: 'Other', from: ['Popover'] }));
  const out = renderReport(s).join('\n');
  assert.match(out, /\*\*Needed for:\*\* Pick the demo date\. \(Book a demo\)\n/);
  assert.match(out, /\*\*Would be built from:\*\* Input, Button, Popover/);
});

test('triage: a status without a note clears the old note, and open reopens', () => {
  let s = recordGap(null, hit());
  s = triageGap(s, { name: 'DatePicker', status: 'exists', note: 'Input' }).store;
  s = triageGap(s, { name: 'DatePicker', status: 'build' }).store;
  assert.equal(s.gaps.datepicker.note, undefined);
  s = triageGap(s, { name: 'DatePicker', status: 'open' }).store;
  assert.match(renderReport(s).join('\n'), /1 open gap, 0 triaged/);
});

test('serialize sorts keys at every level', () => {
  const text = serialize({ gaps: { b: { z: 1, a: 2 }, a: {} } });
  assert.equal(text, '{\n  "gaps": {\n    "a": {},\n    "b": {\n      "a": 2,\n      "z": 1\n    }\n  }\n}\n');
});

const script = fileURLToPath(new URL('./gap-report.mjs', import.meta.url));
const cli = (dir, ...args) => spawnSync(process.execPath, [script, ...args, '--system', dir], { encoding: 'utf8' });
const recordArgs = ['record', '--side', 'code', '--screen', 'Book a demo', '--target', 'src/BookDemo.tsx',
  '--asked', 'DatePicker', '--resolution', 'left-out', '--at', '2026-10-14', '--nearest', 'Spinner, Input'];

test('cli: record creates the store with sorted keys, report reads it, triage persists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gaps-'));
  assert.equal(cli(dir, ...recordArgs).status, 0);
  const text = readFileSync(join(dir, GAP_FILE), 'utf8');
  assert.equal(text, serialize(JSON.parse(text)));
  assert.deepEqual(JSON.parse(text).gaps.datepicker.nearest, ['Spinner', 'Input']);
  assert.match(cli(dir, 'report').stdout, /### DatePicker \(component\), 1 screen/);
  assert.equal(cli(dir, 'triage', '--name', 'DatePicker', '--status', 'dropped').status, 0);
  assert.equal(JSON.parse(readFileSync(join(dir, GAP_FILE), 'utf8')).gaps.datepicker.status, 'dropped');
});

test('cli: exit codes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gaps-'));
  const none = cli(dir, 'report');
  assert.equal(none.status, 0);
  assert.match(none.stdout, /No gaps recorded yet/);
  assert.equal(cli(dir, ...recordArgs.filter((a, i, all) => a !== '--screen' && all[i - 1] !== '--screen')).status, 2);
  assert.equal(cli(dir, ...recordArgs.map((a) => (a === 'left-out' ? 'invented' : a))).status, 2);
  assert.equal(cli(dir, ...recordArgs, '--kind', 'widget').status, 2);
  assert.equal(cli(dir, ...recordArgs.map((a) => (a === '2026-10-14' ? '14/10/2026' : a))).status, 2);
  assert.equal(cli(dir, ...recordArgs).status, 0);
  assert.equal(cli(dir, 'triage', '--name', 'DatePicker', '--status', 'exists').status, 2);
  const unknown = cli(dir, 'triage', '--name', 'DatePickr', '--status', 'build');
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Nearest: DatePicker/);
  mkdirSync(join(dir, 'bad', 'design-system'), { recursive: true });
  writeFileSync(join(dir, 'bad', GAP_FILE), '[]');
  assert.equal(cli(join(dir, 'bad'), 'report').status, 1);
});
