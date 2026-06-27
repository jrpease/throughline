import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlugin } from './validate-plugin.mjs';

const validPlugin = {
  name: 'throughline',
  description: 'a design system plugin',
  version: '0.9.0',
  author: { name: 'Jordan Pease' },
  keywords: ['figma', 'tokens'],
};

const validMarketplace = {
  name: 'throughline-marketplace',
  owner: { name: 'Jordan Pease' },
  plugins: [
    { name: 'throughline', source: './', description: 'build a design system' },
  ],
};

test('valid manifests produce no problems', () => {
  const problems = validatePlugin({ plugin: validPlugin, marketplace: validMarketplace });
  assert.deepEqual(problems, []);
});

test('flags a missing plugin name', () => {
  const problems = validatePlugin({ plugin: { ...validPlugin, name: '' }, marketplace: validMarketplace });
  assert.ok(problems.some((p) => /plugin\.json.*name/.test(p)));
});

test('flags an invalid semver version', () => {
  const problems = validatePlugin({ plugin: { ...validPlugin, version: 'v1' }, marketplace: validMarketplace });
  assert.ok(problems.some((p) => /version.*semver/.test(p)));
});

test('flags keywords that are not an array of strings', () => {
  const problems = validatePlugin({ plugin: { ...validPlugin, keywords: 'figma' }, marketplace: validMarketplace });
  assert.ok(problems.some((p) => /keywords/.test(p)));
});

test('flags an empty plugins array in the marketplace', () => {
  const problems = validatePlugin({ plugin: validPlugin, marketplace: { ...validMarketplace, plugins: [] } });
  assert.ok(problems.some((p) => /plugins.*non-empty array/.test(p)));
});

test('flags a marketplace plugin entry missing a source', () => {
  const bad = { ...validMarketplace, plugins: [{ name: 'throughline', description: 'x' }] };
  const problems = validatePlugin({ plugin: validPlugin, marketplace: bad });
  assert.ok(problems.some((p) => /plugins\[0\]\.source/.test(p)));
});

test('flags when no marketplace entry name matches plugin.json name', () => {
  const bad = { ...validMarketplace, plugins: [{ name: 'other', source: './', description: 'x' }] };
  const problems = validatePlugin({ plugin: validPlugin, marketplace: bad });
  assert.ok(problems.some((p) => /must match plugin\.json/.test(p)));
});
