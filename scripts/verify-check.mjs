// verify:check — the verification proof bundle gate. Reads the per-stage proof
// entries at design-system/proof/<stage>.json, re-derives off disk every check
// recorded as `derived`, and fails when a stored result and a fresh run
// disagree. Zero dependencies.
//
// Failing:       orphan-token | state-incomplete | name-drift | proof-missing
//                | proof-stale | proof-contradicted | nothing-verified
//                | orphan-rule-inert
// Informational: archetype-unknown | proof-unadopted
// (archetype-unknown = a doc record whose archetype neither its own `archetype`
//  field nor its name resolves, so no baseline state set applies to it.
//  proof-unadopted = a manifest with no `verification` key at all: the system
//  has not opted into the bundle, so the proof-integrity checks are skipped and
//  the three derived rules still run.)
//
// Usage: node verify-check.mjs [--root <dir>] [--tokens <file>]... [--source <dir>]... [--skip <rule>]...
//        node verify-check.mjs --record --stage <name> [--subject <Name>] --entry <file.json>
//
// Design: docs/specs/2026-09-12-verification-proof-bundle.md
import { basename, dirname } from 'node:path';
import { normalizeName } from './lib/source-scan.mjs';
import { missingStates, resolveArchetype } from './lib/component-states.mjs';

// The fold validate-token-output.mjs calls `normalizeKey`: it collapses every
// adapter naming convention (color.bg.primary, --color-bg-primary, colorBgPrimary)
// onto one spelling. Re-declared here rather than imported because that script
// is not in this gate's install set, and importing it would drag it in.
export const normalizeText = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// A DTCG reference anywhere in a string value — `{color.bg.primary}` on its own,
// or embedded in an expression.
const REF_ANYWHERE = /\{([^{}]+)\}/g;
const REF_IN_STRING = /\{[^{}]+\}/;

// Every token path referenced by any token's `$value`. An object value's string
// members count too: a composite token (a shadow, a typography role) holds its
// references one level down.
export function aliasTargets(flat) {
  const out = new Set();
  const collect = (value) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(REF_ANYWHERE)) out.add(match[1]);
    } else if (value && typeof value === 'object') {
      for (const member of Object.values(value)) collect(member);
    }
  };
  for (const value of Object.values(flat)) collect(value);
  return out;
}

// A semantic token nothing names: no other token aliases it, no scanned source
// file mentions it, and no doc record lists it in `tokensUsed`.
//
// Only tokens whose own `$value` is an alias are candidates. In a two-tier
// system that is the semantic tier by construction, and the semantic tier is
// what code is meant to consume — a primitive is legitimately reached only
// through a semantic, so gating one would fail a correct system.
//
// LIMIT, stated rather than hidden: binding evidence is a permissive substring
// match over the normalized text, so `color.bg.primary` counts as bound by a
// mention of `color.bg.primary.hover`, and by prose that happens to contain the
// words. Every miss is a false negative — an orphan reported as bound — never a
// false failure, which is the direction a failing rule has to err in.
// `fileTexts` entries are pre-normalized by the caller.
export function checkOrphanTokens({ flat, fileTexts = [], records = new Map() }) {
  const targets = aliasTargets(flat);
  const recordTokens = new Set();
  for (const record of records.values()) {
    for (const token of record.tokensUsed ?? []) {
      if (typeof token === 'string') recordTokens.add(normalizeText(token));
    }
  }

  const failures = [];
  let candidates = 0;
  for (const [path, value] of Object.entries(flat)) {
    if (typeof value !== 'string' || !REF_IN_STRING.test(value)) continue;
    candidates += 1;
    const key = normalizeText(path);
    const bound =
      targets.has(path) ||
      fileTexts.some((text) => text.includes(key)) ||
      recordTokens.has(key);
    if (!bound) failures.push({ rule: 'orphan-token', token: path });
  }
  return { failures, inert: candidates === 0, candidates };
}

// Every doc record owes the unconditional baseline interaction states of its
// archetype. A record whose archetype neither resolves is reported
// informationally and asserted against nothing — a conservative resolver
// produces no false failures.
export function checkStates({ records = new Map() }) {
  const failures = [];
  const informational = [];
  for (const [name, record] of records) {
    if (resolveArchetype(record) === null) {
      informational.push({ rule: 'archetype-unknown', name });
      continue;
    }
    const missing = missingStates(record);
    if (missing.length > 0) failures.push({ rule: 'state-incomplete', name, missing });
  }
  return { failures, informational };
}

// One component, three spellings. The manifest name, the record's own `name`,
// and the code surface's path (`packages/ui/src/Button/Button.mdx` → `Button`
// twice) are the spellings a CLI can read; the Figma spelling is the executor's
// attested check. Folded with `normalizeName`, they must all agree.
export function checkNames({ built = [], meta = {}, records = new Map() }) {
  const failures = [];
  for (const name of built) {
    const spellings = { manifest: name };
    const record = records.get(name);
    if (record && typeof record.name === 'string') spellings.record = record.name;

    const file = meta[name]?.doc?.surfaces?.storybookMdx?.file;
    if (typeof file === 'string' && file !== '') {
      spellings.file = basename(file).replace(/\.[^.]+$/, '');
      // A surface recorded as a bare filename has no parent directory to
      // compare, and reading `.` as a spelling would fail every one of them.
      const parent = dirname(file);
      if (parent !== '.' && parent !== '' && parent !== '/') spellings.dir = basename(parent);
    }

    const folded = new Set(Object.values(spellings).map(normalizeName));
    if (folded.size > 1) failures.push({ rule: 'name-drift', name, spellings });
  }
  return failures;
}
