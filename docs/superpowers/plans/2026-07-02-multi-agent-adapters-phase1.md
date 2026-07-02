# Multi-Agent Adapters — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate Cursor, Codex, and generic-AGENTS.md adapter files from the canonical `SKILL.md`/`commands`/`.mcp.json` source, with a CI drift guard, without editing any source file.

**Architecture:** A source reader loads the canonical plugin into an in-memory model. A source-preserving translation layer rewrites `${CLAUDE_PLUGIN_ROOT}` paths and applies a small phrasing-substitution table. Three per-target emitters turn the model into `{path, content}` file lists. A generator orchestrator writes those into a committed `adapters/<target>/` tree; a drift test regenerates and asserts byte-equality plus portability invariants.

**Tech Stack:** Node.js ESM (`.mjs`), `node:test` + `node:assert/strict`. No `package.json`, no third-party deps — matches existing `ci/` and `scripts/` tooling.

## Global Constraints

- Node ≥20, ESM only. No new runtime dependencies.
- Tests run under bare `node --test` from the repo root (never a pathed `node --test <dir>`).
- Every `.mjs` follows the repo pattern: a pure exported function + a CLI guarded by `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)`.
- Resolve the repo root as `join(dirname(fileURLToPath(import.meta.url)), '..', '..')` from `scripts/adapters/`.
- **Never modify** `skills/*/SKILL.md`, `commands/*.md`, `references/*`, `.mcp.json`, or `plugin.json`.
- Install-target base dir for rewritten paths is the literal string `.throughline`.
- Generator code lives in `scripts/adapters/`. Committed generated output lives in `adapters/<target>/`.
- Targets are exactly `'cursor'`, `'codex'`, `'generic'`.

---

## File Structure

- `scripts/adapters/read-sources.mjs` — load canonical plugin into a `Model`. Exports `parseFrontmatter`, `readSources`.
- `scripts/adapters/translate.mjs` — source-preserving text transforms. Exports `rewritePluginRoot`, `PHRASING_RULES`, `applyPhrasing`, `translateBody`, `firstSentence`.
- `scripts/adapters/emit-cursor.mjs` — exports `emitCursor(model) -> File[]`.
- `scripts/adapters/emit-codex.mjs` — exports `emitCodex(model) -> File[]`.
- `scripts/adapters/emit-generic.mjs` — exports `emitGeneric(model) -> File[]`.
- `scripts/adapters/generate.mjs` — exports `generate(model) -> {cursor,codex,generic}` + CLI (`--check`). Writes `adapters/<target>/`.
- Colocated `*.test.mjs` for each of the above.
- `adapters/cursor/`, `adapters/codex/`, `adapters/generic/` — committed generated output (drift snapshot).

**Shared types (used across tasks):**

```
File   = { path: string, content: string }   // path is target-root-relative, POSIX separators
Skill  = { name: string, description: string, body: string }   // body = markdown after frontmatter
Command= { name: string, description: string, body: string }
Model  = {
  plugin:   object,                 // parsed plugin.json
  mcp:      object,                 // parsed .mcp.json  ({ mcpServers: {...} })
  skills:   Skill[],                // sorted by name asc
  commands: Command[],              // sorted by name asc
}
Target = 'cursor' | 'codex' | 'generic'
```

---

## Task 1: Source reader

**Files:**
- Create: `scripts/adapters/read-sources.mjs`
- Test: `scripts/adapters/read-sources.test.mjs`

**Interfaces:**
- Consumes: nothing (entry point).
- Produces:
  - `parseFrontmatter(text: string) -> { attrs: Record<string,string>, body: string }` — parses a leading `---\n…\n---\n` block. `attrs` holds only the top-level `name`/`description` scalar keys (values may be quoted; strip one layer of surrounding `"`). `body` is everything after the closing fence, leading newline trimmed. No YAML dependency — parse `key: value` lines only.
  - `readSources(repoRoot: string) -> Model` — reads `plugin.json`, `.mcp.json`, every `skills/*/SKILL.md`, every `commands/*.md`. Skill `name` comes from frontmatter; command `name` comes from the filename without `.md`. Arrays sorted by `name`.

- [ ] **Step 1: Write the failing test**

Create `scripts/adapters/read-sources.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from './read-sources.mjs';

test('parseFrontmatter splits attrs and body', () => {
  const src = '---\nname: token-builder\ndescription: "Build tokens. Use when X."\n---\n# Token builder\n\nBody text.\n';
  const { attrs, body } = parseFrontmatter(src);
  assert.equal(attrs.name, 'token-builder');
  assert.equal(attrs.description, 'Build tokens. Use when X.');
  assert.equal(body, '# Token builder\n\nBody text.\n');
});

test('parseFrontmatter tolerates no frontmatter', () => {
  const { attrs, body } = parseFrontmatter('# Just a heading\n');
  assert.deepEqual(attrs, {});
  assert.equal(body, '# Just a heading\n');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/adapters/read-sources.test.mjs`
Expected: FAIL — cannot find module `./read-sources.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/adapters/read-sources.mjs`:

```javascript
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { attrs: {}, body: text };
  const attrs = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') v = v.slice(1, -1);
    attrs[kv[1]] = v;
  }
  const body = text.slice(m[0].length).replace(/^\n+/, '');
  return { attrs, body };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function readSources(repoRoot) {
  const plugin = readJson(join(repoRoot, '.claude-plugin', 'plugin.json'));
  const mcp = readJson(join(repoRoot, '.mcp.json'));

  const skillsDir = join(repoRoot, 'skills');
  const skills = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const { attrs, body } = parseFrontmatter(readFileSync(join(skillsDir, d.name, 'SKILL.md'), 'utf8'));
      return { name: attrs.name || d.name, description: attrs.description || '', body };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const cmdDir = join(repoRoot, 'commands');
  const commands = readdirSync(cmdDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { attrs, body } = parseFrontmatter(readFileSync(join(cmdDir, f), 'utf8'));
      return { name: f.replace(/\.md$/, ''), description: attrs.description || '', body };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { plugin, mcp, skills, commands };
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const model = readSources(REPO_ROOT);
  console.log(`skills: ${model.skills.length}, commands: ${model.commands.length}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/adapters/read-sources.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Smoke-check against real sources**

Run: `node scripts/adapters/read-sources.mjs`
Expected: `skills: 12, commands: 4`.

- [ ] **Step 6: Commit**

```bash
git add scripts/adapters/read-sources.mjs scripts/adapters/read-sources.test.mjs
git commit -m "feat(adapters): source reader for canonical plugin model"
```

---

## Task 2: Translation layer

**Files:**
- Create: `scripts/adapters/translate.mjs`
- Test: `scripts/adapters/translate.test.mjs`

**Interfaces:**
- Consumes: nothing (pure string transforms).
- Produces:
  - `rewritePluginRoot(text, baseDir) -> string` — replaces every `${CLAUDE_PLUGIN_ROOT}` with `baseDir`.
  - `PHRASING_RULES: Array<{ pattern: RegExp, cursor: string, codex: string, generic: string }>` — exported for review/testing.
  - `applyPhrasing(text, target) -> string` — applies each rule's target replacement.
  - `translateBody(text, { baseDir, target }) -> string` — `applyPhrasing(rewritePluginRoot(text, baseDir), target)`.
  - `firstSentence(text) -> string` — the description up to and including the first `. ` (or the whole string if none), trimmed. Used to build routing indexes.

- [ ] **Step 1: Write the failing test**

Create `scripts/adapters/translate.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewritePluginRoot, applyPhrasing, translateBody, firstSentence } from './translate.mjs';

test('rewritePluginRoot replaces every occurrence', () => {
  const t = 'Read ${CLAUDE_PLUGIN_ROOT}/references/a.md and ${CLAUDE_PLUGIN_ROOT}/scripts/b.mjs';
  assert.equal(
    rewritePluginRoot(t, '.throughline'),
    'Read .throughline/references/a.md and .throughline/scripts/b.mjs',
  );
});

test('applyPhrasing rewrites a named cross-skill reference per target', () => {
  const t = 'Invoke the `component-builder` skill now.';
  assert.equal(applyPhrasing(t, 'cursor'), 'Invoke the `component-builder` rule now.');
  assert.equal(applyPhrasing(t, 'codex'), 'Invoke the `component-builder` prompt now.');
  assert.equal(applyPhrasing(t, 'generic'), 'Invoke the `component-builder` skill now.');
});

test('translateBody composes path rewrite then phrasing', () => {
  const t = 'See ${CLAUDE_PLUGIN_ROOT}/references/x.md then run the `token-builder` skill.';
  assert.equal(
    translateBody(t, { baseDir: '.throughline', target: 'codex' }),
    'See .throughline/references/x.md then run the `token-builder` prompt.',
  );
});

test('firstSentence extracts the leading sentence', () => {
  assert.equal(firstSentence('Build tokens. Use when the user wants X.'), 'Build tokens.');
  assert.equal(firstSentence('No period here'), 'No period here');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/adapters/translate.test.mjs`
Expected: FAIL — cannot find module `./translate.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/adapters/translate.mjs`:

```javascript
export function rewritePluginRoot(text, baseDir) {
  return text.split('${CLAUDE_PLUGIN_ROOT}').join(baseDir);
}

// Small, reviewable substitution table. Only NAMED cross-skill references and a
// few Claude-specific phrasings are rewritten; bare prose ("this skill") reads
// fine on every target and is deliberately left alone.
export const PHRASING_RULES = [
  {
    // "the `component-builder` skill" -> per-target noun
    pattern: /the `([a-z][a-z-]*)` skill\b/g,
    cursor: 'the `$1` rule',
    codex: 'the `$1` prompt',
    generic: 'the `$1` skill',
  },
  {
    pattern: /\bthe plugin README\b/g,
    cursor: 'the ThroughLine README',
    codex: 'the ThroughLine README',
    generic: 'the ThroughLine README',
  },
  {
    pattern: /\bClaude Code\b/g,
    cursor: 'Cursor',
    codex: 'Codex',
    generic: 'your coding agent',
  },
];

export function applyPhrasing(text, target) {
  let out = text;
  for (const rule of PHRASING_RULES) {
    out = out.replace(rule.pattern, rule[target]);
  }
  return out;
}

export function translateBody(text, { baseDir, target }) {
  return applyPhrasing(rewritePluginRoot(text, baseDir), target);
}

export function firstSentence(text) {
  const m = /^(.*?\.)(\s|$)/.exec(text.trim());
  return (m ? m[1] : text).trim();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/adapters/translate.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/adapters/translate.mjs scripts/adapters/translate.test.mjs
git commit -m "feat(adapters): source-preserving translation layer"
```

---

## Task 3: Cursor emitter

**Files:**
- Create: `scripts/adapters/emit-cursor.mjs`
- Test: `scripts/adapters/emit-cursor.test.mjs`

**Interfaces:**
- Consumes: `Model` (Task 1), `translateBody` (Task 2).
- Produces: `emitCursor(model) -> File[]` where each `File.path` is target-root-relative:
  - `.cursor/rules/<skill>.mdc` per skill — frontmatter `description` (single-line; newlines collapsed to spaces) + `alwaysApply: false`, then the translated body.
  - `.cursor/commands/<command>.md` per command — translated body only (no frontmatter).
  - `.cursor/mcp.json` — `JSON.stringify(model.mcp, null, 2) + '\n'` (Cursor uses the same `mcpServers` schema).

- [ ] **Step 1: Write the failing test**

Create `scripts/adapters/emit-cursor.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitCursor } from './emit-cursor.mjs';

const model = {
  mcp: { mcpServers: { 'figma-console': { command: 'npx' } } },
  skills: [{ name: 'token-builder', description: 'Build tokens.\nUse when X.', body: 'Read ${CLAUDE_PLUGIN_ROOT}/references/x.md.' }],
  commands: [{ name: 'start', description: 'Start.', body: 'Invoke the `figma-environment-setup` skill.' }],
};

test('emitCursor produces a description-triggered rule per skill', () => {
  const files = emitCursor(model);
  const rule = files.find((f) => f.path === '.cursor/rules/token-builder.mdc');
  assert.ok(rule, 'rule file exists');
  assert.match(rule.content, /^---\ndescription: Build tokens\. Use when X\.\nalwaysApply: false\n---\n/);
  assert.match(rule.content, /Read \.throughline\/references\/x\.md\./);
  assert.doesNotMatch(rule.content, /CLAUDE_PLUGIN_ROOT/);
});

test('emitCursor writes commands and mcp.json', () => {
  const files = emitCursor(model);
  const cmd = files.find((f) => f.path === '.cursor/commands/start.md');
  assert.match(cmd.content, /Invoke the `figma-environment-setup` rule\./);
  const mcp = files.find((f) => f.path === '.cursor/mcp.json');
  assert.match(mcp.content, /"figma-console"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/adapters/emit-cursor.test.mjs`
Expected: FAIL — cannot find module `./emit-cursor.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/adapters/emit-cursor.mjs`:

```javascript
import { translateBody } from './translate.mjs';

const BASE = '.throughline';

function oneLine(s) {
  return s.replace(/\s+/g, ' ').trim();
}

export function emitCursor(model) {
  const files = [];
  for (const skill of model.skills) {
    const body = translateBody(skill.body, { baseDir: BASE, target: 'cursor' });
    const content = `---\ndescription: ${oneLine(skill.description)}\nalwaysApply: false\n---\n${body}\n`;
    files.push({ path: `.cursor/rules/${skill.name}.mdc`, content });
  }
  for (const cmd of model.commands) {
    const body = translateBody(cmd.body, { baseDir: BASE, target: 'cursor' });
    files.push({ path: `.cursor/commands/${cmd.name}.md`, content: `${body}\n` });
  }
  files.push({ path: '.cursor/mcp.json', content: `${JSON.stringify(model.mcp, null, 2)}\n` });
  return files;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/adapters/emit-cursor.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/adapters/emit-cursor.mjs scripts/adapters/emit-cursor.test.mjs
git commit -m "feat(adapters): Cursor emitter (rules + commands + mcp)"
```

---

## Task 4: Codex emitter

**Files:**
- Create: `scripts/adapters/emit-codex.mjs`
- Test: `scripts/adapters/emit-codex.test.mjs`

**Interfaces:**
- Consumes: `Model` (Task 1), `translateBody` + `firstSentence` (Task 2).
- Produces: `emitCodex(model) -> File[]`:
  - `AGENTS.md` — a routing index. A `## ThroughLine skills` section with one bullet per skill: ``- `<name>` — <firstSentence(description)> → load `prompts/<name>.md`.`` Then a `## ThroughLine commands` section, same shape, for commands. Then a `## MCP servers` section noting Figma config lives in `codex-mcp.toml`.
  - `prompts/<name>.md` per skill (translated body, `codex` target).
  - `prompts/<name>.md` per command (translated body). (Commands and skills share the `prompts/` namespace; names do not collide — verified in Task 7.)
  - `codex-mcp.toml` — TOML `mcp_servers` translation of `model.mcp.mcpServers`.

- [ ] **Step 1: Write the failing test**

Create `scripts/adapters/emit-codex.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitCodex } from './emit-codex.mjs';

const model = {
  mcp: { mcpServers: { 'figma-console': { command: 'npx', args: ['-y', 'figma-console-mcp@latest'], env: { FIGMA_ACCESS_TOKEN: '${FIGMA_ACCESS_TOKEN}' } } } },
  skills: [{ name: 'token-builder', description: 'Build tokens. Use when X.', body: 'Use ${CLAUDE_PLUGIN_ROOT}/references/x.md.' }],
  commands: [{ name: 'start', description: 'Start it.', body: 'Invoke the `figma-environment-setup` skill.' }],
};

test('emitCodex builds a routing index in AGENTS.md', () => {
  const files = emitCodex(model);
  const agents = files.find((f) => f.path === 'AGENTS.md');
  assert.match(agents.content, /## ThroughLine skills/);
  assert.match(agents.content, /- `token-builder` — Build tokens\. → load `prompts\/token-builder\.md`\./);
  assert.match(agents.content, /## ThroughLine commands/);
});

test('emitCodex emits translated prompt bodies and a toml mcp config', () => {
  const files = emitCodex(model);
  const prompt = files.find((f) => f.path === 'prompts/token-builder.md');
  assert.match(prompt.content, /Use \.throughline\/references\/x\.md\./);
  const cmd = files.find((f) => f.path === 'prompts/start.md');
  assert.match(cmd.content, /Invoke the `figma-environment-setup` prompt\./);
  const toml = files.find((f) => f.path === 'codex-mcp.toml');
  assert.match(toml.content, /\[mcp_servers\.figma-console\]/);
  assert.match(toml.content, /command = "npx"/);
  assert.match(toml.content, /args = \["-y", "figma-console-mcp@latest"\]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/adapters/emit-codex.test.mjs`
Expected: FAIL — cannot find module `./emit-codex.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/adapters/emit-codex.mjs`:

```javascript
import { translateBody, firstSentence } from './translate.mjs';

const BASE = '.throughline';

function tomlValue(v) {
  if (Array.isArray(v)) return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
  if (v && typeof v === 'object') {
    return `{ ${Object.entries(v).map(([k, x]) => `${k} = ${JSON.stringify(x)}`).join(', ')} }`;
  }
  return JSON.stringify(v);
}

function mcpToToml(mcp) {
  const servers = mcp.mcpServers || {};
  const blocks = [];
  for (const [name, cfg] of Object.entries(servers)) {
    const lines = [`[mcp_servers.${name}]`];
    for (const [k, v] of Object.entries(cfg)) lines.push(`${k} = ${tomlValue(v)}`);
    blocks.push(lines.join('\n'));
  }
  return `${blocks.join('\n\n')}\n`;
}

function indexSection(title, items, note) {
  const lines = [`## ${title}`, ''];
  if (note) { lines.push(note, ''); }
  for (const it of items) {
    lines.push(`- \`${it.name}\` — ${firstSentence(it.description)} → load \`prompts/${it.name}.md\`.`);
  }
  lines.push('');
  return lines.join('\n');
}

export function emitCodex(model) {
  const files = [];
  const agents = [
    '# ThroughLine (Codex adapter)',
    '',
    'ThroughLine builds a design system end to end. Load the matching prompt for the task at hand.',
    '',
    indexSection('ThroughLine skills', model.skills),
    indexSection('ThroughLine commands', model.commands),
    '## MCP servers',
    '',
    'Figma access is provided by the `figma-console` MCP server. See `codex-mcp.toml` for the config to add to your Codex `mcp_servers`.',
    '',
  ].join('\n');
  files.push({ path: 'AGENTS.md', content: agents });

  for (const skill of model.skills) {
    files.push({ path: `prompts/${skill.name}.md`, content: `${translateBody(skill.body, { baseDir: BASE, target: 'codex' })}\n` });
  }
  for (const cmd of model.commands) {
    files.push({ path: `prompts/${cmd.name}.md`, content: `${translateBody(cmd.body, { baseDir: BASE, target: 'codex' })}\n` });
  }
  files.push({ path: 'codex-mcp.toml', content: mcpToToml(model.mcp) });
  return files;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/adapters/emit-codex.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/adapters/emit-codex.mjs scripts/adapters/emit-codex.test.mjs
git commit -m "feat(adapters): Codex emitter (AGENTS.md index + prompts + toml)"
```

---

## Task 5: Generic emitter

**Files:**
- Create: `scripts/adapters/emit-generic.mjs`
- Test: `scripts/adapters/emit-generic.test.mjs`

**Interfaces:**
- Consumes: `Model` (Task 1), `translateBody` + `firstSentence` (Task 2).
- Produces: `emitGeneric(model) -> File[]`:
  - `AGENTS.md` — same routing-index shape as Codex but pointing at `skills/<name>/SKILL.md`, and an inline JSON `mcpServers` block under `## MCP servers`.
  - `skills/<name>/SKILL.md` per skill — translated body, `generic` target (no Claude frontmatter; a top `# <name>` is already in the body).
  - `commands/<name>.md` per command — translated body.

- [ ] **Step 1: Write the failing test**

Create `scripts/adapters/emit-generic.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitGeneric } from './emit-generic.mjs';

const model = {
  mcp: { mcpServers: { 'figma-console': { command: 'npx' } } },
  skills: [{ name: 'token-builder', description: 'Build tokens. Use when X.', body: 'Use ${CLAUDE_PLUGIN_ROOT}/references/x.md.' }],
  commands: [{ name: 'start', description: 'Start it.', body: 'Begin.' }],
};

test('emitGeneric writes an index pointing at skills/ and inline mcp JSON', () => {
  const files = emitGeneric(model);
  const agents = files.find((f) => f.path === 'AGENTS.md');
  assert.match(agents.content, /- `token-builder` — Build tokens\. → read `skills\/token-builder\/SKILL\.md`\./);
  assert.match(agents.content, /"figma-console"/);
});

test('emitGeneric writes translated skill and command bodies', () => {
  const files = emitGeneric(model);
  const skill = files.find((f) => f.path === 'skills/token-builder/SKILL.md');
  assert.match(skill.content, /Use \.throughline\/references\/x\.md\./);
  assert.doesNotMatch(skill.content, /CLAUDE_PLUGIN_ROOT/);
  assert.ok(files.find((f) => f.path === 'commands/start.md'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/adapters/emit-generic.test.mjs`
Expected: FAIL — cannot find module `./emit-generic.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/adapters/emit-generic.mjs`:

```javascript
import { translateBody, firstSentence } from './translate.mjs';

const BASE = '.throughline';

function indexSection(title, items, ext) {
  const lines = [`## ${title}`, ''];
  for (const it of items) {
    lines.push(`- \`${it.name}\` — ${firstSentence(it.description)} → read \`${ext(it.name)}\`.`);
  }
  lines.push('');
  return lines.join('\n');
}

export function emitGeneric(model) {
  const files = [];
  const agents = [
    '# ThroughLine (generic AGENTS.md adapter)',
    '',
    'ThroughLine builds a design system end to end. Read the matching skill file for the task at hand.',
    '',
    indexSection('ThroughLine skills', model.skills, (n) => `skills/${n}/SKILL.md`),
    indexSection('ThroughLine commands', model.commands, (n) => `commands/${n}.md`),
    '## MCP servers',
    '',
    'Add the following MCP server to your agent (Figma access):',
    '',
    '```json',
    JSON.stringify(model.mcp, null, 2),
    '```',
    '',
  ].join('\n');
  files.push({ path: 'AGENTS.md', content: agents });

  for (const skill of model.skills) {
    files.push({ path: `skills/${skill.name}/SKILL.md`, content: `${translateBody(skill.body, { baseDir: BASE, target: 'generic' })}\n` });
  }
  for (const cmd of model.commands) {
    files.push({ path: `commands/${cmd.name}.md`, content: `${translateBody(cmd.body, { baseDir: BASE, target: 'generic' })}\n` });
  }
  return files;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/adapters/emit-generic.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/adapters/emit-generic.mjs scripts/adapters/emit-generic.test.mjs
git commit -m "feat(adapters): generic AGENTS.md emitter"
```

---

## Task 6: Generator orchestrator + CLI + committed output

**Files:**
- Create: `scripts/adapters/generate.mjs`
- Create (generated, committed): `adapters/cursor/**`, `adapters/codex/**`, `adapters/generic/**`
- Test: covered in Task 7.

**Interfaces:**
- Consumes: `readSources` (Task 1), `emitCursor`/`emitCodex`/`emitGeneric` (Tasks 3–5).
- Produces:
  - `generate(model) -> { cursor: File[], codex: File[], generic: File[] }`.
  - `writeTargets(outRoot, result)` — writes each `File` under `outRoot/<target>/<file.path>`, creating dirs.
  - CLI: default writes to `adapters/`; `--check` compares against the committed `adapters/` tree and exits non-zero on any diff (used by CI/Task 7).

- [ ] **Step 1: Write the implementation**

Create `scripts/adapters/generate.mjs`:

```javascript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSources } from './read-sources.mjs';
import { emitCursor } from './emit-cursor.mjs';
import { emitCodex } from './emit-codex.mjs';
import { emitGeneric } from './emit-generic.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_ROOT = join(REPO_ROOT, 'adapters');

export function generate(model) {
  return { cursor: emitCursor(model), codex: emitCodex(model), generic: emitGeneric(model) };
}

export function writeTargets(outRoot, result) {
  for (const [target, files] of Object.entries(result)) {
    for (const file of files) {
      const abs = join(outRoot, target, file.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.content);
    }
  }
}

// Returns a list of drift descriptions ([] === in sync) comparing result to disk.
export function diffTargets(outRoot, result) {
  const problems = [];
  for (const [target, files] of Object.entries(result)) {
    for (const file of files) {
      const abs = join(outRoot, target, file.path);
      if (!existsSync(abs)) { problems.push(`missing: ${target}/${file.path}`); continue; }
      if (readFileSync(abs, 'utf8') !== file.content) problems.push(`changed: ${target}/${file.path}`);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = generate(readSources(REPO_ROOT));
  if (process.argv.includes('--check')) {
    const problems = diffTargets(OUT_ROOT, result);
    if (problems.length) {
      console.error(`✗ adapters out of date (${problems.length}); run: node scripts/adapters/generate.mjs`);
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }
    console.log('✓ adapters in sync');
  } else {
    writeTargets(OUT_ROOT, result);
    const n = Object.values(result).reduce((a, f) => a + f.length, 0);
    console.log(`✓ wrote ${n} adapter files to adapters/`);
  }
}
```

- [ ] **Step 2: Generate the committed output**

Run: `node scripts/adapters/generate.mjs`
Expected: `✓ wrote <N> adapter files to adapters/` (N ≈ 12 rules + 4 commands + 1 mcp + 1 AGENTS + 16 prompts + 1 toml + 1 AGENTS + 12 skills + 4 commands + 1 AGENTS…).

- [ ] **Step 3: Sanity-scan the generated tree for leaks**

Run: `grep -rl 'CLAUDE_PLUGIN_ROOT' adapters/ || echo 'clean'`
Expected: `clean` (no file contains the raw variable).

- [ ] **Step 4: Verify `--check` passes on the just-written tree**

Run: `node scripts/adapters/generate.mjs --check`
Expected: `✓ adapters in sync`.

- [ ] **Step 5: Commit generator and generated output together**

```bash
git add scripts/adapters/generate.mjs adapters/
git commit -m "feat(adapters): generator orchestrator + committed target output"
```

---

## Task 7: Drift guard + portability invariants + CI wiring

**Files:**
- Create: `scripts/adapters/generate.test.mjs`
- Modify: `.github/workflows/ci.yml` (add a check step)
- Modify: `scripts/README.md` (document the adapter tooling)

**Interfaces:**
- Consumes: `readSources`, `generate`, `diffTargets` (Task 6); `PHRASING_RULES` if needed.

- [ ] **Step 1: Write the drift + invariant test**

Create `scripts/adapters/generate.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSources } from './read-sources.mjs';
import { generate, diffTargets } from './generate.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_ROOT = join(REPO_ROOT, 'adapters');
const result = generate(readSources(REPO_ROOT));
const skillNames = readSources(REPO_ROOT).skills.map((s) => s.name);

test('committed adapters match a fresh generation (no drift)', () => {
  assert.deepEqual(diffTargets(OUT_ROOT, result), []);
});

test('no generated file leaks the CLAUDE_PLUGIN_ROOT variable', () => {
  for (const files of Object.values(result)) {
    for (const f of files) assert.doesNotMatch(f.content, /CLAUDE_PLUGIN_ROOT/, `${f.path} leaked the var`);
  }
});

test('no cursor/codex output leaves a named "`x` skill" idiom untranslated', () => {
  for (const target of ['cursor', 'codex']) {
    for (const f of result[target]) {
      for (const name of skillNames) {
        assert.ok(
          !f.content.includes(`\`${name}\` skill`),
          `${target}/${f.path} still says \`${name}\` skill`,
        );
      }
    }
  }
});

test('codex skill and command prompt names do not collide', () => {
  const promptPaths = result.codex.filter((f) => f.path.startsWith('prompts/')).map((f) => f.path);
  assert.equal(new Set(promptPaths).size, promptPaths.length);
});
```

- [ ] **Step 2: Run the test to verify it passes against committed output**

Run: `node --test scripts/adapters/generate.test.mjs`
Expected: PASS (4 tests). If the drift test fails, run `node scripts/adapters/generate.mjs` and re-commit `adapters/`.

- [ ] **Step 3: Run the full suite to confirm nothing else broke**

Run: `node --test`
Expected: all tests pass (existing suite + the new adapter tests).

- [ ] **Step 4: Add the CI check step**

In `.github/workflows/ci.yml`, add after the "Validate skill/command frontmatter" step:

```yaml
      - name: Check adapters are up to date
        run: node scripts/adapters/generate.mjs --check
```

- [ ] **Step 5: Document the tooling**

Append to `scripts/README.md` a short section:

```markdown
## Multi-agent adapters (`scripts/adapters/`)

`SKILL.md`/`commands`/`.mcp.json` are the canonical source. Generated Cursor,
Codex, and generic-AGENTS.md adapters live in `adapters/<target>/` and are
committed. After editing any skill or command, regenerate:

    node scripts/adapters/generate.mjs

CI runs `node scripts/adapters/generate.mjs --check` and fails if the committed
`adapters/` tree is stale. Never hand-edit files under `adapters/` — edit the
source and regenerate.
```

- [ ] **Step 6: Commit**

```bash
git add scripts/adapters/generate.test.mjs .github/workflows/ci.yml scripts/README.md
git commit -m "test(adapters): drift guard + portability invariants + CI check"
```

---

## Self-Review

**Spec coverage:**
- Translation layer (path rewrite, phrasing map, frontmatter) → Tasks 2–5. ✓
- Generator + three emitters → Tasks 3–6. ✓
- CI drift guard mirroring `validate-plugin.test.mjs` → Task 7. ✓
- Committed self-adapters → Task 6. ✓
- Source files never edited → enforced by design (emitters read, never write source); invariant tests in Task 7. ✓
- `${CLAUDE_PLUGIN_ROOT}` → `.throughline` base → Task 2 + Task 6 grep + Task 7 invariant. ✓
- Codex routing index / prompts / MCP toml → Task 4. ✓
- Cursor `.mdc` description-triggered + `.cursor/mcp.json` → Task 3. ✓
- Generic AGENTS.md + skills tree + inline MCP → Task 5. ✓
- **Deferred to Phase 2 (out of scope here):** `npx` installer, non-destructive `AGENTS.md` merge into a user project, copying `references/`+`scripts/` into install targets. Not covered by any task — intentional per the spec's phasing.

**Placeholder scan:** No TBD/TODO; every code step contains complete code. ✓

**Type consistency:** `Model`, `File`, `Target` used identically across tasks. `generate` returns `{cursor,codex,generic}`; `diffTargets`/`writeTargets` iterate those exact keys; emitters all return `File[]` with target-root-relative POSIX `path`. `firstSentence`/`translateBody`/`applyPhrasing` signatures match their call sites. ✓
