# Component Documentation Layer ("ThroughLine Docs") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Figma/code component a structured, AI-first usage doc — authored once into a folder-resident canonical file, rendered to Figma description fields, the doc card, Storybook autodocs, and an AI digest, and kept in sync by a drift gate — covering both greenfield and brownfield.

**Architecture:** A canonical JSON record per component (`design-system/docs/components/<Name>.doc.json`) is the single source of truth. Zero-dependency Node scripts fingerprint it, aggregate it into an AI digest, and gate drift (`docs:check`). Skills author the record (Figma phase) and render it to code surfaces (code phase); the manifest stores pointers + per-surface fingerprints, never content.

**Tech Stack:** Node ≥20 (built-in `node:test`, `node:crypto`), zero third-party dependencies. Markdown skills/references/commands. Figma Console MCP. Style-Dictionary/Storybook already present downstream.

## Global Constraints

- **Zero runtime dependencies** in every `scripts/*.mjs` — stdlib only (matches every existing script). No YAML parser exists, which is why the canonical record is **JSON**, not YAML.
- **Deviation from the spec (flagged):** spec §"Content model" shows the record as YAML; this plan uses **JSON** (`<Name>.doc.json`) so the zero-dep toolchain can parse it. Same fields, same semantics.
- **Scripts are pure-functions + a CLI guard.** Every script exports its logic and guards its CLI with `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)`. Every script has a colocated `*.test.mjs`.
- **Tests run via bare `node --test`** from the repo root (never `node --test ci/`). No `package.json` `scripts` field.
- **CI gates that must stay green:** `node --test`, `node ci/validate-plugin.mjs`, `node ci/validate-skills.mjs`, `node scripts/adapters/generate.mjs --check`.
- **Any skill/command edit REQUIRES regenerating adapters** (`node scripts/adapters/generate.mjs`) and committing the regenerated `adapters/` tree, or CI's `--check` fails.
- **Skill file conventions:** `skills/<name>/SKILL.md`, frontmatter is exactly `name` (== dir) + `description` (≤ 1024 chars). Body uses `## Step N — Title` (em-dash), imperative instructions to the agent, and ends with a `## What this skill must NOT do` list.
- **Reference citation form:** `${CLAUDE_PLUGIN_ROOT}/references/<name>.md` inline in prose.
- **Canonical store path is stable at `design-system/docs/`** across folder→repo; files never move.
- **Fingerprint algorithm (single definition):** `sha256(stableStringify(record_without_provenance)).slice(0,16)`. Defined in `references/component-doc-schema.md`, implemented once in `scripts/lib/doc-record.mjs`, reused everywhere.
- **Manifest rules:** forward-migrate on `schemaVersion` mismatch, only write owned fields, no content blobs, no secrets (`references/manifest-schema.md`).
- **Branch:** all work lands on `feat/component-documentation-layer` (already created).

---

## File Structure

**New scripts (installed into the user repo, like `tokens:validate`):**
- `scripts/lib/doc-record.mjs` — load/validate/stable-stringify/fingerprint a doc record. Shared by both scripts.
- `scripts/docs-check.mjs` — the `docs:check` drift gate (classify + CLI).
- `scripts/build-docs-digest.mjs` — the `docs:digest` generator (`index.json` + `llms.txt`).
- `+ colocated *.test.mjs` for each.

**New references:**
- `references/component-doc-schema.md` — canonical record schema, fingerprint algorithm, projection mapping, drift/reconciliation contract.
- `references/component-doc-archetypes.md` — best-practice do/don't + a11y keyed by archetype.

**Modified references:**
- `references/manifest-schema.md` — schemaVersion 4→5: add `components.meta[name].doc`, `audit.docSurface`, and the `docs` retrofit phase.

**Modified skills (each ends by regenerating adapters):**
- `skills/component-builder/SKILL.md` — new doc-authoring step (+ brownfield ingest).
- `skills/storybook-chromatic-builder/SKILL.md` — new doc-rendering step + install/run the two scripts.
- `skills/design-system-audit/SKILL.md` — new doc-debt sizing step.
- `skills/retrofit-planner/SKILL.md` — new `docs` adoption phase.
- `skills/repository-builder/SKILL.md` — adopt the doc store into git + wire `docs:check` into repo CI.

**New command:**
- `commands/document-component.md` — author/refresh + reconcile one component.

**Other:**
- `scripts/README.md` — document the two new installed scripts.
- `CHANGELOG.md` — `## [Unreleased]` entries.
- `adapters/**` — regenerated output.

---

## Task 1: Doc-record schema + fingerprint contract (reference)

**Files:**
- Create: `references/component-doc-schema.md`

**Interfaces:**
- Produces: the canonical field list, the fingerprint algorithm, the manifest `doc` pointer shape, and the projection/drift contract that Tasks 2–13 implement. No code.

- [ ] **Step 1: Write the reference document**

Create `references/component-doc-schema.md` with exactly this content:

````markdown
# Component documentation record

The canonical, folder-resident source of truth for a component's usage
documentation. One JSON file per component at
`design-system/docs/components/<ComponentName>.doc.json`. Every other
documentation surface (Figma component description, the doc card, Storybook
autodocs/MDX, the AI digest) is a **projection** rendered from this file — never
authored independently.

It lives in the working folder from the moment a component is built (exactly like
`design-system.json`), so it exists during the Figma-only *folder* stage, before
any repo. The path stays `design-system/docs/` across folder→repo; files never
move.

## Why JSON (not YAML)

The plugin's scripts are zero-dependency and there is no YAML parser available, so
the record is JSON to keep `docs:check` and `docs:digest` able to parse it
deterministically. JSON is equally machine-legible for AI consumers.

## Schema

```json
{
  "name": "Button",
  "summary": "Triggers an action or event.",
  "description": "A clickable control that initiates an action…",
  "whenToUse": ["Submitting a form", "Confirming a decision"],
  "whenNotToUse": ["Navigating to a new page — use a Link"],
  "variants": {
    "type": { "primary": "Highest-emphasis action…", "secondary": "…", "ghost": "…" },
    "size": { "sm": "…", "md": "…", "lg": "…" }
  },
  "states": { "hover": "…", "focus": "…", "disabled": "…", "loading": "…" },
  "dos": ["Lead with a verb", "One primary button per view"],
  "donts": ["Don't use for navigation", "Don't stack >2 primaries"],
  "accessibility": {
    "role": "button",
    "keyboard": ["Enter / Space activates"],
    "notes": ["Icon-only buttons need an aria-label"]
  },
  "tokensUsed": ["color.bg.primary", "spacing.sm", "radius.md"],
  "status": "stable",
  "updatedAt": "2026-07-14",
  "provenance": {
    "description": "ai-inferred",
    "dos": "best-practice+user",
    "accessibility": "w3c-apg"
  }
}
```

### Fields (v1 core)

- **Required:** `name`, `summary`, `description`.
- **Optional content:** `whenToUse`, `whenNotToUse`, `variants`, `states`, `dos`,
  `donts`, `accessibility`, `tokensUsed`.
- **Lifecycle:** `status` (`draft`|`beta`|`stable`|`deprecated`), `updatedAt` (ISO date).
- **`provenance`** — per-block author source, one of `imported`, `ai-inferred`,
  `best-practice`, `w3c-apg`, `framework`, `user`, or a `+`-joined combination
  (e.g. `best-practice+user`). Regeneration re-infers `ai-inferred`/`framework`
  blocks and **never overwrites** a block whose provenance includes `user` or
  `imported`.

Deferred to a later version (do not emit in v1): `anatomy`, `content` (writing
guidelines), `examples`.

## Fingerprint algorithm

`fingerprint = sha256(stableStringify(record_without_provenance)).slice(0, 16)`

- `provenance` is **excluded** — it is authoring metadata, not projected content.
- `stableStringify` sorts object keys recursively so formatting/key-order never
  affects the hash.
- The 16-hex-char result is the stamp recorded per surface and per canonical file.

Implemented once in `scripts/lib/doc-record.mjs` (`canonicalFingerprint`) and
reused by `docs:check`, `docs:digest`, and — for the Figma surfaces — by the
Figma-connected skill computing the identical hash over the description content.

## Projection mapping

| Block(s) | Figma component description | Doc card | Storybook autodocs (MDX) + JSDoc | AI digest |
|---|---|---|---|---|
| summary, description | ✔ | ✔ | ✔ | ✔ |
| whenToUse / whenNotToUse | ✔ | ✔ | ✔ | ✔ |
| variants, states (meanings) | ✔ compact | ✔ legend | ✔ argTypes | ✔ |
| dos / donts | ✔ | ✔ | ✔ | ✔ |
| accessibility | ✔ | ✔ | ✔ | ✔ |
| tokensUsed | — | — | ✔ | ✔ |

Each surface carries a fingerprint stamp of the record it was rendered from:
- **Figma component description** — a trailing marker line `<!-- tl:doc <fp> -->`.
- **Doc card** — a named metadata node `Doc Fingerprint` holding `<fp>`.
- **Storybook MDX** — a frontmatter field `docFingerprint: <fp>`.

## Manifest pointer (`components.meta[name].doc`)

The manifest stores pointers + per-surface fingerprints, never content:

```json
"doc": {
  "path": "design-system/docs/components/Button.doc.json",
  "fingerprint": "<canonical fingerprint at last render>",
  "surfaces": {
    "figmaDescription": { "src": "<fp>", "render": "<hash of description text>" },
    "docCard":          { "src": "<fp>", "render": "<hash of card content>" },
    "storybookMdx":     { "src": "<fp>", "render": "<hash of mdx file>", "file": "packages/ui/src/Button/Button.mdx" }
  }
}
```

- `src` — the canonical fingerprint the surface was rendered from (detects **stale**).
- `render` — a hash of the surface's rendered content at render time (detects
  **edited**, for surfaces the tooling can re-read).
- `file` — repo-relative path for code surfaces so `docs:check` can re-read them.

## Drift + reconciliation contract

`docs:check` classifies each surface:
- **canonical-changed** — the `.doc.json` fingerprint ≠ `doc.fingerprint`.
- **stale** — `surface.src` ≠ current canonical fingerprint.
- **edited** — a re-readable surface's current content hash ≠ `surface.render`.
- **edit-unverified** — a surface the CLI can't read (Figma); checked live by the
  Figma-connected skill instead.

Reconciliation is **per item, reviewable**: for each drift the user chooses
**re-render** (canonical wins) or **pull-back** (fold the surface edit into the
record), landed as a PR. **Brownfield first run is an adoption**, not a re-render:
existing surface content is claimed into the record as `provenance: imported` and
fingerprints are stamped, rather than treated as `edited` drift.
````

- [ ] **Step 2: Verify the reference parses and is well-formed**

Run: `node ci/validate-skills.mjs`
Expected: PASS — `✓ … manifest doc OK` (this validator does not inspect the new file, but must stay green).

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('references/component-doc-schema.md','utf8');const m=[...s.matchAll(/\x60\x60\x60json\n([\s\S]*?)\n\x60\x60\x60/g)];m.forEach((b,i)=>JSON.parse(b[1]));console.log('all',m.length,'json blocks parse')"`
Expected: `all 3 json blocks parse`

- [ ] **Step 3: Commit**

```bash
git add references/component-doc-schema.md
git commit -m "docs(reference): define the component doc-record schema + fingerprint contract"
```

---

## Task 2: Shared doc-record module (fingerprint + validation)

**Files:**
- Create: `scripts/lib/doc-record.mjs`
- Test: `scripts/lib/doc-record.test.mjs`

**Interfaces:**
- Produces:
  - `stableStringify(value) -> string`
  - `fingerprint(text) -> string` (16 hex chars)
  - `canonicalFingerprint(record) -> string` (excludes `provenance`)
  - `validateRecord(record) -> string[]` (empty = valid)
  - `loadRecord(path) -> object`
- Consumed by Tasks 3 and 4.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/doc-record.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stableStringify,
  fingerprint,
  canonicalFingerprint,
  validateRecord,
} from './doc-record.mjs';

test('stableStringify is key-order independent', () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
});

test('stableStringify recurses into nested objects and arrays', () => {
  const a = stableStringify({ x: { b: [1, 2], a: 3 } });
  const b = stableStringify({ x: { a: 3, b: [1, 2] } });
  assert.equal(a, b);
});

test('fingerprint is deterministic and 16 lowercase hex chars', () => {
  const fp = fingerprint('hello');
  assert.match(fp, /^[0-9a-f]{16}$/);
  assert.equal(fp, fingerprint('hello'));
  assert.notEqual(fp, fingerprint('world'));
});

test('canonicalFingerprint ignores provenance', () => {
  const base = { name: 'Button', summary: 's', description: 'd' };
  const withProv = { ...base, provenance: { summary: 'ai-inferred' } };
  assert.equal(canonicalFingerprint(base), canonicalFingerprint(withProv));
});

test('canonicalFingerprint changes when a projected field changes', () => {
  const a = { name: 'Button', summary: 's', description: 'd' };
  const b = { name: 'Button', summary: 's2', description: 'd' };
  assert.notEqual(canonicalFingerprint(a), canonicalFingerprint(b));
});

test('validateRecord passes a complete record and flags missing required fields', () => {
  assert.deepEqual(validateRecord({ name: 'B', summary: 's', description: 'd' }), []);
  const problems = validateRecord({ name: 'B' });
  assert.ok(problems.some((p) => /summary/.test(p)));
  assert.ok(problems.some((p) => /description/.test(p)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/doc-record.test.mjs`
Expected: FAIL — cannot find module `./doc-record.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/doc-record.mjs`:

```javascript
// Loads, validates, and fingerprints a component documentation record
// (design-system/docs/components/<Name>.doc.json). Zero dependencies.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Blocks that get PROJECTED to surfaces. `provenance` is authoring metadata and
// is intentionally excluded from the fingerprint.
const PROJECTED_KEYS = [
  'name', 'summary', 'description', 'whenToUse', 'whenNotToUse',
  'variants', 'states', 'dos', 'donts', 'accessibility', 'tokensUsed',
  'status', 'updatedAt',
];

const REQUIRED_KEYS = ['name', 'summary', 'description'];

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function fingerprint(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

export function canonicalFingerprint(record) {
  const projected = {};
  for (const k of PROJECTED_KEYS) {
    if (record[k] !== undefined) projected[k] = record[k];
  }
  return fingerprint(stableStringify(projected));
}

export function validateRecord(record) {
  const problems = [];
  for (const k of REQUIRED_KEYS) {
    if (typeof record[k] !== 'string' || record[k].trim() === '') {
      problems.push(`missing or empty required field "${k}"`);
    }
  }
  return problems;
}

export function loadRecord(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/doc-record.test.mjs`
Expected: PASS — all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/doc-record.mjs scripts/lib/doc-record.test.mjs
git commit -m "feat(docs): shared doc-record fingerprint + validation module"
```

---

## Task 3: `docs:check` drift gate

**Files:**
- Create: `scripts/docs-check.mjs`
- Test: `scripts/docs-check.test.mjs`

**Interfaces:**
- Consumes: `loadRecord`, `canonicalFingerprint`, `fingerprint` from `scripts/lib/doc-record.mjs`.
- Produces:
  - `classifySurface({ currentCanonical, surface, currentRenderHash }) -> string[]`
  - `checkComponent({ name, meta, root }) -> Array<{name, surface, flags}>`
  - `checkAll(manifest, root) -> Array<{name, surface, flags}>`
  - CLI: `node docs-check.mjs [--root <dir>]`, exit 1 on drift.

- [ ] **Step 1: Write the failing test**

Create `scripts/docs-check.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifySurface, checkAll } from './docs-check.mjs';
import { canonicalFingerprint, fingerprint } from './lib/doc-record.mjs';

test('classifySurface: in sync returns no flags', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'a', surface: { src: 'a', render: 'r' }, currentRenderHash: 'r' }),
    [],
  );
});

test('classifySurface: stale when canonical moved', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'b', surface: { src: 'a', render: 'r' }, currentRenderHash: 'r' }),
    ['stale'],
  );
});

test('classifySurface: edited when rendered content changed', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'a', surface: { src: 'a', render: 'r' }, currentRenderHash: 'r2' }),
    ['edited'],
  );
});

test('classifySurface: edit-unverified when surface unreadable', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'a', surface: { src: 'a', render: 'r' }, currentRenderHash: null }),
    ['edit-unverified'],
  );
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'docs-check-'));
  mkdirSync(join(root, 'design-system', 'docs', 'components'), { recursive: true });
  mkdirSync(join(root, 'packages', 'ui', 'src', 'Button'), { recursive: true });
  const record = { name: 'Button', summary: 's', description: 'd' };
  writeFileSync(
    join(root, 'design-system', 'docs', 'components', 'Button.doc.json'),
    JSON.stringify(record),
  );
  const fp = canonicalFingerprint(record);
  const mdx = 'docFingerprint: ' + fp + '\n# Button\n';
  writeFileSync(join(root, 'packages', 'ui', 'src', 'Button', 'Button.mdx'), mdx);
  const manifest = {
    components: {
      meta: {
        Button: {
          doc: {
            path: 'design-system/docs/components/Button.doc.json',
            fingerprint: fp,
            surfaces: {
              storybookMdx: { src: fp, render: fingerprint(mdx), file: 'packages/ui/src/Button/Button.mdx' },
              figmaDescription: { src: fp, render: 'whatever' },
            },
          },
        },
      },
    },
  };
  return { root, manifest, fp };
}

test('checkAll: reports no drift for an in-sync system (Figma is edit-unverified only)', () => {
  const { root, manifest } = fixture();
  const results = checkAll(manifest, root);
  const drift = results.filter((r) => r.flags.some((f) => f === 'stale' || f === 'edited' || f === 'canonical-changed'));
  assert.equal(drift.length, 0);
  // Figma surface is surfaced as edit-unverified (informational).
  assert.ok(results.some((r) => r.surface === 'figmaDescription' && r.flags.includes('edit-unverified')));
});

test('checkAll: flags canonical-changed when the record file drifts from the manifest', () => {
  const { root, manifest } = fixture();
  writeFileSync(
    join(root, 'design-system', 'docs', 'components', 'Button.doc.json'),
    JSON.stringify({ name: 'Button', summary: 'CHANGED', description: 'd' }),
  );
  const results = checkAll(manifest, root);
  assert.ok(results.some((r) => r.surface === 'canonical' && r.flags.includes('canonical-changed')));
});

test('checkAll: flags edited when the MDX file is hand-modified', () => {
  const { root, manifest } = fixture();
  writeFileSync(join(root, 'packages', 'ui', 'src', 'Button', 'Button.mdx'), '# Hand edited\n');
  const results = checkAll(manifest, root);
  assert.ok(results.some((r) => r.surface === 'storybookMdx' && r.flags.includes('edited')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/docs-check.test.mjs`
Expected: FAIL — cannot find module `./docs-check.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/docs-check.mjs`:

```javascript
// docs:check — the documentation drift gate. Compares each component's canonical
// record and its rendered surfaces against the fingerprints recorded in
// design-system.json, and reports drift. Zero dependencies.
//
// Drift classes: canonical-changed | stale | edited | edit-unverified
// (edit-unverified = a surface the CLI cannot read, e.g. Figma — informational;
//  it is checked live by the Figma-connected skill instead.)
//
// Usage: node docs-check.mjs [--root <dir>]   (default root: cwd)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadRecord, canonicalFingerprint, fingerprint } from './lib/doc-record.mjs';

// Surfaces whose rendered content the CLI can re-read from the repo.
const REPO_SURFACES = new Set(['storybookMdx']);

export function classifySurface({ currentCanonical, surface, currentRenderHash }) {
  const flags = [];
  if (surface.src !== currentCanonical) flags.push('stale');
  if (currentRenderHash === null) {
    flags.push('edit-unverified');
  } else if (surface.render !== currentRenderHash) {
    flags.push('edited');
  }
  return flags;
}

export function checkComponent({ name, meta, root }) {
  const out = [];
  const doc = meta && meta.doc;
  if (!doc) return out;

  const recordPath = join(root, doc.path);
  if (!existsSync(recordPath)) {
    out.push({ name, surface: 'canonical', flags: ['missing-record'] });
    return out;
  }
  const currentCanonical = canonicalFingerprint(loadRecord(recordPath));
  if (currentCanonical !== doc.fingerprint) {
    out.push({ name, surface: 'canonical', flags: ['canonical-changed'] });
  }

  for (const [surfaceName, surface] of Object.entries(doc.surfaces || {})) {
    let currentRenderHash = null;
    if (REPO_SURFACES.has(surfaceName) && surface.file) {
      const filePath = join(root, surface.file);
      if (existsSync(filePath)) {
        currentRenderHash = fingerprint(readFileSync(filePath, 'utf8'));
      }
    }
    const flags = classifySurface({ currentCanonical, surface, currentRenderHash });
    if (flags.length) out.push({ name, surface: surfaceName, flags });
  }
  return out;
}

export function checkAll(manifest, root) {
  const out = [];
  const meta = (manifest && manifest.components && manifest.components.meta) || {};
  for (const [name, m] of Object.entries(meta)) {
    out.push(...checkComponent({ name, meta: m, root }));
  }
  return out;
}

const FAILING = new Set(['canonical-changed', 'stale', 'edited', 'missing-record']);

function main() {
  const { values } = parseArgs({ options: { root: { type: 'string', default: '.' } } });
  const root = values.root;
  const manifestPath = join(root, 'design-system.json');
  if (!existsSync(manifestPath)) {
    console.error(`docs:check — no design-system.json at ${root}`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const results = checkAll(manifest, root);

  const drift = results.filter((r) => r.flags.some((f) => FAILING.has(f)));
  const info = results.filter((r) => !r.flags.some((f) => FAILING.has(f)));

  for (const r of drift) console.error(`  ✗ ${r.name} · ${r.surface}: ${r.flags.join(', ')}`);
  for (const r of info) console.log(`  ~ ${r.name} · ${r.surface}: ${r.flags.join(', ')} (check in a Figma session)`);

  if (drift.length) {
    console.error(`✗ docs:check — ${drift.length} drifted surface(s); reconcile with /document-component`);
    process.exit(1);
  }
  console.log(`✓ docs:check — no drift${info.length ? ` (${info.length} Figma surface(s) unverified)` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/docs-check.test.mjs`
Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/docs-check.mjs scripts/docs-check.test.mjs
git commit -m "feat(docs): docs:check drift gate over canonical records + surfaces"
```

---

## Task 4: `docs:digest` AI-digest generator

**Files:**
- Create: `scripts/build-docs-digest.mjs`
- Test: `scripts/build-docs-digest.test.mjs`

**Interfaces:**
- Consumes: `loadRecord` from `scripts/lib/doc-record.mjs`.
- Produces:
  - `buildIndex(records) -> object`
  - `buildLlmsTxt(records) -> string`
  - `loadAllRecords(root) -> object[]`
  - CLI: writes `design-system/docs/index.json` + `design-system/docs/llms.txt`.

- [ ] **Step 1: Write the failing test**

Create `scripts/build-docs-digest.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIndex, buildLlmsTxt, loadAllRecords } from './build-docs-digest.mjs';

const RECORDS = [
  {
    name: 'Button', summary: 'Triggers an action.', description: 'A control…',
    whenToUse: ['Submit a form'], whenNotToUse: ['Navigation'],
    dos: ['Lead with a verb'], donts: ["Don't use for links"],
    tokensUsed: ['color.bg.primary'], status: 'stable',
  },
  { name: 'Input', summary: 'Accepts text.', description: 'A field…' },
];

test('buildIndex maps every record with defaulted fields', () => {
  const index = buildIndex(RECORDS);
  assert.equal(index.components.length, 2);
  const input = index.components.find((c) => c.name === 'Input');
  assert.deepEqual(input.dos, []);
  assert.deepEqual(input.tokensUsed, []);
  assert.equal(input.status, 'draft');
});

test('buildLlmsTxt includes each component name and its rules', () => {
  const txt = buildLlmsTxt(RECORDS);
  assert.match(txt, /## Button/);
  assert.match(txt, /## Input/);
  assert.match(txt, /Lead with a verb/);
  assert.match(txt, /Don't use for links/);
});

test('loadAllRecords reads and sorts *.doc.json from the store', () => {
  const root = mkdtempSync(join(tmpdir(), 'digest-'));
  const dir = join(root, 'design-system', 'docs', 'components');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'Button.doc.json'), JSON.stringify(RECORDS[0]));
  writeFileSync(join(dir, 'Input.doc.json'), JSON.stringify(RECORDS[1]));
  writeFileSync(join(dir, 'notes.txt'), 'ignored');
  const loaded = loadAllRecords(root);
  assert.deepEqual(loaded.map((r) => r.name), ['Button', 'Input']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/build-docs-digest.test.mjs`
Expected: FAIL — cannot find module `./build-docs-digest.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/build-docs-digest.mjs`:

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/build-docs-digest.test.mjs`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Run the full test suite (no regressions)**

Run: `node --test`
Expected: PASS — all suites, including the three new ones.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-docs-digest.mjs scripts/build-docs-digest.test.mjs
git commit -m "feat(docs): docs:digest generator (index.json + llms.txt)"
```

---

## Task 5: Document the new scripts in `scripts/README.md`

**Files:**
- Modify: `scripts/README.md`

**Interfaces:**
- Consumes: the two scripts from Tasks 3–4. Produces: user-facing script docs (the storybook/repository skills install these as npm scripts).

- [ ] **Step 1: Read the current README to find the script table**

Run: `sed -n '1,40p' scripts/README.md`
Expected: shows a Markdown table listing `validate-crosswalk.mjs` → `tokens:validate`, etc.

- [ ] **Step 2: Add two rows + a short section**

Add these two rows to the script table (match the existing column layout — script, installed-as, purpose):

```markdown
| `build-docs-digest.mjs` | `docs:digest` | Aggregate every `design-system/docs/components/*.doc.json` into `design-system/docs/index.json` + `llms.txt` for AI/human consumers. |
| `docs-check.mjs` | `docs:check` | Drift gate — verifies each component's doc surfaces still match its canonical record (via `lib/doc-record.mjs` fingerprints). Exits 1 on drift. |
```

And append this section to the end of the file:

```markdown
## Documentation scripts

`docs:digest` and `docs:check` operate on the folder-resident documentation store
at `design-system/docs/`. Both share `lib/doc-record.mjs` (record loading +
fingerprinting). `docs:check` re-reads repo surfaces (Storybook MDX); Figma
surfaces are marked `edit-unverified` and are checked live by the Figma-connected
skills. See `${CLAUDE_PLUGIN_ROOT}/references/component-doc-schema.md` for the
record schema and fingerprint contract.
```

- [ ] **Step 3: Verify**

Run: `node ci/validate-plugin.mjs && node ci/validate-skills.mjs`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/README.md
git commit -m "docs(scripts): document docs:digest and docs:check"
```

---

## Task 6: Manifest schema v5 (pointers + doc-debt + retrofit phase)

**Files:**
- Modify: `references/manifest-schema.md`

**Interfaces:**
- Consumes: the `doc` pointer shape from Task 1. Produces: the manifest fields Tasks 8–13 read/write.

- [ ] **Step 1: Bump the schemaVersion in the heading and the example JSON**

In `references/manifest-schema.md`:
- Change the heading `## Schema (schemaVersion 4)` → `## Schema (schemaVersion 5)`.
- In the example JSON block, change `"schemaVersion": 4,` → `"schemaVersion": 5,`.

- [ ] **Step 2: Add `docSurface` to the `audit` object in the example JSON**

Find the `audit` object in the example JSON:

```json
  "audit": {
    "ranAt": null,
    "codeSurface": null,
    "figmaInventory": null,
    "percentSemantic": null
  },
```

Replace it with:

```json
  "audit": {
    "ranAt": null,
    "codeSurface": null,
    "figmaInventory": null,
    "percentSemantic": null,
    "docSurface": null
  },
```

- [ ] **Step 3: Document the `components.meta[name].doc` field**

In the `### components` field-reference section, after the `meta` bullet, add:

```markdown
- `meta[name].doc` — documentation pointer + per-surface fingerprints for the
  component (v1: components only). **Pointers and hashes, never content** — the
  content lives in `design-system/docs/components/<name>.doc.json`. Shape:
  `{ path, fingerprint, surfaces: { <surfaceName>: { src, render, file? } } }`,
  where `fingerprint` is the canonical fingerprint at last render, `src` is the
  canonical fingerprint a surface was rendered from (detects stale), `render` is a
  hash of the surface's rendered content (detects edits, for re-readable surfaces),
  and `file` is the repo-relative path of a code surface. Written by
  `component-builder` (Figma + card surfaces) and `storybook-chromatic-builder`
  (code surfaces); read by the `docs:check` gate. See
  `${CLAUDE_PLUGIN_ROOT}/references/component-doc-schema.md`.
```

- [ ] **Step 4: Document the `audit.docSurface` field**

In the `### audit` field-reference section, after the `percentSemantic` bullet, add:

```markdown
- `docSurface` — object sizing the documentation debt for a brownfield retrofit,
  from verified per-component reads: e.g. `{ "documented": 12, "undocumented": 34,
  "sources": { "codeJsdoc": 8, "mdx": 4, "figmaDescription": 6, "readme": 3 } }`.
  `null` until the audit's documentation-sizing pass runs. Counts come from real
  reads, never assumptions (same discipline as `codeSurface` / `figmaInventory`).
```

- [ ] **Step 5: Add `docs` to the retrofit phase enum**

In the `### retrofit` field-reference section, find the `phase` bullet listing
`"audit"`, `"refine"`, `"rebind"`, `"sync"`, `"baseline"`, `"code"`, `"cleanup"`,
`"done"`. Add `"docs"` immediately after `"code"` so the ordered list reads:
`… "baseline", "code", "docs", "cleanup", "done" …`. Update the surrounding prose
to note the `docs` phase adopts existing documentation (see `retrofit-planner`).

- [ ] **Step 6: Add a v4→v5 migration note**

In the `## Rules for skills touching the manifest` section (rule 2 covers
forward-migration), append this note after the rules list:

```markdown
**v4 → v5 migration:** add `audit.docSurface` (default `null`) and the `docs`
retrofit phase; `components.meta[name].doc` is added lazily per component as docs
are authored. Bump `schemaVersion` to `5`. No existing field changes.
```

- [ ] **Step 7: Verify the example JSON still parses with an integer schemaVersion**

Run: `node ci/validate-skills.mjs`
Expected: PASS — `✓ … manifest doc OK`.

- [ ] **Step 8: Commit**

```bash
git add references/manifest-schema.md
git commit -m "feat(manifest): schemaVersion 5 — doc pointers, audit.docSurface, docs retrofit phase"
```

---

## Task 7: Best-practice archetype knowledge base (reference)

**Files:**
- Create: `references/component-doc-archetypes.md`

**Interfaces:**
- Produces: the enrich-layer source (do's/don'ts + a11y per archetype) that `component-builder`'s doc-authoring step reads. No code.

- [ ] **Step 1: Write the reference**

Create `references/component-doc-archetypes.md` with this content (this is the
baked-in "best-practice systems" layer — sourced from the W3C ARIA APG, Material,
Polaris, and Carbon; extend as new archetypes are built):

````markdown
# Component documentation archetypes

The best-practice knowledge layer for the documentation generation pipeline
(`component-builder` Step: *Author the documentation record*). When authoring a
component's `.doc.json`, match the component to the nearest **archetype** below and
seed its `dos`, `donts`, `accessibility`, `whenToUse`, and `whenNotToUse` from that
entry, then specialize to the target framework and confirm with the user. Stamp
`provenance` as `best-practice` (or `w3c-apg` for the accessibility block) for
anything sourced here.

These are **seeds, not gospel** — the user's approval and the actual built
component override them. Sources: W3C ARIA Authoring Practices Guide (roles +
keyboard), Material 3, Shopify Polaris (content/usage), IBM Carbon (usage).

## Button

- **whenToUse:** trigger an action or event (submit, confirm, open a dialog).
- **whenNotToUse:** navigation between pages/URLs — use a Link.
- **dos:** lead the label with a verb; keep one primary (highest-emphasis) button
  per view; keep labels short (≤ ~3 words).
- **donts:** don't use a button for navigation; don't stack multiple primary
  buttons; don't disable without telling the user why.
- **accessibility (w3c-apg):** role `button`; Enter and Space activate; an
  icon-only button needs an `aria-label`; disabled buttons are not focusable.

## Input / text field

- **whenToUse:** collect a single line of free-form text.
- **whenNotToUse:** choosing from a fixed set (use Select/Radio); long multi-line
  text (use Textarea).
- **dos:** always pair with a visible label; show format hints as helper text;
  reserve space for error text to avoid layout shift.
- **donts:** don't use placeholder text as the only label; don't validate on every
  keystroke before first blur.
- **accessibility (w3c-apg):** every input has a programmatically associated
  `<label>`; error state sets `aria-invalid` and links the message via
  `aria-describedby`.

## Checkbox / radio / toggle

- **whenToUse:** checkbox/toggle for independent on/off; radio for one-of-many.
- **whenNotToUse:** a single either/or action that takes effect immediately with no
  save (prefer a toggle) vs. a form choice (prefer radio/checkbox).
- **dos:** label the control, not just the group; make the label clickable.
- **donts:** don't use a radio group for multi-select; don't use a toggle for
  choices that only apply after a separate Save.
- **accessibility (w3c-apg):** roles `checkbox` / `radio` / `switch`; Space
  toggles; radio groups navigate with arrow keys; state exposed via
  `aria-checked`.

## Card

- **whenToUse:** group related content and actions about a single subject.
- **whenNotToUse:** primary page layout scaffolding; a bare list of text.
- **dos:** make the primary action obvious; keep one main call-to-action per card.
- **donts:** don't nest cards more than one level; don't make the whole card AND an
  inner button separately clickable in conflicting ways.
- **accessibility:** if the whole card is a link/button, it needs an accessible
  name; don't bury interactive controls that keyboard users can't reach in order.

## Modal / dialog

- **whenToUse:** interrupt for a focused task or a decision that blocks the flow.
- **whenNotToUse:** non-critical messages (use an inline banner or toast).
- **dos:** trap focus while open; return focus to the trigger on close; provide an
  explicit close affordance.
- **donts:** don't stack modals; don't put long scrolling forms in a small modal.
- **accessibility (w3c-apg):** role `dialog` with `aria-modal="true"`; labelled by
  its title (`aria-labelledby`); Escape closes; focus is trapped within.

## Badge / chip / tag

- **whenToUse:** short status, count, or category label (badge); a removable/
  selectable token (chip).
- **whenNotToUse:** interactive primary actions (use a Button).
- **dos:** keep text to a word or two; bind color to a semantic tone token.
- **donts:** don't rely on color alone to convey status — include text/icon.
- **accessibility:** a removable chip's remove control needs an accessible name
  (e.g. "Remove <label>"); status conveyed with text, not color only (WCAG 1.4.1).

## Fallback (unlisted archetype)

For a component without an entry above: derive `dos`/`donts` from its role and
built structure, source the `accessibility` block from the matching W3C APG
pattern, and mark everything for user confirmation. Add a new archetype section
here once the component's guidance stabilizes.
````

- [ ] **Step 2: Verify**

Run: `node ci/validate-skills.mjs`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add references/component-doc-archetypes.md
git commit -m "docs(reference): best-practice archetype knowledge base for doc authoring"
```

---

## Task 8: `component-builder` — author the documentation record

**Files:**
- Modify: `skills/component-builder/SKILL.md` (insert a new step after `## Step 4 — Capture the slot contract (the code-binding spec)`, before `## Step 5 — Naming as contract`)
- Regenerate: `adapters/**`

**Interfaces:**
- Consumes: `references/component-doc-schema.md` (Task 1), `references/component-doc-archetypes.md` (Task 7), manifest `components.meta[name].doc` (Task 6).
- Produces: `design-system/docs/components/<Name>.doc.json`, the Figma component `description` field + doc-card body, and the manifest `doc` pointer with `figmaDescription` + `docCard` surface fingerprints.

- [ ] **Step 1: Insert the new step**

Insert this section between Step 4 and Step 5:

```markdown
## Step 4.5 — Author the documentation record (and project it)

Every component gets a canonical documentation record — the source of truth for
its usage docs — written to the working folder next to `design-system.json`
(**folder-resident from day one**, exactly like the manifest; no repo required).
Read `${CLAUDE_PLUGIN_ROOT}/references/component-doc-schema.md` for the exact JSON
schema, the fingerprint algorithm, and the projection contract.

**Run the generation pipeline (each layer only fills what it legitimately knows;
stamp `provenance` per block):**

0. **Ingest existing docs — brownfield only, runs first.** If docs already exist
   for this component (code JSDoc/MDX/README, or a populated Figma component
   `description`), read them and seed the record marked `provenance: imported`.
   **Never silently overwrite existing human-written docs** — this is the
   read-before-you-assert rule. Skip on greenfield.
1. **Infer from the built artifact.** From the component you just built — its
   variants, states, slots, and bound tokens — author `description`, `variants`,
   `states`, and `tokensUsed` (`tokensUsed` comes from the real variable bindings,
   not a guess). Provenance `ai-inferred`.
2. **Enrich from the archetype knowledge base.** Match the component to the nearest
   archetype in `${CLAUDE_PLUGIN_ROOT}/references/component-doc-archetypes.md` and
   seed `dos`, `donts`, `accessibility`, `whenToUse`, `whenNotToUse`. Provenance
   `best-practice` (or `w3c-apg` for the accessibility block).
3. **Specialize to `project.uiFramework`.** Align variant-meaning wording and the
   accessibility idiom to the target framework (the same field you read for variant
   vocabulary). Provenance `framework`.
4. **Interview for the non-inferable.** Ask the user for brand/product-specific
   do's & don'ts and intent. Provenance `user`. **Show the whole drafted record and
   get explicit approval before writing anything** — layers 1–4 only fill blocks the
   ingest step did not, and an `imported`/`user` block is never overwritten.

**Write the record and project it:**

- Write `design-system/docs/components/<Name>.doc.json` (JSON; required fields
  `name`, `summary`, `description`).
- **Figma component description.** Set the component's native `description` field
  (via `figma_set_description`) to a compact markdown rendering — summary,
  when-to-use/not, do's/don'ts, and the a11y summary — and append a fingerprint
  marker line `<!-- tl:doc <fp> -->` (this is the surface Dev Mode and Code Connect
  read).
- **Doc card body.** Extend the existing doc card (name/short-desc/status/date, per
  `${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md`) with a usage body:
  when-to-use, do's/don'ts, an a11y line, and a variant/state legend — all
  token-bound (no hardcoded hex/px). Add a metadata text node named
  `Doc Fingerprint` holding `<fp>`.
- Compute `<fp>` as the canonical fingerprint defined in the schema reference
  (sha256 of the projected record without `provenance`, first 16 hex chars).

**Update the manifest (fields this skill owns):** set
`components.meta[<Name>].doc` to `{ path, fingerprint: <fp>, surfaces: {
figmaDescription: { src: <fp>, render: <hash of the description text> }, docCard: {
src: <fp>, render: <hash of the card body content> } } }`. The code surfaces
(`storybookMdx`) are added later by `storybook-chromatic-builder`.

Run the standard doc-card visual-validation + post-build audit
(`${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md`) after enriching
the card. `docs:check` runs at the code stage; at folder stage the record + Figma
surfaces are the fallback.
```

- [ ] **Step 2: Add a prohibition to the NOT-do list**

In `## What this skill must NOT do`, add this bullet:

```markdown
- Never overwrite an existing component `description` or imported doc content
  without reading it first and marking it `provenance: imported` — brownfield docs
  are seeds, not blank slates.
```

- [ ] **Step 3: Regenerate adapters**

Run: `node scripts/adapters/generate.mjs`
Expected: prints the regenerated adapter summary (no error).

- [ ] **Step 4: Verify frontmatter, manifest doc, and adapter sync**

Run: `node ci/validate-skills.mjs && node scripts/adapters/generate.mjs --check`
Expected: both PASS (`✓ … OK`, and no "adapters out of date").

- [ ] **Step 5: Commit**

```bash
git add skills/component-builder/SKILL.md adapters/
git commit -m "feat(component-builder): author + project the component documentation record"
```

---

## Task 9: `storybook-chromatic-builder` — render docs to code + install the gate

**Files:**
- Modify: `skills/storybook-chromatic-builder/SKILL.md` (add a render step after `## Step 5 — Code Connect (plan-gated, skip gracefully)`; extend Step 1 install + Step 7 manifest)
- Regenerate: `adapters/**`

**Interfaces:**
- Consumes: the canonical record (Task 8), the two scripts (Tasks 3–4), `components.meta[name].doc` (Task 6).
- Produces: per-component `<Name>.mdx` + JSDoc, the generated `index.json` + `llms.txt`, the installed `docs:digest` + `docs:check` npm scripts, and the `storybookMdx` surface entry in the manifest.

- [ ] **Step 1: Add the install of the two scripts in Step 1**

In `## Step 1 — Stand up Storybook`, where the skill installs repo scripts, add:

```markdown
Install the documentation scripts alongside the token scripts (copy from the
plugin's `scripts/` — `build-docs-digest.mjs`, `docs-check.mjs`, and
`lib/doc-record.mjs` — into the repo and register npm scripts):

- `"docs:digest": "node scripts/build-docs-digest.mjs"`
- `"docs:check": "node scripts/docs-check.mjs"`

These are the documentation analog of `tokens:validate`; see
`${CLAUDE_PLUGIN_ROOT}/scripts/README.md`.
```

- [ ] **Step 2: Insert the render step**

Insert this section after Step 5, before `## Step 6 — Finalize component status (Figma write-back)`:

```markdown
## Step 5.5 — Render documentation to code

For each component that has a canonical record
(`design-system/docs/components/<Name>.doc.json`), render the code-side surfaces
from it (read `${CLAUDE_PLUGIN_ROOT}/references/component-doc-schema.md` for the
projection contract):

- **Storybook autodocs (MDX).** Generate `<Name>.mdx` next to the component (e.g.
  `packages/ui/src/<Name>/<Name>.mdx`) rendering summary, description,
  when-to-use/not, do's/don'ts, accessibility, and a variant/state table. Put the
  record's fingerprint in MDX frontmatter as `docFingerprint: <fp>`.
- **JSDoc.** Add a doc comment to the code component from `summary` + `description`
  and per-prop descriptions from `variants`/`states` meanings, so `argTypes`
  descriptions surface in the Storybook controls table.
- **AI digest.** Run `docs:digest` to (re)generate `design-system/docs/index.json`
  + `design-system/docs/llms.txt` from all records.

**Update the manifest:** add the `storybookMdx` surface to
`components.meta[<Name>].doc.surfaces` as `{ src: <fp>, render: <hash of the MDX
file>, file: "<repo-relative MDX path>" }`.

**Wire the gate.** Ensure `docs:check` is part of the repo's verification (a CI
step and/or a Turbo task). It compares every surface against its record and exits
non-zero on drift; Figma surfaces report `edit-unverified` (checked live in a Figma
session). Run `docs:check` once here and confirm it passes before handing off.
```

- [ ] **Step 3: Note the promotion write-back also refreshes the record**

In `## Step 6 — Finalize component status (Figma write-back)`, add this bullet
where it updates status:

```markdown
- When promoting status (e.g. draft → stable), also set `status` + `updatedAt` in
  the component's `.doc.json`, recompute its fingerprint, re-run `docs:digest`, and
  re-render the affected surfaces so `docs:check` stays green.
```

- [ ] **Step 4: Regenerate adapters**

Run: `node scripts/adapters/generate.mjs`
Expected: regenerated summary, no error.

- [ ] **Step 5: Verify**

Run: `node ci/validate-skills.mjs && node scripts/adapters/generate.mjs --check`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add skills/storybook-chromatic-builder/SKILL.md adapters/
git commit -m "feat(storybook): render docs to MDX/JSDoc + install docs:digest/docs:check gate"
```

---

## Task 10: `design-system-audit` — size the documentation debt

**Files:**
- Modify: `skills/design-system-audit/SKILL.md` (insert after `## Step 1 — Size the code surface`, before `## Step 2 — Inventory the Figma file (verified per-class reads)`)
- Regenerate: `adapters/**`

**Interfaces:**
- Consumes: nothing new. Produces: `audit.docSurface` in the manifest (Task 6 field).

- [ ] **Step 1: Insert the sizing step**

Insert this section:

```markdown
## Step 1.5 — Size the documentation surface

Inventory existing documentation the same way the code surface is sized — from
**verified reads, never assumptions**. Per component (or per code component when no
Figma component exists yet), record whether usage docs already exist and where:

- **Code:** JSDoc/TSDoc on the component, an `.mdx` doc page, a per-component
  README.
- **Figma:** a populated component `description` field.

Write the totals to `audit.docSurface` in the manifest, e.g. `{ "documented": 12,
"undocumented": 34, "sources": { "codeJsdoc": 8, "mdx": 4, "figmaDescription": 6,
"readme": 3 } }`. This right-sizes the documentation retrofit (how much exists to
adopt vs. author from scratch) so `retrofit-planner`'s `docs` phase can be planned
against real numbers. See `${CLAUDE_PLUGIN_ROOT}/references/component-doc-schema.md`
for what a full record contains.
```

- [ ] **Step 2: Mention it in the recommend-next-step summary**

In `## Step 4 — Write the manifest and recommend the next step`, add a bullet:

```markdown
- Report the documentation debt from `audit.docSurface` (documented vs.
  undocumented) and note that the retrofit's `docs` phase will adopt existing docs
  before authoring the gaps.
```

- [ ] **Step 3: Regenerate adapters + verify**

Run: `node scripts/adapters/generate.mjs && node ci/validate-skills.mjs && node scripts/adapters/generate.mjs --check`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add skills/design-system-audit/SKILL.md adapters/
git commit -m "feat(audit): size the documentation debt into audit.docSurface"
```

---

## Task 11: `retrofit-planner` — the `docs` adoption phase

**Files:**
- Modify: `skills/retrofit-planner/SKILL.md` (insert a phase after `### Phase 6 — \`code\` (dual output)`, before `### Phase 7 — \`cleanup\``)
- Regenerate: `adapters/**`

**Interfaces:**
- Consumes: `audit.docSurface` (Task 10), the doc-authoring step (Task 8), the code-render step (Task 9), the `docs` phase in `retrofit.phase` (Task 6).
- Produces: an executed, gated doc-adoption phase.

- [ ] **Step 1: Insert the phase**

Insert this section (the sequence header already says "confirm between EVERY
phase", so this phase inherits the confirmation gate):

```markdown
### Phase 6.5 — `docs` (adopt existing documentation, then fill gaps)

Set `retrofit.phase = "docs"`. Bring the documentation layer onto the system's
components **adopt-first**, so no existing human-written doc is lost:

1. **Adopt.** For each component, run the doc-authoring ingest (Step 4.5 of
   `component-builder`): read existing code JSDoc/MDX/README and Figma
   `description`, seed the canonical `.doc.json` marked `provenance: imported`, and
   stamp fingerprints. This first pass **claims** existing content — it is not a
   re-render and must not overwrite it.
2. **Fill gaps.** Run the remaining generation layers (infer → enrich → specialize
   → interview) only for blocks the adoption did not populate; the user approves.
3. **Project + gate.** Render the code surfaces (Step 5.5 of
   `storybook-chromatic-builder`), run `docs:digest`, and run `docs:check` — it
   should pass (surfaces just rendered) with Figma surfaces `edit-unverified`.

Confirm with the user before writing, consistent with every other phase. On a large
system, size the batch from `audit.docSurface` and adopt in reviewable chunks.
```

- [ ] **Step 2: Update the safe-sequence overview**

Near `## The safe sequence (confirm between EVERY phase)`, update the phase list so
`docs` appears between `code` and `cleanup` (matching the manifest enum from Task
6).

- [ ] **Step 3: Regenerate adapters + verify**

Run: `node scripts/adapters/generate.mjs && node ci/validate-skills.mjs && node scripts/adapters/generate.mjs --check`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add skills/retrofit-planner/SKILL.md adapters/
git commit -m "feat(retrofit-planner): docs adoption phase (adopt-first, then fill gaps)"
```

---

## Task 12: `repository-builder` — adopt the doc store + wire the CI gate

**Files:**
- Modify: `skills/repository-builder/SKILL.md`
- Regenerate: `adapters/**`

**Interfaces:**
- Consumes: the folder-resident store (Task 8), `docs:check` (Task 3). Produces: the store under git + `docs:check` in the repo's CI.

- [ ] **Step 1: Find where the skill scaffolds/moves files into the monorepo**

Run: `grep -n 'design-system.json\|package\|turbo\|CI\|workflow' skills/repository-builder/SKILL.md | head -30`
Expected: shows where the skill sets up packages / git / CI.

- [ ] **Step 2: Add the adoption + gate instructions**

Add this subsection where the skill brings the working folder under git / sets up
CI:

```markdown
### Adopt the documentation store

The folder-resident documentation store at `design-system/docs/` (canonical
`*.doc.json` records plus the generated `index.json` + `llms.txt`) already exists
from the Figma phase. Bring it under version control as-is — **do not relocate it**
(the path is stable across folder→repo, and every manifest `doc.path` points at it).
Ensure it is committed (not git-ignored).

Wire the documentation drift gate into the repo's verification so it runs in CI
alongside `tokens:validate`: add a `docs:check` step (the `docs-check.mjs` script is
installed by `storybook-chromatic-builder`; if code hasn't been set up yet, note
that the gate comes online with the Storybook step). `docs:check` exits non-zero on
drift; Figma surfaces report `edit-unverified` and are checked in a Figma session.
```

- [ ] **Step 3: Regenerate adapters + verify**

Run: `node scripts/adapters/generate.mjs && node ci/validate-skills.mjs && node scripts/adapters/generate.mjs --check`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add skills/repository-builder/SKILL.md adapters/
git commit -m "feat(repository-builder): adopt the docs store into git + wire docs:check into CI"
```

---

## Task 13: `/document-component` command + CHANGELOG + full CI

**Files:**
- Create: `commands/document-component.md`
- Modify: `CHANGELOG.md`
- Regenerate: `adapters/**`

**Interfaces:**
- Consumes: the doc-authoring step (Task 8), the render step (Task 9), `docs:check` (Task 3). Produces: the manual author/refresh/reconcile entry point.

- [ ] **Step 1: Create the command**

Create `commands/document-component.md`:

```markdown
---
description: Author, refresh, or reconcile the usage documentation for one existing component — draft its canonical doc record from four sources, project it to Figma, the doc card, and code, and resolve any drift via a reviewable per-item choice.
---

Document a single existing component end to end, using the settings already in
`design-system.json` (`project.uiFramework`, `figma.mechanism`, `sync.platforms`)
rather than re-asking configuration. Scale explanation to `user.codingLevel`.

Ask which component to document (e.g. "Button"), then:

1. **Author/refresh the record.** Run the doc-authoring pipeline from the
   `component-builder` skill's *Author the documentation record* step — ingest any
   existing docs first (brownfield), then infer → enrich (from
   `${CLAUDE_PLUGIN_ROOT}/references/component-doc-archetypes.md`) → specialize →
   interview. The user approves the drafted record; `imported`/`user` blocks are
   never overwritten.
2. **Project it.** Write `design-system/docs/components/<Name>.doc.json`, set the
   Figma component `description`, enrich the doc card, and (if the repo/code side
   exists) render MDX/JSDoc and run `docs:digest` per the
   `storybook-chromatic-builder` render step.
3. **Reconcile drift.** Run `docs:check`. For each drifted surface, offer a per-item
   choice — **re-render** (canonical wins) or **pull-back** (fold the surface edit
   into the record) — and land the result as a reviewable change. On a brownfield
   component's first pass, adopt existing content (`provenance: imported`) rather
   than overwriting it.

See `${CLAUDE_PLUGIN_ROOT}/references/component-doc-schema.md` for the record schema,
fingerprint contract, and projection mapping. If a component was never built in
Figma, point the user at `component-builder` first.
```

- [ ] **Step 2: Add CHANGELOG entries**

Under `## [Unreleased]` in `CHANGELOG.md`, add:

```markdown
### Added
- **Component documentation layer ("ThroughLine Docs").** Every component gets a
  structured, AI-first canonical doc record (`design-system/docs/components/<Name>.doc.json`)
  authored from four sources (ingest existing → infer from the built artifact →
  enrich from a best-practice archetype knowledge base → specialize to the target
  framework → user interview, with per-block `provenance`). It is projected to the
  Figma component `description` field, the enriched doc card, Storybook
  autodocs/MDX + JSDoc, and an AI digest (`index.json` + `llms.txt`). A `docs:check`
  gate fingerprints every surface and reports drift for per-item reviewable
  reconciliation. New `docs:digest`/`docs:check` scripts, `component-doc-schema.md`
  + `component-doc-archetypes.md` references, a `/document-component` command, and
  manifest schemaVersion 5 (`components.meta[name].doc`, `audit.docSurface`, `docs`
  retrofit phase). Covers greenfield and brownfield (adopt-first, never clobbers
  existing docs).
```

- [ ] **Step 3: Regenerate adapters**

Run: `node scripts/adapters/generate.mjs`
Expected: regenerated summary including the new command; no error.

- [ ] **Step 4: Run the full CI gate suite**

Run: `node --test`
Expected: PASS — all suites.

Run: `node ci/validate-plugin.mjs`
Expected: PASS.

Run: `node ci/validate-skills.mjs`
Expected: PASS — count now includes the new command.

Run: `node scripts/adapters/generate.mjs --check`
Expected: PASS — no drift.

- [ ] **Step 5: Commit**

```bash
git add commands/document-component.md CHANGELOG.md adapters/
git commit -m "feat(docs): /document-component command + changelog for the documentation layer"
```

---

## Self-Review

**Spec coverage** (design spec §-by-§):
- Architecture / one-source-many-surfaces → Tasks 1, 8, 9 (canonical record + projections).
- Folder-resident canonical store → Task 1 + Task 8 (write at build time) + Task 12 (adopt into git).
- Content model (trimmed v1 core) → Task 1 schema (required/optional/deferred fields match spec exactly).
- Generation pipeline (4 sources) → Task 8 Step 1 (+ ingest source 0) + Task 7 (archetype KB).
- Projection mapping → Task 1 table + Tasks 8 (Figma/card) + 9 (MDX/JSDoc/digest).
- Sync/drift (fingerprint, docs:check, stale/edited, per-item reconcile, brownfield adopt-first) → Tasks 2 (fingerprint), 3 (check), 13 (reconcile via command).
- AI digest (llms.txt + index.json) → Task 4.
- Skills touched (component-builder, storybook, repository-builder, design-system-audit, retrofit-planner) → Tasks 8, 9, 12, 10, 11.
- New command /document-component → Task 13.
- Manifest schemaVersion 5 → Task 6.
- New reference (schema) + archetype KB → Tasks 1, 7.
- Retrofit lane (ingest, audit sizing, adopt-first, retrofit-planner phase) → Tasks 8 (ingest), 10 (sizing), 11 (phase), 6 (phase enum).
- Phasing (components-only v1) → whole plan is components-only; token docs untouched.
- Success criteria 1–6 → exercised across Tasks 8 (folder-stage authoring), 9 (code render), 3 (drift classes), 8 (provenance preservation), 6 (migration), 8+10+11 (retrofit).

**Placeholder scan:** the `"…"` strings appear only inside illustrative schema examples (Task 1) and archetype seeds — they are example content, not plan placeholders; every executable step has concrete code or concrete markdown. No TBD/TODO.

**Type consistency:** `canonicalFingerprint`, `fingerprint`, `loadRecord`, `stableStringify`, `validateRecord` (Task 2) are used with identical names/signatures in Tasks 3 and 4. `classifySurface`/`checkComponent`/`checkAll` (Task 3) match their tests. The manifest `doc` shape (`{ path, fingerprint, surfaces: { <name>: { src, render, file? } } }`) is identical across Task 1 (contract), Task 6 (manifest doc), Task 8 (write Figma/card surfaces), Task 9 (write storybookMdx surface), and Task 3 (read). Surface names (`figmaDescription`, `docCard`, `storybookMdx`) are consistent throughout.
