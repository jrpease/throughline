# Figma screen composition (GENERATED)

> **GENERATED FILE — do not edit by hand.** Sources: `scripts/lib/figma-adherence.mjs`
> (for `dimensionBuckets`), `scripts/lib/figma-compose.mjs` (the pure resolver,
> unit-tested in Node), `scripts/lib/figma-variables-read.figma.js` +
> `scripts/lib/figma-compose.figma.js` (the reader and writer). Regenerate with
> `node scripts/build-figma-checks.mjs`; CI gates freshness with `--check`.

The canonical `figma_execute` snippet that composes a screen from the file's own
component sets, variables and text styles. A screen is a short JSON description
written only in those names (its shape is the `DESCRIPTION` comment in the
snippet, at the top of the resolver).
The whole description is checked before anything is written: an unknown component,
property, option, variable or text style, a variable of the wrong kind, or a name
already held by a screen a person made, comes back as a list of errors and the file
is untouched. A component the file lacks is a `missing-component` error with the
nearest names: report it as a gap, never draw a lookalike. Every value the script
writes is bound to a variable. The script is the rule; do not re-write it by hand.

## How to call it

1. Paste the snippet below into `figma_execute` with `timeout: 30000`, and end it
   with `return await runCompose(MODE, SPEC);`, one mode per call:
   - `'inventory'`, `SPEC = { componentsPage, iconsPage }`: read-only. Returns
     `{ summary }`: each set's properties and options and whether it has auto
     layout, swap targets, variables by kind (colour, gap, radius), text styles and
     modes. Plan only from these names.
     `iconsPage` is optional; pass it when a swap property needs its targets.
   - `'build'`, `SPEC = { componentsPage, iconsPage, description, fileKey }`:
     returns `{ ok: false, errors }` with nothing written, or builds the screen into
     a top-level frame `WIP: <screen>` on the description's page (created if
     missing) and returns `{ ok: true, wipId, wipName, link, ms }`. A throw during
     the write removes the `WIP:` frame (and a page the build created) before it
     rethrows, so nothing is left half-built: report it as a composer bug.
   - `'finalize'`, `SPEC = { page, screen, fileKey }`: renames `WIP: <screen>` to
     `<screen>`, replacing a screen of that name only if throughline composed it.
     Returns `{ id, link, replaced }`.
   - `'discard'`, `SPEC = { page, screen }`: removes `WIP: <screen>`. Only when
     the user asks.
2. Between `build` and `finalize`, run the screen gate
   (`references/figma-adherence.md`) with `screens: ['WIP: <screen>']`. Finalize
   only a passing screen. A failure is a composer bug: report it and leave the
   `WIP:` frame.
3. Pages are found by exact name, or else the one page whose trimmed name matches.
   Only the named pages are loaded. Components and variables are the file's local
   ones.

```js
const MODE = 'build';
const SPEC = { componentsPage: 'Components', iconsPage: 'Icons', fileKey: '<figma.fileKey>', description: {
  screen: 'Sign in', page: 'Screens', width: 390, modes: { 'Color / Semantic': 'Light' },
  root: { layout: 'vertical', gap: 'space/gap/md', padding: 'space/inset/lg', fill: 'color/bg/canvas', children: [
    { text: 'Sign in', style: 'Heading/L', color: 'color/text/primary' },
    { component: 'Input', props: { placeholder: 'Email' }, sizing: { horizontal: 'fill' } },
    { component: 'Button', props: { label: 'Sign in', hasTrailing: true, trailingIcon: 'icon/arrow-right' } },
  ] },
} };
// … the generated snippet …
return await runCompose(MODE, SPEC);
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
//   Every visual value is a variable or text-style name.
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
//   }
//
// resolveScreen(description, inventory) → { ok, errors, plan }
//   errors: [{ kind, path, asked, nearest? }]; path is the node's place in the
//   description ('root.children[2].slots.Body[0]').
//   plan (only when ok): the same tree with every name replaced by ids, real
//   property keys and values, and Figma's enum spellings.

const COMPOSE_ERROR_KINDS = [
  'invalid', 'name-taken', 'missing-component', 'unknown-prop', 'unknown-option',
  'prop-type', 'missing-swap-target', 'unknown-variable', 'variable-kind',
  'unknown-text-style', 'unknown-mode',
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

  const modes = [];
  for (const [collectionName, modeName] of Object.entries(d.modes || {})) {
    const collection = byFold(inv.collections, collectionName);
    const mode = collection && byFold(collection.modes, String(modeName));
    if (!collection) fail('unknown-mode', `modes.${collectionName}`, collectionName, nearestNames(collectionName, inv.collections.map((c) => c.name)));
    else if (!mode) fail('unknown-mode', `modes.${collectionName}`, String(modeName), nearestNames(String(modeName), collection.modes.map((m) => m.name)));
    else modes.push({ collectionId: collection.id, modeId: mode.id });
  }

  function variable(name, kind, path) {
    if (name === undefined || name === null) return null;
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
    plan: ok ? { screen: d.screen, page: d.page, width: d.width, height: d.height ?? null, modes, root } : null,
  };
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

// Figma plugin-API reader and writer for screen composition. This file is NOT a
// Node module — build-figma-checks.mjs concatenates it after the inlined
// figma-adherence.mjs (for dimensionBuckets), figma-compose.mjs (resolveScreen)
// and figma-variables-read.figma.js into references/figma-compose.md, and the
// result runs inside figma_execute.
// Constraints honored here (see references/figma-scripting.md and the spec,
// docs/specs/2026-10-13-compose-figma-screen.md): async getters only; only the
// named pages are loaded; never instance.mainComponent; never getNodeByIdAsync in
// a loop (nodes come from the pages already loaded). Nothing is written until the
// whole description resolves. Every choice of key, value and variable is made by
// the unit-tested resolveScreen; this file only applies its plan. Untested in Node
// beyond the generator's fake-Figma test.
// Awaits are few and fixed, not per node: every font the screen needs is loaded
// in one batch before writing, and every text style is applied in one batch
// after. Live on 2026-10-13, a build awaiting per text layer stalled after about
// twenty awaits and timed out; the bridge then resumed it only when later calls
// arrived (references/figma-scripting.md, "Pass an explicit timeout").
//
// Entry point: runCompose(MODE, SPEC), MODE one of
//   'inventory' SPEC = { componentsPage, iconsPage? }               → { summary }
//   'build'     SPEC = { componentsPage, iconsPage?, description, fileKey }
//                                                                  → { ok, errors } | { ok, wipId, wipName, link, ms }
//   'finalize'  SPEC = { page, screen, fileKey }                   → { id, link, replaced }
//   'discard'   SPEC = { page, screen }                            → { removed }

const COMPOSE_NS = 'throughline';
const COMPOSE_KEY = 'composedScreen';
const COMPOSE_CORNERS = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
const COMPOSE_PADDING = { top: 'paddingTop', right: 'paddingRight', bottom: 'paddingBottom', left: 'paddingLeft' };

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
const composeLink = (fileKey, id) => `https://www.figma.com/design/${fileKey}?node-id=${String(id).replace(/:/g, '-')}`;

// 'marked' | 'unmarked' | null for the top-level frames called `name`.
function composeNameState(page, name) {
  const frames = composeTopFrames(page, name);
  if (!frames.length) return null;
  return frames.every(composeIsMarked) ? 'marked' : 'unmarked';
}

// Reads the INVENTORY documented in figma-compose.mjs, plus the live nodes the
// writer needs, keyed by id.
async function composeReadInventory(spec) {
  const pages = [spec.componentsPage, spec.iconsPage].filter(Boolean).map(composeRequirePage);
  const setNodes = new Map();
  const sets = [];
  const components = [];
  for (const page of pages) {
    await page.loadAsync();
    for (const set of page.findAllWithCriteria({ types: ['COMPONENT_SET'] })) {
      setNodes.set(set.id, set);
      // Every variant, since the writer switches variant before filling a slot.
      const slotNodes = set.findAll((n) => n.type === 'SLOT');
      const props = Object.entries(set.componentPropertyDefinitions).map(([key, def]) => {
        const prop = { key, name: key.replace(/#[^#]*$/, ''), type: def.type };
        if (def.variantOptions) prop.options = def.variantOptions;
        if (def.type === 'SLOT') {
          const slots = slotNodes.filter((n) => n.componentPropertyReferences && n.componentPropertyReferences.slotContentId === key);
          prop.slotLayout = slots.length && slots.every((n) => n.layoutMode !== 'NONE') ? slots[0].layoutMode : 'NONE';
        }
        return prop;
      });
      const autoLayout = set.children.every((v) => v.layoutMode && v.layoutMode !== 'NONE');
      sets.push({ name: set.name, id: set.id, page: page.name, autoLayout, props });
    }
    for (const component of page.findAllWithCriteria({ types: ['COMPONENT'] })) {
      if (component.parent && component.parent.type === 'COMPONENT_SET') continue;
      components.push({ name: component.name, id: component.id, page: page.name });
    }
  }
  const variableNodes = new Map();
  const variables = [];
  for (const variable of await figma.variables.getLocalVariablesAsync()) {
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
  return {
    inventory: { sets, components, variables, textStyles, collections, target: null },
    live: { setNodes, variableNodes, collectionNodes, styleNodes, styled: [] },
  };
}

// What the planner reads: names only, grouped.
function composeSummary(inventory) {
  const byKind = (kind) => inventory.variables.filter((v) => v.kinds.includes(kind)).map((v) => v.name);
  return {
    sets: inventory.sets.map((s) => ({
      name: s.name,
      autoLayout: s.autoLayout,
      props: Object.fromEntries(s.props.map((p) => [
        p.name,
        p.type === 'VARIANT' ? p.options : p.type === 'SLOT' ? `SLOT (${p.slotLayout})` : p.type,
      ])),
    })),
    swapTargets: inventory.components.map((c) => c.name),
    variables: { colour: byKind('colour'), gap: byKind('gap'), radius: byKind('radius') },
    textStyles: inventory.textStyles.map((s) => s.name),
    modes: Object.fromEntries(inventory.collections.map((c) => [c.name, c.modes.map((m) => m.name)])),
  };
}

function composeBoundPaint(variable) {
  return figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', variable);
}

// Only the axes the plan names; the others stay as Figma made the node.
function composeSizing(node, sizing) {
  if (!sizing) return;
  if (sizing.horizontal) node.layoutSizingHorizontal = sizing.horizontal;
  if (sizing.vertical) node.layoutSizingVertical = sizing.vertical;
}

function composeStyleFrame(frame, plan, live) {
  const v = (id) => live.variableNodes.get(id);
  frame.name = plan.name;
  frame.layoutMode = plan.layoutMode;
  frame.primaryAxisAlignItems = plan.primaryAxisAlignItems;
  frame.counterAxisAlignItems = plan.counterAxisAlignItems;
  // A new frame starts with a white fill; left in place it would be a raw colour.
  frame.fills = plan.fill ? [composeBoundPaint(v(plan.fill))] : [];
  if (plan.stroke) {
    frame.strokes = [composeBoundPaint(v(plan.stroke))];
    frame.strokeWeight = 1;
  }
  if (plan.itemSpacing) frame.setBoundVariable('itemSpacing', v(plan.itemSpacing));
  for (const [side, id] of Object.entries(plan.padding || {})) {
    if (id) frame.setBoundVariable(COMPOSE_PADDING[side], v(id));
  }
  if (plan.radius) for (const corner of COMPOSE_CORNERS) frame.setBoundVariable(corner, v(plan.radius));
}

const composeFontKey = (f) => `${f.family}\u0000${f.style}`;

// Every font the plan can touch: each text style it uses, every text layer in
// each component set it places (any variant can be switched to), and Inter
// Regular, which a new text node starts in.
function composeFontsFor(plan, live) {
  const fonts = new Map([[composeFontKey({ family: 'Inter', style: 'Regular' }), { family: 'Inter', style: 'Regular' }]]);
  const add = (f) => fonts.set(composeFontKey(f), { family: f.family, style: f.style });
  const seenSets = new Set();
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'text') add(live.styleNodes.get(node.styleId).fontName);
    if (node.type === 'component' && !seenSets.has(node.setId)) {
      seenSets.add(node.setId);
      for (const text of live.setNodes.get(node.setId).findAll((n) => n.type === 'TEXT')) {
        if (text.fontName !== figma.mixed) add(text.fontName);
        else for (const f of text.getRangeAllFontNames(0, text.characters.length)) add(f);
      }
    }
    for (const child of node.children || []) walk(child);
    for (const slot of node.slots || []) slot.nodes.forEach(walk);
  };
  walk(plan.root);
  return [...fonts.values()];
}

// Synchronous: fonts are already loaded, and text styles are applied afterwards
// in one batch from live.styled.
function composeNode(plan, parent, live) {
  if (plan.type === 'frame') {
    const frame = figma.createFrame();
    parent.appendChild(frame);
    composeStyleFrame(frame, plan, live);
    for (const child of plan.children) composeNode(child, frame, live);
    composeSizing(frame, plan.sizing);
    return frame;
  }
  if (plan.type === 'text') {
    const text = figma.createText();
    parent.appendChild(text);
    text.name = plan.name;
    text.characters = plan.characters;
    text.fills = [composeBoundPaint(live.variableNodes.get(plan.color))];
    composeSizing(text, plan.sizing);
    live.styled.push([text, plan.styleId]);
    return text;
  }
  const set = live.setNodes.get(plan.setId);
  const instance = set.defaultVariant.createInstance();
  parent.appendChild(instance);
  instance.name = plan.name;
  // Variant first: switching variant can swap the text layers the TEXT props drive.
  if (Object.keys(plan.variantProps).length) instance.setProperties(plan.variantProps);
  if (Object.keys(plan.otherProps).length) instance.setProperties(plan.otherProps);
  for (const slotPlan of plan.slots) {
    const slot = instance.findAll((n) => n.type === 'SLOT')
      .find((n) => n.componentPropertyReferences && n.componentPropertyReferences.slotContentId === slotPlan.key);
    if (!slot) throw new Error(`no slot ${slotPlan.key} on ${set.name}`);
    for (const placeholder of [...slot.children]) placeholder.remove();
    for (const child of slotPlan.nodes) composeNode(child, slot, live);
  }
  composeSizing(instance, plan.sizing);
  return instance;
}

async function composeBuild(spec) {
  const started = Date.now();
  const { inventory, live } = await composeReadInventory(spec);
  const d = spec.description || {};
  let page = typeof d.page === 'string' ? composeFindPage(d.page) : null;
  if (page) {
    await page.loadAsync();
    inventory.target = { screen: composeNameState(page, d.screen), wip: composeNameState(page, `WIP: ${d.screen}`) };
  }
  const resolved = resolveScreen(d, inventory);
  if (!resolved.ok) return { ok: false, errors: resolved.errors };
  const plan = resolved.plan;
  await Promise.all(composeFontsFor(plan, live).map((f) => figma.loadFontAsync(f)));
  const createdPage = !page;
  if (!page) {
    page = figma.createPage();
    page.name = plan.page;
  }
  const wipName = `WIP: ${plan.screen}`;
  for (const old of composeTopFrames(page, wipName)) old.remove();
  const right = page.children.reduce((max, n) => Math.max(max, n.x + n.width), 0);
  const root = figma.createFrame();
  try {
    page.appendChild(root);
    root.setSharedPluginData(COMPOSE_NS, COMPOSE_KEY, JSON.stringify(d));
    composeStyleFrame(root, plan.root, live);
    root.name = wipName;
    root.x = page.children.length > 1 ? right + 200 : 0;
    root.y = 0;
    root.resize(plan.width, plan.height || 100);
    root.layoutSizingHorizontal = 'FIXED';
    root.layoutSizingVertical = plan.height ? 'FIXED' : 'HUG';
    for (const { collectionId, modeId } of plan.modes) {
      root.setExplicitVariableModeForCollection(live.collectionNodes.get(collectionId), modeId);
    }
    for (const child of plan.root.children) composeNode(child, root, live);
    await Promise.all(live.styled.map(([text, styleId]) => text.setTextStyleIdAsync(styleId)));
  } catch (error) {
    // A throw mid-write is a composer bug, not a finding: leave nothing behind.
    root.remove();
    if (createdPage) page.remove();
    throw new Error(`build failed and was rolled back, nothing written: ${error.message}`);
  }
  return { ok: true, wipId: root.id, wipName, link: composeLink(spec.fileKey || figma.fileKey, root.id), ms: Date.now() - started };
}

async function composeFinalize(spec) {
  const page = composeRequirePage(spec.page);
  await page.loadAsync();
  const wips = composeTopFrames(page, `WIP: ${spec.screen}`);
  if (wips.length !== 1 || !composeIsMarked(wips[0])) {
    throw new Error(`expected one composed frame "WIP: ${spec.screen}" on "${page.name}", found ${wips.length}${wips.length === 1 ? ' without the composed marker' : ''}`);
  }
  const wip = wips[0];
  const existing = composeTopFrames(page, spec.screen);
  if (existing.some((n) => !composeIsMarked(n))) {
    throw new Error(`"${spec.screen}" on "${page.name}" wasn't composed by throughline; not replacing it. "WIP: ${spec.screen}" is left in place.`);
  }
  if (existing.length) {
    const old = existing[0];
    old.parent.insertChild(old.parent.children.indexOf(old), wip);
    wip.x = old.x;
    wip.y = old.y;
    for (const n of existing) n.remove();
  }
  wip.name = spec.screen;
  return { id: wip.id, link: composeLink(spec.fileKey || figma.fileKey, wip.id), replaced: existing.length > 0 };
}

async function composeDiscard(spec) {
  const page = composeRequirePage(spec.page);
  await page.loadAsync();
  const wips = composeTopFrames(page, `WIP: ${spec.screen}`);
  if (wips.some((n) => !composeIsMarked(n))) throw new Error(`"WIP: ${spec.screen}" wasn't composed by throughline; not removing it`);
  for (const wip of wips) wip.remove();
  return { removed: wips.length };
}

async function runCompose(MODE, SPEC) {
  if (MODE === 'inventory') return { summary: composeSummary((await composeReadInventory(SPEC)).inventory) };
  if (MODE === 'build') return composeBuild(SPEC);
  if (MODE === 'finalize') return composeFinalize(SPEC);
  if (MODE === 'discard') return composeDiscard(SPEC);
  throw new Error(`unknown MODE ${JSON.stringify(MODE)}: inventory, build, finalize or discard`);
}
```
