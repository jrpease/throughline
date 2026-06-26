# Brownfield Retrofit — Plan 3: Audit + Retrofit-Planner Skills, Brownfield Branches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the rest of the brownfield capability — the `design-system-audit` front-door skill, the `retrofit-planner` orchestrator, the color-usage grep scaffold + binding-survival audit snippet, the brownfield branches of the four existing skills (`figma-environment-setup`, `token-builder`, `token-sync-layer`, `storybook-chromatic-builder`), the B3 detect-or-ask publish-state behavioral fix, and the `/design-system-status` + `/start` surfacing — closing every carry-forward risk the spec assigned to Plan 3.

**Architecture:** Plan 1 laid the foundation (manifest v4 with `audit`/`tokenCrosswalk`/`retrofit` sections, `references/brownfield-retrofit.md`, the B1/B2/B4 read-discipline docs in `figma-scripting.md`). Plan 2 shipped the crosswalk backbone (schema, scripts, `token-crosswalk-builder`). Plan 3 wires the brownfield path end-to-end so a real retrofit can run: a new PROCESS skill (`design-system-audit`) measures both sides of a mature system, a new orchestrator (`retrofit-planner`) sequences the safe 7-phase retrofit with a human gate per phase, and the four greenfield skills gain *additive* brownfield branches that all read the canonical `brownfield-retrofit.md` at the right moment. The one new executable is `scripts/grep-color-usage.mjs` — a repo-shaped scaffold (ships sensible default patterns, logs assumed-vs-detected) that the audit skill runs against the user's repo; everything else is markdown skill/reference/command edits. Greenfield paths stay untouched; brownfield is added strictly as branches.

**Tech Stack:** Node.js (≥18) ESM for the one new script, `node:test` + `node:assert` (zero deps, matching `scripts/` house style). Markdown for the skills, references, and commands, matching the house style in `skills/`, `references/`, and `commands/`. The audit skill consumes the Figma Console MCP per-class read tools (`figma_get_variables`, `figma_get_text_styles`, `figma_get_styles`) under the read discipline; `retrofit-planner` invokes sub-skills via the Skill tool (mirroring `component-pipeline`).

---

## Scope & boundaries

**In scope (this plan — closes §4.1, §4.3, §5, §6 remainder, and all Plan-3 carry-forward risks in §11):**
- `scripts/grep-color-usage.mjs` + `scripts/grep-color-usage.test.mjs` — the color-usage grep scaffold (§6 skill-adapted).
- `references/figma-scripting.md` — add the binding-survival audit `figma_execute` snippet (§6 "stays in references/").
- `skills/design-system-audit/SKILL.md` — the brownfield front-door PROCESS skill (§4.1).
- `skills/retrofit-planner/SKILL.md` — the orchestrator (§4.3).
- Brownfield branches (§5): `figma-environment-setup` (detection + routing + baseline), `token-builder` (refine-in-place), `token-sync-layer` + `references/sync-adapters.md` (transforms), `storybook-chromatic-builder` (baseline-before-retrofit + verification triad).
- B3 behavioral fix (§10/§11): `references/figma-publishing.md` + `skills/component-builder/SKILL.md` — detect-or-ask publish state.
- `commands/design-system-status.md` — surface `audit` / `tokenCrosswalk` / `retrofit` (§11).
- `commands/start.md` — brownfield/resume routing note (§11; substantive routing lands in `figma-environment-setup`, Task 4).
- `CHANGELOG.md` — `[Unreleased]` entry.

**Deliberately out of scope:**
- **Plugin CI / automated SKILL.md + manifest-schema validation** — §11 marks this "cross-cutting (not plan-specific)". Markdown self-checks + review remain the net, as in Plans 1–2. Noted, not built.
- **Automating Figma library publishing** — §9: never publish, only detect-or-ask (that *is* in scope, via B3).
- **Non-color token retrofits** beyond the crosswalk pattern already shipped (§9).
- **Rewriting greenfield skill paths** — §9: brownfield is added as branches only.

---

## File Map

| Action | File | What changes |
|---|---|---|
| Create | `scripts/grep-color-usage.mjs` | `DEFAULT_CATEGORIES`, `walk`, `scanFile`, `grepColorUsage`, CLI `main()` — repo-shaped color-surface sizer (logs assumed vs detected patterns) |
| Create | `scripts/grep-color-usage.test.mjs` | Tests: per-category counting, file-type gating, excludes, custom-config override |
| Modify | `references/figma-scripting.md` | Add the **binding-survival audit** `figma_execute` snippet (count bindings before/after a rename) |
| Create | `skills/design-system-audit/SKILL.md` | The brownfield front-door PROCESS skill — sizes code surface, inventories Figma per-class, computes `percentSemantic`, owns `audit.*`, sets `tokens.intakeMode: "retrofit"` |
| Create | `skills/retrofit-planner/SKILL.md` | The orchestrator — gated 7-phase safe sequence, decision-journal offer, owns `retrofit.*`, appends `completedSkills` |
| Modify | `skills/figma-environment-setup/SKILL.md` | Brownfield detection + routing to `design-system-audit`, resume routing on `retrofit.phase`, pre-mutation baseline checkpoint |
| Modify | `skills/token-builder/SKILL.md` | Refine-in-place branch (rename preserving IDs, binding-survival audit, never delete-and-recreate) |
| Modify | `skills/token-sync-layer/SKILL.md` | Brownfield transforms: alpha channels, float32 rounding at export boundary, `/opacity`→`color-mix` |
| Modify | `references/sync-adapters.md` | Document the brownfield value transforms (channel alpha, float rounding, `color-mix`) |
| Modify | `skills/storybook-chromatic-builder/SKILL.md` | Baseline-before-retrofit guidance + the verification triad + the `tsc`-blind / story-unreachable warnings |
| Modify | `references/figma-publishing.md` | B3: detect-first (`figma_get_library_components`/`_variables`), then ask-once, then persist |
| Modify | `skills/component-builder/SKILL.md` | B3: treat default/`false` `libraryPublished` as *unverified*; gate the upgrade pass on confirmed-true |
| Modify | `commands/design-system-status.md` | Report `audit` / `tokenCrosswalk` / `retrofit`; suggest next brownfield step |
| Modify | `commands/start.md` | Note that an existing/in-progress system routes into the audit / resumes mid-retrofit |
| Modify | `CHANGELOG.md` | `[Unreleased]` entry for the Plan-3 skills, branches, script, and B3 fix |

---

## Dependency order (why the tasks run in this sequence)

1. **Task 1** (color-usage grep) — a dependency of `design-system-audit` (it runs the script). Build and test it first.
2. **Task 2** (binding-survival audit snippet) — a dependency of both `design-system-audit` (feeds `figmaInventory.bindings`) and the `token-builder` brownfield branch. Doc-only.
3. **Task 3** (`design-system-audit`) — consumes Tasks 1 & 2; writes `audit.*`; the front door every later skill reads.
4. **Task 4** (`figma-environment-setup` branch) — routes *into* `design-system-audit` (Task 3 must exist to name it) and resumes on `retrofit.phase`.
5. **Tasks 5–7** (brownfield branches in `token-builder`, `token-sync-layer`, `storybook-chromatic-builder`) — independent of each other; all read `brownfield-retrofit.md`.
6. **Task 8** (B3 fix) — independent; touches `figma-publishing.md` + `component-builder`.
7. **Task 9** (`retrofit-planner`) — orchestrates Tasks 3, 5, 6, 7 and the existing `token-crosswalk-builder`; written after the skills it sequences exist.
8. **Task 10** (`/design-system-status` + `/start` surfacing) — reports sections the earlier tasks populate.
9. **Task 11** (CHANGELOG + plugin-level self-review).

---

## Task 1: Color-usage grep scaffold (`scripts/grep-color-usage.mjs`)

The surface-measurement worklist generator (spec §4.1 step 1, §6 "skill-adapted scaffold"). Counts the five color-decision categories from the case study (SCSS color vars 692, Tailwind color classes 230, `Colors.*` 74, raw hex+rgba ~143, SVG fills 430). It is **inherently repo-shaped**, so it ships sensible default patterns **and** accepts a `--config` override; per §11 it must **log plainly which categories used the assumed defaults vs. a detected/override pattern**, so coverage is never silently partial. Matches the zero-dependency `node:test` house style of the existing `scripts/`.

**Files:**
- Create: `scripts/grep-color-usage.mjs`
- Test: `scripts/grep-color-usage.test.mjs`

- [ ] **Step 1.1: Write the failing test**

  Create `scripts/grep-color-usage.test.mjs`:

  ```javascript
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { grepColorUsage, scanFile, DEFAULT_CATEGORIES } from './grep-color-usage.mjs';

  function fixtureTree() {
    const root = mkdtempSync(join(tmpdir(), 'grep-color-'));
    // SCSS color vars + a raw hex literal on the same file
    writeFileSync(join(root, 'theme.scss'), '$primary-red: #ff0000;\n$grey-900: #111827;\n.x { color: $primary-red; }\n');
    // Tailwind color classes + a Colors.* usage
    writeFileSync(join(root, 'App.tsx'), 'const c = "bg-primary-red text-grey-900";\nconst d = Colors.primaryRed;\n');
    // SVG hardcoded fill (and one that must be ignored)
    writeFileSync(join(root, 'logo.svg'), '<path fill="#ff0000"/><path fill="none"/><path fill="currentColor"/>\n');
    // excluded surfaces
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'pkg', 'index.ts'), 'const m = "bg-primary-red";\n');
    mkdirSync(join(root, 'generated'), { recursive: true });
    writeFileSync(join(root, 'generated', 'tokens.scss'), '$primary-red: #ff0000;\n');
    writeFileSync(join(root, 'App.test.tsx'), 'const t = "bg-primary-red";\n');
    return root;
  }

  test('scanFile counts SCSS color vars in a .scss file', () => {
    const root = fixtureTree();
    const counts = scanFile(join(root, 'theme.scss'), DEFAULT_CATEGORIES);
    // $primary-red (decl + usage) + $grey-900 = 3 occurrences
    assert.equal(counts.scssColorVars, 3);
  });

  test('scanFile counts raw hex + rgba in any source file', () => {
    const root = fixtureTree();
    const counts = scanFile(join(root, 'theme.scss'), DEFAULT_CATEGORIES);
    assert.equal(counts.rawHexRgba, 2); // #ff0000 and #111827
  });

  test('scanFile counts Tailwind color classes and Colors.* usages in .tsx', () => {
    const root = fixtureTree();
    const counts = scanFile(join(root, 'App.tsx'), DEFAULT_CATEGORIES);
    assert.equal(counts.tailwindColorClasses, 2); // bg-primary-red, text-grey-900
    assert.equal(counts.jsColorsUsages, 1);        // Colors.primaryRed
  });

  test('scanFile counts SVG fills but ignores none/currentColor', () => {
    const root = fixtureTree();
    const counts = scanFile(join(root, 'logo.svg'), DEFAULT_CATEGORIES);
    assert.equal(counts.svgFills, 1); // only fill="#ff0000"
  });

  test('file-type gating: tailwind pattern does not apply to .scss', () => {
    const root = fixtureTree();
    const counts = scanFile(join(root, 'theme.scss'), DEFAULT_CATEGORIES);
    assert.equal(counts.tailwindColorClasses, 0);
  });

  test('grepColorUsage aggregates counts and honors excludes', () => {
    const root = fixtureTree();
    const { counts } = grepColorUsage(root, DEFAULT_CATEGORIES);
    assert.equal(counts.scssColorVars, 3);      // generated/tokens.scss excluded
    assert.equal(counts.tailwindColorClasses, 2); // node_modules + .test.tsx excluded
    assert.equal(counts.jsColorsUsages, 1);
    assert.equal(counts.rawHexRgba, 3);          // 2 in theme.scss + 1 in logo.svg
    assert.equal(counts.svgFills, 1);
  });

  test('grepColorUsage reports per-file hits only for files with matches', () => {
    const root = fixtureTree();
    const { byFile } = grepColorUsage(root, DEFAULT_CATEGORIES);
    const files = byFile.map((f) => f.file).sort();
    assert.deepEqual(files, ['App.tsx', 'logo.svg', 'theme.scss']);
  });

  test('a custom category config overrides the defaults', () => {
    const root = fixtureTree();
    const custom = { brandColors: { files: /\.scss$/, pattern: /\$primary-[\w-]+/g } };
    const { counts } = grepColorUsage(root, custom);
    assert.deepEqual(Object.keys(counts), ['brandColors']);
    assert.equal(counts.brandColors, 2); // decl + usage of $primary-red
  });
  ```

- [ ] **Step 1.2: Run the test to verify it fails**

  Run: `node --test scripts/grep-color-usage.test.mjs`
  Expected: FAIL — `Cannot find module '.../scripts/grep-color-usage.mjs'`.

- [ ] **Step 1.3: Write the implementation**

  Create `scripts/grep-color-usage.mjs`:

  ```javascript
  // Color-usage grep scaffold: size a codebase's color-decision surface by category.
  // Repo-shaped by nature — ships sensible DEFAULT_CATEGORIES and accepts a --config
  // override; logs which categories used the assumed default vs. a detected pattern so
  // coverage is never silently partial. Zero dependencies.
  //
  // Usage:
  //   node grep-color-usage.mjs --root <dir> [--config <patterns.json>] [--out <counts.json>]
  //     patterns.json: { "<category>": { "files": "<regex>", "pattern": "<regex with g flag>" }, ... }
  import { readFileSync, readdirSync, statSync } from 'node:fs';
  import { join, relative } from 'node:path';
  import { parseArgs } from 'node:util';
  import { pathToFileURL } from 'node:url';

  // The five categories from the case study. Each: which files it applies to, and the
  // (global) match pattern. Tuned defaults — design-system-audit may override per repo.
  export const DEFAULT_CATEGORIES = {
    scssColorVars: {
      files: /\.(scss|sass|css)$/,
      pattern: /\$[\w-]*(?:color|colour|primary|secondary|tertiary|grey|gray|red|blue|green|yellow|orange|purple|pink|teal|cyan|black|white|brand|accent|surface|ink)[\w-]*/gi,
    },
    tailwindColorClasses: {
      files: /\.(tsx?|jsx?|html|vue|svelte)$/,
      pattern: /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|placeholder|caret|accent|shadow)-(?:primary|secondary|tertiary|grey|gray|red|blue|green|yellow|orange|purple|pink|teal|cyan|brand|accent|surface|ink)[\w-]*/g,
    },
    jsColorsUsages: {
      files: /\.(tsx?|jsx?|mjs|cjs)$/,
      pattern: /\bColors\.[A-Za-z_$][\w$]*/g,
    },
    rawHexRgba: {
      files: /\.(scss|sass|css|tsx?|jsx?|vue|svelte|html|svg)$/,
      pattern: /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g,
    },
    svgFills: {
      files: /\.svg$/,
      pattern: /(?:fill|stroke)="(?!none|currentColor|url\()[^"]+"/g,
    },
  };

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

  // Source extensions worth opening at all (union of every category's `files`).
  const SOURCE_EXT = /\.(scss|sass|css|tsx?|jsx?|mjs|cjs|vue|svelte|html|svg)$/;

  export function* walk(root, excludes = DEFAULT_EXCLUDES) {
    for (const entry of readdirSync(root)) {
      const full = join(root, entry);
      if (excludes.some((re) => re.test(full))) continue;
      const st = statSync(full);
      if (st.isDirectory()) {
        yield* walk(full, excludes);
      } else if (SOURCE_EXT.test(full)) {
        yield full;
      }
    }
  }

  // Count matches per category in one file. A category contributes only if its `files`
  // regex matches this path. Returns { <category>: count } for every category key.
  export function scanFile(path, categories) {
    const counts = {};
    for (const key of Object.keys(categories)) counts[key] = 0;
    const text = readFileSync(path, 'utf8');
    for (const [key, { files, pattern }] of Object.entries(categories)) {
      if (!files.test(path)) continue;
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      const m = text.match(re);
      counts[key] = m ? m.length : 0;
    }
    return counts;
  }

  export function grepColorUsage(root, categories = DEFAULT_CATEGORIES, excludes = DEFAULT_EXCLUDES) {
    const counts = {};
    for (const key of Object.keys(categories)) counts[key] = 0;
    const byFile = [];
    for (const file of walk(root, excludes)) {
      const fileCounts = scanFile(file, categories);
      const total = Object.values(fileCounts).reduce((a, b) => a + b, 0);
      if (total > 0) {
        byFile.push({ file: relative(root, file), counts: fileCounts });
        for (const key of Object.keys(fileCounts)) counts[key] += fileCounts[key];
      }
    }
    return { counts, byFile };
  }

  // Parse a --config JSON of { category: { files, pattern } } string regexes into RegExp.
  function loadCategories(path) {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const out = {};
    for (const [key, { files, pattern }] of Object.entries(raw)) {
      out[key] = { files: new RegExp(files), pattern: new RegExp(pattern, 'g') };
    }
    return out;
  }

  function main() {
    const { values } = parseArgs({
      options: {
        root: { type: 'string' },
        config: { type: 'string' },
        out: { type: 'string' },
      },
    });
    if (!values.root) {
      console.error('usage: grep-color-usage.mjs --root <dir> [--config <patterns.json>] [--out <counts.json>]');
      process.exit(2);
    }
    const categories = values.config ? loadCategories(values.config) : DEFAULT_CATEGORIES;
    // §11: never let coverage be silently partial — say which patterns were assumed.
    const source = values.config ? `detected (from ${values.config})` : 'ASSUMED defaults';
    console.log(`color-usage grep — pattern source: ${source}`);
    console.log(`categories: ${Object.keys(categories).join(', ')}`);

    const { counts, byFile } = grepColorUsage(values.root, categories);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log('\ncolor-decision surface:');
    for (const [key, n] of Object.entries(counts)) {
      console.log(`  ${key.padEnd(24)} ${n}`);
    }
    console.log(`  ${'TOTAL'.padEnd(24)} ${total}  (across ${byFile.length} file(s))`);
    if (!values.config) {
      console.log('\nnote: patterns are the shipped defaults. Tune them to this repo and re-run with --config for accurate counts.');
    }

    if (values.out) {
      const { writeFileSync } = require('node:fs');
      writeFileSync(values.out, JSON.stringify({ counts, byFile }, null, 2) + '\n');
      console.log(`\nwrote ${values.out}`);
    }
  }

  if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
  }
  ```

  > **Note on `--out`:** `require` is not available in ESM. Replace the `--out` write block with a top-level `import { writeFileSync } from 'node:fs';` — add `writeFileSync` to the existing `node:fs` import line (`import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';`) and drop the inner `const { writeFileSync } = require('node:fs');`. (Kept explicit here so the engineer doesn't miss it — ESM has no `require`.)

- [ ] **Step 1.4: Apply the ESM `writeFileSync` fix from the note above**

  Edit the import line to:

  ```javascript
  import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
  ```

  And replace the `--out` block body with:

  ```javascript
    if (values.out) {
      writeFileSync(values.out, JSON.stringify({ counts, byFile }, null, 2) + '\n');
      console.log(`\nwrote ${values.out}`);
    }
  ```

- [ ] **Step 1.5: Run the test to verify it passes**

  Run: `node --test scripts/grep-color-usage.test.mjs`
  Expected: PASS (`# pass 8`, `# fail 0`).

- [ ] **Step 1.6: Run the full script suite (no regressions)**

  Run (from the repo root): `node --test`
  Expected: all green — `# tests 43`, `# pass 43`, `# fail 0` (the 35 from Plan 2 + 8 here).
  Use bare `node --test` (auto-discovers `**/*.test.mjs`); not `node --test scripts/`.

- [ ] **Step 1.7: Commit**

  ```bash
  git add scripts/grep-color-usage.mjs scripts/grep-color-usage.test.mjs
  git commit -m "feat: color-usage grep scaffold — sizes the color-decision surface by category"
  ```

---

## Task 2: Binding-survival audit snippet (`references/figma-scripting.md`)

Per spec §6, the binding-survival audit **stays in `references/`** because it runs in Figma via `figma_execute`, not in the repo. It counts variable bindings before and after a rename so the `token-builder` refine-in-place branch (Task 5) can prove guardrail 3 held (delete-and-recreate would zero the count). It also feeds `audit.figmaInventory.bindings` (Task 3). Add it in the existing gotcha/snippet format.

**Files:**
- Modify: `references/figma-scripting.md`

- [ ] **Step 2.1: Add the binding-survival audit section**

  Open `references/figma-scripting.md`. It currently ends with the section
  `## Large wrapped auto-layout (`layoutWrap = "WRAP"`) is expensive — chunk it`.
  Append this new section at the end of the file:

  ````markdown

  ## Binding-survival audit: count variable bindings before and after a rename

  A brownfield retrofit renames variables **in place** to preserve their Figma IDs
  (guardrail 3 in `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md` — a
  delete-and-recreate unbinds every consumer). The only way to *prove* a rename kept
  its bindings is to count consuming bindings before and after. Run this read with
  the dedicated tooling where possible (`figma_get_variables`), or via `figma_execute`
  when you need the raw consumer count.

  A variable's bindings are not enumerable directly, so count **consumers**: nodes and
  styles whose bound properties reference each variable id. The robust, `dynamic-page`-safe
  approach is to snapshot the total consumer count across the file before the rename,
  rename in place, then re-snapshot and assert equality.

  ```js
  // dynamic-page safe: load everything, then walk consumers counting variable refs.
  await figma.loadAllPagesAsync();

  function countBoundVariableRefs(node, tally) {
    const bv = node.boundVariables;
    if (bv) {
      for (const key of Object.keys(bv)) {
        const entry = bv[key];
        const refs = Array.isArray(entry) ? entry : [entry];
        for (const r of refs) {
          if (r && r.id) tally[r.id] = (tally[r.id] || 0) + 1;
        }
      }
    }
    if ('children' in node) {
      for (const child of node.children) countBoundVariableRefs(child, tally);
    }
    return tally;
  }

  const tally = {};
  for (const page of figma.root.children) countBoundVariableRefs(page, tally);
  const totalBindings = Object.values(tally).reduce((a, b) => a + b, 0);
  // Report totalBindings (and tally per id) BEFORE the rename; re-run AFTER and
  // assert the total is unchanged. A drop means a binding was severed — STOP and
  // investigate (almost always a delete-and-recreate slipped in).
  ```

  - **Pass an explicit `timeout`** (this walks every node — size it per the batch-timeout
    rule above; a large file needs tens of seconds).
  - **Style bindings count too.** Text/effect/paint styles can bind variables; include a
    pass over `getLocalTextStylesAsync()` / `getLocalPaintStylesAsync()` /
    `getLocalEffectStylesAsync()` and their `boundVariables` if the file uses style-level
    bindings.
  - **This is the number `design-system-audit` records** as
    `audit.figmaInventory.bindings`, and the before/after gate the `token-builder`
    brownfield branch runs around every rename.
  ````

- [ ] **Step 2.2: Self-review**

  Confirm: the snippet uses `await figma.loadAllPagesAsync()` (read discipline / B1),
  the async `dynamic-page`-safe forms, and mentions the explicit `timeout` (consistent
  with the existing batch-timeout section). Confirm it cross-links
  `brownfield-retrofit.md` guardrail 3 and names the `audit.figmaInventory.bindings`
  field exactly as in `references/manifest-schema.md`. Fix any drift inline.

- [ ] **Step 2.3: Commit**

  ```bash
  git add references/figma-scripting.md
  git commit -m "docs: binding-survival audit snippet — count variable bindings before/after a rename"
  ```

---

## Task 3: `design-system-audit` skill — the brownfield front door

Spec §4.1. A PROCESS skill that runs after `figma-environment-setup` detects brownfield, before any building. Sizes the code surface (Task 1's grep), inventories the Figma file with **verified per-class reads** (read discipline), computes `percentSemantic`, writes the `audit` section, sets `tokens.intakeMode: "retrofit"`, and recommends the next step. Per §11, it must **detect the repo's actual tooling rather than assume the case-study stack**, and **log assumed-vs-detected** grep patterns.

**Files:**
- Create: `skills/design-system-audit/SKILL.md`

- [ ] **Step 3.1: Create the skill**

  Create `skills/design-system-audit/SKILL.md` with exactly this content:

  ````markdown
  ---
  name: design-system-audit
  description: Measure a pre-existing design system before retrofitting it onto tokens — size the code-side color surface and inventory the existing Figma file with verified per-class reads, then compute how semantic the system already is so the retrofit is right-sized. This is a PROCESS skill and the brownfield front door. Use this when retrofitting a design system onto a mature codebase and an already-populated Figma file, when the user wants to audit an existing system, size a retrofit, count existing tokens/variables/bindings, or figure out how much work a migration is. Also trigger when figma-environment-setup detects a brownfield situation (existing repo or populated Figma file), before any building. Make sure to use this whenever someone is converging two mature, drifted artifacts rather than building greenfield.
  ---

  # Design-system audit (brownfield front door)

  Measures **both sides** of a pre-existing system so a retrofit can be right-sized,
  before anything is built or changed. It is the brownfield analog of
  `/design-system-status`: where status reports a *local* manifest, this assesses an
  *external, mature* system — a real codebase and an already-populated Figma file.

  This is a brownfield skill. **Before doing anything, read**
  `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md` — especially the
  read-discipline principle (never assert absence without a verified read) and the
  `audit` phase of the safe sequence. Greenfield builds skip this skill entirely.

  ## Calibrate

  Read `user.codingLevel` (`${CLAUDE_PLUGIN_ROOT}/references/coding-level.md`) and scale
  explanation accordingly. The audit surfaces grep counts and a `percentSemantic`
  number — for `new` users explain what each means and why it matters (it decides
  rename-vs-rewrite); for `comfortable` users be terse. The measurements are identical
  across levels.

  ## Prerequisites

  Read the manifest. This skill needs Figma connected (`figma.connected: true`) for the
  inventory step, and a repo path for the code-surface step (`workspace.localPath`). If
  Figma isn't connected, offer to run `figma-environment-setup` first. The code-surface
  step works on any repo regardless of `workspace.stage`.

  ## Step 1 — Size the code surface

  Measure how many color decisions live in the codebase. Run the color-usage grep
  scaffold against the user's repo:

  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/scripts/grep-color-usage.mjs --root <workspace.localPath>
  ```

  It counts five categories: SCSS color vars, Tailwind color classes, `Colors.*` JS
  usages, raw hex + `rgba()` literals, and SVG hardcoded fills — producing the
  case-study worklist shape.

  **Tune the patterns to the actual repo, and say what you assumed (read discipline +
  §11).** The shipped patterns are *defaults*, not ground truth. Before trusting the
  counts:
  1. Look at the repo's real conventions — open a few SCSS/TS files, check the actual
     color-variable prefixes (`$primary-*`, `$grey-*`, a custom prefix), the Tailwind
     color-class names, and whether colors come through a `Colors.*` object or some other
     accessor.
  2. If the defaults don't fit, write a `--config <patterns.json>` of
     `{ "<category>": { "files": "<regex>", "pattern": "<regex>" } }` tuned to this repo
     and re-run with it.
  3. **Report which categories used the assumed defaults vs. a tuned pattern** — never
     present default-pattern counts as if they were measured. The script prints this; pass
     it through to the user so partial coverage is visible, not hidden.

  **Don't assume the stack.** The categories are color-specific but framework-agnostic; a
  repo with no Tailwind simply scores `0` there. Detect what the repo actually uses (is
  there a `tailwind.config`? SCSS? CSS-in-JS?) and explain the counts in those terms.

  ## Step 2 — Inventory the Figma file (verified per-class reads)

  Variables, text styles, and effect/paint styles are **different surfaces** — read each
  independently and report "none" only for the class whose own read came back empty
  (read discipline, fixes B2). Before counting variables, ensure all pages are loaded
  (`await figma.loadAllPagesAsync()`); treat a `0` on first read as suspect and re-read
  before reporting (fixes B1).

  - **Variables** — `figma_get_variables` (handles `dynamic-page`, resolves aliases).
    Record the count.
  - **Bindings** — run the binding-survival audit snippet in
    `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md` to count consuming bindings.
    This is the load-bearing number: it's what a careless rename would destroy.
  - **Text styles** — `figma_get_text_styles`. Record the count.
  - **Effect/paint styles** — `figma_get_styles`. Record the count.
  - **Modes** — record the mode names per collection (e.g. `["Light", "Dark"]`).

  Never report a count you didn't read. If a read genuinely returns empty after a
  reliable load, that's a real `0`; if it's suspect, re-read or ask the user once and
  persist — never guess.

  ## Step 3 — Compute "% semantic"

  From the inventory, estimate how much of the existing system is already **semantic**
  (named by role — `text/default`, `surface/raised`) vs. **raw/primitive** (named by
  value — `grey-900`, or bare hex). Report it as an integer 0–100 (`audit.percentSemantic`).

  This single number right-sizes the retrofit: a largely-semantic system (~90%) is a
  **rename-in-place + cleanup** job; a low-semantic one is closer to a **rewrite**.
  Surface it early and plainly — "you're ~90% semantic, so this is mostly renames and a
  cleanup, not a rebuild" — so the user calibrates effort before committing.

  ## Step 4 — Write the manifest and recommend the next step

  Write the `audit` section (this skill owns it):

  - `codeSurface` — the per-category counts from Step 1 (keys vary by what the repo uses;
    omit categories that don't apply rather than reporting a misleading `0`).
  - `figmaInventory` — `{ variables, bindings, textStyles, effectStyles, modes }` from
    Step 2's verified reads.
  - `percentSemantic` — the integer from Step 3.
  - `ranAt` — the current ISO timestamp.

  Set `tokens.intakeMode: "retrofit"` (this skill establishes the brownfield path — it
  owns this transition). Append `design-system-audit` to `completedSkills`.

  Then recommend the next step:
  - If the user wants the guided, gated end-to-end retrofit → **`retrofit-planner`**
    (the orchestrator; recommended for multi-session retrofits).
  - If they only want the crosswalk backbone next → **`token-crosswalk-builder`** (it
    reads this `audit` section to seed its rows).

  ## What this skill must NOT do

  - Never build, rename, or delete anything — this is a **measurement** skill. Changes
    belong to `token-builder` (refine), the retrofit phases, and cleanup.
  - Never report a count without a verified read (read discipline). An unexpectedly-empty
    read is a suspected error, not ground truth.
  - Never present default grep patterns as measured truth — say what was assumed.
  - Never assume the case-study stack (Tailwind/SCSS/Chromatic). Detect what the repo
    actually uses and degrade gracefully.
  - Never write another skill's manifest fields (e.g. `tokenCrosswalk`, `retrofit.phase`).
  - Never overwrite `workspace.origin` — it is immutable after intake.
  ````

- [ ] **Step 3.2: Self-review against the spec**

  Open spec §4.1 and §8. Confirm: the four steps match (size code surface → inventory
  per-class → compute % semantic → write `audit` + recommend); the skill writes only
  `audit.*` and sets `tokens.intakeMode: "retrofit"` and appends `completedSkills`
  (ownership honored); the `audit` field names match `references/manifest-schema.md`
  (`ranAt`, `codeSurface`, `figmaInventory.{variables,bindings,textStyles,effectStyles,modes}`,
  `percentSemantic`). Confirm the description marks it PROCESS and triggers on brownfield
  detection (compare house style to other skills' frontmatter). Confirm §11 carry-forwards
  are honored: assumed-vs-detected logging (Step 1), don't-hardcode-stack (Steps 1, 4,
  must-NOT), read discipline (Step 2). Fix any drift inline.

- [ ] **Step 3.3: Commit**

  ```bash
  git add skills/design-system-audit/SKILL.md
  git commit -m "feat: design-system-audit skill — brownfield front door (size + inventory + % semantic)"
  ```

---

## Task 4: Brownfield branch in `figma-environment-setup` (detection + routing + baseline)

Spec §5 row 1, and §11 "close the interim inventory gap" / "surface in /start". Now that `design-system-audit` exists (Task 3), wire the front door: route a mature codebase (and, once connected, a populated Figma file) into the audit; resume an in-progress retrofit at its `retrofit.phase`; and capture a rollback baseline **before any mutation** of a populated file. The B1/B2/B4 read-discipline already lives in this skill's Step 6 and in `figma-scripting.md` (Plan 1) — this task adds routing and the baseline, not the read fixes.

**Files:**
- Modify: `skills/figma-environment-setup/SKILL.md`

- [ ] **Step 4.1: Add a brownfield line to the Phase 3 brief (existing-repo / existing-monorepo)**

  In `skills/figma-environment-setup/SKILL.md`, find the Phase 3 brief block for the
  existing-repo scenario. It currently contains this line:

  ```
  through that step-by-step when we get there — it's a one-time setup.
  ```

  Immediately after the existing-repo "what that means for us" paragraph (and the
  analogous existing-monorepo one), the brief should set the expectation that a mature
  system gets *audited* first. Add this sentence to both the existing-repo and
  existing-monorepo briefs (append to the "what that means for us" paragraph):

  ```
  Because you already have a system here, we'll start by **auditing** what exists —
  measuring your current colors in code and what's in your Figma file — so we right-size
  the work before changing anything. That's the `design-system-audit` step.
  ```

  (Insert it as the closing sentence of each of those two scenarios' "what that means
  for us" paragraphs. Leave the greenfield and unknown scenarios unchanged.)

- [ ] **Step 4.2: Add the brownfield routing + baseline section before "What this skill must NOT do"**

  Find the final section, which begins exactly:

  ```
  ## What this skill must NOT do

  - Never set up git or GitHub (wrong phase — that's repository-builder).
  ```

  Insert this new section **immediately before** that `## What this skill must NOT do`
  heading:

  ````markdown
  ## Step 8 — Brownfield routing + rollback baseline (existing systems)

  After the liveness check passes, decide where to send the user. Most greenfield runs
  continue to token building. A **brownfield** run — a mature codebase and/or an
  already-populated Figma file — routes into the audit first, and an **in-progress
  retrofit** resumes where it left off. This is the front-door routing the spec calls
  for; apply the read discipline in
  `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md` to every read here.

  **Read the manifest and route:**

  1. **Resume an in-progress retrofit.** If `retrofit.phase` is set and not `"done"`,
     a retrofit is already underway — hand back to **`retrofit-planner`** to resume at
     that phase, rather than starting anything new. Say plainly where it left off
     (e.g. "Looks like we're mid-retrofit at the `sync` phase — want to pick up there?").
  2. **Route a mature system to the audit.** If `workspace.origin` is `"existing-repo"`
     or `"existing-monorepo"` (a mature codebase), recommend **`design-system-audit`**
     as the next step instead of `token-builder`: "You've got an existing system — let's
     audit it first so we right-size the retrofit." The audit also covers a populated
     Figma file via its verified per-class reads.
  3. **Greenfield stays greenfield.** If `workspace.origin` is `"greenfield"`, continue
     the normal path (brainstorm → token-builder). Don't push greenfield users through
     the audit.

  **Capture a rollback baseline before any mutation (brownfield only).** A retrofit
  changes a file that already has value in it, so before *any* write lands, capture a
  restore point:
  - **Figma version checkpoint** — note the current version (e.g. via
    `figma_get_file_versions`) or have the user name a Figma version so there's a known-good
    point to restore to. The plugin can read versions; it does not auto-create named
    versions, so if none exists, ask the user to add one ("File → Save to version
    history") and record that you did.
  - **Token export** — if the repo already emits tokens, snapshot the current generated
    output (git is the natural baseline once `workspace.stage` is `local-git`+).

  Do this **before** routing into any skill that writes (the audit only reads, so the
  baseline must be in place before `token-builder`'s refine phase runs). Frame it as
  cheap insurance, not alarm.
  ````

- [ ] **Step 4.3: Self-review against the spec**

  Confirm: routing names `design-system-audit` and `retrofit-planner` exactly; the
  resume path reads `retrofit.phase` (matching `references/manifest-schema.md` values);
  the baseline step precedes any mutation; `workspace.origin` is read, never written
  (immutable). Confirm this honors §11 "surface in /start" (the `/start` command invokes
  this skill, so resume + audit routing now surface there) and "close the interim
  inventory gap" (mature systems now reach the audit). Confirm it links
  `brownfield-retrofit.md`. Fix any drift inline.

- [ ] **Step 4.4: Commit**

  ```bash
  git add skills/figma-environment-setup/SKILL.md
  git commit -m "feat: figma-environment-setup brownfield routing + rollback baseline"
  ```

---

## Task 5: Brownfield branch in `token-builder` (refine-in-place)

Spec §5 row 2 + guardrail 3. Add a refine-in-place path: detect existing variables, rename **preserving IDs**, run the binding-survival audit (Task 2) around every rename, never delete-and-recreate.

**Files:**
- Modify: `skills/token-builder/SKILL.md`

- [ ] **Step 5.1: Add the refine-in-place section before Step 2**

  In `skills/token-builder/SKILL.md`, find the heading exactly:

  ```
  ## Step 2 — Build the PRIMITIVE tier, then PAUSE
  ```

  Insert this new section **immediately before** it:

  ````markdown
  ## Step 1.5 — Brownfield: refine existing variables in place (don't rebuild)

  If this is a **retrofit** (`tokens.intakeMode: "retrofit"`, or the file already has
  variables), do **not** create a fresh set on top of the old one. Refine what exists,
  in place. **Read `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md` first** —
  guardrail 3 is the whole point of this branch.

  **The hard rule (guardrail 3):** rename and realign variables **in place** to preserve
  their Figma IDs. **Never delete-and-recreate** — every binding (a populated file can
  have thousands) references the variable *id*, so recreating under the same name still
  unbinds everything. A rename keeps the id; a delete+create does not.

  **The refine loop:**

  1. **Read what exists** (read discipline). Use `figma_get_variables` after
     `await figma.loadAllPagesAsync()`. List the existing collections, variables, and
     values. Treat a `0`/empty first read as suspect — re-read before concluding the file
     is empty.
  2. **Snapshot bindings before.** Run the binding-survival audit in
     `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md` to record the total consuming
     binding count *before* any change. This is your guardrail-3 tripwire.
  3. **Rename / realign in place.** Use the rename operation that keeps the id (e.g.
     `figma_rename_variable` / setting `variable.name`), and update values in place. Map
     old names to the new two-tier scheme; record each old→new mapping (the crosswalk
     consumes it later via `token-crosswalk-builder`).
  4. **Snapshot bindings after, and assert equality.** Re-run the binding-survival audit.
     The total **must be unchanged**. A drop means a binding was severed — STOP, find the
     delete-and-recreate that slipped in, and restore from the baseline.
  5. **Add genuinely-new variables** (the `added` rows) as normal creates — only the
     *existing* ones must be renamed rather than recreated.

  After the refine loop, continue with the normal tiers below for any net-new structure,
  but **skip recreating anything that already exists**. The primitive/semantic checkpoint
  (Step 2's PAUSE) still applies: lock names before building dependent semantics.
  ````

- [ ] **Step 5.2: Add a "must NOT" guardrail**

  Find the `## Notes that matter` section near the end. Add this bullet to the existing
  bullet list (append after the last existing note):

  ```
  - **Brownfield: never delete-and-recreate to rename (guardrail 3).** On a retrofit,
    rename variables in place to preserve their Figma IDs and every binding. Snapshot the
    binding count before and after each rename and assert it's unchanged — see Step 1.5
    and `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`.
  ```

- [ ] **Step 5.3: Self-review against the spec**

  Confirm: the branch is gated on `tokens.intakeMode: "retrofit"` / existing variables;
  it renames preserving IDs and explicitly forbids delete-and-recreate; it runs the
  binding-survival audit before *and* after with an equality assertion; it reads
  `brownfield-retrofit.md`. Confirm it doesn't touch greenfield behavior (the new section
  is purely additive and conditional). Fix any drift inline.

- [ ] **Step 5.4: Commit**

  ```bash
  git add skills/token-builder/SKILL.md
  git commit -m "feat: token-builder brownfield refine-in-place branch (rename preserving IDs)"
  ```

---

## Task 6: Brownfield branch in `token-sync-layer` + `sync-adapters.md` (transforms)

Spec §5 row 3 + guardrails 2 & 6. Opacity 0–100→0–1 normalization is already documented in `token-sync-layer` Step 2 (Plan 1). Add the three remaining transforms: alpha as `rgb(… / <alpha-value>)` **channels** (so Tailwind `/opacity` survives), float32 rounding **at the export boundary**, and `/opacity` on var-based tokens → `color-mix`. Document them in both the skill and `sync-adapters.md`.

**Files:**
- Modify: `skills/token-sync-layer/SKILL.md`
- Modify: `references/sync-adapters.md`

- [ ] **Step 6.1: Add the brownfield-transforms subsection to the skill**

  In `skills/token-sync-layer/SKILL.md`, find the heading exactly:

  ```
  ## Step 3 — Set up Style Dictionary + adapters
  ```

  Insert this new subsection **immediately before** it (so it sits at the end of Step 2,
  beside the existing opacity-normalization rule):

  ````markdown
  ### Brownfield transforms (learned the hard way)

  On a **retrofit** (`tokens.intakeMode: "retrofit"`), apply these transforms in
  addition to the opacity normalization above. Each cost real debugging time on a live
  retrofit — see the guardrails in
  `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`.

  - **Alpha as channels, not baked CSS vars (so Tailwind `/opacity` survives).** Emit
    colors as space-separated channels with a slash-alpha slot —
    `--color-x: 239 68 68;` consumed as `rgb(var(--color-x) / <alpha-value>)` — rather
    than a finished `rgba(...)`. A baked `rgba()` can't accept Tailwind's `/opacity`
    modifier; the channel form keeps `bg-x/50` working after the retrofit.
  - **`/opacity` on var-based tokens → `color-mix` or channel alpha (guardrail 6).**
    Where existing code applies a `/opacity` modifier to a token that is now a CSS var,
    you can't fold the alpha into the var. Convert to
    `color-mix(in srgb, var(--color-x) NN%, transparent)` (or the channel-alpha form
    above). Never carry a raw `/opacity` onto a var-based token.
  - **Round float32 noise at the export boundary (guardrail 2).** Figma stores values as
    float32 and re-quantizes on write, so normalizing *inside* Figma is a no-op. Round at
    the **export boundary** instead — `Math.round(v * 100) / 100` as values leave the
    pipeline — so `0.30000001192092896` lands as `0.3` in the generated files. Do this in
    the extraction/transform step, never by hand-editing the generated output (guardrail 7).

  These are transforms on the *values* the adapters emit; the adapter presets themselves
  are unchanged. See `${CLAUDE_PLUGIN_ROOT}/references/sync-adapters.md` for where they
  fit in the adapter output.
  ````

- [ ] **Step 6.2: Add a "must NOT" guardrail to the skill**

  Find the `## What this skill must NOT do` section. Add these bullets to the list:

  ```
  - Never bake alpha into finished `rgba(...)` on a retrofit — emit channels
    (`rgb(var(--x) / <alpha-value>)`) so Tailwind `/opacity` modifiers survive.
  - Never carry a `/opacity` modifier onto a var-based token — convert to `color-mix`
    or channel alpha (guardrail 6).
  - Never normalize float32 inside Figma (it re-quantizes) — round at the export
    boundary (`Math.round(v*100)/100`, guardrail 2).
  ```

- [ ] **Step 6.3: Document the transforms in `sync-adapters.md`**

  In `references/sync-adapters.md`, find the heading exactly:

  ```
  ## Output location
  ```

  Insert this new section **immediately before** it:

  ````markdown
  ## Brownfield value transforms

  On a retrofit, the values flowing into the adapters get three extra transforms (the
  opacity 0–100→0–1 normalization happens earlier, at extraction). These affect what the
  web adapters emit; native adapters resolve to literals so the channel/`color-mix` forms
  apply to web targets. Full rationale: the 7 guardrails in
  `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`.

  - **Channel alpha (web).** Color tokens emit as space-separated channels
    (`--color-bg-default: 239 68 68;`) consumed via
    `rgb(var(--color-bg-default) / <alpha-value>)`, so Tailwind's `/opacity` modifiers
    keep working. A finished `rgba(...)` would break them.
  - **`/opacity` → `color-mix` (web).** A `/opacity` modifier on a var-based token can't
    fold its alpha into the var; emit `color-mix(in srgb, var(--token) NN%, transparent)`
    instead (or the channel-alpha form).
  - **Float32 rounding at the export boundary.** Round values as they leave the pipeline
    (`Math.round(v*100)/100`) — normalizing inside Figma is a no-op because Figma
    re-quantizes to float32 on store.

  These are applied in `token-sync-layer`'s extraction/transform step (its "Brownfield
  transforms" subsection), not in the adapter presets.
  ````

- [ ] **Step 6.4: Self-review against the spec**

  Confirm: all three transforms match spec §5 row 3 and guardrails 2 & 6 verbatim in
  intent (channel alpha `rgb(… / <alpha-value>)`, float rounding `Math.round(v*100)/100`
  at the export boundary, `/opacity`→`color-mix(in srgb, var(--…) NN%, transparent)`);
  the skill and `sync-adapters.md` agree; both cross-link `brownfield-retrofit.md`;
  opacity normalization is *not* re-documented (it already exists). Fix any drift inline.

- [ ] **Step 6.5: Commit**

  ```bash
  git add skills/token-sync-layer/SKILL.md references/sync-adapters.md
  git commit -m "feat: token-sync-layer brownfield transforms (channel alpha, float rounding, color-mix)"
  ```

---

## Task 7: Brownfield branch in `storybook-chromatic-builder` (baseline + verification triad)

Spec §5 row 4 + §7 verification triad + guardrails 4 & 5. Add: capture a Chromatic baseline **before** the code retrofit (so intended drift-fixes are distinguishable from regressions), the three-check verification triad, and the explicit warnings that `build-storybook` only compiles story-reachable SCSS and that **Chromatic — not `tsc`/build — is the source of truth** for color-utility removal. Per §11, detect the repo's actual test/CI tooling rather than asserting Chromatic.

**Files:**
- Modify: `skills/storybook-chromatic-builder/SKILL.md`

- [ ] **Step 7.1: Add the baseline + triad section before "What this skill must NOT do"**

  In `skills/storybook-chromatic-builder/SKILL.md`, find the final section beginning
  exactly:

  ```
  ## What this skill must NOT do

  - Never finish a finalized component while leaving its Figma doc card on `draft`
  ```

  Insert this new section **immediately before** that heading:

  ````markdown
  ## Brownfield: baseline before retrofit + the verification triad

  On a **retrofit** (`tokens.intakeMode: "retrofit"`), the order of operations and the
  verification bar are stricter than greenfield. **Read
  `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`** — the safe sequence and the
  verification triad live there.

  **Capture the Chromatic baseline BEFORE the code retrofit.** Run `build-storybook` +
  Chromatic to establish a green baseline *before* any token/color code is changed. Then,
  when the retrofit lands, every diff is either an **intended drift-fix** (a color the
  audit flagged as wrong) or a **regression** — and the baseline is the only thing that
  tells them apart. Baseline *after* the retrofit and you've thrown away that signal.

  **The verification triad — all three are necessary; no single check catches everything:**
  1. **`check-types` (TypeScript)** — catches type errors, but is **blind to Tailwind
     silent no-ops**: a deleted color utility just stops applying, with no type error
     (guardrail 4).
  2. **`build-storybook` + Chromatic snapshots** — the visual-regression net, but **blind
     to story-unreachable code**. `build-storybook` only compiles SCSS that some story
     actually imports; a dead `@import` of a deleted partial, or a route's styles no story
     renders, compiles "fine" here and breaks only in the app. **Chromatic — not
     `tsc`/build — is the source of truth** for whether a color-utility removal was safe.
  3. **Run the actual app + spot-check 5–7 real routes** — the only thing that exercises
     story-unreachable SCSS (guardrail 5). Don't declare an SCSS/color change done on the
     strength of a green build alone.

  **Don't assume the stack (§11).** This triad names Chromatic + `build-storybook`
  because that's the case-study tooling. Detect what the repo actually uses — read its
  `package.json` scripts for the real type-check / build / visual-test commands — and map
  the triad onto them (or degrade gracefully and say so) rather than asserting commands
  that may not exist.
  ````

- [ ] **Step 7.2: Add "must NOT" guardrails**

  In the `## What this skill must NOT do` list, add these bullets:

  ```
  - Never capture the Chromatic baseline *after* a code retrofit — baseline before, so
    intended drift-fixes are distinguishable from regressions.
  - Never trust `tsc`/build to catch Tailwind color-utility removal — it's a silent
    no-op; Chromatic is the source of truth (guardrail 4).
  - Never declare an SCSS/color change done on a green build alone — run the app and
    spot-check 5–7 real routes (guardrail 5).
  ```

- [ ] **Step 7.3: Self-review against the spec**

  Confirm: baseline-before-retrofit is explicit; the triad's three checks match §7
  exactly (check-types / build-storybook+Chromatic / run-the-app), each with its blind
  spot; the "Chromatic not tsc is the source of truth" and "build-storybook only compiles
  story-reachable SCSS" warnings are present (§5 row 4); §11 don't-hardcode-stack is
  honored (detect real commands). Fix any drift inline.

- [ ] **Step 7.4: Commit**

  ```bash
  git add skills/storybook-chromatic-builder/SKILL.md
  git commit -m "feat: storybook-chromatic-builder baseline-before-retrofit + verification triad"
  ```

---

## Task 8: B3 behavioral fix — detect-or-ask publish state

Spec §3 (B3), §10, §11. Today `component-builder` and `figma-publishing.md` treat a
default/`false` `figma.libraryPublished` as "not published" and fall straight to the
toggle fallback. The fix is **behavioral**: treat default/`false` as *unverified* —
attempt detection first (`figma_get_library_components` / `figma_get_library_variables`),
ask once only if inconclusive, persist the answer, and frame the unpublished path as a
graceful choice. No new manifest field (the field docs were already clarified in Plan 1).

**Files:**
- Modify: `references/figma-publishing.md`
- Modify: `skills/component-builder/SKILL.md`

- [ ] **Step 8.1: Rewrite the capability check in `figma-publishing.md`**

  In `references/figma-publishing.md`, find the section exactly:

  ```
  ## Capability check (ask once, record it)

  Before relying on publishing, establish whether the user *can* publish and
  whether they *have*:

  - If `figma.canPublish` is `null`, ask once, plainly: "Are you on a paid Figma
    plan (Professional or higher)? Publishing a shared library — which unlocks the
    nicer typed icon dropdowns on components — needs one." Record `true`/`false`.
  - Record whether they've published in `figma.libraryPublished` (+ `publishedAt`).

  Don't probe repeatedly; read the manifest and only re-ask if state is missing.
  ```

  Replace that entire section with:

  ````markdown
  ## Capability check (detect first, then ask once, record it)

  Before relying on publishing, establish whether the user *can* publish and whether
  they *have* — but **treat a default/`false` `figma.libraryPublished` as _unverified_,
  not "definitely not published" (bug B3).** Apply the read discipline in
  `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`: never assert "unpublished"
  without a verified read.

  1. **Detect first.** Before asking anything, attempt to detect publish state by reading
     for published library artifacts: `figma_get_library_components` /
     `figma_get_library_variables` (and library component keys). If those resolve, the
     file *is* published — record `figma.libraryPublished: true` (+ `publishedAt`) and skip
     the question.
  2. **Ask once only if detection is inconclusive.** If the reads are empty or unreliable
     (detection can't confirm either way), ask the user a single plain question — "Is this
     file published to a team library?" — and, separately, if `figma.canPublish` is `null`:
     "Are you on a paid Figma plan (Professional or higher)? Publishing a shared library —
     which unlocks the nicer typed icon dropdowns — needs one." Record `true`/`false` for
     each.
  3. **Persist.** Record `figma.libraryPublished` (+ `publishedAt`) and `figma.canPublish`.
     Don't probe repeatedly; read the manifest and only re-detect/re-ask if state is
     genuinely missing.

  Frame the unpublished path as a **graceful choice**, never a failure — the toggle +
  manual-swap slot is fully functional.
  ````

- [ ] **Step 8.2: Update "What `component-builder` does with this" in `figma-publishing.md`**

  Find the section exactly:

  ```
  ## What `component-builder` does with this

  For each slot that would be a typed `INSTANCE_SWAP`:

  1. **Can the swap targets resolve** (library published, `canPublish` true,
     `libraryPublished` true)? →
  2. **Yes:** add the typed `INSTANCE_SWAP` dropdown with preferred values.
  3. **No (free plan, or not yet published):** build the **toggle + manual-swap**
     slot instead, tell the user *why* in plain terms, and add the component name to
     `components.instanceSwapUpgradePending` in the manifest.
  ```

  Replace it with:

  ````markdown
  ## What `component-builder` does with this

  For each slot that would be a typed `INSTANCE_SWAP`:

  1. **Resolve publish state via the capability check above** — detect first
     (`figma_get_library_components` / `figma_get_library_variables`), ask once only if
     inconclusive, then persist. A default/`false` `libraryPublished` is *unverified*
     until this runs — never treat it as a final "no".
  2. **Confirmed published** (`libraryPublished` true after detect-or-ask, `canPublish`
     true): add the typed `INSTANCE_SWAP` dropdown with preferred values.
  3. **Confirmed not published** (free plan, or the user said not yet): build the
     **toggle + manual-swap** slot instead, tell the user *why* in plain terms, and add
     the component name to `components.instanceSwapUpgradePending` in the manifest. This
     is a graceful choice, not a failure.
  ```` 

- [ ] **Step 8.3: Update `component-builder` typed-dropdown gate**

  In `skills/component-builder/SKILL.md`, find the typed-dropdown-vs-fallback block,
  which contains exactly:

  ```
  - **Published (`figma.libraryPublished` true):** add the typed `INSTANCE_SWAP`
    dropdown with preferred values.
  ```

  Replace the gate so default/`false` is treated as unverified. Replace that bullet
  (and keep the not-published bullet that follows it) with:

  ```
  - **Resolve publish state first (detect-or-ask, bug B3):** a default/`false`
    `figma.libraryPublished` is *unverified* — attempt detection
    (`figma_get_library_components` / `figma_get_library_variables`) and ask once only if
    inconclusive, per `${CLAUDE_PLUGIN_ROOT}/references/figma-publishing.md`. Never treat
    a `false` as a final "not published" without that check.
  - **Confirmed published (`figma.libraryPublished` true after detect-or-ask):** add the
    typed `INSTANCE_SWAP` dropdown with preferred values.
  ```

- [ ] **Step 8.4: Gate the upgrade pass on confirmed-true**

  In `skills/component-builder/SKILL.md`, find the upgrade-pass text containing exactly:

  ```
  **Upgrade pass:** if `components.instanceSwapUpgradePending` is non-empty and the
  library is now published (`figma.libraryPublished` true), offer to add the typed
  `INSTANCE_SWAP` dropdowns to those components and clear each from the list.
  ```

  Replace it with:

  ```
  **Upgrade pass:** if `components.instanceSwapUpgradePending` is non-empty, re-resolve
  publish state (detect-or-ask per `${CLAUDE_PLUGIN_ROOT}/references/figma-publishing.md`);
  only when it is **confirmed published** (`figma.libraryPublished` true via a verified
  detect-or-ask, not a stale default) offer to add the typed `INSTANCE_SWAP` dropdowns to
  those components and clear each from the list.
  ```

- [ ] **Step 8.5: Self-review against the spec**

  Confirm against §3 (B3) and §10: detection is attempted first
  (`figma_get_library_components` / `figma_get_library_variables`), the question is asked
  *once* only when inconclusive, the answer persists to `figma.libraryPublished` /
  `figma.canPublish` (no new field), and the unpublished path is framed as graceful.
  Confirm `figma-publishing.md` and `component-builder` agree and both link the read
  discipline. Confirm no greenfield behavior regressed (a genuinely-published greenfield
  file still gets the typed dropdown). Fix any drift inline.

- [ ] **Step 8.6: Commit**

  ```bash
  git add references/figma-publishing.md skills/component-builder/SKILL.md
  git commit -m "fix: B3 detect-or-ask publish state (treat default libraryPublished as unverified)"
  ```

---

## Task 9: `retrofit-planner` skill — the orchestrator

Spec §4.3. Mirrors `component-pipeline`: holds **zero domain logic of its own**, invokes
sub-skills via the Skill tool, gates **every** phase on a human confirmation, owns only
`retrofit.phase` + `completedSkills`. Encodes the safe 7-phase sequence with the
non-obvious ordering rules as gates, offers the decision journal default-on, and (per
§11) detects the repo's tooling rather than asserting the case-study stack.

**Files:**
- Create: `skills/retrofit-planner/SKILL.md`

- [ ] **Step 9.1: Create the skill**

  Create `skills/retrofit-planner/SKILL.md` with exactly this content:

  ````markdown
  ---
  name: retrofit-planner
  description: Orchestrate a full brownfield design-system retrofit end to end — audit, refine variables in place, rebind components, sync, capture a Chromatic baseline, retrofit the code with dual output, then remove the old tokens only after a zero-reference grep — with a human confirmation gate between every phase. Use this when the user wants to run a complete retrofit, migrate a mature codebase and populated Figma file onto tokens, resume an in-progress retrofit, or be walked through the safe retrofit sequence. Also trigger after design-system-audit has sized the system, or when figma-environment-setup detects an in-progress retrofit. Make sure to use this whenever someone wants the guided, gated, multi-session brownfield retrofit rather than running the individual skills by hand.
  ---

  # Retrofit planner (orchestrator)

  Sequences a brownfield retrofit through the safe 7-phase order, gating each phase on a
  human confirmation. Like `component-pipeline`, this skill holds **zero domain logic of
  its own** — it is a sequencer that invokes the real skills and the phase work, and only
  updates the manifest fields it owns (`retrofit.phase`, `completedSkills`). All the
  actual work lives in the skills it calls, so this orchestrator doesn't rot when they
  improve.

  **Before anything, read `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`** —
  the read discipline, the 7 guardrails, the safe sequence, and the verification triad
  are the rules this skill enforces as gates.

  ## When to use vs. the individual skills

  Use this for a **complete retrofit**, especially across multiple sessions. For a single
  isolated step (just the audit, just the crosswalk), run that skill directly. This is the
  "converge my mature system onto tokens, end to end, without breaking the live app" flow.

  ## Calibrate

  Read `user.codingLevel` (`${CLAUDE_PLUGIN_ROOT}/references/coding-level.md`). A retrofit
  touches Figma, tokens, code, CI, and a live app — for `new` users explain each phase and
  why its ordering matters the first time; for `comfortable` users be terse. The phases and
  gates are identical across levels.

  ## Prerequisites

  Read the manifest. This orchestrator assumes a brownfield situation
  (`tokens.intakeMode: "retrofit"`, or `workspace.origin` is an existing repo/monorepo). If
  the audit hasn't run yet (`audit.ranAt` is `null`), start at the audit phase below. If
  none of the brownfield markers are set, this is probably greenfield — point the user to
  the normal build skills instead.

  ## Decision-journal offer (default-on)

  At the start of a retrofit, offer to scaffold a decision journal at `docs/design-system/`
  with `specs/ plans/ spikes/ findings/ decisions/ handoffs/`. **Recommend yes** —
  retrofits are multi-session and the journal is the human decision trail (complementary to
  the manifest's machine state) — but allow the user to decline. Record the choice in
  `retrofit.journalScaffolded`. This is the only artifact this skill creates directly.

  ## Detect the stack, don't assume it (§11)

  Before running phases that shell out (sync, baseline, code, cleanup), detect what the
  repo actually uses — read its `package.json` scripts for the real type-check, build,
  visual-test, and token commands. The case study used Chromatic + `build-storybook` +
  `tokens:sync`/`tokens:validate`; a real repo may differ. Map each phase onto the repo's
  actual commands, or degrade gracefully and say what's missing — never assert a command
  that doesn't exist.

  ## The safe sequence (confirm between EVERY phase)

  Set `retrofit.phase` to the current phase as you enter it, so a later session can resume
  exactly here. Confirm the goal first, then walk the phases. **Each gate is a hard stop:
  do not advance without explicit confirmation** — the gates are what keep the live app
  intact and make the retrofit resumable.

  ### Phase 1 — `audit` (invoke `design-system-audit`)

  Invoke `design-system-audit`: size the code surface, inventory the Figma file with
  verified per-class reads, compute `percentSemantic`. **Gate:** show the audit results and
  the right-sizing read ("~90% semantic → renames + cleanup, not a rewrite"). Confirm before
  continuing. Capture the rollback baseline (Figma version checkpoint / token export) now if
  `figma-environment-setup` didn't already.

  ### Phase 2 — `refine` (invoke `token-builder` brownfield branch)

  Invoke `token-builder`'s refine-in-place branch: rename/realign variables **in place**,
  preserving IDs, with a binding-survival audit before and after each rename (guardrail 3).
  **Gate:** show the before/after binding counts are equal (no bindings severed) and the
  refined variable names. Confirm before continuing. **Never delete-and-recreate.**

  ### Phase 3 — `rebind`

  Reconcile components onto the refined variables, preserving their Figma IDs. There is no
  dedicated skill for this — drive it directly here: verify components still reference the
  (renamed, same-id) variables, and fix any that drifted. **Gate:** confirm components still
  render bound. This is also the natural point to build the crosswalk if not yet done —
  offer `token-crosswalk-builder` (it reads the `audit` section to seed rows and wires
  `tokens:validate`).

  ### Phase 4 — `sync` (invoke `token-sync-layer` brownfield branch)

  Invoke `token-sync-layer` with the brownfield transforms (channel alpha, opacity
  0–100→0–1, float32 rounding at the export boundary, `/opacity`→`color-mix`). It lands a
  reviewable PR per its own rules. **Gate:** confirm the sync PR before continuing.

  ### Phase 5 — `baseline` (invoke `storybook-chromatic-builder`)

  Capture a Chromatic baseline **before** any code retrofit, so intended drift-fixes are
  distinguishable from regressions. **Gate:** confirm the baseline is green and captured.
  This ordering is not optional — baseline *after* the code change throws away the signal.

  ### Phase 6 — `code` (dual output)

  Retrofit the codebase with **dual output**: new and old tokens coexist during the
  transition, so nothing breaks mid-migration. Use the crosswalk reverse index
  (`tokens:reverse-index`) to semi-automate the SCSS/Tailwind swaps. Run the verification
  triad as you go — `check-types`, `build-storybook` + Chromatic, **and run the actual app**
  + spot-check 5–7 routes (the build alone is blind to story-unreachable SCSS). **Gate:**
  confirm the triad passes before continuing.

  ### Phase 7 — `cleanup`

  Remove the old token outputs **only after** the repo-wide token-removal guard returns
  **zero references** (`guard-token-removal.mjs`) — deleted Tailwind utilities are silent
  no-ops that `tsc`/build won't catch (guardrail 4). **Gate:** show the guard reporting zero
  references, then confirm removal. Re-run the verification triad after removal.

  When cleanup is verified, set `retrofit.phase: "done"` and `retrofit.completedAt`, and
  append `retrofit-planner` to `completedSkills`.

  ## Resumability

  Because each phase is gated and `retrofit.phase` is written on entry, a stop at any point
  leaves a clean resume point. `figma-environment-setup` reads `retrofit.phase` on the next
  `/start` and routes back here at the right phase. Never silently restart from the top —
  resume where the manifest says.

  ## What this skill must NOT do

  - Never reimplement what the sub-skills do — only sequence them and drive the
    no-dedicated-skill phases (rebind, code, cleanup). If you're writing token/sync logic
    here, stop and invoke the real skill.
  - Never skip a confirmation between phases — the gates keep the live app intact and make
    the retrofit resumable.
  - Never delete-and-recreate variables (guardrail 3), baseline after the code retrofit
    (phase 5 before 6), or remove old outputs before the zero-reference grep passes
    (guardrail 4).
  - Never write another skill's manifest fields — own only `retrofit.*` and
    `completedSkills`. The audit owns `audit.*`; the crosswalk owns `tokenCrosswalk`.
  - Never assert the case-study toolchain — detect the repo's real commands or degrade
    gracefully.
  ````

- [ ] **Step 9.2: Self-review against the spec**

  Open spec §4.3 and §8. Confirm: the 7 phases match the safe sequence
  (audit→refine→rebind→sync→baseline→code→cleanup→done) with a human gate each; the
  non-obvious ordering rules are baked as gates (refine-in-place not delete-recreate;
  baseline before code; dual output; delete only after zero-reference grep; verify with the
  real app); it invokes sub-skills via the Skill tool (names match: `design-system-audit`,
  `token-builder`, `token-crosswalk-builder`, `token-sync-layer`,
  `storybook-chromatic-builder`); the decision-journal offer is default-on and recorded in
  `retrofit.journalScaffolded`; it writes only `retrofit.*` + `completedSkills`; §11
  don't-hardcode-stack is honored. Compare the orchestrator shape to
  `skills/component-pipeline/SKILL.md`. Fix any drift inline.

- [ ] **Step 9.3: Commit**

  ```bash
  git add skills/retrofit-planner/SKILL.md
  git commit -m "feat: retrofit-planner orchestrator — gated 7-phase safe retrofit sequence"
  ```

---

## Task 10: Surface the new manifest sections in `/design-system-status` and `/start`

Spec §11 "Surface the new manifest sections in `/design-system-status` and `/start`. They
currently ignore `audit` / `retrofit`." The substantive `/start` routing (resume on
`retrofit.phase`, route mature systems to the audit) landed in Task 4 via
`figma-environment-setup`, which `/start` invokes. This task adds the status reporting and a
light note in `start.md`.

**Files:**
- Modify: `commands/design-system-status.md`
- Modify: `commands/start.md`

- [ ] **Step 10.1: Add brownfield reporting to `design-system-status.md`**

  In `commands/design-system-status.md`, find the line that ends the report list — the
  bullet about the coding level / UI framework on record (the last item before the
  "suggest sensible next steps" instruction). Immediately after that bullet, add these
  reporting lines (match the existing plain-prose bullet style):

  ```
  - Retrofit (brownfield only — skip the whole block if `tokens.intakeMode` isn't
    `"retrofit"` and `audit.ranAt` is null):
    - Audit: has it run (`audit.ranAt`)? If so, the code-surface counts
      (`audit.codeSurface`), the Figma inventory (`audit.figmaInventory` — variables,
      bindings, text/effect styles, modes), and how semantic the system is
      (`audit.percentSemantic`).
    - Crosswalk: is it built (`tokenCrosswalk.path`)? The status counts
      (`tokenCrosswalk.statusCounts`) and whether the validator is passing
      (`tokenCrosswalk.validatorPassing`).
    - Retrofit progress: which phase (`retrofit.phase`), and whether the decision journal
      was scaffolded (`retrofit.journalScaffolded`).
  ```

  Then, in the "suggest sensible next steps" guidance, add a brownfield example so the
  command routes correctly. After the existing example, add:

  ```
  For a brownfield system, suggest the next retrofit step from the state: no audit yet
  → "want to run `design-system-audit` to size the retrofit?"; audited but no crosswalk
  → "want to build the crosswalk with `token-crosswalk-builder`?"; mid-retrofit
  (`retrofit.phase` set, not `"done"`) → "want to resume the retrofit at the `<phase>`
  phase with `retrofit-planner`?".
  ```

- [ ] **Step 10.2: Add a brownfield/resume note to `start.md`**

  In `commands/start.md`, find the passage that says the setup skill will detect an
  existing manifest and route the user to the right next step (the "If `design-system.json`
  already exists…" sentence). Append to that paragraph:

  ```
  That routing now covers brownfield systems too: an existing/mature repo or populated
  Figma file is sent to `design-system-audit` first, and an in-progress retrofit
  (`retrofit.phase` set) resumes at its phase via `retrofit-planner` — the setup skill
  makes that call.
  ```

- [ ] **Step 10.3: Self-review against the spec**

  Confirm: `design-system-status` now reports `audit`, `tokenCrosswalk`, and `retrofit`
  using the exact field names from `references/manifest-schema.md`, and only for brownfield
  systems (greenfield output is unchanged); `start.md` notes the brownfield/resume routing
  that Task 4 implemented. Confirm the next-step suggestions name real skills
  (`design-system-audit`, `token-crosswalk-builder`, `retrofit-planner`). Fix any drift
  inline.

- [ ] **Step 10.4: Commit**

  ```bash
  git add commands/design-system-status.md commands/start.md
  git commit -m "feat: surface audit/crosswalk/retrofit in /design-system-status + /start routing note"
  ```

---

## Task 11: CHANGELOG + plugin-level self-review

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 11.1: Add the `[Unreleased]` entry**

  Open `CHANGELOG.md`. Under the existing `[Unreleased]` → `### Added` heading (which
  already carries the Plan 1 and Plan 2 entries), add these bullets:

  ```markdown
  - **Brownfield retrofit skills (Plan 3 of 3).** Completes the brownfield path end to end.
    - **`design-system-audit` skill** — the brownfield front door: sizes the code-side
      color surface (via the new color-usage grep), inventories the Figma file with verified
      per-class reads, computes `percentSemantic`, and owns the `audit` manifest section
      (sets `tokens.intakeMode: "retrofit"`).
    - **`retrofit-planner` skill** — the orchestrator: sequences the safe 7-phase retrofit
      (audit → refine → rebind → sync → baseline → code → cleanup) with a human gate per
      phase, offers a decision journal default-on, and owns the `retrofit` manifest section.
    - **`scripts/grep-color-usage.mjs`** — the repo-shaped color-usage grep scaffold
      (ships default patterns, logs assumed-vs-detected coverage).
  - **Brownfield branches in existing skills.** `figma-environment-setup` gains brownfield
    detection + routing to the audit, retrofit resume, and a pre-mutation rollback baseline;
    `token-builder` gains refine-in-place (rename preserving IDs, binding-survival audit);
    `token-sync-layer` gains the brownfield transforms (channel alpha, float32 rounding at
    the export boundary, `/opacity`→`color-mix`); `storybook-chromatic-builder` gains
    baseline-before-retrofit + the verification triad. The binding-survival audit snippet is
    added to `references/figma-scripting.md`.
  - **`/design-system-status` + `/start`** now surface the `audit`, `tokenCrosswalk`, and
    `retrofit` state and route brownfield/in-progress systems to the right next step.
  ```

  Then, under `[Unreleased]` → `### Fixed`, add:

  ```markdown
  - **Publish-state detection is now behavioral, not assumed (bug B3).** `component-builder`
    and `references/figma-publishing.md` treat a default/`false` `figma.libraryPublished` as
    *unverified*: they detect first (`figma_get_library_components` /
    `figma_get_library_variables`), ask once only if inconclusive, persist the answer, and
    frame the unpublished path as a graceful choice. No new manifest field.
  ```

- [ ] **Step 11.2: Verify the full script suite still passes**

  Run (from the repo root): `node --test`
  Expected: all green — `# tests 43`, `# pass 43`, `# fail 0`.

- [ ] **Step 11.3: Verify every new/edited SKILL.md frontmatter `name` matches its directory**

  Run:

  ```bash
  for d in design-system-audit retrofit-planner; do
    echo "== $d =="; head -3 "skills/$d/SKILL.md" | grep '^name:'
  done
  ```

  Expected: `name: design-system-audit` and `name: retrofit-planner` respectively
  (frontmatter `name` must equal the directory name).

- [ ] **Step 11.4: Commit**

  ```bash
  git add CHANGELOG.md
  git commit -m "docs: CHANGELOG [Unreleased] — Plan 3 brownfield skills, branches, and B3 fix"
  ```

---

## Self-Review (run after all tasks)

**1. Spec coverage** (against `docs/superpowers/specs/2026-06-25-brownfield-retrofit-design.md`):
- §3 unified principle / B1–B4 — B1/B2/B4 landed in Plan 1 (docs); **B3 behavioral fix → Task 8.** ✓
- §4.1 `design-system-audit` (size surface, per-class inventory, % semantic, owns `audit`,
  sets `intakeMode: retrofit`) → **Task 3** (consumes Task 1's grep + Task 2's binding audit). ✓
- §4.2 `token-crosswalk-builder` — shipped in Plan 2. (Task 3 hands off to it; Task 9 invokes it.) ✓
- §4.3 `retrofit-planner` (gated 7-phase sequence, ordering rules as gates, decision journal
  default-on, owns `retrofit`) → **Task 9.** ✓
- §5 brownfield branches: `figma-environment-setup` → **Task 4**; `token-builder` → **Task 5**;
  `token-sync-layer` → **Task 6**; `storybook-chromatic-builder` → **Task 7.** ✓
- §6 color-usage grep scaffold → **Task 1**; binding-survival audit in `references/` → **Task 2.**
  (Crosswalk validator / reverse-index / token-removal guard shipped in Plan 2.) ✓
- §7 references & guardrails — the guardrails + triad live in `brownfield-retrofit.md` (Plan 1);
  Tasks 4–9 wire skills to **read** it at the right moments. ✓
- §8 manifest — schemaVersion 4 + all sections shipped in Plan 1; Tasks 3/9/10 **write/read** the
  `audit` / `retrofit` fields with the documented names. ✓
- §10 bug traceability — B3 (Task 8). ✓
- §11 Plan-3 carry-forwards: B3 (Task 8); close interim inventory gap (Task 3 + routing in Task 4);
  wire `brownfield-retrofit.md` into the skills that need it (Tasks 3,4,5,6,7,9 all `Read` it);
  don't hardcode the case-study stack (detect-tooling guidance in Tasks 3, 7, 9); surface new
  manifest sections in `/design-system-status` + `/start` (Task 10 + Task 4). Plugin-CI is
  explicitly out of scope (§11 "not plan-specific"). ✓

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later". Task 1 shows complete, runnable code +
tests with exact expected output; every skill/branch task shows the exact text to insert/replace
with a unique anchor; every run step shows the command and expected output. The one deliberate
in-place correction (ESM has no `require`) is called out explicitly in Step 1.3's note and applied
in Step 1.4.

**3. Type/name consistency:**
- Manifest field names used across tasks match `references/manifest-schema.md` exactly:
  `audit.{ranAt, codeSurface, figmaInventory.{variables,bindings,textStyles,effectStyles,modes},
  percentSemantic}`, `tokenCrosswalk.{path, statusCounts, validatorPassing}`,
  `retrofit.{phase, startedAt, completedAt, journalScaffolded}`, `tokens.intakeMode: "retrofit"`,
  `figma.{libraryPublished, canPublish, publishedAt}`, `workspace.origin`.
- Skill identifiers are consistent everywhere they're named: `design-system-audit`,
  `retrofit-planner`, `token-crosswalk-builder`, `token-builder`, `token-sync-layer`,
  `storybook-chromatic-builder`, `component-builder`, `figma-environment-setup`.
- Exported function names in the new script match between module and tests: `grepColorUsage`,
  `scanFile`, `walk`, `DEFAULT_CATEGORIES`, `DEFAULT_EXCLUDES` (Task 1).
- The `audit.codeSurface` category keys match the grep's `DEFAULT_CATEGORIES` keys:
  `scssColorVars`, `tailwindColorClasses`, `jsColorsUsages`, `rawHexRgba`, `svgFills`.
- The retrofit `phase` values match the manifest enum and the safe-sequence order:
  `audit | refine | rebind | sync | baseline | code | cleanup | done`.
- Figma read tools referenced consistently: `figma_get_variables`, `figma_get_text_styles`,
  `figma_get_styles`, `figma_get_library_components`, `figma_get_library_variables`,
  `figma_get_file_versions`, `figma_rename_variable`, `loadAllPagesAsync`.

---

## Execution Handoff

Plan 3 of 3 — the final plan of the brownfield retrofit effort. After this ships, the plugin
handles a full brownfield retrofit end to end (audit → gated 7-phase retrofit → cleanup), greenfield
paths untouched, all four bugs (B1–B4) addressed.

**Critical dependency note:** Plan 3 builds on Plan 1 (manifest v4, `references/brownfield-retrofit.md`,
B1/B2/B4 docs) and Plan 2 (crosswalk schema + scripts + `token-crosswalk-builder`), both of which
live on the PR #12 branch (`claude/infallible-colden-cd4503`). This worktree already has those
artifacts present, so execution can proceed here; if executing elsewhere, branch off the Plan 1/2
branch, not a stale `main`.

**Remaining cross-cutting risks (not owned by this plan, per §11):** the B1/B2/B4 fixes remain
unverified against a real system (case-study-authored, not reproduced); there is still no plugin CI
validating SKILL.md frontmatter / `plugin.json` / the manifest schema. Both are tracked in the spec
§11 as cross-cutting; neither blocks Plan 3.
