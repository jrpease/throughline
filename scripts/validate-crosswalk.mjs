// Crosswalk validator: resolved DTCG value == crosswalk newValue, for every row.
// The tokens:validate CI gate. Zero dependencies.
//
// Usage:
//   node validate-crosswalk.mjs --crosswalk crosswalk.json --tokens dtcg/tokens.json
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadCrosswalk, statusCounts } from './lib/crosswalk.mjs';
import { flattenDtcg, resolveValue } from './lib/dtcg.mjs';

// Re-exported so consumers (and the test file) keep one import surface.
export { flattenDtcg, resolveValue };

function norm(v) {
  return String(v).trim().toLowerCase();
}

export function validate(crosswalk, dtcg) {
  const flat = flattenDtcg(dtcg);
  const results = { total: crosswalk.tokens.length, passed: 0, mismatches: [], missing: [] };
  for (const row of crosswalk.tokens) {
    let resolved;
    try {
      resolved = resolveValue(row.newToken, flat);
    } catch {
      results.missing.push(row.newToken);
      continue;
    }
    if (norm(resolved) === norm(row.newValue)) {
      results.passed += 1;
    } else {
      results.mismatches.push({ token: row.newToken, expected: row.newValue, actual: resolved });
    }
  }
  return results;
}

function main() {
  const { values } = parseArgs({
    options: {
      crosswalk: { type: 'string' },
      tokens: { type: 'string' },
    },
  });
  if (!values.crosswalk || !values.tokens) {
    console.error('usage: validate-crosswalk.mjs --crosswalk <crosswalk.json> --tokens <dtcg/tokens.json>');
    process.exit(2);
  }
  const crosswalk = loadCrosswalk(values.crosswalk);
  const dtcg = JSON.parse(readFileSync(values.tokens, 'utf8'));
  const r = validate(crosswalk, dtcg);

  console.log(`tokens:validate — ${r.passed}/${r.total} resolved values match`);
  console.log('status counts:', JSON.stringify(statusCounts(crosswalk)));
  if (r.missing.length) {
    console.error(`\n${r.missing.length} token(s) missing from the DTCG source:`);
    for (const t of r.missing) console.error(`  - ${t}`);
  }
  if (r.mismatches.length) {
    console.error(`\n${r.mismatches.length} mismatch(es):`);
    for (const m of r.mismatches) console.error(`  - ${m.token}: crosswalk says ${m.expected}, source resolves to ${m.actual}`);
  }
  const ok = r.passed === r.total;
  if (!ok) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
