import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COMPOSED_MARKER, readMarker, codeInventory, checkPlan, gateFile } from './compose-code.mjs';
import { COMPOSE_ERROR_KINDS } from './lib/figma-compose.mjs';

const manifest = { components: { built: ['Button', 'Input', 'Card', 'Checkbox', 'Spinner', 'Select Menu'] } };
const index = {
  components: [
    { name: 'Button', summary: 'An action.', whenToUse: ['act'], whenNotToUse: ['navigate'],
      variants: { variant: { default: 'main', secondary: 'beside' }, size: { sm: 's', lg: 'l' } },
      states: { default: '', disabled: '' } },
    { name: 'Input', summary: 'Text entry.', variants: {}, states: { default: '' } },
    { name: 'Card', summary: 'A surface.', variants: {}, states: {} },
    { name: 'Checkbox', summary: 'A choice.', variants: {}, states: {} },
    { name: 'SelectMenu', summary: 'Pick one.', variants: { State: { Default: '', Open: '' } }, states: {} },
  ],
};
const tokenDicts = [{
  color: { primary: { $value: '#2563eb', $type: 'color' } },
  space: { md: { $value: '16px', $type: 'dimension' } },
}];
const pkg = '@ds/ui';
const inventory = codeInventory({ manifest, index, pkg });
const plan = (components, extra = {}) => ({ screen: 'Sign in', file: 'src/SignIn.tsx', components, ...extra });
const kinds = (res) => res.errors.map((e) => e.kind);

test('inventory: built components joined to their records, undocumented ones flagged', () => {
  const button = inventory.components.find((c) => c.name === 'Button');
  assert.deepEqual(button.variants, { variant: ['default', 'secondary'], size: ['sm', 'lg'] });
  assert.deepEqual(button.states, ['default', 'disabled']);
  assert.equal(inventory.components.find((c) => c.name === 'Spinner').documented, false);
  assert.equal(inventory.components.find((c) => c.name === 'Select Menu').documented, true);
  assert.equal(inventory.package, '@ds/ui');
});

test('check: an ok plan comes back in the records\' own casing', () => {
  const res = checkPlan(plan([{ name: 'button', variants: { Variant: 'SECONDARY', size: 'lg' } }, { name: 'selectmenu', variants: { state: 'open' } }]), inventory);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.deepEqual(res.plan.components, [
    { name: 'Button', variants: { variant: 'secondary', size: 'lg' } },
    { name: 'Select Menu', variants: { State: 'Open' } },
  ]);
});

test('check: a missing component names the nearest ones, and none when nothing is close', () => {
  const [e] = checkPlan(plan([{ name: 'DatePicker' }]), inventory).errors;
  assert.equal(e.kind, 'missing-component');
  assert.equal(e.path, 'components[0].name');
  assert.equal(e.asked, 'DatePicker');
  assert.deepEqual(e.nearest, []);
  assert.equal(checkPlan(plan([{ name: 'Buton' }]), inventory).errors[0].nearest[0], 'Button');
});

test('check: an unknown axis, an unknown value, and any axis on an undocumented component', () => {
  const res = checkPlan(plan([
    { name: 'Button', variants: { tone: 'loud' } },
    { name: 'Button', variants: { size: 'xl' } },
    { name: 'Spinner', variants: { size: 'sm' } },
  ]), inventory);
  assert.deepEqual(kinds(res), ['unknown-prop', 'unknown-option', 'unknown-prop']);
  assert.deepEqual(res.errors[1].options, ['sm', 'lg']);
  assert.equal(res.plan, null);
});

test('check: an existing file is replaced only when marked for the same screen', () => {
  assert.equal(checkPlan(plan([]), inventory, { existing: 'Sign in' }).ok, true);
  assert.deepEqual(kinds(checkPlan(plan([]), inventory, { existing: '' })), ['name-taken']);
  const other = checkPlan(plan([]), inventory, { existing: 'Sign up' });
  assert.deepEqual(kinds(other), ['name-taken']);
  assert.equal(other.errors[0].marked, 'Sign up');
  assert.equal(checkPlan(plan([]), inventory, { existing: null }).ok, true);
});

test('check: every error at once, and unknown fields are invalid', () => {
  const res = checkPlan(plan([{ name: 'DatePicker' }, { name: 'Button', variants: { size: 'xl' } }, { name: 'Input', props: {} }], { extra: 1 }), inventory, { existing: '' });
  assert.deepEqual(kinds(res).sort(), ['invalid', 'invalid', 'missing-component', 'name-taken', 'unknown-option']);
  for (const k of kinds(res)) assert.ok(COMPOSE_ERROR_KINDS.includes(k), k);
});

test('marker: line 1, or line 2 after a directive', () => {
  assert.equal(COMPOSED_MARKER('Sign in'), '// Composed by throughline: Sign in.');
  assert.equal(readMarker(`${COMPOSED_MARKER('Sign in')}\nimport x from 'y';`), 'Sign in');
  assert.equal(readMarker(`'use client';\n${COMPOSED_MARKER('Sign in')}\n`), 'Sign in');
  assert.equal(readMarker(`import x from 'y';\n${COMPOSED_MARKER('Sign in')}\n`), '');
  assert.equal(readMarker('export const A = 1;\n'), '');
});

const goodPlan = plan([{ name: 'Button' }, { name: 'Input' }, { name: 'Card' }]);
const screen = (body, imports = 'Button, Input, Card, CardHeader') => `${COMPOSED_MARKER('Sign in')}
import { ${imports} } from '@ds/ui';

export function SignIn() {
  return (
    <Card className="flex flex-col gap-[var(--space-gap-md)] w-full bg-primary rounded-md">
      <CardHeader />
      <h1 className="font-sans text-[var(--font-size-lg)]">Sign in</h1>
      <Input aria-label="Email" />
      <Button variant="default" size="lg">Sign in</Button>
${body}
    </Card>
  );
}
`;
const gate = (text, p = goodPlan) => gateFile({ file: 'SignIn.tsx', text, plan: p, manifest, index, tokenDicts, pkg });
const rules = (r) => r.failures.map((f) => f.rule);

test('gate: a clean composed file passes', () => {
  const r = gate(screen(''));
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

test('gate: raw values fail whether or not a token holds them', () => {
  const r = gate(screen('      <div className="p-[16px] bg-[#123456]" style={{ margin: 12 }} />'));
  assert.deepEqual(r.failures.filter((f) => f.rule === 'raw-value').map((f) => f.written).sort(), ['#123456', '12', 'p-[16px]']);
  // The gate's own rule also fires on the value a token holds.
  assert.ok(rules(r).includes('token-exists-for-dimension'));
  assert.equal(r.ok, false);
});

test('gate: default-scale utilities fail; token utilities, var(), keywords and fractions do not', () => {
  const r = gate(screen('      <div className={cn("gap-4 md:text-lg -mt-2 font-semibold max-w-sm", "p-0 w-full h-full w-1/2 bg-primary text-primary text-foreground font-sans h-[var(--x)]")} />'));
  assert.deepEqual(r.failures.map((f) => [f.rule, f.written]),
    [['scale-utility', 'gap-4'], ['scale-utility', 'md:text-lg'], ['scale-utility', '-mt-2'], ['scale-utility', 'font-semibold'], ['scale-utility', 'max-w-sm']]);
});

test('gate: a raw size the gate does not read is a raw value; a percentage is not', () => {
  const r = gate(screen('      <div className="w-[320px] md:max-w-[40rem] w-[50%] h-[100dvh] min-h-[100vh]" style={{ width: 320, minHeight: \'2rem\', maxWidth: \'100%\' }} />'));
  assert.deepEqual(r.failures.filter((f) => f.rule === 'raw-value').map((f) => f.written),
    ['w-[320px]', 'md:max-w-[40rem]', 'width: 320', "minHeight: '2rem"]);
});

test('check: a listed sub-part resolves to its owner', () => {
  const res = checkPlan(plan([{ name: 'CardHeader' }, { name: 'CardTitle', variants: { size: 'lg' } }]), inventory);
  assert.deepEqual(kinds(res), ['unknown-prop']);
  assert.deepEqual(checkPlan(plan([{ name: 'CardHeader' }]), inventory).plan.components, [{ name: 'CardHeader', partOf: 'Card', variants: {} }]);
});

test('gate: a part is on plan through its owner, also when the plan lists only the part', () => {
  const text = `${COMPOSED_MARKER('Sign in')}\nimport { CardTitle } from '@ds/ui';\nexport const S = () => <CardTitle />;\n`;
  assert.ok(!gate(text, { components: [{ name: 'CardHeader', partOf: 'Card' }] }).failures.some((f) => f.rule === 'off-plan'));
});

test('gate: a hand-built control and an unplanned package component are off-plan', () => {
  const r = gate(screen('      <button>Go</button>\n      <Checkbox />', 'Button, Input, Card, CardHeader, Checkbox'));
  assert.deepEqual(r.failures.map((f) => [f.rule, f.written]), [['off-plan', '<button>'], ['off-plan', '<Checkbox>']]);
});

test('gate: imports from anywhere but the system package and React are off-plan', () => {
  const text = screen('').replace("import {", `import * as React from 'react';\nimport { createPortal } from 'react-dom';\nimport type { FC } from 'react';\nimport '@ds/ui/styles';\nimport { ArrowRight } from 'lucide-react';\nimport Local from './Local';\nimport {`);
  assert.deepEqual(gate(text).failures.map((f) => [f.rule, f.written]),
    [['off-plan', "import from 'lucide-react'"], ['off-plan', "import from './Local'"]]);
  const more = screen('').replace('export function', `export { Grid } from 'grid-lib';\nconst L = await import('lodash');\nconst R = require('react-router-dom');\nconst D = require('react-dom');\nexport function`);
  assert.deepEqual(gate(more).failures.map((f) => f.written),
    ["import from 'grid-lib'", "import from 'lodash'", "import from 'react-router-dom'"]);
});

test('gate: the file must carry the marker for the plan\'s screen', () => {
  assert.deepEqual(gate(screen('').replace(COMPOSED_MARKER('Sign in'), '// mine')).failures.map((f) => [f.rule, f.written]), [['marker', '(none)']]);
  assert.deepEqual(gate(screen('').replace(COMPOSED_MARKER('Sign in'), COMPOSED_MARKER('Sign up'))).failures.map((f) => [f.rule, f.written]), [['marker', 'Sign up']]);
  assert.equal(gate(`'use client';\n${screen('')}`).ok, true);
});

test('gate: a sub-part of a planned component is on plan', () => {
  assert.ok(!gate(screen('')).failures.some((f) => f.written === '<CardHeader>'));
});

test('gate: variant-rule-inert is an advisory on one file', () => {
  const text = `${COMPOSED_MARKER('Sign in')}\nimport { Button } from '@ds/ui';\nexport const S = () => <Button aria-label="Go" />;\n`;
  const r = gate(text, plan([{ name: 'Button' }]));
  assert.ok(!rules(r).includes('variant-rule-inert'));
  assert.ok(r.advisories.some((a) => a.rule === 'variant-rule-inert'));
  assert.equal(r.ok, true);
});

test('CLI: check reads the marker of the file at the plan\'s path, and gate exits 1 on a failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'compose-code-'));
  mkdirSync(join(dir, 'design-system/docs'), { recursive: true });
  writeFileSync(join(dir, 'design-system.json'), JSON.stringify(manifest));
  writeFileSync(join(dir, 'design-system/docs/index.json'), JSON.stringify(index));
  writeFileSync(join(dir, 'tokens.json'), JSON.stringify(tokenDicts[0]));
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({ ...goodPlan, file: 'SignIn.tsx' }));
  writeFileSync(join(dir, 'SignIn.tsx'), 'export const Mine = 1;\n');
  const script = fileURLToPath(new URL('./compose-code.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, ...args, '--system', dir, '--package', pkg], { cwd: dir, encoding: 'utf8' });

  const check = run('check', '--plan', 'plan.json');
  assert.equal(check.status, 1);
  assert.deepEqual(JSON.parse(check.stdout).errors.map((e) => e.kind), ['name-taken']);

  writeFileSync(join(dir, 'SignIn.tsx'), screen('      <button>Go</button>'));
  assert.equal(run('check', '--plan', 'plan.json').status, 0);
  const g = run('gate', '--plan', 'plan.json', '--file', 'SignIn.tsx', '--tokens', 'tokens.json');
  assert.equal(g.status, 1, g.stderr);
  assert.match(g.stdout, /\[off-plan\] <button>/);
  assert.match(g.stdout, /compose-code gate: FAIL/);

  writeFileSync(join(dir, 'SignIn.tsx'), screen(''));
  assert.equal(run('gate', '--plan', 'plan.json', '--file', 'SignIn.tsx', '--tokens', 'tokens.json').status, 0);
  assert.equal(run('gate', '--plan', 'plan.json', '--file', 'SignIn.tsx').status, 2);
  writeFileSync(join(dir, 'bad.json'), JSON.stringify({ ...goodPlan, components: [{ name: 'DatePicker' }] }));
  const bad = run('gate', '--plan', 'bad.json', '--file', 'SignIn.tsx', '--tokens', 'tokens.json');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /missing-component/);
  assert.equal(run('inventory').status, 0);

  // gate resolves the plan itself, so a listed part admits its siblings.
  writeFileSync(join(dir, 'parts.json'), JSON.stringify({ screen: 'Sign in', file: 'Parts.tsx', components: [{ name: 'CardHeader' }] }));
  writeFileSync(join(dir, 'Parts.tsx'), `${COMPOSED_MARKER('Sign in')}\nimport { CardTitle } from '@ds/ui';\nexport const S = () => <CardTitle />;\n`);
  const parts = run('gate', '--plan', 'parts.json', '--file', 'Parts.tsx', '--tokens', 'tokens.json');
  assert.doesNotMatch(parts.stdout, /off-plan/);
});
