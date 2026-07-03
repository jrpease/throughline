import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeAgentsBlock, mergeMcpJson } from './install.mjs';

const START = '<!-- throughline:start -->';
const END = '<!-- throughline:end -->';
const BLOCK = '# ThroughLine\n\nindex here';

test('mergeAgentsBlock creates a wrapped block when no file exists', () => {
  const out = mergeAgentsBlock(undefined, BLOCK);
  assert.ok(out.includes(START) && out.includes(END), 'has delimiters');
  assert.ok(out.includes('index here'), 'has block content');
});

test('mergeAgentsBlock appends after existing non-delimited content', () => {
  const out = mergeAgentsBlock('# My project\n\nnotes', BLOCK);
  assert.ok(out.startsWith('# My project'), 'keeps existing content first');
  assert.ok(out.indexOf('My project') < out.indexOf(START), 'block comes after');
});

test('mergeAgentsBlock replaces an existing block in place', () => {
  const first = mergeAgentsBlock('# My project\n', BLOCK);
  const out = mergeAgentsBlock(first, '# ThroughLine\n\nNEW index');
  assert.ok(out.includes('NEW index'), 'has new content');
  assert.ok(!out.includes('index here'), 'old content gone');
  assert.equal(out.match(new RegExp(START, 'g')).length, 1, 'exactly one block');
});

test('mergeAgentsBlock is idempotent', () => {
  const once = mergeAgentsBlock('# My project\n', BLOCK);
  const twice = mergeAgentsBlock(once, BLOCK);
  assert.equal(twice, once);
});

test('mergeMcpJson preserves user servers and adds ours', () => {
  const existing = JSON.stringify({ mcpServers: { other: { command: 'x' } } });
  const parsed = JSON.parse(mergeMcpJson(existing, { 'figma-console': { command: 'figma' } }));
  assert.ok(parsed.mcpServers.other, 'kept user server');
  assert.ok(parsed.mcpServers['figma-console'], 'added ours');
});

test('mergeMcpJson writes ours when no file exists', () => {
  const parsed = JSON.parse(mergeMcpJson(undefined, { 'figma-console': { command: 'figma' } }));
  assert.deepEqual(parsed.mcpServers, { 'figma-console': { command: 'figma' } });
});

test('mergeMcpJson is idempotent', () => {
  const ours = { 'figma-console': { command: 'figma' } };
  const once = mergeMcpJson(undefined, ours);
  assert.equal(mergeMcpJson(once, ours), once);
});
