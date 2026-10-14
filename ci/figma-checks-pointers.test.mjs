// Guards the drift #112's Phase 4¾ removes. The COMPONENT_SET, state and focus
// stop conditions live in one script, `references/figma-checks.md`. Every prose
// site that used to restate them must point at it instead, or a rule fixed in
// the script would stay wrong in the copy. Each site is sliced out of its file
// so a mention elsewhere in the file does not satisfy the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const POINTER = 'references/figma-checks.md';
const read = (path) => readFileSync(`${ROOT}${path}`, 'utf8');

// Text from `start` up to (not including) the next `end` after it, or to EOF.
export function slice(text, start, end) {
  const from = text.indexOf(start);
  assert.notEqual(from, -1, `anchor not found: ${start}`);
  if (end === undefined) return text.slice(from);
  const to = text.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `end anchor not found after ${start}: ${JSON.stringify(end)}`);
  return text.slice(from, to);
}

const SITES = [
  ['agents/figma-executor.md step 4', () => slice(read('agents/figma-executor.md'), '4. **Structural self-verify loop**', '\n5. ')],
  ['references/figma-scripting.md build-verify-then-replace', () => slice(read('references/figma-scripting.md'), '2. **Verify the working frame green', '\n3. **Only then finalize')],
  ['references/figma-component-standards.md item 8', () => slice(read('references/figma-component-standards.md'), '8. **States complete**', '\n9. ')],
  ['references/figma-component-standards.md item 9', () => slice(read('references/figma-component-standards.md'), '9. **Focus state matches the library idiom**', '\n10. ')],
  ['skills/component-builder/SKILL.md inline build', () => slice(read('skills/component-builder/SKILL.md'), 'When you build inline, with no', 'Checkpoint after each component')],
];

for (const [label, get] of SITES) {
  test(`${label} names ${POINTER}`, () => {
    assert.ok(get().includes(POINTER));
  });
}

test('the architect spec carries controlLayer for wrapped controls', () => {
  assert.ok(read('agents/architect.md').includes('controlLayer'));
});

test('the inline path names controlLayer itself', () => {
  const inline = slice(read('skills/component-builder/SKILL.md'), 'When you build inline, with no', 'Checkpoint after each component');
  assert.ok(inline.includes('controlLayer'));
});

test('the executor copies controlLayer from the spec', () => {
  assert.ok(slice(read('agents/figma-executor.md'), '4. **Structural self-verify loop**', '\n5. ').includes('controlLayer'));
});

test('the architect spec carries surfaces for the focus-contrast check', () => {
  assert.ok(read('agents/architect.md').includes('`surfaces`'));
});

test('the inline path names surfaces itself', () => {
  const inline = slice(read('skills/component-builder/SKILL.md'), 'When you build inline, with no', 'Checkpoint after each component');
  assert.ok(inline.includes('`surfaces`'));
});

test('the executor copies surfaces from the spec', () => {
  assert.ok(slice(read('agents/figma-executor.md'), '4. **Structural self-verify loop**', '\n5. ').includes('`surfaces`'));
});

test('check-figma runs both generated scripts, and the existing-set mode', () => {
  const command = read('commands/check-figma.md');
  assert.ok(command.includes('references/figma-adherence.md'));
  assert.ok(command.includes(POINTER));
  assert.ok(command.includes("MODE = 'existing'"));
});

test('compose-figma runs the generated compose script and gates with the screen gate', () => {
  const command = read('commands/compose-figma.md');
  assert.ok(command.includes('references/figma-compose.md'));
  assert.ok(command.includes('references/figma-adherence.md'));
  assert.ok(command.includes("MODE = 'finalize'"));
});

test('drift runs the generated drift script for variables and screens, and the sync stamps with it', () => {
  const command = read('commands/drift.md');
  assert.ok(command.includes('references/figma-drift.md'));
  assert.ok(command.includes('variables snippet') && command.includes('screens snippet'));
  assert.ok(read('commands/sync-figma-tokens.md').includes('references/figma-drift.md'));
  assert.ok(read('references/figma-drift.md').includes('## How to call it'));
});

test('the pointer target exists', () => {
  assert.ok(read(POINTER).includes('## How to call it'));
});
