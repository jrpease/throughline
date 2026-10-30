import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFigmaChecks, buildFigmaAdherence, buildFigmaCompose, buildFigmaDrift } from './build-figma-checks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, 'lib', name), 'utf8');
const sources = () => ({
  statesSource: read('component-states.mjs'),
  contrastSource: read('contrast.mjs'),
  checkerSource: read('figma-checks.mjs'),
  variablesSource: read('figma-variables-read.figma.js'),
  readerSource: read('figma-checks-read.figma.js'),
});
const adherenceSources = () => ({
  checkerSource: read('figma-adherence.mjs'),
  variablesSource: read('figma-variables-read.figma.js'),
  readerSource: read('figma-adherence-read.figma.js'),
});
const composeSources = () => ({
  adherenceSource: read('figma-adherence.mjs'),
  composeSource: read('figma-compose.mjs'),
  variablesSource: read('figma-variables-read.figma.js'),
  composeReaderSource: read('figma-compose-read.figma.js'),
  designModeSource: read('design-mode.mjs'),
  libraryMergeSource: read('figma-compose-library.mjs'),
  modeReaderSource: read('design-mode-read.figma.js'),
  libraryReaderSource: read('library-read.figma.js'),
  writerSource: read('figma-compose.figma.js'),
});
const driftSources = () => ({
  adherenceSource: read('figma-adherence.mjs'),
  composeSource: read('figma-compose.mjs'),
  variablesSource: read('figma-variables-read.figma.js'),
  composeReaderSource: read('figma-compose-read.figma.js'),
  driftVariablesSource: read('figma-drift-variables.figma.js'),
  driftScreensSource: read('figma-drift-screens.figma.js'),
  driftComponentsSource: read('figma-drift-components.figma.js'),
});
const snippetOf = (md) => md.slice(md.lastIndexOf('```js') + '```js'.length, md.lastIndexOf('```'));

test('build: inlines all five sources, no module syntax survives', () => {
  const md = buildFigmaChecks(sources());
  assert.match(md, /function resolveArchetype\(/);
  assert.match(md, /function withTable\(/);
  assert.match(md, /function contrastRatio\(/);
  assert.match(md, /const AA_NON_TEXT = 3;/);
  assert.match(md, /async function variableColors\(/);
  assert.match(md, /async function runFigmaChecks\(/);
  assert.match(md, /const \{ checkSpec, checkBuilt, checkExisting \} = withTable\(\{ resolveArchetype, BASELINE_STATES, STATE_SYNONYMS, normalizeName, contrastRatio, composite, parseHex, AA_NON_TEXT \}\);/);
  assert.ok(!/^\s*(import|export)\b/m.test(snippetOf(md)), 'snippet must contain no import/export lines');
});

test('build: refuses a source that has imports (the inlinability guard)', () => {
  assert.throws(() => buildFigmaChecks({ ...sources(), checkerSource: "import { x } from 'node:fs';\nexport function f() {}\n" }), /import-free/);
  assert.throws(() => buildFigmaChecks({ ...sources(), statesSource: "import { x } from 'node:fs';\n" }), /import-free/);
  assert.throws(() => buildFigmaChecks({ ...sources(), contrastSource: "import { x } from 'node:fs';\n" }), /import-free/);
  assert.throws(() => buildFigmaChecks({ ...sources(), readerSource: 'export const x = 1;\n' }), /import-free/);
});

test('build: the generated markdown carries the do-not-edit warning and the slot instructions', () => {
  const md = buildFigmaChecks(sources());
  assert.match(md, /GENERATED FILE — do not edit by hand/);
  assert.match(md, /const EXPECT =/);
  assert.match(md, /const MODE =/);
  assert.match(md, /return await runFigmaChecks\(EXPECT, MODE\);/);
});

test('build: output is deterministic', () => {
  assert.equal(buildFigmaChecks(sources()), buildFigmaChecks(sources()));
});

test('generated reference on disk is in sync with the sources', () => {
  const onDisk = readFileSync(join(HERE, '..', 'references', 'figma-checks.md'), 'utf8');
  assert.equal(onDisk, buildFigmaChecks(sources()), 'run: node scripts/build-figma-checks.mjs');
});

test('the inlined snippet runs: spec mode reports the missing state without touching figma', async () => {
  const code = snippetOf(buildFigmaChecks(sources()));
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const figma = new Proxy({}, { get() { throw new Error('figma must not be used in spec mode'); } });
  const run = new AsyncFunction('figma', `${code}\nreturn await runFigmaChecks({ name: 'Chip', matrix: { state: ['default', 'hover', 'focus', 'active', 'disabled'] }, uiFramework: 'shadcn' }, 'spec');`);
  const result = await run(figma);
  assert.equal(result.pass, false);
  const check = result.checks.find((c) => c.name === 'state-baseline');
  assert.equal(check.result, 'fail');
  assert.match(check.detail, /selected/);
});

test('adherence build: inlines its three sources, no module syntax survives', () => {
  const md = buildFigmaAdherence(adherenceSources());
  assert.match(md, /function checkScreens\(/);
  assert.match(md, /async function variableColors\(/);
  assert.match(md, /async function runScreenGate\(/);
  assert.match(md, /GENERATED FILE — do not edit by hand/);
  assert.match(md, /const TARGET =/);
  assert.ok(!/^\s*(import|export)\b/m.test(snippetOf(md)), 'snippet must contain no import/export lines');
});

test('adherence build: refuses an importing source, and is deterministic', () => {
  assert.throws(() => buildFigmaAdherence({ ...adherenceSources(), checkerSource: "import { x } from 'node:fs';\n" }), /import-free/);
  assert.throws(() => buildFigmaAdherence({ ...adherenceSources(), variablesSource: 'export const x = 1;\n' }), /import-free/);
  assert.equal(buildFigmaAdherence(adherenceSources()), buildFigmaAdherence(adherenceSources()));
});

test('generated adherence reference on disk is in sync with the sources', () => {
  const onDisk = readFileSync(join(HERE, '..', 'references', 'figma-adherence.md'), 'utf8');
  assert.equal(onDisk, buildFigmaAdherence(adherenceSources()), 'run: node scripts/build-figma-checks.mjs');
});

// A fake Figma holding one page and one screen: a raw white rectangle, a card
// with an unbound 8 px radius, a 50% black scrim, and an instance whose own fill
// was overridden to raw white. One white colour variable and one ALL_SCOPES
// radius variable. No figma.fileKey: the links come from TARGET.
function fakeFigma() {
  const mixed = Symbol('mixed');
  const solid = (r, g, b, opacity) => ({ type: 'SOLID', visible: true, color: { r, g, b }, ...(opacity === undefined ? {} : { opacity }) });
  const rect = { id: '1:3', name: 'Box', type: 'RECTANGLE', visible: true, fills: [solid(1, 1, 1)], strokes: [], cornerRadius: 0 };
  const card = { id: '1:4', name: 'Card', type: 'RECTANGLE', visible: true, fills: [], strokes: [], cornerRadius: 8 };
  const scrim = { id: '1:5', name: 'Scrim', type: 'RECTANGLE', visible: true, fills: [solid(0, 0, 0, 0.5)], strokes: [], cornerRadius: 0 };
  const instance = {
    id: '1:6', name: 'Button', type: 'INSTANCE', visible: true, fills: [solid(1, 1, 1)], strokes: [],
    overrides: [{ id: '1:6', overriddenFields: ['fills'] }], findOne: () => null, findAll: () => [],
  };
  const screen = { id: '1:2', name: 'Home', type: 'FRAME', visible: true, fills: [], strokes: [], cornerRadius: 0, layoutMode: 'NONE', children: [rect, card, scrim, instance] };
  const page = { name: '  Templates', children: [screen], loadAsync: async () => {}, findOne: () => null };
  const white = { id: 'v1', name: 'color/bg/canvas', variableCollectionId: 'c1', valuesByMode: { m: { r: 1, g: 1, b: 1, a: 1 } } };
  const radius = { id: 'v2', name: 'radius/md', scopes: ['ALL_SCOPES'], variableCollectionId: 'c1', valuesByMode: { m: 8 } };
  return {
    mixed,
    root: { children: [page] },
    variables: {
      getLocalVariablesAsync: async (type) => (type === 'COLOR' ? [white] : [radius]),
      getVariableCollectionByIdAsync: async () => ({ modes: [{ modeId: 'm', name: 'Default' }], defaultModeId: 'm' }),
      getVariableByIdAsync: async () => null,
    },
  };
}

test('the inlined adherence snippet runs end to end against a fake Figma', async () => {
  const code = snippetOf(buildFigmaAdherence(adherenceSources()));
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const run = new AsyncFunction('figma', `${code}\nreturn await runScreenGate({ page: 'Templates', fileKey: 'TEST' }, []);`);
  const result = await run(fakeFigma());
  assert.equal(result.pass, false);
  assert.deepEqual(
    result.failures.map((f) => `${f.rule} | ${f.path} | ${f.detail}`),
    [
      'raw-colour | Templates / Home / Box | fill #ffffff: bind color/bg/canvas',
      'raw-colour | Templates / Home / Button | fill #ffffff: bind color/bg/canvas',
      'raw-dimension | Templates / Home / Card | radius-all 8: bind radius/md',
    ],
  );
  assert.equal(result.failures[0].link, 'https://www.figma.com/design/TEST?node-id=1-3');
  assert.deepEqual(result.advisories.map((a) => a.detail), ['fill #00000080: no colour variable has this value']);
});

// A fake Figma whose one screen holds a Panel instance with a Body slot. The slot
// holds an added frame (a plain id) and a placeholder frame (an instance-sublayer
// id), each with a raw 16 px gap between two children. One GAP variable at 16.
function fakeSlotFigma() {
  const leaf = (id) => ({ id, name: 'Row', type: 'FRAME', visible: true, fills: [], strokes: [], layoutMode: 'NONE', children: [] });
  const stack = (id, name) => ({
    id, name, type: 'FRAME', visible: true, fills: [], strokes: [], layoutMode: 'VERTICAL', itemSpacing: 16,
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, primaryAxisAlignItems: 'MIN',
    children: [leaf(`${id}a`), leaf(`${id}b`)],
  });
  const added = stack('2:1', 'Added');
  const placeholder = stack('I1:6;9:1', 'Placeholder');
  const instance = {
    id: '1:6', name: 'Panel', type: 'INSTANCE', visible: true, fills: [], strokes: [], overrides: [], findOne: () => null,
  };
  const slot = { id: 'I1:6;9:0', name: 'Body', type: 'SLOT', parent: instance, children: [added, placeholder] };
  instance.findAll = (pred) => [slot].filter(pred);
  const screen = { id: '1:2', name: 'Home', type: 'FRAME', visible: true, fills: [], strokes: [], layoutMode: 'NONE', children: [instance] };
  const page = { name: 'Templates', children: [screen], loadAsync: async () => {}, findOne: () => null };
  const white = { id: 'v1', name: 'color/bg/canvas', variableCollectionId: 'c1', valuesByMode: { m: { r: 1, g: 1, b: 1, a: 1 } } };
  const gap = { id: 'v2', name: 'space/4', scopes: ['GAP'], variableCollectionId: 'c1', valuesByMode: { m: 16 } };
  return {
    mixed: Symbol('mixed'),
    root: { children: [page] },
    variables: {
      getLocalVariablesAsync: async (type) => (type === 'COLOR' ? [white] : [gap]),
      getVariableCollectionByIdAsync: async () => ({ modes: [{ modeId: 'm', name: 'Default' }], defaultModeId: 'm' }),
      getVariableByIdAsync: async () => null,
    },
  };
}

test('the adherence snippet reads content added to a slot, and skips the placeholder', async () => {
  const code = snippetOf(buildFigmaAdherence(adherenceSources()));
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const run = new AsyncFunction('figma', `${code}\nreturn await runScreenGate({ page: 'Templates', fileKey: 'TEST' }, []);`);
  const result = await run(fakeSlotFigma());
  assert.deepEqual(
    result.failures.map((f) => `${f.rule} | ${f.path} | ${f.detail}`),
    ['raw-dimension | Templates / Home / Panel / Body / Added | gap 16: bind space/4'],
  );
});

test('compose build: inlines its four sources, no module syntax survives, deterministic', () => {
  const md = buildFigmaCompose(composeSources());
  assert.match(md, /function resolveScreen\(/);
  assert.match(md, /function dimensionBuckets\(/);
  assert.match(md, /async function runCompose\(/);
  assert.match(md, /GENERATED FILE — do not edit by hand/);
  assert.ok(!/^\s*(import|export)\b/m.test(snippetOf(md)), 'snippet must contain no import/export lines');
  assert.throws(() => buildFigmaCompose({ ...composeSources(), composeSource: "import { x } from 'node:fs';\n" }), /import-free/);
  assert.equal(buildFigmaCompose(composeSources()), buildFigmaCompose(composeSources()));
});

test('generated compose reference on disk is in sync with the sources', () => {
  const onDisk = readFileSync(join(HERE, '..', 'references', 'figma-compose.md'), 'utf8');
  assert.equal(onDisk, buildFigmaCompose(composeSources()), 'run: node scripts/build-figma-checks.mjs');
});

// A fake Figma just deep enough for the writer, strict where Figma is: HUG
// throws on a node without auto layout (text excepted), FILL throws under a
// parent without it. Components: Button (auto layout; variant, text, boolean
// props), Spinner (no auto layout), Panel (auto layout, a VERTICAL Body slot
// holding a placeholder), Broken (setProperties throws). It records the calls
// that matter to the result, in order.
function fakeComposeFigma({ screens = [] } = {}) {
  const log = [];
  let nextId = 100;
  const node = (type, extra = {}) => {
    const n = {
      id: `9:${nextId++}`, type, name: type, x: 0, y: 0, width: 100, height: 100, children: [], parent: null,
      layoutMode: type === 'FRAME' ? 'NONE' : undefined,
      plugin: {}, bound: {}, fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }], strokes: [], sizing: {},
      appendChild(c) { if (c.parent) c.remove(); c.parent = n; n.children.push(c); },
      insertChild(i, c) { if (c.parent) c.remove(); c.parent = n; n.children.splice(i, 0, c); },
      remove() { const list = n.parent.children; list.splice(list.indexOf(n), 1); n.parent = null; },
      resize(w, h) { n.width = w; n.height = h; },
      setBoundVariable(field, v) { n.bound[field] = v.name; },
      setSharedPluginData(ns, key, value) { n.plugin[`${ns}/${key}`] = value; },
      getSharedPluginData(ns, key) { return n.plugin[`${ns}/${key}`] || ''; },
      setExplicitVariableModeForCollection(c, modeId) { log.push(`mode ${c.name}=${modeId}`); },
      findAll(pred) { const out = []; const walk = (x) => { for (const c of x.children) { if (pred(c)) out.push(c); walk(c); } }; walk(n); return out; },
      ...extra,
    };
    for (const [prop, axis] of [['layoutSizingHorizontal', 'horizontal'], ['layoutSizingVertical', 'vertical']]) {
      Object.defineProperty(n, prop, {
        get: () => n.sizing[axis],
        set: (v) => {
          const auto = n.layoutMode && n.layoutMode !== 'NONE';
          if (v === 'HUG' && !auto && n.type !== 'TEXT') throw new Error(`HUG on ${n.type} without auto layout`);
          if (v === 'FILL' && !(n.parent && n.parent.layoutMode && n.parent.layoutMode !== 'NONE')) throw new Error('FILL without an auto-layout parent');
          n.sizing[axis] = v;
        },
      });
    }
    return n;
  };
  const makeSet = (name, id, layoutMode, defs, build) => {
    const variant = node('COMPONENT', { name: 'variant=default', layoutMode });
    build(variant, 'main');
    variant.createInstance = () => {
      const instance = node('INSTANCE', { name, layoutMode });
      build(instance, 'instance');
      instance.setProperties = (props) => log.push(`setProperties ${JSON.stringify(props)}`);
      return instance;
    };
    const set = node('COMPONENT_SET', { id, name, defaultVariant: variant, componentPropertyDefinitions: defs });
    set.appendChild(variant);
    return set;
  };
  const button = makeSet('Button', '1:0', 'HORIZONTAL', {
    variant: { type: 'VARIANT', variantOptions: ['default', 'secondary'] },
    'label#1:1': { type: 'TEXT' },
    'hasIcon#1:2': { type: 'BOOLEAN' },
  }, (parent) => parent.appendChild(node('TEXT', { name: 'label', fontName: { family: 'Inter', style: 'Medium' }, componentPropertyReferences: { characters: 'label#1:1' } })));
  const spinner = makeSet('Spinner', '2:0', 'NONE', { size: { type: 'VARIANT', variantOptions: ['sm', 'md'] } }, () => {});
  const panel = makeSet('Panel', '3:0', 'VERTICAL', { 'Body#3:1': { type: 'SLOT' } }, (parent, kind) => {
    const slot = node('SLOT', { name: 'Body', layoutMode: 'VERTICAL', componentPropertyReferences: { slotContentId: 'Body#3:1' } });
    slot.appendChild(node('TEXT', { id: kind === 'instance' ? `I${parent.id};3:2` : '3:2', name: 'placeholder', fontName: { family: 'Inter', style: 'Regular' } }));
    parent.appendChild(slot);
  });
  const broken = makeSet('Broken', '4:0', 'HORIZONTAL', { 'label#4:1': { type: 'TEXT' } }, () => {});
  broken.defaultVariant.createInstance = () => {
    const instance = node('INSTANCE', { name: 'Broken', layoutMode: 'HORIZONTAL' });
    instance.setProperties = () => { throw new Error('setProperties exploded'); };
    return instance;
  };
  const components = node('PAGE', { name: 'Components', loadAsync: async () => {} });
  for (const set of [button, spinner, panel, broken]) components.appendChild(set);
  components.findAllWithCriteria = ({ types }) => components.findAll((n) => types.includes(n.type));
  const screensPage = node('PAGE', { name: 'Screens', loadAsync: async () => {} });
  for (const s of screens) {
    const f = node('FRAME', { name: s.name, x: 0, width: 390 });
    if (s.marked) f.setSharedPluginData('throughline', 'composedScreen', '{}');
    if (s.inSection) {
      const section = node('SECTION', { name: 'Flows' });
      section.appendChild(f);
      screensPage.appendChild(section);
    } else screensPage.appendChild(f);
  }
  const vars = [
    { id: 'v1', name: 'space/gap/md', resolvedType: 'FLOAT', scopes: ['GAP'], variableCollectionId: 'C:1', valuesByMode: { 'M:2': { type: 'VARIABLE_ALIAS', id: 'v3' } } },
    { id: 'v2', name: 'color/bg/canvas', resolvedType: 'COLOR', scopes: ['ALL_SCOPES'], variableCollectionId: 'C:1', valuesByMode: { 'M:2': { r: 1, g: 1, b: 1, a: 1 } } },
    { id: 'v3', name: 'space/4', resolvedType: 'FLOAT', scopes: ['ALL_SCOPES'], variableCollectionId: 'C:1', valuesByMode: { 'M:2': 16 } },
  ];
  const root = node('DOCUMENT');
  root.appendChild(components);
  root.appendChild(screensPage);
  const figma = {
    mixed: Symbol('mixed'),
    fileKey: undefined,
    root,
    log,
    createFrame: () => node('FRAME'),
    createPage: () => { const p = node('PAGE', { loadAsync: async () => {} }); root.appendChild(p); return p; },
    loadFontAsync: async (f) => log.push(`font ${f.family} ${f.style}`),
    getLocalTextStylesAsync: async () => [{ id: 'S:1', name: 'Heading/L', fontName: { family: 'Inter', style: 'Bold' } }],
    variables: {
      getLocalVariablesAsync: async () => vars,
      getLocalVariableCollectionsAsync: async () => [{ id: 'C:1', name: 'Color / Semantic', defaultModeId: 'M:2', modes: [{ name: 'Light', modeId: 'M:2' }] }],
      setBoundVariableForPaint: (paint, field, v) => ({ ...paint, bound: v.name }),
    },
  };
  // Text nodes log their characters and take a style through an async setter.
  figma.createText = () => {
    const t = node('TEXT');
    let chars;
    Object.defineProperty(t, 'characters', { get: () => chars, set: (v) => { chars = v; log.push(`characters ${v}`); } });
    t.setTextStyleIdAsync = async (id) => { t.textStyleId = id; log.push(`style ${id}`); };
    return t;
  };
  return figma;
}

async function runComposeSnippet(figma, mode, spec) {
  const code = snippetOf(buildFigmaCompose(composeSources()));
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  return new AsyncFunction('figma', `${code}\nreturn await runCompose(${JSON.stringify(mode)}, ${JSON.stringify(spec)});`)(figma);
}

const composeDescription = (children) => ({
  screen: 'Sign in', page: 'Screens', width: 390, modes: { 'Color / Semantic': 'Light' },
  root: { layout: 'vertical', gap: 'space/gap/md', fill: 'color/bg/canvas', children: children ?? [
    { text: 'Welcome', style: 'Heading/L', color: 'color/bg/canvas' },
    { component: 'Button', props: { variant: 'Secondary', label: 'Go', hasIcon: true } },
    { layout: 'horizontal', sizing: { horizontal: 'fill' } },
  ] },
});
const composeBuild = (figma, description) => runComposeSnippet(figma, 'build', { componentsPage: 'Components', description, fileKey: 'TEST' });
const screensOf = (figma) => figma.root.children.find((p) => p.name === 'Screens');

test('compose build: writes a marked WIP frame with bound values, in one font batch and one style batch', async () => {
  const figma = fakeComposeFigma();
  const result = await composeBuild(figma, composeDescription());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const wip = screensOf(figma).children.find((n) => n.name === 'WIP: Sign in');
  assert.ok(wip.getSharedPluginData('throughline', 'composedScreen').includes('"screen":"Sign in"'));
  assert.equal(wip.bound.itemSpacing, 'space/gap/md');
  assert.deepEqual(wip.fills.map((f) => f.bound), ['color/bg/canvas']);
  assert.equal(wip.width, 390);
  const [text, instance, row] = wip.children;
  assert.equal(text.textStyleId, 'S:1');
  assert.deepEqual(text.fills.map((f) => f.bound), ['color/bg/canvas']);
  assert.equal(instance.type, 'INSTANCE');
  assert.deepEqual(instance.sizing, {}, 'an instance not asked to resize keeps its size');
  assert.deepEqual(row.fills, [], 'a frame with no fill named has no paint, not Figma\'s default white');
  assert.deepEqual(row.sizing, { horizontal: 'FILL', vertical: 'HUG' });
  // Fonts in one batch before any write (Inter Regular, which a new text node
  // starts in, then the style's and the set's), characters while the text is
  // still Inter Regular, variant props before the rest, styles after everything.
  assert.deepEqual(figma.log.filter((l) => !l.startsWith('font')), [
    'mode Color / Semantic=M:2',
    'characters Welcome',
    'setProperties {"variant":"secondary"}',
    'setProperties {"label#1:1":"Go","hasIcon#1:2":true}',
    'style S:1',
  ]);
  const fonts = figma.log.filter((l) => l.startsWith('font'));
  assert.deepEqual(fonts.sort(), ['font Inter Bold', 'font Inter Medium', 'font Inter Regular']);
  assert.ok(figma.log.lastIndexOf(fonts.at(-1)) < figma.log.indexOf('mode Color / Semantic=M:2'));
  assert.equal(result.link, `https://www.figma.com/design/TEST?node-id=${wip.id.replace(':', '-')}`);
});

test('compose build: a component without auto layout keeps its size, and hug on it is refused before writing', async () => {
  const figma = fakeComposeFigma();
  const ok = await composeBuild(figma, composeDescription([{ component: 'Spinner' }, { component: 'Spinner', sizing: { horizontal: 'fill' } }]));
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  const [kept, filled] = screensOf(figma).children[0].children;
  assert.deepEqual(kept.sizing, {});
  assert.deepEqual(filled.sizing, { horizontal: 'FILL' });
  const refused = fakeComposeFigma();
  const res = await composeBuild(refused, composeDescription([{ component: 'Spinner', sizing: { vertical: 'hug' } }]));
  assert.deepEqual(res.errors.map((e) => e.kind), ['invalid']);
  assert.equal(screensOf(refused).children.length, 0);
});

test('compose build: slot content replaces the placeholder in the slot the prop names', async () => {
  const figma = fakeComposeFigma();
  const res = await composeBuild(figma, composeDescription([{ component: 'Panel', slots: { Body: [
    { layout: 'vertical', name: 'Added', sizing: { horizontal: 'fill' } },
  ] } }]));
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  const slot = screensOf(figma).children[0].children[0].children.find((n) => n.type === 'SLOT');
  assert.deepEqual(slot.children.map((n) => n.name), ['Added']);
  assert.deepEqual(slot.children[0].sizing, { horizontal: 'FILL', vertical: 'HUG' });
});

test('compose build: a throw mid-write rolls back the WIP frame and a page it created', async () => {
  const figma = fakeComposeFigma();
  await assert.rejects(composeBuild(figma, { ...composeDescription([{ component: 'Broken', props: { label: 'x' } }]), page: 'New page' }), /rolled back, nothing written: setProperties exploded/);
  assert.deepEqual(figma.root.children.map((p) => p.name), ['Components', 'Screens']);
  const existing = fakeComposeFigma();
  await assert.rejects(composeBuild(existing, composeDescription([{ component: 'Broken', props: { label: 'x' } }])), /rolled back/);
  assert.equal(screensOf(existing).children.length, 0);
});

test('compose build: a missing component, or a name a person used (in a section too), writes nothing', async () => {
  const figma = fakeComposeFigma();
  const missing = await composeBuild(figma, composeDescription([{ component: 'DatePicker' }]));
  assert.deepEqual(missing.errors.map((e) => e.kind), ['missing-component']);
  assert.equal(screensOf(figma).children.length, 0);
  for (const where of [{}, { inSection: true }]) {
    const taken = fakeComposeFigma({ screens: [{ name: 'Sign in', marked: false, ...where }] });
    const res = await composeBuild(taken, composeDescription());
    assert.deepEqual(res.errors.map((e) => e.kind), ['name-taken'], JSON.stringify(where));
    assert.equal(screensOf(taken).children.length, 1);
  }
});

test('compose finalize: replaces a composed screen where it sat (in a section too), refuses one a person made', async () => {
  for (const where of [{}, { inSection: true }]) {
    const figma = fakeComposeFigma({ screens: [{ name: 'Sign in', marked: true, ...where }] });
    await composeBuild(figma, composeDescription());
    const done = await runComposeSnippet(figma, 'finalize', { page: 'Screens', screen: 'Sign in', fileKey: 'TEST' });
    assert.equal(done.replaced, true);
    const page = screensOf(figma);
    const names = (where.inSection ? page.children[0].children : page.children).map((n) => n.name);
    assert.deepEqual(names, ['Sign in'], JSON.stringify(where));
  }

  const person = fakeComposeFigma();
  await composeBuild(person, composeDescription());
  const page = screensOf(person);
  const theirs = person.createFrame();
  theirs.name = 'Sign in';
  page.appendChild(theirs);
  await assert.rejects(runComposeSnippet(person, 'finalize', { page: 'Screens', screen: 'Sign in' }), /wasn't composed by throughline/);
  assert.deepEqual(page.children.map((n) => n.name).sort(), ['Sign in', 'WIP: Sign in']);
});

// Panel (1:6) nests a Card instance (a component sublayer, id 'I1:6;5:0') whose
// Body slot holds a stack someone added (5:5). Panel's own slot holds an added
// stack (2:1) that itself holds a Tag instance (2:2) with an added stack (2:3) in
// its slot. Every added stack has a raw 16 px gap; each must fail exactly once.
function fakeNestedSlotFigma() {
  const leaf = (id) => ({ id, name: 'Row', type: 'FRAME', visible: true, fills: [], strokes: [], layoutMode: 'NONE', children: [] });
  const stack = (id, name, extra = []) => ({
    id, name, type: 'FRAME', visible: true, fills: [], strokes: [], layoutMode: 'VERTICAL', itemSpacing: 16,
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, primaryAxisAlignItems: 'MIN',
    children: [leaf(`${id}a`), leaf(`${id}b`), ...extra],
  });
  const link = (parent) => { for (const c of parent.children || []) { c.parent = parent; link(c); } return parent; };
  const findAll = (n) => (pred) => { const out = []; const walk = (x) => { for (const c of x.children || []) { if (pred(c)) out.push(c); walk(c); } }; walk(n); return out; };
  const instance = (id, name, children) => { const n = { id, name, type: 'INSTANCE', visible: true, fills: [], strokes: [], overrides: [], findOne: () => null, children }; n.findAll = findAll(n); return n; };
  const tag = instance('2:2', 'Tag', [{ id: 'I2:2;7:0', name: 'Body', type: 'SLOT', children: [stack('2:3', 'Deepest')] }]);
  const card = instance('I1:6;5:0', 'Card', [{ id: 'I1:6;5:1', name: 'Body', type: 'SLOT', children: [stack('5:5', 'Nested')] }]);
  const panel = instance('1:6', 'Panel', [card, { id: 'I1:6;9:0', name: 'Body', type: 'SLOT', children: [stack('2:1', 'Added', [tag])] }]);
  const screen = link({ id: '1:2', name: 'Home', type: 'FRAME', visible: true, fills: [], strokes: [], layoutMode: 'NONE', children: [panel] });
  const page = { name: 'Templates', children: [screen], loadAsync: async () => {}, findOne: () => null };
  const gap = { id: 'v2', name: 'space/4', scopes: ['GAP'], variableCollectionId: 'c1', valuesByMode: { m: 16 } };
  const white = { id: 'v1', name: 'color/bg/canvas', variableCollectionId: 'c1', valuesByMode: { m: { r: 1, g: 1, b: 1, a: 1 } } };
  return {
    mixed: Symbol('mixed'),
    root: { children: [page] },
    variables: {
      getLocalVariablesAsync: async (type) => (type === 'COLOR' ? [white] : [gap]),
      getVariableCollectionByIdAsync: async () => ({ modes: [{ modeId: 'm', name: 'Default' }], defaultModeId: 'm' }),
      getVariableByIdAsync: async () => null,
    },
  };
}

test('the adherence snippet reads slots on nested instances, and content in slot content once', async () => {
  const code = snippetOf(buildFigmaAdherence(adherenceSources()));
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const run = new AsyncFunction('figma', `${code}\nreturn await runScreenGate({ page: 'Templates', fileKey: 'TEST' }, []);`);
  const result = await run(fakeNestedSlotFigma());
  assert.deepEqual(result.failures.map((f) => f.id).sort(), ['2:1', '2:3', '5:5']);
});

const driftSnippet = (md, which) => {
  const at = md.indexOf(`## The ${which} snippet`);
  const from = md.indexOf('```js', at) + '```js'.length;
  return md.slice(from, md.indexOf('```', from));
};

test('drift build: read-only snippets, the variables one small, every shared helper declared once', () => {
  const md = buildFigmaDrift(driftSources());
  const variables = driftSnippet(md, 'variables');
  const screens = driftSnippet(md, 'screens');
  assert.match(variables, /async function runDriftVariables\(/);
  assert.match(screens, /async function runDriftScreens\(/);
  assert.ok(variables.length < 8000, `the variables snippet runs on every sync; keep it small (${variables.length})`);
  for (const code of [variables, screens]) {
    for (const writer of ['runCompose', 'composeBuild', 'composeFinalize', 'composeDiscard']) assert.ok(!code.includes(`function ${writer}(`), `${writer} must not be in a drift snippet`);
    assert.ok(!/^\s*(import|export)\b/m.test(code), 'snippets must contain no import/export lines');
  }
  const compose = snippetOf(buildFigmaCompose(composeSources()));
  for (const helper of ['function composeFindPage(', 'function composeTopFrames(', 'async function composeReadInventory(', 'const COMPOSE_NS ', 'const composeIsMarked ']) {
    assert.equal(screens.split(helper).length - 1, 1, `${helper} in drift`);
    assert.equal(compose.split(helper).length - 1, 1, `${helper} in compose`);
  }
  assert.equal(readFileSync(join(HERE, '..', 'references', 'figma-drift.md'), 'utf8'), md, 'run: node scripts/build-figma-checks.mjs');
});

async function runDriftSnippet(figma, which, spec) {
  const code = driftSnippet(buildFigmaDrift(driftSources()), which);
  const call = which === 'variables' ? 'runDriftVariables()'
    : which === 'components' ? `runDriftComponents(${JSON.stringify(spec)})` : `runDriftScreens(${JSON.stringify(spec)})`;
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  return new AsyncFunction('figma', `${code}\nreturn await ${call};`)(figma);
}
test('drift screens: clean, broken, released and gone', async () => {
  const figma = fakeComposeFigma({ screens: [{ name: 'Hand made' }] });
  await composeBuild(figma, composeDescription());
  await runComposeSnippet(figma, 'finalize', { page: 'Screens', screen: 'Sign in', fileKey: 'TEST' });
  const entry = (screen, plan) => ({ side: 'figma', screen, target: 'Screens', componentsPage: 'Components', plan });
  const { screens } = await runDriftSnippet(figma, 'screens', { entries: [
    entry('Sign in', composeDescription()),
    entry('Sign in', composeDescription([{ component: 'Date Picker' }])),
    entry('Hand made', composeDescription()),
    entry('Gone', composeDescription()),
  ] });
  assert.deepEqual(screens.map((s) => s.state), ['clean', 'broken', 'released', 'gone']);
  assert.match(screens[1].errors[0], /missing-component at root\.children\[0\]\.component: Date Picker/);
});

test('drift variables: one fingerprint per collection, stable, moved by a value behind an alias', async () => {
  const figma = fakeComposeFigma();
  const first = await runDriftSnippet(figma, 'variables');
  assert.deepEqual(Object.keys(first), ['Color / Semantic']);
  assert.equal(first['Color / Semantic'].variables, 3);
  assert.match(first['Color / Semantic'].hash, /^[0-9a-f]{8}$/);
  assert.deepEqual(await runDriftSnippet(figma, 'variables'), first);
  const vars = await figma.variables.getLocalVariablesAsync();
  vars.find((v) => v.id === 'v3').valuesByMode['M:2'] = 20;
  assert.notEqual((await runDriftSnippet(figma, 'variables'))['Color / Semantic'].hash, first['Color / Semantic'].hash, 'space/gap/md aliases space/4');
  vars.reverse();
  vars.find((v) => v.id === 'v3').valuesByMode['M:2'] = 16;
  assert.deepEqual(await runDriftSnippet(figma, 'variables'), first, 'order of variables does not matter');
});

test('drift components: a bare, small snippet with no inlined modules', () => {
  const components = driftSnippet(buildFigmaDrift(driftSources()), 'components');
  assert.match(components, /async function runDriftComponents\(/);
  for (const name of ['resolveScreen', 'dimensionBuckets', 'composeReadInventory']) assert.ok(!components.includes(name), `${name} must not be in the components snippet`);
  assert.ok(!/^\s*(import|export)\b/m.test(components), 'no import/export lines');
  assert.ok(components.length < 4096, `an agent carries this by hand; keep it small (${components.length})`);
});

// Pages of component sets, each set { name, axes } or { name, conflict: [variantProperties…] }.
function fakeComponentsFigma(pages) {
  const set = (s) => ({
    name: s.name,
    get variantGroupProperties() {
      if (s.conflict) throw new Error('conflicting');
      return Object.fromEntries(Object.entries(s.axes).map(([k, values]) => [k, { values }]));
    },
    children: (s.conflict || []).map((variantProperties) => ({ variantProperties })),
  });
  return {
    root: {
      children: Object.entries(pages).map(([name, sets]) => {
        const page = { name, loaded: false, async loadAsync() { page.loaded = true; }, findAllWithCriteria: () => sets.map(set) };
        return page;
      }),
    },
  };
}

test('drift components: axes per asked name, folded match, null when missing, only the one page loaded', async () => {
  const figma = fakeComponentsFigma({
    Cover: [],
    '    ↳ Components': [
      { name: 'Button', axes: { size: ['sm', 'md'], state: ['Default', 'Hover'] } },
      { name: 'Select Menu', conflict: [{ Size: 'sm' }, { Size: 'md' }, { Size: 'sm' }] },
    ],
  });
  const out = await runDriftSnippet(figma, 'components', { names: ['Button', 'SelectMenu', 'Card'] });
  assert.deepEqual(out, {
    page: '    ↳ Components',
    components: { Button: { axes: { size: ['sm', 'md'], state: ['Default', 'Hover'] } }, SelectMenu: { axes: { Size: ['sm', 'md'] } }, Card: null },
  });
  assert.equal(figma.root.children[0].loaded, false, 'only the components page is loaded');
});

test('drift components: the page by name, and a clear error when the page is ambiguous or absent', async () => {
  const figma = fakeComponentsFigma({ Components: [], 'Components ': [], Library: [{ name: 'Button', axes: { size: ['sm'] } }] });
  assert.deepEqual((await runDriftSnippet(figma, 'components', { names: ['Button'], componentsPage: 'Library' })).components, { Button: { axes: { size: ['sm'] } } });
  await assert.rejects(runDriftSnippet(figma, 'components', { names: ['Button'] }), /2 pages named like "Components"; pass componentsPage\. Pages: Components, Components , Library/);
  await assert.rejects(runDriftSnippet(figma, 'components', { names: ['Button'], componentsPage: 'Nope' }), /no page is named "Nope"/);
});

// Mode b (docs/specs/2026-10-30-design-modes.md): the compose fake plus a connected
// library. Its `button` set (key SETKEY, a text and an instance-swap prop) clashes
// with the local Button by folded name; its `li:plus` icon (key ICONKEY) is a
// standalone component. Both are reached from library instances on the Screens
// page. Library variables: color/bg/surface (K1, in Color Semantic, an alias to a
// black primitive) and color/bg/glow (K2, an alias nothing resolves).
function fakeLibraryFigma() {
  const figma = fakeComposeFigma();
  const mk = (type, extra = {}) => Object.assign(figma.createFrame(), { type, layoutMode: undefined, ...extra });
  const libSet = mk('COMPONENT_SET', {
    name: 'button', key: 'SETKEY', remote: true,
    componentPropertyDefinitions: { 'label#9:1': { type: 'TEXT' }, 'icon left#9:2': { type: 'INSTANCE_SWAP' } },
  });
  const variant = mk('COMPONENT', { name: 'type=primary', key: 'VKEY', remote: true, layoutMode: 'HORIZONTAL' });
  libSet.appendChild(variant);
  libSet.defaultVariant = variant;
  variant.createInstance = () => {
    const instance = mk('INSTANCE', { name: 'button', layoutMode: 'HORIZONTAL' });
    instance.setProperties = (props) => figma.log.push(`setProperties ${JSON.stringify(props)}`);
    return instance;
  };
  const icon = mk('COMPONENT', { name: 'li:plus', key: 'ICONKEY', remote: true, id: '50:1' });
  const screensPage = figma.root.children.find((p) => p.name === 'Screens');
  for (const main of [variant, icon]) screensPage.appendChild(mk('INSTANCE', { getMainComponentAsync: async () => main }));
  for (const page of figma.root.children) page.findAllWithCriteria = ({ types }) => page.findAll((n) => types.includes(n.type));
  const collections = {
    'C:1': { id: 'C:1', key: 'LOCAL', name: 'Color / Semantic', defaultModeId: 'M:2', modes: [{ name: 'Light', modeId: 'M:2' }] },
    LC: { id: 'LC', key: 'SEM', name: 'Color Semantic', remote: true, defaultModeId: 'LM:1', modes: [{ name: 'Dark', modeId: 'LM:1' }] },
    LP: { id: 'LP', key: 'PRIM', name: 'Color Primitives', remote: true, defaultModeId: 'LP:1', modes: [{ name: 'Value', modeId: 'LP:1' }] },
  };
  const libVars = {
    K1: { id: 'LV1', key: 'K1', name: 'color/bg/surface', resolvedType: 'COLOR', scopes: ['ALL_SCOPES'], variableCollectionId: 'LC', valuesByMode: { 'LM:1': { type: 'VARIABLE_ALIAS', id: 'LV9' } } },
    K2: { id: 'LV2', key: 'K2', name: 'color/bg/glow', resolvedType: 'COLOR', scopes: ['ALL_SCOPES'], variableCollectionId: 'LC', valuesByMode: { 'LM:1': { type: 'VARIABLE_ALIAS', id: 'nowhere' } } },
  };
  const byId = { LV9: { id: 'LV9', name: 'color/neutral/950', resolvedType: 'COLOR', variableCollectionId: 'LP', valuesByMode: { 'LP:1': { r: 0, g: 0, b: 0, a: 1 } } } };
  Object.assign(figma.variables, {
    getVariableCollectionByIdAsync: async (id) => collections[id] || null,
    getVariableByIdAsync: async (id) => byId[id] || null,
    importVariableByKeyAsync: async (key) => { figma.log.push(`import variable ${key}`); return libVars[key]; },
  });
  figma.teamLibrary = {
    getAvailableLibraryVariableCollectionsAsync: async () => [{ libraryName: 'Zygarden Design System', key: 'SEM', name: 'Color Semantic' }],
    getVariablesInLibraryCollectionAsync: async () => Object.values(libVars).map((v) => ({ key: v.key, name: v.name, resolvedType: v.resolvedType })),
  };
  figma.importComponentSetByKeyAsync = async (key) => { figma.log.push(`import set ${key}`); return libSet; };
  figma.importComponentByKeyAsync = async (key) => { figma.log.push(`import component ${key}`); return icon; };
  return figma;
}

const libraryCache = {
  readAt: '2026-10-30',
  libraries: { 'Zygarden Design System': {
    collections: { SEM: { name: 'Color Semantic', modes: [{ id: 'LM:1', name: 'Dark' }] } },
    variables: { K1: { name: 'color/bg/surface', collection: 'SEM', resolvedType: 'COLOR', kinds: ['colour'], values: { Dark: '#111111' } } },
  } },
};
const libraryTokens = { colours: { '#111111': ['color/bg/surface'] }, gap: {}, radius: {} };
const library = { pages: ['Screens'], cache: libraryCache, tokens: libraryTokens };

test('signals: stops at the first library instance; mode a only when the keys match', async () => {
  const b = await runComposeSnippet(fakeLibraryFigma(), 'signals', { pages: ['Screens'], manifestFileKey: 'SYSTEM', openFileKey: 'OPEN' });
  assert.equal(b.mode, 'b');
  assert.equal(b.libraryDetected, true);
  assert.deepEqual([b.signals.libraryCollections, b.signals.remoteInstances, b.signals.localSets], [1, 1, 0]);
  const a = await runComposeSnippet(fakeLibraryFigma(), 'signals', { pages: ['Components'], manifestFileKey: 'OPEN', openFileKey: 'OPEN' });
  assert.equal(a.mode, 'a');
  assert.equal(a.signals.localSets, 4);
});

test('library-list and library-import: names and keys, then values with aliases followed', async () => {
  const list = await runComposeSnippet(fakeLibraryFigma(), 'library-list', {});
  assert.deepEqual(list.collections.map((c) => [c.library, c.key, c.variables.map((v) => v.key)]), [['Zygarden Design System', 'SEM', ['K1', 'K2']]]);
  const { entries } = await runComposeSnippet(fakeLibraryFigma(), 'library-import', { keys: ['K1', 'K2'] });
  assert.deepEqual(entries[0], {
    key: 'K1', name: 'color/bg/surface', resolvedType: 'COLOR', kinds: ['colour'], values: { Dark: '#000000' },
    collection: { key: 'SEM', name: 'Color Semantic', modes: [{ id: 'LM:1', name: 'Dark' }] },
  });
  assert.deepEqual(entries[1].values, { Dark: null }, 'an alias nothing resolves is null');
  await assert.rejects(runComposeSnippet(fakeLibraryFigma(), 'library-import', { keys: Array.from({ length: 21 }, (_, i) => `K${i}`) }), /at most 20 keys/);
});

test('mode b build: a cached value in another mode order is not stale', async () => {
  const figma = fakeLibraryFigma();
  const twoModes = { id: 'LC', key: 'SEM', name: 'Color Semantic', remote: true, defaultModeId: 'LM:1', modes: [{ name: 'Light', modeId: 'LM:2' }, { name: 'Dark', modeId: 'LM:1' }] };
  const collectionById = figma.variables.getVariableCollectionByIdAsync;
  figma.variables.getVariableCollectionByIdAsync = async (id) => (id === 'LC' ? twoModes : collectionById(id));
  const importByKey = figma.variables.importVariableByKeyAsync;
  figma.variables.importVariableByKeyAsync = async (key) => {
    const v = await importByKey(key);
    return { ...v, valuesByMode: { ...v.valuesByMode, 'LM:2': { r: 1, g: 1, b: 1, a: 1 } } };
  };
  const cache = JSON.parse(JSON.stringify(libraryCache));
  cache.libraries['Zygarden Design System'].variables.K1.values = { Dark: '#000000', Light: '#ffffff' };
  const description = { screen: 'Reg', page: 'Screens', width: 390, root: { layout: 'vertical', fill: 'color/bg/surface', children: [] } };
  const res = await runComposeSnippet(figma, 'build', { library: { ...library, cache }, description, fileKey: 'TEST' });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.deepEqual(res.staleCache.entries, []);
});

test('mode b build: library parts and mode, a library icon swap, a raw value, local picks and a stale cache', async () => {
  const figma = fakeLibraryFigma();
  const description = {
    screen: 'Reg', page: 'Screens', width: 390, modes: { 'Color Semantic': 'Dark' },
    root: { layout: 'vertical', gap: { raw: 12 }, fill: 'color/bg/surface', children: [
      { component: 'Button', props: { label: 'Go', 'icon left': 'li:plus' } },
      { component: 'Spinner' },
    ] },
  };
  const res = await runComposeSnippet(figma, 'build', { componentsPage: 'Components', library, description, fileKey: 'TEST' });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.deepEqual(res.localPicks, ['Spinner']);
  assert.deepEqual(res.raws, [{ path: 'root.gap', kind: 'gap', value: 12 }]);
  assert.deepEqual(res.staleCache.entries.map((e) => [e.key, e.values.Dark]), [['K1', '#000000']]);
  const wip = screensOf(figma).children.find((n) => n.name === 'WIP: Reg');
  assert.equal(wip.itemSpacing, 12);
  assert.equal(wip.bound.itemSpacing, undefined);
  assert.deepEqual(wip.fills.map((f) => f.bound), ['color/bg/surface']);
  assert.equal(wip.children[0].name, 'button');
  assert.ok(figma.log.includes('mode Color Semantic=LM:1'));
  assert.ok(figma.log.includes('setProperties {"label#9:1":"Go","icon left#9:2":"50:1"}'), figma.log.join('\n'));
  assert.ok(!figma.log.some((l) => l.startsWith('import set') || l.startsWith('import component')),
    'a set or icon reached through a library instance is used as it is, not imported by key (that hung live)');
});

test('mode b build: a raw value a variable holds is refused before anything is written', async () => {
  const figma = fakeLibraryFigma();
  const res = await runComposeSnippet(figma, 'build', { componentsPage: 'Components', library, fileKey: 'TEST', description: {
    screen: 'Reg', page: 'Screens', width: 390, root: { layout: 'vertical', gap: { raw: 16 }, fill: { raw: '#111111' }, children: [] },
  } });
  assert.deepEqual(res.errors.map((e) => [e.kind, e.path, e.nearest]), [
    ['raw-has-variable', 'root.gap', ['space/4']],
    ['raw-has-variable', 'root.fill', ['color/bg/surface']],
  ]);
  assert.ok(!screensOf(figma).children.some((n) => n.name === 'WIP: Reg'));
  assert.ok(!figma.log.some((l) => l.startsWith('import')), 'nothing is imported for a plan that fails');
});

test('the adherence gate counts library tokens: a raw value one holds fails, and the rest stay advisories', async () => {
  const code = snippetOf(buildFigmaAdherence(adherenceSources()));
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const target = { page: 'Templates', fileKey: 'TEST', libraryTokens: { colours: { '#00000080': ['lib/scrim'] }, gap: {}, radius: {} } };
  const result = await new AsyncFunction('figma', `${code}\nreturn await runScreenGate(${JSON.stringify(target)}, []);`)(fakeFigma());
  assert.ok(result.failures.some((f) => f.detail === 'fill #00000080: bind lib/scrim'));
  assert.deepEqual(result.advisories, []);
});
