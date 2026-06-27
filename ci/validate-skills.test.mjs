import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSkill,
  validateCommand,
  validateManifestDoc,
  MAX_DESCRIPTION,
} from './validate-skills.mjs';

function skillSource({ name = 'demo', description = 'a demo skill' } = {}) {
  return `---\nname: ${name}\ndescription: ${description}\n---\n# Demo\n`;
}

test('a well-formed skill produces no problems', () => {
  const problems = validateSkill({ dirName: 'demo', source: skillSource() });
  assert.deepEqual(problems, []);
});

test('flags a name that does not match the directory', () => {
  const problems = validateSkill({ dirName: 'demo', source: skillSource({ name: 'other' }) });
  assert.ok(problems.some((p) => /must equal the directory name/.test(p)));
});

test('flags a missing description', () => {
  const src = '---\nname: demo\n---\n# Demo\n';
  const problems = validateSkill({ dirName: 'demo', source: src });
  assert.ok(problems.some((p) => /"description" is required/.test(p)));
});

test('flags an over-length description', () => {
  const long = 'x'.repeat(MAX_DESCRIPTION + 1);
  const problems = validateSkill({ dirName: 'demo', source: skillSource({ description: long }) });
  assert.ok(problems.some((p) => /max/.test(p)));
});

test('reports a parse error for missing frontmatter', () => {
  const problems = validateSkill({ dirName: 'demo', source: '# no frontmatter\n' });
  assert.equal(problems.length, 1);
  assert.ok(/opening/.test(problems[0]));
});

test('a well-formed command produces no problems', () => {
  const src = '---\ndescription: do a thing\n---\nbody\n';
  const problems = validateCommand({ fileName: 'demo.md', source: src });
  assert.deepEqual(problems, []);
});

test('flags a command missing a description', () => {
  const src = '---\nother: x\n---\nbody\n';
  const problems = validateCommand({ fileName: 'demo.md', source: src });
  assert.ok(problems.some((p) => /"description" is required/.test(p)));
});

test('manifest doc with a valid integer schemaVersion passes', () => {
  const src = 'text\n```json\n{ "schemaVersion": 4 }\n```\nmore\n';
  assert.deepEqual(validateManifestDoc(src), []);
});

test('flags a manifest doc whose example JSON does not parse', () => {
  const src = '```json\n{ not json }\n```\n';
  const problems = validateManifestDoc(src);
  assert.ok(problems.some((p) => /does not parse/.test(p)));
});

test('flags a manifest doc whose schemaVersion is not an integer', () => {
  const src = '```json\n{ "schemaVersion": "4" }\n```\n';
  const problems = validateManifestDoc(src);
  assert.ok(problems.some((p) => /must be an integer/.test(p)));
});
