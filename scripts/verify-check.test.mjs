import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText,
  aliasTargets,
  checkOrphanTokens,
  checkStates,
  checkNames,
} from './verify-check.mjs';

test('aliasTargets finds a reference in a plain string value and in an object value member', () => {
  const targets = aliasTargets({
    'color.bg.primary': '{color.blue.500}',
    'shadow.md': { color: '{color.shadow.default}', offsetY: '2px' },
    'color.blue.500': '#00aaff',
  });
  assert.ok(targets.has('color.blue.500'));
  assert.ok(targets.has('color.shadow.default'));
  assert.equal(targets.size, 2);
});

const SEMANTIC = { 'color.blue.500': '#00aaff', 'color.bg.primary': '{color.blue.500}' };

test('checkOrphanTokens: a semantic token nothing names is an orphan', () => {
  const { failures, inert } = checkOrphanTokens({ flat: SEMANTIC });
  assert.equal(inert, false);
  assert.deepEqual(failures, [{ rule: 'orphan-token', token: 'color.bg.primary' }]);
});

test('checkOrphanTokens: a token mentioned in a scanned file is bound', () => {
  const fileTexts = [normalizeText('.btn { background: var(--color-bg-primary); }')];
  const { failures } = checkOrphanTokens({ flat: SEMANTIC, fileTexts });
  assert.deepEqual(failures, []);
});

test('checkOrphanTokens: a token listed in a record\'s tokensUsed is bound', () => {
  const records = new Map([['Button', { name: 'Button', tokensUsed: ['color.bg.primary'] }]]);
  const { failures } = checkOrphanTokens({ flat: SEMANTIC, records });
  assert.deepEqual(failures, []);
});

test('checkOrphanTokens: a token another token references is bound', () => {
  const flat = { ...SEMANTIC, 'color.bg.hover': '{color.bg.primary}' };
  // color.bg.hover is itself a candidate, so bind it the other way — otherwise
  // this test would pass on its own orphan rather than on the alias edge.
  const fileTexts = [normalizeText('background: var(--color-bg-hover);')];
  const { failures } = checkOrphanTokens({ flat, fileTexts });
  assert.deepEqual(failures, []);
});

test('checkOrphanTokens: a primitive nothing names is not an orphan', () => {
  const fileTexts = [normalizeText('background: var(--color-bg-primary);')];
  const { failures, inert } = checkOrphanTokens({ flat: SEMANTIC, fileTexts });
  assert.equal(inert, false, 'the semantic token is still a candidate');
  assert.deepEqual(failures, [], 'color.blue.500 is a literal, so it is never a candidate');
});

test('checkOrphanTokens: a source with no aliases at all is inert', () => {
  const { failures, inert } = checkOrphanTokens({ flat: { 'color.blue.500': '#00aaff' } });
  assert.equal(inert, true);
  assert.deepEqual(failures, []);
});

test('checkStates: a Button record missing disabled fails, naming the state', () => {
  const records = new Map([
    ['Button', { name: 'Button', states: { hover: '…', focus: '…', active: '…' } }],
  ]);
  const { failures, informational } = checkStates({ records });
  assert.deepEqual(failures, [{ rule: 'state-incomplete', name: 'Button', missing: ['disabled'] }]);
  assert.deepEqual(informational, []);
});

test('checkStates: a complete Button passes', () => {
  const records = new Map([
    ['Button', { name: 'Button', states: { hover: '…', focus: '…', active: '…', disabled: '…' } }],
  ]);
  assert.deepEqual(checkStates({ records }).failures, []);
});

test('checkStates: a Card owes no states', () => {
  const records = new Map([['Card', { name: 'Card' }]]);
  const { failures, informational } = checkStates({ records });
  assert.deepEqual(failures, []);
  assert.deepEqual(informational, []);
});

test('checkStates: an unresolvable name is informational, not a failure', () => {
  const records = new Map([['IconButton', { name: 'IconButton' }]]);
  const { failures, informational } = checkStates({ records });
  assert.deepEqual(failures, []);
  assert.deepEqual(informational, [{ rule: 'archetype-unknown', name: 'IconButton' }]);
});

test('checkNames: a record named Buttons under manifest Button drifts', () => {
  const records = new Map([['Button', { name: 'Buttons' }]]);
  const failures = checkNames({ built: ['Button'], records });
  assert.equal(failures.length, 1);
  assert.equal(failures[0].rule, 'name-drift');
  assert.deepEqual(failures[0].spellings, { manifest: 'Button', record: 'Buttons' });
});

test('checkNames: an MDX surface at Btn/Btn.mdx under manifest Button drifts', () => {
  const meta = {
    Button: { doc: { surfaces: { storybookMdx: { file: 'packages/ui/src/Btn/Btn.mdx' } } } },
  };
  const failures = checkNames({ built: ['Button'], meta });
  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0].spellings, { manifest: 'Button', file: 'Btn', dir: 'Btn' });
});

test('checkNames: an MDX surface at Button/Button.mdx agrees', () => {
  const meta = {
    Button: { doc: { surfaces: { storybookMdx: { file: 'packages/ui/src/Button/Button.mdx' } } } },
  };
  assert.deepEqual(checkNames({ built: ['Button'], meta }), []);
});

test('checkNames: a component with no record and no surface has nothing to disagree with', () => {
  assert.deepEqual(checkNames({ built: ['Button'] }), []);
});
