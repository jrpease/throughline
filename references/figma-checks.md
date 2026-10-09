# Figma stop-condition checks (GENERATED)

> **GENERATED FILE — do not edit by hand.** Sources: `scripts/lib/component-states.mjs`
> (the state table), `scripts/lib/figma-checks.mjs` (the pure checker, unit-tested in
> Node) + `scripts/lib/figma-checks-read.figma.js` (the Figma reader). Regenerate with
> `node scripts/build-figma-checks.mjs`; CI gates freshness with `--check`.

The canonical `figma_execute` snippet for the checks that can stop a component
build: the COMPONENT_SET assertion against the full variant matrix, the state
matrix, and the focus ring. The script is the rule; do not re-write these checks
by hand.

## How to call it

1. Paste the snippet below into `figma_execute`, with the two slots filled above it:
   - `const EXPECT = { name, matrix, uiFramework, controlLayer }` — `name` is the
     component's real name; `matrix` is `{ axis: [values] }` for every axis of the
     set; `uiFramework` is `project.uiFramework` from `design-system.json`;
     `controlLayer` is the layer that is the actual control in a wrapped control,
     copied from the architect's spec when it gives one (omit it otherwise).
   - `const MODE = 'spec'` or `'built'`.
2. End the script with `return await runFigmaChecks(EXPECT, MODE);` and pass
   `timeout: 30000`.
3. Read the result, `{ pass, checks: [{ name, result, detail }] }`. `result` is
   `pass`, `fail` or `skip`; `pass` ignores skips. On `fail`, fix what each failing
   check's `detail` names and run it again, within the ~3-pass budget; after that,
   `BLOCKED` naming the failing checks' `detail`.
4. `'spec'` reads no node and runs before the first write. `'built'` reads the
   COMPONENT_SET inside the frame named `WIP: <name>` on the current page (it
   throws if that frame or set is missing) and runs in the self-verify loop.

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

// The Figma stop conditions as a pure checker: the COMPONENT_SET assertion against
// the full variant matrix, the state matrix, and the focus ring. ZERO imports,
// `export const`/`export function` only. This module is inlined, with
// component-states.mjs above it, into the generated Figma script
// (references/figma-checks.md) by build-figma-checks.mjs, so it must run in both
// Node and the Figma plugin sandbox.
//
// The state table is not imported. `withTable({ resolveArchetype, BASELINE_STATES,
// STATE_SYNONYMS, normalizeName })` takes it, and the fold, from the caller and
// returns { checkSpec, checkBuilt }. In the generated script the caller passes the
// inlined component-states.mjs names; in tests it passes the module's own exports.
//
// Spec: docs/specs/2026-10-07-figma-checks-as-scripts.md
// Rules: references/figma-component-standards.md (State handling; audit items 8, 9)
//
// EXPECT: { name, matrix: { axis: [values] }, uiFramework, controlLayer? }
//
// SNAPSHOT (what the reader returns for the COMPONENT_SET in `WIP: <name>`):
//   {
//     type,                               // the set's node type, 'COMPONENT_SET'
//     variantGroupProperties: { Axis: { values: [...] }, ... },   // only the keys are read
//     children: [ VARIANT, ... ]
//   }
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

// A focus variable is any variable whose name has a `focus` segment:
// `border/focus`, `color/border/focus` and `color/focus/ring` count; `focusRing` and
// a raw colour (null) do not.
function isFocusVariable(name) {
  return typeof name === 'string' && name.split('/').some((seg) => seg.trim().toLowerCase() === 'focus');
}

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

function withTable({ resolveArchetype, BASELINE_STATES, STATE_SYNONYMS, normalizeName }) {
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
    const required = ['default', ...baseline];
    const missing = required.filter((s) => !present.has(foldState(s)));
    return missing.length
      ? { name, result: 'fail', detail: `the state axis is missing: ${missing.join(', ')}` }
      : { name, result: 'pass', detail: `the state axis has default and every ${archetype} state` };
  }

  function focusIndicator(snapshot, expect) {
    const name = 'focus-indicator';
    const archetype = resolveArchetype({ name: expect.name });
    if (archetype === null || BASELINE_STATES[archetype].length === 0) {
      return { name, result: 'skip', detail: `"${expect.name}" is not a name in the state table` };
    }
    const recipe = frameworkRecipe(expect.uiFramework);
    if (recipe === null) {
      return { name, result: 'skip', detail: `uiFramework "${expect.uiFramework}" is out of scope for the focus check` };
    }
    const isFocusVariant = (child) =>
      child.type === 'COMPONENT' &&
      Object.entries(child.variantProperties ?? {}).some(([k, v]) => fold(k) === 'state' && fold(v) === 'focus');
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
      : { name, result: 'pass', detail: `all ${variants.length} focus variants carry the ${recipe} ring` };
  }

  // Before anything is written: the matrix the spec asks for against the state table.
  function checkSpec(expect) {
    const entries = Object.entries(expect.matrix ?? {}).flatMap(([axis, values]) => values.map((v) => [axis, v]));
    return result([stateBaseline(expect, entries)]);
  }

  // After the build: the node as read.
  function checkBuilt(snapshot, expect) {
    const entries = (snapshot.children ?? []).flatMap((c) => Object.entries(c.variantProperties ?? {}));
    return result([structural(snapshot, expect), stateBaseline(expect, entries), focusIndicator(snapshot, expect)]);
  }

  return { checkSpec, checkBuilt };
}

const { checkSpec, checkBuilt } = withTable({ resolveArchetype, BASELINE_STATES, STATE_SYNONYMS, normalizeName });

// Figma plugin-API reader for the stop-condition checks. This file is NOT a
// Node module — build-figma-checks.mjs concatenates it after the inlined
// component-states.mjs and figma-checks.mjs into references/figma-checks.md, and
// the result runs inside figma_execute (dynamic-page mode). Constraints honored
// here (see references/figma-scripting.md): async getters only, variable names
// resolved with getVariableByIdAsync and only for focus variants and their
// controlLayer. Untested in Node, like the doc-card renderer; the pure checker
// it feeds is unit-tested.
//
// In-scope globals when assembled: normalizeName, STATE_SYNONYMS (inlined
// component-states.mjs), checkSpec, checkBuilt (bound from withTable) and the
// caller-filled slots EXPECT and MODE (passed to runFigmaChecks). The snapshot
// shape is documented at the top of scripts/lib/figma-checks.mjs.

async function variableName(alias) {
  if (!alias || !alias.id) return null;
  const variable = await figma.variables.getVariableByIdAsync(alias.id);
  return variable ? variable.name : null;
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

async function readComponentSet(expect) {
  await figma.currentPage.loadAsync();
  const frameName = `WIP: ${expect.name}`;
  const frame = figma.currentPage.findOne((n) => n.name === frameName);
  if (!frame) throw new Error(`no node named "${frameName}" on the current page`);
  const set = (frame.children || []).find((c) => c.type === 'COMPONENT_SET');
  if (!set) throw new Error(`"${frameName}" has no COMPONENT_SET child`);

  const isFocusState = (props) =>
    Object.entries(props || {}).some(([k, v]) => {
      const state = normalizeName(v);
      return normalizeName(k) === 'state' && (STATE_SYNONYMS[state] ?? state) === 'focus';
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
  return {
    type: set.type,
    variantGroupProperties: set.variantGroupProperties,
    children,
  };
}

async function runFigmaChecks(EXPECT, MODE) {
  if (MODE === 'spec') return checkSpec(EXPECT);
  if (MODE === 'built') return checkBuilt(await readComponentSet(EXPECT), EXPECT);
  throw new Error(`MODE must be 'spec' or 'built', got ${JSON.stringify(MODE)}`);
}
```
