import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  extract,
  normalizeHex,
  rgbToHex,
  validate,
  buildTokenValues,
  skippedColourTokens,
  formatReport,
  tokenPackageDirs,
  dimensionCategory,
  canonicalDimension,
  buildDimensionValues,
  extractDimensions,
  partOwner,
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
  const { usages, elements } = extract(
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
  assert.deepEqual(elements, [{ component: 'Button', line: 2 }]);
});

// Line 1 of SRC is its leading newline, so <Button opens line 7 and <Panel
// line 8. <Other> isn't imported from the package.
test('extract reports one element per opening tag, with the line it opens on', () => {
  const { elements } = extract(SRC, '@acme/ui');
  assert.deepEqual(elements, [
    { component: 'Button', line: 7 },
    { component: 'Card', line: 8 },
  ]);
});

// #120: <Icons.Folder> is a member of something the system exports — not a
// component reference — so it's left alone entirely.
test('a tag with a .Member chain is left alone', () => {
  const { elements, usages } = extract(
    `import { Icons } from '@acme/ui';\n<Icons.Folder size={13} className="x" aria-hidden />\n`,
    '@acme/ui',
    'a.tsx',
  );
  assert.deepEqual(elements, []);
  assert.deepEqual(usages, []);
});

// #120: a tag with no attributes is now checked too.
test('an attributeless tag is still an element', () => {
  const { elements } = extract(`import { Nonexistent } from '@acme/ui';\n<Nonexistent />\n`, '@acme/ui', 'a.tsx');
  assert.deepEqual(elements, [{ component: 'Nonexistent', line: 2 }]);
});

// #120: a commented-out tag isn't code, whether the comment is `//` or a JSX
// block comment.
test('a commented-out tag is not an element', () => {
  const { elements } = extract(
    `import { Hero } from '@acme/ui';\n// <Hero />\n{/* <Hero /> */}\n<Hero />\n`,
    '@acme/ui',
    'a.tsx',
  );
  assert.deepEqual(elements, [{ component: 'Hero', line: 4 }]);
});

// #120: a `<` straight after an identifier character is a type argument, not
// a tag — `useState<Variant>('a')` must not read as `<Variant>`.
test('a type argument is not an element', () => {
  const { elements } = extract(
    `import { Variant } from '@acme/ui';\nconst [v] = useState<Variant>('a');\n`,
    '@acme/ui',
    'a.tsx',
  );
  assert.deepEqual(elements, []);
});

// #123, measured: `var(--signal-500); /* #5B7FFF */` in throughline-ds lab.css
// failed code that already uses the token.
const hexes = (text, path) => extract(text, '@acme/ui', path).literals;

test('a hex inside a block comment is not a literal', () => {
  assert.deepEqual(hexes('--x: var(--signal-500); /* #5B7FFF */\n', 'a.css'), []);
});

test('blanking a comment keeps the line numbers after it', () => {
  // Line 1 opens the comment, lines 2 and 3 continue and close it, line 4 holds
  // the hex. Counted by hand.
  const text = '/* one\n   two\n   three */\n.a { color: #3b82f6; }\n';
  assert.deepEqual(hexes(text, 'a.css'), [{ value: '#3b82f6', line: 4 }]);
});

test('a hex after // is not a literal outside plain CSS', () => {
  assert.deepEqual(hexes('// #3b82f6\n', 'a.scss'), []);
  assert.deepEqual(hexes('// #3b82f6\n', 'a.ts'), []);
  assert.deepEqual(hexes('// #3b82f6\n'), []);
});

test('// is not a comment in plain CSS', () => {
  assert.deepEqual(hexes('// #3b82f6\n', 'a.css'), [{ value: '#3b82f6', line: 1 }]);
});

test('// after a colon is a URL, not a comment', () => {
  const text = "const u = 'https://x.test'; const c = '#3b82f6';\n";
  assert.deepEqual(hexes(text, 'a.ts'), [{ value: '#3b82f6', line: 1 }]);
});

test('a /* inside a // comment does not pair with a later */', () => {
  const text = '// see /*\ncolor: #3b82f6;\n/* note */\n';
  assert.deepEqual(hexes(text, 'a.scss'), [{ value: '#3b82f6', line: 2 }]);
});

// #123, measured: the border-gradient idiom in zygarden's
// account-settings.component.scss, where only alpha matters.
const MASKED = `.a {
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  color: #fff;
}
`;

test('a hex inside a mask declaration is not a literal', () => {
  // The only literal left is the color on line 8. Counted by hand.
  assert.deepEqual(hexes(MASKED, 'a.scss'), [{ value: '#ffffff', line: 8 }]);
  assert.deepEqual(hexes(MASKED, 'a.css'), [{ value: '#ffffff', line: 8 }]);
});

test('mask-composite, --mask and $mask suppress nothing', () => {
  const text = '.a {\n  mask-composite: exclude;\n  --mask: #fff;\n}\n$mask: #fff;\n';
  assert.deepEqual(hexes(text, 'a.scss'), [
    { value: '#ffffff', line: 3 },
    { value: '#ffffff', line: 5 },
  ]);
});

test('a mask outside CSS and SCSS still yields its literals', () => {
  assert.equal(hexes(MASKED, 'a.tsx').length, 5);
});

test('normalizeHex folds the spellings of one colour together', () => {
  assert.equal(normalizeHex('#ABC'), '#aabbcc');
  assert.equal(normalizeHex('#AABBCC'), '#aabbcc');
  assert.equal(normalizeHex('#aabbccff'), '#aabbcc');
  assert.equal(normalizeHex('#aabbcc80'), '#aabbcc80', 'a real alpha is not stripped');
  assert.equal(normalizeHex('rgb(1,2,3)'), null, 'non-hex is uncomparable, not guessed');
});

test('rgbToHex normalises an opaque integer rgb() to hex', () => {
  assert.equal(rgbToHex('rgb(59, 130, 246)'), '#3b82f6');
  assert.equal(rgbToHex('rgba(59,130,246,1)'), '#3b82f6');
  assert.equal(rgbToHex('rgb(59 130 246 / 100%)'), '#3b82f6');
  assert.equal(rgbToHex('rgb(59 130 246 / 1.0)'), '#3b82f6');
});

test('rgbToHex declines what it cannot normalise', () => {
  assert.equal(rgbToHex('rgba(59, 130, 246, 0.5)'), null, 'a real alpha');
  assert.equal(rgbToHex('rgb(50%, 10%, 0%)'), null, 'percentage channels');
  assert.equal(rgbToHex('rgb(var(--c) / 1)'), null, 'a var() channel');
  assert.equal(rgbToHex('hsl(217 91% 60%)'), null, 'not rgb()');
  assert.equal(rgbToHex('rgb(256, 0, 0)'), null, 'a channel above 255');
  assert.equal(rgbToHex('rgb(1, 2)'), null, 'too few channels');
});

test('extract reads an opaque rgba() literal as its hex value', () => {
  assert.deepEqual(hexes('.a { border-color: rgba(59, 130, 246, 1); }\n', 'a.scss'), [
    { value: '#3b82f6', line: 1 },
  ]);
});

test('an rgba() inside a comment or a mask is not a literal', () => {
  assert.deepEqual(hexes('/* .a { border-color: rgba(59, 130, 246, 1); } */\n', 'a.scss'), []);
  assert.deepEqual(hexes('mask: linear-gradient(rgb(255, 255, 255) 0 0);\n', 'a.scss'), []);
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
const DIMS = buildDimensionValues([{ space: { 4: { $value: '16px', $type: 'dimension' } } }]);
const elementsOf = (usages) => [
  ...new Map(usages.map((u) => [`${u.component}:${u.line}`, { component: u.component, line: u.line }])).values(),
];
const file = (usages = [], literals = [], dimensions = [], elements = elementsOf(usages)) => [
  { path: 'a.tsx', elements, usages, literals, dimensions },
];

test('a variant value outside the declared set fails', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
    files: file([{ component: 'SelectMenu', attr: 'size', value: 'sm', line: 1 }]),
  });
  assert.deepEqual(r.failures, [], 'correct code must not fail on a display name');
});

test('a component not in the manifest fails', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
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

test('an unresolvable or circular reference is skipped and counted, not thrown on', () => {
  const dicts = [
    {
      a: { x: { $value: '{nope.missing}', $type: 'color' } },
      b: { y: { $value: '{c.z}', $type: 'color' } },
      c: { z: { $value: '{b.y}', $type: 'color' } },
    },
  ];
  assert.doesNotThrow(() => buildTokenValues(dicts));
  assert.deepEqual(skippedColourTokens(dicts), { unresolvable: 3, nonHex: 0 });
});

test('a non-hex token value is counted uncomparable, not compared', () => {
  const dicts = [{ c: { x: { $value: 'hsl(217 91% 60%)', $type: 'color' } } }];
  assert.equal(buildTokenValues(dicts).size, 0);
  assert.deepEqual(skippedColourTokens(dicts), { unresolvable: 0, nonHex: 1 });
});

// #121, measured: zygarden's semantic colour files alias primitives in a third
// file, and resolving each --tokens file alone skipped 51 of them.
test('an alias into another --tokens file resolves', () => {
  const dicts = [
    { color: { red: { 500: { $value: '#EF4444', $type: 'color' } } } },
    { color: { danger: { text: { $value: '{color.red.500}', $type: 'color' } } } },
  ];
  assert.deepEqual(buildTokenValues(dicts).get('#ef4444'), ['color.red.500', 'color.danger.text']);
  assert.deepEqual(skippedColourTokens(dicts), { unresolvable: 0, nonHex: 0 });
});

test('two mode files that define one path differently each resolve their own value', () => {
  const t = buildTokenValues([
    { base: { dark: { $value: '#000000', $type: 'color' }, light: { $value: '#ffffff', $type: 'color' } } },
    { bg: { $value: '{base.dark}', $type: 'color' } },
    { bg: { $value: '{base.light}', $type: 'color' } },
  ]);
  assert.deepEqual(t.get('#000000'), ['base.dark', 'bg']);
  assert.deepEqual(t.get('#ffffff'), ['base.light', 'bg']);
});

test('a finding names a path two mode files share only once', () => {
  const tokenValues = buildTokenValues([
    { red: { $value: '#EF4444', $type: 'color' } },
    { danger: { $value: '{red}', $type: 'color' } },
    { danger: { $value: '{red}', $type: 'color' } },
  ]);
  const r = validate({ tokenValues, dimensionValues: DIMS, files: file([], [{ value: '#ef4444', line: 1 }]) });
  const f = r.failures.find((x) => x.rule === 'token-exists-for-literal');
  assert.deepEqual(f.tokens, ['red', 'danger']);
  assert.match(formatReport(r).join('\n'), /red, danger resolve to exactly this value/);
});

test('a collection-relative alias is counted unresolvable, not guessed at', () => {
  const dicts = [
    {
      'color-primitive': { canvas: { $value: '#FAFAF7', $type: 'color' } },
      'color-semantic': { bg: { $value: '{canvas}', $type: 'color' } },
    },
  ];
  assert.deepEqual(buildTokenValues(dicts).get('#fafaf7'), ['color-primitive.canvas']);
  assert.deepEqual(skippedColourTokens(dicts), { unresolvable: 1, nonHex: 0 });
});

test('a token that is not a colour is never counted as a skipped colour', () => {
  const dicts = [
    {
      font: { family: { $value: 'Inter', $type: 'fontFamily' } },
      space: { gap: { $value: '{space.missing}', $type: 'dimension' } },
      loose: { $value: 'hsl(217 91% 60%)' },
    },
  ];
  assert.deepEqual(skippedColourTokens(dicts), { unresolvable: 0, nonHex: 0 });
});

test('an opaque rgb() token value resolves the same as its hex', () => {
  const t = buildTokenValues([{ c: { x: { $value: 'rgb(59, 130, 246)', $type: 'color' } } }]);
  assert.deepEqual(t.get('#3b82f6'), ['c.x']);
});

// Found by the e2e, not by a fixture: pointed at a directory with no source in
// it, the gate loaded its tokens, scanned nothing, and exited 0. Decision 7
// covers each rule's inputs but nothing covered the scan itself, so the whole
// gate could report a clean pass having read no code at all — the exact green
// light this project keeps filing issues about, in the gate written to prevent
// it.
test('a run that scanned no code at all fails rather than passing', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS, dimensionValues: DIMS, files: [] });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.rule === 'nothing-scanned'));
});

test('nothing-scanned fires on files that yielded neither usage nor literal', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS, dimensionValues: DIMS, files: file() });
  assert.ok(r.failures.some((f) => f.rule === 'nothing-scanned'));
});

test('nothing-scanned reports the files walked, not the files that yielded', () => {
  const r = validate({ built: BUILT, index: INDEX, tokenValues: TOKENS, dimensionValues: DIMS, files: [], walked: 12 });
  const failure = r.failures.find((f) => f.rule === 'nothing-scanned');
  assert.equal(failure.files, 12, 'the count is the walk, not the yield');
  const text = formatReport(r).join('\n');
  assert.match(text, /12 file\(s\) yielded no component reference/);
  assert.match(text, /0 component references, 0 colour literals, 0 dimension literals, 12 files/);
});

test('the CLI prints the number of files it walked when nothing-scanned fires', () => {
  const root = mkdtempSync(join(tmpdir(), 'adherence-root-'));
  const system = mkdtempSync(join(tmpdir(), 'adherence-system-'));
  for (const name of ['a.tsx', 'b.tsx', 'c.tsx']) {
    writeFileSync(join(root, name), 'export const value = 1;\n');
  }
  mkdirSync(join(system, 'design-system', 'docs'), { recursive: true });
  writeFileSync(
    join(system, 'design-system.json'),
    JSON.stringify({ components: { built: [] } }),
  );
  writeFileSync(
    join(system, 'design-system', 'docs', 'index.json'),
    JSON.stringify({ components: [] }),
  );

  let out = '';
  let code = 0;
  try {
    out = execFileSync(
      'node',
      [
        'scripts/validate-adherence.mjs',
        '--root', root,
        '--system', system,
        '--package', '@acme/ui',
      ],
      { encoding: 'utf8' },
    );
  } catch (e) {
    code = e.status;
    out = e.stdout ?? '';
  }
  assert.equal(code, 1, 'a run that verified nothing exits non-zero');
  assert.match(out, /3 file\(s\) yielded no component reference/);
});

test('nothing-scanned is silent as soon as anything was read', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
    files: file([{ component: 'Button', attr: 'label', value: 'Go', line: 1 }]),
  });
  assert.ok(r.failures.some((f) => f.rule === 'variant-rule-inert'));
});

test('a skipped rule is neither run nor inert', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
    files: file([{ component: 'Button', attr: 'variant', value: 'tertiary', line: 3 }]),
  });
  assert.match(formatReport(r).join('\n'), /declared values for "variant" are primary, ghost/);
});

test('an unmodelled prop names the axes the system does model', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
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
    dimensionValues: DIMS,
    skip: ['unknown-variant-value'],
    files: file(
      [
        { component: 'Invented', attr: 'variant', value: 'x', line: 1 },
        { component: 'Spinner', attr: 'size', value: 'lg', line: 2 },
        { component: 'Button', attr: 'label', value: 'Go', line: 3 },
        { component: 'Button', attr: 'onClick', value: null, line: 4 },
        { component: 'SpinnerIcon', attr: 'size', value: 'sm', line: 7 },
      ],
      [{ value: '#123456', line: 5 }],
      [{ category: 'spacing', written: '1rem', value: '16px', line: 6 }],
    ),
    excluded: [{ dir: 'packages/tokens', files: 2 }],
  });
  const text = formatReport(r).join('\n');
  assert.equal(text.includes('undefined'), false, text);
  assert.match(text, /skipped:\s+unknown-variant-value/);
  assert.match(text, /excluded:\s+2 file\(s\) in packages\/tokens/);
  assert.match(text, /parts:\s+SpinnerIcon \(Spinner\) — not in components\.built/);
  assert.match(
    text,
    /\[token-exists-for-dimension\] spacing 1rem \(16px\) at a\.tsx:6 — space\.4 resolves to exactly this value/,
  );

  const inertText = formatReport(validate({ files: [], dimensionValues: new Map() })).join('\n');
  assert.equal(inertText.includes('undefined'), false, inertText);
  assert.match(inertText, /dimension-rule-inert/);
  assert.match(inertText, /--skip token-exists-for-dimension/);
});

// #120: a part name only has to start with a built component's name and
// continue with another capital letter — `ButtonX` is accepted on purpose.
test('partOwner accepts ButtonX on purpose — a single following capital is enough', () => {
  const built = ['Card', 'Button', 'ButtonGroup', 'Select Menu'];
  assert.equal(partOwner('CardTitle', built), 'Card');
  assert.equal(partOwner('CardGrid', built), 'Card');
  assert.equal(partOwner('ButtonGroupText', built), 'ButtonGroup');
  assert.equal(partOwner('SelectMenuItem', built), 'Select Menu');
  assert.equal(partOwner('ButtonX', built), 'Button');
  for (const name of ['Cardigan', 'Buttons', 'Buton', 'Card2', 'Card', 'Hero', 'Card_Title']) {
    assert.equal(partOwner(name, built), null, name);
  }
});

test('an unknown component fails once per tag, not once per attribute', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    dimensionValues: DIMS,
    files: file([
      { component: 'Invented', attr: 'ref', value: null, line: 3 },
      { component: 'Invented', attr: 'style', value: null, line: 3 },
      { component: 'Invented', attr: 'className', value: 'a', line: 3 },
    ]),
  });
  assert.deepEqual(r.failures.map((f) => f.rule), ['unknown-component']);
});

test('an attributeless unknown tag still fails', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    dimensionValues: DIMS,
    files: file([], [], [], [{ component: 'Nonexistent', line: 2 }]),
  });
  assert.deepEqual(r.failures.map((f) => f.rule), ['unknown-component'], 'nothing-scanned must not fire either');
});

test('a part passes, and nothing past existence is checked', () => {
  const r = validate({
    built: ['Card'],
    index: { components: [{ name: 'Card', variants: { variant: { default: '' } }, states: {} }] },
    tokenValues: TOKENS,
    dimensionValues: DIMS,
    files: file([
      { component: 'CardTitle', attr: 'variant', value: 'x', line: 1 },
      { component: 'CardTitle', attr: 'onClick', value: null, line: 1 },
    ]),
  });
  assert.deepEqual(r.failures, []);
  assert.deepEqual(r.advisories, []);
  assert.deepEqual([...r.stats.parts], [['CardTitle', 'Card']]);
  assert.equal(r.stats.knownComponents.size, 0);
});

test('a skipped rule records no parts', () => {
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    dimensionValues: DIMS,
    skip: ['unknown-component'],
    files: file([], [], [], [
      { component: 'Invented', line: 1 },
      { component: 'SpinnerIcon', line: 2 },
    ]),
  });
  assert.equal(
    r.failures.some((f) => f.rule === 'unknown-component'),
    false,
  );
  assert.equal(r.stats.parts.size, 0);
});

test('the headline counts tags, and a part is named once', () => {
  const usages = [
    { component: 'Button', attr: 'variant', value: 'ghost', line: 1 },
    { component: 'Button', attr: 'size', value: 'lg', line: 1 },
    { component: 'SpinnerIcon', attr: 'size', value: 'sm', line: 2 },
  ];
  const elements = [
    { component: 'Button', line: 1 },
    { component: 'SpinnerIcon', line: 2 },
    { component: 'SpinnerIcon', line: 3 },
  ];
  const r = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    dimensionValues: DIMS,
    files: file(usages, [], [], elements),
  });
  const text = formatReport(r).join('\n');
  assert.match(text, /— 3 component references, /);
  assert.match(text, /not read:     0 of 3 attributes/);
  const partsLines = text.split('\n').filter((l) => l.includes('parts:'));
  assert.equal(partsLines.length, 1);
  assert.equal((partsLines[0].match(/SpinnerIcon \(Spinner\)/g) ?? []).length, 1);

  const r2 = validate({
    built: BUILT,
    index: INDEX,
    tokenValues: TOKENS,
    dimensionValues: DIMS,
    files: file(
      usages.filter((u) => u.component !== 'SpinnerIcon'),
      [],
      [],
      elements.filter((e) => e.component !== 'SpinnerIcon'),
    ),
  });
  const text2 = formatReport(r2).join('\n');
  assert.equal(
    text2.split('\n').some((l) => l.includes('parts:')),
    false,
  );
});

test('a dimension equal to a token in its category fails', () => {
  const r = validate({
    dimensionValues: DIMS,
    files: file([], [], [{ category: 'spacing', written: '16px', value: '16px', line: 1 }]),
  });
  const failures = r.failures.filter((f) => f.rule === 'token-exists-for-dimension');
  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0].tokens, ['space.4']);
});

test('the same value in another category is silent', () => {
  const r = validate({
    dimensionValues: DIMS,
    files: file([], [], [{ category: 'radius', written: '16px', value: '16px', line: 1 }]),
  });
  assert.equal(
    r.failures.some((f) => f.rule === 'token-exists-for-dimension'),
    false,
  );
});

test('a dimension value with no token is silent', () => {
  const r = validate({
    dimensionValues: DIMS,
    files: file([], [], [{ category: 'spacing', written: '13px', value: '13px', line: 1 }]),
  });
  assert.equal(
    r.failures.some((f) => f.rule === 'token-exists-for-dimension'),
    false,
  );
});

test('a skipped dimension rule is neither run nor inert', () => {
  const r = validate({
    dimensionValues: new Map(),
    skip: ['token-exists-for-dimension'],
    files: file([], [], [{ category: 'spacing', written: '16px', value: '16px', line: 1 }]),
  });
  assert.equal(
    r.failures.some((f) => f.rule === 'token-exists-for-dimension'),
    false,
  );
  assert.equal(
    r.failures.some((f) => f.rule === 'dimension-rule-inert'),
    false,
  );
});

test('an empty dimension value map is inert', () => {
  const r = validate({ dimensionValues: new Map(), files: file() });
  assert.ok(r.failures.some((f) => f.rule === 'dimension-rule-inert'));
});

test('nothing-scanned is silent when only a dimension was read', () => {
  const r = validate({
    dimensionValues: DIMS,
    files: file([], [], [{ category: 'spacing', written: '13px', value: '13px', line: 1 }]),
  });
  assert.equal(
    r.failures.some((f) => f.rule === 'nothing-scanned'),
    false,
  );
});

test('the report counts comparable colour tokens and the ones it skipped, by reason', () => {
  const r = validate({ tokenValues: TOKENS, colourSkipped: { unresolvable: 23, nonHex: 2 }, files: file() });
  const text = formatReport(r).join('\n');
  assert.match(text, /\n  colour:       1 token values comparable, 23 skipped as unresolvable, 2 skipped as non-hex\n/);
});

test('the report counts comparable tokens per category', () => {
  const r = validate({ dimensionValues: DIMS, files: file() });
  const text = formatReport(r).join('\n');
  assert.match(
    text,
    /dimensions:   1 token values comparable — spacing 1, radius 0, font-size 0, line-height 0, letter-spacing 0, font-weight 0/,
  );
});

// #123, measured: walked from libs/ or packages/, the gate read the token
// package's own generated css/tokens.css and failed every primitive in it, 41
// times in zygarden and 34 in throughline-ds.
const tree = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'adherence-tree-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
};
const TOKENS_JSON = JSON.stringify({ c: { $value: '#3B82F6', $type: 'color' } });
const SYSTEM = {
  'design-system.json': JSON.stringify({ components: { built: [] } }),
  'design-system/docs/index.json': JSON.stringify({ components: [] }),
};
const runCli = (root, system, tokens) => {
  try {
    const out = execFileSync(
      'node',
      [
        'scripts/validate-adherence.mjs',
        '--root', root,
        '--system', system,
        '--package', '@acme/ui',
        '--tokens', tokens,
        '--skip', 'unknown-variant-value',
      ],
      { encoding: 'utf8' },
    );
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: e.stdout ?? '' };
  }
};

test('tokenPackageDirs finds the package that owns a tokens file beneath the root', () => {
  const root = tree({ 'app/.keep': '', 'tokens/package.json': '{}', 'tokens/dtcg/tokens.json': TOKENS_JSON });
  assert.deepEqual(tokenPackageDirs([join(root, 'tokens/dtcg/tokens.json')], root), [
    realpathSync(join(root, 'tokens')),
  ]);
});

test('tokenPackageDirs keeps no package that is the root or contains it', () => {
  const repo = tree({ 'package.json': '{}', 'tokens.json': TOKENS_JSON, 'src/a.css': '' });
  assert.deepEqual(tokenPackageDirs([join(repo, 'tokens.json')], join(repo, 'src')), []);
  assert.deepEqual(tokenPackageDirs([join(repo, 'tokens.json')], repo), []);
});

test('the CLI skips the token package, flags the app, and says what it skipped', () => {
  const root = tree({
    'app/page.css': '.a { color: #3b82f6; }\n',
    'tokens/package.json': '{}',
    'tokens/tokens.json': TOKENS_JSON,
    'tokens/css/tokens.css': ':root { --c: #3b82f6; }\n',
  });
  const { code, out } = runCli(root, tree(SYSTEM), join(root, 'tokens/tokens.json'));
  assert.equal(code, 1, out);
  const flagged = out.split('\n').filter((l) => l.includes('[token-exists-for-literal]'));
  assert.equal(flagged.length, 1, out);
  assert.match(flagged[0], /app\/page\.css:1/);
  assert.match(out, /, 1 files\n/, 'the headline counts files scanned, not files walked');
  assert.ok(out.includes('colour:       1 token values comparable, 0 skipped as unresolvable, 0 skipped as non-hex'), out);
  assert.ok(out.includes(`excluded:     1 file(s) in ${join(root, 'tokens')}`), out);
});

test('the CLI excludes nothing when the token package contains the root', () => {
  const repo = tree({
    'package.json': '{}',
    'tokens.json': TOKENS_JSON,
    'src/a.css': '.a { color: #3b82f6; }\n',
  });
  const { code, out } = runCli(join(repo, 'src'), tree(SYSTEM), join(repo, 'tokens.json'));
  assert.equal(code, 1, out);
  assert.match(out, /\[token-exists-for-literal\] #3b82f6 at .*a\.css:1/);
  assert.equal(out.includes('excluded:'), false, out);
});

test('a token package with no scannable files prints no excluded line', () => {
  const root = tree({
    'app/page.css': '.a { color: #3b82f6; }\n',
    'tokens/package.json': '{}',
    'tokens/tokens.json': TOKENS_JSON,
  });
  const { code, out } = runCli(root, tree(SYSTEM), join(root, 'tokens/tokens.json'));
  assert.equal(code, 1, out);
  assert.match(out, /\[token-exists-for-literal\] #3b82f6 at .*page\.css:1/);
  assert.equal(out.includes('excluded:'), false, out);
});

test('a run that excluded everything still says what it excluded', () => {
  const r = validate({ files: [], walked: 0, excluded: [{ dir: 'x/tokens', files: 3 }] });
  const text = formatReport(r).join('\n');
  assert.match(text, /nothing-scanned/);
  assert.match(text, /excluded:     3 file\(s\) in x\/tokens/);
});

// #120: an unknown component fails once per tag, a part is reported and passes,
// and a .Member reference is left alone — read end to end through the CLI.
test('the CLI fails an unknown component once per tag, and reports a part', () => {
  const root = tree({
    'app/page.tsx':
      "import { Hero, CardTitle, Icons } from '@acme/ui';\n" +
      'export const P = () => (\n' +
      '  <div>\n' +
      '    <Hero />\n' +
      '    <CardTitle ref={r} style={s} className="t" />\n' +
      '    <Icons.Folder size={13} />\n' +
      '  </div>\n' +
      ');\n',
  });
  const system = tree({
    'design-system.json': JSON.stringify({ components: { built: ['Card'] } }),
    'design-system/docs/index.json': JSON.stringify({ components: [] }),
  });
  const tokensDir = tree({ 'tokens.json': TOKENS_JSON });
  const { code, out } = runCli(root, system, join(tokensDir, 'tokens.json'));
  assert.equal(code, 1, out);
  const unknownLines = out.split('\n').filter((l) => l.includes('[unknown-component]'));
  assert.equal(unknownLines.length, 1, out);
  assert.match(unknownLines[0], /<Hero> at .*page\.tsx:4/);
  assert.ok(out.includes('parts:        CardTitle (Card)'), out);
  assert.match(out, /— 2 component references, /);
  assert.equal(out.includes('<Icons>'), false, out);
});

// #39: dimension rules. dimensionCategory sorts the three real naming shapes.
test('dimensionCategory reads spacing from the path', () => {
  for (const path of ['space.4', 'spacing-primitive.space.16', 'spacing-semantic.inline.lg', 'space.inset.sm']) {
    assert.equal(dimensionCategory(path, 'dimension'), 'spacing', path);
  }
  assert.equal(dimensionCategory('space.4', undefined), 'spacing');
});

test('dimensionCategory reads radius from the path', () => {
  for (const path of ['radius.md', 'radius-semantic.card', 'border.radius.sm']) {
    assert.equal(dimensionCategory(path, 'dimension'), 'radius', path);
  }
});

test('dimensionCategory reads font-size from the path', () => {
  for (const path of ['font.size.200', 'typography-primitive.size.11', 'text.xs', 'typography.textStyle.displayLg.fontSize']) {
    assert.equal(dimensionCategory(path, 'dimension'), 'font-size', path);
  }
});

test('dimensionCategory reads line-height from the path', () => {
  assert.equal(dimensionCategory('text.xs.lineHeight', 'dimension'), 'line-height');
  assert.equal(dimensionCategory('leading.tight', 'dimension'), 'line-height');
  assert.equal(dimensionCategory('font.lineHeight.tight', 'number'), 'line-height');
});

test('dimensionCategory reads letter-spacing from the path', () => {
  assert.equal(dimensionCategory('typography.letterSpacing.tight', 'dimension'), 'letter-spacing');
  assert.equal(dimensionCategory('typography-primitive.tracking.h1', 'dimension'), 'letter-spacing');
});

test('dimensionCategory reads font-weight from its $type, not its path', () => {
  assert.equal(dimensionCategory('font.weight.bold', 'fontWeight'), 'font-weight');
  assert.equal(dimensionCategory('typography.fontWeight.regular', 'fontWeight'), 'font-weight');
});

test('dimensionCategory returns null for a path or $type outside the six categories', () => {
  for (const path of ['stroke.weight.thin', 'spacing-primitive.size.icon.lg', 'border-semantic.width.default', 'focus.ringWidth']) {
    assert.equal(dimensionCategory(path, 'dimension'), null, path);
  }
  assert.equal(dimensionCategory('opacity-primitive.opacity.40', 'number'), null);
  assert.equal(dimensionCategory('color.text.primary', 'color'), null);
  assert.equal(dimensionCategory('typography-primitive.family.display', 'string'), null);
});

test('canonicalDimension folds px and rem into one comparable value', () => {
  assert.equal(canonicalDimension(16, 'spacing', 'px'), '16px');
  assert.equal(canonicalDimension('16px', 'spacing', null), '16px');
  assert.equal(canonicalDimension('1rem', 'spacing', null), '16px');
  assert.equal(canonicalDimension('1.0rem', 'spacing', null), '16px');
  assert.equal(canonicalDimension('0.6875rem', 'font-size', null), '11px');
});

test('canonicalDimension treats a bare number as px only when told to', () => {
  assert.equal(canonicalDimension('16', 'spacing', null), null);
  assert.equal(canonicalDimension('16', 'spacing', 'px'), '16px');
});

test('canonicalDimension declines zero and percentages on either side', () => {
  assert.equal(canonicalDimension(0, 'spacing', 'px'), null);
  assert.equal(canonicalDimension('0px', 'spacing', null), null);
  assert.equal(canonicalDimension('-0px', 'spacing', null), null);
  assert.equal(canonicalDimension('50%', 'radius', null), null);
});

test('canonicalDimension keeps em standing alone', () => {
  assert.equal(canonicalDimension('-0.03em', 'letter-spacing', null), '-0.03em');
  assert.equal(canonicalDimension('0.025em', 'letter-spacing', null), '0.025em');
  assert.equal(canonicalDimension('-2', 'letter-spacing', 'px'), '-2px');
});

test('canonicalDimension rounds line-height to 3 places and compares unitless with unitless, px with px', () => {
  assert.equal(canonicalDimension(1.7000000476837158, 'line-height', 'px'), '1.7');
  assert.equal(canonicalDimension('1.5', 'line-height', null), '1.5');
  assert.equal(canonicalDimension('20px', 'line-height', null), '20px');
});

test('canonicalDimension accepts a whole-number font-weight only', () => {
  assert.equal(canonicalDimension(400, 'font-weight', 'px'), '400');
  assert.equal(canonicalDimension('400', 'font-weight', null), '400');
  assert.equal(canonicalDimension('bold', 'font-weight', null), null);
  assert.equal(canonicalDimension('400px', 'font-weight', null), null);
});

test('canonicalDimension declines a shape it cannot parse', () => {
  assert.equal(canonicalDimension({ value: 16, unit: 'px' }, 'spacing', 'px'), null);
  assert.equal(canonicalDimension('calc(1rem + 2px)', 'spacing', null), null);
  assert.equal(canonicalDimension('16vh', 'spacing', null), null);
});

test('buildDimensionValues pools resolved values per category, and drops zero', () => {
  const dims = buildDimensionValues([
    {
      space: { $type: 'dimension', 4: { $value: '16px' } },
      inset: { md: { $value: '{space.4}', $type: 'dimension' } },
      radius: { lg: { $value: 16, $type: 'dimension' } },
      font: { size: { base: { $value: '1rem', $type: 'dimension' } } },
      zero: { space: { 0: { $value: '0px', $type: 'dimension' } } },
    },
  ]);
  assert.deepEqual(dims.get('spacing').get('16px'), ['space.4', 'inset.md']);
  assert.deepEqual(dims.get('radius').get('16px'), ['radius.lg']);
  assert.deepEqual(dims.get('font-size').get('16px'), ['font.size.base']);
  assert.equal(dims.get('spacing').size, 1, 'the zero token is absent');
});

test('buildDimensionValues resolves an alias into another --tokens file', () => {
  const dims = buildDimensionValues([
    { radius: { 4: { $value: '16px', $type: 'dimension' } } },
    { radius: { card: { $value: '{radius.4}', $type: 'dimension' } } },
  ]);
  assert.deepEqual(dims.get('radius').get('16px'), ['radius.4', 'radius.card']);
});

test('buildDimensionValues does not throw on an unknown reference or a cycle', () => {
  assert.doesNotThrow(() =>
    buildDimensionValues([
      {
        a: { x: { $value: '{nope.missing}', $type: 'dimension' } },
        b: { y: { $value: '{c.z}', $type: 'dimension' } },
        c: { z: { $value: '{b.y}', $type: 'dimension' } },
      },
    ]),
  );
});

// Step 3: reading dimension literals from source. Every fixture is asserted on
// `.dimensions`, mapped to `[category, written, value, line]`.
const dims = (text, path) => extract(text, '@acme/ui', path).dimensions.map((d) => [d.category, d.written, d.value, d.line]);

test('extractDimensions reads a shorthand spacing declaration and a rem radius, and drops zero', () => {
  const text = '.a {\n  padding: 0 32px;\n  border-radius: 0.5rem;\n  margin: 0;\n}\n';
  assert.deepEqual(dims(text, 'a.scss'), [
    ['spacing', '32px', '32px', 2],
    ['radius', '0.5rem', '8px', 3],
  ]);
});

test('extractDimensions reads every longhand property, kebab-case, with its own line', () => {
  // Line 1 opens the rule; one declaration per line, 2 through 8; line 9 closes
  // it. Counted by hand.
  const text =
    '.a {\n' +
    '  padding-inline-start: 8px;\n' +
    '  border-top-left-radius: 4px;\n' +
    '  row-gap: 12px;\n' +
    '  line-height: 1.5;\n' +
    '  letter-spacing: -0.02em;\n' +
    '  font-weight: 600;\n' +
    '  font-size: 14px;\n' +
    '}\n';
  assert.deepEqual(dims(text, 'a.css'), [
    ['spacing', '8px', '8px', 2],
    ['radius', '4px', '4px', 3],
    ['spacing', '12px', '12px', 4],
    ['line-height', '1.5', '1.5', 5],
    ['letter-spacing', '-0.02em', '-0.02em', 6],
    ['font-weight', '600', '600', 7],
    ['font-size', '14px', '14px', 8],
  ]);
});

test('extractDimensions treats an unquoted number in a script file inline style as px', () => {
  const text =
    "<div style={{ marginTop: 16, fontSize: 13, lineHeight: 1.05, fontWeight: 500, padding: '8px 12px' }} />\n";
  assert.deepEqual(dims(text, 'a.tsx'), [
    ['spacing', '16', '16px', 1],
    ['font-size', '13', '13px', 1],
    ['line-height', '1.05', '1.05', 1],
    ['font-weight', '500', '500', 1],
    ['spacing', '8px', '8px', 1],
    ['spacing', '12px', '12px', 1],
  ]);
});

test('a bare number is ignored outside a script file, and inside one when quoted', () => {
  assert.deepEqual(dims('.a { margin-top: 16; }\n', 'a.scss'), []);
  assert.deepEqual(dims("const s = { padding: '16' };\n", 'a.tsx'), []);
});

test('extractDimensions reads Tailwind arbitrary values, including after a variant, and ignores a prefixed or non-dimension utility', () => {
  const text =
    '<div className="p-[16px] md:py-[6rem] -mt-[4px] rounded-[8px] text-[11px] text-[#fff] leading-[1.6] tracking-[-0.01em] font-[500] w-[16px] tw-p-[16px]" />\n';
  assert.deepEqual(dims(text, 'a.tsx'), [
    ['spacing', 'p-[16px]', '16px', 1],
    ['spacing', 'py-[6rem]', '96px', 1],
    ['spacing', '-mt-[4px]', '-4px', 1],
    ['radius', 'rounded-[8px]', '8px', 1],
    ['font-size', 'text-[11px]', '11px', 1],
    ['line-height', 'leading-[1.6]', '1.6', 1],
    ['letter-spacing', 'tracking-[-0.01em]', '-0.01em', 1],
    ['font-weight', 'font-[500]', '500', 1],
  ]);
});

test('a number inside calc(), clamp(), a var() fallback or max() is not read', () => {
  const text =
    '.a {\n  padding: calc(100% - 16px) 8px;\n  font-size: clamp(3rem, 11vw, 13rem);\n  margin: var(--space-4, 16px);\n  gap: max(8px, 1vw);\n}\n';
  assert.deepEqual(dims(text, 'a.scss'), [['spacing', '8px', '8px', 2]]);
});

test('a dimension inside a comment is not read', () => {
  const text = '/* padding: 16px */\n// margin: 8px\n.a { gap: 4px; }\n';
  assert.deepEqual(dims(text, 'a.scss'), [['spacing', '4px', '4px', 3]]);
});

test('a font-weight descriptor inside @font-face is not read, but one outside it is', () => {
  const text = "@font-face {\n  font-family: 'X';\n  font-weight: 400;\n}\n.a { font-weight: 400; }\n";
  assert.deepEqual(dims(text, 'a.css'), [['font-weight', '400', '400', 5]]);
});

test('a custom property or SCSS variable definition is not read — it declares a value, not a use', () => {
  const text = '.a { --gap: 16px; }\n$gap: 16px;\n';
  assert.deepEqual(dims(text, 'a.scss'), []);
});

test('the SRC fixture yields no dimension literal', () => {
  assert.deepEqual(extract(SRC, '@acme/ui').dimensions, []);
});

test('the CLI flags a dimension literal against a token, and counts it in the headline', () => {
  const root = tree({ 'app/page.scss': '.a { padding: 1rem; }\n' });
  const tokensDir = tree({
    'tokens.json': JSON.stringify({
      space: { 4: { $value: '16px', $type: 'dimension' } },
      c: { $value: '#3B82F6', $type: 'color' },
    }),
  });
  const { code, out } = runCli(root, tree(SYSTEM), join(tokensDir, 'tokens.json'));
  assert.equal(code, 1, out);
  assert.match(
    out,
    /\[token-exists-for-dimension\] spacing 1rem \(16px\) at .*page\.scss:1 — space\.4 resolves to exactly this value/,
  );
  assert.match(out, /0 colour literals, 1 dimension literals, 1 files/);
});
