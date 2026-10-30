import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { COMPOSE_ERROR_KINDS, resolveScreen, nearestNames } from './figma-compose.mjs';

const DIR = new URL('./fixtures/figma-compose/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
const inventory = read('inventory.json');
const cases = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f !== 'inventory.json')
    .map((f) => [f.replace(/\.json$/, ''), read(f)]),
);
const run = (c) => resolveScreen(c.description, { ...inventory, target: c.target ?? null });

test('figma-compose.mjs has no import statements', () => {
  const src = readFileSync(new URL('./figma-compose.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import\b/m);
});

const topLevelNames = (file) => [...readFileSync(new URL(file, import.meta.url), 'utf8')
  .matchAll(/^(?:export )?(?:const|let|(?:async )?function) (\w+)/gm)].map((m) => m[1]);

test('figma-compose.mjs reuses no top-level name of the sources it is inlined with', () => {
  const mine = new Set(topLevelNames('./figma-compose.mjs'));
  for (const other of ['./figma-adherence.mjs', './figma-variables-read.figma.js']) {
    assert.deepEqual(topLevelNames(other).filter((n) => mine.has(n)), [], other);
  }
});

// A repeated `function` name doesn't throw in one script: the later one silently
// wins. So every pair of sources inlined into the compose snippet is checked.
test('no two sources of the compose snippet share a top-level name', () => {
  const files = ['./figma-adherence.mjs', './figma-compose.mjs', './design-mode.mjs', './figma-compose-library.mjs',
    './figma-variables-read.figma.js', './figma-compose-read.figma.js', './design-mode-read.figma.js',
    './library-read.figma.js', './figma-compose.figma.js'];
  const seen = new Map();
  for (const file of files) {
    for (const name of topLevelNames(file)) {
      assert.ok(!seen.has(name), `${name} is declared in both ${seen.get(name)} and ${file}`);
      seen.set(name, file);
    }
  }
});

for (const [file, c] of Object.entries(cases)) {
  test(`fixture ${file}: ${c.covers}`, () => {
    const res = run(c);
    assert.equal(res.ok, c.expected.ok, JSON.stringify(res.errors));
    assert.deepEqual(res.errors.map((e) => e.kind).sort(), [...c.expected.errors].sort());
    assert.equal(res.plan === null, !c.expected.ok);
  });
}

test('plan: real keys, set casing, swap ids, enums and modes', () => {
  const { plan } = run(cases['sign-in-ok']);
  assert.deepEqual(plan.modes, [{ collectionId: 'C:1', modeId: 'M:2' }]);
  assert.equal(plan.root.layoutMode, 'VERTICAL');
  assert.equal(plan.root.itemSpacing, 'V:4');
  assert.deepEqual(plan.root.padding, { top: 'V:5', right: 'V:5', bottom: 'V:5', left: 'V:5' });
  assert.equal(plan.root.sizing, null);
  const row = plan.root.children[3];
  assert.equal(row.primaryAxisAlignItems, 'SPACE_BETWEEN');
  assert.equal(row.counterAxisAlignItems, 'CENTER');
  assert.deepEqual(row.sizing, { horizontal: 'FILL', vertical: 'HUG' });
  const button = row.children[1];
  assert.equal(button.setId, '10:1');
  assert.deepEqual(button.variantProps, { variant: 'secondary', size: 'lg' });
  assert.deepEqual(button.otherProps, { 'label#10:273': 'Sign in', 'hasTrailing#10:455': true, 'trailingIcon#11:91': '6:553' });
  const heading = plan.root.children[0];
  assert.deepEqual([heading.type, heading.styleId, heading.color], ['text', 'S:1', 'V:2']);
});

test('plan: variant values are written in the set\'s own casing', () => {
  const [item, button] = run(cases['casing-and-suffix']).plan.root.children;
  assert.deepEqual(item.variantProps, { State: 'Selected' });
  assert.deepEqual(item.otherProps, { 'Label#23:242': 'One' });
  assert.deepEqual(button.variantProps, { state: 'Default' });
});

test('plan: slot content carries the slot key', () => {
  const panel = run(cases['slot-ok']).plan.root.children[0];
  assert.equal(panel.slots[0].key, 'Body#40:2');
  assert.equal(panel.slots[0].nodes[0].sizing.horizontal, 'FILL');
});

test('a gap names what was asked, and no nearest sets when none is close', () => {
  const [e] = run(cases['missing-component']).errors;
  assert.equal(e.path, 'root.children[0].component');
  assert.equal(e.asked, 'DatePicker');
  assert.deepEqual(e.nearest, []);
});

test('a marked screen or WIP frame is not a collision', () => {
  const c = { ...cases['name-taken'], target: { screen: 'marked', wip: 'marked' } };
  assert.equal(run(c).ok, true);
  const wip = run({ ...cases['name-taken'], target: { screen: null, wip: 'unmarked' } });
  assert.deepEqual(wip.errors.map((e) => e.asked), ['WIP: Sign up']);
});

test('a prop of the wrong type, and slot content under props, are rejected', () => {
  const res = resolveScreen({ screen: 'X', page: 'P', width: 1, root: { layout: 'vertical', children: [
    { component: 'Button', props: { label: true, hasTrailing: 'yes' } },
    { component: 'Panel', props: { Body: [] } },
  ] } }, inventory);
  assert.deepEqual(res.errors.map((e) => e.kind), ['prop-type', 'prop-type', 'invalid']);
});

test('an unknown field is rejected rather than ignored', () => {
  const res = resolveScreen({ screen: 'X', page: 'P', width: 1, root: { layout: 'vertical', gapp: 'space/4' } }, inventory);
  assert.deepEqual(res.errors.map((e) => e.path), ['root.gapp']);
});

test('nearestNames ranks by shared prefix, then edit distance', () => {
  assert.deepEqual(nearestNames('Butto', ['Badge', 'Button', 'Checkbox']).slice(0, 1), ['Button']);
});

test('nearestNames keeps typos, contained names and abbreviations, and drops the rest', () => {
  assert.equal(nearestNames('Buton', ['Badge', 'Button', 'Checkbox'])[0], 'Button');
  assert.deepEqual(nearestNames('PrimaryButton', ['Avatar', 'Button']), ['Button']);
  assert.deepEqual(nearestNames('md', ['small', 'medium', 'large']), ['medium']);
  assert.deepEqual(nearestNames('color/bg', ['color/background', 'space/4']), ['color/background']);
  assert.deepEqual(nearestNames('DatePicker', ['Spinner', 'Textarea', 'Avatar']), []);
  assert.deepEqual(nearestNames('🌙', ['Dark', 'Light']), []);
  assert.deepEqual(nearestNames('Dark', ['🌙', 'Dark mode']), ['Dark mode']);
});

test('plan: per-side padding resolves each side, and an unnamed side is left unbound', () => {
  const res = resolveScreen({ screen: 'X', page: 'P', width: 1, root: { layout: 'vertical', padding: { top: 'space/4', left: 'space/inset/lg' }, radius: 'radius/md' } }, inventory);
  assert.deepEqual(res.plan.root.padding, { top: 'V:6', left: 'V:5' });
  assert.equal(res.plan.root.radius, 'V:7');
});

test('sizing: frames hug by default; text and instances are left alone unless asked', () => {
  const { plan } = resolveScreen({ screen: 'X', page: 'P', width: 1, root: { layout: 'vertical', children: [
    { layout: 'vertical' },
    { text: 'a', style: 'Body/Default', color: 'color/text/primary' },
    { component: 'Spinner' },
    { component: 'Spinner', sizing: { horizontal: 'fill' } },
  ] } }, inventory);
  const [frame, text, spinner, filled] = plan.root.children;
  assert.deepEqual(frame.sizing, { horizontal: 'HUG', vertical: 'HUG' });
  assert.deepEqual(text.sizing, {});
  assert.deepEqual(spinner.sizing, {});
  assert.deepEqual(filled.sizing, { horizontal: 'FILL' });
});

test('every error kind a fixture raises is a documented one', () => {
  const raised = new Set(Object.values(cases).flatMap((c) => run(c).errors.map((e) => e.kind)));
  for (const kind of raised) assert.ok(COMPOSE_ERROR_KINDS.includes(kind), kind);
});
