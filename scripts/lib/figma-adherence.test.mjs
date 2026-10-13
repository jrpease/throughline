import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { RULES, checkScreens, dimensionBuckets } from './figma-adherence.mjs';

const DIR = new URL('./fixtures/figma-adherence/', import.meta.url);
const fixtures = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(new URL(f, DIR), 'utf8'))]),
);
const clone = (x) => JSON.parse(JSON.stringify(x));
const run = (fx) => checkScreens(fx.snapshot, { skip: fx.skip ?? [] });

test('figma-adherence.mjs has no import statements', () => {
  const src = readFileSync(new URL('./figma-adherence.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import\b/m);
});

test('RULES names the three rules in order', () => {
  assert.deepEqual(RULES, ['detached-component', 'raw-colour', 'raw-dimension']);
});

for (const [file, fx] of Object.entries(fixtures)) {
  test(`fixture ${file}: ${fx.covers}`, () => {
    const res = run(fx);
    assert.equal(res.pass, fx.expected.pass, JSON.stringify(res.failures));
    assert.deepEqual(res.failures.map((f) => f.rule).sort(), [...fx.expected.failures].sort());
    assert.equal(res.advisories.length, fx.expected.advisories, JSON.stringify(res.advisories));
  });
}

test('raw-colour: a token-valued raw fill names the variable to bind, with a link', () => {
  const [f] = run(fixtures['raw-colour-token']).failures;
  assert.equal(f.detail, 'fill #ffffff: bind color/bg/canvas');
  assert.equal(f.link, 'https://www.figma.com/design/FILE?node-id=1-1');
  assert.equal(f.path, 'Templates / Screen / Node');
});

test('raw-colour: a colour no token has says so', () => {
  const res = run(fixtures['zygarden-text-raw']);
  assert.ok(res.advisories.every((a) => a.detail === 'fill #e8e7e7: no colour variable has this value'));
});

test('raw-colour: inside an instance, only overridden fields are checked', () => {
  const fx = clone(fixtures['override-raw']);
  assert.equal(run(fx).pass, false);
  fx.snapshot.nodes[0].overridden = ['strokes'];
  assert.equal(run(fx).pass, true);
  assert.equal(run(fx).counts['raw-colour'].checked, 0);
});

test('raw-dimension: a gap that does not render is not counted', () => {
  const res = run(fixtures['ds01-gaps']);
  assert.equal(res.failures[0].detail, 'gap 12: bind spacing/3');
  assert.equal(res.counts['raw-dimension'].checked, 1);
});

test('raw-dimension: padding and radius name their side and corner', () => {
  assert.equal(run(fixtures['padding-raw']).failures[0].detail, 'padding-left 16: bind spacing/4');
  const root = run(fixtures['root-radius']);
  assert.equal(root.failures.length, 1);
  assert.equal(root.failures[0].path, 'Templates / Example 1 / Card');
  assert.equal(root.failures[0].detail, 'radius-all 32: bind radius/xl');
  assert.equal(run(fixtures['off-scale-gap']).advisories[0].detail, 'off-scale gap 200');
});

test('raw-dimension: nothing inside an instance is checked', () => {
  const fx = clone(fixtures['padding-raw']);
  fx.snapshot.nodes[0].inInstance = true;
  assert.equal(run(fx).pass, true);
});

test('detached-component: names a library key, or a local component on another page', () => {
  const details = run(fixtures['detached-library']).failures.map((f) => f.detail);
  assert.deepEqual(details, [
    'detached from a library component (key 4412e315f15a0af7a26382d2b05781f7974a30d9)',
    'detached from a local component on another page (id 9:9)',
  ]);
  const fx = clone(fixtures['detached-library']);
  fx.snapshot.nodes[1].detached.name = 'HUD';
  assert.equal(run(fx).failures[1].detail, 'detached from HUD');
});

test('inert rules fail by name, and a skipped rule is listed and runs nothing', () => {
  assert.match(run(fixtures['nothing-scanned']).failures[0].detail, /no node was read/);
  const skipped = run(fixtures['skip-colour']);
  assert.deepEqual(skipped.skipped, ['raw-colour']);
  assert.equal(skipped.counts['raw-colour'], undefined);
  const both = checkScreens(fixtures['inert-all'].snapshot, { skip: ['raw-colour', 'raw-dimension'] });
  assert.equal(both.pass, true);
});

test('nothing-scanned cannot be skipped', () => {
  const res = checkScreens(fixtures['nothing-scanned'].snapshot, { skip: RULES });
  assert.deepEqual(res.failures.map((f) => f.rule), ['nothing-scanned']);
});

test('dimensionBuckets: an explicit scope decides; ALL_SCOPES needs a name that says what it is', () => {
  assert.deepEqual(dimensionBuckets('anything', ['GAP']), { gap: true, radius: false });
  assert.deepEqual(dimensionBuckets('anything', ['CORNER_RADIUS']), { gap: false, radius: true });
  assert.deepEqual(dimensionBuckets('text/7xl', ['FONT_SIZE']), { gap: false, radius: false });
  // Zygarden 2026-10-13: every number variable is ALL_SCOPES.
  assert.deepEqual(dimensionBuckets('spacing/space/6', ['ALL_SCOPES']), { gap: true, radius: false });
  assert.deepEqual(dimensionBuckets('radius/4', ['ALL_SCOPES']), { gap: false, radius: true });
  assert.deepEqual(dimensionBuckets('text/7xl', ['ALL_SCOPES']), { gap: false, radius: false });
  assert.deepEqual(dimensionBuckets('text/base/lineHeight', ['ALL_SCOPES']), { gap: false, radius: false });
  assert.deepEqual(dimensionBuckets('stack/md', ['ALL_SCOPES']), { gap: true, radius: false });
  assert.deepEqual(dimensionBuckets('text/xs/letterSpacing', ['ALL_SCOPES']), { gap: false, radius: false });
});

test('raw values inside a detached frame are covered by its one detached failure', () => {
  const fx = clone(fixtures['detached-library']);
  assert.deepEqual(run(fx).failures.map((f) => f.rule), ['detached-component', 'detached-component']);
  fx.snapshot.nodes[2].underDetached = false;
  assert.deepEqual(run(fx).failures.map((f) => f.rule).sort(), ['detached-component', 'detached-component', 'raw-colour', 'raw-dimension']);
});
