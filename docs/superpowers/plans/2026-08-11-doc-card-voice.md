# Doc-Card Voice (Plan 2 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the documentation writing standard, the mechanical copy lint (`docs-lint.mjs`), the archetype compliance pass, and the authoring-pipeline wiring — plan 2 of `docs/superpowers/specs/2026-08-09-doc-card-layout-and-voice-design.md` (see its Phasing section; plan 1, the layout phase, is merged).

**Architecture:** One new reference (`doc-writing-standard.md`) states the copy rules; one new zero-dependency script (`docs-lint.mjs`) mechanically checks the ten reliable rules, warnings-only; the archetype seeds are brought into compliance; and the authoring pipeline in `component-builder` / `/document-component` runs the lint on the drafted record **before** the user sees it. The lint is advisory by design — it never gates CI and always exits 0 on a parseable record.

**Tech Stack:** Zero-dependency Node ESM (`node:test` + `node:assert/strict`, bare `node --test`); markdown references; generated adapters via `scripts/adapters/generate.mjs`.

## Global Constraints

- Zero runtime dependencies; scripts run on bare Node (`node:` builtins only).
- Tests: `node:test` + `node:assert/strict`, files named `*.test.mjs` beside the script, run by `npm test`.
- `docs-lint.mjs` output contract (spec, *The lint*): warnings only; **exit 0 for any parseable record regardless of findings**; one warning per line as `<file>: <block-path>: <rule>: <message>`; `--json` emits `{"warnings":[{"path","rule","message"}]}`. Exit `2` only for unusable invocation (missing arg, unreadable file, invalid JSON) — the repo's documented "bad CLI arguments" idiom (`scripts/README.md`).
- The ten lint rules and their thresholds are **pinned by the spec table** (`docs/superpowers/specs/2026-08-09-doc-card-layout-and-voice-design.md`, *The lint*): machinery vocabulary; summary echo (> 60% of the **summary's** content words, stopwords removed, naive plural/verb-s stemming, found in `whenToUse[0]`); run-on sentence (> 35 words); summary length (> 12 words); description length (outside 15–70 words); guidance length (> 14 words); don't shape (must open *Don't / Do not / Never / Avoid*); terminal stop (dos/donts must end with `.`); treatment lead (treatment word in first 4 words of a variant/state meaning); empty meaning (< 3 words). Verb-presence is deliberately NOT linted.
- Exempt fields (never linted): `tokensUsed`, `name`, `status`, `provenance`, `updatedAt`, `accessibility.role`.
- **Register split** (spec, *The writing standard*): doc-record content uses plain reference register (Polaris/Carbon); skill/command conversational prose keeps `references/guide-voice.md`. Do not mix them.
- **One set of strings** for humans and AI — no dual copy anywhere.
- `adapters/**` are generated — edit sources, then `node scripts/adapters/generate.mjs`; CI gates with `--check`.
- Every changed line traces to a task in this plan. Branch: `feat/doc-card-voice`.

---

### Task 1: `scripts/docs-lint.mjs` — the copy lint

**Files:**
- Create: `scripts/docs-lint.mjs`
- Test: `scripts/docs-lint.test.mjs`

**Interfaces:**
- Consumes: nothing from other tasks. Reads a `.doc.json` record (schema: `references/component-doc-schema.md`).
- Produces: CLI `node scripts/docs-lint.mjs <file> [--json]` and named export `lintRecord(record) → [{path, rule, message}]` (Task 4's prose references the CLI; tests import `lintRecord`).

Before writing code, read `scripts/docs-check.mjs` for the repo's import-safe-CLI idiom (it both exports functions and runs as a CLI); use the same idiom for the entry guard.

- [ ] **Step 1: Write the failing tests**

Create `scripts/docs-lint.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintRecord } from './docs-lint.mjs';

const rules = (ws) => ws.map((w) => w.rule);
const byRule = (ws, rule) => ws.filter((w) => w.rule === rule);

test('machinery vocabulary flagged in prose, exempt fields ignored', () => {
  const ws = lintRecord({
    name: 'Button',
    summary: 'Triggers an action.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog. It binds every color, spacing, radius, and type value to the semantic tokens.',
    tokensUsed: ['color.bg.primary'],
  });
  const hits = byRule(ws, 'machinery-vocabulary');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, 'description');
  // tokensUsed is exempt — its token names must not trip the rule
  assert.ok(!hits.some((w) => w.path.startsWith('tokensUsed')));
});

test('summary echo: spec worked example yields 100% and warns', () => {
  const ws = lintRecord({
    name: 'Button',
    summary: 'Triggers an action or event.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    whenToUse: ['Trigger an action or event — submit, confirm, open a dialog'],
  });
  const hits = byRule(ws, 'summary-echo');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, 'whenToUse[0]');
  assert.match(hits[0].message, /100%/);
});

test('summary echo: spec after-example does not warn', () => {
  const ws = lintRecord({
    name: 'Button',
    summary: 'Triggers an action or event.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    whenToUse: ['Something happens on the current page — save, confirm, open a dialog'],
  });
  assert.equal(byRule(ws, 'summary-echo').length, 0);
});

test('run-on sentence over 35 words flagged', () => {
  const long = 'This sentence keeps going and going with clause after clause after clause because nobody ever stopped it from growing far beyond what any patient reader can comfortably parse in one single breath which is exactly the failure mode';
  const ws = lintRecord({ name: 'X', summary: 'Short.', description: long + '.' });
  assert.equal(byRule(ws, 'run-on-sentence').length, 1);
});

test('summary length over 12 words flagged', () => {
  const ws = lintRecord({
    name: 'X',
    summary: 'This summary uses far too many words to say a very simple thing indeed.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
  });
  assert.equal(byRule(ws, 'summary-length').length, 1);
});

test('description length outside 15–70 words flagged, inside passes', () => {
  const short = lintRecord({ name: 'X', summary: 'Short.', description: 'Too short by far.' });
  assert.equal(byRule(short, 'description-length').length, 1);
  const ok = lintRecord({
    name: 'X', summary: 'Short.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog. Its six emphasis levels signal how important an action is.',
  });
  assert.equal(byRule(ok, 'description-length').length, 0);
});

test('guidance length, terminal stop, and dont shape on dos/donts', () => {
  const ws = lintRecord({
    name: 'X', summary: 'Short.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    dos: ['Lead with a verb'],                                     // no terminal stop
    donts: ["Don't use a button for navigation — use a Link",      // no terminal stop
            'Use a Link for navigation instead of this.'],          // wrong opener
  });
  assert.equal(byRule(ws, 'terminal-stop').length, 2);
  const shape = byRule(ws, 'dont-shape');
  assert.equal(shape.length, 1);
  assert.equal(shape[0].path, 'donts[1]');
});

test('spec after-example guidance passes clean', () => {
  const ws = lintRecord({
    name: 'X', summary: 'Short.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    donts: ["Don't use a button to navigate. Use a Link."],
  });
  assert.equal(rules(ws).filter((r) => ['guidance-length', 'terminal-stop', 'dont-shape'].includes(r)).length, 0);
});

test('treatment lead flagged in first 4 words of a meaning; later mention passes', () => {
  const ws = lintRecord({
    name: 'X', summary: 'Short.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    variants: { type: {
      primary: 'Highest-emphasis, solid brand fill — the one primary action in a view.',
      secondary: 'A supporting action, rendered with a subtle border treatment.',
    } },
    states: { disabled: "Can't be clicked or tabbed to." },
  });
  const hits = byRule(ws, 'treatment-lead');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, 'variants.type.primary');
});

test('empty meaning under 3 words flagged', () => {
  const ws = lintRecord({
    name: 'X', summary: 'Short.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    states: { hover: 'Pointer feedback.' },
  });
  const hits = byRule(ws, 'empty-meaning');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, 'states.hover');
});

test('a record following the standard produces zero warnings', () => {
  const ws = lintRecord({
    name: 'Button',
    summary: 'Triggers an action or event.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog. Its six emphasis levels signal how important an action is.',
    whenToUse: ['Something happens on the current page — save, confirm, open a dialog'],
    whenNotToUse: ['Navigating to another page. Use a Link.'],
    variants: { type: { primary: 'The one main action in a view.' } },
    states: { disabled: "Can't be clicked or tabbed to." },
    dos: ['Lead with a verb.'],
    donts: ["Don't use a button to navigate. Use a Link."],
    accessibility: {
      role: 'button',
      keyboard: ['Enter or Space activates the button.'],
      notes: ['An icon-only button needs an `aria-label` so screen readers can announce it.'],
    },
    tokensUsed: ['color.bg.primary'],
    status: 'stable',
  });
  assert.deepEqual(ws, []);
});

test('missing optional blocks lint without crashing', () => {
  const ws = lintRecord({ name: 'X', summary: 'Short.', description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.' });
  assert.equal(rules(ws).length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/docs-lint.test.mjs`
Expected: FAIL — cannot find module `./docs-lint.mjs`.

- [ ] **Step 3: Implement `scripts/docs-lint.mjs`**

```js
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

const words = (s) => String(s).toLowerCase().match(/[a-z0-9'’-]+/g) || [];
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
      if (key === 'donts' && !/^(don['’]?t|do not|never|avoid)\b/i.test(String(entry).trim())) {
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
```

If `scripts/docs-check.mjs` uses a different import-safe-CLI idiom than the `pathToFileURL` guard above, match its idiom instead — consistency wins.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/docs-lint.test.mjs`
Expected: PASS, all tests.

- [ ] **Step 5: CLI smoke check**

Write a temp record with one violation to `/tmp` is not allowed — use the repo-ignored path `.superpowers/lint-smoke.doc.json` (or any git-ignored scratch location), run `node scripts/docs-lint.mjs <path>` and confirm: exit code 0, one `<file>: <path>: <rule>: <message>` line; then `--json` and confirm the `{warnings:[...]}` shape; then a missing path and confirm exit 2. Delete the scratch file.

- [ ] **Step 6: Full suite**

Run: `npm test`
Expected: PASS (existing tests plus the new file).

- [ ] **Step 7: Commit**

```bash
git add scripts/docs-lint.mjs scripts/docs-lint.test.mjs
git commit -m "feat(docs): docs-lint — mechanical copy lint for doc records, warnings-only"
```

---

### Task 2: `references/doc-writing-standard.md` — the copy rules

**Files:**
- Create: `references/doc-writing-standard.md`

**Interfaces:**
- Consumes: rule slugs from Task 1 (`machinery-vocabulary`, `summary-echo`, `run-on-sentence`, `summary-length`, `description-length`, `guidance-length`, `dont-shape`, `terminal-stop`, `treatment-lead`, `empty-meaning`) — the standard names them so warnings are traceable to rules.
- Produces: the reference path `references/doc-writing-standard.md`, cited by Tasks 3 and 4.

- [ ] **Step 1: Write the reference**

Content requirements (all from the spec's *The writing standard* section — carry its before/after examples verbatim):

1. **Title + scope line**: the writing standard for all doc-record content; applied by the authoring pipeline in `component-builder` and `/document-component`; projections (Figma description, doc card, Storybook MDX, AI digest) inherit it for free.
2. **Governing rule**, verbatim: *describe the thing and how to use it, never how it was made.*
3. **Register**: plain reference — neutral and declarative for descriptions, imperative for guidance (the Polaris/Carbon register). Explicitly: this is NOT the conversational guide voice of `references/guide-voice.md`, which remains the register for skill conversation.
4. **Per-block rules** with the spec's before/after pairs (Button examples) for: `description` (2–3 sentences: what it is, what it's for, the one thing that most changes how you use it; never variant/size counts, token binding, or slot inventories); `whenToUse`/`whenNotToUse` (situations, never an echo of `summary`; `whenNotToUse` always names the alternative); `variants`/`states` (lead with meaning; visual treatment optional, never the whole entry); `dos`/`donts` (imperative, one action per entry, ≤ 14 words, full stop; don'ts open with *Don't / Never / Avoid* and name the alternative); `accessibility.notes` (what the reader must do, not what the framework emits — include the spec's "Cut" example).
5. **The vocabulary line**, verbatim from the spec: real names of things stay (`aria-label`, `role`, `Enter`, `Space`); banned from user-facing prose is the system's machinery vocabulary — tokens, variables, bindings, fingerprints, provenance, projections, surfaces (machinery sense). `tokensUsed` keeps token names — structured, machine-useful, never rendered as prose.
6. **Global rules**: full sentences (no em-dash label-fragments); one set of strings for humans and AI — no dual copy; the digest inherits the same text.
7. **The lint section**: `scripts/docs-lint.mjs` checks the mechanically reliable subset — list the ten rule slugs with one-line summaries and the thresholds; note the output contract (warnings only, exit 0, `--json`); note what is deliberately not linted (verb-presence) and why (an unreliable rule is worse than no rule — it stays a prose rule caught at the user-approval gate).
8. **Sequencing**: draft record → write file → `node ${CLAUDE_PLUGIN_ROOT}/scripts/docs-lint.mjs <file>` → fix warnings → show the user. The lint shapes the draft before approval, it does not nag afterward. `imported`/`user` provenance blocks: the lint still warns, the proposed rewrite is carried into the record-approval gate (shown as before/after, labelled with provenance); blocks the user clears are stamped `imported+user` — never silently rewritten.

Match the register and formatting of existing references (e.g. `references/component-doc-schema.md`): terse headings, tables where enumerable, no marketing prose.

- [ ] **Step 2: Verify internal consistency**

Check every rule slug named in the reference exactly matches a `rule` string in `scripts/docs-lint.mjs` (grep both files side by side). Check the before-examples in the reference are the ones the lint's tests assert on.

- [ ] **Step 3: Commit**

```bash
git add references/doc-writing-standard.md
git commit -m "docs: doc-writing-standard — the copy rules for doc-record content"
```

---

### Task 3: Archetype compliance pass

**Files:**
- Modify: `references/component-doc-archetypes.md` (86 lines; archetypes: Button, Input/text field, Checkbox/radio/toggle, Card, Modal/dialog, Badge/chip/tag, Fallback)

**Interfaces:**
- Consumes: `references/doc-writing-standard.md` (Task 2) — read it first; it is the rubric.
- Produces: seeds that pass the standard, so records grown from them start clean.

- [ ] **Step 1: Audit every seed entry against the standard**

For each archetype's seeded `dos`, `donts`, `accessibility`, `whenToUse`, `whenNotToUse` entries apply, by hand, the mechanical rules (they cannot be run by the lint — this file is not a `.doc.json`): guidance ≤ 14 words with terminal stop; don'ts open *Don't / Never / Avoid* and name the alternative; no machinery vocabulary; no treatment-leads; no framework-emission trivia in accessibility (the spec singles out accessibility entries as carrying the most jargon — e.g. any "renders a native element, so the role is implicit" style note gets cut or rewritten as what the reader must do). This is a **light** pass: rewrite non-compliant entries in place, do not restructure the file, do not add new archetypes, do not change compliant entries.

- [ ] **Step 2: Self-check**

Re-read the diff. Every changed line must be a compliance fix traceable to a named rule in the standard; revert any drive-by wording change that isn't.

- [ ] **Step 3: Commit**

```bash
git add references/component-doc-archetypes.md
git commit -m "docs: archetype seeds comply with the doc-writing standard"
```

---

### Task 4: Pipeline wiring, install path, and changelog

**Files:**
- Modify: `skills/component-builder/SKILL.md` (the *Author the documentation record* step, layers 0–4 around lines 246–265, and the "Write the record and project it" block around 267–285)
- Modify: `commands/document-component.md` (step 1 authoring flow ~lines 11–15; the freshness-gate file list ~lines 29–31)
- Modify: `skills/storybook-chromatic-builder/SKILL.md` (script copy list + npm script registration, lines 35–44)
- Modify: `scripts/README.md` (script table)
- Modify: `CHANGELOG.md` (`[Unreleased]` section — create it if absent; never touch released headings)
- Regenerate: `adapters/**` via `node scripts/adapters/generate.mjs`

**Interfaces:**
- Consumes: Task 1's CLI (`node ${CLAUDE_PLUGIN_ROOT}/scripts/docs-lint.mjs <file>`; installed name `docs:lint`), Task 2's reference path.
- Produces: nothing downstream; this is the leaf task.

- [ ] **Step 1: Wire `component-builder`**

In the authoring-pipeline step: add one sentence establishing that all authored prose follows `${CLAUDE_PLUGIN_ROOT}/references/doc-writing-standard.md` (plain reference register — not the guide voice). After the record is written to disk and **before** the user-approval gate (the bold "Show the whole drafted record and get explicit approval" sentence), insert the lint sequencing from the spec: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/docs-lint.mjs design-system/docs/components/<Name>.doc.json`, fix the warnings it raises (for `imported`/`user` blocks: draft the rewrite and carry it into the approval gate, shown as before/after and labelled with provenance; blocks the user clears are stamped `imported+user` — never silently rewrite), then show the draft. Keep the surrounding guide voice; keep edits minimal — this is two surgical insertions, not a rewrite of the step.

- [ ] **Step 2: Wire `/document-component`**

Same two insertions in `commands/document-component.md` step 1 (it delegates to the component-builder pipeline — reference the standard and the lint-before-approval sequencing there too, one sentence each). Then extend the freshness-gate refresh list (~line 30) so `docs-lint.mjs` is among the files refreshed from the plugin (`build-docs-digest.mjs`, `docs-check.mjs`, `lib/doc-record.mjs`, `lib/doc-card-plan.mjs`, **`docs-lint.mjs`**).

- [ ] **Step 3: Wire the install path**

In `skills/storybook-chromatic-builder/SKILL.md` lines 35–41: add `docs-lint.mjs` to the copied-scripts list and register the npm script `"docs:lint": "node scripts/docs-lint.mjs"` beside `docs:digest`/`docs:check`. (Plan-1 lesson: this copy list is the ONLY install path into native repos — a script missing here does not exist downstream.)

- [ ] **Step 4: `scripts/README.md` row**

Add to the script table:
`| docs-lint.mjs | Copy lint for .doc.json records — warnings only, always exit 0 on a parseable record; the mechanical subset of references/doc-writing-standard.md. | docs:lint |`
(Adjust cell wording to match the table's voice; keep the three-column shape.)

- [ ] **Step 5: Changelog**

Add an `[Unreleased]` section (the previous one was consumed by the 0.15 merge — check first) with entries for: the doc-writing standard, `docs-lint.mjs` (+ `docs:lint` install), the archetype compliance pass, and the authoring-pipeline lint gate.

- [ ] **Step 6: Regenerate adapters and run every gate**

```bash
node scripts/adapters/generate.mjs
node scripts/adapters/generate.mjs --check
node scripts/build-doc-card-builder.mjs --check
npm test
```
Expected: all green; the adapter regen picks up the `document-component` and `storybook-chromatic-builder` changes.

- [ ] **Step 7: Commit**

```bash
git add skills/component-builder/SKILL.md commands/document-component.md skills/storybook-chromatic-builder/SKILL.md scripts/README.md CHANGELOG.md adapters
git commit -m "feat(docs): wire the writing standard and docs-lint into the authoring pipeline"
```

---

## Self-Review Notes

- **Spec coverage:** writing standard → Task 2; lint (rules table, output contract, sequencing, `docs:lint` install) → Tasks 1 + 4; archetype pass → Task 3; pipeline wiring (`component-builder`, `/document-component`) → Task 4; free-win projections need no task (they render record strings). The spec's dogfood success criterion (#6) is the acceptance test AFTER this plan, run from `throughline-sample` — not a task here.
- **Not in scope:** verb-presence linting (spec-rejected); CI gating on lint (spec-rejected); balanced columns (spec-rejected); token-sheet/icon cards.
- **Type consistency:** rule slugs appear in three places — `docs-lint.mjs`, its tests, and `doc-writing-standard.md`; Task 2 Step 2 checks the match explicitly.
- **Ambiguity resolved here:** "always exits 0" (spec) is scoped to parseable records; unusable invocation exits 2 per the repo's documented CLI idiom. "Don't / Never / Avoid" accepts "Do not" as the expanded form of *Don't*.
