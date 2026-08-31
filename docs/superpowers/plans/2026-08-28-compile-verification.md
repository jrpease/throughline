# Compile Verification for Native Token Output — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give e2e runs a committed, runnable compile check for native token
output, and correct four notes that claim compiling was impossible.

**Architecture:** A single stdlib-only Node module in `ci/` — pure decision
function plus a thin CLI, matching the existing `ci/` idiom — that shells out to
`kotlinc` and `swiftc` against two committed Kotlin stub files. Kotlin
typechecks to bytecode; Swift parses only. Nothing ships to consumers and
nothing runs in GitHub Actions.

**Tech Stack:** Node 20+ stdlib only (`node:test`, `node:child_process`,
`node:fs`, `node:path`, `node:url`, `node:os`). Kotlin 2.4.10 `kotlinc`, Apple
Swift 6.3.2 `swiftc`. No npm dependencies, no lockfile.

**Spec:** `docs/superpowers/specs/2026-08-28-compile-verification-design.md`

## Global Constraints

- **Zero dependencies.** Do not add a `dependencies`, `devDependencies`,
  lockfile, or `node_modules` to this repo. Style Dictionary stays confined to
  the scratch e2e harness. (Spec §2.3)
- **`ci/` never ships.** `package.json`'s `files` omits `ci/` and must continue
  to. Nothing in this plan may be added to `files`. (Spec §3)
- **Nothing is added to `.github/workflows/`.** Compile verification is
  explicitly not a CI gate. (Spec §7)
- **The test suite never invokes a real compiler.** CI is `ubuntu-latest` with
  Node 24 and neither toolchain; `node --test` must stay green there.
  (Spec §5)
- **Run tests as bare `node --test` from the repo root**, never `node --test
  ci/`, which errors on Node ≥21. (Spec §5, `ci/README.md`)
- **Exit status is read from the process directly, never through a pipe.** A
  pipeline reports its last command, which produced a false `exit=0` during
  design. (Spec §4)
- **Stub paths resolve relative to the runner module** via `import.meta.url`,
  never the working directory — the intended caller is a scratchpad harness.
  (Spec §4)
- **Verified toolchain facts:** `kotlinc` 2.4.10 at `/opt/homebrew/bin/kotlinc`
  (installed 2026-08-27 22:59); `swiftc` 6.3.2 at `/usr/bin/swiftc`.

---

## File Structure

| path | responsibility |
|---|---|
| `ci/stubs/compose-unit.kt` | *(new)* `androidx.compose.ui.unit` — `Dp`, `TextUnit`, `.dp`, `.sp`, `.em` |
| `ci/stubs/compose-graphics.kt` | *(new)* `androidx.compose.ui.graphics` — `Color` |
| `ci/compile-native-output.mjs` | *(new)* pure decision function + report formatter + CLI |
| `ci/compile-native-output.test.mjs` | *(new)* decision-logic tests with an injected fake environment |
| `ci/README.md` | *(modify)* runner entry + the not-a-CI-gate decision |
| `docs/superpowers/notes/2026-08-21-native-config-e2e-results.md` | *(modify)* scope the stale claim |
| `docs/superpowers/notes/2026-08-23-native-literal-validity-e2e.md` | *(modify)* scope the stale claim |
| `docs/superpowers/notes/2026-08-24-hoist-dual-nodes-e2e.md` | *(modify)* scope the stale claim |
| `docs/superpowers/notes/2026-08-26-unitless-dimension-e2e.md` | *(modify)* scope the stale claim |
| `docs/superpowers/notes/2026-08-28-compile-verification-e2e.md` | *(new)* baseline run + control |

Two stub files rather than one because a Kotlin source file carries exactly one
`package` declaration (spec §2.1).

---

## Task 1: The Kotlin stub pair

**Files:**
- Create: `ci/stubs/compose-unit.kt`
- Create: `ci/stubs/compose-graphics.kt`

**Interfaces:**
- Consumes: nothing.
- Produces: two stub paths consumed by Task 2's `runKotlin` —
  `ci/stubs/compose-unit.kt` and `ci/stubs/compose-graphics.kt`. Filenames are
  load-bearing; Task 2 hardcodes them.

- [ ] **Step 1: Create the unit stub**

Create `ci/stubs/compose-unit.kt`:

```kotlin
// Minimal stand-in for androidx.compose.ui.unit, so kotlinc can typecheck
// generated Tokens.kt without Compose on the classpath. Not Compose: real Dp is
// a value class. Asserts only that the expression resolves and typechecks.
// Used by ci/compile-native-output.mjs (#81).
package androidx.compose.ui.unit

class Dp(val value: Double)
class TextUnit(val value: Double)

val Double.dp: Dp get() = Dp(this)
val Double.sp: TextUnit get() = TextUnit(this)
val Double.em: TextUnit get() = TextUnit(this)
```

- [ ] **Step 2: Create the graphics stub**

Create `ci/stubs/compose-graphics.kt`:

```kotlin
// Minimal stand-in for androidx.compose.ui.graphics. Separate file because a
// Kotlin source file carries exactly one package declaration.
// Long, not Int: 0xffffffff is 4294967295, past Int.MAX_VALUE, so Kotlin types
// the literal Long. Used by ci/compile-native-output.mjs (#81).
package androidx.compose.ui.graphics

class Color(val value: Long)
```

- [ ] **Step 3: Verify the stubs compile on their own**

Run:
```bash
kotlinc ci/stubs/compose-unit.kt ci/stubs/compose-graphics.kt -d /tmp/tl-stub-check
echo "exit=$?"
```
Expected: `exit=0`, no diagnostics.

- [ ] **Step 4: Verify they compile real generated output**

This is the check that matters — the stub set in issue #81 fails here. Use any
real `Tokens.kt`; the surviving harness has one at
`/private/tmp/claude-501/-Users-jordansstudio-Dev-throughline/395cf4ed-9e55-4c18-a73d-e9980db4545c/scratchpad/e2e/out-52-head/Tokens.kt`.
If that path is gone, rebuild per spec §8.1 first.

```bash
KT=/private/tmp/claude-501/-Users-jordansstudio-Dev-throughline/395cf4ed-9e55-4c18-a73d-e9980db4545c/scratchpad/e2e/out-52-head/Tokens.kt
kotlinc ci/stubs/compose-unit.kt ci/stubs/compose-graphics.kt "$KT" -d /tmp/tl-real-check
echo "exit=$?"
find /tmp/tl-real-check -name 'Tokens.class'
```
Expected: `exit=0` and a `Tokens.class` path printed. If `unresolved reference
'Color'` appears, the graphics stub is missing or misnamed.

- [ ] **Step 5: Commit**

```bash
git add ci/stubs/compose-unit.kt ci/stubs/compose-graphics.kt
git commit -m "feat: Compose stubs so kotlinc can typecheck generated Tokens.kt (#81)"
```

---

## Task 2: The runner — detection, invocation, verdicts, report

**Files:**
- Create: `ci/compile-native-output.mjs`
- Test: `ci/compile-native-output.test.mjs`

**Interfaces:**
- Consumes: `ci/stubs/compose-unit.kt`, `ci/stubs/compose-graphics.kt` (Task 1).
- Produces, all named exports of `ci/compile-native-output.mjs`:
  - `PLATFORMS` — array of `{ id, file, compiler, strength }`, ids `'kotlin'` and `'swift'`.
  - `STUB_DIR` — absolute path string to `ci/stubs`.
  - `compileNativeOutput(dir, { allowMissing = false, env })` → `{ results, exitCode, compiled, failed }` where `results` is an array of `{ id, status, detail }` and `status` is one of `'pass' | 'fail' | 'absent' | 'skipped'`.
  - `formatCompileReport({ results })` → array of strings.
  - `realEnv()` → an `env` object with `fileExists(path)`, `commandExists(cmd)`, `runKotlin(sourcePath)`, `runSwift(sourcePath)`.
  - The `env` contract: `runKotlin` returns `{ code, stderr, classProduced }`; `runSwift` returns `{ code, stderr }`.
  - Task 3 extends `compileNativeOutput`'s `allowMissing` behaviour; it adds no new exports.

- [ ] **Step 1: Write the failing tests**

Create `ci/compile-native-output.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileNativeOutput,
  formatCompileReport,
  PLATFORMS,
  STUB_DIR,
} from './compile-native-output.mjs';

// A fake environment. Defaults to "both files present, both compilers present,
// both compile clean"; each test overrides only what it is about.
function fakeEnv({
  present = ['Tokens.kt', 'Tokens.swift'],
  commands = ['kotlinc', 'swiftc'],
  kotlin = { code: 0, stderr: '', classProduced: true },
  swift = { code: 0, stderr: '' },
} = {}) {
  return {
    fileExists: (p) => present.some((f) => p.endsWith(f)),
    commandExists: (c) => commands.includes(c),
    runKotlin: () => kotlin,
    runSwift: () => swift,
  };
}

function byId(results, id) {
  return results.find((r) => r.id === id);
}

test('both platforms compiling clean is a pass', () => {
  const out = compileNativeOutput('/out', { env: fakeEnv() });
  assert.equal(out.exitCode, 0);
  assert.equal(byId(out.results, 'kotlin').status, 'pass');
  assert.equal(byId(out.results, 'swift').status, 'pass');
  assert.equal(out.compiled, 2);
});

test('an absent Tokens.swift is reported absent, not as a pass', () => {
  const out = compileNativeOutput('/out', { env: fakeEnv({ present: ['Tokens.kt'] }) });
  assert.equal(byId(out.results, 'swift').status, 'absent');
  assert.equal(out.exitCode, 0, 'kotlin still compiled, so the run passes');
  assert.equal(out.compiled, 1);
});

test('kotlinc exiting 0 without producing Tokens.class is a failure', () => {
  const env = fakeEnv({ kotlin: { code: 0, stderr: '', classProduced: false } });
  const out = compileNativeOutput('/out', { env });
  assert.equal(byId(out.results, 'kotlin').status, 'fail');
  assert.match(byId(out.results, 'kotlin').detail, /no Tokens\.class/);
  assert.equal(out.exitCode, 1);
});

test('a compiler failure surfaces the compiler stderr verbatim', () => {
  const stderr = "Broken.kt:4:28: error: unresolved reference 'unaryMinus' for operator '-'.";
  const env = fakeEnv({ kotlin: { code: 1, stderr, classProduced: false } });
  const out = compileNativeOutput('/out', { env });
  assert.equal(byId(out.results, 'kotlin').status, 'fail');
  assert.equal(byId(out.results, 'kotlin').detail, stderr);
});

test('one platform failing does not suppress the other platform verdict', () => {
  const env = fakeEnv({ kotlin: { code: 1, stderr: 'boom', classProduced: false } });
  const out = compileNativeOutput('/out', { env });
  assert.equal(out.exitCode, 1);
  assert.equal(byId(out.results, 'kotlin').status, 'fail');
  assert.equal(byId(out.results, 'swift').status, 'pass');
});

test('the report states the Kotlin/Swift asymmetry on every run', () => {
  const out = compileNativeOutput('/out', { env: fakeEnv() });
  const text = formatCompileReport(out).join('\n');
  assert.match(text, /typechecked to bytecode/);
  assert.match(text, /parsed only/);
  assert.match(text, /UIKit/);
});

test('stub paths resolve relative to the module, not the working directory', () => {
  assert.ok(STUB_DIR.startsWith('/'), 'STUB_DIR must be absolute');
  assert.match(STUB_DIR, /ci\/stubs$/);
});

test('PLATFORMS names the two files the emitter writes', () => {
  assert.deepEqual(PLATFORMS.map((p) => p.file), ['Tokens.kt', 'Tokens.swift']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test ci/compile-native-output.test.mjs`
Expected: FAIL — `Cannot find module ... compile-native-output.mjs`.

- [ ] **Step 3: Write the implementation**

Create `ci/compile-native-output.mjs`:

```js
// Compiles generated native token output to prove it is buildable, not merely
// well-formed. Kotlin typechecks to bytecode against ci/stubs/*.kt; Swift is
// parsed only, because Tokens.swift imports UIKit and -typecheck must resolve
// imports where -parse need not.
//
// Runs at e2e time, NOT in CI — see ci/README.md for that decision (#81).
// Pure functions + CLI.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

export const STUB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'stubs');

export const PLATFORMS = [
  {
    id: 'kotlin',
    file: 'Tokens.kt',
    compiler: 'kotlinc',
    strength: 'typechecked to bytecode',
  },
  {
    id: 'swift',
    file: 'Tokens.swift',
    compiler: 'swiftc',
    strength: 'parsed only (UIKit unavailable; -typecheck impossible)',
  },
];

export function compileNativeOutput(dir, { allowMissing = false, env } = {}) {
  const results = [];
  for (const platform of PLATFORMS) {
    const source = join(dir, platform.file);
    if (!env.fileExists(source)) {
      results.push({ id: platform.id, status: 'absent', detail: `${platform.file} not present` });
      continue;
    }
    if (!env.commandExists(platform.compiler)) {
      results.push({
        id: platform.id,
        status: allowMissing ? 'skipped' : 'fail',
        detail: `${platform.compiler} not found on PATH`,
      });
      continue;
    }
    const run = platform.id === 'kotlin' ? env.runKotlin(source) : env.runSwift(source);
    if (run.code !== 0) {
      results.push({ id: platform.id, status: 'fail', detail: run.stderr });
    } else if (platform.id === 'kotlin' && !run.classProduced) {
      results.push({
        id: platform.id,
        status: 'fail',
        detail: 'kotlinc exited 0 but produced no Tokens.class',
      });
    } else {
      results.push({ id: platform.id, status: 'pass', detail: platform.strength });
    }
  }
  const compiled = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  return { results, exitCode: failed > 0 ? 1 : 0, compiled, failed };
}

const LABEL = { pass: 'PASS', fail: 'FAIL', absent: '----', skipped: 'SKIP' };

export function formatCompileReport({ results }) {
  const lines = ['compile-native-output — do the emitted native tokens build?', ''];
  for (const r of results) {
    lines.push(`  [${LABEL[r.status]}] ${r.id}: ${r.detail}`);
  }
  lines.push(
    '',
    '  Kotlin is typechecked to bytecode; Swift is parsed only. swiftc -typecheck',
    '  cannot run here: Tokens.swift imports UIKit, which is unavailable on the',
    '  macOS command line. Swift syntax is asserted; Swift types are not.',
  );
  return lines;
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (findFile(full, name)) return true;
    } else if (entry.name === name) {
      return true;
    }
  }
  return false;
}

export function realEnv() {
  return {
    fileExists: (path) => existsSync(path),
    commandExists(cmd) {
      try {
        execFileSync('which', [cmd], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    },
    runKotlin(source) {
      const outDir = mkdtempSync(join(tmpdir(), 'tl-kotlinc-'));
      const stubs = [join(STUB_DIR, 'compose-unit.kt'), join(STUB_DIR, 'compose-graphics.kt')];
      try {
        // execFileSync throws on a non-zero exit and carries stderr on the
        // error. No shell, no pipe — a pipeline would report the wrong status.
        execFileSync('kotlinc', [...stubs, source, '-d', outDir], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        return { code: err.status ?? 1, stderr: String(err.stderr ?? err.message).trim(), classProduced: false };
      }
      return { code: 0, stderr: '', classProduced: findFile(outDir, 'Tokens.class') };
    },
    runSwift(source) {
      try {
        execFileSync('swiftc', ['-parse', source], { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        return { code: err.status ?? 1, stderr: String(err.stderr ?? err.message).trim() };
      }
      return { code: 0, stderr: '' };
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const allowMissing = args.includes('--allow-missing');
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) {
    console.error('usage: node ci/compile-native-output.mjs <dir> [--allow-missing]');
    process.exit(2);
  }
  const outcome = compileNativeOutput(dir, { allowMissing, env: realEnv() });
  for (const line of formatCompileReport(outcome)) console.log(line);
  process.exit(outcome.exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test ci/compile-native-output.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the whole suite**

Run: `node --test`
Expected: PASS. The pre-existing count is 403; expect 411.

- [ ] **Step 6: Smoke-test the CLI against real output**

```bash
node ci/compile-native-output.mjs /private/tmp/claude-501/-Users-jordansstudio-Dev-throughline/395cf4ed-9e55-4c18-a73d-e9980db4545c/scratchpad/e2e/out-52-head
echo "exit=$?"
```
Expected: both `[PASS]`, the asymmetry paragraph, `exit=0`.

- [ ] **Step 7: Commit**

```bash
git add ci/compile-native-output.mjs ci/compile-native-output.test.mjs
git commit -m "feat: compile-verify generated native token output (#81)"
```

---

## Task 3: The missing-compiler policy

**Files:**
- Modify: `ci/compile-native-output.mjs` (the `compileNativeOutput` return)
- Test: `ci/compile-native-output.test.mjs` (append)

**Interfaces:**
- Consumes: `compileNativeOutput` from Task 2.
- Produces: no new exports. `compileNativeOutput`'s `exitCode` gains one rule —
  a run in which no platform actually compiled exits non-zero even when every
  platform was skipped.

Task 2 deliberately ships the incomplete rule (`exitCode: failed > 0 ? 1 : 0`),
so this task's first test fails against real code rather than against a missing
module.

- [ ] **Step 1: Write the failing tests**

Append to `ci/compile-native-output.test.mjs`:

```js
test('a missing compiler fails the run by default', () => {
  const out = compileNativeOutput('/out', { env: fakeEnv({ commands: ['swiftc'] }) });
  assert.equal(byId(out.results, 'kotlin').status, 'fail');
  assert.match(byId(out.results, 'kotlin').detail, /kotlinc not found/);
  assert.equal(out.exitCode, 1);
});

test('--allow-missing downgrades one absent toolchain to a skip', () => {
  const out = compileNativeOutput('/out', {
    allowMissing: true,
    env: fakeEnv({ commands: ['swiftc'] }),
  });
  assert.equal(byId(out.results, 'kotlin').status, 'skipped');
  assert.equal(byId(out.results, 'swift').status, 'pass');
  assert.equal(out.exitCode, 0, 'swift really compiled, so the run is meaningful');
});

test('--allow-missing does not excuse a run in which nothing compiled', () => {
  const out = compileNativeOutput('/out', {
    allowMissing: true,
    env: fakeEnv({ commands: [] }),
  });
  assert.equal(out.compiled, 0);
  assert.equal(out.exitCode, 1, 'a green run that verified nothing is the vacuous pass');
});

test('a directory holding neither output file fails rather than passing empty', () => {
  const out = compileNativeOutput('/out', { env: fakeEnv({ present: [] }) });
  assert.equal(out.compiled, 0);
  assert.equal(out.exitCode, 1);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test ci/compile-native-output.test.mjs`
Expected: the first two PASS (Task 2's code already handles them); the last two
FAIL, both reporting `exitCode` was `0` where `1` was expected.

- [ ] **Step 3: Change the exit rule**

In `ci/compile-native-output.mjs`, replace this line:

```js
  return { results, exitCode: failed > 0 ? 1 : 0, compiled, failed };
```

with:

```js
  // A run that compiled nothing fails, whatever --allow-missing said. The flag
  // tolerates one absent toolchain; it does not excuse the absence of both,
  // which would be a green run that verified nothing.
  return { results, exitCode: failed > 0 || compiled === 0 ? 1 : 0, compiled, failed };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test ci/compile-native-output.test.mjs`
Expected: PASS, 12 tests.

- [ ] **Step 5: Run the whole suite**

Run: `node --test`
Expected: PASS, 415 tests.

- [ ] **Step 6: Commit**

```bash
git add ci/compile-native-output.mjs ci/compile-native-output.test.mjs
git commit -m "feat: a run that compiled nothing fails, --allow-missing notwithstanding (#81)"
```

---

## Task 4: Document the runner and record the not-a-CI-gate decision

**Files:**
- Modify: `ci/README.md`

**Interfaces:**
- Consumes: the CLI from Tasks 2–3.
- Produces: nothing code-level.

- [ ] **Step 1: Add the runner to the "Run locally" block**

In `ci/README.md`, find:

```bash
node --test                  # all tests
node ci/validate-plugin.mjs  # guard plugin manifests
node ci/validate-skills.mjs  # guard skill/command/manifest-doc structure
```

Add a fourth line:

```bash
node ci/compile-native-output.mjs <dir>  # compile generated Tokens.kt/.swift (not a CI gate)
```

- [ ] **Step 2: Append the decision section**

Add at the end of `ci/README.md`:

```markdown
## Compile verification is not a CI gate

`ci/compile-native-output.mjs` compiles generated native token output —
`kotlinc` typechecks `Tokens.kt` to bytecode against `ci/stubs/*.kt`; `swiftc
-parse` checks `Tokens.swift` syntax only, because it imports `UIKit` and
`-typecheck` must resolve imports where `-parse` need not.

It runs at e2e time, deliberately, and `.github/workflows/` does not call it.

Producing `Tokens.kt` at all requires Style Dictionary, because `PLATFORMS` in
`scripts/lib/sd-native.mjs` targets SD's stock formatters — this repo owns the
transforms and the config, not the formatter. The repo also declares zero
dependencies and has no lockfile, and `ubuntu-latest` carries neither toolchain.
Gating would mean adding a dependency graph, a lockfile, a committed token
fixture, a JDK, and a Swift toolchain — in order to prove that output compiles
*under one pinned Style Dictionary version*, while the version a consumer
actually runs stays invisible to us either way. The e2e harness builds real
zygarden source, which is stronger evidence than that fixture would be.

Reopen this deliberately if the tradeoff changes. Do not let it drift.

Unlike the validators above, this module is **not** run by `node --test` against
a real compiler: the test suite injects a fake environment, so the suite stays
green on a runner with neither toolchain installed.
```

- [ ] **Step 3: Verify the structural gates still pass**

Run: `node ci/validate-skills.mjs && node ci/validate-plugin.mjs && node --test`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add ci/README.md
git commit -m "docs: record why compile verification is not a CI gate (#81)"
```

---

## Task 5: Scope the stale claim in the four e2e notes

**Files:**
- Modify: `docs/superpowers/notes/2026-08-21-native-config-e2e-results.md`
- Modify: `docs/superpowers/notes/2026-08-23-native-literal-validity-e2e.md`
- Modify: `docs/superpowers/notes/2026-08-24-hoist-dual-nodes-e2e.md`
- Modify: `docs/superpowers/notes/2026-08-26-unitless-dimension-e2e.md`

**Interfaces:**
- Consumes: `ci/compile-native-output.mjs` exists (Tasks 2–3), so the notes can
  cite it.
- Produces: nothing code-level.

**The one thing to get right.** `swiftc` and `kotlinc` must NOT be scoped
identically. `kotlinc` was installed 2026-08-27 22:59; these notes are dated
08-21 through 08-26, so it existed on the machine for none of them. A correction
saying "both compilers were available" replaces a false implication with a false
statement — the exact defect this work exists to prevent. See spec §6.

**Do not touch any verdict.** The runs genuinely did not compile anything; that
part of each record is accurate and stays.

- [ ] **Step 1: Locate the claim in each file**

Run: `grep -n "Nothing was compiled" docs/superpowers/notes/*.md`
Expected: exactly four hits, one per file.

- [ ] **Step 2: Replace the paragraph in each of the four files**

Each occurrence sits in a "What this run does NOT establish" list and reads
approximately:

> - **Nothing was compiled.** No `swiftc` or `kotlinc` ran; the declaration and
>   `.sp`/`.dp` counts are `grep`-based, not a compiler's verdict.

Wording varies slightly between files. Preserve each file's surrounding list
formatting and its own trailing clause; replace only the claim itself with:

```markdown
- **Nothing was compiled in this run.** No `swiftc` or `kotlinc` ran; the
  declaration and `.sp`/`.dp` counts are `grep`-based, not a compiler's verdict.
  `swiftc` was nonetheless available at `/usr/bin/swiftc` via the Xcode command
  line tools when this run happened, and went unused — the Swift half of this
  limitation was self-imposed. `kotlinc` was not available: it was installed on
  2026-08-27, after this run. Later runs compile both, via
  `ci/compile-native-output.mjs` (#81).
```

- [ ] **Step 3: Verify no note claims both compilers were available**

Run:
```bash
grep -rn "oth compilers were" docs/superpowers/notes/ || echo "clean"
```
Expected: `clean`. Any hit is the §6 defect and must be fixed before committing.

- [ ] **Step 4: Verify all four were updated and no verdict moved**

Run:
```bash
grep -c "Nothing was compiled in this run" docs/superpowers/notes/*.md | grep -v ":0"
git diff --stat
```
Expected: four files each with one hit; the diff touches only those four files.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/notes/2026-08-21-native-config-e2e-results.md \
        docs/superpowers/notes/2026-08-23-native-literal-validity-e2e.md \
        docs/superpowers/notes/2026-08-24-hoist-dual-nodes-e2e.md \
        docs/superpowers/notes/2026-08-26-unitless-dimension-e2e.md
git commit -m "docs: the compile limitation was historical, and asymmetric (#81)"
```

---

## Task 6: Baseline run against zygarden, with the control

**Files:**
- Create: `docs/superpowers/notes/2026-08-28-compile-verification-e2e.md`

**Interfaces:**
- Consumes: the CLI from Tasks 2–3, the stubs from Task 1.
- Produces: the note. Nothing code-level.

**The control matters more than the baseline.** A run whose only observed result
is a pass cannot distinguish a working check from one that cannot fail — #73's
durable lesson. Both halves must be recorded.

- [ ] **Step 1: Locate or rebuild the harness**

```bash
H=/private/tmp/claude-501/-Users-jordansstudio-Dev-throughline/395cf4ed-9e55-4c18-a73d-e9980db4545c/scratchpad/e2e
ls "$H/build.mjs" "$H/lib" && ls "$H/../tokens"/*.json | wc -l
```
Expected: `build.mjs` and `lib/` present, 15 token files.

If it is gone, rebuild it from **spec §8.1**, which records Style Dictionary
4.4.0, the token source at
`/Users/jordansstudio/Dev/zygarden-frontend/libs/shared/util-tokens/src/tokens`,
the `desktop`/`dark` filename filter, `packageName: 'com.zygarden.tokens'`, and
`build.mjs` in full. Symlink `<harness>/lib/{dtcg,native-literal,sd-native}.mjs`
into this checkout's `scripts/lib/` — **not** `scripts/lib`, which `build.mjs`
never reads.

- [ ] **Step 2: Build zygarden at this branch**

```bash
cd "$H" && node build.mjs ../tokens out-81-baseline && ls out-81-baseline
```
Expected: `Tokens.kt` and `Tokens.swift`.

- [ ] **Step 3: Record the declaration counts**

```bash
grep -c '^  val ' "$H/out-81-baseline/Tokens.kt"
grep -c 'public static let' "$H/out-81-baseline/Tokens.swift"
```
Expected: 208 Kotlin, 195 Swift (spec §8). A different count is a finding —
record it rather than adjusting the prediction.

- [ ] **Step 4: Run the baseline compile**

```bash
cd /Users/jordansstudio/Dev/throughline
node ci/compile-native-output.mjs "$H/out-81-baseline"; echo "exit=$?"
```
Expected: `[PASS] kotlin`, `[PASS] swift`, `exit=0`. Capture the full output.

- [ ] **Step 5: Run the control — it must FAIL**

```bash
mkdir -p /tmp/tl-control
cat > /tmp/tl-control/Tokens.kt <<'EOF'
package com.zygarden.tokens
import androidx.compose.ui.unit.*
object Tokens {
  val letterSpacingTight = -0.03.em
}
EOF
node ci/compile-native-output.mjs /tmp/tl-control --allow-missing; echo "exit=$?"
```
Expected: `[FAIL] kotlin` quoting `unresolved reference 'unaryMinus' for
operator '-'`, and `exit=1`. **If this passes, the check is broken** — stop and
investigate rather than recording the baseline as evidence.

- [ ] **Step 6: Confirm the control's fixed form compiles**

```bash
sed -i '' 's/-0\.03\.em/(-0.03).em/' /tmp/tl-control/Tokens.kt
node ci/compile-native-output.mjs /tmp/tl-control --allow-missing; echo "exit=$?"
```
Expected: `[PASS] kotlin`, `exit=0`. This is the #64 defect and its fix.

- [ ] **Step 7: Write the note**

Create `docs/superpowers/notes/2026-08-28-compile-verification-e2e.md`. Fill the
bracketed slots from the transcripts captured in Steps 2-6 — paste them verbatim,
do not summarise. Everything outside brackets is final text:

````markdown
# Compile verification (#81) — baseline and control against zygarden

**Date:** 2026-08-28
**Gate for:** Task 6 of the #81 plan — the committed runner
(`ci/compile-native-output.mjs`) compiles real emitted output, and demonstrably
fails on output that does not compile.
**Verdict:** [PASS | FAIL] — [one sentence naming what held]

## Why this run exists

Four e2e notes claimed nothing could be compiled. Both compilers are in fact
available (`swiftc` throughout; `kotlinc` since 2026-08-27), so the ceiling on
what an e2e run asserts was lower than it needed to be. This run establishes the
new ceiling and, more importantly, that the check can fail.

## Harness

[reused at <path>, or rebuilt per spec §8.1 — say which]

- **Style Dictionary:** 4.4.0, installed in the harness directory.
- **Source:** the 15 zygarden JSON files, light + mobile axes (the build drops
  any filename containing `desktop` or `dark`).
- **Module under test:** reached via
  `<harness>/lib/{dtcg,native-literal,sd-native}.mjs` symlinked into this
  checkout's `scripts/lib/`. Not `scripts/lib`, which `build.mjs` never reads —
  the no-op #73 was filed over.
- **Branch:** `feat/81-compile-verification` at [sha].

## Procedure

### Step 1 — build zygarden

[transcript from plan Step 2]

### Step 2 — declaration counts

[transcript from plan Step 3]

### Step 3 — baseline compile

[transcript from plan Step 4]

### Step 4 — the control, which must fail

[transcript from plan Step 5]

### Step 5 — the control's fixed form

[transcript from plan Step 6]

## Prediction vs. actual

| Prediction | Actual |
|---|---|
| `Tokens.kt` compiles, exit 0, `Tokens.class` produced | [ ] |
| `Tokens.swift` parses, exit 0 | [ ] |
| 208 Kotlin declarations / 195 Swift | [ ] |
| `-0.03.em` FAILS with `unresolved reference 'unaryMinus'` | [ ] |
| `(-0.03).em` passes | [ ] |

## What this run does NOT establish

- **Swift is parsed, never typechecked.** `Tokens.swift` imports `UIKit`, which
  is unavailable on the macOS command line, so `swiftc -typecheck` cannot run. A
  Swift type error — a wrong `UIColor` initialiser arity, an `Int` where
  `CGFloat` is required — passes this check. Only syntax is asserted.
- **The Kotlin stubs are not Compose.** They are six declarations with matching
  names and shapes (`Dp`, `TextUnit`, `.dp`, `.sp`, `.em`, `Color`). Real `Dp`
  is a value class and real `Color` wraps a `ULong`; nothing beyond "this
  expression resolves and typechecks" is covered.
- **Neither compiler validates semantics.** `2.dp` where `2.sp` was meant
  compiles. This closes the gap between "well-formed literal" and "compiles",
  which is narrower than "correct" — `tokens:validate-output` and the e2e diff
  remain the checks for whether the right thing was emitted.
- **The harness is scratch and unowned.** It can vanish; only the runner and
  stubs are repo assets. Spec §8.1 is what makes it rebuildable.
````

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/notes/2026-08-28-compile-verification-e2e.md
git commit -m "docs: e2e proof that zygarden's native output compiles, with a failing control (#81)"
```

---

## Final verification

- [ ] **All six CI gates pass**

```bash
node --test
node ci/validate-plugin.mjs
node ci/validate-skills.mjs
node scripts/adapters/generate.mjs --check
node scripts/build-doc-card-builder.mjs --check
node scripts/build-native-adapter-config.mjs --check
```
Expected: all pass. `node --test` at 415.

- [ ] **The constraints held**

```bash
git diff main --stat -- package.json .github/
grep -n '"files"' -A 8 package.json
ls package-lock.json node_modules 2>/dev/null || echo "no deps introduced"
```
Expected: no change to `package.json` or `.github/`; `files` still omits `ci/`;
no lockfile, no `node_modules`.

- [ ] **Open the PR**

```bash
gh pr create --base main --title "e2e runs compile their output, and four notes stop saying they cannot (#81)" --body "Closes #81"
```
