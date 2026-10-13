# Figma screen adherence gate (GENERATED)

> **GENERATED FILE — do not edit by hand.** Sources: `scripts/lib/figma-adherence.mjs`
> (the pure checker, unit-tested in Node), `scripts/lib/figma-variables-read.figma.js`
> (colour-variable resolution) + `scripts/lib/figma-adherence-read.figma.js` (the
> screen reader). Regenerate with `node scripts/build-figma-checks.mjs`; CI gates
> freshness with `--check`.

The canonical `figma_execute` snippet that checks Figma screens against the design
system, read-only. It fails a frame detached from a component, a raw colour that a
colour variable has (opacity included), and a raw gap, padding or corner radius
that a spacing or radius variable has, naming the variable to bind. A number
variable counts by its scope (`GAP`, `CORNER_RADIUS`), or, left at `ALL_SCOPES`,
by a name that says spacing or radius. A raw value no variable has is an
advisory, not a failure. A rule that had nothing to compare against fails by name
(`nothing-scanned`, `colour-rule-inert`, `dimension-rule-inert`). The script is the
rule; do not re-write it by hand.

## How to call it

1. Paste the snippet below into `figma_execute`, with the two slots filled above it:
   - `const TARGET = { page, screens, fileKey }` — `page` is the page name (an exact
     match, or else the one page whose name matches once leading and trailing
     spaces are trimmed); `screens` is an optional list of screen names (top-level
     frames, or frames directly inside a top-level section), and without it every
     screen on the page is read; `fileKey` is `figma.fileKey` from
     `design-system.json`, used for the links.
   - `const SKIP = []` — rule names to switch off (`detached-component`,
     `raw-colour`, `raw-dimension`); a skipped rule's inert check is skipped too.
2. End the script with `return await runScreenGate(TARGET, SKIP);` and pass
   `timeout: 30000`.
3. Read the result, `{ pass, failures, advisories, counts, skipped }`. Each failure
   and advisory has `rule`, `path`, `detail` and a `link` to the node. Report every
   failure with its link. Never edit the file to make it pass.
4. Only the named page is loaded, and tokens are the file's local variables. A file
   whose variables all come from a published library fails as inert.

```js
const TARGET = { page: 'Templates', fileKey: '<figma.fileKey>' };
const SKIP = [];
// … the generated snippet …
return await runScreenGate(TARGET, SKIP);
```

## The snippet

```js
// The adherence gate for Figma screens as a pure checker: detached components,
// raw colours a token has, and raw gaps, padding and radii a token has. ZERO
// imports, `export const`/`export function` only. It is inlined, with the shared
// variable reader and the screen reader below it, into the generated Figma script
// (references/figma-adherence.md) by build-figma-checks.mjs, so it must run in
// both Node and the Figma plugin sandbox.
//
// Spec: docs/specs/2026-10-13-figma-adherence-gate.md
// The code-side counterpart is scripts/validate-adherence.mjs. Both follow its
// spec's Decision 3: a raw value fails only when a token has it; any other raw
// value is an advisory.
//
// SNAPSHOT (what the reader returns):
//   {
//     fileKey,                          // for links; the caller passes it (TARGET.fileKey)
//     nodes: [{
//       id, path,                       // path: 'Page / Screen / … / Node'
//       isRoot,                         // the screen frame itself
//       inInstance,                     // an overridden node inside an INSTANCE (or the instance itself)
//       underDetached,                  // a detached frame, or anything inside one
//       overridden: ['fills' | 'strokes'],   // inInstance nodes only
//       paints: [{ kind: 'fill' | 'stroke', hex, bound, styled }],   // visible SOLID paints only;
//                                       // hex is '#rrggbb', or '#rrggbbaa' when the paint's opacity < 1
//       mixedPaints,                    // fills is figma.mixed (text with mixed runs)
//       gap: { value, bound, renders } | null,
//       padding: [{ side, value, bound }],
//       radius: [{ corner, value, bound }],
//       detached: { kind: 'local' | 'library', name, id, key } | null,
//     }],
//     tokens: {
//       colours: { '#rrggbb': [variableName] },   // every mode's value
//       gap: { '<number>': [variableName] },      // FLOAT scoped GAP or ALL_SCOPES
//       radius: { '<number>': [variableName] },   // FLOAT scoped CORNER_RADIUS or ALL_SCOPES
//     },
//   }
//
// RESULT: { pass, failures, advisories, counts, skipped }
//   failures/advisories: [{ rule, id, path, detail, link }], sorted by path then detail
//   counts: { [rule]: { checked, failed } }
//   `pass` is false when any failure exists. A failed assertion is data; nothing throws.

const RULES = ['detached-component', 'raw-colour', 'raw-dimension'];

const PAINT_FIELD = { fill: 'fills', stroke: 'strokes' };

// Which dimension tables a number variable belongs in. An explicit scope decides.
// A variable left at ALL_SCOPES (Figma's default) counts only when its name says
// what it is: on Zygarden every number variable is ALL_SCOPES, and without the
// name test a 72 px gap failed with "bind text/7xl". Letter-spacing says "spacing"
// but is type, not layout.
const SPACING_WORDS = /spac|gap|inset|stack|inline|padding|gutter/i;
const NOT_SPACING = /letter/i;
const RADIUS_WORDS = /radius|corner|round/i;
function dimensionBuckets(name, scopes = []) {
  const all = scopes.includes('ALL_SCOPES');
  return {
    gap: scopes.includes('GAP') || (all && SPACING_WORDS.test(name) && !NOT_SPACING.test(name)),
    radius: scopes.includes('CORNER_RADIUS') || (all && RADIUS_WORDS.test(name)),
  };
}

function checkScreens(snapshot, { skip = [] } = {}) {
  const nodes = snapshot.nodes ?? [];
  const tokens = snapshot.tokens ?? {};
  const colours = tokens.colours ?? {};
  const gapTokens = tokens.gap ?? {};
  const radiusTokens = tokens.radius ?? {};
  const on = (rule) => !skip.includes(rule);
  const link = (id) => `https://www.figma.com/design/${snapshot.fileKey}?node-id=${String(id).replace(/:/g, '-')}`;

  const failures = [];
  const advisories = [];
  const counts = Object.fromEntries(RULES.filter(on).map((rule) => [rule, { checked: 0, failed: 0 }]));
  const entry = (rule, node, detail) => ({ rule, id: node.id, path: node.path, detail, link: link(node.id) });
  const fail = (rule, node, detail) => {
    counts[rule].failed += 1;
    failures.push(entry(rule, node, detail));
  };
  const advise = (rule, node, detail) => advisories.push(entry(rule, node, detail));

  // A bound value passes. A raw one fails when a token has it, naming the token;
  // otherwise it is an advisory.
  const raw = (rule, node, table, value, bound, what) => {
    counts[rule].checked += 1;
    if (bound) return;
    const names = table[String(value)];
    if (names && names.length) fail(rule, node, `${what}: bind ${names.join(', ')}`);
    else advise(rule, node, rule === 'raw-colour' ? `${what}: no colour variable has this value` : `off-scale ${what}`);
  };

  for (const node of nodes) {
    if (on('detached-component')) {
      counts['detached-component'].checked += 1;
      const d = node.detached;
      if (d) {
        let from;
        if (d.kind === 'library') from = `a library component (key ${d.key})`;
        else if (d.name) from = d.name;
        else from = `a local component on another page (id ${d.id})`;
        fail('detached-component', node, `detached from ${from}`);
      }
    }

    // Inside a detached copy, the one detached-component failure is the finding:
    // re-instancing fixes every raw value under it. On 01. Design System's
    // Archtypes page, checking them anyway turned 8 detached frames into ~200 failures.
    if (node.underDetached) continue;

    if (on('raw-colour')) {
      if (node.mixedPaints) advise('raw-colour', node, 'mixed paints not read');
      for (const paint of node.paints ?? []) {
        if (node.inInstance && !(node.overridden ?? []).includes(PAINT_FIELD[paint.kind])) continue;
        raw('raw-colour', node, colours, paint.hex, paint.bound || paint.styled, `${paint.kind} ${paint.hex}`);
      }
    }

    if (on('raw-dimension') && !node.inInstance) {
      const gap = node.gap;
      if (gap && gap.renders && gap.value > 0) raw('raw-dimension', node, gapTokens, gap.value, gap.bound, `gap ${gap.value}`);
      for (const p of node.padding ?? []) {
        if (p.value > 0) raw('raw-dimension', node, gapTokens, p.value, p.bound, `padding-${p.side} ${p.value}`);
      }
      if (!node.isRoot) {
        for (const r of node.radius ?? []) {
          if (r.value > 0) raw('raw-dimension', node, radiusTokens, r.value, r.bound, `radius-${r.corner} ${r.value}`);
        }
      }
    }
  }

  // Every enabled rule must have had something to check (code gate Decision 7).
  const inert = (rule, detail) => failures.push({ rule, id: null, path: '', detail, link: null });
  if (nodes.length === 0) inert('nothing-scanned', 'no node was read; check the page and screen names');
  if (on('raw-colour') && Object.keys(colours).length === 0) {
    inert('colour-rule-inert', 'the file has no local colour variables, so no raw colour could be matched to one');
  }
  if (on('raw-dimension') && Object.keys(gapTokens).length === 0 && Object.keys(radiusTokens).length === 0) {
    inert('dimension-rule-inert', 'the file has no local number variable for spacing or radius: none is scoped GAP or CORNER_RADIUS, and none left at ALL_SCOPES is named for spacing or radius');
  }

  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const byPath = (a, b) => cmp(a.path, b.path) || cmp(a.detail, b.detail);
  failures.sort(byPath);
  advisories.sort(byPath);
  return { pass: failures.length === 0, failures, advisories, counts, skipped: RULES.filter((rule) => !on(rule)) };
}

// Figma plugin-API helpers for reading colour variables, shared by the Figma
// checks reader and the screen reader. This file is NOT a Node module:
// build-figma-checks.mjs inlines it into both generated scripts
// (references/figma-checks.md, references/figma-adherence.md). It depends on
// nothing else, so it carries its own mode-name fold. Async getters only
// (references/figma-scripting.md). Untested in Node, like the readers.

const foldModeName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

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
  const mode = collection.modes.find((m) => foldModeName(m.name) === foldModeName(modeName));
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

// Figma plugin-API reader for the screen adherence gate. This file is NOT a Node
// module — build-figma-checks.mjs concatenates it after the inlined
// figma-adherence.mjs and figma-variables-read.figma.js into
// references/figma-adherence.md, and the result runs inside figma_execute.
// Constraints honored here (see references/figma-scripting.md): async getters
// only; only the target page is loaded; overridden nodes are found inside their
// instance, never with getNodeByIdAsync in a loop (that stalled the bridge on a
// large file). Read-only: nothing here writes to the file. Untested in Node
// beyond the generator's snippet test; the pure checker it feeds is unit-tested.
//
// In-scope globals when assembled: checkScreens and dimensionBuckets (figma-adherence.mjs),
// colorHex and variableColors (figma-variables-read.figma.js), and the caller-filled slots
// TARGET = { page, screens?, fileKey } and SKIP = [rule, ...]. The snapshot shape is
// documented at the top of scripts/lib/figma-adherence.mjs.

const CORNERS = [
  ['topLeftRadius', 'top-left'],
  ['topRightRadius', 'top-right'],
  ['bottomRightRadius', 'bottom-right'],
  ['bottomLeftRadius', 'bottom-left'],
];
const SIDES = [
  ['paddingTop', 'top'],
  ['paddingRight', 'right'],
  ['paddingBottom', 'bottom'],
  ['paddingLeft', 'left'],
];

function solidPaints(node, field, kind) {
  const list = node[field];
  if (!Array.isArray(list)) return [];
  const bound = (node.boundVariables && node.boundVariables[field]) || [];
  const styleId = field === 'fills' ? node.fillStyleId : node.strokeStyleId;
  const styled = typeof styleId === 'string' && styleId !== '';
  const out = [];
  list.forEach((paint, i) => {
    if (paint.visible === false || paint.type !== 'SOLID') return;
    // The paint's opacity goes into the hex the way colorHex writes a translucent
    // variable, so a 50% black matches a 50% black token and not the opaque one.
    const opacity = paint.opacity === undefined ? 1 : paint.opacity;
    out.push({
      kind,
      hex: colorHex({ r: paint.color.r, g: paint.color.g, b: paint.color.b, a: opacity }),
      bound: Boolean(bound[i]),
      styled,
    });
  });
  return out;
}

function gapOf(node) {
  if (!node.layoutMode || node.layoutMode === 'NONE') return null;
  const inFlow = (node.children || []).filter((c) => c.visible !== false && c.layoutPositioning !== 'ABSOLUTE');
  return {
    value: node.itemSpacing,
    bound: Boolean(node.boundVariables && node.boundVariables.itemSpacing),
    renders: inFlow.length >= 2 && node.primaryAxisAlignItems !== 'SPACE_BETWEEN',
  };
}

function paddingOf(node) {
  if (!node.layoutMode || node.layoutMode === 'NONE') return [];
  const bound = node.boundVariables || {};
  return SIDES.map(([field, side]) => ({ side, value: node[field], bound: Boolean(bound[field]) }));
}

function radiusOf(node) {
  if (!('cornerRadius' in node)) return [];
  const bound = node.boundVariables || {};
  if (node.cornerRadius !== figma.mixed) {
    return [{ corner: 'all', value: node.cornerRadius, bound: Boolean(bound.topLeftRadius) }];
  }
  return CORNERS.map(([field, corner]) => ({ corner, value: node[field], bound: Boolean(bound[field]) }));
}

function detachedOf(node, page) {
  let info = null;
  try {
    info = node.detachedInfo;
  } catch {
    return null;
  }
  if (!info) return null;
  if (info.type === 'library') return { kind: 'library', name: null, id: null, key: info.componentKey };
  const main = page.findOne((n) => n.id === info.componentId);
  return { kind: 'local', name: main ? main.name : null, id: info.componentId, key: null };
}

function overriddenRecords(instance, path, underDetached) {
  const records = [];
  for (const entry of instance.overrides || []) {
    const fields = entry.overriddenFields.filter((f) => f === 'fills' || f === 'strokes');
    if (!fields.length) continue;
    const node = entry.id === instance.id ? instance : instance.findOne((n) => n.id === entry.id);
    if (!node) continue;
    records.push({
      id: node.id,
      path: node === instance ? path : `${path} / ${node.name}`,
      isRoot: false,
      inInstance: true,
      underDetached,
      overridden: fields,
      paints: [...solidPaints(node, 'fills', 'fill'), ...solidPaints(node, 'strokes', 'stroke')],
      mixedPaints: false,
      gap: null,
      padding: [],
      radius: [],
      detached: null,
    });
  }
  return records;
}

// The SLOT nodes that belong to this instance, not to an instance nested in it.
function slotsOf(instance) {
  return instance.findAll((n) => n.type === 'SLOT').filter((slot) => {
    let owner = slot.parent;
    while (owner && owner.type !== 'INSTANCE') owner = owner.parent;
    return owner === instance;
  });
}

function screensOn(page, names) {
  const all = [];
  for (const top of page.children) {
    if (top.type === 'FRAME') all.push(top);
    else if (top.type === 'SECTION') for (const c of top.children) if (c.type === 'FRAME') all.push(c);
  }
  if (!names || !names.length) return all;
  return names.map((name) => {
    const hit = all.find((s) => s.name === name);
    if (!hit) throw new Error(`no screen named "${name}" on page "${page.name}"`);
    return hit;
  });
}

async function readTokens() {
  const colours = {};
  for (const variable of await figma.variables.getLocalVariablesAsync('COLOR')) {
    const { modes } = await variableColors(variable);
    for (const hex of Object.values(modes)) {
      if (!hex) continue;
      const names = colours[hex] || (colours[hex] = []);
      if (!names.includes(variable.name)) names.push(variable.name);
    }
  }
  const gap = {};
  const radius = {};
  const add = (table, value, name) => {
    if (typeof value !== 'number') return;
    const names = table[String(value)] || (table[String(value)] = []);
    if (!names.includes(name)) names.push(name);
  };
  for (const variable of await figma.variables.getLocalVariablesAsync('FLOAT')) {
    const buckets = dimensionBuckets(variable.name, variable.scopes || []);
    for (const value of Object.values(variable.valuesByMode)) {
      if (buckets.gap) add(gap, value, variable.name);
      if (buckets.radius) add(radius, value, variable.name);
    }
  }
  return { colours, gap, radius };
}

// Exact name first. Page names often carry decoration nobody types (01. Design
// System's are "    ↳ Templates"), so a unique match on the trimmed name also counts.
function findPage(name) {
  const exact = figma.root.children.find((p) => p.name === name);
  if (exact) return exact;
  const trimmed = figma.root.children.filter((p) => p.name.trim() === String(name).trim());
  if (trimmed.length === 1) return trimmed[0];
  throw new Error(`no page named "${name}"`);
}

async function readScreens(target) {
  const page = findPage(target.page);
  await page.loadAsync();
  const screens = screensOn(page, target.screens);
  const nodes = [];
  const walk = (node, path, isRoot, insideDetached) => {
    if (node.visible === false) return;
    if (node.type === 'INSTANCE') {
      nodes.push(...overriddenRecords(node, path, insideDetached));
      // Content added to a slot is the screen's own, and isn't listed in
      // instance.overrides. A slot's placeholder children keep instance-sublayer
      // ids ('I…;…') and stay part of the component.
      for (const slot of slotsOf(node)) {
        for (const child of slot.children) {
          if (!String(child.id).startsWith('I')) walk(child, `${path} / ${slot.name} / ${child.name}`, false, insideDetached);
        }
      }
      return;
    }
    const mixedPaints = node.fills === figma.mixed;
    const detached = detachedOf(node, page);
    const underDetached = insideDetached || detached !== null;
    nodes.push({
      id: node.id,
      path,
      isRoot,
      inInstance: false,
      underDetached,
      overridden: [],
      paints: [...solidPaints(node, 'fills', 'fill'), ...solidPaints(node, 'strokes', 'stroke')],
      mixedPaints,
      gap: gapOf(node),
      padding: paddingOf(node),
      radius: radiusOf(node),
      detached,
    });
    for (const child of node.children || []) walk(child, `${path} / ${child.name}`, false, underDetached);
  };
  for (const screen of screens) walk(screen, `${page.name.trim()} / ${screen.name}`, true, false);
  return {
    // The caller passes the fileKey from design-system.json: figma.fileKey is only
    // exposed to private plugins.
    fileKey: target.fileKey || figma.fileKey,
    nodes,
    tokens: await readTokens(),
  };
}

async function runScreenGate(TARGET, SKIP) {
  return checkScreens(await readScreens(TARGET), { skip: SKIP || [] });
}
```
