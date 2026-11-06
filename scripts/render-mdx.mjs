#!/usr/bin/env node
// Renders a component's Storybook MDX from its canonical doc record, byte for byte
// the same on every run, and prints the stamps for
// components.meta[<Name>].doc.surfaces.storybookMdx.
//
//   node scripts/render-mdx.mjs <record.doc.json> --out <dir>/<File>.mdx
//
// A component with a <File>.stories.* file beside the output gets
// `<Meta of={Stories} />`; one without (Select Menu Item) gets a titled Meta.
// Spec: docs/specs/2026-11-06-doc-projection-scripts.md (D4, D5).
//
// Zero dependencies.
import { readFileSync, writeFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFingerprint, fingerprint, validateRecord } from './lib/doc-record.mjs';

// Record prose is text, not JSX: MDX would read `<select>` as a tag and `{x}` as
// an expression, so those characters go out as entities.
const ENTITIES = { '<': '&lt;', '>': '&gt;', '{': '&#123;', '}': '&#125;' };
export const mdxText = (s) => String(s).replace(/[<>{}]/g, (c) => ENTITIES[c]);
const list = (items) => items.map((s) => `- ${s}`).join('\n');
const nonEmpty = (a) => Array.isArray(a) && a.length > 0;

// recordFile: the record's file name (for the generated-from line); stories: the
// stories module's base name ('Button.stories'), or null when there is none.
export function renderMdx(record, { recordFile, stories }) {
  const fp = canonicalFingerprint(record);
  const out = [];
  out.push(`{/* docFingerprint: ${fp} — generated from ${recordFile} by docs render. Do not edit by hand; change the record and re-render via /document-component. */}`);
  out.push('');
  out.push('import { Meta } from "@storybook/blocks";');
  if (stories) {
    out.push(`import * as Stories from "./${stories}";`);
    out.push('');
    out.push('<Meta of={Stories} />');
  } else {
    out.push('');
    out.push(`<Meta title="Components/${record.name}" />`);
  }
  out.push('');
  out.push(`# ${record.name}`);
  out.push('');
  out.push(`_${mdxText(record.summary)}_`);
  out.push('');
  out.push(mdxText(record.description));
  const section = (title, body) => { out.push('', `## ${title}`, '', body); };
  if (nonEmpty(record.whenToUse)) section('When to use', list(record.whenToUse.map(mdxText)));
  if (nonEmpty(record.whenNotToUse)) section('When not to use', list(record.whenNotToUse.map(mdxText)));
  if (nonEmpty(record.dos)) section('Do', list(record.dos.map(mdxText)));
  if (nonEmpty(record.donts)) section("Don't", list(record.donts.map(mdxText)));
  const variants = Object.entries(record.variants || {}).filter(([, opts]) => opts && Object.keys(opts).length);
  if (variants.length) {
    section('Variants', variants
      .map(([prop, opts]) => `### ${prop}\n\n${list(Object.entries(opts).map(([o, m]) => `\`${o}\` — ${mdxText(m)}`))}`)
      .join('\n\n'));
  }
  const states = Object.entries(record.states || {});
  if (states.length) section('States', list(states.map(([s, m]) => `\`${s}\` — ${mdxText(m)}`)));
  const a11y = record.accessibility || {};
  const a11yLines = [
    ...(a11y.role ? [`**Role:** \`${a11y.role}\``] : []),
    ...(a11y.keyboard || []).map((k) => `**Keyboard:** ${mdxText(k)}`),
    ...(a11y.notes || []).map(mdxText),
  ];
  if (a11yLines.length) section('Accessibility', list(a11yLines));
  if (nonEmpty(record.tokensUsed)) section('Tokens used', record.tokensUsed.map((t) => `\`${t}\``).join(' · '));
  return { text: `${out.join('\n')}\n`, src: fp };
}

export function storiesBeside(mdxPath) {
  const dir = dirname(mdxPath);
  const base = basename(mdxPath).replace(/\.mdx$/, '');
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((f) => f.startsWith(`${base}.stories.`));
  return hit ? `${base}.stories` : null;
}

function main(argv) {
  const positional = [];
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
    else positional.push(argv[i]);
  }
  if (positional.length !== 1 || !out || !out.endsWith('.mdx')) {
    console.error('usage: node scripts/render-mdx.mjs <record.doc.json> --out <dir>/<File>.mdx');
    process.exit(2);
  }
  const record = JSON.parse(readFileSync(positional[0], 'utf8'));
  const problems = validateRecord(record);
  if (problems.length) {
    console.error(`${positional[0]}: ${problems.join('; ')}`);
    process.exit(1);
  }
  const { text, src } = renderMdx(record, { recordFile: basename(positional[0]), stories: storiesBeside(out) });
  writeFileSync(out, text);
  console.log(JSON.stringify({ component: record.name, src, render: fingerprint(text), file: relative(realpathSync(process.cwd()), join(realpathSync(dirname(resolve(out))), basename(out))) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
