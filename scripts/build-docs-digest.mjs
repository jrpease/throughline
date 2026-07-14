// docs:digest — aggregates every component doc record into two AI-facing
// artifacts: index.json (machine map) and llms.txt (narrative index).
// Zero dependencies.
//
// Usage: node build-docs-digest.mjs [--root <dir>]
import { readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadRecord } from './lib/doc-record.mjs';

const DOCS_DIR = join('design-system', 'docs');
const COMPONENTS_DIR = join(DOCS_DIR, 'components');

export function buildIndex(records) {
  return {
    generatedFrom: 'design-system/docs/components/*.doc.json',
    components: records.map((r) => ({
      name: r.name,
      summary: r.summary ?? '',
      whenToUse: r.whenToUse ?? [],
      whenNotToUse: r.whenNotToUse ?? [],
      variants: r.variants ?? {},
      states: r.states ?? {},
      dos: r.dos ?? [],
      donts: r.donts ?? [],
      accessibility: r.accessibility ?? {},
      tokensUsed: r.tokensUsed ?? [],
      status: r.status ?? 'draft',
    })),
  };
}

export function buildLlmsTxt(records) {
  const lines = ['# Design system — component usage guide', ''];
  lines.push('Generated documentation for AI and human consumers. One section per component.', '');
  for (const r of records) {
    lines.push(`## ${r.name}`, '');
    if (r.summary) lines.push(r.summary, '');
    if (r.description) lines.push(r.description, '');
    if ((r.whenToUse ?? []).length) lines.push('**When to use:** ' + r.whenToUse.join('; '));
    if ((r.whenNotToUse ?? []).length) lines.push('**When not to use:** ' + r.whenNotToUse.join('; '));
    if ((r.dos ?? []).length) lines.push('**Do:** ' + r.dos.join('; '));
    if ((r.donts ?? []).length) lines.push("**Don't:** " + r.donts.join('; '));
    if ((r.tokensUsed ?? []).length) lines.push('**Tokens:** ' + r.tokensUsed.join(', '));
    lines.push('');
  }
  return lines.join('\n');
}

export function loadAllRecords(root) {
  const dir = join(root, COMPONENTS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.doc.json'))
    .sort()
    .map((f) => loadRecord(join(dir, f)));
}

function main() {
  const { values } = parseArgs({ options: { root: { type: 'string', default: '.' } } });
  const root = values.root;
  const records = loadAllRecords(root);
  const outDir = join(root, DOCS_DIR);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(buildIndex(records), null, 2) + '\n');
  writeFileSync(join(outDir, 'llms.txt'), buildLlmsTxt(records));
  console.log(`✓ docs:digest — ${records.length} component(s) → design-system/docs/{index.json,llms.txt}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
