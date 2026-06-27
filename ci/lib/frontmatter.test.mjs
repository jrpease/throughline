import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from './frontmatter.mjs';

test('parses name and description into data, returns body', () => {
  const text = '---\nname: foo\ndescription: a thing\n---\n# Heading\nbody text\n';
  const { data, body } = parseFrontmatter(text);
  assert.equal(data.name, 'foo');
  assert.equal(data.description, 'a thing');
  assert.equal(body, '# Heading\nbody text\n');
});

test('strips wrapping double quotes from a value', () => {
  const { data } = parseFrontmatter('---\ndescription: "quoted value"\n---\n');
  assert.equal(data.description, 'quoted value');
});

test('strips wrapping single quotes from a value', () => {
  const { data } = parseFrontmatter("---\ndescription: 'quoted value'\n---\n");
  assert.equal(data.description, 'quoted value');
});

test('preserves colons inside a value (splits on first colon only)', () => {
  const { data } = parseFrontmatter('---\ndescription: IMPORTANT: do the thing\n---\n');
  assert.equal(data.description, 'IMPORTANT: do the thing');
});

test('leaves a value with interior quotes untouched (not fully wrapped)', () => {
  const { data } = parseFrontmatter('---\ndescription: "a" or "b"\n---\n');
  assert.equal(data.description, '"a" or "b"');
});

test('throws when the opening fence is missing', () => {
  assert.throws(() => parseFrontmatter('name: foo\n---\n'), /opening/);
});

test('throws when the closing fence is missing', () => {
  assert.throws(() => parseFrontmatter('---\nname: foo\n'), /closing/);
});
