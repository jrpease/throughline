import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeLibraryInventory, libraryLocalPicks, isLibraryId } from './figma-compose-library.mjs';
import { resolveScreen } from './figma-compose.mjs';

const local = JSON.parse(readFileSync(new URL('./fixtures/figma-compose/inventory.json', import.meta.url), 'utf8'));
const button = local.sets.find((s) => s.name === 'Button');

const cache = {
  readAt: '2026-10-30',
  libraries: {
    'Zygarden Design System': {
      collections: { SEM: { name: 'Color Semantic', modes: [{ id: 'LM:1', name: 'Dark' }, { id: 'LM:2', name: 'Light' }] } },
      variables: {
        K1: { name: 'color/bg/canvas', collection: 'SEM', resolvedType: 'COLOR', kinds: ['colour'], values: { Dark: '#070a10', Light: '#ffffff' } },
        K2: { name: 'space/inset/md', collection: 'SEM', resolvedType: 'FLOAT', kinds: ['gap'], values: { Dark: 16 } },
      },
    },
  },
};
const library = {
  sets: [{ name: 'button', key: 'SETKEY', autoLayout: true, props: button.props }],
  components: [{ name: 'li:plus', key: 'ICONKEY' }],
  cache,
  tokens: { colours: { '#070a10': ['color/bg/canvas'], '#ffffff': ['color/bg/canvas'] }, gap: { 16: ['space/inset/md'] }, radius: {} },
  localValues: { colours: { '#ff0000': ['local/red'] }, gap: {}, radius: {} },
};
const merged = mergeLibraryInventory(local, library);

test('figma-compose-library.mjs has no import statements', () => {
  const src = readFileSync(new URL('./figma-compose-library.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import\b/m);
});

test('the library wins a folded-name clash; other local parts stay', () => {
  const buttons = merged.sets.filter((s) => s.name.toLowerCase() === 'button');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].id, 'lib:SETKEY');
  assert.ok(merged.sets.some((s) => s.name === 'Input' && !isLibraryId(s.id)));
  const canvas = merged.variables.filter((v) => v.name === 'color/bg/canvas');
  assert.deepEqual(canvas.map((v) => v.id), ['lib:K1']);
});

test('library icons are swap targets; collections carry their modes; text styles stay local', () => {
  assert.ok(merged.components.some((c) => c.name === 'li:plus' && c.id === 'lib:ICONKEY'));
  assert.deepEqual(merged.collections.find((c) => c.name === 'Color Semantic').modes, [{ name: 'Dark', id: 'LM:1' }, { name: 'Light', id: 'LM:2' }]);
  assert.deepEqual(merged.textStyles, local.textStyles);
  assert.equal(merged.allowRaw, true);
  assert.deepEqual(merged.valueIndex.colours['#ff0000'], ['local/red']);
});

test('an empty library side is the local inventory plus raw values', () => {
  const m = mergeLibraryInventory(local, { cache: null, tokens: null, localValues: null });
  assert.deepEqual(m.sets, local.sets);
  assert.equal(m.allowRaw, true);
  assert.deepEqual(m.valueIndex, { colours: {}, gap: {}, radius: {} });
});

const screen = (root, modes) => ({ screen: 'Reg', page: 'Screens', width: 390, modes, root });

test('a mode b screen resolves library parts, a library mode, and lists local picks', () => {
  const r = resolveScreen(screen({
    layout: 'vertical', fill: 'color/bg/canvas', gap: 'space/inset/md',
    children: [
      { component: 'Button', props: { label: 'Go', trailingIcon: 'li:plus' } },
      { component: 'Input' },
    ],
  }, { 'Color Semantic': 'Light' }), merged);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.plan.root.fill, 'lib:K1');
  assert.deepEqual(r.plan.modes, [{ collectionId: 'lib:SEM', modeId: 'LM:2' }]);
  assert.equal(r.plan.root.children[0].setId, 'lib:SETKEY');
  assert.deepEqual(libraryLocalPicks(r.plan, merged), ['Input']);
});

test('raw values: refused in mode a, refused when a variable holds them, listed otherwise', () => {
  const rawFill = (fill) => screen({ layout: 'vertical', fill, children: [] });
  const modeA = resolveScreen(rawFill({ raw: '#123456' }), local);
  assert.equal(modeA.errors[0].kind, 'invalid');
  const held = resolveScreen(rawFill({ raw: '#070A10' }), merged);
  assert.deepEqual(held.errors, [{ kind: 'raw-has-variable', path: 'root.fill', asked: '#070a10', nearest: ['color/bg/canvas'] }]);
  const heldLocal = resolveScreen(rawFill({ raw: '#ff0000' }), merged);
  assert.equal(heldLocal.errors[0].kind, 'raw-has-variable');
  const ok = resolveScreen(screen({ layout: 'vertical', fill: { raw: '#123456ff' }, gap: { raw: 12 }, padding: { top: { raw: 8 } }, children: [] }), merged);
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.deepEqual(ok.plan.root.fill, { raw: '#123456' });
  assert.deepEqual(ok.plan.raws.map((x) => x.path), ['root.padding.top', 'root.gap', 'root.fill']);
});

test('raw values: a gap a variable holds is refused; a bare raw padding is invalid; a bad raw is invalid', () => {
  assert.equal(resolveScreen(screen({ layout: 'vertical', gap: { raw: 16 }, children: [] }), merged).errors[0].kind, 'raw-has-variable');
  assert.equal(resolveScreen(screen({ layout: 'vertical', padding: { raw: 12 }, children: [] }), merged).errors[0].kind, 'invalid');
  assert.equal(resolveScreen(screen({ layout: 'vertical', fill: { raw: 'red' }, children: [] }), merged).errors[0].kind, 'invalid');
  assert.equal(resolveScreen(screen({ layout: 'vertical', gap: { raw: -1 }, children: [] }), merged).errors[0].kind, 'invalid');
});
