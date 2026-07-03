# Publishing ThroughLine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish ThroughLine to npm as `@radicool/throughline` v0.12.0 with tag-driven release automation and marketplace submissions.

**Architecture:** Rename the package to the `@radicool` scope and bump to 0.12.0; add a tag-triggered GitHub Actions release workflow that guards tag↔version match, re-runs CI validation, publishes with npm trusted publishing (OIDC), and cuts a GitHub Release from CHANGELOG notes extracted by a new dependency-free `ci/extract-changelog.mjs`. The first publish is manual (npm requires the package to exist before trusted publishing can be configured). Spec: `docs/superpowers/specs/2026-07-03-publishing-design.md`.

**Tech Stack:** Node 20+ (`node --test`, no runtime deps), GitHub Actions, npm trusted publishing, `gh` CLI.

## Global Constraints

- npm package name: `@radicool/throughline` (fallback scope if `radicool` is claimed at org-creation time: `@radicoolstudio` — update every occurrence).
- Version: `0.12.0` everywhere (`package.json`, `.claude-plugin/plugin.json`, CHANGELOG).
- Bin name stays `throughline`; `bin` maps to `scripts/install.mjs` unchanged.
- No new npm dependencies; new scripts are plain `.mjs` with `node --test` tests, matching `ci/` conventions (pure exported function + CLI guard via `pathToFileURL`).
- Historical docs under `docs/superpowers/` keep the old `npx throughline init` text — do not edit them.
- Claude plugin name stays plain `throughline` in `.claude-plugin/plugin.json`.
- Tasks 6–9 touch live infrastructure (pushed tags, npm registry, GitHub Releases, submission forms). Tasks 7 and 9 need the user at the keyboard (npm login, browser forms).

---

### Task 1: Rename package to @radicool/throughline and bump to 0.12.0

**Files:**
- Modify: `package.json`
- Modify: `.claude-plugin/plugin.json` (version field only)
- Modify: `README.md:11` (badge), `README.md:76`, `README.md:109-111` (commands)
- Modify: `scripts/README.md:76`

**Interfaces:**
- Produces: package name `@radicool/throughline` and version `0.12.0`, which Task 4's workflow guard and Task 7's publish rely on.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main && git pull && git checkout -b feat/publishing
```

- [ ] **Step 2: Update package.json**

Replace the `name` and `version` values and add `publishConfig` so the full file reads:

```json
{
  "name": "@radicool/throughline",
  "version": "0.12.0",
  "description": "Build a complete design system end to end — author in Figma, sync tokens to code, generate Storybook. Usable from Claude Code, Cursor, Codex, or any AGENTS.md agent.",
  "type": "module",
  "bin": {
    "throughline": "scripts/install.mjs"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "adapters/",
    "references/",
    "scripts/",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=20"
  },
  "license": "MIT",
  "author": "Jordan Pease",
  "repository": {
    "type": "git",
    "url": "https://github.com/jrpease/throughline.git"
  }
}
```

- [ ] **Step 3: Bump plugin.json version**

In `.claude-plugin/plugin.json` change:

```json
  "version": "0.11.0",
```

to:

```json
  "version": "0.12.0",
```

(Leave `"name": "throughline"` and everything else untouched.)

- [ ] **Step 4: Update README badge and commands**

`README.md:11` — replace the hand-maintained version badge:

```markdown
[![Version](https://img.shields.io/badge/version-0.11.0-6366f1)](.claude-plugin/plugin.json)
```

with the auto-updating npm badge (it renders "package not found" until Task 7 publishes — expected):

```markdown
[![npm](https://img.shields.io/npm/v/%40radicool%2Fthroughline?color=6366f1&label=npm)](https://www.npmjs.com/package/@radicool/throughline)
```

`README.md:76` — inside the requirements table row, replace `` `npx throughline init` `` with `` `npx @radicool/throughline init` ``.

`README.md:109-111` — replace the three command lines:

```
npx throughline init --target=cursor    # → .cursor/rules + .cursor/mcp.json
npx throughline init --target=codex      # → prompts/ + AGENTS.md index + codex-mcp.toml
npx throughline init --target=generic    # → skills/ + AGENTS.md index
```

with:

```
npx @radicool/throughline init --target=cursor    # → .cursor/rules + .cursor/mcp.json
npx @radicool/throughline init --target=codex      # → prompts/ + AGENTS.md index + codex-mcp.toml
npx @radicool/throughline init --target=generic    # → skills/ + AGENTS.md index
```

`scripts/README.md:76` — replace `npx throughline init --target=cursor|codex|generic` with `npx @radicool/throughline init --target=cursor|codex|generic`.

- [ ] **Step 5: Verify nothing else references the bare command, and the suite is green**

```bash
grep -rn "npx throughline" --include="*.md" --include="*.mjs" . | grep -v docs/superpowers | grep -v node_modules
```

Expected: no output. (Hits under `docs/superpowers/` are historical records — leave them.)

```bash
node --test && node ci/validate-plugin.mjs && node ci/validate-skills.mjs && node scripts/adapters/generate.mjs --check
```

Expected: all pass; validate-plugin prints `✓ plugin.json + marketplace.json OK`.

- [ ] **Step 6: Commit**

```bash
git add package.json .claude-plugin/plugin.json README.md scripts/README.md
git commit -m "feat: rename package to @radicool/throughline, bump to 0.12.0"
```

---

### Task 2: CHANGELOG — 0.12.0 entry and link-footer catch-up

**Files:**
- Modify: `CHANGELOG.md` (Unreleased section ~line 7; link footer ~lines 498-499)

**Interfaces:**
- Produces: a `## [0.12.0] - 2026-07-03` section that Task 3's extractor and Task 8's GitHub Release consume.

- [ ] **Step 1: Add the 0.12.0 entry**

Directly under `## [Unreleased]` (leaving that heading in place, blank line after it), insert:

```markdown
## [0.12.0] - 2026-07-03

### Added
- **Published to npm as [`@radicool/throughline`](https://www.npmjs.com/package/@radicool/throughline).**
  The multi-agent installer is now installable everywhere: `npx @radicool/throughline init`.
  (The unscoped `throughline` npm name belongs to an unrelated package.)
- **Tag-driven release automation.** Pushing a `vX.Y.Z` tag now runs the full CI
  validation, publishes to npm with provenance via trusted publishing, and creates
  a GitHub Release with notes extracted from this changelog
  (`.github/workflows/release.yml` + `ci/extract-changelog.mjs`).

### Changed
- **Install command for Cursor/Codex/AGENTS.md targets is now `npx @radicool/throughline init`**
  (previously documented as `npx throughline init`, which was never published).
- README version badge now reads live from the npm registry.
```

- [ ] **Step 2: Fix the link footer**

Replace:

```markdown
[Unreleased]: https://github.com/jrpease/throughline/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/jrpease/throughline/compare/v0.9.0...v0.10.0
```

with:

```markdown
[Unreleased]: https://github.com/jrpease/throughline/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/jrpease/throughline/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/jrpease/throughline/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/jrpease/throughline/compare/v0.9.0...v0.10.0
```

(The missing `[0.11.0]` link and stale `[Unreleased]` anchor are pre-existing bugs from the 0.11.0 release.)

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: 0.12.0 changelog entry + repair 0.11.0 link footer"
```

---

### Task 3: ci/extract-changelog.mjs (TDD)

**Files:**
- Create: `ci/extract-changelog.mjs`
- Test: `ci/extract-changelog.test.mjs`

**Interfaces:**
- Produces: `export function extractChangelog(markdown, version)` → returns the section body (string, trimmed) for `## [version]`, throwing `Error` with message `` `CHANGELOG.md has no section for version ${version}` `` when absent. CLI: `node ci/extract-changelog.mjs <version>` prints the section from the repo's `CHANGELOG.md` to stdout; exits 1 with the error on stderr when missing. Task 4's workflow and Task 8 call the CLI form.

- [ ] **Step 1: Write the failing tests**

Create `ci/extract-changelog.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractChangelog } from './extract-changelog.mjs';

const SAMPLE = `# Changelog

Intro prose.

## [Unreleased]

## [0.12.0] - 2026-07-03

### Added
- npm publishing.

### Changed
- Install command.

## [0.11.0] - 2026-07-02

### Fixed
- A bug.

[Unreleased]: https://example.com/compare/v0.12.0...HEAD
[0.12.0]: https://example.com/compare/v0.11.0...v0.12.0
[0.11.0]: https://example.com/compare/v0.10.0...v0.11.0
`;

test('extracts a mid-file version section', () => {
  const body = extractChangelog(SAMPLE, '0.12.0');
  assert.ok(body.includes('npm publishing.'));
  assert.ok(body.includes('Install command.'));
  assert.ok(!body.includes('A bug.'), 'must stop before the next section');
  assert.ok(!body.startsWith('## ['), 'must not include its own heading');
});

test('extracts the last section without swallowing the link footer', () => {
  const body = extractChangelog(SAMPLE, '0.11.0');
  assert.ok(body.includes('A bug.'));
  assert.ok(!body.includes('https://example.com'), 'link definitions are not notes');
});

test('throws a clear error for a missing version', () => {
  assert.throws(() => extractChangelog(SAMPLE, '9.9.9'), /no section for version 9\.9\.9/);
});

test('returns trimmed output with no leading/trailing blank lines', () => {
  const body = extractChangelog(SAMPLE, '0.12.0');
  assert.equal(body, body.trim());
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test ci/extract-changelog.test.mjs
```

Expected: FAIL — `Cannot find module` for `./extract-changelog.mjs`.

- [ ] **Step 3: Write the implementation**

Create `ci/extract-changelog.mjs`:

```js
// Extracts one version's section from CHANGELOG.md. Pure function + CLI.
// Run from anywhere: paths resolve relative to this file (repo root is `..`).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function extractChangelog(markdown, version) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) {
    throw new Error(`CHANGELOG.md has no section for version ${version}`);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    // Stop at the next section heading or at the link-definition footer.
    if (lines[i].startsWith('## ') || /^\[[^\]]+\]:\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}

function main() {
  const version = process.argv[2];
  if (!version) {
    console.error('usage: node ci/extract-changelog.mjs <version>');
    process.exit(1);
  }
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const markdown = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
  try {
    console.log(extractChangelog(markdown, version));
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass, and smoke-test the CLI**

```bash
node --test ci/extract-changelog.test.mjs
```

Expected: 4 tests PASS.

```bash
node ci/extract-changelog.mjs 0.12.0
```

Expected: prints the 0.12.0 section written in Task 2 (starts with `### Added`).

```bash
node ci/extract-changelog.mjs 9.9.9; echo "exit=$?"
```

Expected: `✗ CHANGELOG.md has no section for version 9.9.9` on stderr, `exit=1`.

- [ ] **Step 5: Run the full suite (the new test joins `node --test` automatically)**

```bash
node --test
```

Expected: PASS including 4 new extract-changelog tests.

- [ ] **Step 6: Commit**

```bash
git add ci/extract-changelog.mjs ci/extract-changelog.test.mjs
git commit -m "feat(ci): extract-changelog script for release notes"
```

---

### Task 4: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `node ci/extract-changelog.mjs <version>` (Task 3); package version `0.12.0` (Task 1).
- Produces: on any `v*` tag push — npm publish with provenance + GitHub Release. Requires the one-time trusted-publisher configuration from Task 7 before its publish step can succeed.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write   # create the GitHub Release
  id-token: write   # npm trusted publishing (OIDC)

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - name: Verify tag matches package.json version
        run: |
          PKG_VERSION=$(node -p "require('./package.json').version")
          TAG_VERSION="${GITHUB_REF_NAME#v}"
          if [ "$PKG_VERSION" != "$TAG_VERSION" ]; then
            echo "::error::tag $GITHUB_REF_NAME does not match package.json version $PKG_VERSION"
            exit 1
          fi
      - name: Run test suite
        run: node --test
      - name: Validate plugin manifests
        run: node ci/validate-plugin.mjs
      - name: Validate skill/command frontmatter
        run: node ci/validate-skills.mjs
      - name: Check adapters are up to date
        run: node scripts/adapters/generate.mjs --check
      - name: Update npm (trusted publishing needs npm >= 11.5)
        run: npm install -g npm@latest
      - name: Publish to npm
        run: npm publish --provenance
      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          node ci/extract-changelog.mjs "${GITHUB_REF_NAME#v}" > "$RUNNER_TEMP/notes.md"
          gh release create "$GITHUB_REF_NAME" --title "$GITHUB_REF_NAME" --notes-file "$RUNNER_TEMP/notes.md"
```

Notes for the implementer: Node 20 bundles npm 10, which predates trusted publishing — the `npm install -g npm@latest` step is required, not cosmetic. No `NODE_AUTH_TOKEN` is set anywhere; auth is OIDC via the `id-token: write` permission.

- [ ] **Step 2: Sanity-check the YAML parses**

```bash
node -e "
const s = require('fs').readFileSync('.github/workflows/release.yml','utf8');
if (!/on:\s*\n\s+push:\s*\n\s+tags:/.test(s)) throw new Error('tag trigger missing');
console.log('workflow file present, tag trigger found,', s.split('\n').length, 'lines');
"
```

Expected: `workflow file present, tag trigger found, <N> lines`. (No local Actions runner — the guard/validate/publish path is exercised for real by the first automated release; the spec accepts this.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat(ci): tag-driven release workflow (npm trusted publishing + GitHub Release)"
```

---

### Task 5: Open and merge the PR

**Files:** none (git/GitHub operations only)

**Interfaces:**
- Consumes: the `feat/publishing` branch with Tasks 1–4 committed.
- Produces: all changes on `main`, which Task 6 tags.

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin feat/publishing
gh pr create --title "feat: publish as @radicool/throughline with tag-driven releases" --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-07-03-publishing-design.md:

- Rename package to `@radicool/throughline`, bump to 0.12.0, `publishConfig.access: public`
- README/scripts docs: scoped install command + live npm badge
- CHANGELOG: 0.12.0 entry + repaired 0.11.0 link footer
- `ci/extract-changelog.mjs` (+tests): release notes from CHANGELOG
- `.github/workflows/release.yml`: tag guard → CI validation → npm publish (OIDC trusted publishing, provenance) → GitHub Release

First publish (0.12.0) is manual per spec — npm can't configure trusted publishing on a package that doesn't exist yet.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01UURePtW9chuNbuEA4mGKU4
EOF
)"
```

- [ ] **Step 2: Wait for CI, then merge**

```bash
gh pr checks --watch
```

Expected: CI `validate` job passes.

```bash
gh pr merge --merge --delete-branch
git checkout main && git pull
```

---

### Task 6: Tag catch-up and the v0.12.0 tag

**Files:** none (git operations only)

**Interfaces:**
- Consumes: merged `main` (Task 5). Retroactive tag targets verified on main: `f71a8f7` = `release: v0.10.0`, `d51f10c` = `release: v0.11.0`.
- Produces: pushed tags `v0.10.0`, `v0.11.0`, `v0.12.0`. **Pushing `v0.12.0` fires the release workflow, whose publish step will fail** (package not yet on npm; trusted publishing unconfigurable until Task 7). That one red run is expected — Task 7 publishes manually and Task 8 creates the release the failed run skipped.

- [ ] **Step 1: Create the retroactive tags**

```bash
git tag v0.10.0 f71a8f7
git tag v0.11.0 d51f10c
```

- [ ] **Step 2: Tag the release**

```bash
git tag v0.12.0 main
```

- [ ] **Step 3: Verify the CHANGELOG compare links will resolve**

```bash
git tag --list 'v0.1*'
```

Expected: `v0.10.0`, `v0.11.0`, `v0.12.0` all listed.

- [ ] **Step 4: Push the tags**

```bash
git push origin v0.10.0 v0.11.0 v0.12.0
```

Expected: three new tags on GitHub. The `Release` workflow run for `v0.12.0` starts and **fails at "Publish to npm"** — expected per the Interfaces note; verify it failed there and not earlier:

```bash
gh run list --workflow=release.yml --limit 1
```

---

### Task 7: First manual publish + trusted-publishing setup (USER AT KEYBOARD)

**Files:** none (npm registry + npmjs.com settings)

**Interfaces:**
- Consumes: tag `v0.12.0` (Task 6).
- Produces: `@radicool/throughline@0.12.0` live on npm; trusted publisher configured so Task 4's workflow succeeds from v0.13.0 on.

- [ ] **Step 1: Log in to npm (user runs this — it's interactive)**

Suggest the user type `! npm login` so the browser-based login lands in the session.

```bash
npm whoami
```

Expected: the user's npm username.

- [ ] **Step 2: Create the org (user, in browser)**

On https://www.npmjs.com/org/create the user creates organization **`radicool`** (free / public packages). If the name is taken, create **`radicoolstudio`** instead — then STOP and rename the scope everywhere: package.json, README.md, scripts/README.md, CHANGELOG.md 0.12.0 entry, and the spec, in a follow-up commit, re-tag, and return here.

- [ ] **Step 3: Publish from the tagged commit**

```bash
git checkout v0.12.0
npm publish
git checkout main
```

Expected: `+ @radicool/throughline@0.12.0` (public access comes from `publishConfig`; no `--access` flag needed). No provenance on this one manual release — acceptable, automated releases have it from here on.

- [ ] **Step 4: Verify the package is live**

```bash
npm view @radicool/throughline version dist-tags
```

Expected: `0.12.0`.

```bash
cd "$(mktemp -d)" && npx @radicool/throughline init --target=generic && ls skills AGENTS.md && cd -
```

Expected: the installer runs and scaffolds `skills/` + `AGENTS.md` — the end-to-end proof the published payload works.

- [ ] **Step 5: Configure trusted publishing (user, in browser)**

On https://www.npmjs.com/package/@radicool/throughline/access → "Trusted publisher": provider **GitHub Actions**, organization/user **jrpease**, repository **throughline**, workflow filename **release.yml**, environment blank. From v0.13.0, releases are: update CHANGELOG → `npm version minor` → `git push --follow-tags`.

---

### Task 8: GitHub Release for v0.12.0

**Files:** none (`gh` CLI)

**Interfaces:**
- Consumes: tag `v0.12.0` (Task 6), `ci/extract-changelog.mjs` (Task 3).
- Produces: the public v0.12.0 release notes (the failed workflow run from Task 6 never reached its release step).

- [ ] **Step 1: Create the release with CHANGELOG notes**

```bash
NOTES="$(mktemp)" && node ci/extract-changelog.mjs 0.12.0 > "$NOTES"
gh release create v0.12.0 --title v0.12.0 --notes-file "$NOTES"
```

Expected: prints the release URL.

- [ ] **Step 2: Verify**

```bash
gh release view v0.12.0
```

Expected: title `v0.12.0`, body starts with `### Added`, mentions `@radicool/throughline`. Also confirm the README npm badge now renders `0.12.0` at https://github.com/jrpease/throughline.

---

### Task 9: Marketplace submissions (USER AT KEYBOARD)

**Files:** none (browser forms)

**Interfaces:**
- Consumes: public repo with valid `.claude-plugin/plugin.json` + `marketplace.json` at v0.12.0.
- Produces: pending community-marketplace listing (primary) and official-directory submission (stretch; discretionary — nothing downstream depends on either).

- [ ] **Step 1: Pre-submission check**

```bash
node ci/validate-plugin.mjs && gh repo view jrpease/throughline --json visibility -q .visibility
```

Expected: `✓ plugin.json + marketplace.json OK` and `PUBLIC`.

- [ ] **Step 2: Submit to the community marketplace (user, in browser)**

The user opens https://clau.de/plugin-directory-submission and submits repo `https://github.com/jrpease/throughline`, using the plugin.json description. Automated security scanning runs on Anthropic's side; acceptance lands asynchronously.

- [ ] **Step 3: Submit to the official directory (user, in browser — stretch)**

Same form flow toward `anthropics/claude-plugins-official`; inclusion is at Anthropic's discretion. Do not block anything on it.

- [ ] **Step 4: Post-acceptance README follow-up (deferred)**

When a marketplace accepts the plugin, add its `/plugin install throughline@<marketplace>` one-liner to README's install section in a small follow-up PR. Out of scope for this plan's execution; noted here so it isn't lost.
