# Multi-Agent Installer (`npx throughline init`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `npx throughline init --target=cursor|codex|generic`, which stamps a committed adapter tree plus its runtime payload into a user's project, non-destructively and idempotently.

**Architecture:** A minimal root `package.json` exposes `scripts/install.mjs` as the `throughline` bin. The installer copies the already-committed, CI-drift-guarded `adapters/<target>/` tree into the project, merges the two shared files (`AGENTS.md`, `.cursor/mcp.json`) instead of clobbering them, and stages `references/` + `scripts/` (minus `scripts/adapters/`) into `.throughline/`, path-rewriting `${CLAUDE_PLUGIN_ROOT}` → `.throughline` on text files via the canonical `rewritePluginRoot`. Pure merge/rewrite logic is factored out and unit-tested; the whole copy is exercised in a temp-dir integration test.

**Tech Stack:** Node ≥20 built-ins only (`node:fs`, `node:path`, `node:url`, `node:test`, `node:os`). ESM. Reuses `scripts/adapters/translate.mjs`.

**Spec:** `docs/superpowers/specs/2026-07-02-multi-agent-adapters-phase2-installer-design.md`

## Global Constraints

- **ESM only, zero dependencies.** No new npm packages. Node built-ins only. (matches existing `ci/` + `scripts/` tooling)
- **Module style:** pure exported core functions + a thin CLI guarded by `import.meta.url === pathToFileURL(process.argv[1]).href` + a colocated `*.test.mjs`. Mirror `scripts/adapters/generate.mjs`.
- **Tests run under `node --test`** (already the CI command; auto-discovers `*.test.mjs`). Use `node:test` + `node:assert/strict`.
- **Never edit canonical source** (`skills/`, `commands/`, `.mcp.json`, `plugin.json`) or the committed `adapters/` tree from the installer. The installer only *reads* them.
- **`package.json` version tracks `.claude-plugin/plugin.json`** — start at `0.11.0`.
- **Base dir for staged payload is the literal string `.throughline`** (same constant all three emitters already use).
- **Targets:** exactly `cursor`, `codex`, `generic`.
- **Idempotent:** a second `init` into the same dir with the same target must produce a byte-identical tree.
- **Path rewrite on payload is path-only** (`rewritePluginRoot`), never the target-specific phrasing rules.

---

### Task 1: `package.json` + pure merge helpers

Set up the package so `npx`/`bin` resolves, and build the two non-destructive merge functions (no filesystem I/O) with full unit coverage.

**Files:**
- Create: `package.json`
- Create: `scripts/install.mjs` (constants + pure helpers only; `install()` and CLI come in later tasks)
- Test: `scripts/install.test.mjs`

**Interfaces:**
- Consumes: `rewritePluginRoot` from `./adapters/translate.mjs` (imported now, used in Task 2).
- Produces:
  - `mergeAgentsBlock(existing: string|null|undefined, block: string) -> string` — wraps `block` in `<!-- throughline:start -->`…`<!-- throughline:end -->`; creates when no file, replaces in place when delimiters present, appends when absent; idempotent.
  - `mergeMcpJson(existing: string|null|undefined, ourServers: object) -> string` — returns serialized JSON (2-space indent, trailing newline) with `mcpServers` merged (ours override same keys), preserving other servers/keys; idempotent.
  - Exported consts `TARGETS = ['cursor','codex','generic']`, `BASE = '.throughline'`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "throughline",
  "version": "0.11.0",
  "description": "Build a complete design system end to end — author in Figma, sync tokens to code, generate Storybook. Usable from Claude Code, Cursor, Codex, or any AGENTS.md agent.",
  "type": "module",
  "bin": {
    "throughline": "scripts/install.mjs"
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

- [ ] **Step 2: Write the failing test** for both merge helpers

Create `scripts/install.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeAgentsBlock, mergeMcpJson } from './install.mjs';

const START = '<!-- throughline:start -->';
const END = '<!-- throughline:end -->';
const BLOCK = '# ThroughLine\n\nindex here';

test('mergeAgentsBlock creates a wrapped block when no file exists', () => {
  const out = mergeAgentsBlock(undefined, BLOCK);
  assert.ok(out.includes(START) && out.includes(END), 'has delimiters');
  assert.ok(out.includes('index here'), 'has block content');
});

test('mergeAgentsBlock appends after existing non-delimited content', () => {
  const out = mergeAgentsBlock('# My project\n\nnotes', BLOCK);
  assert.ok(out.startsWith('# My project'), 'keeps existing content first');
  assert.ok(out.indexOf('My project') < out.indexOf(START), 'block comes after');
});

test('mergeAgentsBlock replaces an existing block in place', () => {
  const first = mergeAgentsBlock('# My project\n', BLOCK);
  const out = mergeAgentsBlock(first, '# ThroughLine\n\nNEW index');
  assert.ok(out.includes('NEW index'), 'has new content');
  assert.ok(!out.includes('index here'), 'old content gone');
  assert.equal(out.match(new RegExp(START, 'g')).length, 1, 'exactly one block');
});

test('mergeAgentsBlock is idempotent', () => {
  const once = mergeAgentsBlock('# My project\n', BLOCK);
  const twice = mergeAgentsBlock(once, BLOCK);
  assert.equal(twice, once);
});

test('mergeMcpJson preserves user servers and adds ours', () => {
  const existing = JSON.stringify({ mcpServers: { other: { command: 'x' } } });
  const parsed = JSON.parse(mergeMcpJson(existing, { 'figma-console': { command: 'figma' } }));
  assert.ok(parsed.mcpServers.other, 'kept user server');
  assert.ok(parsed.mcpServers['figma-console'], 'added ours');
});

test('mergeMcpJson writes ours when no file exists', () => {
  const parsed = JSON.parse(mergeMcpJson(undefined, { 'figma-console': { command: 'figma' } }));
  assert.deepEqual(parsed.mcpServers, { 'figma-console': { command: 'figma' } });
});

test('mergeMcpJson is idempotent', () => {
  const ours = { 'figma-console': { command: 'figma' } };
  const once = mergeMcpJson(undefined, ours);
  assert.equal(mergeMcpJson(once, ours), once);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test scripts/install.test.mjs`
Expected: FAIL — `Cannot find module './install.mjs'` (or export missing).

- [ ] **Step 4: Write `scripts/install.mjs` skeleton + the two helpers**

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rewritePluginRoot } from './adapters/translate.mjs';

export const BASE = '.throughline';
export const TARGETS = ['cursor', 'codex', 'generic'];
const START = '<!-- throughline:start -->';
const END = '<!-- throughline:end -->';

export function mergeAgentsBlock(existing, block) {
  const wrapped = `${START}\n${block.trim()}\n${END}`;
  if (!existing || !existing.trim()) return `${wrapped}\n`;
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s !== -1 && e !== -1 && e > s) {
    return existing.slice(0, s) + wrapped + existing.slice(e + END.length);
  }
  return `${existing.replace(/\s*$/, '')}\n\n${wrapped}\n`;
}

export function mergeMcpJson(existing, ourServers) {
  let obj = {};
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed;
    } catch { /* malformed → start fresh */ }
  }
  obj.mcpServers = { ...(obj.mcpServers || {}), ...ourServers };
  return `${JSON.stringify(obj, null, 2)}\n`;
}
```

Note: `readFileSync`, `copyFileSync`, `relative`, `sep`, `rewritePluginRoot`, `PKG_ROOT` etc. are imported/declared now but consumed in Task 2 — that's fine, they won't trip the tests. If your linter flags unused imports, leave them; Task 2 uses them.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test scripts/install.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 6: Make the bin executable and sanity-check package resolution**

Run:
```bash
chmod +x scripts/install.mjs
node -e "import('./scripts/install.mjs').then(m => console.log(m.TARGETS.join(',')))"
```
Expected: prints `cursor,codex,generic`.

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/install.mjs scripts/install.test.mjs
git commit -m "feat(installer): package.json bin + non-destructive merge helpers"
```

---

### Task 2: `install()` core — copy adapter tree + stage payload

Build the filesystem orchestration: copy the target's adapter tree (special-casing the two merged files), then stage `references/` + `scripts/` into `.throughline/` with the path rewrite. Exercise it end-to-end in a temp dir.

**Files:**
- Modify: `scripts/install.mjs` (add `PKG_ROOT`, `walk`, `stagePayload`, `install`)
- Modify: `scripts/install.test.mjs` (add integration tests)

**Interfaces:**
- Consumes: `mergeAgentsBlock`, `mergeMcpJson`, `BASE`, `TARGETS` (Task 1); `rewritePluginRoot` (from `./adapters/translate.mjs`).
- Produces: `install({ target, dir, pkgRoot? }) -> { target, dir, written: string[], payload: string[] }`. Throws `Error` on an unknown `target`. `written` is posix-relative adapter paths; `payload` is posix-relative payload paths. `pkgRoot` defaults to the package root (one level above `scripts/`).

- [ ] **Step 1: Write the failing integration tests**

Append to `scripts/install.test.mjs`:

```js
import { mkdtempSync, readFileSync as rfs, existsSync as exists, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from './install.mjs';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const toPosix = (p) => p.split(sep).join('/');

function walkTree(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTree(abs, base));
    else out.push(toPosix(relative(base, abs)));
  }
  return out;
}

const freshDir = (tag) => mkdtempSync(join(tmpdir(), `tl-${tag}-`));

test('cursor install writes rules, merged mcp.json, and payload', () => {
  const dir = freshDir('cursor');
  const res = install({ target: 'cursor', dir, pkgRoot: PKG_ROOT });
  const files = walkTree(dir);
  assert.ok(files.some((f) => f.startsWith('.cursor/rules/') && f.endsWith('.mdc')), 'has rules');
  assert.ok(files.includes('.cursor/mcp.json'), 'has mcp.json');
  assert.ok(files.some((f) => f.startsWith('.throughline/references/')), 'has references');
  assert.ok(files.some((f) => f.startsWith('.throughline/scripts/')), 'has scripts');
  assert.ok(res.written.length > 0 && res.payload.length > 0);
});

test('codex/generic install merges a single AGENTS.md block', () => {
  for (const target of ['codex', 'generic']) {
    const dir = freshDir(target);
    install({ target, dir, pkgRoot: PKG_ROOT });
    const agents = rfs(join(dir, 'AGENTS.md'), 'utf8');
    assert.equal(agents.match(/throughline:start/g).length, 1, `${target}: one start marker`);
    assert.equal(agents.match(/throughline:end/g).length, 1, `${target}: one end marker`);
  }
});

test('no installed file leaks CLAUDE_PLUGIN_ROOT, and scripts/adapters is excluded', () => {
  const dir = freshDir('leak');
  install({ target: 'generic', dir, pkgRoot: PKG_ROOT });
  const files = walkTree(dir);
  assert.ok(!files.some((f) => f.startsWith('.throughline/scripts/adapters/')), 'adapters excluded');
  for (const f of files) {
    if (/\.(md|mdc|json|mjs|toml|txt)$/.test(f)) {
      assert.doesNotMatch(rfs(join(dir, f), 'utf8'), /CLAUDE_PLUGIN_ROOT/, `${f} leaked the var`);
    }
  }
});

test('a second install produces a byte-identical tree (idempotent)', () => {
  const dir = freshDir('idem');
  install({ target: 'codex', dir, pkgRoot: PKG_ROOT });
  const snap1 = walkTree(dir).sort().map((f) => [f, rfs(join(dir, f), 'utf8')]);
  install({ target: 'codex', dir, pkgRoot: PKG_ROOT });
  const snap2 = walkTree(dir).sort().map((f) => [f, rfs(join(dir, f), 'utf8')]);
  assert.deepEqual(snap2, snap1);
});

test('install throws on an unknown target', () => {
  assert.throws(() => install({ target: 'windsurf', dir: freshDir('bad'), pkgRoot: PKG_ROOT }), /unknown target/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/install.test.mjs`
Expected: FAIL — `install` is not exported / not a function.

- [ ] **Step 3: Implement `install()` and its helpers**

Add to `scripts/install.mjs`, after the merge helpers (before any CLI block):

```js
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_EXT = /\.(md|mdc|mjs|json|toml|txt)$/;
const toPosix = (p) => p.split(sep).join('/');

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, base));
    else out.push(relative(base, abs));
  }
  return out;
}

function writeText(dest, content) {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
}

// Copy a source tree into destRoot, rewriting ${CLAUDE_PLUGIN_ROOT} on text
// files. `skip(relPosix)` drops entries. Returns posix-relative paths written.
function stagePayload(srcRoot, destRoot, skip) {
  const written = [];
  for (const rel of walk(srcRoot)) {
    const relPosix = toPosix(rel);
    if (skip && skip(relPosix)) continue;
    const src = join(srcRoot, rel);
    const dest = join(destRoot, rel);
    mkdirSync(dirname(dest), { recursive: true });
    if (TEXT_EXT.test(rel)) writeFileSync(dest, rewritePluginRoot(readFileSync(src, 'utf8'), BASE));
    else copyFileSync(src, dest);
    written.push(relPosix);
  }
  return written;
}

export function install({ target, dir, pkgRoot = PKG_ROOT }) {
  if (!TARGETS.includes(target)) {
    throw new Error(`unknown target "${target}"; expected one of: ${TARGETS.join(', ')}`);
  }
  const written = [];
  const adapterDir = join(pkgRoot, 'adapters', target);
  for (const rel of walk(adapterDir)) {
    const relPosix = toPosix(rel);
    const src = join(adapterDir, rel);
    const dest = join(dir, rel);
    if (relPosix === 'AGENTS.md') {
      const existing = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
      writeText(dest, mergeAgentsBlock(existing, readFileSync(src, 'utf8')));
    } else if (relPosix === '.cursor/mcp.json') {
      const ours = JSON.parse(readFileSync(src, 'utf8')).mcpServers || {};
      const existing = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
      writeText(dest, mergeMcpJson(existing, ours));
    } else {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
    written.push(relPosix);
  }
  const payload = [
    ...stagePayload(join(pkgRoot, 'references'), join(dir, BASE, 'references')),
    ...stagePayload(join(pkgRoot, 'scripts'), join(dir, BASE, 'scripts'), (r) => r.startsWith('adapters/')),
  ];
  return { target, dir, written, payload };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/install.test.mjs`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Manual smoke test into a scratch dir**

Run:
```bash
D=$(mktemp -d); node -e "import('./scripts/install.mjs').then(m => m.install({ target: 'cursor', dir: '$D' }))"; find "$D" -type f | sort | head; grep -rl CLAUDE_PLUGIN_ROOT "$D" || echo "NO LEAKS"; rm -rf "$D"
```
Expected: a `.cursor/…` + `.throughline/…` tree listed, and `NO LEAKS`.

- [ ] **Step 6: Commit**

```bash
git add scripts/install.mjs scripts/install.test.mjs
git commit -m "feat(installer): install() copies adapter tree + stages runtime payload"
```

---

### Task 3: CLI wrapper

Wire `throughline init --target=… [--dir=.]` on top of `install()`, with arg parsing, usage text, per-target MCP next-step output, and validation.

**Files:**
- Modify: `scripts/install.mjs` (add `parseArgs`, `USAGE`, `MCP_NOTE`, CLI guard block)
- Modify: `scripts/install.test.mjs` (add `parseArgs` + child-process CLI tests)

**Interfaces:**
- Consumes: `install()` (Task 2), `TARGETS` (Task 1).
- Produces: `parseArgs(argv: string[]) -> { cmd, target, dir, help }` (exported for test). The CLI guard runs only when the file is the entrypoint.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/install.test.mjs`:

```js
import { execFileSync } from 'node:child_process';
import { parseArgs } from './install.mjs';

const INSTALL = join(PKG_ROOT, 'scripts', 'install.mjs');

test('parseArgs reads command, target, and dir', () => {
  const a = parseArgs(['init', '--target=codex', '--dir=/tmp/x']);
  assert.equal(a.cmd, 'init');
  assert.equal(a.target, 'codex');
  assert.equal(a.dir, '/tmp/x');
});

test('parseArgs flags --help', () => {
  assert.equal(parseArgs(['--help']).help, true);
});

test('CLI init installs into --dir and prints a summary', () => {
  const dir = freshDir('cli');
  const out = execFileSync('node', [INSTALL, 'init', '--target=cursor', `--dir=${dir}`], { encoding: 'utf8' });
  assert.match(out, /installed cursor adapter/);
  assert.ok(exists(join(dir, '.cursor', 'mcp.json')), 'wrote mcp.json');
});

test('CLI exits non-zero on a bad target', () => {
  assert.throws(() => execFileSync('node', [INSTALL, 'init', '--target=nope'], { stdio: 'pipe' }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/install.test.mjs`
Expected: FAIL — `parseArgs` not exported; CLI does nothing yet.

- [ ] **Step 3: Add the CLI to `scripts/install.mjs`**

Add near the top (after the consts) the notes/usage:

```js
const MCP_NOTE = {
  cursor: 'Figma MCP written to .cursor/mcp.json — restart Cursor to load it.',
  codex: 'Add the [mcp_servers] block from codex-mcp.toml to your Codex config (e.g. ~/.codex/config.toml).',
  generic: 'Add the MCP server shown under "MCP servers" in AGENTS.md to your agent.',
};

const USAGE = `throughline init --target=cursor|codex|generic [--dir=.]

Stamps the ThroughLine adapter for <target> into your project, plus the
runtime payload it reads (.throughline/references, .throughline/scripts).
Safe to re-run: merges AGENTS.md and .cursor/mcp.json non-destructively.`;

export function parseArgs(argv) {
  const args = { cmd: null, target: null, dir: process.cwd(), help: false };
  for (const a of argv) {
    if (a === '--help' || a === '-h') args.help = true;
    else if (a.startsWith('--target=')) args.target = a.slice('--target='.length);
    else if (a.startsWith('--dir=')) args.dir = a.slice('--dir='.length);
    else if (!a.startsWith('-') && !args.cmd) args.cmd = a;
  }
  return args;
}
```

Add the CLI guard at the end of the file:

```js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }
  if (args.cmd !== 'init') { console.error(`✗ unknown command; expected "init"\n\n${USAGE}`); process.exit(1); }
  if (!TARGETS.includes(args.target)) {
    console.error(`✗ --target must be one of: ${TARGETS.join(', ')}\n\n${USAGE}`);
    process.exit(1);
  }
  const res = install({ target: args.target, dir: args.dir });
  console.log(`✓ throughline: installed ${res.target} adapter (${res.written.length} files) + ${res.payload.length}-file runtime payload into ${res.dir}`);
  console.log(`  ${MCP_NOTE[res.target]}`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/install.test.mjs`
Expected: PASS (all tests).

- [ ] **Step 5: Verify the packaged bin works via `npm pack`**

Run:
```bash
npm pack --dry-run 2>&1 | grep -E "adapters/|references/|scripts/install.mjs|package.json" | head
node scripts/install.mjs --help
```
Expected: the tarball listing includes `scripts/install.mjs`, `adapters/`, `references/`; `--help` prints usage.

- [ ] **Step 6: Commit**

```bash
git add scripts/install.mjs scripts/install.test.mjs
git commit -m "feat(installer): throughline init CLI with per-target MCP guidance"
```

---

### Task 4: README + docs rewrite

Generalize the README from "a Claude Code plugin" to a multi-tool builder with per-tool getting-started, and mention the installer in `scripts/README.md`. Surgical edits — preserve Jordan's voice (if the `write-like-jordan` skill is available, use it for any new prose).

**Files:**
- Modify: `README.md` (tagline, badge, Requirements table, Install section)
- Modify: `scripts/README.md` (adapters section: mention `scripts/install.mjs`)

**Interfaces:** none (docs only).

- [ ] **Step 1: Generalize the tagline** (`README.md:9`)

Replace:
```markdown
**A Claude Code plugin packed with every skill you need to launch and manage a production-grade design system in hours — not months.**
```
with:
```markdown
**Every skill you need to launch and manage a production-grade design system in hours — not months. Built for Claude Code, and installable into Cursor, Codex, or any AGENTS.md agent.**
```

- [ ] **Step 2: Broaden the "Built for" badge** (`README.md:13`)

Replace the single Claude Code badge line with a Claude Code badge plus a note it runs elsewhere. Change:
```markdown
[![Built for Claude Code](https://img.shields.io/badge/built%20for-Claude%20Code-d97757)](https://docs.claude.com/en/docs/claude-code)
```
to:
```markdown
[![Built for Claude Code](https://img.shields.io/badge/built%20for-Claude%20Code-d97757)](https://docs.claude.com/en/docs/claude-code)
[![Also on Cursor · Codex · AGENTS.md](https://img.shields.io/badge/also%20on-Cursor%20·%20Codex%20·%20AGENTS.md-22c55e)](#install)
```

- [ ] **Step 3: Generalize the Requirements table row** (`README.md:75`)

Replace:
```markdown
| **[Claude Code](https://docs.claude.com/en/docs/claude-code)** | Required — ThroughLine is a Claude Code plugin. |
```
with:
```markdown
| **A supported agent** | Required — [Claude Code](https://docs.claude.com/en/docs/claude-code) (native plugin), or **Cursor**, **Codex**, or any **AGENTS.md**-aware agent via `npx throughline init`. |
```

- [ ] **Step 4: Rewrite the Install section** (`README.md:80-103`)

Replace the entire `### Install` block (from the `### Install` heading through the `/plugin marketplace update throughline-marketplace` fenced block, i.e. lines 80–103) with per-tool subsections:

````markdown
### Install

ThroughLine is authored as a Claude Code plugin and generated into adapters for other agents. Pick your tool:

#### Claude Code

Install from this repo's plugin marketplace:

```
/plugin marketplace add jrpease/throughline
/plugin install throughline@throughline-marketplace
```

Then start with:

```
/throughline:start
```

This is the reliable entry point — it runs environment setup first, ahead of anything else. (You can also just say *"let's set up my design system"*, but if you have other plugins installed that grab "let's build…" style phrases, the slash command guarantees ThroughLine takes the wheel.)

Update anytime with `/plugin marketplace update throughline-marketplace`.

#### Cursor, Codex, or a generic AGENTS.md agent

Run the installer in your project — it stamps in the skills, the reference docs, the scripts, and the Figma MCP config for your tool:

```
npx throughline init --target=cursor    # → .cursor/rules + .cursor/mcp.json
npx throughline init --target=codex      # → prompts/ + AGENTS.md index + codex-mcp.toml
npx throughline init --target=generic    # → skills/ + AGENTS.md index
```

It's safe to re-run (it merges `AGENTS.md` and `.cursor/mcp.json` non-destructively) and stages everything the skills read into `.throughline/`. Then open the `figma-environment-setup` skill/rule/prompt for your tool to begin. For Codex, add the printed `codex-mcp.toml` block to your Codex config to enable Figma access.
````

- [ ] **Step 5: Mention the installer in `scripts/README.md`**

In the "Multi-agent adapters" section, after the regenerate/`--check` paragraph, add:

```markdown
Users install a target into their own project with the installer, which copies
the committed `adapters/<target>/` tree plus the runtime payload
(`references/` + `scripts/`, minus `scripts/adapters/`) into `.throughline/`,
rewriting `${CLAUDE_PLUGIN_ROOT}` → `.throughline`:

    npx throughline init --target=cursor|codex|generic

See `scripts/install.mjs` (pure core + CLI + `install.test.mjs`).
```

- [ ] **Step 6: Verify no stale "is a Claude Code plugin" phrasing remains where it now misleads**

Run: `grep -n "Claude Code plugin" README.md`
Expected: remaining hits (if any) describe authorship ("authored as a Claude Code plugin"), not a hard requirement. Fix any that still imply Claude Code is the only option.

- [ ] **Step 7: Commit**

```bash
git add README.md scripts/README.md
git commit -m "docs: multi-tool README + installer getting-started"
```

---

### Task 5: Full suite + drift guard verification

Confirm the whole repo is green — the new tests, the existing adapter drift check, and the plugin/skill validators — since the installer touches package layout and docs.

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `node --test`
Expected: PASS — all suites including `scripts/install.test.mjs` and `scripts/adapters/*.test.mjs`.

- [ ] **Step 2: Confirm adapters are still in sync** (installer must not have touched canonical source or committed adapters)

Run: `node scripts/adapters/generate.mjs --check`
Expected: `✓ adapters in sync`.

- [ ] **Step 3: Run the structural validators**

Run:
```bash
node ci/validate-plugin.mjs
node ci/validate-skills.mjs
```
Expected: both pass. (`validate-plugin.mjs` reads `.claude-plugin/plugin.json` and `marketplace.json` by explicit path — it does not scan for stray manifests, so the new root `package.json` is inert to it. No validator change is expected.)

- [ ] **Step 4: Final idempotency + leak smoke across all three targets**

Run:
```bash
for t in cursor codex generic; do
  D=$(mktemp -d)
  node scripts/install.mjs init --target=$t --dir="$D" >/dev/null
  node scripts/install.mjs init --target=$t --dir="$D" >/dev/null
  echo "$t: $(grep -rl CLAUDE_PLUGIN_ROOT "$D" | wc -l | tr -d ' ') leaks"
  rm -rf "$D"
done
```
Expected: `cursor: 0 leaks`, `codex: 0 leaks`, `generic: 0 leaks` (and no errors from the double-run).

- [ ] **Step 5: Nothing to commit here** unless an earlier task left an uncommitted change

This task is verification only. If `git status` is clean, you're done. If Step 1–4 surfaced a real bug, fix it in the owning task's file and commit with an appropriate message.

---

## Notes for the implementer

- **CI needs no change** for tests — `.github/workflows/ci.yml` already runs `node --test` (auto-discovers `install.test.mjs`) and `generate.mjs --check`. Only touch CI if Task 5 Step 3 surfaces a validator conflict with the new `package.json`.
- **Out of scope (do not do here):** publishing to npm; the deferred Phase-1 cosmetic cleanups (trailing double-newline, `firstSentence` abbreviation, null guards) — those force an `adapters/` regen and belong in a separate sweep.
- **Voice:** README prose is brand-sensitive. Keep edits surgical and match the surrounding tone; use the `write-like-jordan` skill for any net-new sentences if it's available.
