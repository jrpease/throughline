// Guards the invariant #80 was filed over. `release.yml` deliberately re-runs
// CI's whole gate set before `npm publish` rather than trusting that ci.yml
// already passed — defence against tagging a commit whose CI never ran on that
// exact tree. But the two lists are maintained by hand, and they have silently
// diverged once: 84ff150 added the doc-card gate to both files, 07a1b07 (#50)
// then added the native-adapter-config gate to ci.yml only. This test fails on
// the next one.
//
// The rule is one-way: every command ci.yml runs must also run in release.yml.
// release.yml's extras — the tag-version check, changelog extraction, publish —
// are its own business and unconstrained.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORKFLOWS = fileURLToPath(new URL('../.github/workflows/', import.meta.url));

const readWorkflow = (name) => readFileSync(`${WORKFLOWS}${name}`, 'utf8');

// Pulls every `run:` value out of a workflow file by line. This is not a YAML
// parser and must not become one — `ci/` is stdlib-only, and these two files
// are ours. `multiline` counts the block forms (`run: |`, `run: >`) whose body
// this cannot read; a caller that ignores that count has a blind spot.
function runCommands(yaml) {
  const commands = [];
  let multiline = 0;
  for (const line of yaml.split('\n')) {
    const match = /^\s*run:\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[1].trim();
    if (value === '' || value === '|' || value === '>') multiline += 1;
    else commands.push(value);
  }
  return { commands, multiline };
}

test('runCommands reads single-line commands and counts the block forms', () => {
  const { commands, multiline } = runCommands(
    [
      'steps:',
      '  - name: One',
      '    run: node --test',
      '  - name: Two',
      '    run: |',
      '      echo not read',
      '  - name: Three',
      '    run: >',
      '      echo also not read',
      '  - name: Four',
      '    run: node ci/validate-plugin.mjs',
    ].join('\n'),
  );
  assert.deepEqual(commands, ['node --test', 'node ci/validate-plugin.mjs']);
  assert.equal(multiline, 2);
});

test('the parser finds ci.yml real commands', () => {
  const { commands } = runCommands(readWorkflow('ci.yml'));
  assert.ok(commands.length > 0, 'found no commands in ci.yml — the parser has stopped working');
  assert.ok(commands.includes('node --test'), 'ci.yml should run the test suite');
});

test('ci.yml uses no multi-line run blocks', () => {
  const { multiline } = runCommands(readWorkflow('ci.yml'));
  assert.equal(
    multiline,
    0,
    'ci.yml gained a `run: |` or `run: >` block. This parser cannot read inside one, so the ' +
      'parity check below would silently stop covering that gate. Make it a single-line `run:`, ' +
      'or teach the parser block scalars.',
  );
});

test('every command ci.yml runs also runs in release.yml', () => {
  const ci = runCommands(readWorkflow('ci.yml')).commands;
  const release = new Set(runCommands(readWorkflow('release.yml')).commands);
  const missing = ci.filter((command) => !release.has(command));
  assert.deepEqual(
    missing,
    [],
    `release.yml does not re-run ${missing.length} of CI's gates:\n` +
      missing.map((command) => `  ${command}`).join('\n') +
      '\n\nrelease.yml runs the full gate set before publishing, so a gate added to ci.yml ' +
      'belongs there too. Add the step, matching the existing naming. Comparison is exact, ' +
      'so the two files must spell the command identically. If a gate genuinely should not ' +
      'run at release time, that is a decision to make deliberately and record — not to ' +
      'leave as a silent difference.',
  );
});
