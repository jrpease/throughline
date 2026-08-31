import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  flattenDtcg,
  flattenDtcgTypes,
  resolveValue,
  findModeCollisions,
  TEXT_UNIT_NAMES,
  TEXT_ROLE_UNIT,
  EXT_NS,
  textRoleGraph,
  mergeDtcg,
} from './dtcg.mjs';

// text.sm is a DUAL-NODE token: it carries its own $value AND a child.
const dtcg = {
  text: {
    sm: {
      $value: '14px',
      $type: 'dimension',
      lineHeight: { $value: '20px', $type: 'dimension' },
    },
  },
  color: {
    gray: { 900: { $value: '#111827', $type: 'color' } },
    text: { primary: { $value: '{color.gray.900}', $type: 'color' } },
  },
  typography: {
    body: { lineHeight: { $value: '{text.sm.lineHeight}', $type: 'dimension' } },
  },
};

test('flattenDtcg produces dot-path keys with raw $value', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(flat['color.gray.900'], '#111827');
  assert.equal(flat['color.text.primary'], '{color.gray.900}');
});

test('flattenDtcg yields a dual-node parent AND its child', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(flat['text.sm'], '14px');
  assert.equal(flat['text.sm.lineHeight'], '20px');
});

test('flattenDtcg skips $-prefixed meta keys', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(flat['text.sm.$type'], undefined);
  assert.equal(flat['text.sm.$value'], undefined);
});

test('resolveValue follows alias chains to a leaf', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(resolveValue('color.text.primary', flat), '#111827');
  assert.equal(resolveValue('color.gray.900', flat), '#111827');
});

test('resolveValue follows an alias into a dual-node child', () => {
  const flat = flattenDtcg(dtcg);
  assert.equal(resolveValue('typography.body.lineHeight', flat), '20px');
});

test('resolveValue throws on a missing token', () => {
  assert.throws(() => resolveValue('color.nope', {}), /not found/);
});

test('resolveValue throws on a circular reference', () => {
  assert.throws(() => resolveValue('a', { a: '{b}', b: '{a}' }), /circular/);
});

test('findModeCollisions reports a path defined differently across files', () => {
  const collisions = findModeCollisions([
    { file: 'light.json', dtcg: { color: { bg: { $value: '#ffffff' } } } },
    { file: 'dark.json', dtcg: { color: { bg: { $value: '#000000' } } } },
  ]);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].path, 'color.bg');
  assert.deepEqual(
    collisions[0].defs.map((d) => d.file),
    ['light.json', 'dark.json'],
  );
});

test('findModeCollisions ignores a path repeated with an identical value', () => {
  const collisions = findModeCollisions([
    { file: 'a.json', dtcg: { color: { bg: { $value: '#ffffff' } } } },
    { file: 'b.json', dtcg: { color: { bg: { $value: '#ffffff' } } } },
  ]);
  assert.deepEqual(collisions, []);
});

test('findModeCollisions returns empty for a single source', () => {
  const collisions = findModeCollisions([
    { file: 'only.json', dtcg: { color: { bg: { $value: '#ffffff' } } } },
  ]);
  assert.deepEqual(collisions, []);
});

test('findModeCollisions sees dual-node children', () => {
  const collisions = findModeCollisions([
    { file: 'a.json', dtcg: { text: { sm: { $value: '14px', lineHeight: { $value: '20px' } } } } },
    { file: 'b.json', dtcg: { text: { sm: { $value: '14px', lineHeight: { $value: '24px' } } } } },
  ]);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].path, 'text.sm.lineHeight');
});

test('flattenDtcgTypes reports a token own $type', () => {
  const types = flattenDtcgTypes(dtcg);
  assert.equal(types['text.sm'], 'dimension');
  assert.equal(types['color.gray.900'], 'color');
});

test('flattenDtcgTypes inherits from the nearest ancestor group', () => {
  const types = flattenDtcgTypes({
    leading: { $type: 'dimension', normal: { $value: '1.5' } },
  });
  assert.equal(types['leading.normal'], 'dimension');
});

// DTCG 6.1: a node carrying a $value is a token, not a group, so it is not an
// inheritance source. The same rule hoistDualNodes computes as `inherited`.
test('flattenDtcgTypes does not inherit from a $value-bearing node', () => {
  const types = flattenDtcgTypes({
    text: { sm: { $value: '14px', $type: 'dimension', lineHeight: { $value: '20px' } } },
  });
  assert.equal(types['text.sm'], 'dimension');
  assert.equal(types['text.sm.lineHeight'], undefined);
});

test('flattenDtcgTypes keeps an enclosing group type across a dual node', () => {
  const types = flattenDtcgTypes({
    text: { $type: 'dimension', sm: { $value: '14px', lineHeight: { $value: '20px' } } },
  });
  assert.equal(types['text.sm.lineHeight'], 'dimension');
});

test('flattenDtcgTypes lets an own $type beat an inherited one', () => {
  const types = flattenDtcgTypes({
    g: { $type: 'dimension', a: { $value: '400', $type: 'fontWeight' } },
  });
  assert.equal(types['g.a'], 'fontWeight');
});

test('flattenDtcgTypes returns undefined where nothing supplies a type', () => {
  const types = flattenDtcgTypes({ g: { a: { $value: '1.5' } } });
  assert.equal(types['g.a'], undefined);
});

test('the shared text-role constants live here, so textRoleGraph and sd-native cannot drift', () => {
  assert.deepEqual([...TEXT_UNIT_NAMES].sort(), ['fontSize', 'letterSpacing', 'lineHeight']);
  assert.equal(EXT_NS, 'com.radicool.throughline');
  for (const ok of ['16px', '1.5rem', '-0.03em', '.5px']) assert.ok(TEXT_ROLE_UNIT.test(ok), ok);
  for (const no of ['1.5', '16', '100%', '16dp', '']) assert.ok(!TEXT_ROLE_UNIT.test(no), no);
});

const graphFixture = () => ({
  text: {
    base: { $type: 'dimension', $value: '16px' },
    huge: { $type: 'dimension', $value: '96px' },
    stamped: { $type: 'dimension', $value: '72px', $extensions: { [EXT_NS]: { nativeUnit: 'text' } } },
    ratio: { $type: 'dimension', $value: '1.5' },
  },
  space: { md: { $type: 'dimension', $value: '8px' } },
  typography: {
    body: {
      fontSize: { $type: 'dimension', $value: '{text.base}' },
      lineHeight: { $type: 'dimension', $value: '{text.base}' },
    },
    gutter: { $type: 'dimension', $value: '{space.md}' },
  },
});

test('a referent whose referrers are all typographic is inferred typographic', () => {
  const g = textRoleGraph(graphFixture());
  assert.ok(g.typographic.has('text.base'));
  assert.ok(!g.typographic.has('space.md'), 'a gutter referrer states no typographic role');
  assert.deepEqual(g.ambiguous, []);
});

test('a referent with referrers on both sides is ambiguous, not inferred', () => {
  const dict = graphFixture();
  dict.space.pad = { $type: 'dimension', $value: '{text.base}' };
  const g = textRoleGraph(dict);
  assert.ok(!g.typographic.has('text.base'), 'counter-evidence declines the stamp');
  assert.equal(g.ambiguous.length, 1);
  assert.equal(g.ambiguous[0].path, 'text.base');
  assert.deepEqual(g.ambiguous[0].textLeaves.sort(), ['fontSize', 'lineHeight']);
  assert.deepEqual(g.ambiguous[0].otherLeaves, ['pad']);
});

test('an unreferenced sibling of an inferred token is advised, not inferred', () => {
  const g = textRoleGraph(graphFixture());
  const paths = g.unreferencedSiblings.map((u) => u.path);
  assert.ok(paths.includes('text.huge'), 'nothing references it, but its siblings are typographic');
  assert.ok(!paths.includes('text.stamped'), 'already closed by a source stamp');
  assert.ok(!paths.includes('text.ratio'), 'unitless — no size transform would claim it anyway');
  assert.ok(!paths.includes('space.md'), 'it has a referrer (typography.gutter), so it was never a candidate');
  assert.equal(g.unreferencedSiblings.find((u) => u.path === 'text.huge').group, 'text');
});

// #85. DTCG 5.2.2 lets a source declare $type once on the group. This walk gated
// on the token's own literal $type, so on such a source it named nothing — the
// advisory that exists to report a silent gap was itself silent on the one shape
// where the whole text-role pipeline goes quiet.
test('an unreferenced sibling is advised where the group supplies the $type', () => {
  const g = textRoleGraph({
    text: { $type: 'dimension', base: { $value: '16px' }, huge: { $value: '96px' } },
    typography: { body: { fontSize: { $type: 'dimension', $value: '{text.base}' } } },
  });
  assert.deepEqual(
    g.unreferencedSiblings.map((u) => u.path),
    ['text.huge'],
  );
});

test('a token own $type still beats the group $type in the sibling walk', () => {
  const g = textRoleGraph({
    text: { $type: 'dimension', base: { $value: '16px' }, huge: { $value: '96px', $type: 'string' } },
    typography: { body: { fontSize: { $type: 'dimension', $value: '{text.base}' } } },
  });
  assert.deepEqual(g.unreferencedSiblings, [], 'huge is a string, whatever its group says');
});

test('an edge to a path that does not exist is collected, not thrown on', () => {
  const g = textRoleGraph({
    typography: { body: { fontSize: { $type: 'dimension', $value: '{nope.missing}' } } },
  });
  assert.ok(g.typographic.has('nope.missing'), 'the graph reports the edge; the applier skips it');
  assert.deepEqual(g.unreferencedSiblings, []);
});

test('a chain through a role-less intermediate is declined at the second hop', () => {
  const g = textRoleGraph({
    text: { base: { $type: 'dimension', $value: '16px' } },
    alias: { x: { $type: 'dimension', $value: '{text.base}' } },
    typography: { body: { fontSize: { $type: 'dimension', $value: '{alias.x}' } } },
  });
  assert.ok(g.typographic.has('alias.x'));
  assert.ok(!g.typographic.has('text.base'), 'the intermediate leaf name states no role');
});

test('a dual node is reached at its own path, before any hoist', () => {
  const g = textRoleGraph({
    text: { sm: { $type: 'dimension', $value: '14px', lineHeight: { $type: 'dimension', $value: '20px' } } },
    typography: { body: { fontSize: { $type: 'dimension', $value: '{text.sm}' } } },
  });
  assert.ok(g.typographic.has('text.sm'));
});

test('mergeDtcg lets a later source win and leaves its inputs alone', () => {
  const a = { typography: { body: { fontSize: { $value: '{text.sm}' } } }, keep: { x: { $value: '1px' } } };
  const b = { typography: { body: { fontSize: { $value: '{text.lg}' } } } };
  const merged = mergeDtcg([a, b]);
  assert.equal(merged.typography.body.fontSize.$value, '{text.lg}');
  assert.equal(merged.keep.x.$value, '1px');
  assert.equal(a.typography.body.fontSize.$value, '{text.sm}', 'inputs must not be mutated');
});

test('a merge can remove a referrer a union would have kept', () => {
  const desktop = { typography: { body: { fontSize: { $type: 'dimension', $value: '{text.lg}' } } } };
  const mobile = { typography: { body: { fontSize: { $type: 'dimension', $value: '{text.sm}' } } } };
  const base = { text: { lg: { $type: 'dimension', $value: '18px' }, sm: { $type: 'dimension', $value: '14px' } } };
  const g = textRoleGraph(mergeDtcg([base, desktop, mobile]));
  assert.ok(g.typographic.has('text.sm'));
  assert.ok(!g.typographic.has('text.lg'), 'the mobile file overwrote the only referrer to text.lg');
});
