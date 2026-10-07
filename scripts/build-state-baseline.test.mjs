import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { render, OUT } from './build-state-baseline.mjs';
import { BASELINE_STATES, NAME_SYNONYMS, ARCHETYPES } from './lib/component-states.mjs';

test('the committed table is what the generator renders', () => {
  assert.equal(readFileSync(OUT, 'utf8'), render());
});

test('--check passes on the committed file', () => {
  const r = spawnSync(process.execPath, ['scripts/build-state-baseline.mjs', '--check'], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
});

test('a changed baseline renders differently, so a stale file fails --check', () => {
  const changed = { ...BASELINE_STATES, choice: ['hover', 'focus'] };
  assert.notEqual(render(changed), readFileSync(OUT, 'utf8'));
});

test('the table lists every name that owes a state, including the Figma-side newcomers', () => {
  const out = render();
  for (const [name, archetype] of Object.entries(NAME_SYNONYMS)) {
    if (BASELINE_STATES[archetype].length > 0) assert.match(out, new RegExp(`\`${name}\``));
  }
  for (const name of ['switch', 'textfield', 'textinput']) assert.match(out, new RegExp(`\`${name}\``));
});

test('choice controls owe selected; every archetype has a baseline entry', () => {
  assert.ok(BASELINE_STATES.choice.includes('selected'));
  for (const a of ARCHETYPES) assert.ok(a in BASELINE_STATES);
});
