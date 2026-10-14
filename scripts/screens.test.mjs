import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serialize, SCREENS_FILE } from './drift-check.mjs';

const write = (dir, path, value) => {
  mkdirSync(join(dir, path, '..'), { recursive: true });
  writeFileSync(join(dir, path), JSON.stringify(value));
};
const script = fileURLToPath(new URL('./screens.mjs', import.meta.url));
const cli = (cwd, ...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd });

function system() {
  const dir = mkdtempSync(join(tmpdir(), 'screens-'));
  write(dir, 'design-system.json', { components: { built: ['Button'], meta: { Button: { doc: { path: 'design-system/docs/components/Button.doc.json' } } } } });
  write(dir, 'design-system/docs/components/Button.doc.json', { name: 'Button', summary: 's', description: 'd', variants: { size: { sm: '' } } });
  write(dir, 'design-system/docs/index.json', { components: [{ name: 'Button', variants: { size: { sm: '' } } }] });
  return dir;
}

test('cli: record a code screen (target stored from the system), re-record replaces, forget removes', () => {
  const dir = system();
  write(dir, 'plan.json', { screen: 'Home', file: 'apps/web/Home.tsx', components: [{ name: 'Button', variants: { size: 'sm' } }] });
  const args = ['record', '--system', '.', '--side', 'code', '--screen', 'Home', '--target', 'apps/web/Home.tsx', '--plan', 'plan.json', '--at', '2026-10-14'];
  assert.equal(cli(dir, ...args).status, 0);
  assert.equal(cli(dir, ...args.map((a) => (a === '2026-10-14' ? '2026-10-15' : a))).status, 0);
  const text = readFileSync(join(dir, SCREENS_FILE), 'utf8');
  assert.equal(text, serialize(JSON.parse(text)));
  const store = JSON.parse(text);
  assert.deepEqual(Object.keys(store.screens), ['code:home']);
  assert.equal(store.screens['code:home'].at, '2026-10-15');
  assert.equal(store.screens['code:home'].target, 'apps/web/Home.tsx');
  assert.equal(cli(dir, 'forget', '--system', '.', '--side', 'code', '--screen', 'home').status, 0);
  assert.equal(cli(dir, 'forget', '--system', '.', '--side', 'code', '--screen', 'home').status, 1);
});

test('cli: usage errors are 2 — a plan that does not check, figma without a components page', () => {
  const dir = system();
  write(dir, 'bad.json', { screen: 'S', file: 'Screens', components: [{ name: 'Nope' }] });
  write(dir, 'desc.json', { screen: 'S', page: 'Screens', width: 390, root: { layout: 'vertical', children: [{ component: 'Button' }] } });
  const base = ['record', '--system', '.', '--screen', 'S', '--target', 'Screens'];
  assert.equal(cli(dir, ...base, '--side', 'code', '--plan', 'bad.json').status, 2);
  assert.equal(cli(dir, ...base, '--side', 'figma', '--plan', 'desc.json').status, 2);
  assert.equal(cli(dir, ...base, '--side', 'figma', '--plan', 'desc.json', '--components-page', 'Components').status, 0);
  assert.equal(cli(dir, ...base, '--side', 'web', '--plan', 'desc.json').status, 2);
  write(dir, 'plan.json', { screen: 'Home', file: 'apps/web/Home.tsx', components: [{ name: 'Button' }] });
  const code = ['record', '--system', '.', '--side', 'code', '--plan', 'plan.json'];
  assert.equal(cli(dir, ...code, '--screen', 'home', '--target', 'apps/web/Home.tsx').status, 2, 'screen must match the plan exactly');
  assert.equal(cli(dir, ...code, '--screen', 'Home', '--target', 'apps/web/Other.tsx').status, 2, 'target must be the plan file');
  assert.equal(cli(dir, ...code, '--screen', 'Home', '--target', './apps/web/Home.tsx').status, 0);
});
