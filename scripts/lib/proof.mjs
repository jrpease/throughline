// The proof-bundle store (`docs/specs/2026-09-12-verification-proof-bundle.md`,
// step 4): load, merge and fingerprint the per-stage files at
// `design-system/proof/<stage>.json`, and read the manifest's adoption state
// for each stage. Zero dependencies.
//
// See `references/proof-bundle.md` for the file shape and the vocabulary this
// module defines.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stableStringify, fingerprint } from './doc-record.mjs';

export const PROOF_DIR = 'design-system/proof';

// The stage vocabulary. A change here must also update the stage table in
// `references/proof-bundle.md`: the constant and the prose are one vocabulary,
// and a stage this list accepts but the reference does not name is a stage
// nobody knows how to record.
//
// `token-builder` is system-wide. The vocabulary names the places where the
// negative conditions' evidence is produced, and token creation is now one of
// them — it is the cheapest place in the system to catch a mode built with poor
// contrast, because the mode is being defined right then and nothing is built
// on it yet. Its subject is the whole colour system, never a component.
export const STAGES = [
  'component-builder',
  'storybook-chromatic-builder',
  'token-sync-layer',
  'token-builder',
];

// Which stages are keyed by component (subject = component name) rather than
// by the system as a whole (subject = "system"). This is the machine-readable
// copy of the split `references/proof-bundle.md` documents in prose — it is
// the constant `checkProof` asks "is this stage keyed by component?".
export const PER_COMPONENT_STAGES = new Set([
  'component-builder',
  'storybook-chromatic-builder',
]);

// Tells the reader (Step 6's `checkProof`) how to compare a recorded derived
// check against a rerun: a check scoped to "component" is compared per
// subject; one scoped to "system" is compared once, system-wide, regardless
// of which subject it was recorded under.
export const DERIVED_RULE_SCOPE = {
  'orphan-token': 'system',
  'state-incomplete': 'component',
  'name-drift': 'component',
  // Contrast is a property of the token system as a whole, not of any one
  // component, so a recorded result is compared against the rerun system-wide —
  // the same scope orphan-token has.
  'color-contrast': 'system',
};

// The names this stage has not yet proven, per the Adoption decision's
// capture-once-then-shrink rule. A missing `exempt` key is deliberately read
// as "exempts nothing", not "exempts everything": the only way to reach a
// stage entry with no `exempt` key is a hand-edited manifest (record mode
// always writes one for a per-component stage), and the off-switch reading
// would let a hand-edit silently stop the gate. A missing key must get
// louder, not quieter.
export function stageExempt(manifest, stage) {
  return new Set(manifest.verification?.stages?.[stage]?.exempt ?? []);
}

// The human-readable "when did this system opt in", written once by record
// mode and never rewritten. No gate reads it.
//
// It is not compared against `components.meta[name].updatedAt`, and `exempt`
// is a captured list of names rather than a date comparison, for the same
// reason: `updatedAt` has a second writer.
// `storybook-chromatic-builder` refreshes it on promotion
// (`skills/storybook-chromatic-builder/SKILL.md:276-277`), a different stage
// from the one that owes the entry, so a date gate would fail a pre-existing
// component the first time an unrelated storying run promotes it.
//
// Neither `adoptedAt` nor `exempt` is derived from the stage file's entries,
// either: `mergeEntry` is latest-wins and replaces a subject's `at`, so "the
// earliest `at` in the file" would slide forward every time the earliest
// subject is rebuilt.
export function stageAdoptedAt(manifest, stage) {
  return manifest.verification?.stages?.[stage]?.adoptedAt ?? null;
}

export function stagePath(root, stage) {
  return join(root, PROOF_DIR, `${stage}.json`);
}

export function loadStage(root, stage) {
  const path = stagePath(root, stage);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function stageFingerprint(stageFile) {
  return fingerprint(stableStringify(stageFile));
}

const CHECK_METHODS = ['derived', 'attested'];
const CHECK_RESULTS = ['pass', 'fail'];

export function entryProblems(entry) {
  const problems = [];
  if (typeof entry.at !== 'string' || entry.at === '') {
    problems.push('"at" must be a non-empty string');
  }
  if (typeof entry.advancedBecause !== 'string' || entry.advancedBecause === '') {
    problems.push('"advancedBecause" must be a non-empty string');
  }
  if (!Array.isArray(entry.changed) || !entry.changed.every((c) => typeof c === 'string')) {
    problems.push('"changed" must be an array of strings');
  }
  if (!Array.isArray(entry.checks) || entry.checks.length === 0) {
    problems.push('"checks" must be a non-empty array');
  } else {
    entry.checks.forEach((check, i) => {
      if (!check || typeof check !== 'object') {
        problems.push(`checks[${i}] must be an object`);
        return;
      }
      if (typeof check.name !== 'string' || check.name === '') {
        problems.push(`checks[${i}].name must be a non-empty string`);
      }
      if (!CHECK_METHODS.includes(check.method)) {
        problems.push(`checks[${i}].method must be one of ${CHECK_METHODS.join(', ')}`);
      }
      if (!CHECK_RESULTS.includes(check.result)) {
        problems.push(`checks[${i}].result must be one of ${CHECK_RESULTS.join(', ')}`);
      }
      if (typeof check.evidence !== 'string') {
        problems.push(`checks[${i}].evidence must be a string`);
      }
      // Optional, and only `contrast-baseline` uses it today — but validated
      // because it is load-bearing: token-sync-layer subtracts these (fg, bg,
      // mode) triples from its own gate run's color-contrast failures, so a
      // malformed one is the difference between a pair the user accepted and a
      // pair nobody has seen. Reject it here rather than letting the sync
      // silently match nothing.
      if (check.accepted !== undefined) {
        if (!Array.isArray(check.accepted)) {
          problems.push(`checks[${i}].accepted must be an array when present`);
        } else {
          check.accepted.forEach((pair, j) => {
            const wellFormed =
              pair &&
              typeof pair === 'object' &&
              ['fg', 'bg', 'mode'].every((k) => typeof pair[k] === 'string' && pair[k] !== '');
            if (!wellFormed) {
              problems.push(
                `checks[${i}].accepted[${j}] must carry non-empty "fg", "bg" and "mode" strings`,
              );
            }
          });
        }
      }
    });
  }
  if (entry.screenshot !== undefined && typeof entry.screenshot !== 'string') {
    problems.push('"screenshot" must be a string when present');
  }
  return problems;
}

export function mergeEntry(stageFile, stage, subject, entry) {
  const subjects = { ...(stageFile?.subjects ?? {}), [subject]: entry };
  const sortedSubjects = {};
  for (const key of Object.keys(subjects).sort()) {
    sortedSubjects[key] = subjects[key];
  }
  return { stage, subjects: sortedSubjects };
}

export function recordedChecks(stageFile) {
  const out = [];
  for (const [subject, entry] of Object.entries(stageFile.subjects ?? {})) {
    for (const check of entry.checks ?? []) {
      out.push({
        subject,
        name: check.name,
        method: check.method,
        result: check.result,
        evidence: check.evidence,
      });
    }
  }
  return out;
}
