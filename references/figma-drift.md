# Figma drift (GENERATED)

> **GENERATED FILE — do not edit by hand.** Sources: the variables snippet is
> `scripts/lib/figma-variables-read.figma.js` + `scripts/lib/figma-drift-variables.figma.js`;
> the screens snippet is `scripts/lib/figma-adherence.mjs` (for `dimensionBuckets`),
> `scripts/lib/figma-compose.mjs` (the pure resolver),
> `scripts/lib/figma-compose-read.figma.js` + `scripts/lib/figma-drift-screens.figma.js`;
> the components snippet is `scripts/lib/figma-drift-components.figma.js` alone.
> Regenerate with `node scripts/build-figma-checks.mjs`; CI gates freshness with `--check`.

The canonical `figma_execute` snippets for the live half of `/throughline:drift`
and the variable stamp `/throughline:sync-figma-tokens` takes. Both are read-only:
they carry no writer and change nothing in the file. The comparison happens in
Node, in `scripts/drift-check.mjs`. The scripts are the rule; do not re-write
them by hand.

## How to call it

Paste a snippet into `figma_execute` with `timeout: 30000`, followed by its
return line. Each is self-contained; never paste two together.

- **Variables** (the short one): end it with `return await runDriftVariables();`.
  Returns one line per local variable collection, `{ "<collection>": { variables, hash } }`:
  its variable count and a fingerprint of every name, type and value in it (aliases
  followed, colours as hex). Write the result to a file as returned and pass it to
  `drift-check.mjs compare-figma --from <file>` (or `stamp-figma` after a sync).
- **Screens**: declare `const SPEC = { entries };` above it and end it with
  `return await runDriftScreens(SPEC);`. `entries` is the list of Figma entries
  (`side: "figma"`) from `design-system/screens.json`, as stored. Returns
  `{ screens: [{ screen, page, state, errors }] }`, `state` one of `clean`,
  `broken` (the stored description no longer resolves against the components page
  it was built from: `errors` say what), `gone` (no frame or page of that name) or
  `released` (the frame is no longer marked as composed). Pages are found by exact
  name, or else the one page whose trimmed name matches; only the pages named in
  the entries are loaded.
- **Components**: declare `const SPEC = { names };` above it (add `componentsPage`
  when you know it) and end it with `return await runDriftComponents(SPEC);`.
  `names` is `components.documented` from `drift-check.mjs check --json`. Returns
  `{ page, components: { <name>: { axes: { <axis>: [options] } } | null } }`, `null`
  when no component set on the page has that name. Without `componentsPage` it reads
  the one page named like "Components" and throws naming the pages when there is
  none or several. Write the result to a file and pass it to
  `drift-check.mjs compare-components --from <file>`.

## The variables snippet

```js
// Figma plugin-API helpers for reading colour and number variables, shared by the Figma
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

// The raw value of `variable` in the mode named `modeName` (after the fold), else
// its collection's default mode, following aliases up to 10 hops.
async function resolveValue(variable, modeName, hops) {
  if (!variable || hops > 10) return null;
  const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  if (!collection) return null;
  const mode = collection.modes.find((m) => foldModeName(m.name) === foldModeName(modeName));
  const value = variable.valuesByMode[mode ? mode.modeId : collection.defaultModeId];
  if (value && value.type === 'VARIABLE_ALIAS') {
    return resolveValue(await figma.variables.getVariableByIdAsync(value.id), modeName, hops + 1);
  }
  return value === undefined ? null : value;
}

async function resolveColor(variable, modeName, hops) {
  return colorHex(await resolveValue(variable, modeName, hops));
}

// { [modeName]: number | null } over the variable's own collection, aliases followed.
async function variableNumbers(variable) {
  const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  const modes = {};
  for (const mode of collection ? collection.modes : []) {
    const value = await resolveValue(variable, mode.name, 0);
    modes[mode.name] = typeof value === 'number' ? value : null;
  }
  return modes;
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

// Figma plugin-API reader for the variables half of drift, read-only. This file
// is NOT a Node module — build-figma-checks.mjs concatenates it after the inlined
// figma-variables-read.figma.js (colorHex) into the variables snippet of
// references/figma-drift.md. It is kept apart from the screens reader so the
// snippet every token sync runs stays small, and it returns one fingerprint per
// collection rather than every value: on 2026-10-14 an agent handing 147 values
// on to a file by hand was the step that failed. The comparison happens in Node
// (scripts/drift-check.mjs).
// Awaits are few and fixed: every local variable and collection is read once, and
// aliases resolve from those maps. Only an alias to a variable outside the file
// costs an await. Untested in Node beyond the generator's tests.
//
// Entry point: runDriftVariables()
//   → { "<collection>": { variables, hash } }
//   hash: FNV-1a (32-bit, hex) over every variable in the collection, sorted by
//   name, each as its name, type and value per mode (sorted by mode name), colours
//   as hex and aliases followed (by mode name, else the target's default). Two
//   collections with the same name share one line; Figma allows it, rarely. The
//   result stays small however many variables a file has, so it can be written to
//   a file by hand; the sync's own diff shows which variables moved.

function driftHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

async function driftVariables() {
  const collections = new Map();
  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) collections.set(c.id, c);
  const variables = new Map();
  for (const v of await figma.variables.getLocalVariablesAsync()) variables.set(v.id, v);
  const fold = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

  async function valueOf(variable, modeName, hops) {
    if (!variable || hops > 10) return null;
    const collection = collections.get(variable.variableCollectionId)
      || await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    if (!collection) return null;
    const mode = collection.modes.find((m) => fold(m.name) === fold(modeName));
    const value = variable.valuesByMode[mode ? mode.modeId : collection.defaultModeId];
    if (value && value.type === 'VARIABLE_ALIAS') {
      const target = variables.get(value.id) || await figma.variables.getVariableByIdAsync(value.id);
      return valueOf(target, modeName, hops + 1);
    }
    if (value && typeof value === 'object' && 'r' in value) return colorHex(value);
    return value === undefined ? null : value;
  }

  const rows = new Map();
  for (const variable of variables.values()) {
    const collection = collections.get(variable.variableCollectionId);
    if (!collection) continue;
    const modes = [];
    for (const mode of collection.modes) modes.push([mode.name, await valueOf(variable, mode.name, 0)]);
    modes.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    if (!rows.has(collection.name)) rows.set(collection.name, []);
    rows.get(collection.name).push([variable.name, variable.resolvedType, modes]);
  }
  const out = {};
  for (const [name, list] of rows) {
    list.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    out[name] = { variables: list.length, hash: driftHash(JSON.stringify(list)) };
  }
  return out;
}

async function runDriftVariables() {
  return driftVariables();
}
```

## The screens snippet

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

// Screen composition for Figma as a pure resolver: checks a screen description
// against what the file has, and turns its names into what the writer sets.
// ZERO imports, `export const`/`export function` only. It is inlined, next to
// figma-adherence.mjs and the shared variable reader, into the generated Figma
// script (references/figma-compose.md) by build-figma-checks.mjs, so it must run
// in both Node and the Figma plugin sandbox, and reuse none of their top-level
// names.
//
// Spec: docs/specs/2026-10-13-compose-figma-screen.md
//
// DESCRIPTION (what the planner writes):
//   {
//     screen, page, width, height?,           // width/height: the only raw numbers
//     modes?: { [collectionName]: modeName },
//     root: <frame>,                          // no sizing on the root
//   }
//   frame:     { layout: 'vertical'|'horizontal', gap?, padding?, fill?, stroke?, radius?,
//                align?: { main?: 'start'|'center'|'end'|'space-between', cross?: 'start'|'center'|'end' },
//                children?: [node], sizing?, name? }
//              padding: a variable name, or { top?, right?, bottom?, left? }
//   component: { component, props?: { [propName]: value }, slots?: { [slotName]: [node] }, sizing?, name? }
//   text:      { text, style, color, sizing?, name? }
//   sizing:    { horizontal?: 'fill'|'hug', vertical?: 'fill'|'hug' }
//              An axis left out stays as Figma makes it: a frame hugs, text sizes to
//              its content, an instance keeps its component's size. 'hug' on an
//              instance needs a component with auto layout (Figma throws otherwise).
//   Every visual value is a variable or text-style name. Only when the inventory
//   says allowRaw (mode b, docs/specs/2026-10-30-design-modes.md Q8/Q9), a colour,
//   gap, radius or one padding side may instead be { raw: '#rrggbb[aa]' } or
//   { raw: <number> }: refused as raw-has-variable when inventory.valueIndex says a
//   variable holds that value, otherwise carried into the plan and listed in raws.
//
// INVENTORY (what the reader returns):
//   {
//     sets: [{ name, id, page, autoLayout, props: [{ key, name, type, options?, slotLayout? }] }],
//                                             // key: 'label#10:273'; type: TEXT | BOOLEAN | VARIANT
//                                             // | INSTANCE_SWAP | SLOT; slotLayout: NONE | VERTICAL | HORIZONTAL,
//                                             // NONE if any variant's slot has no auto layout;
//                                             // autoLayout: every variant has auto layout
//     components: [{ name, id, page }],       // standalone COMPONENTs, the swap targets
//     variables: [{ name, id, kinds: ['colour'|'gap'|'radius'] }],
//     textStyles: [{ name, id }],
//     collections: [{ name, id, modes: [{ name, id }] }],
//     target: { screen, wip } | null,         // build only: 'marked' | 'unmarked' | null for
//                                             // the frames named <screen> and 'WIP: <screen>'
//     allowRaw?: true,                        // mode b only
//     valueIndex?: { colours: { <hex>: [names] }, gap: { <n>: [names] }, radius: { <n>: [names] } },
//   }
//
// resolveScreen(description, inventory) → { ok, errors, plan }
//   errors: [{ kind, path, asked, nearest? }]; path is the node's place in the
//   description ('root.children[2].slots.Body[0]').
//   plan (only when ok): the same tree with every name replaced by ids, real
//   property keys and values, and Figma's enum spellings. A raw value stays
//   { raw } in the plan; plan.raws lists each as { path, kind, value }.

const COMPOSE_ERROR_KINDS = [
  'invalid', 'name-taken', 'missing-component', 'unknown-prop', 'unknown-option',
  'prop-type', 'missing-swap-target', 'unknown-variable', 'variable-kind',
  'unknown-text-style', 'unknown-mode', 'raw-has-variable',
];

const composeFold = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// 'label#10:273' → 'label'. Variant property keys carry no suffix.
const propBaseName = (key) => String(key).replace(/#[^#]*$/, '');

const LAYOUT = { vertical: 'VERTICAL', horizontal: 'HORIZONTAL' };
const ALIGN_MAIN = { start: 'MIN', center: 'CENTER', end: 'MAX', 'space-between': 'SPACE_BETWEEN' };
const ALIGN_CROSS = { start: 'MIN', center: 'CENTER', end: 'MAX' };
const SIZING = { fill: 'FILL', hug: 'HUG' };
const SIDES = ['top', 'right', 'bottom', 'left'];

const NODE_FIELDS = {
  frame: ['layout', 'gap', 'padding', 'fill', 'stroke', 'radius', 'align', 'children', 'sizing', 'name'],
  component: ['component', 'props', 'slots', 'sizing', 'name'],
  text: ['text', 'style', 'color', 'sizing', 'name'],
};

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = above;
    }
  }
  return row[b.length];
}

// 'md' → 'medium', 'bg' → 'background': same first letter, the rest in order.
function isAbbrev(short, long) {
  if (short[0] !== long[0]) return false;
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i === short.length;
}

// Up to three names, by longest shared folded prefix, then edit distance. Only
// names that are close count: a typo, one name inside the other, or an
// abbreviation. A name nothing resembles gets none.
function nearestNames(asked, names) {
  const want = composeFold(asked);
  if (!want) return [];
  const limit = Math.max(2, Math.floor(want.length / 3));
  const shared = (f) => { let n = 0; while (n < f.length && n < want.length && f[n] === want[n]) n++; return n; };
  return [...new Set(names)]
    .map((name) => ({ name, f: composeFold(name) }))
    .filter((x) => x.f)
    .map((x) => ({ ...x, prefix: shared(x.f), dist: editDistance(want, x.f) }))
    .filter((x) => x.dist <= limit || x.f.includes(want) || want.includes(x.f) || isAbbrev(want, x.f))
    .sort((a, b) => b.prefix - a.prefix || a.dist - b.dist || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((x) => x.name);
}

const byFold = (list, asked, nameOf = (x) => x.name) =>
  list.find((x) => nameOf(x) === asked) || list.find((x) => composeFold(nameOf(x)) === composeFold(asked));

function resolveScreen(description, inventory) {
  const errors = [];
  const fail = (kind, path, asked, nearest) =>
    errors.push(nearest ? { kind, path, asked, nearest } : { kind, path, asked });
  const inv = {
    sets: [], components: [], variables: [], textStyles: [], collections: [], target: null,
    ...inventory,
  };

  const d = description && typeof description === 'object' ? description : {};
  if (typeof d.screen !== 'string' || !d.screen.trim()) fail('invalid', 'screen', 'a screen name');
  if (typeof d.page !== 'string' || !d.page.trim()) fail('invalid', 'page', 'a page name');
  if (!(typeof d.width === 'number' && d.width > 0)) fail('invalid', 'width', 'a positive number');
  if (d.height !== undefined && !(typeof d.height === 'number' && d.height > 0)) fail('invalid', 'height', 'a positive number');
  if (!d.root || typeof d.root !== 'object') fail('invalid', 'root', 'a frame');

  if (inv.target && typeof d.screen === 'string') {
    if (inv.target.screen === 'unmarked') fail('name-taken', 'screen', d.screen);
    if (inv.target.wip === 'unmarked') fail('name-taken', 'screen', `WIP: ${d.screen}`);
  }

  const raws = [];
  const RAW_TABLE = { colour: 'colours', gap: 'gap', radius: 'radius' };

  const modes = [];
  for (const [collectionName, modeName] of Object.entries(d.modes || {})) {
    const collection = byFold(inv.collections, collectionName);
    const mode = collection && byFold(collection.modes, String(modeName));
    if (!collection) fail('unknown-mode', `modes.${collectionName}`, collectionName, nearestNames(collectionName, inv.collections.map((c) => c.name)));
    else if (!mode) fail('unknown-mode', `modes.${collectionName}`, String(modeName), nearestNames(String(modeName), collection.modes.map((m) => m.name)));
    else modes.push({ collectionId: collection.id, modeId: mode.id });
  }

  function rawValue(value, kind, path) {
    let v = value;
    if (kind === 'colour') {
      if (typeof v !== 'string' || !/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) { fail('invalid', path, `a raw colour #rrggbb or #rrggbbaa, not ${JSON.stringify(value)}`); return null; }
      v = v.toLowerCase();
      if (v.length === 9 && v.endsWith('ff')) v = v.slice(0, 7);
    } else if (!(typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
      fail('invalid', path, `a raw number of 0 or more, not ${JSON.stringify(value)}`);
      return null;
    }
    const held = ((inv.valueIndex || {})[RAW_TABLE[kind]] || {})[String(v)];
    if (held && held.length) { fail('raw-has-variable', path, String(v), held.slice(0, 3)); return null; }
    raws.push({ path, kind, value: v });
    return { raw: v };
  }

  function variable(name, kind, path) {
    if (name === undefined || name === null) return null;
    if (inv.allowRaw && typeof name === 'object' && !Array.isArray(name) && Object.keys(name).length === 1 && 'raw' in name) {
      return rawValue(name.raw, kind, path);
    }
    if (typeof name !== 'string') { fail('invalid', path, `a variable name, not ${JSON.stringify(name)}`); return null; }
    const found = byFold(inv.variables, name);
    if (!found) {
      fail('unknown-variable', path, name, nearestNames(name, inv.variables.filter((v) => v.kinds.includes(kind)).map((v) => v.name)));
      return null;
    }
    if (!found.kinds.includes(kind)) { fail('variable-kind', path, `${name} is not a ${kind} variable`); return null; }
    return found.id;
  }

  // `fallback` fills an axis the description leaves out: 'hug' for frames (a new
  // frame is a fixed 100×100 otherwise), null (leave alone) for text and instances.
  function sizing(node, path, parent, fallback, hugAllowed = true) {
    const s = node.sizing === undefined ? {} : node.sizing;
    if (!s || typeof s !== 'object') { fail('invalid', `${path}.sizing`, 'an object { horizontal, vertical }'); return null; }
    const out = {};
    for (const axis of ['horizontal', 'vertical']) {
      const v = s[axis] === undefined ? fallback : s[axis];
      if (v === null) continue;
      if (!SIZING[v]) { fail('invalid', `${path}.sizing.${axis}`, `fill or hug, not ${JSON.stringify(v)}`); continue; }
      if (v === 'hug' && !hugAllowed) {
        fail('invalid', `${path}.sizing.${axis}`, 'hug on a component without auto layout');
        continue;
      }
      if (v === 'fill' && parent.slotLayout === 'NONE') {
        fail('invalid', `${path}.sizing.${axis}`, 'fill inside a slot without auto layout');
        continue;
      }
      out[axis] = SIZING[v];
    }
    for (const key of Object.keys(s)) if (key !== 'horizontal' && key !== 'vertical') fail('invalid', `${path}.sizing.${key}`, 'horizontal or vertical');
    return out;
  }

  function kindOf(node, path) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) { fail('invalid', path, 'a frame, component or text node'); return null; }
    const isComponent = 'component' in node;
    const isText = 'text' in node;
    if (isComponent && isText) { fail('invalid', path, 'one of component or text, not both'); return null; }
    const kind = isComponent ? 'component' : isText ? 'text' : 'frame';
    for (const key of Object.keys(node)) if (!NODE_FIELDS[kind].includes(key)) fail('invalid', `${path}.${key}`, `a ${kind} field`);
    return kind;
  }

  function frame(node, path, parent, isRoot) {
    const layoutMode = LAYOUT[node.layout];
    if (!layoutMode) fail('invalid', `${path}.layout`, `vertical or horizontal, not ${JSON.stringify(node.layout)}`);
    let padding = null;
    if (node.padding !== undefined) {
      if (typeof node.padding === 'object' && node.padding !== null) {
        padding = {};
        for (const [side, name] of Object.entries(node.padding)) {
          if (!SIDES.includes(side)) { fail('invalid', `${path}.padding.${side}`, 'top, right, bottom or left'); continue; }
          padding[side] = variable(name, 'gap', `${path}.padding.${side}`);
        }
      } else {
        const id = variable(node.padding, 'gap', `${path}.padding`);
        padding = Object.fromEntries(SIDES.map((side) => [side, id]));
      }
    }
    const align = node.align || {};
    if (node.align !== undefined && (typeof node.align !== 'object' || node.align === null)) fail('invalid', `${path}.align`, 'an object { main, cross }');
    if (align.main !== undefined && !ALIGN_MAIN[align.main]) fail('invalid', `${path}.align.main`, `start, center, end or space-between, not ${JSON.stringify(align.main)}`);
    if (align.cross !== undefined && !ALIGN_CROSS[align.cross]) fail('invalid', `${path}.align.cross`, `start, center or end, not ${JSON.stringify(align.cross)}`);
    if (isRoot && node.sizing !== undefined) fail('invalid', `${path}.sizing`, 'no sizing on the root; it takes width and height');
    const children = node.children === undefined ? [] : node.children;
    if (!Array.isArray(children)) fail('invalid', `${path}.children`, 'a list of nodes');
    return {
      type: 'frame',
      name: typeof node.name === 'string' ? node.name : 'Stack',
      layoutMode,
      itemSpacing: variable(node.gap, 'gap', `${path}.gap`),
      padding,
      fill: variable(node.fill, 'colour', `${path}.fill`),
      stroke: variable(node.stroke, 'colour', `${path}.stroke`),
      radius: variable(node.radius, 'radius', `${path}.radius`),
      primaryAxisAlignItems: ALIGN_MAIN[align.main] || 'MIN',
      counterAxisAlignItems: ALIGN_CROSS[align.cross] || 'MIN',
      sizing: isRoot ? null : sizing(node, path, parent, 'hug'),
      children: Array.isArray(children)
        ? children.map((child, i) => resolveNode(child, `${path}.children[${i}]`, { slotLayout: null }))
        : [],
    };
  }

  function component(node, path, parent) {
    const set = byFold(inv.sets, String(node.component));
    const sizingPlan = sizing(node, path, parent, null, !set || set.autoLayout !== false);
    if (!set) {
      fail('missing-component', `${path}.component`, String(node.component), nearestNames(String(node.component), inv.sets.map((s) => s.name)));
      return null;
    }
    const findProp = (name) => set.props.find((p) => composeFold(propBaseName(p.key)) === composeFold(name));
    const propNames = set.props.map((p) => propBaseName(p.key));
    const variantProps = {};
    const otherProps = {};
    for (const [name, value] of Object.entries(node.props || {})) {
      const at = `${path}.props.${name}`;
      const prop = findProp(name);
      if (!prop) { fail('unknown-prop', at, name, nearestNames(name, propNames)); continue; }
      if (prop.type === 'SLOT') { fail('invalid', at, 'slot content goes under slots, not props'); continue; }
      if (prop.type === 'VARIANT') {
        const option = (prop.options || []).find((o) => composeFold(o) === composeFold(value));
        if (option === undefined) fail('unknown-option', at, String(value), nearestNames(String(value), prop.options || []));
        else variantProps[prop.key] = option;
      } else if (prop.type === 'TEXT') {
        if (typeof value !== 'string') fail('prop-type', at, `text, not ${JSON.stringify(value)}`);
        else otherProps[prop.key] = value;
      } else if (prop.type === 'BOOLEAN') {
        if (typeof value !== 'boolean') fail('prop-type', at, `true or false, not ${JSON.stringify(value)}`);
        else otherProps[prop.key] = value;
      } else if (prop.type === 'INSTANCE_SWAP') {
        const target = typeof value === 'string' && byFold(inv.components, value);
        if (!target) fail('missing-swap-target', at, String(value), nearestNames(String(value), inv.components.map((c) => c.name)));
        else otherProps[prop.key] = target.id;
      }
    }
    const slots = [];
    for (const [name, nodes] of Object.entries(node.slots || {})) {
      const at = `${path}.slots.${name}`;
      const prop = findProp(name);
      if (!prop || prop.type !== 'SLOT') {
        fail('unknown-prop', at, name, nearestNames(name, set.props.filter((p) => p.type === 'SLOT').map((p) => propBaseName(p.key))));
        continue;
      }
      if (!Array.isArray(nodes)) { fail('invalid', at, 'a list of nodes'); continue; }
      slots.push({
        key: prop.key,
        nodes: nodes.map((child, i) => resolveNode(child, `${at}[${i}]`, { slotLayout: prop.slotLayout || 'NONE' })),
      });
    }
    return {
      type: 'component',
      name: typeof node.name === 'string' ? node.name : set.name,
      setId: set.id,
      variantProps,
      otherProps,
      slots,
      sizing: sizingPlan,
    };
  }

  function text(node, path, parent) {
    if (typeof node.text !== 'string') fail('invalid', `${path}.text`, 'the text to show');
    let styleId = null;
    if (typeof node.style !== 'string') fail('invalid', `${path}.style`, 'a text style name');
    else {
      const style = byFold(inv.textStyles, node.style);
      if (!style) fail('unknown-text-style', `${path}.style`, node.style, nearestNames(node.style, inv.textStyles.map((s) => s.name)));
      else styleId = style.id;
    }
    if (node.color === undefined) fail('invalid', `${path}.color`, 'a colour variable name');
    return {
      type: 'text',
      name: typeof node.name === 'string' ? node.name : String(node.text).slice(0, 40),
      characters: node.text,
      styleId,
      color: variable(node.color, 'colour', `${path}.color`),
      sizing: sizing(node, path, parent, null),
    };
  }

  function resolveNode(node, path, parent) {
    const kind = kindOf(node, path);
    if (kind === 'component') return component(node, path, parent);
    if (kind === 'text') return text(node, path, parent);
    if (kind === 'frame') return frame(node, path, parent, false);
    return null;
  }

  let root = null;
  if (d.root && typeof d.root === 'object') {
    const kind = kindOf(d.root, 'root');
    if (kind === 'frame') root = frame(d.root, 'root', { slotLayout: null }, true);
    else if (kind) fail('invalid', 'root', 'a frame');
  }

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    plan: ok ? { screen: d.screen, page: d.page, width: d.width, height: d.height ?? null, modes, root, raws } : null,
  };
}

// Figma plugin-API reader for screen composition, read-only: page lookup, the
// composed-screen marker, and the inventory. This file is NOT a Node module —
// build-figma-checks.mjs inlines it after figma-adherence.mjs (for
// dimensionBuckets) into both references/figma-compose.md, ahead of the writer
// (figma-compose.figma.js), and references/figma-drift.md, ahead of the drift
// reader, so the drift snippet carries no writer. Nothing here is redeclared
// elsewhere: both files share one snippet. Async getters only. Untested in Node
// beyond the generator's tests.

const COMPOSE_NS = 'throughline';
const COMPOSE_KEY = 'composedScreen';

// Exact name first, else the one page whose trimmed name matches (01. Design
// System's pages are "    ↳ Templates"). Null when none matches; two trimmed
// matches throw, as the gate's findPage does (which isn't inlined here).
function composeFindPage(name) {
  const exact = figma.root.children.find((p) => p.name === name);
  if (exact) return exact;
  const trimmed = figma.root.children.filter((p) => p.name.trim() === String(name).trim());
  if (trimmed.length > 1) throw new Error(`${trimmed.length} pages are named "${String(name).trim()}"; rename one or pass the exact name`);
  return trimmed.length === 1 ? trimmed[0] : null;
}

function composeRequirePage(name) {
  const page = composeFindPage(name);
  if (!page) throw new Error(`no page named "${name}"`);
  return page;
}

const composeIsMarked = (node) => node.getSharedPluginData(COMPOSE_NS, COMPOSE_KEY) !== '';
// Screens as the gate counts them: top-level frames, and frames directly inside a
// top-level section.
function composeTopFrames(page, name) {
  const all = [];
  for (const top of page.children) {
    if (top.type === 'FRAME') all.push(top);
    else if (top.type === 'SECTION') for (const c of top.children) if (c.type === 'FRAME') all.push(c);
  }
  return all.filter((n) => n.name === name);
}

// A component set's properties as the INVENTORY records them.
function composeSetProps(set) {
  // Every variant, since the writer switches variant before filling a slot.
  const slotNodes = set.findAll((n) => n.type === 'SLOT');
  return Object.entries(set.componentPropertyDefinitions).map(([key, def]) => {
    const prop = { key, name: key.replace(/#[^#]*$/, ''), type: def.type };
    if (def.variantOptions) prop.options = def.variantOptions;
    if (def.type === 'SLOT') {
      const slots = slotNodes.filter((n) => n.componentPropertyReferences && n.componentPropertyReferences.slotContentId === key);
      prop.slotLayout = slots.length && slots.every((n) => n.layoutMode !== 'NONE') ? slots[0].layoutMode : 'NONE';
    }
    return prop;
  });
}

const composeSetAutoLayout = (set) => set.children.every((v) => v.layoutMode && v.layoutMode !== 'NONE');

// Mode b (spec.library): library sets and swap targets from the library instances
// on spec.library.pages, plus any REST results ({ key, type: 'COMPONENT_SET' |
// 'COMPONENT' }) imported by key; the file's own variable values for the raw-value
// check. Instances are read 20 at a time and de-duplicated by key. Live on
// 2026-10-30 (Zygarden.gg), a library instance's main component exposed its parent
// set, with componentPropertyDefinitions and defaultVariant; and importing a
// component or set by key hung (variables imported fine). So the nodes reached
// through instances go to the writer as they are (`nodes`, by 'lib:<key>' id), and
// only REST results are imported by key.
async function composeReadLibrary(spec, localVariables) {
  const lib = spec.library;
  const sets = new Map();
  const components = new Map();
  const nodes = new Map();
  const addMain = (main) => {
    if (!main || !main.remote) return;
    const set = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
    if (set) {
      if (!sets.has(set.key)) {
        sets.set(set.key, { name: set.name, key: set.key, autoLayout: composeSetAutoLayout(set), props: composeSetProps(set) });
        nodes.set(libraryId(set.key), set);
      }
    } else if (!components.has(main.key)) {
      components.set(main.key, { name: main.name, key: main.key });
      nodes.set(libraryId(main.key), main);
    }
  };
  for (const name of lib.pages || []) {
    const page = composeFindPage(name);
    if (!page) continue;
    await page.loadAsync();
    const instances = page.findAllWithCriteria({ types: ['INSTANCE'] });
    for (let i = 0; i < instances.length; i += 20) {
      (await Promise.all(instances.slice(i, i + 20).map((n) => n.getMainComponentAsync()))).forEach(addMain);
    }
  }
  if (lib.components !== undefined && !Array.isArray(lib.components)) {
    throw new Error('library.components must be an array of { key, type: \'COMPONENT_SET\' | \'COMPONENT\' }, reshaped from figma_get_library_components');
  }
  const rest = (lib.components || []).filter((c) => c && c.key && !sets.has(c.key) && !components.has(c.key));
  for (let i = 0; i < rest.length; i += 20) {
    const chunk = rest.slice(i, i + 20);
    const imported = await Promise.all(chunk.map((c) => (c.type === 'COMPONENT_SET'
      ? figma.importComponentSetByKeyAsync(c.key)
      : figma.importComponentByKeyAsync(c.key))));
    imported.forEach((node, j) => {
      if (chunk[j].type === 'COMPONENT_SET') {
        sets.set(node.key, { name: node.name, key: node.key, autoLayout: composeSetAutoLayout(node), props: composeSetProps(node) });
        nodes.set(libraryId(node.key), node);
      } else addMain(node);
    });
  }
  const localValues = { colours: {}, gap: {}, radius: {} };
  const add = (table, value, name) => {
    if (value === null || value === undefined) return;
    const names = table[String(value)] || (table[String(value)] = []);
    if (!names.includes(name)) names.push(name);
  };
  await Promise.all(localVariables.map(async (variable) => {
    if (variable.resolvedType === 'COLOR') {
      for (const hex of Object.values((await variableColors(variable)).modes)) add(localValues.colours, hex, variable.name);
    } else if (variable.resolvedType === 'FLOAT') {
      const buckets = dimensionBuckets(variable.name, variable.scopes || []);
      for (const n of Object.values(await variableNumbers(variable))) {
        if (buckets.gap) add(localValues.gap, n, variable.name);
        if (buckets.radius) add(localValues.radius, n, variable.name);
      }
    }
  }));
  return { sets: [...sets.values()], components: [...components.values()], nodes, cache: lib.cache || null, tokens: lib.tokens || null, localValues };
}

// Reads the INVENTORY documented in figma-compose.mjs, plus the live nodes the
// writer needs, keyed by id. With spec.library (mode b) the library side is merged
// in (figma-compose-library.mjs), and componentsPage may be left out.
async function composeReadInventory(spec) {
  const pages = [spec.componentsPage, spec.iconsPage].filter(Boolean).map(composeRequirePage);
  const setNodes = new Map();
  const sets = [];
  const components = [];
  for (const page of pages) {
    await page.loadAsync();
    for (const set of page.findAllWithCriteria({ types: ['COMPONENT_SET'] })) {
      setNodes.set(set.id, set);
      sets.push({ name: set.name, id: set.id, page: page.name, autoLayout: composeSetAutoLayout(set), props: composeSetProps(set) });
    }
    for (const component of page.findAllWithCriteria({ types: ['COMPONENT'] })) {
      if (component.parent && component.parent.type === 'COMPONENT_SET') continue;
      components.push({ name: component.name, id: component.id, page: page.name });
    }
  }
  const variableNodes = new Map();
  const variables = [];
  const localVariables = await figma.variables.getLocalVariablesAsync();
  for (const variable of localVariables) {
    variableNodes.set(variable.id, variable);
    let kinds = [];
    if (variable.resolvedType === 'COLOR') kinds = ['colour'];
    else if (variable.resolvedType === 'FLOAT') {
      const buckets = dimensionBuckets(variable.name, variable.scopes || []);
      kinds = [buckets.gap && 'gap', buckets.radius && 'radius'].filter(Boolean);
    }
    variables.push({ name: variable.name, id: variable.id, kinds });
  }
  const styleNodes = new Map();
  const textStyles = [];
  for (const style of await figma.getLocalTextStylesAsync()) {
    styleNodes.set(style.id, style);
    textStyles.push({ name: style.name, id: style.id });
  }
  const collectionNodes = new Map();
  const collections = [];
  for (const collection of await figma.variables.getLocalVariableCollectionsAsync()) {
    collectionNodes.set(collection.id, collection);
    collections.push({ name: collection.name, id: collection.id, modes: collection.modes.map((m) => ({ name: m.name, id: m.modeId })) });
  }
  const local = { sets, components, variables, textStyles, collections, target: null };
  const library = spec.library ? await composeReadLibrary(spec, localVariables) : null;
  return {
    inventory: library ? mergeLibraryInventory(local, library) : local,
    live: { setNodes, variableNodes, collectionNodes, styleNodes, styled: [], libraryNodes: library ? library.nodes : new Map() },
  };
}

// Figma plugin-API reader for the screens half of drift, read-only. This file is
// NOT a Node module — build-figma-checks.mjs concatenates it after the inlined
// figma-adherence.mjs (dimensionBuckets), figma-compose.mjs (resolveScreen) and
// figma-compose-read.figma.js (page lookup, the marker, the inventory) into the
// screens snippet of references/figma-drift.md.
// It carries no writer. Untested in Node beyond the generator's tests.
//
// Entry point: runDriftScreens(SPEC), SPEC = { entries }
//   entries: the figma entries of design-system/screens.json, as stored
//   → { screens: [{ screen, page, state, errors }] }
//     state: clean | broken (the description no longer resolves) | gone | released

async function driftScreens(spec) {
  const inventories = new Map();
  const screens = [];
  for (const entry of spec.entries || []) {
    const row = { screen: entry.screen, page: entry.target, state: 'clean', errors: [] };
    screens.push(row);
    const page = composeFindPage(entry.target);
    if (!page) { row.state = 'gone'; row.errors.push(`no page named "${entry.target}"`); continue; }
    await page.loadAsync();
    const frames = composeTopFrames(page, entry.screen);
    if (!frames.length) { row.state = 'gone'; row.errors.push(`no frame named "${entry.screen}" on "${entry.target}"`); continue; }
    if (!frames.some(composeIsMarked)) { row.state = 'released'; continue; }
    const key = `${entry.componentsPage}\u0000${entry.iconsPage || ''}`;
    if (!inventories.has(key)) {
      // A components page renamed since is this entry's finding, not the run's end.
      try {
        inventories.set(key, (await composeReadInventory({ componentsPage: entry.componentsPage, iconsPage: entry.iconsPage })).inventory);
      } catch (e) {
        inventories.set(key, { error: e.message });
      }
    }
    const inventory = inventories.get(key);
    if (inventory.error) { row.state = 'broken'; row.errors.push(inventory.error); continue; }
    const res = resolveScreen(entry.plan, inventory);
    if (!res.ok) {
      row.state = 'broken';
      row.errors = res.errors.map((e) => `${e.kind} at ${e.path}: ${e.asked}${e.nearest && e.nearest.length ? ` (nearest: ${e.nearest.join(', ')})` : ''}`);
    }
  }
  return { screens };
}

async function runDriftScreens(SPEC) {
  return driftScreens(SPEC || {});
}
```

## The components snippet

```js
// Figma plugin-API reader for the components half of drift, read-only. This file
// is NOT a Node module — build-figma-checks.mjs copies it, with nothing inlined,
// into the components snippet of references/figma-drift.md, which an agent
// carries by hand, so it stays small. The comparison with each doc record happens
// in Node (drift-check.mjs compare-components).
// Untested in Node beyond the generator's tests.
//
// Entry point: runDriftComponents(SPEC), SPEC = { names, componentsPage? }
//   names: the documented components (drift-check.mjs check --json, components.documented)
//   componentsPage: the page to read; without it, the one page whose folded name is
//     "components". Only that page is loaded.
//   → { page, components: { <name as asked>: { axes: { <axis>: [options] } } | null } }
//     null when no component set on the page folds to that name.

const driftFold = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function driftComponentsPage(name) {
  const pages = figma.root.children;
  if (name !== undefined && name !== null) {
    const exact = pages.find((p) => p.name === name);
    if (exact) return exact;
    const trimmed = pages.filter((p) => p.name.trim() === String(name).trim());
    if (trimmed.length === 1) return trimmed[0];
    throw new Error(`${trimmed.length ? `${trimmed.length} pages are` : 'no page is'} named "${name}"; pages: ${pages.map((p) => p.name).join(', ')}`);
  }
  const found = pages.filter((p) => driftFold(p.name) === 'components');
  if (found.length === 1) return found[0];
  throw new Error(`${found.length ? `${found.length} pages` : 'no page'} named like "Components"; pass componentsPage. Pages: ${pages.map((p) => p.name).join(', ')}`);
}

// The getter throws when Figma flags the set as conflicting (duplicate variant
// combinations). Fall back to the axes and values the children declare.
function driftAxes(set) {
  try {
    return Object.fromEntries(Object.entries(set.variantGroupProperties).map(([axis, { values }]) => [axis, values]));
  } catch {
    const axes = {};
    for (const child of set.children) {
      for (const [axis, value] of Object.entries(child.variantProperties || {})) {
        axes[axis] = axes[axis] || [];
        if (!axes[axis].includes(value)) axes[axis].push(value);
      }
    }
    return axes;
  }
}

async function runDriftComponents(SPEC) {
  const spec = SPEC || {};
  const page = driftComponentsPage(spec.componentsPage);
  await page.loadAsync();
  const sets = page.findAllWithCriteria({ types: ['COMPONENT_SET'] });
  const components = {};
  for (const name of spec.names || []) {
    const set = sets.find((s) => driftFold(s.name) === driftFold(name));
    components[name] = set ? { axes: driftAxes(set) } : null;
  }
  return { page: page.name, components };
}
```
