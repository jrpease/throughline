import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extract,
  normalizeHex,
  validate,
  buildTokenValues,
  formatReport,
} from './validate-adherence.mjs';

const SRC = `
import { Button, Card as Panel } from '@acme/ui';
import { Other } from 'somewhere-else';

export function Page() {
  return (
    <Button variant="ghost" size="lg" onClick={fn} label="Go">
      <Panel variant="elevated" />
      <Other variant="nope" />
      <div style={{ color: '#3B82F6' }} />
    </Button>
  );
}
`;

test('extract reads only components imported from the system package', () => {
  const { imported } = extract(SRC, '@acme/ui');
  assert.deepEqual(
    [...imported.entries()].sort(),
    [
      ['Button', 'Button'],
      ['Panel', 'Card'],
    ],
  );
});

test('extract resolves an import alias back to the declared name', () => {
  const { usages } = extract(SRC, '@acme/ui');
  const panel = usages.find((u) => u.attr === 'variant' && u.value === 'elevated');
  assert.equal(panel.component, 'Card', 'reported under the name the system knows');
});

test('extract ignores a component from another package', () => {
  const { usages } = extract(SRC, '@acme/ui');
  assert.equal(
    usages.some((u) => u.value === 'nope'),
    false,
  );
});

test('extract marks a non-literal attribute rather than dropping it', () => {
  const { usages } = extract(SRC, '@acme/ui');
  const click = usages.find((u) => u.attr === 'onClick');
  assert.equal(click.value, null, 'seen, unreadable — the blind spot is reported, not hidden');
});

test('extract finds hex literals with their line numbers', () => {
  const { literals } = extract(SRC, '@acme/ui');
  assert.equal(literals.length, 1);
  assert.equal(literals[0].value, '#3b82f6');
  // Line 1 of the fixture is the template literal's own leading newline, so the
  // <div> carrying the hex is line 10. Counted by hand against SRC, not read
  // back off the implementation.
  assert.equal(literals[0].line, 10);
});

// A wrapped element is read — [^>] spans newlines — but every attribute is
// attributed to the line the TAG opens on, not the line it sits on. Verified
// against the e2e, and pinned here because it is a real coarseness in the
// reports, not an accident to be silently fixed later.
test('a multi-line tag is read, and reports the line the tag opens on', () => {
  const { usages } = extract(
    `import { Button } from '@acme/ui';\n<Button\n  variant="tertiary"\n  size="lg"\n/>\n`,
    '@acme/ui',
  );
  assert.deepEqual(
    usages.map((u) => [u.attr, u.value, u.line]),
    [
      ['variant', 'tertiary', 2],
      ['size', 'lg', 2],
    ],
  );
});

test('normalizeHex folds the spellings of one colour together', () => {
  assert.equal(normalizeHex('#ABC'), '#aabbcc');
  assert.equal(normalizeHex('#AABBCC'), '#aabbcc');
  assert.equal(normalizeHex('#aabbccff'), '#aabbcc');
  assert.equal(normalizeHex('#aabbcc80'), '#aabbcc80', 'a real alpha is not stripped');
  assert.equal(normalizeHex('rgb(1,2,3)'), null, 'non-hex is uncomparable, not guessed');
});

const INDEX = {
  components: [
    {
      name: 'Button',
      variants: { variant: { primary: '', ghost: '' }, size: { sm: '', lg: '' } },
      states: { disabled: '' },
    },
    { name: 'Select Menu', variants: { size: { sm: '' } }, states: {} },
  ],
};
const BUILT = ['Button', 'Select Menu', 'Spinner'];
const TOKENS = buildTokenValues([{ color: { brand: { $value: '#3B82F6', $type: 'color' } } }]);
const file = (usages = [], literals = []) => [{ path: 'a.tsx', usages, literals }];

test('a variant value outside the declared set fails', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'variant', value: 'tertiary', line: 3 }]),
  });
  assert.equal(r.ok, false);
  assert.deepEqual(
    r.failures.map((f) => f.rule),
    ['unknown-variant-value'],
  );
});

test('a declared variant value passes', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'variant', value: 'ghost', line: 3 }]),
  });
  assert.deepEqual(r.failures, []);
});

// Measured: components.built holds "Select Menu"; the code writes <SelectMenu>.
test('a display name in the manifest matches the code identifier', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([{ component: 'SelectMenu', attr: 'size', value: 'sm', line: 1 }]),
  });
  assert.deepEqual(r.failures, [], 'correct code must not fail on a display name');
});

test('a component not in the manifest fails', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([{ component: 'Invented', attr: 'variant', value: 'x', line: 1 }]),
  });
  assert.deepEqual(
    r.failures.map((f) => f.rule),
    ['unknown-component'],
  );
});

test('a built component with no doc record is an advisory, not a failure', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([
      { component: 'Spinner', attr: 'size', value: 'lg', line: 1 },
      { component: 'Button', attr: 'variant', value: 'ghost', line: 2 },
    ]),
  });
  assert.deepEqual(r.failures, [], 'Spinner itself contributes no failure');
  assert.ok(r.advisories.some((a) => a.rule === 'undocumented-component'));
});

// The converse, and the reason the test above needs a documented component in
// it: an undocumented component is skipped before any axis is matched, so a run
// whose ONLY referenced components are undocumented has verified nothing about
// variants. Decision 7 says that fails. Staying green here would be exactly the
// green light the rule exists to prevent — the advisory alone does not gate.
test('a run referencing only undocumented components is inert, not green', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([{ component: 'Spinner', attr: 'size', value: 'lg', line: 1 }]),
  });
  assert.equal(r.ok, false);
  assert.deepEqual(
    r.failures.map((f) => f.rule),
    ['variant-rule-inert'],
  );
  assert.equal(r.failures[0].undocumented, 1, 'the report must name the real cause');
});

test('a declared state name is not reported as unmodelled', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'disabled', value: 'true', line: 1 }]),
  });
  assert.equal(
    r.advisories.some((a) => a.rule === 'unmodelled-prop'),
    false,
  );
});

test('an attribute matching no axis is an advisory and does not gate', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([
      { component: 'Button', attr: 'variant', value: 'ghost', line: 1 },
      { component: 'Button', attr: 'label', value: 'Go', line: 1 },
    ]),
  });
  assert.equal(r.ok, true);
  assert.ok(r.advisories.some((a) => a.rule === 'unmodelled-prop'));
});

test('a literal with a token fails; one without is silent', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file(
      [{ component: 'Button', attr: 'variant', value: 'ghost', line: 1 }],
      [
        { value: '#3b82f6', line: 2 },
        { value: '#123456', line: 3 },
      ],
    ),
  });
  assert.deepEqual(
    r.failures.map((f) => f.rule),
    ['token-exists-for-literal'],
  );
  assert.match(r.failures[0].tokens.join(','), /color\.brand/);
});

test('an aliased token resolves through the chain', () => {
  const t = buildTokenValues([
    {
      base: { blue: { $value: '#3B82F6', $type: 'color' } },
      brand: { primary: { $value: '{base.blue}', $type: 'color' } },
    },
  ]);
  assert.ok(t.get('#3b82f6').includes('brand.primary'));
});

test('an unresolvable or circular reference is skipped, not thrown on', () => {
  assert.doesNotThrow(() =>
    buildTokenValues([
      {
        a: { x: { $value: '{nope.missing}', $type: 'color' } },
        b: { y: { $value: '{c.z}', $type: 'color' } },
        c: { z: { $value: '{b.y}', $type: 'color' } },
      },
    ]),
  );
});

test('a non-hex token value is counted uncomparable, not compared', () => {
  const t = buildTokenValues([{ c: { x: { $value: 'rgb(1,2,3)', $type: 'color' } } }]);
  assert.equal(t.size, 0);
});

// Found by the e2e, not by a fixture: pointed at a directory with no source in
// it, the gate loaded its tokens, scanned nothing, and exited 0. Decision 7
// covers each rule's inputs but nothing covered the scan itself, so the whole
// gate could report a clean pass having read no code at all — the exact green
// light this project keeps filing issues about, in the gate written to prevent
// it.
test('a run that scanned no code at all fails rather than passing', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS, files: [] });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.rule === 'nothing-scanned'));
});

test('nothing-scanned fires on files that yielded neither usage nor literal', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS, files: file() });
  assert.ok(r.failures.some((f) => f.rule === 'nothing-scanned'));
});

test('nothing-scanned is silent as soon as anything was read', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([], [{ value: '#123456', line: 1 }]),
  });
  assert.equal(
    r.failures.some((f) => f.rule === 'nothing-scanned'),
    false,
  );
});

// Decision 7 — per rule, not once globally.
test('no comparable token value fails as colour-rule-inert', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: new Map(),
    files: file([{ component: 'Button', attr: 'variant', value: 'ghost', line: 1 }]),
  });
  assert.ok(r.failures.some((f) => f.rule === 'colour-rule-inert'));
});

test('known components and zero axis matches fails as variant-rule-inert', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'label', value: 'Go', line: 1 }]),
  });
  assert.ok(r.failures.some((f) => f.rule === 'variant-rule-inert'));
});

test('a skipped rule is neither run nor inert', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    skip: ['unknown-variant-value'],
    files: file([{ component: 'Button', attr: 'label', value: 'Go', line: 1 }]),
  });
  assert.equal(
    r.failures.some((f) => f.rule === 'variant-rule-inert'),
    false,
  );
});

// A Vue or Svelte repo gets the colour rule only. It must not fail for having
// no component references.
test('colour-only scanning passes with no component usages at all', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    skip: ['unknown-variant-value', 'unknown-component'],
    files: file([], [{ value: '#123456', line: 1 }]),
  });
  assert.equal(r.ok, true);
});

test('the headline carries the dynamic proportion, not just the advisories', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([
      { component: 'Button', attr: 'variant', value: 'ghost', line: 1 },
      { component: 'Button', attr: 'size', value: null, line: 2 },
    ]),
  });
  const text = formatReport(r).join('\n');
  assert.match(text, /1 of 2 attributes are expressions/, 'the blind spot is a proportion, not a list');
});

test('an unknown value names the declared set', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([{ component: 'Button', attr: 'variant', value: 'tertiary', line: 3 }]),
  });
  assert.match(formatReport(r).join('\n'), /declared values for "variant" are primary, ghost/);
});

test('an unmodelled prop names the axes the system does model', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([
      { component: 'Button', attr: 'variant', value: 'ghost', line: 1 },
      { component: 'Button', attr: 'label', value: 'Go', line: 2 },
    ]),
  });
  assert.match(formatReport(r).join('\n'), /models this component's axes as variant, size/);
});

test('an inert rule says which rule and why', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: new Map(), files: file() });
  assert.match(formatReport(r).join('\n'), /colour-rule-inert/);
  assert.match(formatReport(r).join('\n'), /--tokens/);
});

// The misleading-message case the Spinner test uncovered: when the cause is an
// undocumented component, the report must say so rather than sending the reader
// to look for disagreeing axis names.
test('variant-rule-inert names undocumented components when that is the cause', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    files: file([{ component: 'Spinner', attr: 'size', value: 'lg', line: 1 }]),
  });
  assert.match(formatReport(r).join('\n'), /1 referenced component\(s\) have no doc record/);
});

// formatReport returns string[]. Every branch must render without throwing and
// without printing "undefined" — the failure mode a report-only path hides
// until the day it fires.
test('every rule renders without undefined leaking into the text', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: new Map(),
    skip: ['unknown-variant-value'],
    files: file(
      [
        { component: 'Invented', attr: 'variant', value: 'x', line: 1 },
        { component: 'Spinner', attr: 'size', value: 'lg', line: 2 },
        { component: 'Button', attr: 'label', value: 'Go', line: 3 },
        { component: 'Button', attr: 'onClick', value: null, line: 4 },
      ],
      [{ value: '#123456', line: 5 }],
    ),
  });
  const text = formatReport(r).join('\n');
  assert.equal(text.includes('undefined'), false, text);
  assert.match(text, /skipped:\s+unknown-variant-value/);
});
