// verify:check — the verification proof bundle gate. Reads the per-stage proof
// entries at design-system/proof/<stage>.json, re-derives off disk every check
// recorded as `derived`, and fails when a stored result and a fresh run
// disagree. Zero dependencies.
//
// Failing:       orphan-token | state-incomplete | name-drift | color-contrast
//                | proof-missing | proof-stale | proof-contradicted
//                | nothing-verified | orphan-rule-inert | contrast-rule-inert
// Informational: archetype-unknown | proof-unadopted
// (archetype-unknown = a doc record whose archetype neither its own `archetype`
//  field nor its name resolves, so no baseline state set applies to it.
//  proof-unadopted = a manifest with no `verification` key at all: the system
//  has not opted into the bundle, so the proof-integrity checks are skipped and
//  the four derived rules still run.)
//
// Usage: node verify-check.mjs [--root <dir>] [--tokens <file>]... [--source <dir>]... [--skip <rule>]...
//        node verify-check.mjs --record --stage <name> [--subject <Name>] --entry <file.json>
//
// Design: docs/specs/2026-09-12-verification-proof-bundle.md
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadRecord } from './lib/doc-record.mjs';
import { flattenDtcg } from './lib/dtcg.mjs';
import { walk, normalizeName } from './lib/source-scan.mjs';
import { missingStates, resolveArchetype } from './lib/component-states.mjs';
import { AA_NORMAL_TEXT, CONTRAST_PAIRS, contrastRatio, parseHex, composite } from './lib/contrast.mjs';
import { tokenPackageDirs, normalizeHex, rgbToHex, resolvedTokens } from './validate-adherence.mjs';
import {
  DERIVED_RULE_SCOPE,
  PER_COMPONENT_STAGES,
  PROOF_DIR,
  STAGES,
  entryProblems,
  loadStage,
  mergeEntry,
  recordedChecks,
  stageExempt,
  stageFingerprint,
  stagePath,
} from './lib/proof.mjs';

// The manifest version this gate's `verification` pointer ships in.
const SCHEMA_VERSION = 7;

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

// A pair is evaluated once per mode, and has to clear in every mode it is
// evaluated in — a system that passes in Light and fails in Dark fails, full
// stop, because the failure list carries the mode and nothing averages across
// them. A pair whose roles are absent from a mode abstains rather than
// passing: that mode contributes nothing for that pair, which is why
// `contrast-rule-inert` exists — a rule that recognised no role anywhere must
// not read as a clean run.
//
// Alpha: a translucent foreground has one correct answer over a known
// background, so it is composited and compared. A translucent background does
// not — what is behind it is a layout fact the token tier does not hold — so
// that pair is skipped and counted rather than guessed at.
//
// The returned `modes` is the number of modes in which at least one pair was
// actually compared, which is NOT the number of modes passed in: a primitives
// file is a mode that holds no semantic role and contributes nothing. It is the
// number the report's `contrast:` line carries, because "compared across N
// modes" is the reading that catches a multi-mode system registered with one
// mode file.
export function checkContrast({ modes }) {
  const failures = [];
  const skipped = { unresolvable: 0, nonHex: 0, alphaBackground: 0 };
  let pairs = 0;
  let modesCompared = 0;

  for (const { mode, values, unresolved } of modes) {
    let comparedHere = 0;
    const resolved = new Map();
    for (const [path, value] of values) resolved.set(normalizeText(path), value);
    const unresolvedFolded = new Set([...unresolved].map(normalizeText));

    for (const pair of CONTRAST_PAIRS) {
      const fgKey = normalizeText(pair.fg);
      const bgKey = normalizeText(pair.bg);
      const fgDefined = resolved.has(fgKey) || unresolvedFolded.has(fgKey);
      const bgDefined = resolved.has(bgKey) || unresolvedFolded.has(bgKey);
      // A side absent from both this mode's resolved values and its unresolved
      // set means the mode does not define it at all — not evaluated, not
      // counted anywhere.
      if (!fgDefined || !bgDefined) continue;

      if (unresolvedFolded.has(fgKey) || unresolvedFolded.has(bgKey)) {
        skipped.unresolvable += 1;
        continue;
      }

      const fgValue = resolved.get(fgKey);
      const bgValue = resolved.get(bgKey);
      const fgHex = normalizeHex(fgValue) ?? rgbToHex(fgValue);
      const bgHex = normalizeHex(bgValue) ?? rgbToHex(bgValue);
      if (!fgHex || !bgHex) {
        skipped.nonHex += 1;
        continue;
      }

      const bgParsed = parseHex(bgHex);
      if (bgParsed.a < 1) {
        skipped.alphaBackground += 1;
        continue;
      }

      const fgParsed = parseHex(fgHex);
      const fgComposited = fgParsed.a < 1 ? composite(fgHex, bgHex) : fgHex;

      const ratio = contrastRatio(fgComposited, bgHex);
      pairs += 1;
      comparedHere += 1;
      if (ratio < pair.threshold) {
        failures.push({
          rule: 'color-contrast',
          mode,
          fg: pair.fg,
          bg: pair.bg,
          fgValue,
          bgValue,
          ratio,
          threshold: pair.threshold,
        });
      }
    }
    if (comparedHere > 0) modesCompared += 1;
  }

  return { failures, skipped, pairs, modes: modesCompared };
}

// Does this stage owe this component an entry yet?
//
// The manifest states the lifecycle outright (references/manifest-schema.md):
// a component is created at `draft` by `component-builder` and promoted to
// `stable` by `storybook-chromatic-builder` once its code and stories are built
// and approved. A `draft` component is one that has not reached the storying
// stage — the normal state between the two skills — and flagging it would fail
// every component built in Figma and not yet storied.
export function stageOwes(stage, name, meta = {}) {
  if (stage === 'component-builder') return true;
  if (stage === 'storybook-chromatic-builder') return meta[name]?.status === 'stable';
  return false;
}

// The proof-integrity layer: is the store there, does it match its fingerprint,
// does every component the stage owes an entry have one, and does every result
// recorded as `derived` still agree with this run?
export function checkProof({ manifest, root, derived = [], built = [], meta = {}, skipped = new Set() }) {
  const failures = [];
  const informational = [];

  // A system that never adopted the bundle is not a system that stopped
  // proving things: report it and skip the integrity checks entirely. The
  // four derived rules still run — they do not depend on the store.
  if (!manifest.verification) {
    informational.push({ rule: 'proof-unadopted' });
    return { failures, informational, stagesRead: 0 };
  }

  let stagesRead = 0;
  for (const [stage, pointer] of Object.entries(manifest.verification.stages ?? {})) {
    const stageFile = loadStage(root, stage);
    // This class owns "the file is gone"; proof-stale is about a file that
    // exists and disagrees with its hash, so the two never fire together here.
    if (stageFile === null) {
      failures.push({ rule: 'proof-missing', stage });
      continue;
    }
    stagesRead += 1;
    if (stageFingerprint(stageFile) !== pointer.fingerprint) {
      failures.push({ rule: 'proof-stale', stage });
    }

    if (PER_COMPONENT_STAGES.has(stage)) {
      const exempt = stageExempt(manifest, stage);
      for (const name of built) {
        if (stageFile.subjects?.[name]) continue;
        // Two independent gates, each ruling out a different false failure:
        // the stage must owe it an entry by lifecycle, and it must not be
        // grandfathered. Do NOT compare meta[name].updatedAt against
        // adoptedAt, however natural it looks: `updatedAt` is refreshed by
        // storybook-chromatic-builder on promotion, so a single storying run
        // drags every pre-existing component past component-builder's
        // adoption moment and the gate fails a system where nothing went
        // wrong. The stated false negative is that a grandfathered component
        // is never proven.
        if (!stageOwes(stage, name, meta)) continue;
        if (exempt.has(name)) continue;
        failures.push({ rule: 'proof-missing', stage, name });
      }
    }

    for (const check of recordedChecks(stageFile)) {
      if (check.method !== 'derived') continue;
      const scope = DERIVED_RULE_SCOPE[check.name];
      // A rule this run did not compute cannot contradict anything, and
      // pretending otherwise would fail a repo for using --skip.
      if (!scope || skipped.has(check.name)) continue;
      const ruleFailures = derived.filter((f) => f.rule === check.name);
      const rerunFailed =
        scope === 'component'
          ? ruleFailures.some((f) => f.name === check.subject)
          : ruleFailures.length > 0;
      if (rerunFailed !== (check.result === 'fail')) {
        failures.push({
          rule: 'proof-contradicted',
          stage,
          subject: check.subject,
          check: check.name,
          recorded: check.result,
          rerun: rerunFailed ? 'fail' : 'pass',
        });
      }
    }
  }

  return { failures, informational, stagesRead };
}

function failureDetail(f) {
  switch (f.rule) {
    case 'orphan-token':
      return `${f.token} — an alias no other token references, no scanned file mentions and no doc record lists in tokensUsed. Bind it, delete it, or --skip orphan-token if this repo's consumers are outside --source.`;
    case 'state-incomplete':
      return `${f.name} documents no ${f.missing.join(', ')} state — its archetype's baseline requires ${f.missing.length === 1 ? 'it' : 'them'}. Add ${f.missing.length === 1 ? 'it' : 'them'} to the record's "states" with /document-component.`;
    case 'name-drift':
      return `${f.name} is spelled ${Object.entries(f.spellings).map(([k, v]) => `${v} (${k})`).join(', ')} — one component, more than one name. Rename so the manifest, the record and the code surface agree.`;
    case 'proof-missing':
      return f.name
        ? `${f.stage} owes ${f.name} an entry and has none — record one with verify-check.mjs --record --stage ${f.stage} --subject ${f.name}.`
        : `${f.stage} is listed in design-system.json verification.stages, but ${PROOF_DIR}/${f.stage}.json is gone. Restore it, or re-record the stage's entries.`;
    case 'proof-stale':
      return `${PROOF_DIR}/${f.stage}.json does not match the fingerprint in design-system.json — it was edited outside the recorder. Re-record the stage's entries rather than editing the file.`;
    case 'proof-contradicted':
      return `${f.stage} recorded ${f.check} as "${f.recorded}" for ${f.subject}, but this run derives "${f.rerun}". A derived result is a cache, not a claim — fix what it found, or re-record it.`;
    case 'color-contrast':
      return `${f.fg} on ${f.bg} is ${f.ratio.toFixed(2)}:1 in ${f.mode} (${f.fgValue} on ${f.bgValue}) — WCAG AA needs ${f.threshold}:1 for normal text. Re-point one side of the pair at a primitive with more separation in that mode; the pair has to clear in every mode, not on average.`;
    case 'nothing-verified':
      return 'the enabled rules examined nothing: no alias token candidate, no doc record, no component in components.built, no colour pair compared. Check --root points at the design system, and that --tokens names a real token source.';
    case 'orphan-rule-inert':
      return 'no token source yielded an alias, so orphan-token checked nothing. Pass the --tokens file that holds the semantic tier, or --skip orphan-token if this system has none.';
    case 'contrast-rule-inert':
      return 'no token source held both sides of any checked colour pair, so color-contrast compared nothing. Pass the --tokens file that holds the semantic colour tier, or --skip color-contrast if this system names its roles differently.';
    default:
      return JSON.stringify(f);
  }
}

function informationalDetail(i) {
  switch (i.rule) {
    case 'archetype-unknown':
      return `${i.name} — neither an "archetype" field nor its name resolves to a known archetype, so no baseline states are asserted for it.`;
    case 'proof-unadopted':
      return 'design-system.json has no "verification" key, so this system has not adopted the proof bundle and the proof-integrity checks are skipped. The first verify-check.mjs --record adopts it.';
    default:
      return JSON.stringify(i);
  }
}

// Counts SUBJECTS, not rules. A rule that ran over nothing has verified
// nothing, and a headline counting rules switched on would read as busy over an
// empty system.
export function formatReport(r) {
  const s = r.stats;
  const lines = [
    `verify:check — ${s.components} component(s), ${s.records} doc record(s), ${s.candidates} token candidate(s), ${s.modes} token mode(s), ${s.files} file(s) scanned, ${s.stages} stage file(s) read`,
  ];
  for (const e of r.excluded) {
    lines.push(`  excluded:     ${e.files} file(s) in ${e.dir}, the package that owns --tokens`);
  }
  // Every number on this line is a PAIR, in the mode it occurred in — which is
  // why it says "pair(s)" once and means it across the whole line. Its mode
  // count is the modes a pair was actually compared in, not the headline's
  // count of --tokens files: a primitives file is a mode that holds no semantic
  // role, and a multi-mode system registered with one --tokens flag shows up
  // here as one.
  if (r.contrast) {
    lines.push(
      `  contrast:     ${r.contrast.pairs} pair(s) compared across ${r.contrast.modes} mode(s), ${r.contrast.skipped.unresolvable} skipped as unresolvable, ${r.contrast.skipped.nonHex} skipped as non-hex, ${r.contrast.skipped.alphaBackground} skipped for a translucent background`,
    );
  }
  if (r.skipped.length) lines.push(`  skipped:      ${r.skipped.join(', ')}`);

  if (r.failures.length) {
    lines.push(`\n${r.failures.length} failure(s):`);
    for (const f of r.failures) lines.push(`  - [${f.rule}] ${failureDetail(f)}`);
  }
  if (r.informational.length) {
    lines.push(`\n${r.informational.length} informational note(s) — reported, not gating:`);
    for (const i of r.informational) lines.push(`  ~ [${i.rule}] ${informationalDetail(i)}`);
  }
  return lines;
}

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`verify:check — cannot read ${what} at ${path}: ${e.message}`);
    process.exit(2);
  }
}

function manifestPathOf(root) {
  const path = join(root, 'design-system.json');
  if (!existsSync(path)) {
    console.error(`verify:check — no design-system.json at ${root}`);
    process.exit(2);
  }
  return path;
}

function loadRecords(root, meta) {
  const records = new Map();
  const dir = join(root, 'design-system', 'docs', 'components');
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.doc.json')) continue;
      records.set(file.slice(0, -'.doc.json'.length), loadRecord(join(dir, file)));
    }
  }
  // A manifest that points a component's record somewhere else wins for that
  // name. The key comes from where the file was found, never from inside it —
  // which is what makes manifest `Button` plus a record named `Buttons` a
  // name-drift failure rather than a record that silently cannot be found.
  for (const [name, m] of Object.entries(meta)) {
    const path = m?.doc?.path;
    if (typeof path === 'string' && existsSync(join(root, path))) {
      records.set(name, loadRecord(join(root, path)));
    }
  }
  return records;
}

function gateMode(values) {
  const manifest = readJson(manifestPathOf(values.root), 'the manifest');
  const built = manifest.components?.built ?? [];
  const meta = manifest.components?.meta ?? {};
  const skipped = new Set(values.skip);

  // The parsed dicts are kept, not only the merged `flat`: one --tokens file is
  // one mode, and color-contrast compares each mode on its own values. Merging
  // first would check only whichever file was passed last — the light-only
  // build findModeCollisions was written to stop, reintroduced inside the gate.
  // Each file is still read exactly once.
  const dicts = values.tokens.map((file) => readJson(file, 'a token source'));
  const flat = {};
  for (const dict of dicts) Object.assign(flat, flattenDtcg(dict));

  // One mode per --tokens file, labelled by that file's basename. A token that
  // resolved carries its value; one this mode defines but whose alias chain did
  // not resolve goes into `unresolved` instead, so checkContrast can count the
  // PAIR it broke rather than the gate counting loose tokens.
  const modes = values.tokens.map((file) => ({
    mode: basename(file).replace(/\.[^.]+$/, ''),
    values: new Map(),
    unresolved: new Set(),
  }));
  for (const t of resolvedTokens(dicts)) {
    if (t.resolves) modes[t.source].values.set(t.path, t.value);
    else modes[t.source].unresolved.add(t.path);
  }

  // With no --tokens there is no token source to read, so both rules that read
  // one are ABSENT rather than passed: a run that checked no tokens must not
  // report a clean orphan-token, and has nothing to compute a ratio from.
  if (values.tokens.length === 0) {
    skipped.add('orphan-token');
    skipped.add('color-contrast');
  }

  // Partitioned after the walk rather than excluded during it, so the report
  // can count what it set aside. WITHOUT THIS THE ORPHAN RULE CANNOT FIRE AT
  // ALL: Style Dictionary writes every token by name into
  // packages/tokens/<platform>/, SOURCE_EXT yields .css, .mjs and .js, and
  // nothing in DEFAULT_EXCLUDES covers that directory — so under the
  // registered `--root ../..` the generated output binds every semantic token
  // to itself. Ported from validate-adherence.mjs, realpath comparison
  // included: a tmpdir fixture or a symlinked checkout would otherwise never
  // match the realpath'd package dirs.
  const realRoot = realpathSync(values.root);
  const ownerDirs = tokenPackageDirs(values.tokens, values.root);
  const excludedCounts = new Map(ownerDirs.map((d) => [d, 0]));
  const scanned = [];
  for (const dir of values.source.length > 0 ? values.source : [values.root]) {
    let walked;
    try {
      walked = [...walk(dir)];
    } catch (e) {
      console.error(`verify:check — cannot scan ${dir}: ${e.message}`);
      process.exit(2);
    }
    const realDir = realpathSync(dir);
    for (const path of walked) {
      const real = join(realDir, relative(dir, path));
      const owner = ownerDirs.find((d) => real.startsWith(d + sep));
      if (owner) excludedCounts.set(owner, excludedCounts.get(owner) + 1);
      else scanned.push(path);
    }
  }
  const excluded = [...excludedCounts]
    .filter(([, n]) => n > 0)
    .map(([dir, n]) => ({ dir: join(values.root, relative(realRoot, dir)), files: n }));

  const records = loadRecords(values.root, meta);
  const failures = [];
  const informational = [];
  const derived = [];

  let candidates = 0;
  let orphanInert = false;
  if (!skipped.has('orphan-token')) {
    const fileTexts = scanned.map((path) => normalizeText(readFileSync(path, 'utf8')));
    const orphans = checkOrphanTokens({ flat, fileTexts, records });
    derived.push(...orphans.failures);
    candidates = orphans.candidates;
    orphanInert = orphans.inert;
  }
  if (!skipped.has('state-incomplete')) {
    const states = checkStates({ records });
    derived.push(...states.failures);
    informational.push(...states.informational);
  }
  if (!skipped.has('name-drift')) {
    derived.push(...checkNames({ built, meta, records }));
  }
  let contrast = null;
  if (!skipped.has('color-contrast')) {
    contrast = checkContrast({ modes });
    derived.push(...contrast.failures);
  }
  failures.push(...derived);

  const proof = checkProof({ manifest, root: values.root, derived, built, meta, skipped });
  failures.push(...proof.failures);
  informational.push(...proof.informational);

  // Subjects examined, not rules enabled. Counting enabled rules would pass a
  // system with no doc records at all — exactly the green-having-read-nothing
  // run this class exists to stop.
  const examined =
    (skipped.has('orphan-token') ? 0 : candidates) +
    (skipped.has('state-incomplete') ? 0 : records.size) +
    (skipped.has('name-drift') ? 0 : built.length) +
    // A compared contrast pair is a subject the same way a token candidate is.
    // Without this, a run that skips the other three rules — which is exactly
    // how token-sync-layer invokes this gate — would fail nothing-verified on a
    // perfectly healthy system.
    (contrast ? contrast.pairs : 0);
  if (examined === 0) failures.push({ rule: 'nothing-verified' });
  if (!skipped.has('orphan-token') && orphanInert) failures.push({ rule: 'orphan-rule-inert' });
  // This and nothing-verified can fire on the same run, as orphan-rule-inert
  // already can.
  if (contrast && contrast.pairs === 0) failures.push({ rule: 'contrast-rule-inert' });

  const report = formatReport({
    stats: {
      components: built.length,
      records: records.size,
      candidates,
      modes: modes.length,
      files: scanned.length,
      stages: proof.stagesRead,
    },
    excluded,
    contrast,
    skipped: [...skipped],
    failures,
    informational,
  });
  for (const line of report) console.log(line);
  process.exit(failures.length > 0 ? 1 : 0);
}

function recordMode(values) {
  if (!values.stage || !values.entry) {
    console.error(
      'usage: verify-check.mjs --record --stage <name> [--subject <Name>] --entry <file.json>',
    );
    process.exit(2);
  }
  if (!STAGES.includes(values.stage)) {
    console.error(
      `verify:check — unknown --stage "${values.stage}"; the stages that record entries are ${STAGES.join(', ')}`,
    );
    process.exit(2);
  }
  // A per-component record that forgets --subject would be filed under
  // "system", and if it were the stage's first record it would stamp adoptedAt
  // and capture the whole exempt list off a misinvocation — which no later run
  // undoes. Refuse before anything is written.
  if (PER_COMPONENT_STAGES.has(values.stage) && !values.subject) {
    console.error(
      `verify:check — --stage ${values.stage} is keyed by component, so --subject is required`,
    );
    process.exit(2);
  }
  const subject = values.subject ?? 'system';

  // The manifest must already exist. Manifest rule 1 has each skill create it
  // with defaults if absent, but that is the owning skill's job on its own
  // first action — this recorder is called after a skill has already read and
  // written it, so a missing manifest here means the caller is pointed at the
  // wrong root, and creating one would bury that in a stray file.
  const manifestPath = manifestPathOf(values.root);
  const entry = readJson(values.entry, 'the entry');
  const problems = entryProblems(entry);
  if (problems.length > 0) {
    console.error(`verify:check — the entry at ${values.entry} is malformed:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(2);
  }

  const manifest = readJson(manifestPath, 'the manifest');
  const next = mergeEntry(loadStage(values.root, values.stage), values.stage, subject, entry);
  const path = stagePath(values.root, values.stage);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);

  if (!manifest.verification) manifest.verification = { path: PROOF_DIR, stages: {} };
  manifest.verification.path = PROOF_DIR;
  if (!manifest.verification.stages) manifest.verification.stages = {};
  const existing = manifest.verification.stages[values.stage];
  // "First record" is the stage entry being absent BEFORE this write — never
  // the `exempt` key being absent, which would let a hand-deleted list be
  // silently recaptured from the current components.built.
  const first = existing === undefined;
  const pointer = { ...(existing ?? {}) };
  pointer.at = entry.at;
  if (first) {
    pointer.adoptedAt = entry.at;
    // Capture reads the WHOLE of components.built, not "everything but this
    // subject": a run's entire batch is already in `built` before the record
    // loop reaches the first component, so a subject-excluding capture would
    // permanently grandfather its batch-mates.
    if (PER_COMPONENT_STAGES.has(values.stage)) {
      pointer.exempt = [...(manifest.components?.built ?? [])].sort();
    }
  }
  // On EVERY record, the first included, the subject leaves the list. Removal
  // is the only mutation allowed, so the list can only narrow and no write can
  // widen an exemption.
  if (Array.isArray(pointer.exempt)) pointer.exempt = pointer.exempt.filter((n) => n !== subject);
  pointer.fingerprint = stageFingerprint(next);
  manifest.verification.stages[values.stage] = pointer;

  if (!(manifest.schemaVersion >= SCHEMA_VERSION)) manifest.schemaVersion = SCHEMA_VERSION;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`✓ verify:check — recorded ${values.stage} · ${subject} (${pointer.fingerprint})`);
  process.exit(0);
}

function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        root: { type: 'string', default: '.' },
        tokens: { type: 'string', multiple: true, default: [] },
        source: { type: 'string', multiple: true, default: [] },
        skip: { type: 'string', multiple: true, default: [] },
        record: { type: 'boolean', default: false },
        stage: { type: 'string' },
        subject: { type: 'string' },
        entry: { type: 'string' },
      },
    }));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  if (values.record) recordMode(values);
  else gateMode(values);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
