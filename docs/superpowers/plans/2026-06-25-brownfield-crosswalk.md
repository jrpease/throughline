# Brownfield Retrofit — Plan 2: Crosswalk Scripts + Builder Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the crosswalk backbone — a finalized `crosswalk.json` schema, three canonical vetted Node scripts (validator, reverse-index generator, repo-wide token-removal guard), and the `token-crosswalk-builder` skill that builds the crosswalk, installs the scripts into the user's monorepo, and wires the `tokens:validate` CI gate.

**Architecture:** The plugin gains its first executable code in a new `scripts/` directory — the executable analog of `references/`. Scripts are plain ESM Node modules (`.mjs`), **zero runtime dependencies**, tested with Node's built-in test runner (`node --test`). Each script exports pure functions (testable in isolation) and guards its CLI behind a `main()` entrypoint check. A tiny shared loader (`scripts/lib/crosswalk.mjs`) reads and structurally validates `crosswalk.json` for all three. The crosswalk schema is finalized **first** (per spec §11) as both a canonical reference doc and a JSON Schema file. The `token-crosswalk-builder` skill (a `retrofit-planner` sub-skill, no slash command) copies the vetted scripts into the user's `packages/tokens/` and wires `tokens:validate` into their `package.json`, then writes the `tokenCrosswalk` manifest section it owns. Greenfield paths are untouched; the color-usage grep scaffold and binding-survival audit are deliberately deferred to Plan 3 alongside their consumer (`design-system-audit`).

**Tech Stack:** Node.js (≥18; dev machine has v24) ESM, `node:test` + `node:assert`, `node:util` `parseArgs`, `node:fs`/`node:path`/`node:os`/`node:url`. No `package.json`, no npm install, no third-party deps in the plugin. The crosswalk validator resolves against the DTCG token JSON that `token-sync-layer` emits at `packages/tokens/dtcg/tokens.json`. Markdown for the skill and reference docs, matching the house style in `skills/` and `references/`.

---

## Scope & boundaries

**In scope (this plan):**
- `references/crosswalk-schema.md` — the finalized, canonical crosswalk contract.
- `scripts/crosswalk.schema.json` — machine-readable JSON Schema (documentation + editor support).
- `scripts/lib/crosswalk.mjs` — shared loader + structural validation + status-count rollup.
- `scripts/validate-crosswalk.mjs` — the N/N `tokens:validate` gate (resolved value == new value).
- `scripts/build-reverse-index.mjs` — code symbol → new token map generator.
- `scripts/guard-token-removal.mjs` — repo-wide zero-reference grep guard.
- `scripts/*.test.mjs` — tests for each of the above.
- `scripts/README.md` — what the scripts are, how the skill installs them, how to run tests.
- `skills/token-crosswalk-builder/SKILL.md` — the builder skill.
- `CHANGELOG.md` — `[Unreleased]` entry.

**Deliberately out of scope (deferred to Plan 3, by design):**
- **Color-usage grep scaffold** — §6 classes it as the *skill-adapted* (not vetted-as-is) script; §4.1 binds it to `design-system-audit`, its only consumer, which lands in Plan 3. Building it now would orphan it.
- **Binding-survival audit** — stays in `references/` (runs in Figma via `figma_execute`, not the repo); belongs with `token-builder`'s brownfield branch in Plan 3 (§6).
- The `design-system-audit` and `retrofit-planner` skills, and the brownfield branches of existing skills.

---

## File Map

| Action | File | What changes |
|---|---|---|
| Create | `references/crosswalk-schema.md` | Canonical crosswalk.json contract: columns, `status` enum, kebab↔camel status-count mapping, top-level shape, worked example, where the file lives, relationship to the `tokenCrosswalk` manifest section |
| Create | `scripts/crosswalk.schema.json` | JSON Schema (draft 2020-12) for `crosswalk.json` — the finalized machine contract |
| Create | `scripts/lib/crosswalk.mjs` | `loadCrosswalk(path)` (read + structural validate), `statusCounts(crosswalk)`, `STATUS_VALUES`, `STATUS_COUNT_KEY` |
| Create | `scripts/lib/crosswalk.test.mjs` | Tests for the loader: valid file, each rejection path, status-count rollup |
| Create | `scripts/validate-crosswalk.mjs` | `flattenDtcg`, `resolveValue`, `validate`, CLI `main()` — the N/N gate |
| Create | `scripts/validate-crosswalk.test.mjs` | Tests: flatten, alias resolution, pass/mismatch/missing, value normalization |
| Create | `scripts/build-reverse-index.mjs` | `buildReverseIndex`, CLI `main()` — code symbol → new token |
| Create | `scripts/build-reverse-index.test.mjs` | Tests: mapping, multi-code rows, conflict detection, stable ordering |
| Create | `scripts/guard-token-removal.mjs` | `walk`, `scanFile`, `guard`, CLI `main()` — repo-wide zero-reference grep |
| Create | `scripts/guard-token-removal.test.mjs` | Tests: finds references, honors excludes, clean tree returns empty |
| Create | `scripts/README.md` | Scripts overview, install-into-user-repo contract, `node --test` instructions |
| Create | `skills/token-crosswalk-builder/SKILL.md` | The builder skill (frontmatter + steps), owns `tokenCrosswalk` manifest section |
| Modify | `CHANGELOG.md` | `[Unreleased]` entry for the scripts + skill |

---

## The crosswalk.json contract (reference for every task below)

This is the finalized shape. All tasks must agree with it; it is reproduced in
`references/crosswalk-schema.md` (Task 1) and enforced by `scripts/lib/crosswalk.mjs` (Task 2).

```jsonc
{
  "$schema": "./crosswalk.schema.json",
  "version": 1,
  "tokens": [
    {
      "newToken": "color.text.primary",      // DTCG dot-path; matches the emitted token name
      "newValue": "#111827",                  // the RESOLVED literal value (aliases followed to a leaf)
      "tier": "semantic",                     // "primitive" | "semantic"
      "figmaOld": "Text/Default",             // old Figma variable name/path, or null if newly added
      "codeTokens": ["$text-default", "text-grey-900"], // old code identifiers this token replaces (may be [])
      "status": "renamed",                    // aligned | renamed | drift-fix | added | mapped-nearest
      "recommendedSemantic": null             // optional suggested semantic target, or null
    }
  ]
}
```

- **`newToken`** is the DTCG dot-path exactly as `token-sync-layer` emits it (e.g. `color.gray.500`, `color.text.primary`) — that is what the validator resolves against `packages/tokens/dtcg/tokens.json`.
- **`newValue`** is the **resolved leaf value** (aliases followed). For a semantic token whose `$value` is `{color.gray.900}`, `newValue` is the primitive's literal (`#111827`), not the `{…}` reference.
- **`status` enum** (kebab-case, from the case study): `aligned | renamed | drift-fix | added | mapped-nearest`.
- **Manifest `tokenCrosswalk.statusCounts` uses camelCase keys**: `aligned, renamed, driftFix, added, mappedNearest`. The kebab→camel mapping lives in `STATUS_COUNT_KEY` (Task 2) and is documented in Task 1.
- **`figmaOld`** is `null` for `added` rows (no prior Figma variable).
- **`codeTokens`** may be `[]` (e.g. an `added` token with no legacy code symbol).
- **File location:** `packages/tokens/crosswalk.json`, beside `packages/tokens/dtcg/tokens.json`. (Spec §8 shows `"tokens/crosswalk.json"` illustratively; the manifest `tokenCrosswalk.path` records the **actual** path the skill wrote, which in the standard monorepo is `packages/tokens/crosswalk.json`.)

---

## Task 1: Finalize the crosswalk schema (the contract — first, per §11)

Spec §11 is explicit: *"Finalize the `crosswalk.json` schema first. The validator and reverse-index generator depend on it; ship the schema before the scripts that consume it."* This task ships no executable code — it locks the contract every later task builds on.

**Files:**
- Create: `references/crosswalk-schema.md`
- Create: `scripts/crosswalk.schema.json`

- [ ] **Step 1.1: Create the `scripts/` directory and the JSON Schema file**

  Create `scripts/crosswalk.schema.json` with exactly this content:

  ```json
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://throughline.dev/schemas/crosswalk.schema.json",
    "title": "ThroughLine token crosswalk",
    "description": "Three-way map: new token <-> old Figma token <-> code identifier. Drives the brownfield code retrofit and the tokens:validate CI gate.",
    "type": "object",
    "required": ["version", "tokens"],
    "additionalProperties": false,
    "properties": {
      "$schema": { "type": "string" },
      "version": { "const": 1 },
      "tokens": {
        "type": "array",
        "items": { "$ref": "#/$defs/row" }
      }
    },
    "$defs": {
      "row": {
        "type": "object",
        "required": ["newToken", "newValue", "tier", "figmaOld", "codeTokens", "status"],
        "additionalProperties": false,
        "properties": {
          "newToken": { "type": "string", "minLength": 1, "description": "DTCG dot-path, e.g. color.text.primary" },
          "newValue": { "type": "string", "minLength": 1, "description": "Resolved leaf value (aliases followed)" },
          "tier": { "type": "string", "enum": ["primitive", "semantic"] },
          "figmaOld": { "type": ["string", "null"], "description": "Old Figma variable name/path, or null if newly added" },
          "codeTokens": { "type": "array", "items": { "type": "string" }, "description": "Old code identifiers this token replaces" },
          "status": { "type": "string", "enum": ["aligned", "renamed", "drift-fix", "added", "mapped-nearest"] },
          "recommendedSemantic": { "type": ["string", "null"] }
        }
      }
    }
  }
  ```

- [ ] **Step 1.2: Verify the schema file is valid JSON**

  Run (from the repo root):

  ```bash
  node -e "JSON.parse(require('fs').readFileSync('scripts/crosswalk.schema.json','utf8')); console.log('valid JSON')"
  ```

  Expected output:

  ```
  valid JSON
  ```

- [ ] **Step 1.3: Create the canonical reference doc**

  Create `references/crosswalk-schema.md` with exactly this content:

  ````markdown
  # Crosswalk schema — `crosswalk.json`

  The crosswalk is the backbone artifact of a brownfield retrofit: a persistent,
  machine-readable **three-way map** between the new token, the old Figma variable,
  and the old code identifier(s). It drives the code retrofit and the
  `tokens:validate` CI gate. Built by the `token-crosswalk-builder` skill; consumed
  by the validator and reverse-index scripts (`scripts/`). The machine contract is
  `${CLAUDE_PLUGIN_ROOT}/scripts/crosswalk.schema.json`; this doc is its prose home.

  ## Where it lives

  `packages/tokens/crosswalk.json`, beside the DTCG intermediate
  `packages/tokens/dtcg/tokens.json` that `token-sync-layer` emits. The manifest's
  `tokenCrosswalk.path` records the actual path. (Spec §8 shows `tokens/crosswalk.json`
  illustratively; the standard monorepo path is `packages/tokens/crosswalk.json`.)

  ## Top-level shape

  ```jsonc
  {
    "$schema": "./crosswalk.schema.json",
    "version": 1,
    "tokens": [ /* rows */ ]
  }
  ```

  ## Row columns

  | Field | Type | Meaning |
  | --- | --- | --- |
  | `newToken` | string | DTCG dot-path, exactly as `token-sync-layer` emits it (`color.text.primary`). This is the key the validator resolves against the DTCG tokens. |
  | `newValue` | string | The **resolved leaf value** — aliases followed to a literal. For a semantic token whose `$value` is `{color.gray.900}`, this is the primitive literal (`#111827`), never the `{…}` reference. |
  | `tier` | `"primitive"` \| `"semantic"` | Which tier the new token belongs to. |
  | `figmaOld` | string \| null | The old Figma variable name/path being reconciled, or `null` for an `added` token with no prior Figma variable. |
  | `codeTokens` | string[] | Old code identifiers this token replaces (`$primary-red`, `bg-primary-red`, `Colors.primaryRed`, `--primary-red`). May be `[]`. Drives the reverse index. |
  | `status` | enum | The reconciliation status — see below. |
  | `recommendedSemantic` | string \| null | An optional suggested semantic token to migrate a raw/primitive usage toward. |

  ## `status` enum

  Kebab-case, from the Sweet case study (151 renamed, 42 added, 12 aligned,
  3 mapped-nearest, 2 drift-fix):

  | `status` | Meaning |
  | --- | --- |
  | `aligned` | New token already matches the old one in name and value — no change needed. |
  | `renamed` | Same value, new name. The bulk of a ~90%-semantic retrofit. |
  | `drift-fix` | The old value was wrong/inconsistent; the new value intentionally differs (a deliberate fix, distinguishable from a regression via the Chromatic baseline). |
  | `added` | A new token with no prior Figma variable (`figmaOld: null`). |
  | `mapped-nearest` | No exact old equivalent; mapped to the nearest new token (a judgment call worth review). |

  ## Status-count rollup (kebab → camelCase)

  The manifest's `tokenCrosswalk.statusCounts` uses camelCase keys. The validator
  emits the rollup in this shape so the skill can copy it straight into the manifest:

  | Row `status` | `statusCounts` key |
  | --- | --- |
  | `aligned` | `aligned` |
  | `renamed` | `renamed` |
  | `drift-fix` | `driftFix` |
  | `added` | `added` |
  | `mapped-nearest` | `mappedNearest` |

  ## The validation gate

  `tokens:validate` resolves every `newToken` against `packages/tokens/dtcg/tokens.json`
  (following `{…}` alias chains to a leaf) and asserts the resolved value equals the
  row's `newValue`, for **every** row (the N/N gate — Sweet passed 210/210). Value
  comparison is case-insensitive and trimmed, so `#EF4444` and `#ef4444` are equal. A
  token present in the crosswalk but absent from the DTCG source is a failure
  (reported as *missing*), never silently skipped — this honors the read-discipline
  principle in `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`.

  ## Worked example

  ```jsonc
  {
    "$schema": "./crosswalk.schema.json",
    "version": 1,
    "tokens": [
      {
        "newToken": "color.gray.900",
        "newValue": "#111827",
        "tier": "primitive",
        "figmaOld": "grey/900",
        "codeTokens": ["$grey-900"],
        "status": "renamed",
        "recommendedSemantic": "color.text.primary"
      },
      {
        "newToken": "color.text.primary",
        "newValue": "#111827",
        "tier": "semantic",
        "figmaOld": "Text/Default",
        "codeTokens": ["$text-default", "text-grey-900"],
        "status": "renamed",
        "recommendedSemantic": null
      },
      {
        "newToken": "color.surface.raised",
        "newValue": "#ffffff",
        "tier": "semantic",
        "figmaOld": null,
        "codeTokens": [],
        "status": "added",
        "recommendedSemantic": null
      }
    ]
  }
  ```
  ````

- [ ] **Step 1.4: Self-review against the spec**

  Open `docs/superpowers/specs/2026-06-25-brownfield-retrofit-design.md` §4.2 and §8,
  and `docs/brownfield-retrofit-learnings.md` §2. Confirm:
  - The columns match §4.2 exactly: `newToken`, `newValue`, `tier`, `figmaOld`,
    `codeTokens[]`, `status`, `recommendedSemantic`.
  - The `status` enum matches: `aligned | renamed | drift-fix | added | mapped-nearest`.
  - The camelCase rollup keys match the manifest `tokenCrosswalk.statusCounts` in
    `references/manifest-schema.md` (`aligned, renamed, driftFix, added, mappedNearest`).
    Open that file and confirm the five keys are identical.
  Fix any drift inline.

- [ ] **Step 1.5: Commit**

  ```bash
  git add references/crosswalk-schema.md scripts/crosswalk.schema.json
  git commit -m "feat: finalize crosswalk.json schema (reference doc + JSON Schema)"
  ```

---

## Task 2: Shared crosswalk loader (`scripts/lib/crosswalk.mjs`)

The loader is the single place that reads and structurally validates `crosswalk.json`.
The validator and reverse-index both depend on it (DRY). It performs **zero-dependency**
structural validation mirroring the JSON Schema's `required`/`enum` rules — we do not
pull in a JSON Schema validator library; the `.schema.json` is the contract/doc, this
loader is the runtime enforcer.

**Files:**
- Create: `scripts/lib/crosswalk.mjs`
- Test: `scripts/lib/crosswalk.test.mjs`

- [ ] **Step 2.1: Write the failing test**

  Create `scripts/lib/crosswalk.test.mjs`:

  ```javascript
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { mkdtempSync, writeFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { loadCrosswalk, statusCounts, STATUS_VALUES, STATUS_COUNT_KEY } from './crosswalk.mjs';

  function writeTemp(obj) {
    const dir = mkdtempSync(join(tmpdir(), 'crosswalk-'));
    const path = join(dir, 'crosswalk.json');
    writeFileSync(path, typeof obj === 'string' ? obj : JSON.stringify(obj));
    return path;
  }

  const validRow = {
    newToken: 'color.gray.900',
    newValue: '#111827',
    tier: 'primitive',
    figmaOld: 'grey/900',
    codeTokens: ['$grey-900'],
    status: 'renamed',
    recommendedSemantic: null,
  };
  const validDoc = { version: 1, tokens: [validRow] };

  test('loads a valid crosswalk', () => {
    const cw = loadCrosswalk(writeTemp(validDoc));
    assert.equal(cw.tokens.length, 1);
    assert.equal(cw.tokens[0].newToken, 'color.gray.900');
  });

  test('rejects a missing file', () => {
    assert.throws(() => loadCrosswalk('/no/such/file.json'), /cannot read file/);
  });

  test('rejects invalid JSON', () => {
    assert.throws(() => loadCrosswalk(writeTemp('{ not json')), /invalid JSON/);
  });

  test('rejects a doc without a tokens array', () => {
    assert.throws(() => loadCrosswalk(writeTemp({ version: 1 })), /"tokens" array/);
  });

  test('rejects a bad status', () => {
    const bad = { version: 1, tokens: [{ ...validRow, status: 'frobnicated' }] };
    assert.throws(() => loadCrosswalk(writeTemp(bad)), /status must be one of/);
  });

  test('rejects a bad tier', () => {
    const bad = { version: 1, tokens: [{ ...validRow, tier: 'tertiary' }] };
    assert.throws(() => loadCrosswalk(writeTemp(bad)), /tier must be/);
  });

  test('rejects a missing required string field', () => {
    const bad = { version: 1, tokens: [{ ...validRow, newValue: '' }] };
    assert.throws(() => loadCrosswalk(writeTemp(bad)), /newValue must be a non-empty string/);
  });

  test('rejects codeTokens that is not a string array', () => {
    const bad = { version: 1, tokens: [{ ...validRow, codeTokens: [1, 2] }] };
    assert.throws(() => loadCrosswalk(writeTemp(bad)), /codeTokens must be an array of strings/);
  });

  test('allows figmaOld null for added tokens', () => {
    const added = { version: 1, tokens: [{ ...validRow, status: 'added', figmaOld: null, codeTokens: [] }] };
    assert.doesNotThrow(() => loadCrosswalk(writeTemp(added)));
  });

  test('rejects duplicate newToken', () => {
    const dup = { version: 1, tokens: [validRow, { ...validRow }] };
    assert.throws(() => loadCrosswalk(writeTemp(dup)), /duplicate newToken/);
  });

  test('rolls up status counts in camelCase', () => {
    const doc = {
      version: 1,
      tokens: [
        { ...validRow, newToken: 'a', status: 'aligned' },
        { ...validRow, newToken: 'b', status: 'renamed' },
        { ...validRow, newToken: 'c', status: 'drift-fix' },
        { ...validRow, newToken: 'd', status: 'added', figmaOld: null },
        { ...validRow, newToken: 'e', status: 'mapped-nearest' },
        { ...validRow, newToken: 'f', status: 'renamed' },
      ],
    };
    const counts = statusCounts(loadCrosswalk(writeTemp(doc)));
    assert.deepEqual(counts, { aligned: 1, renamed: 2, driftFix: 1, added: 1, mappedNearest: 1 });
  });

  test('exposes the enum and the kebab->camel map', () => {
    assert.deepEqual(STATUS_VALUES, ['aligned', 'renamed', 'drift-fix', 'added', 'mapped-nearest']);
    assert.equal(STATUS_COUNT_KEY['drift-fix'], 'driftFix');
    assert.equal(STATUS_COUNT_KEY['mapped-nearest'], 'mappedNearest');
  });
  ```

- [ ] **Step 2.2: Run the test to verify it fails**

  Run: `node --test scripts/lib/crosswalk.test.mjs`
  Expected: FAIL — `Cannot find module '.../scripts/lib/crosswalk.mjs'` (the module does not exist yet).

- [ ] **Step 2.3: Write the implementation**

  Create `scripts/lib/crosswalk.mjs`:

  ```javascript
  // Shared loader + structural validation for crosswalk.json.
  // Zero dependencies. Mirrors scripts/crosswalk.schema.json's required/enum rules.
  import { readFileSync } from 'node:fs';

  export const STATUS_VALUES = ['aligned', 'renamed', 'drift-fix', 'added', 'mapped-nearest'];

  // Row status (kebab) -> manifest tokenCrosswalk.statusCounts key (camelCase).
  export const STATUS_COUNT_KEY = {
    'aligned': 'aligned',
    'renamed': 'renamed',
    'drift-fix': 'driftFix',
    'added': 'added',
    'mapped-nearest': 'mappedNearest',
  };

  const TIERS = ['primitive', 'semantic'];

  export function loadCrosswalk(path) {
    let raw;
    try {
      raw = readFileSync(path, 'utf8');
    } catch (e) {
      throw new Error(`crosswalk: cannot read file at ${path}: ${e.message}`);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error(`crosswalk: invalid JSON in ${path}: ${e.message}`);
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.tokens)) {
      throw new Error('crosswalk: expected an object with a "tokens" array');
    }
    const seen = new Set();
    data.tokens.forEach((row, i) => validateRow(row, i, seen));
    return data;
  }

  function validateRow(row, i, seen) {
    const where = `tokens[${i}]`;
    if (!row || typeof row !== 'object') {
      throw new Error(`crosswalk: ${where} is not an object`);
    }
    for (const field of ['newToken', 'newValue', 'tier', 'status']) {
      if (typeof row[field] !== 'string' || row[field] === '') {
        throw new Error(`crosswalk: ${where}.${field} must be a non-empty string`);
      }
    }
    if (!TIERS.includes(row.tier)) {
      throw new Error(`crosswalk: ${where}.tier must be one of ${TIERS.join(', ')}, got "${row.tier}"`);
    }
    if (!STATUS_VALUES.includes(row.status)) {
      throw new Error(`crosswalk: ${where}.status must be one of ${STATUS_VALUES.join(', ')}, got "${row.status}"`);
    }
    if (!Array.isArray(row.codeTokens) || row.codeTokens.some((t) => typeof t !== 'string')) {
      throw new Error(`crosswalk: ${where}.codeTokens must be an array of strings`);
    }
    if (row.figmaOld !== null && typeof row.figmaOld !== 'string') {
      throw new Error(`crosswalk: ${where}.figmaOld must be a string or null`);
    }
    if (row.recommendedSemantic != null && typeof row.recommendedSemantic !== 'string') {
      throw new Error(`crosswalk: ${where}.recommendedSemantic must be a string or null`);
    }
    if (seen.has(row.newToken)) {
      throw new Error(`crosswalk: duplicate newToken "${row.newToken}"`);
    }
    seen.add(row.newToken);
  }

  export function statusCounts(crosswalk) {
    const counts = { aligned: 0, renamed: 0, driftFix: 0, added: 0, mappedNearest: 0 };
    for (const row of crosswalk.tokens) {
      counts[STATUS_COUNT_KEY[row.status]] += 1;
    }
    return counts;
  }
  ```

- [ ] **Step 2.4: Run the test to verify it passes**

  Run: `node --test scripts/lib/crosswalk.test.mjs`
  Expected: PASS — all assertions green (`# pass 12`, `# fail 0`).

- [ ] **Step 2.5: Commit**

  ```bash
  git add scripts/lib/crosswalk.mjs scripts/lib/crosswalk.test.mjs
  git commit -m "feat: shared crosswalk loader with structural validation + status rollup"
  ```

---

## Task 3: Crosswalk validator (`scripts/validate-crosswalk.mjs`) — the `tokens:validate` gate

Resolves every `newToken` against the DTCG token source and asserts the resolved value
equals the row's `newValue`. This is the N/N CI gate (Sweet: 210/210).

**Files:**
- Create: `scripts/validate-crosswalk.mjs`
- Test: `scripts/validate-crosswalk.test.mjs`

- [ ] **Step 3.1: Write the failing test**

  Create `scripts/validate-crosswalk.test.mjs`:

  ```javascript
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { flattenDtcg, resolveValue, validate } from './validate-crosswalk.mjs';

  const dtcg = {
    color: {
      gray: {
        900: { $value: '#111827', $type: 'color' },
      },
      text: {
        primary: { $value: '{color.gray.900}', $type: 'color' },
      },
    },
  };

  test('flattenDtcg produces dot-path keys with raw $value', () => {
    const flat = flattenDtcg(dtcg);
    assert.equal(flat['color.gray.900'], '#111827');
    assert.equal(flat['color.text.primary'], '{color.gray.900}');
  });

  test('resolveValue follows alias chains to a leaf', () => {
    const flat = flattenDtcg(dtcg);
    assert.equal(resolveValue('color.text.primary', flat), '#111827');
    assert.equal(resolveValue('color.gray.900', flat), '#111827');
  });

  test('resolveValue throws on a missing token', () => {
    assert.throws(() => resolveValue('color.nope', {}), /not found/);
  });

  test('resolveValue throws on a circular reference', () => {
    const flat = { 'a': '{b}', 'b': '{a}' };
    assert.throws(() => resolveValue('a', flat), /circular/);
  });

  test('validate passes N/N when every resolved value matches', () => {
    const crosswalk = {
      version: 1,
      tokens: [
        { newToken: 'color.gray.900', newValue: '#111827', tier: 'primitive', figmaOld: 'grey/900', codeTokens: [], status: 'renamed', recommendedSemantic: null },
        { newToken: 'color.text.primary', newValue: '#111827', tier: 'semantic', figmaOld: 'Text/Default', codeTokens: [], status: 'renamed', recommendedSemantic: null },
      ],
    };
    const r = validate(crosswalk, dtcg);
    assert.equal(r.total, 2);
    assert.equal(r.passed, 2);
    assert.equal(r.mismatches.length, 0);
    assert.equal(r.missing.length, 0);
  });

  test('validate compares case-insensitively and trims', () => {
    const crosswalk = { version: 1, tokens: [
      { newToken: 'color.gray.900', newValue: '  #111827  ', tier: 'primitive', figmaOld: null, codeTokens: [], status: 'aligned', recommendedSemantic: null },
    ]};
    // newValue with surrounding whitespace must still match the trimmed source value
    const r = validate(crosswalk, { color: { gray: { 900: { $value: '#111827' } } } });
    assert.equal(r.passed, 1);
    const rUpper = validate({ version: 1, tokens: [
      { newToken: 'color.gray.900', newValue: '#EF4444', tier: 'primitive', figmaOld: null, codeTokens: [], status: 'aligned', recommendedSemantic: null },
    ]}, { color: { gray: { 900: { $value: '#ef4444' } } } });
    assert.equal(rUpper.passed, 1);
  });

  test('validate reports a mismatch', () => {
    const crosswalk = { version: 1, tokens: [
      { newToken: 'color.gray.900', newValue: '#000000', tier: 'primitive', figmaOld: null, codeTokens: [], status: 'drift-fix', recommendedSemantic: null },
    ]};
    const r = validate(crosswalk, dtcg);
    assert.equal(r.passed, 0);
    assert.equal(r.mismatches.length, 1);
    assert.equal(r.mismatches[0].token, 'color.gray.900');
    assert.equal(r.mismatches[0].expected, '#000000');
    assert.equal(r.mismatches[0].actual, '#111827');
  });

  test('validate reports a token missing from the DTCG source', () => {
    const crosswalk = { version: 1, tokens: [
      { newToken: 'color.ghost', newValue: '#fff', tier: 'primitive', figmaOld: null, codeTokens: [], status: 'added', recommendedSemantic: null },
    ]};
    const r = validate(crosswalk, dtcg);
    assert.deepEqual(r.missing, ['color.ghost']);
    assert.equal(r.passed, 0);
  });
  ```

- [ ] **Step 3.2: Run the test to verify it fails**

  Run: `node --test scripts/validate-crosswalk.test.mjs`
  Expected: FAIL — `Cannot find module '.../scripts/validate-crosswalk.mjs'`.

- [ ] **Step 3.3: Write the implementation**

  Create `scripts/validate-crosswalk.mjs`:

  ```javascript
  // Crosswalk validator: resolved DTCG value == crosswalk newValue, for every row.
  // The tokens:validate CI gate. Zero dependencies.
  //
  // Usage:
  //   node validate-crosswalk.mjs --crosswalk crosswalk.json --tokens dtcg/tokens.json
  import { readFileSync } from 'node:fs';
  import { parseArgs } from 'node:util';
  import { pathToFileURL } from 'node:url';
  import { loadCrosswalk, statusCounts } from './lib/crosswalk.mjs';

  const REF = /^\{([^}]+)\}$/;

  // Flatten nested DTCG groups into { "dot.path": rawValue }. Skips $-prefixed meta keys.
  export function flattenDtcg(obj, prefix = [], out = {}) {
    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('$')) continue;
      if (val && typeof val === 'object' && '$value' in val) {
        out[[...prefix, key].join('.')] = val.$value;
      } else if (val && typeof val === 'object') {
        flattenDtcg(val, [...prefix, key], out);
      }
    }
    return out;
  }

  // Follow {alias} chains to a leaf literal. Throws on missing or circular refs.
  export function resolveValue(name, flat, seen = new Set()) {
    if (!(name in flat)) throw new Error(`token "${name}" not found in DTCG source`);
    const val = flat[name];
    if (typeof val === 'string') {
      const m = val.match(REF);
      if (m) {
        if (seen.has(name)) throw new Error(`circular reference at "${name}"`);
        seen.add(name);
        return resolveValue(m[1], flat, seen);
      }
    }
    return val;
  }

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
  ```

- [ ] **Step 3.4: Run the test to verify it passes**

  Run: `node --test scripts/validate-crosswalk.test.mjs`
  Expected: PASS (`# pass 8`, `# fail 0`).

- [ ] **Step 3.5: Smoke-test the CLI with the doc's worked example**

  Create a scratch DTCG file and a scratch crosswalk, then run the CLI to confirm
  it prints the N/N line and the camelCase counts, and exits 0:

  ```bash
  cat > /tmp/dtcg.json <<'JSON'
  { "color": { "gray": { "900": { "$value": "#111827" } }, "text": { "primary": { "$value": "{color.gray.900}" } } } }
  JSON
  cat > /tmp/crosswalk.json <<'JSON'
  { "version": 1, "tokens": [
    { "newToken": "color.gray.900", "newValue": "#111827", "tier": "primitive", "figmaOld": "grey/900", "codeTokens": ["$grey-900"], "status": "renamed", "recommendedSemantic": null },
    { "newToken": "color.text.primary", "newValue": "#111827", "tier": "semantic", "figmaOld": "Text/Default", "codeTokens": ["$text-default"], "status": "renamed", "recommendedSemantic": null }
  ] }
  JSON
  node scripts/validate-crosswalk.mjs --crosswalk /tmp/crosswalk.json --tokens /tmp/dtcg.json; echo "exit=$?"
  ```

  Expected output (last lines):

  ```
  tokens:validate — 2/2 resolved values match
  status counts: {"aligned":0,"renamed":2,"driftFix":0,"added":0,"mappedNearest":0}
  exit=0
  ```

- [ ] **Step 3.6: Commit**

  ```bash
  git add scripts/validate-crosswalk.mjs scripts/validate-crosswalk.test.mjs
  git commit -m "feat: crosswalk validator — N/N resolved-value gate (tokens:validate)"
  ```

---

## Task 4: Reverse-index generator (`scripts/build-reverse-index.mjs`)

Emits a `codeToken → newToken` map from the crosswalk to semi-automate the SCSS/Tailwind
swaps. Detects conflicts (one old symbol mapping to two different new tokens).

**Files:**
- Create: `scripts/build-reverse-index.mjs`
- Test: `scripts/build-reverse-index.test.mjs`

- [ ] **Step 4.1: Write the failing test**

  Create `scripts/build-reverse-index.test.mjs`:

  ```javascript
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { buildReverseIndex } from './build-reverse-index.mjs';

  test('maps each codeToken to its newToken', () => {
    const cw = { version: 1, tokens: [
      { newToken: 'color.text.primary', codeTokens: ['$text-default', 'text-grey-900'], newValue: '#111827', tier: 'semantic', figmaOld: null, status: 'renamed', recommendedSemantic: null },
    ]};
    const { index, conflicts } = buildReverseIndex(cw);
    assert.equal(index['$text-default'], 'color.text.primary');
    assert.equal(index['text-grey-900'], 'color.text.primary');
    assert.equal(conflicts.length, 0);
  });

  test('two code symbols can map to the same new token without conflict', () => {
    const cw = { version: 1, tokens: [
      { newToken: 'color.gray.900', codeTokens: ['$grey-900', '$gray-900'], newValue: '#111827', tier: 'primitive', figmaOld: null, status: 'renamed', recommendedSemantic: null },
    ]};
    const { conflicts } = buildReverseIndex(cw);
    assert.equal(conflicts.length, 0);
  });

  test('flags a code symbol mapping to two different new tokens', () => {
    const cw = { version: 1, tokens: [
      { newToken: 'color.gray.900', codeTokens: ['$x'], newValue: '#111827', tier: 'primitive', figmaOld: null, status: 'renamed', recommendedSemantic: null },
      { newToken: 'color.gray.800', codeTokens: ['$x'], newValue: '#1f2937', tier: 'primitive', figmaOld: null, status: 'renamed', recommendedSemantic: null },
    ]};
    const { conflicts } = buildReverseIndex(cw);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].codeToken, '$x');
    assert.deepEqual(conflicts[0].tokens, ['color.gray.900', 'color.gray.800']);
  });

  test('emits keys sorted longest-first (safe find-and-replace ordering)', () => {
    const cw = { version: 1, tokens: [
      { newToken: 'color.a', codeTokens: ['$blue'], newValue: '#1', tier: 'primitive', figmaOld: null, status: 'renamed', recommendedSemantic: null },
      { newToken: 'color.b', codeTokens: ['$blue-100'], newValue: '#2', tier: 'primitive', figmaOld: null, status: 'renamed', recommendedSemantic: null },
    ]};
    const { index } = buildReverseIndex(cw);
    assert.deepEqual(Object.keys(index), ['$blue-100', '$blue']);
  });

  test('skips rows with no codeTokens', () => {
    const cw = { version: 1, tokens: [
      { newToken: 'color.surface.raised', codeTokens: [], newValue: '#fff', tier: 'semantic', figmaOld: null, status: 'added', recommendedSemantic: null },
    ]};
    const { index } = buildReverseIndex(cw);
    assert.deepEqual(index, {});
  });
  ```

- [ ] **Step 4.2: Run the test to verify it fails**

  Run: `node --test scripts/build-reverse-index.test.mjs`
  Expected: FAIL — `Cannot find module '.../scripts/build-reverse-index.mjs'`.

- [ ] **Step 4.3: Write the implementation**

  Create `scripts/build-reverse-index.mjs`:

  ```javascript
  // Reverse-index generator: codeToken -> newToken, from crosswalk.json.
  // Semi-automates the SCSS/Tailwind swaps. Zero dependencies.
  //
  // Usage:
  //   node build-reverse-index.mjs --crosswalk crosswalk.json --out crosswalk.reverse.json
  import { writeFileSync } from 'node:fs';
  import { parseArgs } from 'node:util';
  import { pathToFileURL } from 'node:url';
  import { loadCrosswalk } from './lib/crosswalk.mjs';

  export function buildReverseIndex(crosswalk) {
    const raw = {};
    const conflicts = [];
    for (const row of crosswalk.tokens) {
      for (const code of row.codeTokens) {
        if (code in raw && raw[code] !== row.newToken) {
          conflicts.push({ codeToken: code, tokens: [raw[code], row.newToken] });
        } else {
          raw[code] = row.newToken;
        }
      }
    }
    // Sort keys longest-first so a literal find-and-replace can't clobber a longer
    // symbol via a shorter substring (e.g. replace "$blue-100" before "$blue").
    const index = {};
    for (const key of Object.keys(raw).sort((a, b) => b.length - a.length || a.localeCompare(b))) {
      index[key] = raw[key];
    }
    return { index, conflicts };
  }

  function main() {
    const { values } = parseArgs({
      options: {
        crosswalk: { type: 'string' },
        out: { type: 'string' },
      },
    });
    if (!values.crosswalk || !values.out) {
      console.error('usage: build-reverse-index.mjs --crosswalk <crosswalk.json> --out <reverse.json>');
      process.exit(2);
    }
    const crosswalk = loadCrosswalk(values.crosswalk);
    const { index, conflicts } = buildReverseIndex(crosswalk);
    writeFileSync(values.out, JSON.stringify(index, null, 2) + '\n');
    console.log(`reverse index: ${Object.keys(index).length} code symbol(s) -> ${values.out}`);
    if (conflicts.length) {
      console.error(`\n${conflicts.length} conflict(s) — one code symbol maps to multiple new tokens:`);
      for (const c of conflicts) console.error(`  - ${c.codeToken}: ${c.tokens.join(' vs ')}`);
      process.exit(1);
    }
  }

  if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
  }
  ```

- [ ] **Step 4.4: Run the test to verify it passes**

  Run: `node --test scripts/build-reverse-index.test.mjs`
  Expected: PASS (`# pass 5`, `# fail 0`).

- [ ] **Step 4.5: Commit**

  ```bash
  git add scripts/build-reverse-index.mjs scripts/build-reverse-index.test.mjs
  git commit -m "feat: reverse-index generator — code symbol to new token map"
  ```

---

## Task 5: Repo-wide token-removal guard (`scripts/guard-token-removal.mjs`)

Greps all `.ts/.tsx` (minus generated + tests) for references to about-to-be-deleted
symbols. Deleted Tailwind utilities become silent no-ops that `tsc`/build won't catch
(guardrail 4), so cleanup must not proceed until this returns zero references.

**Files:**
- Create: `scripts/guard-token-removal.mjs`
- Test: `scripts/guard-token-removal.test.mjs`

- [ ] **Step 5.1: Write the failing test**

  Create `scripts/guard-token-removal.test.mjs`:

  ```javascript
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { guard, scanFile } from './guard-token-removal.mjs';

  function fixtureTree() {
    const root = mkdtempSync(join(tmpdir(), 'guard-'));
    writeFileSync(join(root, 'app.tsx'), 'const x = "bg-primary-red";\nconst y = 1;\n');
    writeFileSync(join(root, 'clean.ts'), 'const z = "bg-surface";\n');
    mkdirSync(join(root, 'generated'), { recursive: true });
    writeFileSync(join(root, 'generated', 'tokens.ts'), 'export const c = "bg-primary-red";\n');
    writeFileSync(join(root, 'app.test.tsx'), 'expect("bg-primary-red").toBe(x);\n');
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'pkg', 'index.ts'), 'const m = "bg-primary-red";\n');
    return root;
  }

  test('scanFile reports each line containing a symbol', () => {
    const root = fixtureTree();
    const hits = scanFile(join(root, 'app.tsx'), ['bg-primary-red']);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, 1);
    assert.equal(hits[0].symbol, 'bg-primary-red');
  });

  test('guard finds references in source, ignoring generated/tests/node_modules', () => {
    const root = fixtureTree();
    const findings = guard(root, ['bg-primary-red']);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'app.tsx');
    assert.equal(findings[0].symbol, 'bg-primary-red');
  });

  test('guard returns empty when no source references remain', () => {
    const root = fixtureTree();
    const findings = guard(root, ['bg-does-not-exist']);
    assert.deepEqual(findings, []);
  });

  test('guard scans multiple symbols at once', () => {
    const root = fixtureTree();
    const findings = guard(root, ['bg-primary-red', 'bg-surface']);
    const files = findings.map((f) => f.file).sort();
    assert.deepEqual(files, ['app.tsx', 'clean.ts']);
  });
  ```

- [ ] **Step 5.2: Run the test to verify it fails**

  Run: `node --test scripts/guard-token-removal.test.mjs`
  Expected: FAIL — `Cannot find module '.../scripts/guard-token-removal.mjs'`.

- [ ] **Step 5.3: Write the implementation**

  Create `scripts/guard-token-removal.mjs`:

  ```javascript
  // Repo-wide token-removal guard: grep .ts/.tsx (minus generated + tests) for
  // references to about-to-be-deleted symbols. Zero dependencies.
  //
  // Cleanup must not proceed until this returns zero references — deleted Tailwind
  // utilities become silent no-ops that tsc/build will not catch (guardrail 4).
  //
  // Usage:
  //   node guard-token-removal.mjs --root <dir> --symbols <symbols.txt>
  //     symbols file: one symbol per line (blank lines and # comments ignored)
  import { readFileSync, readdirSync, statSync } from 'node:fs';
  import { join, relative } from 'node:path';
  import { parseArgs } from 'node:util';
  import { pathToFileURL } from 'node:url';

  export const DEFAULT_EXCLUDES = [
    /(^|\/)node_modules(\/|$)/,
    /(^|\/)generated(\/|$)/,
    /\.generated\./,
    /\.test\./,
    /\.spec\./,
    /(^|\/)__tests__(\/|$)/,
    /(^|\/)dist(\/|$)/,
    /(^|\/)\.next(\/|$)/,
  ];

  export function* walk(root, excludes = DEFAULT_EXCLUDES) {
    for (const entry of readdirSync(root)) {
      const full = join(root, entry);
      if (excludes.some((re) => re.test(full))) continue;
      const st = statSync(full);
      if (st.isDirectory()) {
        yield* walk(full, excludes);
      } else if (/\.tsx?$/.test(full)) {
        yield full;
      }
    }
  }

  export function scanFile(path, symbols) {
    const lines = readFileSync(path, 'utf8').split('\n');
    const hits = [];
    lines.forEach((line, i) => {
      for (const sym of symbols) {
        if (line.includes(sym)) {
          hits.push({ line: i + 1, symbol: sym, text: line.trim() });
        }
      }
    });
    return hits;
  }

  export function guard(root, symbols, excludes = DEFAULT_EXCLUDES) {
    const findings = [];
    for (const file of walk(root, excludes)) {
      for (const hit of scanFile(file, symbols)) {
        findings.push({ file: relative(root, file), ...hit });
      }
    }
    return findings;
  }

  function readSymbols(path) {
    return readFileSync(path, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  }

  function main() {
    const { values } = parseArgs({
      options: {
        root: { type: 'string' },
        symbols: { type: 'string' },
      },
    });
    if (!values.root || !values.symbols) {
      console.error('usage: guard-token-removal.mjs --root <dir> --symbols <symbols.txt>');
      process.exit(2);
    }
    const symbols = readSymbols(values.symbols);
    const findings = guard(values.root, symbols);
    if (findings.length === 0) {
      console.log(`token-removal guard: 0 references to ${symbols.length} symbol(s) — safe to remove.`);
      return;
    }
    console.error(`token-removal guard: ${findings.length} remaining reference(s) — do NOT remove yet:`);
    for (const f of findings) {
      console.error(`  ${f.file}:${f.line}  ${f.symbol}  | ${f.text}`);
    }
    process.exit(1);
  }

  if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
  }
  ```

- [ ] **Step 5.4: Run the test to verify it passes**

  Run: `node --test scripts/guard-token-removal.test.mjs`
  Expected: PASS (`# pass 4`, `# fail 0`).

- [ ] **Step 5.5: Run the full script test suite**

  Run (from the repo root): `node --test`
  Expected: all test files discovered recursively and green — `# tests 31`,
  `# pass 31`, `# fail 0` (14 loader + 8 validator + 5 reverse-index + 4 guard).
  Note: use bare `node --test` (auto-discovers `**/*.test.mjs`); `node --test scripts/`
  errors on Node ≥21 because a directory positional is treated as a test name, and a
  `scripts/*.test.mjs` glob misses the `scripts/lib/` subdirectory. This is the command
  the README documents and the plugin should run before shipping script edits.

- [ ] **Step 5.6: Commit**

  ```bash
  git add scripts/guard-token-removal.mjs scripts/guard-token-removal.test.mjs
  git commit -m "feat: repo-wide token-removal guard — zero-reference grep before cleanup"
  ```

---

## Task 6: Scripts README

Document what the scripts are, the install-into-user-repo contract the skill follows,
and how to run the tests.

**Files:**
- Create: `scripts/README.md`

- [ ] **Step 6.1: Create the README**

  Create `scripts/README.md` with exactly this content:

  ````markdown
  # ThroughLine scripts

  The executable analog of `references/`: canonical, vetted, **zero-dependency** Node
  (ESM) scripts that the brownfield skills install into a user's monorepo. Authored and
  tested here; copied verbatim by `token-crosswalk-builder` into the user's
  `packages/tokens/scripts/`.

  | Script | Purpose | Installed as |
  | --- | --- | --- |
  | `validate-crosswalk.mjs` | Resolve every `newToken` against the DTCG token source; assert resolved value == `newValue`, N/N. The CI gate. | `tokens:validate` |
  | `build-reverse-index.mjs` | Emit a `codeToken -> newToken` map from the crosswalk to semi-automate SCSS/Tailwind swaps. | `tokens:reverse-index` |
  | `guard-token-removal.mjs` | Grep `.ts/.tsx` (minus generated + tests) for about-to-be-deleted symbols; blocks cleanup until zero references remain. | run during the cleanup phase |
  | `lib/crosswalk.mjs` | Shared loader + structural validation for `crosswalk.json` (used by the validator and reverse-index). | copied alongside |
  | `crosswalk.schema.json` | The finalized JSON Schema for `crosswalk.json` (contract + editor support). | copied beside `crosswalk.json` |

  The crosswalk contract is documented in
  `${CLAUDE_PLUGIN_ROOT}/references/crosswalk-schema.md`.

  ## Usage

  ```bash
  node validate-crosswalk.mjs --crosswalk crosswalk.json --tokens dtcg/tokens.json
  node build-reverse-index.mjs --crosswalk crosswalk.json --out crosswalk.reverse.json
  node guard-token-removal.mjs --root . --symbols symbols-to-remove.txt
  ```

  Exit codes: `0` success, `1` validation/guard failure (mismatch, missing token,
  conflict, or remaining reference), `2` bad CLI arguments.

  ## How the skill installs these

  `token-crosswalk-builder` copies `lib/crosswalk.mjs`, `validate-crosswalk.mjs`,
  `build-reverse-index.mjs`, `guard-token-removal.mjs`, and `crosswalk.schema.json`
  into the user's `packages/tokens/scripts/` (schema beside `crosswalk.json`), then
  wires `packages/tokens/package.json`:

  ```jsonc
  "scripts": {
    "tokens:validate": "node scripts/validate-crosswalk.mjs --crosswalk crosswalk.json --tokens dtcg/tokens.json",
    "tokens:reverse-index": "node scripts/build-reverse-index.mjs --crosswalk crosswalk.json --out crosswalk.reverse.json"
  }
  ```

  The scripts version with the user's repo so their CI runs them locally — a path
  inside the plugin install would not be reachable from the user's CI.

  ## Tests

  Run the suite from the repo root (no install step — uses only Node built-ins):

  ```bash
  node --test
  ```

  This auto-discovers every `**/*.test.mjs` recursively (31 tests). Don't use
  `node --test scripts/` — a directory positional is treated as a test name on
  Node ≥21 and errors; a `scripts/*.test.mjs` glob silently skips `scripts/lib/`.
  ````

- [ ] **Step 6.2: Commit**

  ```bash
  git add scripts/README.md
  git commit -m "docs: scripts README — purpose, install contract, test command"
  ```

---

## Task 7: The `token-crosswalk-builder` skill

The backbone skill. Builds `crosswalk.json`, installs the vetted scripts into the user's
monorepo, wires `tokens:validate`, runs it green, and writes the `tokenCrosswalk`
manifest section it owns. A `retrofit-planner` sub-skill — no slash command (mirrors
`component-builder`).

**Files:**
- Create: `skills/token-crosswalk-builder/SKILL.md`

- [ ] **Step 7.1: Create the skill**

  Create `skills/token-crosswalk-builder/SKILL.md` with exactly this content:

  ````markdown
  ---
  name: token-crosswalk-builder
  description: Build the brownfield token crosswalk — a persistent three-way map between each new token, the old Figma variable, and the old code identifier(s) — as crosswalk.json, then install the vetted validator/reverse-index scripts into the monorepo and wire the tokens:validate CI gate. Use this when retrofitting a design system onto a mature codebase, when the user wants to map old tokens to new ones, build a crosswalk, set up tokens:validate, or generate a reverse index for SCSS/Tailwind swaps. Also trigger when retrofit-planner reaches the crosswalk stage, or after design-system-audit has sized the retrofit. Make sure to use this whenever someone needs the machine-readable backbone that drives a brownfield code retrofit and its validation gate.
  ---

  # Token crosswalk builder

  Builds the **backbone artifact** of a brownfield retrofit: `crosswalk.json`, a
  persistent three-way map of **new token ↔ old Figma variable ↔ old code identifier**.
  It drives the code retrofit and the `tokens:validate` CI gate. This skill also
  installs the canonical scripts into the user's repo and wires the gate.

  This is a brownfield skill. **Before doing anything, read**
  `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md` (read discipline, the 7
  guardrails, the safe sequence) and
  `${CLAUDE_PLUGIN_ROOT}/references/crosswalk-schema.md` (the exact contract). Greenfield
  builds don't need this skill.

  ## Calibrate

  Read `user.codingLevel` (`${CLAUDE_PLUGIN_ROOT}/references/coding-level.md`) and scale
  explanation accordingly. The crosswalk involves JSON, npm scripts, and a CI gate — for
  `new` users explain each plainly the first time; for `comfortable` users be terse.
  Actions are identical across levels.

  ## Prerequisites (offer to run them, don't bail)

  Read the manifest. This skill needs:

  1. **A DTCG token source** at `packages/tokens/dtcg/tokens.json` — the validator
     resolves against it. If it doesn't exist, offer to run `token-sync-layer` first
     (it emits this file). Apply the read discipline: confirm the file exists by
     reading it, never assume it's absent without looking.
  2. **The audit inputs** — ideally the `audit` manifest section (code surface,
     Figma inventory, `percentSemantic`) populated by `design-system-audit`. If
     `audit` is present, use it to seed the rows. If it is `null` (audit hasn't run —
     it lands in Plan 3), don't block: ask the user for the old→new mapping inputs
     directly (which old Figma variables and code symbols map to which new tokens),
     and proceed. Note plainly that running `design-system-audit` first would
     pre-fill this.
  3. **A repo at `local-git` or `github`** (`workspace.stage`) so the installed
     scripts and `package.json` changes land as a reviewable diff/PR. If still
     `folder`, offer `repository-builder`.

  ## Step 1 — Build `crosswalk.json`

  Write `packages/tokens/crosswalk.json` per the contract in
  `${CLAUDE_PLUGIN_ROOT}/references/crosswalk-schema.md`. One row per new token:

  - `newToken` — the DTCG dot-path exactly as it appears in
    `packages/tokens/dtcg/tokens.json` (e.g. `color.text.primary`).
  - `newValue` — the **resolved** leaf value (follow `{…}` aliases to the literal).
  - `tier` — `primitive` or `semantic`.
  - `figmaOld` — the old Figma variable name/path, or `null` if newly added.
  - `codeTokens[]` — the old code identifiers this token replaces (`$primary-red`,
    `bg-primary-red`, `Colors.primaryRed`, `--primary-red`). May be `[]`.
  - `status` — `aligned | renamed | drift-fix | added | mapped-nearest`. Assign by:
    same name & value → `aligned`; same value, new name → `renamed`; value
    intentionally changed → `drift-fix`; brand-new token → `added`; no exact old
    equivalent, mapped to nearest → `mapped-nearest`.
  - `recommendedSemantic` — optional semantic target for a raw/primitive usage, else
    `null`.

  Do not guess values. Every `newValue` comes from a read of the DTCG source, not an
  assumption (read discipline).

  ## Step 2 — Install the vetted scripts + wire `tokens:validate`

  Copy these from `${CLAUDE_PLUGIN_ROOT}/scripts/` into the user's repo **verbatim**
  (they are zero-dependency and version with the user's repo so their CI can run them):

  - `lib/crosswalk.mjs` → `packages/tokens/scripts/lib/crosswalk.mjs`
  - `validate-crosswalk.mjs` → `packages/tokens/scripts/validate-crosswalk.mjs`
  - `build-reverse-index.mjs` → `packages/tokens/scripts/build-reverse-index.mjs`
  - `guard-token-removal.mjs` → `packages/tokens/scripts/guard-token-removal.mjs`
  - `crosswalk.schema.json` → `packages/tokens/crosswalk.schema.json` (beside
    `crosswalk.json`, so the `$schema` pointer resolves)

  Then add to `packages/tokens/package.json` `scripts` (don't clobber existing keys):

  ```jsonc
  "tokens:validate": "node scripts/validate-crosswalk.mjs --crosswalk crosswalk.json --tokens dtcg/tokens.json",
  "tokens:reverse-index": "node scripts/build-reverse-index.mjs --crosswalk crosswalk.json --out crosswalk.reverse.json"
  ```

  See `${CLAUDE_PLUGIN_ROOT}/scripts/README.md` for the full install contract.

  ## Step 3 — Run the gate (must pass N/N)

  Run `npm run tokens:validate` (from `packages/tokens/`). It must report **N/N** —
  every row's resolved value matches its `newValue`. If it reports mismatches or
  missing tokens, fix the crosswalk (or the token source) and re-run. **Never proceed
  on a red validator and never edit a generated token file to make it pass** — change
  the source in Figma and re-sync (guardrail 7). The validator is the source of truth
  that the crosswalk and the real tokens agree.

  ## Step 4 — Generate the reverse index

  Run `npm run tokens:reverse-index`. This writes `crosswalk.reverse.json`
  (`codeToken → newToken`), which the code-retrofit phase uses to semi-automate the
  SCSS/Tailwind swaps. If it reports conflicts (one old symbol mapping to two new
  tokens), resolve them in the crosswalk before relying on the index.

  ## Step 5 — Update the manifest

  Write the `tokenCrosswalk` section **only** (this skill owns it; never write another
  skill's fields):

  - `path` — the actual path written (`"packages/tokens/crosswalk.json"`).
  - `statusCounts` — copy the camelCase object the validator printed
    (`{ aligned, renamed, driftFix, added, mappedNearest }`).
  - `validatorPassing` — `true` once `tokens:validate` passes N/N.

  Append `token-crosswalk-builder` to `completedSkills`.

  ## What this skill must NOT do

  - Never delete old tokens or outputs here — that's the cleanup phase, gated by the
    token-removal guard returning zero references (safe sequence, guardrail 4).
  - Never edit generated token files to make the validator pass — fix the source.
  - Never write another skill's manifest fields (e.g. `tokens.intakeMode` is owned by
    `design-system-audit`).
  - Never proceed past a red `tokens:validate`.
  - Never assert a prerequisite is absent without a verified read (read discipline).
  ````

- [ ] **Step 7.2: Self-review the skill against the spec**

  Open spec §4.2 and confirm the skill delivers: the three-way map with the exact
  columns; the `status` enum; the reverse index; the `tokens:validate` N/N gate. Open
  §8 and confirm the skill writes only `tokenCrosswalk.{path, statusCounts,
  validatorPassing}` and appends to `completedSkills` (ownership honored — it does NOT
  set `tokens.intakeMode`). Confirm the frontmatter `name` matches the directory name
  (`token-crosswalk-builder`) and the description trigger-phrasing matches house style
  (compare to `skills/token-sync-layer/SKILL.md`). Fix any drift inline.

- [ ] **Step 7.3: Commit**

  ```bash
  git add skills/token-crosswalk-builder/SKILL.md
  git commit -m "feat: token-crosswalk-builder skill — build crosswalk, install scripts, wire tokens:validate"
  ```

---

## Task 8: CHANGELOG + plugin-level self-review

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 8.1: Add the `[Unreleased]` entry**

  Open `CHANGELOG.md` and read the existing `[Unreleased]` section (it carries the
  Plan 1 brownfield entries). Add, under the appropriate `### Added` heading in
  `[Unreleased]` (create the heading only if absent — match the existing structure),
  these bullets:

  ```markdown
  - **`scripts/` directory** — the plugin's first executable code: canonical,
    zero-dependency Node (ESM) scripts for brownfield retrofits, tested with
    `node --test`.
    - `validate-crosswalk.mjs` — the `tokens:validate` CI gate (resolved value ==
      new value, N/N).
    - `build-reverse-index.mjs` — code symbol → new token map for semi-automated
      SCSS/Tailwind swaps.
    - `guard-token-removal.mjs` — repo-wide zero-reference grep that blocks cleanup
      while any reference to an about-to-be-deleted symbol remains.
    - `lib/crosswalk.mjs` — shared loader + structural validation.
  - **`crosswalk.json` schema** — finalized contract: `references/crosswalk-schema.md`
    (prose) + `scripts/crosswalk.schema.json` (JSON Schema).
  - **`token-crosswalk-builder` skill** — builds the new-token ↔ old-Figma ↔ old-code
    crosswalk, installs the vetted scripts into `packages/tokens/`, wires
    `tokens:validate`, and owns the `tokenCrosswalk` manifest section.
  ```

- [ ] **Step 8.2: Verify the full script test suite passes**

  Run (from the repo root): `node --test`
  Expected: all files green — `# tests 31`, `# pass 31`, `# fail 0`.

- [ ] **Step 8.3: Verify the JSON Schema and the doc example are valid JSON**

  ```bash
  node -e "JSON.parse(require('fs').readFileSync('scripts/crosswalk.schema.json','utf8')); console.log('schema OK')"
  ```

  Expected: `schema OK`.

- [ ] **Step 8.4: Commit**

  ```bash
  git add CHANGELOG.md
  git commit -m "docs: CHANGELOG [Unreleased] — scripts dir, crosswalk schema, token-crosswalk-builder"
  ```

---

## Self-Review (run after all tasks)

**1. Spec coverage** (against `docs/superpowers/specs/2026-06-25-brownfield-retrofit-design.md`):
- §4.2 `token-crosswalk-builder` — three-way map, exact columns, `status` enum, reverse
  index, `tokens:validate` N/N gate, owns `tokenCrosswalk` → Tasks 1, 4, 7. ✓
- §6 canonical scripts — crosswalk validator, reverse-index generator, token-removal
  guard, shipped vetted → Tasks 3, 4, 5. ✓
- §6 color-usage grep scaffold + binding-survival audit → **deferred to Plan 3** (see
  Scope & boundaries; tied to `design-system-audit` / `token-builder` brownfield
  branch). Confirm none of Plan 2's deliverables silently depend on them — they do not.
- §8 manifest `tokenCrosswalk.{path, statusCounts, validatorPassing}` — written by the
  skill (Task 7), camelCase counts produced by the validator (Task 3) and rolled up by
  the loader (Task 2). The five `statusCounts` keys match `references/manifest-schema.md`. ✓
- §11 Plan-2 risks: "finalize the crosswalk schema first" → Task 1 precedes every
  consuming script. ✓ "ship vetted scripts is only partly achievable / log what's
  assumed vs detected" → applies to the color-usage grep, which is deferred to Plan 3;
  the three canonical scripts shipped here are genuinely generalizable (schema/arg-driven). ✓

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later". Every code step shows
complete, runnable code; every run step shows the exact command and expected output.

**3. Type/name consistency:**
- `status` enum is identical across the schema JSON (Task 1), `STATUS_VALUES` (Task 2),
  the reference doc (Task 1), and the skill (Task 7): `aligned, renamed, drift-fix,
  added, mapped-nearest`.
- `STATUS_COUNT_KEY` / `statusCounts` camelCase keys (`aligned, renamed, driftFix,
  added, mappedNearest`) are identical in Task 2, the validator output (Task 3), the
  reference doc (Task 1), and the skill's manifest write (Task 7).
- Exported function names referenced in tests match their modules: `loadCrosswalk`,
  `statusCounts`, `STATUS_VALUES`, `STATUS_COUNT_KEY` (Task 2); `flattenDtcg`,
  `resolveValue`, `validate` (Task 3); `buildReverseIndex` (Task 4); `walk`, `scanFile`,
  `guard`, `DEFAULT_EXCLUDES` (Task 5).
- Field names (`newToken`, `newValue`, `tier`, `figmaOld`, `codeTokens`, `status`,
  `recommendedSemantic`) are identical across the schema, loader validation, every test
  fixture, and the skill.
- Installed paths agree: `packages/tokens/scripts/...`, `packages/tokens/crosswalk.json`,
  `packages/tokens/dtcg/tokens.json` in Task 6 (README), Task 7 (skill), and the
  `tokens:validate` wiring.

---

## Execution Handoff

Plan 2 of 3. After this ships, Plan 3 (the `design-system-audit` and `retrofit-planner`
skills, the color-usage grep scaffold + binding-survival audit, brownfield branches in
`token-builder`/`token-sync-layer`/`storybook-chromatic-builder`, env-setup
routing+baseline, the decision journal, and the B3 behavioral fix) gets written and
executed in turn.

**Critical dependency note:** Plan 2 builds on Plan 1 (manifest v4 `tokenCrosswalk`
section + `references/brownfield-retrofit.md`), which currently lives on the PR #12
branch. This worktree already has those artifacts present, so execution can proceed
here; if executing elsewhere, branch off the Plan 1 branch, not a stale `main`.
