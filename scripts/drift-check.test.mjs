import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  contractOf, checkScreens, checkTokens, hashRoots, hashText, compareCollections,
  formatFigmaComparison, formatReport, STAMP_FILE,
  documented, compareComponents, checkCode, formatComponentComparison, CODE_STAMP_FILE,
} from './drift-check.mjs';
import { shapeFingerprint } from './lib/doc-record.mjs';
import { recordScreen, describedComponents, plannedComponents, forgetScreen, screenKey } from './screens.mjs';
import { codeInventory } from './compose-code.mjs';

const write = (dir, path, value) => {
  mkdirSync(join(dir, path, '..'), { recursive: true });
  writeFileSync(join(dir, path), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
};

const BUTTON = { name: 'Button', summary: 'Press it.', description: 'A button.', variants: { size: { sm: 'small', lg: 'large' } } };
const CARD = { name: 'Card', summary: 'Holds things.', description: 'A card.', variants: {} };

// A system with Button and Card documented, Badge built but undocumented.
function system() {
  const dir = mkdtempSync(join(tmpdir(), 'drift-'));
  write(dir, 'design-system.json', {
    components: {
      built: ['Button', 'Card', 'Badge'],
      meta: {
        Button: { doc: { path: 'design-system/docs/components/Button.doc.json' } },
        Card: { doc: { path: 'design-system/docs/components/Card.doc.json' } },
        Badge: {},
      },
    },
  });
  write(dir, 'design-system/docs/components/Button.doc.json', BUTTON);
  write(dir, 'design-system/docs/components/Card.doc.json', CARD);
  writeIndex(dir, [BUTTON, CARD]);
  return dir;
}
const writeIndex = (dir, records) => write(dir, 'design-system/docs/index.json', { components: records.map((r) => ({ name: r.name, summary: r.summary, variants: r.variants })) });
const manifestOf = (dir) => JSON.parse(readFileSync(join(dir, 'design-system.json'), 'utf8'));
const indexOf = (dir) => JSON.parse(readFileSync(join(dir, 'design-system/docs/index.json'), 'utf8'));

const PLAN = { screen: 'Book a demo', file: 'apps/web/BookDemo.tsx', components: [{ name: 'button', variants: { size: 'sm' } }, { name: 'CardHeader' }, { name: 'Badge' }] };
const MARKED = '// Composed by throughline: Book a demo.\nexport default function BookDemo() {}\n';

function recordCode(dir, plan = PLAN) {
  const manifest = manifestOf(dir);
  const names = plannedComponents(plan, codeInventory({ manifest, index: indexOf(dir) }));
  const entry = { side: 'code', screen: plan.screen, target: plan.file, at: '2026-10-14', plan };
  return recordScreen(null, entry, names, (n) => contractOf(dir, manifest, n));
}
const run = (dir, store, files = { 'apps/web/BookDemo.tsx': MARKED }) => checkScreens(store, {
  system: dir, manifest: manifestOf(dir), index: indexOf(dir), readText: (p) => (p in files ? files[p] : null),
});

test('record: sub-parts go under their owner, keys take the meta casing, undocumented is null', () => {
  const dir = system();
  const entry = recordCode(dir).screens[screenKey('code', 'Book a demo')];
  assert.deepEqual(Object.keys(entry.components).sort(), ['Badge', 'Button', 'Card']);
  assert.equal(entry.components.Badge, null);
  assert.deepEqual(entry.plan, PLAN);
});

test('check: a clean screen, with a sub-part in its plan, stays clean', () => {
  const dir = system();
  const [s] = run(dir, recordCode(dir));
  assert.deepEqual([s.broken, s.stale, s.released], [[], [], false]);
  assert.deepEqual(s.untracked, ['Badge']);
});

test('check: a reworded summary is not stale; a new variant is', () => {
  const dir = system();
  const store = recordCode(dir);
  write(dir, 'design-system/docs/components/Button.doc.json', { ...BUTTON, summary: 'Press it now.', updatedAt: '2026-10-15' });
  assert.deepEqual(run(dir, store)[0].stale, []);
  write(dir, 'design-system/docs/components/Button.doc.json', { ...BUTTON, variants: { size: { sm: 's', lg: 'l', xl: 'x' } } });
  assert.deepEqual(run(dir, store)[0].stale, ['Button']);
});

test('check: broken when a used variant, a component or the file is gone', () => {
  const dir = system();
  const store = recordCode(dir);
  const noSm = { ...BUTTON, variants: { size: { lg: 'large' } } };
  writeIndex(dir, [noSm, CARD]);
  assert.match(run(dir, store)[0].broken.join('\n'), /unknown-option at components\[0\]\.variants\.size: sm \(options now: lg\)/);

  writeIndex(dir, [BUTTON, CARD]);
  const manifest = manifestOf(dir);
  manifest.components.built = ['Card', 'Badge'];
  delete manifest.components.meta.Button;
  write(dir, 'design-system.json', manifest);
  const gone = run(dir, store)[0];
  assert.deepEqual(gone.broken.map((b) => b.split(':')[0]), ['missing-component at components[0].name'], 'reported once, by the plan check');
  assert.deepEqual(gone.stale, []);

  assert.deepEqual(run(system(), store, {})[0].broken, ['apps/web/BookDemo.tsx is gone']);
});

test('check: released when the marker is gone or names another screen', () => {
  const dir = system();
  const store = recordCode(dir);
  for (const text of ['export default 1;\n', '// Composed by throughline: Booking.\n']) {
    const [s] = run(dir, store, { 'apps/web/BookDemo.tsx': text });
    assert.equal(s.released, true);
    assert.deepEqual(s.broken, []);
  }
});

test('check: figma screens get the stale check only', () => {
  const dir = system();
  const description = { screen: 'Reschedule', page: 'Screens', width: 390, root: { layout: 'vertical', children: [
    { component: 'Button' },
    { component: 'Card', slots: { Body: [{ layout: 'vertical', children: [{ component: 'Badge' }] }] } },
  ] } };
  assert.deepEqual(describedComponents(description), ['Button', 'Card', 'Badge']);
  const manifest = manifestOf(dir);
  const store = recordScreen(null, { side: 'figma', screen: 'Reschedule', target: 'Screens', at: '2026-10-14', plan: description, componentsPage: 'Components' },
    describedComponents(description), (n) => contractOf(dir, manifest, n));
  write(dir, 'design-system/docs/components/Card.doc.json', { ...CARD, states: { hover: 'x' } });
  const [s] = run(dir, store, {});
  assert.deepEqual([s.broken, s.stale], [[], ['Card']]);
  assert.match(formatReport([s], null).join('\n'), /checked live/);
});

test('a component built but never documented is recorded untracked; a figma screen is never broken from the repo', () => {
  const dir = system();
  const manifest = manifestOf(dir);
  manifest.components.built.push('Spinner');
  write(dir, 'design-system.json', manifest);
  const description = { screen: 'S', page: 'Screens', width: 390, root: { layout: 'vertical', children: [{ component: 'Spinner' }, { component: 'Card' }] } };
  const store = recordScreen(null, { side: 'figma', screen: 'S', target: 'Screens', at: '2026-10-14', plan: description, componentsPage: 'Components' },
    describedComponents(description), (n) => contractOf(dir, manifestOf(dir), n));
  assert.deepEqual(store.screens['figma:s'].components.Spinner, null);
  delete manifest.components.meta.Card;
  manifest.components.built = manifest.components.built.filter((n) => n !== 'Card');
  write(dir, 'design-system.json', manifest);
  const [s] = run(dir, store, {});
  assert.deepEqual([s.broken, s.stale, s.untracked], [[], [], ['Spinner']]);
});

test('forget removes one entry and reports a missing one', () => {
  const dir = system();
  const store = recordCode(dir);
  assert.deepEqual(forgetScreen(store, 'code', 'book a DEMO').screens, {});
  assert.equal(forgetScreen(store, 'figma', 'Book a demo'), null);
});

test('tokens: edited, missing and unstamped; line endings and files outside the roots are ignored', () => {
  const dir = system();
  write(dir, 'packages/tokens/dtcg/tokens.json', '{\n  "a": 1\n}\n');
  write(dir, 'packages/tokens/build/css/vars.css', ':root { --a: 1; }\n');
  write(dir, 'packages/tokens/build/css/old.css', 'x\n');
  write(dir, 'packages/tokens/build.mjs', 'export default {};\n');
  const roots = ['packages/tokens/dtcg', 'packages/tokens/build/css'];
  const stamp = { roots, files: hashRoots(dir, roots) };
  assert.equal(Object.keys(stamp.files).length, 3);

  write(dir, 'packages/tokens/dtcg/tokens.json', '{\r\n  "a": 1\r\n}\r\n');
  write(dir, 'packages/tokens/build.mjs', 'export default { edited: true };\n');
  assert.deepEqual(checkTokens(stamp, hashRoots(dir, roots)), { roots, edited: [], missing: [], unstamped: [] });

  write(dir, 'packages/tokens/build/css/vars.css', ':root { --a: 2; }\n');
  rmSync(join(dir, 'packages/tokens/build/css/old.css'));
  write(dir, 'packages/tokens/build/css/new.css', 'y\n');
  assert.deepEqual(checkTokens(stamp, hashRoots(dir, roots)), {
    roots, edited: ['packages/tokens/build/css/vars.css'], missing: ['packages/tokens/build/css/old.css'], unstamped: ['packages/tokens/build/css/new.css'],
  });
  assert.equal(hashText('a\r\nb'), hashText('a\nb'));
});

test('figma collections: a changed hash names the collection and its counts; same hashes match', () => {
  const stored = { 'Space / Semantic': { variables: 24, hash: 'aaaa0001' }, Colour: { variables: 10, hash: 'bbbb0002' }, Old: { variables: 1, hash: 'c' } };
  const live = { Colour: { variables: 10, hash: 'bbbb0002' }, 'Space / Semantic': { variables: 25, hash: 'aaaa0009' }, New: { variables: 2, hash: 'd' } };
  const diff = compareCollections(stored, live);
  assert.deepEqual(diff, { added: ['New'], changed: [{ name: 'Space / Semantic', from: 24, to: 25 }], removed: ['Old'] });
  assert.match(formatFigmaComparison(diff).join('\n'), /changed  Space \/ Semantic \(24 → 25 variables\)/);
  assert.deepEqual(formatFigmaComparison(compareCollections(stored, stored)), ['Figma variables match the last sync.']);
});

const script = fileURLToPath(new URL('./drift-check.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('cli: nothing checked fails unless allowed; a token-only repo needs no docs index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'drift-'));
  write(dir, 'design-system.json', { components: { built: [], meta: {} } });
  const empty = cli('check', '--system', dir);
  assert.equal(empty.status, 1);
  assert.match(empty.stdout, /nothing checked/);
  assert.equal(cli('check', '--system', dir, '--allow-empty').status, 0);

  write(dir, 'packages/tokens/dtcg/tokens.json', '{}\n');
  assert.equal(cli('stamp', '--system', dir, '--out', join(dir, 'packages/tokens/dtcg')).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, STAMP_FILE), 'utf8')).roots, ['packages/tokens/dtcg']);
  assert.equal(cli('check', '--system', dir).status, 0);
  write(dir, 'packages/tokens/dtcg/tokens.json', '{"a":1}\n');
  const edited = cli('check', '--system', dir);
  assert.equal(edited.status, 1);
  assert.match(edited.stdout, /edited +packages\/tokens\/dtcg\/tokens\.json/);
});

test('cli: stamp-figma keeps the file stamp, compare-figma reads it, usage is 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'drift-'));
  write(dir, 'packages/tokens/dtcg/tokens.json', '{}\n');
  cli('stamp', '--system', dir, '--out', join(dir, 'packages/tokens/dtcg'));
  write(dir, 'live.json', { S: { variables: 1, hash: '00000001' } });
  assert.match(cli('compare-figma', '--system', dir, '--from', join(dir, 'live.json')).stdout, /No Figma stamp yet/);
  assert.equal(cli('stamp-figma', '--system', dir, '--from', join(dir, 'live.json')).status, 0);
  const stamp = JSON.parse(readFileSync(join(dir, STAMP_FILE), 'utf8'));
  assert.ok(stamp.files && stamp.figma.collections.S);
  write(dir, 'live.json', { S: { variables: 1, hash: '00000002' } });
  const moved = cli('compare-figma', '--system', dir, '--from', join(dir, 'live.json'));
  assert.equal(moved.status, 1);
  assert.match(moved.stdout, /changed  S \(1 variable\)/);
  write(dir, 'bad.json', { 'S/a': { type: 'FLOAT', modes: { D: 1 } } });
  assert.equal(cli('stamp-figma', '--system', dir, '--from', join(dir, 'bad.json')).status, 2);
  assert.equal(cli('check').status, 2);
  assert.equal(cli('stamp', '--system', dir).status, 2);
});

// Button with a state axis's worth of states, Tooltip whose states Figma doesn't draw.
function componentSystem() {
  const dir = system();
  const manifest = manifestOf(dir);
  manifest.components.built.push('Tooltip');
  manifest.components.meta.Tooltip = { doc: { path: 'design-system/docs/components/Tooltip.doc.json' } };
  write(dir, 'design-system.json', manifest);
  write(dir, 'design-system/docs/components/Button.doc.json', { ...BUTTON, states: { default: 'At rest.', hover: 'Over.' } });
  write(dir, 'design-system/docs/components/Tooltip.doc.json', { name: 'Tooltip', summary: 'Hints.', description: 'A tip.', variants: { side: { top: 'Above.' } }, states: { hidden: 'Off.', visible: 'On.' } });
  return dir;
}

test('documented: built components split by doc record, folded lookup', () => {
  const dir = componentSystem();
  assert.deepEqual(documented(dir, manifestOf(dir)), { documented: ['Button', 'Card', 'Tooltip'], undocumented: ['Badge'] });
});

test('compare components: state axis against states, folded names, both sides, gone, order ignored', () => {
  const dir = componentSystem();
  const live = { page: 'Components', components: {
    Button: { axes: { Size: ['lg', 'sm', 'xl'], State: ['Default', 'Hover', 'Active'] } },
    Card: { axes: {} },
    Tooltip: { axes: { Placement: ['Top', 'Bottom'] } },
  } };
  assert.deepEqual(compareComponents(dir, manifestOf(dir), live), [
    { name: 'Button', figmaOnly: { Size: ['xl'], State: ['Active'] }, recordOnly: {}, renamed: [] },
    { name: 'Tooltip', figmaOnly: { Placement: ['Top', 'Bottom'] }, recordOnly: { side: ['top'] }, renamed: [] },
  ], 'Tooltip\'s states are not compared: Figma has no state axis');
  const renamed = { components: { ...live.components, Tooltip: { axes: { Placement: ['Top'] } } } };
  assert.deepEqual(compareComponents(dir, manifestOf(dir), renamed).find((d) => d.name === 'Tooltip'),
    { name: 'Tooltip', figmaOnly: {}, recordOnly: {}, renamed: [{ record: 'side', figma: 'Placement' }] }, 'same options, other name: a rename');
  assert.match(formatComponentComparison(compareComponents(dir, manifestOf(dir), renamed), 3).join('\n'), /renamed\? +the record's side is Figma's Placement \(same options\): rename one to match, don't add both/);
  const gone = compareComponents(dir, manifestOf(dir), { components: { ...live.components, Card: null } });
  assert.deepEqual(gone.find((d) => d.name === 'Card'), { name: 'Card', gone: true });
  const clean = { components: { Button: { axes: { size: ['sm', 'lg'], state: ['hover', 'default'] } }, Card: { axes: {} }, Tooltip: { axes: { side: ['Top'] } } } };
  assert.deepEqual(compareComponents(dir, manifestOf(dir), clean), []);
  // A record that keeps a state variant axis beside states: one comparison, not two.
  write(dir, 'design-system/docs/components/Card.doc.json', { ...CARD, variants: { state: { default: 'x' } }, states: { hover: 'y' } });
  assert.deepEqual(compareComponents(dir, manifestOf(dir), { components: { ...clean.components, Card: { axes: { State: ['Default', 'Hover'] } } } }), []);
  // A malformed record compares as empty rather than throwing.
  write(dir, 'design-system/docs/components/Card.doc.json', { ...CARD, variants: null, states: null });
  assert.deepEqual(compareComponents(dir, manifestOf(dir), clean), []);
  const text = formatComponentComparison(compareComponents(dir, manifestOf(dir), live), 3).join('\n');
  assert.match(text, /2 of 3 Figma components differ/);
  assert.match(text, /in Figma, not the record   State: Active/);
  assert.match(text, /in Figma, not the record   Placement: Top, Bottom/);
  assert.match(text, /run \/throughline:document-component Tooltip to bring the record in line/);
  assert.deepEqual(formatComponentComparison([], 3), ['Figma components match their doc records (3 checked).']);
});

test('check code: behind on a new option, not on a reworded meaning; stray stamps ignored', () => {
  const dir = componentSystem();
  const manifest = manifestOf(dir);
  assert.equal(checkCode(dir, manifest, null), null);
  const shape = (name) => shapeFingerprint(JSON.parse(readFileSync(join(dir, `design-system/docs/components/${name}.doc.json`), 'utf8')));
  const stamp = { components: { Button: { shape: shape('Button'), at: '2026-10-15' }, Gone: { shape: 'x', at: '2026-10-15' } } };
  assert.deepEqual(checkCode(dir, manifest, stamp), { behind: [], notStamped: ['Card', 'Tooltip'] });
  const button = JSON.parse(readFileSync(join(dir, 'design-system/docs/components/Button.doc.json'), 'utf8'));
  write(dir, 'design-system/docs/components/Button.doc.json', { ...button, variants: { size: { sm: 'Tiny.', lg: 'Huge.' } } });
  assert.deepEqual(checkCode(dir, manifest, stamp).behind, [], 'a reworded meaning');
  write(dir, 'design-system/docs/components/Button.doc.json', { ...button, variants: { size: { ...button.variants.size, xl: 'x' } } });
  assert.deepEqual(checkCode(dir, manifest, stamp).behind, ['Button']);
  const report = formatReport([], null, checkCode(dir, manifest, stamp), documented(dir, manifest)).join('\n');
  assert.match(report, /behind +Button: code built against an older shape/);
  assert.match(report, /code not stamped: Card, Tooltip/);
  assert.match(report, /no doc record: Badge/);
  const tokens = { roots: ['dtcg'], edited: [], missing: [], unstamped: [] };
  assert.match(formatReport([], tokens, null, documented(dir, manifest)).join('\n'), /No code stamp yet/);
});

test('cli: stamp-code writes nothing on a refusal, merges, and counts as checked', () => {
  const dir = componentSystem();
  assert.equal(cli('stamp-code', '--system', dir).status, 2, 'no --component');
  assert.equal(cli('stamp-code', '--system', dir, '--component', 'Button', '--component', 'Nope').status, 2);
  const noRecord = cli('stamp-code', '--system', dir, '--component', 'button', '--component', 'Badge');
  assert.equal(noRecord.status, 3);
  assert.match(noRecord.stderr, /no doc record yet: Badge/);
  assert.throws(() => readFileSync(join(dir, CODE_STAMP_FILE)), 'a refusal writes nothing');
  assert.equal(cli('stamp-code', '--system', dir, '--component', 'button').status, 0);
  assert.equal(cli('stamp-code', '--system', dir, '--component', 'Card').status, 0);
  const written = JSON.parse(readFileSync(join(dir, CODE_STAMP_FILE), 'utf8')).components;
  assert.deepEqual(Object.keys(written), ['Button', 'Card'], 'merged, built spelling');
  assert.match(written.Card.at, /^\d{4}-\d{2}-\d{2}$/);
  const summary = cli('check', '--system', dir).stdout;
  assert.match(summary, /Components: 0 behind, 1 not stamped\./);
  assert.match(summary, /Code matches the doc records it was built from \(2 stamped\)/);
  write(dir, CODE_STAMP_FILE, { components: { Gone: { shape: 'x', at: '2026-10-15' } } });
  assert.doesNotMatch(cli('check', '--system', dir).stdout, /Code matches/, 'nothing compared, so no match claimed');
  write(dir, 'design-system/docs/components/Card.doc.json', { ...CARD, variants: null, tokensUsed: 5 });
  assert.equal(cli('stamp-code', '--system', dir, '--component', 'Card').status, 0, 'a malformed record stamps rather than crashing');
  assert.equal(cli('check', '--system', dir).status, 0);

  const bare = mkdtempSync(join(tmpdir(), 'drift-'));
  write(bare, 'design-system.json', { components: { built: ['Card'], meta: { Card: { doc: { path: 'design-system/docs/components/Card.doc.json' } } } } });
  write(bare, 'design-system/docs/components/Card.doc.json', CARD);
  assert.equal(cli('check', '--system', bare).status, 1, 'nothing checked');
  cli('stamp-code', '--system', bare, '--component', 'Card');
  const checked = cli('check', '--system', bare, '--json');
  assert.equal(checked.status, 0, 'a code stamp counts as checked');
  const json = JSON.parse(checked.stdout);
  assert.equal(json.empty, false);
  assert.deepEqual(json.components, { documented: ['Card'], undocumented: [] });
  assert.deepEqual(json.code, { behind: [], notStamped: [] });
});

test('cli: compare-components exits 1 on a difference, 0 when matching, 2 on bad input', () => {
  const dir = componentSystem();
  const live = (button) => write(dir, 'live.json', { page: 'Components', components: { Button: { axes: button }, Card: { axes: {} }, Tooltip: { axes: { side: ['top'] } } } });
  live({ size: ['sm', 'lg'], state: ['Default', 'Hover'] });
  const same = cli('compare-components', '--system', dir, '--from', join(dir, 'live.json'));
  assert.equal(same.status, 0, same.stdout + same.stderr);
  assert.match(same.stdout, /match their doc records \(3 checked\)/);
  live({ size: ['sm'], state: ['Default', 'Hover'] });
  const moved = cli('compare-components', '--system', dir, '--from', join(dir, 'live.json'), '--json');
  assert.equal(moved.status, 1);
  assert.deepEqual(JSON.parse(moved.stdout).components, [{ name: 'Button', figmaOnly: {}, recordOnly: { size: ['lg'] }, renamed: [] }]);
  write(dir, 'bad.json', { Button: {} });
  assert.equal(cli('compare-components', '--system', dir, '--from', join(dir, 'bad.json')).status, 2);
  write(dir, 'array.json', { components: [] });
  assert.equal(cli('compare-components', '--system', dir, '--from', join(dir, 'array.json')).status, 2, 'an array is bad input, not every component gone');
  write(dir, CODE_STAMP_FILE, '{ not json');
  assert.equal(cli('compare-components', '--system', dir, '--from', join(dir, 'live.json')).status, 1, 'a corrupt code stamp is not this mode\'s business');
});
