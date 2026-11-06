#!/usr/bin/env node
// Renders a component's Figma description from its canonical doc record (the
// template in skills/component-builder/SKILL.md), prints the stamps for
// components.meta[<Name>].doc.surfaces.figmaDescription, and writes the
// figma_execute body that sets it.
//
//   node scripts/doc-description.mjs <record.doc.json> [--out payload.js]
//
// The hash is computed here, in Node: the plugin sandbox has no SHA-256. The
// payload instead returns `matches`, whether the stored description equals the
// text it was given, so a run proves the text arrived intact without a hash.
// Spec: docs/specs/2026-11-06-doc-projection-scripts.md (D1–D3).
//
// Zero dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFingerprint, fingerprint, validateRecord } from './lib/doc-record.mjs';

const block = (label, items) => (items.length ? [`**${label}**\n${items.map((s) => `- ${s}`).join('\n')}`] : []);
const arr = (a) => (Array.isArray(a) ? a : []);

export function renderDescription(record) {
  const fp = canonicalFingerprint(record);
  const a11y = record.accessibility || {};
  const parts = [
    record.summary,
    record.description,
    ...block('When to use', arr(record.whenToUse)),
    ...block('When not to use', arr(record.whenNotToUse)),
    ...block('Do', arr(record.dos)),
    ...block("Don't", arr(record.donts)),
    ...block('Accessibility', [...arr(a11y.keyboard), ...arr(a11y.notes)]),
    `<!-- tl:doc ${fp} -->`,
  ];
  return { text: parts.join('\n\n'), src: fp };
}

// Finds the one component set, or standalone component, with this exact name.
// Inlined into the payload with .toString(), so it must stay self-contained.
async function setDocDescription(name, text) {
  await figma.loadAllPagesAsync();
  const hits = figma.root.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })
    .filter((n) => n.name === name && !(n.type === 'COMPONENT' && n.parent && n.parent.type === 'COMPONENT_SET'));
  if (hits.length !== 1) {
    throw new Error('setDocDescription: ' + hits.length + ' components named "' + name + '", not exactly one'
      + (hits.length ? ' (' + hits.map((n) => n.id + ' on ' + (function page(x) { return x.type === 'PAGE' ? x.name : page(x.parent); })(n)).join(', ') + ')' : ''));
  }
  const node = hits[0];
  node.description = text;
  return { id: node.id, name: node.name, matches: node.description === text, length: node.description.length };
}

export function buildDescriptionPayload(record) {
  const problems = validateRecord(record);
  if (problems.length) throw new Error(problems.join('; '));
  const { text, src } = renderDescription(record);
  const code = [
    setDocDescription.toString(),
    `return await setDocDescription(${JSON.stringify(record.name)}, ${JSON.stringify(text)});`,
    '',
  ].join('\n');
  return { componentName: record.name, src, render: fingerprint(text), text, code };
}

function main(argv) {
  const positional = [];
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
    else positional.push(argv[i]);
  }
  if (positional.length !== 1) {
    console.error('usage: node scripts/doc-description.mjs <record.doc.json> [--out payload.js]');
    process.exit(2);
  }
  let result;
  try {
    result = buildDescriptionPayload(JSON.parse(readFileSync(positional[0], 'utf8')));
  } catch (e) {
    console.error(`${positional[0]}: ${e.message}`);
    process.exit(1);
  }
  if (out) writeFileSync(out, result.code);
  else process.stdout.write(`${result.code}\n`);
  const stamps = { componentName: result.componentName, src: result.src, render: result.render };
  (out ? console.log : console.error)(JSON.stringify(stamps));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
