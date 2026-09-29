// Guards the gap #135 was filed over. #107 taught the figma-executor agent to
// confirm it is writing to the right Figma file, but the skills that fall back
// to building inline had no such step, so a host with no subagents could still
// write into whichever file happened to be active.
//
// The rule: a skill or command that scripts Figma writes itself names the
// active-file preflight. "Scripts Figma writes itself" is read as "mentions
// figma_execute", plus the commands listed in ALSO_WRITES, which write to Figma
// through a reference without naming the tool. A new inline writer that does
// neither is invisible to this test; add it to ALSO_WRITES.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PREFLIGHT = 'active-file preflight';
const ALSO_WRITES = ['commands/document-component.md'];

const skillFiles = () =>
  readdirSync(`${ROOT}skills`)
    .map((name) => `skills/${name}/SKILL.md`)
    .filter((path) => existsSync(`${ROOT}${path}`));
const commandFiles = () =>
  readdirSync(`${ROOT}commands`)
    .filter((name) => name.endsWith('.md'))
    .map((name) => `commands/${name}`);

export function inlineFigmaWriters(paths, read, alsoWrites = ALSO_WRITES) {
  return paths.filter((path) => alsoWrites.includes(path) || read(path).includes('figma_execute'));
}

export function missingPreflight(paths, read) {
  return paths.filter((path) => !read(path).includes(PREFLIGHT));
}

const read = (path) => readFileSync(`${ROOT}${path}`, 'utf8');

test('the reference the skills point at still has the preflight', () => {
  assert.ok(read('references/figma-scripting.md').includes('Preflight: confirm the *active* file'));
});

test('missingPreflight flags a figma_execute writer that never names the preflight', () => {
  const files = {
    'a.md': 'uses figma_execute and runs the active-file preflight first',
    'b.md': 'uses figma_execute and nothing else',
    'c.md': 'only reads Figma',
    'd.md': 'writes the doc card without naming the tool',
  };
  const readFake = (path) => files[path];
  const writers = inlineFigmaWriters(Object.keys(files), readFake, ['d.md']);
  assert.deepEqual(writers, ['a.md', 'b.md', 'd.md']);
  assert.deepEqual(missingPreflight(writers, readFake), ['b.md', 'd.md']);
});

test('every skill and command that writes to Figma inline names the active-file preflight', () => {
  const writers = inlineFigmaWriters([...skillFiles(), ...commandFiles()], read);
  assert.ok(writers.length >= 5, `found only ${writers.length} Figma writers — the detection has stopped working`);
  assert.deepEqual(missingPreflight(writers, read), []);
});
