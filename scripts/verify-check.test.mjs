import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText,
  aliasTargets,
  checkOrphanTokens,
  checkStates,
  checkNames,
} from './verify-check.mjs';

test('aliasTargets finds a reference in a plain string value and in an object value member', () => {
  const targets = aliasTargets({
    'color.bg.primary': '{color.blue.500}',
    'shadow.md': { color: '{color.shadow.default}', offsetY: '2px' },
    'color.blue.500': '#00aaff',
  });
  assert.ok(targets.has('color.blue.500'));
  assert.ok(targets.has('color.shadow.default'));
  assert.equal(targets.size, 2);
});

const SEMANTIC = { 'color.blue.500': '#00aaff', 'color.bg.primary': '{color.blue.500}' };

test('checkOrphanTokens: a semantic token nothing names is an orphan', () => {
  const { failures, inert } = checkOrphanTokens({ flat: SEMANTIC });
  assert.equal(inert, false);
  assert.deepEqual(failures, [{ rule: 'orphan-token', token: 'color.bg.primary' }]);
});

test('checkOrphanTokens: a token mentioned in a scanned file is bound', () => {
  const fileTexts = [normalizeText('.btn { background: var(--color-bg-primary); }')];
  const { failures } = checkOrphanTokens({ flat: SEMANTIC, fileTexts });
  assert.deepEqual(failures, []);
});

test('checkOrphanTokens: a token listed in a record\'s tokensUsed is bound', () => {
  const records = new Map([['Button', { name: 'Button', tokensUsed: ['color.bg.primary'] }]]);
  const { failures } = checkOrphanTokens({ flat: SEMANTIC, records });
  assert.deepEqual(failures, []);
});

test('checkOrphanTokens: a token another token references is bound', () => {
  const flat = { ...SEMANTIC, 'color.bg.hover': '{color.bg.primary}' };
  // color.bg.hover is itself a candidate, so bind it the other way — otherwise
  // this test would pass on its own orphan rather than on the alias edge.
  const fileTexts = [normalizeText('background: var(--color-bg-hover);')];
  const { failures } = checkOrphanTokens({ flat, fileTexts });
  assert.deepEqual(failures, []);
});

test('checkOrphanTokens: a primitive nothing names is not an orphan', () => {
  const fileTexts = [normalizeText('background: var(--color-bg-primary);')];
  const { failures, inert } = checkOrphanTokens({ flat: SEMANTIC, fileTexts });
  assert.equal(inert, false, 'the semantic token is still a candidate');
  assert.deepEqual(failures, [], 'color.blue.500 is a literal, so it is never a candidate');
});

test('checkOrphanTokens: a source with no aliases at all is inert', () => {
  const { failures, inert } = checkOrphanTokens({ flat: { 'color.blue.500': '#00aaff' } });
  assert.equal(inert, true);
  assert.deepEqual(failures, []);
});

test('checkStates: a Button record missing disabled fails, naming the state', () => {
  const records = new Map([
    ['Button', { name: 'Button', states: { hover: '…', focus: '…', active: '…' } }],
  ]);
  const { failures, informational } = checkStates({ records });
  assert.deepEqual(failures, [{ rule: 'state-incomplete', name: 'Button', missing: ['disabled'] }]);
  assert.deepEqual(informational, []);
});

test('checkStates: a complete Button passes', () => {
  const records = new Map([
    ['Button', { name: 'Button', states: { hover: '…', focus: '…', active: '…', disabled: '…' } }],
  ]);
  assert.deepEqual(checkStates({ records }).failures, []);
});

test('checkStates: a Card owes no states', () => {
  const records = new Map([['Card', { name: 'Card' }]]);
  const { failures, informational } = checkStates({ records });
  assert.deepEqual(failures, []);
  assert.deepEqual(informational, []);
});

test('checkStates: an unresolvable name is informational, not a failure', () => {
  const records = new Map([['IconButton', { name: 'IconButton' }]]);
  const { failures, informational } = checkStates({ records });
  assert.deepEqual(failures, []);
  assert.deepEqual(informational, [{ rule: 'archetype-unknown', name: 'IconButton' }]);
});

test('checkNames: a record named Buttons under manifest Button drifts', () => {
  const records = new Map([['Button', { name: 'Buttons' }]]);
  const failures = checkNames({ built: ['Button'], records });
  assert.equal(failures.length, 1);
  assert.equal(failures[0].rule, 'name-drift');
  assert.deepEqual(failures[0].spellings, { manifest: 'Button', record: 'Buttons' });
});

test('checkNames: an MDX surface at Btn/Btn.mdx under manifest Button drifts', () => {
  const meta = {
    Button: { doc: { surfaces: { storybookMdx: { file: 'packages/ui/src/Btn/Btn.mdx' } } } },
  };
  const failures = checkNames({ built: ['Button'], meta });
  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0].spellings, { manifest: 'Button', file: 'Btn', dir: 'Btn' });
});

test('checkNames: an MDX surface at Button/Button.mdx agrees', () => {
  const meta = {
    Button: { doc: { surfaces: { storybookMdx: { file: 'packages/ui/src/Button/Button.mdx' } } } },
  };
  assert.deepEqual(checkNames({ built: ['Button'], meta }), []);
});

test('checkNames: a component with no record and no surface has nothing to disagree with', () => {
  assert.deepEqual(checkNames({ built: ['Button'] }), []);
});

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runCli(args) {
  try {
    return { code: 0, stdout: execFileSync('node', ['scripts/verify-check.mjs', ...args], { encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, stdout: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const PRIMITIVES_ONLY = { color: { blue: { 500: { $value: '#00aaff', $type: 'color' } } } };
const TOKENS = {
  color: {
    blue: { 500: { $value: '#00aaff', $type: 'color' } },
    bg: {
      primary: { $value: '{color.blue.500}', $type: 'color' },
      canvas: { $value: '{color.blue.500}', $type: 'color' },
    },
  },
};

// What Style Dictionary writes into the token package: every token, by name.
// If the owner-package partition ever stops working, this file alone binds
// every semantic token and the orphan rule can never fire.
function generatedCss(names) {
  return `:root {\n${names.map((n) => `  --${n.replace(/\./g, '-')}: #00aaff;`).join('\n')}\n}\n`;
}

const manifestPath = (root) => join(root, 'design-system.json');
const tokensPath = (root) => join(root, 'packages', 'tokens', 'dtcg', 'tokens.json');
const recordPath = (root, name) => join(root, 'design-system', 'docs', 'components', `${name}.doc.json`);
const stageFilePath = (root, stage) => join(root, 'design-system', 'proof', `${stage}.json`);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const manifestOf = (root) => readJson(manifestPath(root));
const exemptOf = (root, stage) => manifestOf(root).verification.stages[stage].exempt;

function docRecord(name) {
  const record = { name, summary: `${name} does a thing.`, description: `A ${name}.` };
  if (name === 'Button') {
    record.states = { hover: '…', focus: '…', active: '…', disabled: '…' };
    record.tokensUsed = ['color.bg.primary'];
  }
  return record;
}

function fixture(t, { built = ['Button', 'Card'], records = ['Button', 'Card'], tokens = TOKENS } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'verify-check-'));
  if (t) t.after(() => rmSync(root, { recursive: true, force: true }));

  mkdirSync(join(root, 'design-system', 'docs', 'components'), { recursive: true });
  mkdirSync(join(root, 'packages', 'tokens', 'dtcg'), { recursive: true });
  mkdirSync(join(root, 'packages', 'tokens', 'web'), { recursive: true });
  mkdirSync(join(root, 'apps', 'web'), { recursive: true });

  writeJson(join(root, 'packages', 'tokens', 'package.json'), { name: '@fixture/tokens' });
  writeJson(tokensPath(root), tokens);
  writeFileSync(
    join(root, 'packages', 'tokens', 'web', 'tokens.css'),
    generatedCss(['color.blue.500', 'color.bg.primary', 'color.bg.canvas']),
  );
  // The consuming app is what legitimately binds the semantic tier.
  writeFileSync(
    join(root, 'apps', 'web', 'app.css'),
    '.page { background: var(--color-bg-canvas); color: var(--color-bg-primary); }\n',
  );

  for (const name of records) writeJson(recordPath(root, name), docRecord(name));
  writeJson(manifestPath(root), {
    schemaVersion: 6,
    components: {
      built,
      meta: Object.fromEntries(built.map((n) => [n, { status: 'draft', updatedAt: '2026-09-01T00:00:00.000Z' }])),
    },
  });
  return root;
}

// A semantic token nothing in the app names — but which the generated token
// output does name, so it is only visible with the partition in place.
function addOrphanToken(root) {
  const tokens = readJson(tokensPath(root));
  tokens.color.bg.accent = { $value: '{color.blue.500}', $type: 'color' };
  writeJson(tokensPath(root), tokens);
  writeFileSync(
    join(root, 'packages', 'tokens', 'web', 'tokens.css'),
    generatedCss(['color.blue.500', 'color.bg.primary', 'color.bg.canvas', 'color.bg.accent']),
  );
}

function entryFile(root, { at = '2026-09-12T12:00:00.000Z', checks, advancedBecause = 'Read-back passed.', omit } = {}) {
  const path = join(root, `entry-${Math.random().toString(36).slice(2)}.json`);
  const entry = {
    at,
    changed: ['built it'],
    checks: checks ?? [{ name: 'structural-read-back', method: 'attested', result: 'pass', evidence: 'COMPONENT_SET 1:2' }],
    advancedBecause,
  };
  if (omit) delete entry[omit];
  writeJson(path, entry);
  return path;
}

function recordEntry(root, stage, subject, options) {
  const args = ['--record', '--root', root, '--stage', stage, '--entry', entryFile(root, options)];
  if (subject) args.push('--subject', subject);
  return runCli(args);
}

const gate = (root, extra = []) => runCli(['--root', root, '--tokens', tokensPath(root), ...extra]);

function addComponent(root, name, status = 'draft') {
  const manifest = manifestOf(root);
  manifest.components.built.push(name);
  manifest.components.meta[name] = { status, updatedAt: '2026-09-12T00:00:00.000Z' };
  writeJson(manifestPath(root), manifest);
}

test('CLI: a clean system exits 0, and the first record grandfathers the rest of the batch', (t) => {
  const root = fixture(t);
  const recorded = recordEntry(root, 'component-builder', 'Button');
  assert.equal(recorded.code, 0, recorded.stdout);
  // built is [Button, Card]: the capture takes both, the record removes its own
  // subject. So Button is proven, Card is grandfathered, and the clean run is
  // clean for the reason the design says it is.
  assert.deepEqual(exemptOf(root, 'component-builder'), ['Card']);

  const r = gate(root);
  assert.equal(r.code, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /failure\(s\)/);
});

test('CLI: the same system fails state-incomplete once the Button record loses disabled', (t) => {
  const root = fixture(t);
  recordEntry(root, 'component-builder', 'Button');
  assert.equal(gate(root).code, 0, 'the control starts from a clean run');

  const record = readJson(recordPath(root, 'Button'));
  delete record.states.disabled;
  writeJson(recordPath(root, 'Button'), record);

  const r = gate(root);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /\[state-incomplete\] Button documents no disabled state/);
});

test('CLI: a component added after the capture, with no entry, fails proof-missing', (t) => {
  const root = fixture(t);
  recordEntry(root, 'component-builder', 'Button');
  addComponent(root, 'Dialog');

  const r = gate(root);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /\[proof-missing\] component-builder owes Dialog an entry/);
});

test('CLI: the storybook stage owes a draft component nothing and a stable one an entry', (t) => {
  const root = fixture(t);
  recordEntry(root, 'component-builder', 'Button');
  // The stage needs an entry of its own to be listed in verification.stages at
  // all, or checkProof never iterates it and this test asserts nothing.
  recordEntry(root, 'storybook-chromatic-builder', 'Button');
  // Menu arrives after that record, so it is not in the storybook stage's
  // captured exempt; its component-builder entry means any proof-missing that
  // appears belongs to the stage under test.
  addComponent(root, 'Menu', 'draft');
  recordEntry(root, 'component-builder', 'Menu');

  const draft = gate(root);
  assert.equal(draft.code, 0, draft.stdout);

  const manifest = manifestOf(root);
  manifest.components.meta.Menu.status = 'stable';
  writeJson(manifestPath(root), manifest);

  const stable = gate(root);
  assert.equal(stable.code, 1);
  assert.match(stable.stdout, /\[proof-missing\] storybook-chromatic-builder owes Menu an entry/);
});

test('CLI: promoting a grandfathered component does not drag it into the gate', (t) => {
  const root = fixture(t);
  recordEntry(root, 'component-builder', 'Button');

  // Exactly what a storying run does to a component built before adoption.
  const manifest = manifestOf(root);
  manifest.components.meta.Card = { status: 'stable', updatedAt: new Date().toISOString() };
  writeJson(manifestPath(root), manifest);

  const r = gate(root);
  assert.equal(r.code, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /Card/);
});

test('CLI: exempt only shrinks — a later record never re-captures, and a record removes its own subject', (t) => {
  const root = fixture(t);
  recordEntry(root, 'component-builder', 'Button');
  addComponent(root, 'Dialog');
  assert.equal(gate(root).code, 1, 'Dialog fails before any of this');

  // (a) Record a FOURTH name. Using Dialog itself would clear the failure and
  // the assertion would prove nothing.
  addComponent(root, 'Panel');
  recordEntry(root, 'component-builder', 'Panel');
  assert.deepEqual(exemptOf(root, 'component-builder'), ['Card'], 'exempt gained nothing');
  const still = gate(root);
  assert.equal(still.code, 1);
  assert.match(still.stdout, /\[proof-missing\] component-builder owes Dialog an entry/);

  // (b) Record Card, which IS in exempt: it leaves, and nothing else moves.
  recordEntry(root, 'component-builder', 'Card');
  assert.deepEqual(exemptOf(root, 'component-builder'), []);
});

test('CLI: the adoption batch is not grandfathered — capture reads all of components.built', (t) => {
  const root = fixture(t, { built: ['A', 'B', 'C', 'D'] });
  recordEntry(root, 'component-builder', 'C');
  recordEntry(root, 'component-builder', 'D');
  assert.deepEqual(exemptOf(root, 'component-builder'), ['A', 'B']);

  const clean = gate(root);
  assert.equal(clean.code, 0, clean.stdout);
  assert.doesNotMatch(clean.stdout, /proof-missing/, 'C and D were proven, not exempted');

  // Drop D's entry by hand. The assertion has to NAME D: the hand-edit also
  // fires proof-stale, so an exit-code assertion would pass with D still
  // sitting in exempt, which is the outcome this test exists to catch.
  const stageFile = readJson(stageFilePath(root, 'component-builder'));
  delete stageFile.subjects.D;
  writeJson(stageFilePath(root, 'component-builder'), stageFile);

  const r = gate(root);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /\[proof-missing\] component-builder owes D an entry/);
  assert.match(r.stdout, /\[proof-stale\]/);
});

test('CLI: orphan-token is not blinded by the package that owns --tokens', (t) => {
  const root = fixture(t);
  recordEntry(root, 'component-builder', 'Button');
  addOrphanToken(root);

  const r = gate(root);
  assert.equal(r.code, 1, r.stdout);
  assert.match(r.stdout, /\[orphan-token\] color\.bg\.accent/);
  assert.match(r.stdout, /excluded:\s+\d+ file\(s\) in .*packages\/tokens/);
});

test('CLI: a manifest with no verification exits 0 and reports proof-unadopted', (t) => {
  const root = fixture(t);
  const r = gate(root);
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /\[proof-unadopted\]/);
});

test('CLI: a stage file edited after recording exits 1 with proof-stale', (t) => {
  const root = fixture(t);
  recordEntry(root, 'component-builder', 'Button');
  const stageFile = readJson(stageFilePath(root, 'component-builder'));
  stageFile.subjects.Button.advancedBecause = 'edited by hand';
  writeJson(stageFilePath(root, 'component-builder'), stageFile);

  const r = gate(root);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /\[proof-stale\]/);
});

test('CLI: an orphan-token result recorded as pass contradicts a run that finds one', (t) => {
  const root = fixture(t);
  addOrphanToken(root);
  recordEntry(root, 'storybook-chromatic-builder', 'Button', {
    checks: [{ name: 'orphan-token', method: 'derived', result: 'pass', evidence: 'verify:check report' }],
  });

  const r = gate(root);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /\[proof-contradicted\] storybook-chromatic-builder recorded orphan-token as "pass"/);
});

test('CLI: a run with no --tokens and every other rule skipped fails nothing-verified', (t) => {
  const root = fixture(t);
  const r = runCli(['--root', root, '--skip', 'state-incomplete', '--skip', 'name-drift']);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /\[nothing-verified\]/);
  assert.match(r.stdout, /skipped:.*orphan-token/, 'no --tokens means the rule is absent, not passed');
});

test('CLI: every rule enabled over a system with no records and nothing built fails nothing-verified', (t) => {
  const root = fixture(t, { built: [], records: [], tokens: PRIMITIVES_ONLY });
  const r = gate(root);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /\[nothing-verified\]/);
});

test('CLI: a derived state-incomplete pass contradicts only for the subject the rerun fails', (t) => {
  const failing = fixture(t);
  const record = readJson(recordPath(failing, 'Button'));
  delete record.states.disabled;
  writeJson(recordPath(failing, 'Button'), record);
  recordEntry(failing, 'storybook-chromatic-builder', 'Button', {
    checks: [{ name: 'state-incomplete', method: 'derived', result: 'pass', evidence: 'verify:check report' }],
  });
  const contradicted = gate(failing);
  assert.equal(contradicted.code, 1);
  assert.match(contradicted.stdout, /\[proof-contradicted\].*state-incomplete/);

  const passing = fixture(t);
  const record2 = readJson(recordPath(passing, 'Button'));
  delete record2.states.disabled;
  writeJson(recordPath(passing, 'Button'), record2);
  recordEntry(passing, 'storybook-chromatic-builder', 'Card', {
    checks: [{ name: 'state-incomplete', method: 'derived', result: 'pass', evidence: 'verify:check report' }],
  });
  const other = gate(passing);
  assert.equal(other.code, 1, 'state-incomplete itself still fails, for Button');
  assert.doesNotMatch(other.stdout, /proof-contradicted/, 'Card passes the rerun, so its record agrees');
});

test('CLI: record mode writes the stage file, stamps the manifest and bumps schemaVersion 6 → 7', (t) => {
  const root = fixture(t);
  assert.equal(manifestOf(root).schemaVersion, 6);

  recordEntry(root, 'component-builder', 'Button');
  const first = manifestOf(root);
  assert.equal(first.schemaVersion, 7);
  assert.equal(first.verification.path, 'design-system/proof');
  const pointer = first.verification.stages['component-builder'];
  assert.equal(pointer.adoptedAt, '2026-09-12T12:00:00.000Z');
  assert.ok(readJson(stageFilePath(root, 'component-builder')).subjects.Button);

  recordEntry(root, 'component-builder', 'Card', { at: '2026-09-13T12:00:00.000Z' });
  const second = manifestOf(root).verification.stages['component-builder'];
  const stageFile = readJson(stageFilePath(root, 'component-builder'));
  assert.ok(stageFile.subjects.Button, 'the first entry is left intact');
  assert.ok(stageFile.subjects.Card);
  assert.notEqual(second.fingerprint, pointer.fingerprint);
  assert.equal(second.adoptedAt, pointer.adoptedAt, 'adoptedAt is write-once');
  assert.equal(second.at, '2026-09-13T12:00:00.000Z', 'at moves with the latest entry');
});

test('CLI: record mode exits 2 on a malformed entry and writes nothing', (t) => {
  const root = fixture(t);
  const path = entryFile(root, { omit: 'advancedBecause' });
  const r = runCli(['--record', '--root', root, '--stage', 'component-builder', '--subject', 'Button', '--entry', path]);
  assert.equal(r.code, 2);
  assert.match(r.stdout, /advancedBecause/);
  assert.equal(existsSync(stageFilePath(root, 'component-builder')), false);
  assert.equal(manifestOf(root).verification, undefined);
});

test('CLI: record mode refuses a misinvocation before it can stamp the manifest', (t) => {
  const root = fixture(t);
  const before = readFileSync(manifestPath(root), 'utf8');

  const unknownStage = runCli(['--record', '--root', root, '--stage', 'nonsense', '--subject', 'Button', '--entry', entryFile(root)]);
  assert.equal(unknownStage.code, 2);
  const noSubject = runCli(['--record', '--root', root, '--stage', 'component-builder', '--entry', entryFile(root)]);
  assert.equal(noSubject.code, 2);

  // The exit code is not the point: such a call, if it were the stage's first
  // record, would stamp adoptedAt and capture the whole exempt list under the
  // subject "system", and no later run undoes that.
  assert.equal(readFileSync(manifestPath(root), 'utf8'), before, 'the manifest is untouched');
  assert.equal(existsSync(join(root, 'design-system', 'proof')), false);
});
