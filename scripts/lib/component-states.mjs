// The archetype baseline for `state-incomplete` (`docs/specs/2026-09-12-verification-proof-bundle.md`,
// step 3). The prose in `references/figma-component-standards.md` (State handling) points at
// `references/state-baseline.md`, which is generated from this file.
//
// `default` is deliberately excluded from every baseline below: documenting the
// resting state is not documentation, and the Figma matrix requirement for it is
// the executor's, not this table's. Conditional states (`loading`, `error`,
// `success`) are deliberately excluded too — whether one applies to a given
// component is a design judgment, not something a baseline can assert. `selected`
// is not conditional for a choice control: a checkbox, radio, toggle, switch or
// chip that cannot be selected is not one.
//
// This table is the single source for both checks. `scripts/build-state-baseline.mjs`
// renders it into `references/state-baseline.md`, which the Figma executor reads;
// CI fails when that file is stale. MAINTENANCE: change this table, then run it.

import { normalizeName } from './source-scan.mjs';

export const ARCHETYPES = ['button', 'input', 'choice', 'card', 'modal', 'badge', 'other'];

export const BASELINE_STATES = {
  button: ['hover', 'focus', 'active', 'disabled'],
  input: ['hover', 'focus', 'disabled'],
  choice: ['hover', 'focus', 'active', 'selected', 'disabled'],
  card: [],
  modal: [],
  badge: [],
  other: [],
};

export const NAME_SYNONYMS = {
  button: 'button',
  input: 'input',
  textfield: 'input',
  textinput: 'input',
  checkbox: 'choice',
  radio: 'choice',
  toggle: 'choice',
  switch: 'choice',
  chip: 'choice',
  card: 'card',
  modal: 'modal',
  dialog: 'modal',
  badge: 'badge',
  tag: 'badge',
};

export function resolveArchetype(record) {
  if (ARCHETYPES.includes(record.archetype)) return record.archetype;
  const bySynonym = NAME_SYNONYMS[normalizeName(record.name)];
  return bySynonym ?? null;
}

export function missingStates(record) {
  const archetype = resolveArchetype(record);
  if (archetype === null) return [];
  const baseline = BASELINE_STATES[archetype];
  if (baseline.length === 0) return [];
  const recordedKeys = new Set(Object.keys(record.states ?? {}).map(normalizeName));
  return baseline.filter((state) => !recordedKeys.has(normalizeName(state)));
}
