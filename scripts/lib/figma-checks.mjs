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
export const FRAMEWORKS = {
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

export function withTable({ resolveArchetype, BASELINE_STATES, STATE_SYNONYMS, normalizeName }) {
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
      : { name, result: 'pass', detail: `all ${variants.length} focus variants carry a ${recipe}-recipe focus indicator` };
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
