import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveArchetype, missingStates } from './component-states.mjs';

test('resolveArchetype: explicit archetype wins over name', () => {
  assert.equal(resolveArchetype({ archetype: 'input', name: 'Button' }), 'input');
});

test('resolveArchetype: falls back to a name synonym', () => {
  assert.equal(resolveArchetype({ name: 'Text Field' }), 'input');
});

test('resolveArchetype: unresolvable name returns null', () => {
  assert.equal(resolveArchetype({ name: 'IconButton' }), null);
});

test('resolveArchetype: unknown explicit archetype falls through to the name', () => {
  assert.equal(resolveArchetype({ archetype: 'nonsense', name: 'Button' }), 'button');
});

test('missingStates: Button missing active', () => {
  assert.deepEqual(
    missingStates({ name: 'Button', states: { hover: '', focus: '', disabled: '' } }),
    ['active'],
  );
});

test('missingStates: Button with all four states', () => {
  assert.deepEqual(
    missingStates({
      name: 'Button',
      states: { hover: '', focus: '', active: '', disabled: '' },
    }),
    [],
  );
});

test('missingStates: Card has an empty baseline', () => {
  assert.deepEqual(missingStates({ name: 'Card' }), []);
});

test('missingStates: Button with no states key returns the whole baseline', () => {
  assert.deepEqual(missingStates({ name: 'Button' }), ['hover', 'focus', 'active', 'disabled']);
});
