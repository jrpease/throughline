#!/usr/bin/env node
// Copy lint for component doc records (.doc.json). Warnings only — findings
// never affect the exit code; the lint shapes a draft before user approval
// rather than gating CI. Rules: references/doc-writing-standard.md (pinned in
// the design spec's lint table).
//
// Usage: node docs-lint.mjs <path/to/Component.doc.json> [--json]
// Output: one warning per line — `<file>: <block-path>: <rule>: <message>`;
// --json emits {"warnings":[{path, rule, message}]}.
// Exit: 0 for any parseable record; 2 for unusable invocation.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Machinery vocabulary banned from user-facing prose — the system's own
// build-compliance language. Real names of things (aria-label, role, Enter)
// are not banned; readers search for those.
const MACHINERY = [
  'token', 'tokens', 'variable', 'variables', 'binding', 'bindings',
  'fingerprint', 'fingerprints', 'provenance', 'projection', 'projections',
  'surface', 'surfaces',
];

// Visual-treatment words that must not LEAD a variant/state meaning.
const TREATMENT = [
  'fill', 'filled', 'solid', 'stroke', 'border', 'bordered', 'outline',
  'shadow', 'opacity', 'elevation',
];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for',
  'with', 'as', 'at', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'it',
  'its', 'this', 'that', 'these', 'those', 'you', 'your', 'not', 'no', 'do',
  'does', 'did', 'has', 'have', 'had', 'can', 'could', 'should', 'would',
  'will', 'may', 'might', 'must', 'when', 'how', 'what', 'which', 'who',
  'while', 'than', 'then', 'so', 'if', 'into', 'onto', 'from', 'over',
  'under', 'up', 'down', 'out', 'about',
]);

const words = (s) => String(s).toLowerCase().match(/[a-z0-9''-]+/g) || [];
// Naive plural/verb-s stemming: enough to match "Triggers" to "trigger".
const stem = (w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

export function lintRecord(record) {
  const warnings = [];
  const warn = (path, rule, message) => warnings.push({ path, rule, message });

  // Every user-facing prose field, as [block-path, text].
  const prose = [];
  if (typeof record.summary === 'string') prose.push(['summary', record.summary]);
  if (typeof record.description === 'string') prose.push(['description', record.description]);
  for (const key of ['whenToUse', 'whenNotToUse', 'dos', 'donts']) {
    (Array.isArray(record[key]) ? record[key] : []).forEach((t, i) => prose.push([`${key}[${i}]`, t]));
  }
  const meanings = [];
  for (const axis of Object.keys(record.variants || {})) {
    for (const [term, meaning] of Object.entries(record.variants[axis] || {})) {
      meanings.push([`variants.${axis}.${term}`, meaning]);
    }
  }
  for (const [term, meaning] of Object.entries(record.states || {})) {
    meanings.push([`states.${term}`, meaning]);
  }
  prose.push(...meanings);
  const a11y = record.accessibility || {};
  (Array.isArray(a11y.keyboard) ? a11y.keyboard : []).forEach((t, i) => prose.push([`accessibility.keyboard[${i}]`, t]));
  (Array.isArray(a11y.notes) ? a11y.notes : []).forEach((t, i) => prose.push([`accessibility.notes[${i}]`, t]));

  for (const [path, text] of prose) {
    const ws = words(text);
    const banned = MACHINERY.find((b) => ws.includes(b));
    if (banned) {
      warn(path, 'machinery-vocabulary',
        `"${banned}" is the system's machinery vocabulary — describe the thing and how to use it, never how it was made`);
    }
    for (const sentence of String(text).split(/[.!?]+/)) {
      const n = words(sentence).length;
      if (n > 35) warn(path, 'run-on-sentence', `sentence has ${n} words (max 35)`);
    }
  }

  if (typeof record.summary === 'string') {
    const n = words(record.summary).length;
    if (n > 12) warn('summary', 'summary-length', `${n} words (max 12)`);
  }

  if (typeof record.description === 'string') {
    const n = words(record.description).length;
    if (n < 15 || n > 70) warn('description', 'description-length', `${n} words (want 15–70)`);
  }

  if (typeof record.summary === 'string' && Array.isArray(record.whenToUse)
      && typeof record.whenToUse[0] === 'string') {
    const summaryStems = [...new Set(
      words(record.summary).filter((w) => !STOPWORDS.has(w)).map(stem),
    )];
    const targetStems = new Set(words(record.whenToUse[0]).map(stem));
    if (summaryStems.length > 0) {
      const matched = summaryStems.filter((s) => targetStems.has(s)).length;
      const pct = matched / summaryStems.length;
      if (pct > 0.6) {
        warn('whenToUse[0]', 'summary-echo',
          `${Math.round(pct * 100)}% of the summary's content words reappear — describe a situation, not the summary again`);
      }
    }
  }

  for (const key of ['dos', 'donts']) {
    (Array.isArray(record[key]) ? record[key] : []).forEach((entry, i) => {
      const path = `${key}[${i}]`;
      const n = words(entry).length;
      if (n > 14) warn(path, 'guidance-length', `${n} words (max 14)`);
      if (!/\.$/.test(String(entry).trim())) {
        warn(path, 'terminal-stop', 'end the entry with a full stop');
      }
      if (key === 'donts' && !/^(don['']?t|do not|never|avoid)\b/i.test(String(entry).trim())) {
        warn(path, 'dont-shape', "open with Don't / Never / Avoid and name the alternative");
      }
    });
  }

  for (const [path, meaning] of meanings) {
    const ws = words(meaning);
    if (ws.length < 3) {
      warn(path, 'empty-meaning', `${ws.length} word(s) — say what it means, not just that it exists`);
    }
    if (ws.slice(0, 4).some((w) => TREATMENT.includes(w))) {
      warn(path, 'treatment-lead', 'leads with visual treatment — lead with meaning; treatment is optional detail');
    }
  }

  return warnings;
}

const invokedAsCli = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsCli) {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: docs-lint.mjs <path/to/Component.doc.json> [--json]');
    process.exit(2);
  }
  let record;
  try {
    record = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`docs-lint: cannot read ${file}: ${e.message}`);
    process.exit(2);
  }
  const warnings = lintRecord(record);
  if (asJson) {
    console.log(JSON.stringify({ warnings }, null, 2));
  } else {
    for (const w of warnings) console.log(`${file}: ${w.path}: ${w.rule}: ${w.message}`);
  }
  process.exit(0);
}
