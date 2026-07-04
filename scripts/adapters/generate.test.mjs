import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSources } from './read-sources.mjs';
import { generate, diffTargets } from './generate.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_ROOT = join(REPO_ROOT, 'adapters');
const result = generate(readSources(REPO_ROOT));
const skillNames = readSources(REPO_ROOT).skills.map((s) => s.name);

test('committed adapters match a fresh generation (no drift)', () => {
  assert.deepEqual(diffTargets(OUT_ROOT, result), []);
});

test('no generated file leaks the CLAUDE_PLUGIN_ROOT variable', () => {
  for (const files of Object.values(result)) {
    for (const f of files) assert.doesNotMatch(f.content, /CLAUDE_PLUGIN_ROOT/, `${f.path} leaked the var`);
  }
});

test('no cursor/codex output leaves a named "`x` skill" idiom untranslated', () => {
  for (const target of ['cursor', 'codex']) {
    for (const f of result[target]) {
      for (const name of skillNames) {
        assert.ok(
          !f.content.includes(`\`${name}\` skill`),
          `${target}/${f.path} still says \`${name}\` skill`,
        );
      }
    }
  }
});

test('codex skill and command prompt names do not collide', () => {
  const promptPaths = result.codex.filter((f) => f.path.startsWith('prompts/')).map((f) => f.path);
  assert.equal(new Set(promptPaths).size, promptPaths.length);
});

test('token-sync-layer dispatch degrades to inline for codex', () => {
  const prompt = result.codex.find((f) => /token-sync-layer/.test(f.path));
  assert.ok(prompt, 'expected a codex token-sync-layer prompt');
  const norm = prompt.content.replace(/\s+/g, ' ');
  assert.match(norm, /no subagent dispatch, generate and verify each adapter inline/);
  assert.match(prompt.content, /\.throughline\/references\/agent-routing\.md/);
  assert.doesNotMatch(prompt.content, /CLAUDE_PLUGIN_ROOT/);
});

test('diffTargets flags an orphan file on disk', () => {
  // A result that expects NOTHING under a target whose real dir has files
  // → every real file becomes an orphan. Use the real OUT_ROOT read-only.
  const emptyResult = { cursor: [], codex: [], generic: [] };
  const problems = diffTargets(OUT_ROOT, emptyResult);
  assert.ok(problems.some((p) => p.startsWith('orphan:')), 'expected orphan problems for un-generated files');
});
