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
