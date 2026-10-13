import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFigmaChecks, buildFigmaAdherence, buildFigmaCompose } from './build-figma-checks.mjs';

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
  writerSource: read('figma-compose.figma.js'),
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

// A fake Figma just deep enough for the writer: a Components page with a Button
// set (variant, text and boolean props), a page that may already hold screens, one
// spacing and one colour variable, one text style. It records every call the
// writer makes that matters to the result.
function fakeComposeFigma({ screens = [] } = {}) {
  const log = [];
  let nextId = 100;
  const node = (type, extra = {}) => {
    const n = {
      id: `9:${nextId++}`, type, name: type, x: 0, y: 0, width: 100, height: 100, children: [], parent: null,
      plugin: {}, bound: {}, fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }], strokes: [],
      appendChild(c) { c.parent = n; n.children.push(c); },
      remove() { const list = n.parent.children; list.splice(list.indexOf(n), 1); n.parent = null; },
      resize(w, h) { n.width = w; n.height = h; },
      setBoundVariable(field, v) { n.bound[field] = v.name; },
      setSharedPluginData(ns, key, value) { n.plugin[`${ns}/${key}`] = value; },
      getSharedPluginData(ns, key) { return n.plugin[`${ns}/${key}`] || ''; },
      setExplicitVariableModeForCollection(c, modeId) { log.push(`mode ${c.name}=${modeId}`); },
      findAll(pred) { const out = []; const walk = (x) => { for (const c of x.children) { if (pred(c)) out.push(c); walk(c); } }; walk(n); return out; },
      ...extra,
    };
    return n;
  };
  const label = node('TEXT', { name: 'label', fontName: { family: 'Inter', style: 'Medium' }, componentPropertyReferences: { characters: 'label#1:1' } });
  const variant = node('COMPONENT', { name: 'variant=default' });
  variant.appendChild(label);
  variant.createInstance = () => {
    const instance = node('INSTANCE', { name: 'Button' });
    instance.appendChild(node('TEXT', { fontName: label.fontName, componentPropertyReferences: { characters: 'label#1:1' } }));
    instance.setProperties = (props) => log.push(`setProperties ${JSON.stringify(props)}`);
    return instance;
  };
  const set = node('COMPONENT_SET', {
    id: '1:0', name: 'Button', defaultVariant: variant,
    componentPropertyDefinitions: {
      variant: { type: 'VARIANT', variantOptions: ['default', 'secondary'] },
      'label#1:1': { type: 'TEXT' },
      'hasIcon#1:2': { type: 'BOOLEAN' },
    },
  });
  set.appendChild(variant);
  const components = node('PAGE', { name: 'Components', loadAsync: async () => {}, findAllWithCriteria: ({ types }) => set.findAll((n) => types.includes(n.type)).concat(types.includes('COMPONENT_SET') ? [set] : []) });
  const screensPage = node('PAGE', { name: 'Screens', loadAsync: async () => {} });
  for (const s of screens) {
    const f = node('FRAME', { name: s.name, x: 0, width: 390 });
    if (s.marked) f.setSharedPluginData('throughline', 'composedScreen', '{}');
    screensPage.appendChild(f);
  }
  const vars = [
    { id: 'v1', name: 'space/gap/md', resolvedType: 'FLOAT', scopes: ['GAP'] },
    { id: 'v2', name: 'color/bg/canvas', resolvedType: 'COLOR', scopes: ['ALL_SCOPES'] },
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
    createText: () => node('TEXT'),
    createPage: () => { const p = node('PAGE', { loadAsync: async () => {} }); root.appendChild(p); return p; },
    loadFontAsync: async (f) => log.push(`font ${f.family} ${f.style}`),
    getLocalTextStylesAsync: async () => [{ id: 'S:1', name: 'Heading/L' }],
    getStyleByIdAsync: async () => ({ fontName: { family: 'Inter', style: 'Bold' } }),
    variables: {
      getLocalVariablesAsync: async () => vars,
      getLocalVariableCollectionsAsync: async () => [{ id: 'C:1', name: 'Color / Semantic', modes: [{ name: 'Light', modeId: 'M:2' }] }],
      setBoundVariableForPaint: (paint, field, v) => ({ ...paint, bound: v.name }),
    },
  };
  // Text nodes take a style through an async setter.
  const createText = figma.createText;
  figma.createText = () => { const t = createText(); t.setTextStyleIdAsync = async (id) => { t.textStyleId = id; log.push(`style before characters: ${t.characters === undefined}`); }; return t; };
  return figma;
}

async function runComposeSnippet(figma, mode, spec) {
  const code = snippetOf(buildFigmaCompose(composeSources()));
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  return new AsyncFunction('figma', `${code}\nreturn await runCompose(${JSON.stringify(mode)}, ${JSON.stringify(spec)});`)(figma);
}

const composeDescription = (component = 'Button') => ({
  screen: 'Sign in', page: 'Screens', width: 390, modes: { 'Color / Semantic': 'Light' },
  root: { layout: 'vertical', gap: 'space/gap/md', fill: 'color/bg/canvas', children: [
    { text: 'Welcome', style: 'Heading/L', color: 'color/bg/canvas' },
    { component, props: { variant: 'Secondary', label: 'Go', hasIcon: true } },
    { layout: 'horizontal', sizing: { horizontal: 'fill' } },
  ] },
});

test('compose build: writes a marked WIP frame with bound values and the props in order', async () => {
  const figma = fakeComposeFigma();
  const result = await runComposeSnippet(figma, 'build', { componentsPage: 'Components', description: composeDescription(), fileKey: 'TEST' });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const page = figma.root.children[1];
  const wip = page.children.find((n) => n.name === 'WIP: Sign in');
  assert.ok(wip.getSharedPluginData('throughline', 'composedScreen').includes('"screen":"Sign in"'));
  assert.equal(wip.bound.itemSpacing, 'space/gap/md');
  assert.deepEqual(wip.fills.map((f) => f.bound), ['color/bg/canvas']);
  assert.equal(wip.width, 390);
  const [text, instance, row] = wip.children;
  assert.deepEqual(row.fills, [], 'a frame with no fill named has no paint, not Figma\'s default white');
  assert.equal(row.layoutSizingHorizontal, 'FILL');
  assert.equal(text.textStyleId, 'S:1');
  assert.equal(text.characters, 'Welcome');
  assert.deepEqual(text.fills.map((f) => f.bound), ['color/bg/canvas']);
  assert.equal(instance.type, 'INSTANCE');
  const calls = figma.log.filter((l) => l.startsWith('setProperties') || l.startsWith('style') || l.startsWith('mode'));
  assert.deepEqual(calls, [
    'mode Color / Semantic=M:2',
    'style before characters: true',
    'setProperties {"variant":"secondary"}',
    'setProperties {"label#1:1":"Go","hasIcon#1:2":true}',
  ]);
  assert.ok(figma.log.indexOf('font Inter Medium') < figma.log.indexOf('setProperties {"label#1:1":"Go","hasIcon#1:2":true}'));
  assert.equal(result.link, `https://www.figma.com/design/TEST?node-id=${wip.id.replace(':', '-')}`);
});

test('compose build: a missing component or a taken name writes nothing', async () => {
  const figma = fakeComposeFigma();
  const missing = await runComposeSnippet(figma, 'build', { componentsPage: 'Components', description: composeDescription('DatePicker') });
  assert.deepEqual(missing.errors.map((e) => e.kind), ['missing-component']);
  assert.equal(figma.root.children[1].children.length, 0);
  const taken = fakeComposeFigma({ screens: [{ name: 'Sign in', marked: false }] });
  const res = await runComposeSnippet(taken, 'build', { componentsPage: 'Components', description: composeDescription() });
  assert.deepEqual(res.errors.map((e) => e.kind), ['name-taken']);
  assert.equal(taken.root.children[1].children.length, 1);
});

test('compose finalize: replaces a composed screen, refuses one a person made', async () => {
  const figma = fakeComposeFigma({ screens: [{ name: 'Sign in', marked: true }] });
  await runComposeSnippet(figma, 'build', { componentsPage: 'Components', description: composeDescription() });
  const done = await runComposeSnippet(figma, 'finalize', { page: 'Screens', screen: 'Sign in', fileKey: 'TEST' });
  assert.equal(done.replaced, true);
  assert.deepEqual(figma.root.children[1].children.map((n) => n.name), ['Sign in']);

  const person = fakeComposeFigma();
  await runComposeSnippet(person, 'build', { componentsPage: 'Components', description: composeDescription() });
  const page = person.root.children[1];
  const theirs = person.createFrame();
  theirs.name = 'Sign in';
  page.appendChild(theirs);
  await assert.rejects(runComposeSnippet(person, 'finalize', { page: 'Screens', screen: 'Sign in' }), /wasn't composed by throughline/);
  assert.deepEqual(page.children.map((n) => n.name).sort(), ['Sign in', 'WIP: Sign in']);
});
