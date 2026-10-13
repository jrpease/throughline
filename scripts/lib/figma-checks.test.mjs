import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { FRAMEWORKS, withTable } from './figma-checks.mjs';
import { resolveArchetype, BASELINE_STATES, STATE_SYNONYMS } from './component-states.mjs';
import { normalizeName } from './source-scan.mjs';
import { contrastRatio, composite, parseHex, AA_NON_TEXT } from './contrast.mjs';

const { checkSpec, checkBuilt } = withTable({
  resolveArchetype,
  BASELINE_STATES,
  STATE_SYNONYMS,
  normalizeName,
  contrastRatio,
  composite,
  parseHex,
  AA_NON_TEXT,
});

const DIR = new URL('./fixtures/figma-checks/', import.meta.url);
const fixtures = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(new URL(f, DIR), 'utf8'))]),
);
const clone = (x) => JSON.parse(JSON.stringify(x));
const byName = (res, name) => res.checks.find((c) => c.name === name);

test('figma-checks.mjs has no import statements', () => {
  const src = readFileSync(new URL('./figma-checks.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import\b/m);
});

test('FRAMEWORKS names the in-scope frameworks and their recipes', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(FRAMEWORKS).map(([k, v]) => [k, v.recipe])),
    { shadcn: 'ring', tailwind: 'ring', mui: 'mui', 'vanilla-css': 'outline', vanilla: 'outline' },
  );
});

for (const [file, fx] of Object.entries(fixtures)) {
  test(`fixture ${file}: ${fx.covers}`, () => {
    const res = checkBuilt(fx.snapshot, fx.expect);
    assert.deepEqual(
      res.checks.map((c) => c.name),
      ['structural-read-back', 'state-baseline', 'focus-indicator', 'focus-contrast'],
    );
    assert.deepEqual(
      Object.fromEntries(res.checks.map((c) => [c.name, c.result])),
      fx.expected,
      JSON.stringify(res.checks),
    );
    assert.equal(res.pass, Object.values(fx.expected).every((r) => r !== 'fail'));
    for (const c of res.checks) assert.ok(c.detail.length > 0, `${c.name} has a detail`);
  });
}

test('the good fixtures pass overall and skips do not fail a result', () => {
  assert.equal(checkBuilt(fixtures['button-shadcn-filled'].snapshot, fixtures['button-shadcn-filled'].expect).pass, true);
  const skipped = fixtures['button-ios-swift-skipped'];
  const res = checkBuilt(skipped.snapshot, skipped.expect);
  assert.equal(res.pass, true);
  assert.match(byName(res, 'focus-indicator').detail, /ios-swift/);
});

test('a skip says why: name not in the table', () => {
  const fx = fixtures['avatar-not-in-table'];
  assert.match(byName(checkBuilt(fx.snapshot, fx.expect), 'state-baseline').detail, /Avatar.*not a name in the state table/);
});

// Each of these must fail, naming what is wrong: the checks can fail.
test('structural: plain FRAMEs are named', () => {
  const fx = fixtures['button-plain-frames'];
  const detail = byName(checkBuilt(fx.snapshot, fx.expect), 'structural-read-back').detail;
  assert.match(detail, /FRAME, not a COMPONENT_SET/);
  assert.match(detail, /not COMPONENTs/);
});

test('structural: a wrong combination names both the missing and the extra one', () => {
  const fx = fixtures['button-wrong-combination'];
  const detail = byName(checkBuilt(fx.snapshot, fx.expect), 'structural-read-back').detail;
  assert.match(detail, /missing combinations: variant=primary, state=hover/);
  assert.match(detail, /extra combinations: Variant=Primary, State=Hovered/);
});

test('structural: a sparse set names the missing combination', () => {
  const fx = fixtures['button-sparse'];
  assert.match(
    byName(checkBuilt(fx.snapshot, fx.expect), 'structural-read-back').detail,
    /missing combinations: variant=secondary, state=active/,
  );
});

test('structural: axis mismatch and duplicates are named', () => {
  const fx = clone(fixtures['button-shadcn-filled']);
  fx.snapshot.variantGroupProperties.Size = { values: ['sm'] };
  fx.snapshot.children.push(clone(fx.snapshot.children[0]));
  const detail = byName(checkBuilt(fx.snapshot, fx.expect), 'structural-read-back').detail;
  assert.match(detail, /extra axes: size/);
  assert.match(detail, /duplicate combinations/);
});

test('structural: axis names and values compare folded', () => {
  const fx = clone(fixtures['button-shadcn-filled']);
  fx.expect.matrix = { 'VARIANT': ['Primary'], 'State': ['DEFAULT', 'Hover', 'focus', 'Active', 'Disabled'] };
  assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'structural-read-back').result, 'pass');
});

test('focus: a ring with spread 0 fails and names every focus variant', () => {
  const fx = fixtures['button-spread-zero'];
  const detail = byName(checkBuilt(fx.snapshot, fx.expect), 'focus-indicator').detail;
  assert.match(detail, /Variant=Primary, State=Focus: lacks a DROP_SHADOW with spread > 0/);
});

test('focus: removing the ring from one of several focus variants fails and names it', () => {
  const fx = clone(fixtures['button-shadcn-filled']);
  fx.expect.matrix = { variant: ['primary', 'secondary'], state: fx.expect.matrix.state };
  fx.snapshot.variantGroupProperties.Variant.values.push('Secondary');
  for (const state of ['Default', 'Hover', 'Focus', 'Active', 'Disabled']) {
    const variant = { type: 'COMPONENT', variantProperties: { Variant: 'Secondary', State: state } };
    if (state === 'Focus') Object.assign(variant, { effects: [], strokeAlign: 'INSIDE', strokeVariables: [], children: [] });
    fx.snapshot.children.push(variant);
  }
  const res = checkBuilt(fx.snapshot, fx.expect);
  const focus = byName(res, 'focus-indicator');
  assert.equal(focus.result, 'fail');
  assert.match(focus.detail, /Variant=Secondary, State=Focus/);
  assert.doesNotMatch(focus.detail, /Variant=Primary/);
  assert.equal(res.pass, false);
});

test('focus: the INSIDE vanilla stroke is a fail, flipping it to OUTSIDE passes', () => {
  const fx = clone(fixtures['button-vanilla-inside']);
  assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-indicator').result, 'fail');
  for (const c of fx.snapshot.children) if (c.strokeAlign) c.strokeAlign = 'OUTSIDE';
  assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-indicator').result, 'pass');
});

test('focus: a focus variable needs a focus segment', () => {
  const base = fixtures['button-shadcn-filled'];
  for (const [name, expected] of [
    ['border/focus', 'pass'],
    ['color/border/focus', 'pass'],
    ['color/focus/ring', 'pass'],
    ['color/focus/ringOnFill', 'pass'],
    ['color/focusRing', 'fail'],
    ['color/border/default', 'fail'],
    [null, 'fail'],
  ]) {
    const fx = clone(base);
    for (const c of fx.snapshot.children) if (c.effects) c.effects[0].colorVariable = name;
    assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-indicator').result, expected, String(name));
  }
});

test('focus: Focused and focus-visible are not read as focus variants', () => {
  const fx = clone(fixtures['button-shadcn-filled']);
  for (const c of fx.snapshot.children) if (c.variantProperties.State === 'Focus') c.variantProperties.State = 'Focused';
  assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-indicator').result, 'fail');
});

test('focus: zero focus variants is not a pass', () => {
  const fx = fixtures['button-no-focus-variant'];
  assert.match(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-indicator').detail, /no COMPONENT variant has a state of focus/);
});

test('focus: absent uiFramework uses the ring recipe, an unknown one is skipped', () => {
  const fx = clone(fixtures['button-shadcn-filled']);
  delete fx.expect.uiFramework;
  assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-indicator').result, 'pass');
  fx.expect.uiFramework = 'chakra';
  assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-indicator').result, 'skip');
  fx.expect.uiFramework = 'constructor';
  assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-indicator').result, 'skip');
});

test('state (spec mode): a complete matrix passes, folded and with synonyms', () => {
  const res = checkSpec({ name: 'Toggle', matrix: { State: ['Default', 'Hover', 'Focus', 'Active', 'On', 'Disabled'] } });
  assert.deepEqual(res.checks.map((c) => [c.name, c.result]), [['state-baseline', 'pass']]);
  assert.equal(res.pass, true);
});

test('state (spec mode): Chip with no selected fails and names it', () => {
  const res = checkSpec({ name: 'Chip', matrix: { state: ['default', 'hover', 'focus', 'active', 'disabled'] } });
  assert.equal(res.pass, false);
  assert.match(res.checks[0].detail, /missing: selected$/);
});

test('state (spec mode): default is required, and a matrix with no state axis fails', () => {
  const noDefault = checkSpec({ name: 'Input', matrix: { state: ['hover', 'focus', 'disabled'] } });
  assert.match(noDefault.checks[0].detail, /missing: default$/);
  const noAxis = checkSpec({ name: 'Input', matrix: { size: ['sm'] } });
  assert.equal(noAxis.checks[0].result, 'fail');
  assert.match(noAxis.checks[0].detail, /default, hover, focus, disabled/);
});

test('state (spec mode): a name not in the table, or an exempt one, skips', () => {
  assert.equal(checkSpec({ name: 'Avatar', matrix: {} }).checks[0].result, 'skip');
  const card = checkSpec({ name: 'Card', matrix: { size: ['sm'] } });
  assert.equal(card.checks[0].result, 'skip');
  assert.equal(card.pass, true);
});

test('built mode with no children does not throw', () => {
  const res = checkBuilt({ type: 'COMPONENT_SET', children: [] }, { name: 'Button', matrix: { state: ['default'] } });
  assert.equal(res.pass, false);
});

test('a selection axis satisfies selected; no selection at all still fails', () => {
  const states = ['default', 'hover', 'focus', 'active', 'disabled'];
  for (const axis of ['checked', 'Selected', 'on']) {
    const res = checkSpec({ name: 'Chip', matrix: { state: states, [axis]: ['false', 'true'] } });
    assert.equal(byName(res, 'state-baseline').result, 'pass', axis);
  }
  assert.equal(byName(checkSpec({ name: 'Chip', matrix: { state: states, tone: ['a', 'b'] } }), 'state-baseline').result, 'fail');
});

// focus-contrast: the details say which pair failed, in which mode, at what ratio.
test('focus-contrast: names the failing mode only, at the measured ratio', () => {
  const fx = fixtures['zygarden-ring-light-fails'];
  const check = byName(checkBuilt(fx.snapshot, fx.expect), 'focus-contrast');
  assert.equal(check.detail, 'color/stroke/focus on color/bg/canvas in Light: 2.37:1, needs 3:1');
});

test('focus-contrast: compares raw and prints rounded down, so 2.997 fails as 2.99', () => {
  const fx = fixtures['sample-ring-on-muted-raw'];
  const check = byName(checkBuilt(fx.snapshot, fx.expect), 'focus-contrast');
  assert.equal(check.result, 'fail');
  assert.match(check.detail, /color\/focus\/ring on color\/bg\/muted in Light: 2\.99:1/);
  assert.doesNotMatch(check.detail, /Dark/);
});

test('focus-contrast: every ring the variants bind is compared, in every mode', () => {
  const fx = fixtures['sample-ring-passes'];
  assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-contrast').detail, '4 ring/surface pair(s) clear 3:1 across 2 mode(s)');
});

test('focus-contrast: a single-mode side reads its one value in every mode of the other', () => {
  for (const [file, modes] of [['surface-single-mode', 2], ['ring-single-mode', 2]]) {
    const fx = fixtures[file];
    assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-contrast').detail, `${modes} ring/surface pair(s) clear 3:1 across ${modes} mode(s)`, file);
  }
});

test('focus-contrast: a translucent ring is composited over the surface before comparing', () => {
  const fx = clone(fixtures['ring-translucent']);
  assert.match(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-contrast').detail, /in Default: 1\.6\d:1/);
  fx.snapshot.colors['color/focus/ring'].modes.Default = '#00000080';
  assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-contrast').result, 'pass');
});

test('focus-contrast: skips say why', () => {
  const missing = byName(checkBuilt(fixtures['surface-missing'].snapshot, fixtures['surface-missing'].expect), 'focus-contrast');
  assert.equal(missing.detail, 'no local colour variable named: color/bg/canvsa');
  const translucent = byName(checkBuilt(fixtures['surface-translucent'].snapshot, fixtures['surface-translucent'].expect), 'focus-contrast');
  assert.match(translucent.detail, /2 skipped for a translucent surface/);
  const noSurfaces = byName(checkBuilt(fixtures['button-shadcn-filled'].snapshot, fixtures['button-shadcn-filled'].expect), 'focus-contrast');
  assert.match(noSurfaces.detail, /no surfaces named/);
  const noRing = byName(checkBuilt(fixtures['indicator-failed'].snapshot, fixtures['indicator-failed'].expect), 'focus-contrast');
  assert.match(noRing.detail, /focus-indicator did not pass/);
});

test('focus-contrast: a ring on the control layer is the one measured', () => {
  const fx = clone(fixtures['input-control-layer']);
  fx.expect.surfaces = ['color/bg/canvas'];
  const layerRing = fx.snapshot.children.find((c) => c.controlLayer).controlLayer;
  const ringName = layerRing.effects?.find((e) => e.colorVariable)?.colorVariable ?? layerRing.children.find((c) => c.strokeVariables?.length)?.strokeVariables[0];
  fx.snapshot.colors = { [ringName]: { modes: { Default: '#eeeeee' }, defaultMode: 'Default' }, 'color/bg/canvas': { modes: { Default: '#ffffff' }, defaultMode: 'Default' } };
  fx.snapshot.missingSurfaces = [];
  assert.match(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-contrast').detail, new RegExp(`${ringName} on color/bg/canvas in Default`));
});

test('focus-contrast: the outline and mui recipes hand their ring to the contrast check', () => {
  const surface = { 'color/bg/canvas': { modes: { Default: '#ffffff' }, defaultMode: 'Default' } };
  for (const file of ['button-vanilla-outside', 'input-mui']) {
    const fx = clone(fixtures[file]);
    assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-indicator').result, 'pass', file);
    const rings = new Set();
    for (const c of fx.snapshot.children) {
      for (const n of [c, ...(c.children ?? [])]) for (const v of n.strokeVariables ?? []) rings.add(v);
    }
    fx.expect.surfaces = ['color/bg/canvas'];
    fx.snapshot.missingSurfaces = [];
    fx.snapshot.colors = { ...surface, ...Object.fromEntries([...rings].map((r) => [r, { modes: { Default: '#eeeeee' }, defaultMode: 'Default' }])) };
    const check = byName(checkBuilt(fx.snapshot, fx.expect), 'focus-contrast');
    assert.equal(check.result, 'fail', `${file}: ${check.detail}`);
    assert.match(check.detail, /on color\/bg\/canvas in Default: 1\.\d\d:1/);
  }
});

test('focus-contrast: two single-mode sides with different mode names compare once', () => {
  const fx = clone(fixtures['ring-translucent']);
  fx.snapshot.colors['color/focus/ring'].modes = { Default: '#000000' };
  fx.snapshot.colors['color/bg/canvas'] = { modes: { 'Mode 1': '#ffffff' }, defaultMode: 'Mode 1' };
  assert.equal(byName(checkBuilt(fx.snapshot, fx.expect), 'focus-contrast').detail, '1 ring/surface pair(s) clear 3:1 across 1 mode(s)');
});
