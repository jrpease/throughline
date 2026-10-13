# Figma stop-condition checks (GENERATED)

> **GENERATED FILE — do not edit by hand.** Sources: `scripts/lib/component-states.mjs`
> (the state table), `scripts/lib/contrast.mjs` (the WCAG contrast maths),
> `scripts/lib/figma-checks.mjs` (the pure checker, unit-tested in Node) +
> `scripts/lib/figma-checks-read.figma.js` (the Figma reader). Regenerate with
> `node scripts/build-figma-checks.mjs`; CI gates freshness with `--check`.

The canonical `figma_execute` snippet for the checks that can stop a component
build: the COMPONENT_SET assertion against the full variant matrix, the state
matrix, the focus ring, and the focus ring's contrast against the surfaces it
sits on (WCAG 1.4.11, 3:1, in every mode). The script is the rule; do not re-write
these checks by hand.

## How to call it

1. Paste the snippet below into `figma_execute`, with the two slots filled above it:
   - `const EXPECT = { name, matrix, uiFramework, controlLayer, surfaces }` — `name` is the
     component's real name; `matrix` is `{ axis: [values] }` for every axis of the
     set; `uiFramework` is `project.uiFramework` from `design-system.json`;
     `controlLayer` is the layer that is the actual control in a wrapped control,
     copied from the architect's spec when it gives one (omit it otherwise);
     `surfaces` is the list of colour-variable names of the page surfaces the
     component sits on, copied from the architect's spec. Without it the
     focus-contrast check is skipped. Surfaces are looked up among the file's
     local variables only.
   - `const MODE = 'spec'` or `'built'`.
2. End the script with `return await runFigmaChecks(EXPECT, MODE);` and pass
   `timeout: 30000`.
3. Read the result, `{ pass, checks: [{ name, result, detail }] }`. `result` is
   `pass`, `fail` or `skip`; `pass` ignores skips. On `fail`, fix what each failing
   check's `detail` names and run it again, within the ~3-pass budget; after that,
   `BLOCKED` naming the failing checks' `detail`. A `focus-contrast` fail is
   the exception: return `BLOCKED` at once, naming its detail. A ring below 3:1 is
   fixed by a token value, which no rebuild changes, and a missing surface is a
   wrong name in the spec. Never edit a variable to make it pass.
4. `'spec'` reads no node and runs before the first write. `'built'` reads the
   COMPONENT_SET inside the frame named `WIP: <name>` on the current page and runs
   in the self-verify loop. It throws only if that frame is missing; a frame with
   no set, or a set Figma reports as conflicting, fails the structural check.

```js
const EXPECT = { name: 'Chip', matrix: { state: ['default', 'hover'] }, uiFramework: 'shadcn' };
const MODE = 'spec';
// … the generated snippet …
return await runFigmaChecks(EXPECT, MODE);
```

## The snippet

```js
// The archetype baseline for `state-incomplete` (`docs/specs/2026-09-12-verification-proof-bundle.md`,
// step 3). The prose in `references/figma-component-standards.md` (State handling) points at
// `references/state-baseline.md`, which is generated from this file.
//
// `default` is deliberately excluded from every baseline below: documenting the
// resting state is not documentation, and the Figma matrix requirement for it is
// the executor's, not this table's. Conditional states (`loading`, `error`,
// `success`) are deliberately excluded too — whether one applies to a given
// component is a design judgment, not something a baseline can assert. `selected`
// is not conditional for a choice control: a checkbox, radio, toggle, switch or
// chip that cannot be selected is not one.
//
// This table is the single source for both checks. `scripts/build-state-baseline.mjs`
// renders it into `references/state-baseline.md`, which the Figma executor reads;
// CI fails when that file is stale. MAINTENANCE: change this table, then run it.

// Defined here rather than imported from source-scan.mjs so this module has no
// imports and can be inlined into the Figma checks script. A test keeps the two
// copies in step.
const normalizeName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const ARCHETYPES = ['button', 'input', 'choice', 'card', 'modal', 'badge', 'other'];

const BASELINE_STATES = {
  button: ['hover', 'focus', 'active', 'disabled'],
  input: ['hover', 'focus', 'disabled'],
  choice: ['hover', 'focus', 'active', 'selected', 'disabled'],
  card: [],
  modal: [],
  badge: [],
  other: [],
};

const NAME_SYNONYMS = {
  button: 'button',
  input: 'input',
  textfield: 'input',
  textinput: 'input',
  checkbox: 'choice',
  radio: 'choice',
  toggle: 'choice',
  switch: 'choice',
  chip: 'choice',
  card: 'card',
  modal: 'modal',
  dialog: 'modal',
  badge: 'badge',
  tag: 'badge',
};

// Other names a recorded state goes by. shadcn and Radix call a checked checkbox
// `checked` and a pressed-in toggle `on`; both are `selected` here. `pressed` is
// not one: the standards use it for `active`.
const STATE_SYNONYMS = {
  checked: 'selected',
  on: 'selected',
};

function resolveArchetype(record) {
  if (ARCHETYPES.includes(record.archetype)) return record.archetype;
  const bySynonym = NAME_SYNONYMS[normalizeName(record.name)];
  return bySynonym ?? null;
}

function missingStates(record) {
  const archetype = resolveArchetype(record);
  if (archetype === null) return [];
  const baseline = BASELINE_STATES[archetype];
  if (baseline.length === 0) return [];
  const recordedKeys = new Set(
    Object.keys(record.states ?? {}).map((key) => {
      const name = normalizeName(key);
      return STATE_SYNONYMS[name] ?? name;
    }),
  );
  return baseline.filter((state) => !recordedKeys.has(normalizeName(state)));
}

// The WCAG contrast maths and the semantic colour pair table behind the
// `color-contrast` rule (`docs/specs/2026-09-12-token-contrast-validation.md`,
// step 1). Source of truth for the prose contract is
// `skills/token-builder/SKILL.md:250-265`.
//
// MAINTENANCE: a change to the semantic role set must change this table.

const AA_NORMAL_TEXT = 4.5;
// WCAG 1.4.11 non-text contrast, used by the Figma `focus-contrast` check.
const AA_NON_TEXT = 3;

// `text/disabled` is excluded: WCAG 1.4.3 exempts inactive user-interface
// components from the contrast minimum, and a disabled role is deliberately
// low-contrast — gating it would fail correct systems.
//
// `bg/subtle` and `bg/muted` are deliberately not paired in v1 (Open
// questions) — a system is free to use those roles for non-text surfaces, so
// pairing them risks the first false failures in the table.
//
// This table is text-on-surface only. Focus-ring contrast, the 3:1 non-text case
// (WCAG 1.4.11), is checked in the Figma checks (`figma-checks.mjs`,
// `focus-contrast`), where the build knows which ring sits on which surface.
//
// One threshold is applied to every pair because a colour role does not say
// what text size it is used at — `text/primary` is body copy as well as
// headings, so 4.5:1 is the binding requirement for it anyway.
const CONTRAST_PAIRS = [
  {
    fg: 'color.text.primary',
    bg: 'color.bg.default',
    threshold: AA_NORMAL_TEXT,
    why: 'the default reading pair; if this fails, body copy fails everywhere at once',
  },
  {
    fg: 'color.text.secondary',
    bg: 'color.bg.default',
    threshold: AA_NORMAL_TEXT,
    why: 'secondary text is still text, and still has to clear AA on the same surface primary does',
  },
  {
    fg: 'color.text.link',
    bg: 'color.bg.default',
    threshold: AA_NORMAL_TEXT,
    why: 'a link that fails contrast is a link nobody can find, regardless of colour meaning',
  },
  {
    fg: 'color.text.onEmphasis',
    bg: 'color.bg.emphasis',
    threshold: AA_NORMAL_TEXT,
    why: 'the role exists because it sits on the emphasis fill; that is the whole reason it is not `text/inverse`',
  },
  {
    fg: 'color.text.inverse',
    bg: 'color.bg.inverse',
    threshold: AA_NORMAL_TEXT,
    why: 'the inverse pair flips with the theme, and both sides have to keep clearing together',
  },
  {
    fg: 'color.status.success.text',
    bg: 'color.status.success.bg',
    threshold: AA_NORMAL_TEXT,
    why: 'a status text role exists to sit on that status\'s own background, not any other surface',
  },
  {
    fg: 'color.status.warning.text',
    bg: 'color.status.warning.bg',
    threshold: AA_NORMAL_TEXT,
    why: 'a status text role exists to sit on that status\'s own background, not any other surface',
  },
  {
    fg: 'color.status.danger.text',
    bg: 'color.status.danger.bg',
    threshold: AA_NORMAL_TEXT,
    why: 'a status text role exists to sit on that status\'s own background, not any other surface',
  },
];

// WCAG 2.x sRGB relative luminance over 0-255 channels.
function relativeLuminance({ r, g, b }) {
  const linearize = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

// Takes two `#rrggbb` strings (no alpha; the caller composites first) and
// returns the raw ratio, unrounded.
function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(parseHex(hexA));
  const lumB = relativeLuminance(parseHex(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

// `#rrggbb` or `#rrggbbaa` → `{ r, g, b, a }` with `a` in 0-1. `null` for
// anything else.
function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  const match = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(hex);
  if (!match) return null;
  const digits = match[1];
  const r = parseInt(digits.slice(0, 2), 16);
  const g = parseInt(digits.slice(2, 4), 16);
  const b = parseInt(digits.slice(4, 6), 16);
  const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

// The `#rrggbb` of `fg` drawn over `bg` with src-over (`out = fg*a + bg*(1-a)`).
function composite(fgHex, bgHex) {
  const fg = parseHex(fgHex);
  if (fg.a === 0) return bgHex;
  if (fg.a === 1) return fgHex.slice(0, 7);
  const bg = parseHex(bgHex);
  const mix = (fgChannel, bgChannel) => Math.round(fgChannel * fg.a + bgChannel * (1 - fg.a));
  const toHex = (value) => value.toString(16).padStart(2, '0');
  return `#${toHex(mix(fg.r, bg.r))}${toHex(mix(fg.g, bg.g))}${toHex(mix(fg.b, bg.b))}`;
}

// The Figma stop conditions as a pure checker: the COMPONENT_SET assertion against
// the full variant matrix, the state matrix, the focus ring, and the focus ring's
// contrast against the surfaces it sits on. ZERO imports,
// `export const`/`export function` only. This module is inlined, with
// component-states.mjs and contrast.mjs above it, into the generated Figma script
// (references/figma-checks.md) by build-figma-checks.mjs, so it must run in both
// Node and the Figma plugin sandbox.
//
// The state table is not imported. `withTable({ resolveArchetype, BASELINE_STATES,
// STATE_SYNONYMS, normalizeName, contrastRatio, composite, parseHex, AA_NON_TEXT })`
// takes it, the fold and the contrast maths from the caller and returns
// { checkSpec, checkBuilt }. In the generated script the caller passes the
// inlined component-states.mjs names; in tests it passes the module's own exports.
//
// Spec: docs/specs/2026-10-07-figma-checks-as-scripts.md
// Rules: references/figma-component-standards.md (State handling; audit items 8, 9)
//
// Spec (focus contrast): docs/specs/2026-10-13-focus-ring-contrast.md
//
// EXPECT: { name, matrix: { axis: [values] }, uiFramework, controlLayer?, surfaces? }
//   surfaces: colour-variable names of the page surfaces the component sits on.
//
// SNAPSHOT (what the reader returns for the COMPONENT_SET in `WIP: <name>`):
//   {
//     type,                               // the set's node type, 'COMPONENT_SET'
//     variantGroupProperties: { Axis: { values: [...] }, ... },   // only the keys are read
//     children: [ VARIANT, ... ],
//     colors: { [variableName]: { modes: { [modeName]: '#rrggbb' | '#rrggbbaa' | null }, defaultMode } },
//     missingSurfaces: [name, ...]          // EXPECT.surfaces names with no local colour variable
//   }
//   `colors` holds every colour variable read on focus variants and their
//   controlLayer, plus each EXPECT.surfaces name that was found.
//   VARIANT (every child):  { type, variantProperties: { Axis: 'Value' } }
//   A VARIANT whose state value folds to `focus` also carries FOCUS NODE fields
//   (below), plus `controlLayer` when EXPECT names one.
//   FOCUS NODE (the variant itself, and the controlLayer subtree):
//     {
//       effects: [{ type, visible, spread, colorVariable }],   // colorVariable: bound colour variable name or null
//       strokeAlign,                                           // 'INSIDE' | 'OUTSIDE' | 'CENTER'
//       strokeVariables: [name, ...],                          // names of variables bound to stroke colours
//       strokeWeightBound,                                     // boundVariables.strokeWeight is present
//       children: [{ layoutPositioning, strokeAlign, strokeVariables, strokeWeightBound }]   // direct children only
//     }
//   VARIANT.controlLayer: a FOCUS NODE, or null when EXPECT names a layer the variant does not have.
//   Variable names are resolved by the reader and only for focus variants and their controlLayer.
//
// RESULT: { pass, checks: [{ name, result: 'pass' | 'fail' | 'skip', detail }] }
//   built mode returns four checks: structural-read-back, state-baseline,
//   focus-indicator, focus-contrast.
//   `pass` ignores skips. A failed assertion is data; nothing here throws.

// The in-scope `uiFramework` values and the focus recipe each one uses. An absent or
// null `uiFramework` uses the `ring` recipe. Any other value is out of scope.
//   ring    - DROP_SHADOW effect with a focus-bound colour and spread > 0, or an
//             ABSOLUTE ring child with an OUTSIDE stroke bound to a focus variable
//   mui     - an input: the control's own stroke and its weight are bound; any other
//             component uses the ring recipe
//   outline - the control or a direct child carries an OUTSIDE stroke bound to a
//             focus variable
const FRAMEWORKS = {
  shadcn: { recipe: 'ring' },
  tailwind: { recipe: 'ring' },
  mui: { recipe: 'mui' },
  'vanilla-css': { recipe: 'outline' },
  vanilla: { recipe: 'outline' },
};

function frameworkRecipe(uiFramework) {
  if (uiFramework === undefined || uiFramework === null) return 'ring';
  return Object.prototype.hasOwnProperty.call(FRAMEWORKS, uiFramework)
    ? FRAMEWORKS[uiFramework].recipe
    : null;
}

// A focus variable is any variable whose name has `focus` as a whole word: in a
// `/` segment of its own, or inside one split on `-`, `_`, spaces or a camelCase
// boundary. `border/focus`, `color/focus/ring`, `color/focusRing` and
// `interaction/border-primary-focus` count; `color/bg/focused` and a raw colour
// (null) do not.
function isFocusVariable(name) {
  if (typeof name !== 'string') return false;
  const words = name
    .split('/')
    .flatMap((seg) => seg.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_-]+/));
  return words.some((word) => word.toLowerCase() === 'focus');
}

// A choice control may carry selection on its own axis instead of as a `selected`
// value on the state axis: the sample's Checkbox has `checked: false | true |
// indeterminate`. An axis with one of these names satisfies `selected`.
const SELECTION_AXES = ['selected', 'checked', 'on'];

const hasFocusStroke = (node) => (node.strokeVariables ?? []).some(isFocusVariable);

function lacksRing(target, recipe, isInput) {
  const children = target.children ?? [];
  if (recipe === 'mui' && isInput) {
    const lacks = [];
    if (!hasFocusStroke(target)) lacks.push('a stroke bound to a focus variable');
    if (!target.strokeWeightBound) lacks.push('a stroke weight bound to a variable');
    return lacks;
  }
  if (recipe === 'outline') {
    const outside = (n) => n.strokeAlign === 'OUTSIDE' && hasFocusStroke(n);
    return outside(target) || children.some(outside)
      ? []
      : ['an OUTSIDE stroke bound to a focus variable on the control or a direct child'];
  }
  const shadow = (target.effects ?? []).some(
    (e) => e.type === 'DROP_SHADOW' && e.visible !== false && e.spread > 0 && isFocusVariable(e.colorVariable),
  );
  const ringChild = children.some(
    (c) => c.layoutPositioning === 'ABSOLUTE' && c.strokeAlign === 'OUTSIDE' && hasFocusStroke(c),
  );
  return shadow || ringChild
    ? []
    : [
        'a DROP_SHADOW with spread > 0 and a colour bound to a focus variable, or an ABSOLUTE ring child with an OUTSIDE stroke bound to a focus variable',
      ];
}

// The focus-variable names that make up the ring `lacksRing` accepted, for the
// contrast check. Same recipes, same tests.
function ringVariables(target, recipe, isInput) {
  const children = target.children ?? [];
  const focusStrokes = (node) => (node.strokeVariables ?? []).filter(isFocusVariable);
  if (recipe === 'mui' && isInput) return focusStrokes(target);
  if (recipe === 'outline') {
    return [target, ...children].filter((n) => n.strokeAlign === 'OUTSIDE').flatMap(focusStrokes);
  }
  const shadows = (target.effects ?? [])
    .filter((e) => e.type === 'DROP_SHADOW' && e.visible !== false && e.spread > 0 && isFocusVariable(e.colorVariable))
    .map((e) => e.colorVariable);
  const ringChildren = children
    .filter((c) => c.layoutPositioning === 'ABSOLUTE' && c.strokeAlign === 'OUTSIDE')
    .flatMap(focusStrokes);
  return [...shadows, ...ringChildren];
}

function withTable({
  resolveArchetype,
  BASELINE_STATES,
  STATE_SYNONYMS,
  normalizeName,
  contrastRatio,
  composite,
  parseHex,
  AA_NON_TEXT,
}) {
  const fold = normalizeName;
  const foldState = (value) => {
    const name = fold(value);
    return STATE_SYNONYMS[name] ?? name;
  };
  const result = (checks) => ({ pass: checks.every((c) => c.result !== 'fail'), checks });
  const label = (props) =>
    Object.entries(props ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');

  // Combinations as comparable strings, axes sorted by folded name.
  const comboKey = (props) =>
    Object.entries(props ?? {})
      .map(([k, v]) => [fold(k), fold(v)])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');

  const isFocusVariant = (child) =>
    child.type === 'COMPONENT' &&
    Object.entries(child.variantProperties ?? {}).some(([k, v]) => fold(k) === 'state' && fold(v) === 'focus');

  function crossProduct(matrix) {
    let combos = [{}];
    for (const [axis, values] of Object.entries(matrix ?? {})) {
      combos = combos.flatMap((combo) => values.map((value) => ({ ...combo, [axis]: value })));
    }
    return combos;
  }

  function structural(snapshot, expect) {
    const name = 'structural-read-back';
    const problems = [];
    if (snapshot.type !== 'COMPONENT_SET') problems.push(`the node is ${snapshot.type}, not a COMPONENT_SET`);
    const children = snapshot.children ?? [];
    const notComponents = children.filter((c) => c.type !== 'COMPONENT');
    if (notComponents.length > 0) {
      problems.push(`${notComponents.length} of ${children.length} children are not COMPONENTs (${[...new Set(notComponents.map((c) => c.type))].join(', ')})`);
    }

    const builtAxes = Object.keys(snapshot.variantGroupProperties ?? {}).map(fold).sort();
    const wantAxes = Object.keys(expect.matrix ?? {}).map(fold).sort();
    const missingAxes = wantAxes.filter((a) => !builtAxes.includes(a));
    const extraAxes = builtAxes.filter((a) => !wantAxes.includes(a));
    if (missingAxes.length) problems.push(`missing axes: ${missingAxes.join(', ')}`);
    if (extraAxes.length) problems.push(`extra axes: ${extraAxes.join(', ')}`);

    const want = new Map(crossProduct(expect.matrix).map((combo) => [comboKey(combo), label(combo)]));
    const seen = new Map();
    const duplicates = [];
    for (const child of children) {
      const key = comboKey(child.variantProperties);
      if (seen.has(key)) duplicates.push(label(child.variantProperties));
      else seen.set(key, label(child.variantProperties));
    }
    const missing = [...want].filter(([key]) => !seen.has(key)).map(([, text]) => text);
    const extra = [...seen].filter(([key]) => !want.has(key)).map(([, text]) => text);
    if (missing.length) problems.push(`missing combinations: ${missing.join(' | ')}`);
    if (extra.length) problems.push(`extra combinations: ${extra.join(' | ')}`);
    if (duplicates.length) problems.push(`duplicate combinations: ${duplicates.join(' | ')}`);

    return problems.length
      ? { name, result: 'fail', detail: problems.join('; ') }
      : { name, result: 'pass', detail: `COMPONENT_SET with ${children.length} COMPONENT variants matching the matrix` };
  }

  // `entries` are [axisName, value] pairs; only the `state` axis is read.
  function stateBaseline(expect, entries) {
    const name = 'state-baseline';
    const archetype = resolveArchetype({ name: expect.name });
    if (archetype === null) {
      return { name, result: 'skip', detail: `"${expect.name}" is not a name in the state table` };
    }
    const baseline = BASELINE_STATES[archetype];
    if (baseline.length === 0) {
      return { name, result: 'skip', detail: `"${expect.name}" is a ${archetype}, which owes no states beyond default` };
    }
    const present = new Set(entries.filter(([axis]) => fold(axis) === 'state').map(([, value]) => foldState(value)));
    if (entries.some(([axis]) => SELECTION_AXES.includes(fold(axis)))) present.add('selected');
    const required = ['default', ...baseline];
    const missing = required.filter((s) => !present.has(foldState(s)));
    return missing.length
      ? { name, result: 'fail', detail: `the state axis is missing: ${missing.join(', ')}` }
      : { name, result: 'pass', detail: `the state axis has default and every ${archetype} state` };
  }

  function focusIndicator(snapshot, expect) {
    const name = 'focus-indicator';
    const archetype = resolveArchetype({ name: expect.name });
    if (archetype === null) {
      return { name, result: 'skip', detail: `"${expect.name}" is not a name in the state table` };
    }
    if (BASELINE_STATES[archetype].length === 0) {
      return { name, result: 'skip', detail: `"${expect.name}" is a ${archetype}, which owes no states, so no focus ring is checked` };
    }
    const recipe = frameworkRecipe(expect.uiFramework);
    if (recipe === null) {
      return { name, result: 'skip', detail: `uiFramework "${expect.uiFramework}" is out of scope for the focus check` };
    }
    const variants = (snapshot.children ?? []).filter(isFocusVariant);
    if (variants.length === 0) {
      return { name, result: 'fail', detail: 'no COMPONENT variant has a state of focus, so no ring can be read; the state check stops on this' };
    }
    const misses = [];
    for (const variant of variants) {
      let target = variant;
      if (expect.controlLayer !== undefined && expect.controlLayer !== null) {
        target = variant.controlLayer;
        if (!target) {
          misses.push(`${label(variant.variantProperties)}: no layer named "${expect.controlLayer}"`);
          continue;
        }
      }
      const lacks = lacksRing(target, recipe, archetype === 'input');
      if (lacks.length) misses.push(`${label(variant.variantProperties)}: lacks ${lacks.join(' and ')}`);
    }
    return misses.length
      ? { name, result: 'fail', detail: misses.join('; ') }
      : { name, result: 'pass', detail: `all ${variants.length} focus variants carry a ${recipe}-recipe focus indicator` };
  }

  // WCAG 1.4.11: each ring colour against each named surface, in every mode either
  // side has. Runs only on a ring focusIndicator accepted.
  function focusContrast(snapshot, expect, indicator) {
    const name = 'focus-contrast';
    if (indicator.result !== 'pass') {
      return { name, result: 'skip', detail: 'focus-indicator did not pass, so there is no ring to measure' };
    }
    const surfaces = expect.surfaces ?? [];
    if (surfaces.length === 0) {
      return {
        name,
        result: 'skip',
        detail: 'no surfaces named; the architect names the colour variables of the surfaces the component sits on',
      };
    }
    const missing = snapshot.missingSurfaces ?? [];
    if (missing.length) {
      return { name, result: 'fail', detail: `no local colour variable named: ${missing.join(', ')}` };
    }

    const recipe = frameworkRecipe(expect.uiFramework);
    const isInput = resolveArchetype({ name: expect.name }) === 'input';
    const hasLayer = expect.controlLayer !== undefined && expect.controlLayer !== null;
    const rings = new Set();
    for (const variant of (snapshot.children ?? []).filter(isFocusVariant)) {
      const target = hasLayer ? variant.controlLayer : variant;
      if (target) for (const ring of ringVariables(target, recipe, isInput)) rings.add(ring);
    }

    const colors = snapshot.colors ?? {};
    // A mode's value: the same-named mode after the fold, else the default.
    const valueIn = (entry, foldedMode) => {
      const modes = entry?.modes ?? {};
      const hit = Object.keys(modes).find((m) => fold(m) === foldedMode);
      if (hit !== undefined) return modes[hit];
      return entry?.defaultMode !== undefined ? modes[entry.defaultMode] ?? null : null;
    };
    const skipped = { unresolved: 0, translucentSurface: 0 };
    const failures = [];
    const modesSeen = new Set();
    let pairs = 0;
    for (const ring of [...rings].sort()) {
      for (const surface of [...surfaces].sort()) {
        const ringEntry = colors[ring];
        const surfaceEntry = colors[surface];
        // Modes come from the side(s) with more than one: a single-mode collection
        // reads the same value in every mode, so its own mode name adds nothing.
        // When both are single-mode, the ring's one mode is the only comparison.
        const entries = [ringEntry, surfaceEntry];
        const multi = entries.filter((e) => Object.keys(e?.modes ?? {}).length > 1);
        const single = Object.keys(ringEntry?.modes ?? {}).length ? [ringEntry] : [surfaceEntry];
        const modeNames = new Map();
        for (const entry of multi.length ? multi : single) {
          for (const m of Object.keys(entry?.modes ?? {})) if (!modeNames.has(fold(m))) modeNames.set(fold(m), m);
        }
        if (modeNames.size === 0) {
          skipped.unresolved += 1;
          continue;
        }
        for (const [foldedMode, mode] of [...modeNames].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
          const ringHex = valueIn(ringEntry, foldedMode);
          const surfaceHex = valueIn(surfaceEntry, foldedMode);
          const surfaceParsed = parseHex(surfaceHex);
          if (parseHex(ringHex) === null || surfaceParsed === null) {
            skipped.unresolved += 1;
            continue;
          }
          if (surfaceParsed.a < 1) {
            skipped.translucentSurface += 1;
            continue;
          }
          const surfaceOpaque = surfaceHex.slice(0, 7);
          const ratio = contrastRatio(composite(ringHex, surfaceOpaque), surfaceOpaque);
          pairs += 1;
          modesSeen.add(foldedMode);
          if (ratio < AA_NON_TEXT) {
            const shown = (Math.floor(ratio * 100) / 100).toFixed(2);
            failures.push(`${ring} on ${surface} in ${mode}: ${shown}:1, needs ${AA_NON_TEXT}:1`);
          }
        }
      }
    }
    const skipNote = [
      skipped.unresolved && `${skipped.unresolved} skipped as unresolved or not a colour`,
      skipped.translucentSurface && `${skipped.translucentSurface} skipped for a translucent surface`,
    ].filter(Boolean);
    if (failures.length) return { name, result: 'fail', detail: failures.join('; ') };
    if (pairs === 0) {
      return { name, result: 'skip', detail: `no ring/surface pair could be compared: ${skipNote.join(', ') || 'no ring colour found'}` };
    }
    const passed = `${pairs} ring/surface pair(s) clear ${AA_NON_TEXT}:1 across ${modesSeen.size} mode(s)`;
    return { name, result: 'pass', detail: skipNote.length ? `${passed}; ${skipNote.join(', ')}` : passed };
  }

  // Before anything is written: the matrix the spec asks for against the state table.
  function checkSpec(expect) {
    const entries = Object.entries(expect.matrix ?? {}).flatMap(([axis, values]) => values.map((v) => [axis, v]));
    return result([stateBaseline(expect, entries)]);
  }

  // After the build: the node as read.
  function checkBuilt(snapshot, expect) {
    const entries = (snapshot.children ?? []).flatMap((c) => Object.entries(c.variantProperties ?? {}));
    const indicator = focusIndicator(snapshot, expect);
    return result([
      structural(snapshot, expect),
      stateBaseline(expect, entries),
      indicator,
      focusContrast(snapshot, expect, indicator),
    ]);
  }

  return { checkSpec, checkBuilt };
}

const { checkSpec, checkBuilt } = withTable({ resolveArchetype, BASELINE_STATES, STATE_SYNONYMS, normalizeName, contrastRatio, composite, parseHex, AA_NON_TEXT });

// Figma plugin-API reader for the stop-condition checks. This file is NOT a
// Node module — build-figma-checks.mjs concatenates it after the inlined
// component-states.mjs, contrast.mjs and figma-checks.mjs into
// references/figma-checks.md, and
// the result runs inside figma_execute (dynamic-page mode). Constraints honored
// here (see references/figma-scripting.md): async getters only, variable names
// and per-mode colour values resolved with getVariableByIdAsync and only for
// focus variants and their controlLayer, plus the EXPECT.surfaces names, which
// are looked up among the file's LOCAL colour variables only (a surface from a
// published library reads as missing). Untested in Node, like the doc-card
// renderer; the pure checker it feeds is unit-tested.
//
// In-scope globals when assembled: normalizeName (inlined
// component-states.mjs), checkSpec, checkBuilt (bound from withTable) and the
// caller-filled slots EXPECT and MODE (passed to runFigmaChecks). The snapshot
// shape is documented at the top of scripts/lib/figma-checks.mjs.

// Colour variables read on focus nodes, by name, for the contrast check.
const readVariables = new Map();

async function variableName(alias) {
  if (!alias || !alias.id) return null;
  const variable = await figma.variables.getVariableByIdAsync(alias.id);
  if (!variable) return null;
  if (variable.resolvedType === 'COLOR') readVariables.set(variable.name, variable);
  return variable.name;
}

function colorHex(value) {
  if (!value || typeof value !== 'object' || !('r' in value)) return null;
  const byte = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  const alpha = value.a === undefined ? 1 : value.a;
  return `#${byte(value.r)}${byte(value.g)}${byte(value.b)}${alpha < 1 ? byte(alpha) : ''}`;
}

// The value of `variable` in the mode named `modeName` (after the fold), else
// its collection's default mode, following aliases up to 10 hops.
async function resolveColor(variable, modeName, hops) {
  if (!variable || hops > 10) return null;
  const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  if (!collection) return null;
  const mode = collection.modes.find((m) => normalizeName(m.name) === normalizeName(modeName));
  const value = variable.valuesByMode[mode ? mode.modeId : collection.defaultModeId];
  if (value && value.type === 'VARIABLE_ALIAS') {
    return resolveColor(await figma.variables.getVariableByIdAsync(value.id), modeName, hops + 1);
  }
  return colorHex(value);
}

// { modes: { [modeName]: hex | null }, defaultMode } over the variable's own collection.
async function variableColors(variable) {
  const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  if (!collection) return { modes: {}, defaultMode: undefined };
  const modes = {};
  for (const mode of collection.modes) modes[mode.name] = await resolveColor(variable, mode.name, 0);
  const fallback = collection.modes.find((m) => m.modeId === collection.defaultModeId);
  return { modes, defaultMode: fallback ? fallback.name : undefined };
}

// The fields the focus check reads from a variant, a control layer or a direct child.
async function readFocusNode(node, { withEffects }) {
  const strokes = (node.boundVariables && node.boundVariables.strokes) || [];
  const strokeVariables = [];
  for (const alias of strokes) {
    const name = await variableName(alias);
    if (name !== null) strokeVariables.push(name);
  }
  const bound = node.boundVariables || {};
  const out = {
    strokeAlign: node.strokeAlign,
    strokeVariables,
    strokeWeightBound: Boolean(
      bound.strokeWeight || bound.strokeTopWeight || bound.strokeRightWeight || bound.strokeBottomWeight || bound.strokeLeftWeight,
    ),
  };
  if (withEffects) {
    out.effects = [];
    for (const effect of node.effects || []) {
      const colorAlias = effect.boundVariables && effect.boundVariables.color;
      out.effects.push({
        type: effect.type,
        visible: effect.visible,
        spread: effect.spread,
        colorVariable: await variableName(colorAlias),
      });
    }
  } else {
    out.layoutPositioning = node.layoutPositioning;
  }
  return out;
}

async function readFocusTree(node) {
  const focus = await readFocusNode(node, { withEffects: true });
  focus.children = [];
  for (const child of node.children || []) {
    focus.children.push(await readFocusNode(child, { withEffects: false }));
  }
  return focus;
}

// The getter throws when Figma flags the set as conflicting (duplicate variant
// combinations). Fall back to the axes the children declare, so the structural
// check names the duplicates instead of the read throwing.
function groupProperties(set) {
  try {
    return set.variantGroupProperties;
  } catch {
    const axes = {};
    for (const child of set.children) {
      for (const axis of Object.keys(child.variantProperties || {})) axes[axis] = { values: [] };
    }
    return axes;
  }
}

async function readComponentSet(expect) {
  readVariables.clear();
  await figma.currentPage.loadAsync();
  const frameName = `WIP: ${expect.name}`;
  const frame = figma.currentPage.findOne((n) => n.name === frameName);
  if (!frame) throw new Error(`no node named "${frameName}" on the current page`);
  const set = frame.type === 'COMPONENT_SET' ? frame : (frame.children || []).find((c) => c.type === 'COMPONENT_SET');
  // A frame holding plain FRAMEs where the set should be is a failed assertion,
  // not a missing target: report what is there so the structural check names it.
  if (!set) {
    const first = (frame.children || [])[0];
    return { type: first ? first.type : 'NONE', variantGroupProperties: {}, children: [] };
  }

  const isFocusState = (props) =>
    Object.entries(props || {}).some(([k, v]) => {
      const state = normalizeName(v);
      return normalizeName(k) === 'state' && state === 'focus';
    });

  const children = [];
  for (const child of set.children) {
    const read = { type: child.type, variantProperties: child.variantProperties };
    if (child.type === 'COMPONENT' && isFocusState(child.variantProperties)) {
      Object.assign(read, await readFocusTree(child));
      if (expect.controlLayer !== undefined && expect.controlLayer !== null) {
        const layer = child.findOne((n) => n.name === expect.controlLayer);
        read.controlLayer = layer ? await readFocusTree(layer) : null;
      }
    }
    children.push(read);
  }
  const colors = {};
  for (const [name, variable] of readVariables) colors[name] = await variableColors(variable);
  const missingSurfaces = [];
  const surfaces = expect.surfaces || [];
  if (surfaces.length) {
    const local = await figma.variables.getLocalVariablesAsync('COLOR');
    for (const name of surfaces) {
      const variable = local.find((v) => v.name === name);
      if (variable) colors[name] = await variableColors(variable);
      else missingSurfaces.push(name);
    }
  }
  return {
    type: set.type,
    variantGroupProperties: groupProperties(set),
    children,
    colors,
    missingSurfaces,
  };
}

async function runFigmaChecks(EXPECT, MODE) {
  if (MODE === 'spec') return checkSpec(EXPECT);
  if (MODE === 'built') return checkBuilt(await readComponentSet(EXPECT), EXPECT);
  throw new Error(`MODE must be 'spec' or 'built', got ${JSON.stringify(MODE)}`);
}
```
