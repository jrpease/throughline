# Figma screen composition (GENERATED)

> **GENERATED FILE — do not edit by hand.** Sources: `scripts/lib/figma-adherence.mjs`
> (for `dimensionBuckets`), `scripts/lib/figma-compose.mjs` (the pure resolver,
> unit-tested in Node), `scripts/lib/figma-variables-read.figma.js`,
> `scripts/lib/design-mode.mjs` (the mode check), `scripts/lib/figma-compose-library.mjs`
> (the library merge), `scripts/lib/figma-compose-read.figma.js` (the reader),
> `scripts/lib/design-mode-read.figma.js` and `scripts/lib/library-read.figma.js`
> (the mode and library readers) + `scripts/lib/figma-compose.figma.js` (the
> writer). Regenerate with
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
   - `'signals'`, `SPEC = { pages, manifestFileKey, openFileKey, forced }`: read-only.
     `openFileKey` is `figma_get_status`'s `currentFileKey`; `manifestFileKey` is
     `design-system.json`'s `figma.fileKey`, or null; `forced` is `'b'` or `'c'`
     when the user asked to ignore the system or the library. Returns
     `{ signals, mode, libraryDetected, reason }`; announce `reason`.
   - `'library-list'`, `SPEC = {}`: read-only. Every enabled library variable
     collection with its variables' names and keys. Save it unchanged and pass it
     to `design-workspace.mjs cache init`.
   - `'library-import'`, `SPEC = { keys }`, at most 20 keys a call: imports those
     library variables (invisible; no layers change) and returns `{ entries,
     skipped }`: their values, aliases followed, and the names of any whose
     collection couldn't be read. Save each return unchanged and pass it
     to `design-workspace.mjs cache merge`. The file must be the tab in front:
     imports hang otherwise.
   Mode b: `inventory` and `build` also take `library = { pages, components,
   cache, tokens }` (`pages`: where library instances are read; `components`:
   `[{ key, type: 'COMPONENT_SET' | 'COMPONENT' }]`, reshaped from
   `figma_get_library_components`, if run; `cache` and `tokens`: from
   `design-workspace.mjs cache get` and `tokens`). The library wins a name clash,
   `componentsPage` may be left out, and a colour, gap, radius or one padding side
   may be `{ raw: '#rrggbb' }` or `{ raw: 12 }` where no variable holds the value
   (`raw-has-variable` names the one that does). `build` then also returns
   `localPicks` (local parts the screen used), `raws`, and `staleCache`
   (`{ entries }` to pass to `cache merge`).
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

// Which mode a Figma run is in, as a pure function of what the open file has.
// ZERO imports, `export const`/`export function` only. It is inlined into the
// generated compose script (references/figma-compose.md) by build-figma-checks.mjs,
// so it must run in both Node and the Figma plugin sandbox, and reuse none of the
// top-level names it is inlined with.
//
// Spec: docs/specs/2026-10-30-design-modes.md (Q3)
//
// detectMode(signals) → { mode, libraryDetected, reason }
//   signals: {
//     manifestFileKey,     // design-system.json's figma.fileKey, or null
//     openFileKey,         // figma_get_status's currentFileKey, never figma.fileKey
//     libraryCollections,  // enabled library variable collections
//     remoteInstances,     // instances of library components on the loaded pages
//     localVariables, localSets,
//     forced,              // 'b' | 'c' | null: the user asked to ignore the system or library
//   }

const DESIGN_MODE_RANK = { a: 3, b: 2, c: 1 };

const DESIGN_MODE_REASONS = {
  a: 'Mode a: building from this file\'s throughline design system. Every value is bound to the system, and the screen is recorded for drift.',
  b: 'Mode b: building from the connected library first, then this file\'s own components and variables. A raw value is allowed only where no variable holds it, and each one is listed; text styles come from this file only; no drift tracking.',
  bLocal: 'Mode b: no library is connected, so building from this file\'s own components and variables. A raw value is allowed only where no variable holds it, and each one is listed; no drift tracking.',
  c: 'Mode c: this file has no design system, library or variables, so screens are built from frames to auto-layout standards. Nothing is bound to variables, and no gaps or drift are recorded.',
  cLowered: 'Mode c: ignoring this file\'s system, library and variables as you asked, so screens are built from frames to auto-layout standards. Nothing is bound to variables, and no gaps or drift are recorded.',
};

function detectMode(signals) {
  const s = signals || {};
  const count = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
  const libraryDetected = count(s.libraryCollections) + count(s.remoteInstances) > 0;
  let detected;
  if (s.manifestFileKey && s.openFileKey && s.manifestFileKey === s.openFileKey) detected = 'a';
  else if (libraryDetected || count(s.localVariables) + count(s.localSets) > 0) detected = 'b';
  else detected = 'c';

  let mode = detected;
  let note = '';
  if (s.forced === 'b' || s.forced === 'c') {
    if (DESIGN_MODE_RANK[s.forced] < DESIGN_MODE_RANK[detected]) {
      mode = s.forced;
      note = ` (lowered from mode ${detected} because you asked)`;
    } else if (s.forced !== detected) {
      note = ` (you asked for mode ${s.forced}, but a mode can only be lowered, never raised, so this stays mode ${detected})`;
    }
  }
  let base = DESIGN_MODE_REASONS[mode];
  if (mode === 'b' && !libraryDetected) base = DESIGN_MODE_REASONS.bLocal;
  if (mode === 'c' && detected !== 'c') base = DESIGN_MODE_REASONS.cLowered;
  return { mode, libraryDetected: mode === 'b' && libraryDetected, reason: base.replace(/^Mode (\w):/, `Mode $1${note}:`) };
}

// The library side of a mode b inventory, as a pure merge: library sets, swap
// targets, variables and collections joined to the file's own, the library
// winning a name clash. ZERO imports, `export const`/`export function` only. It is
// inlined into the generated compose and drift scripts (references/figma-compose.md,
// references/figma-drift.md) by build-figma-checks.mjs, so it must run in both Node
// and the Figma plugin sandbox, and reuse none of the top-level names it is inlined
// with. It depends on nothing else, so it carries its own copy of composeFold.
//
// Spec: docs/specs/2026-10-30-design-modes.md (Q5, Q7, Q8, Q9)
//
// mergeLibraryInventory(local, library) → the resolver's INVENTORY (figma-compose.mjs)
//   plus allowRaw: true and valueIndex.
//   local:   the reader's own inventory (sets, components, variables, textStyles,
//            collections, target)
//   library: {
//     sets:       [{ name, key, autoLayout, props }],  // read from remote main components
//     components: [{ name, key }],                     // remote standalone components, the swap targets
//     cache:      design/library-cache.json, or null
//     tokens:     design-workspace.mjs tokens, or null
//     localValues: { colours, gap, radius }            // the file's own variables, same shape
//   }
// Library ids are 'lib:<key>'. Text styles stay local.

const LIBRARY_ID_PREFIX = 'lib:';
const libraryId = (key) => `${LIBRARY_ID_PREFIX}${key}`;
const isLibraryId = (id) => typeof id === 'string' && id.startsWith(LIBRARY_ID_PREFIX);
const libraryFold = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Library entries first; a local entry whose folded name a library entry holds is
// dropped. Duplicates within the library (one key seen twice) keep the first.
function libraryFirst(libraryItems, localItems) {
  const seenKeys = new Set();
  const lib = [];
  for (const item of libraryItems) {
    if (seenKeys.has(item.id)) continue;
    seenKeys.add(item.id);
    lib.push(item);
  }
  const taken = new Set(lib.map((x) => libraryFold(x.name)));
  return [...lib, ...localItems.filter((x) => !taken.has(libraryFold(x.name)))];
}

function libraryValueIndex(tokens, localValues) {
  const out = { colours: {}, gap: {}, radius: {} };
  for (const source of [tokens, localValues]) {
    for (const table of ['colours', 'gap', 'radius']) {
      for (const [value, names] of Object.entries((source && source[table]) || {})) {
        const into = out[table][value] || (out[table][value] = []);
        for (const name of names) if (!into.includes(name)) into.push(name);
      }
    }
  }
  return out;
}

function mergeLibraryInventory(local, library) {
  const loc = { sets: [], components: [], variables: [], textStyles: [], collections: [], target: null, ...local };
  const lib = library || {};
  const sets = (lib.sets || []).map((s) => ({ name: s.name, id: libraryId(s.key), page: null, autoLayout: s.autoLayout, props: s.props || [] }));
  const components = (lib.components || []).map((c) => ({ name: c.name, id: libraryId(c.key), page: null }));
  const variables = [];
  const collections = [];
  for (const entry of Object.values((lib.cache && lib.cache.libraries) || {})) {
    for (const [key, c] of Object.entries(entry.collections || {})) {
      collections.push({ name: c.name, id: libraryId(key), modes: (c.modes || []).map((m) => ({ name: m.name, id: m.id })) });
    }
    for (const [key, v] of Object.entries(entry.variables || {})) {
      variables.push({ name: v.name, id: libraryId(key), kinds: v.kinds || [] });
    }
  }
  return {
    sets: libraryFirst(sets, loc.sets),
    components: libraryFirst(components, loc.components),
    variables: libraryFirst(variables, loc.variables),
    textStyles: loc.textStyles,
    collections: libraryFirst(collections, loc.collections),
    target: loc.target,
    allowRaw: true,
    valueIndex: libraryValueIndex(lib.tokens, lib.localValues),
  };
}

// The local sets and swap targets a resolved plan uses, by name: Q7's localPicks.
function libraryLocalPicks(plan, inventory) {
  const nameOf = new Map([...inventory.sets, ...inventory.components].map((x) => [x.id, x.name]));
  const picks = new Set();
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'component') {
      if (!isLibraryId(node.setId)) picks.add(nameOf.get(node.setId));
      for (const value of Object.values(node.otherProps || {})) {
        if (nameOf.has(value) && !isLibraryId(value)) picks.add(nameOf.get(value));
      }
    }
    for (const child of node.children || []) walk(child);
    for (const slot of node.slots || []) slot.nodes.forEach(walk);
  };
  walk(plan && plan.root);
  return [...picks].filter(Boolean).sort();
}

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

// Figma plugin-API reader for the mode signals, read-only. This file is NOT a Node
// module: build-figma-checks.mjs inlines it into references/figma-compose.md after
// the compose reader (for composeFindPage) and design-mode.mjs (detectMode).
// Async getters only. Untested in Node beyond the generator's fake-Figma test.
//
// Spec: docs/specs/2026-10-30-design-modes.md (Q3, Q5)
//
// readModeSignals({ pages, manifestFileKey, openFileKey, forced })
//   → { signals, mode, libraryDetected, reason }
// Only the named pages are loaded and walked. The instance walk stops at the first
// library instance: detection needs one, and every instance costs an await.

async function readModeSignals(spec) {
  const libraryCollections = (await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()).length;
  let remoteInstances = 0;
  let localSets = 0;
  for (const name of spec.pages || []) {
    const page = composeFindPage(name);
    if (!page) continue;
    await page.loadAsync();
    localSets += page.findAllWithCriteria({ types: ['COMPONENT_SET'] }).filter((s) => !s.remote).length;
    if (remoteInstances) continue;
    const instances = page.findAllWithCriteria({ types: ['INSTANCE'] });
    for (let i = 0; i < instances.length && !remoteInstances; i += 20) {
      const mains = await Promise.all(instances.slice(i, i + 20).map((n) => n.getMainComponentAsync()));
      if (mains.some((m) => m && m.remote)) remoteInstances = 1;
    }
  }
  const localVariables = (await figma.variables.getLocalVariablesAsync()).length;
  const signals = {
    manifestFileKey: spec.manifestFileKey || null,
    openFileKey: spec.openFileKey || null,
    libraryCollections, remoteInstances, localVariables, localSets,
    forced: spec.forced || null,
  };
  return { signals, ...detectMode(signals) };
}

// Figma plugin-API reader for a connected library's variables. This file is NOT a
// Node module: build-figma-checks.mjs inlines it into references/figma-compose.md
// after figma-adherence.mjs (dimensionBuckets) and figma-variables-read.figma.js
// (variableColors, variableNumbers). Untested in Node beyond the generator's
// fake-Figma test.
//
// Spec: docs/specs/2026-10-30-design-modes.md (Q9). Live on 2026-10-30, importing
// hung while the file was behind another tab and took 201 ms with it in front;
// 20 imports in one Promise.all took 396 ms.
//
// libraryList() → { collections: [{ library, key, name, variables: [{ key, name, resolvedType }] }] }
//   Names and keys only: Figma's library listing carries no values.
// libraryImport({ keys }) → { entries: [cache-shaped entry], skipped: [name] }, at most
//   20 keys a call. skipped: variables whose collection couldn't be read.
//   Importing adds the library variables to the file (invisible; no layers change).
//   Aliases are followed to a concrete value; one that can't be followed is null.

const LIBRARY_IMPORT_LIMIT = 20;

async function libraryList() {
  const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  const variables = await Promise.all(collections.map((c) => figma.teamLibrary.getVariablesInLibraryCollectionAsync(c.key)));
  return {
    collections: collections.map((c, i) => ({
      library: c.libraryName, key: c.key, name: c.name,
      variables: variables[i].map((v) => ({ key: v.key, name: v.name, resolvedType: v.resolvedType })),
    })),
  };
}

// A cache entry for an imported (or already present) library variable.
async function libraryEntry(variable) {
  const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  let kinds = [];
  let values = {};
  if (variable.resolvedType === 'COLOR') {
    kinds = ['colour'];
    values = (await variableColors(variable)).modes;
  } else if (variable.resolvedType === 'FLOAT') {
    const buckets = dimensionBuckets(variable.name, variable.scopes || []);
    kinds = [buckets.gap && 'gap', buckets.radius && 'radius'].filter(Boolean);
    values = await variableNumbers(variable);
  }
  return {
    key: variable.key, name: variable.name, resolvedType: variable.resolvedType, kinds, values,
    collection: {
      key: collection ? collection.key : null,
      name: collection ? collection.name : null,
      modes: collection ? collection.modes.map((m) => ({ id: m.modeId, name: m.name })) : [],
    },
  };
}

async function libraryImport(spec) {
  const keys = (spec && spec.keys) || [];
  if (keys.length > LIBRARY_IMPORT_LIMIT) throw new Error(`library-import takes at most ${LIBRARY_IMPORT_LIMIT} keys a call, not ${keys.length}; run it in chunks`);
  const imported = await Promise.all(keys.map((key) => figma.variables.importVariableByKeyAsync(key)));
  const all = await Promise.all(imported.map(libraryEntry));
  return {
    entries: all.filter((e) => e.collection.key),
    skipped: all.filter((e) => !e.collection.key).map((e) => e.name),
  };
}

// Figma plugin-API writer for screen composition. This file is NOT a Node module —
// build-figma-checks.mjs concatenates it after the inlined figma-adherence.mjs
// (for dimensionBuckets), figma-compose.mjs (resolveScreen),
// figma-variables-read.figma.js and the reader (figma-compose-read.figma.js:
// page lookup, the marker, the inventory) into references/figma-compose.md, and
// the result runs inside figma_execute.
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
//   'inventory' SPEC = { componentsPage, iconsPage?, library? }     → { summary }
//   'build'     SPEC = { componentsPage, iconsPage?, library?, description, fileKey }
//                                                                  → { ok, errors } | { ok, wipId, wipName, link, ms }
//                                                                    with library, also { localPicks, raws, staleCache }
//   'finalize'  SPEC = { page, screen, fileKey }                   → { id, link, replaced }
//   'discard'   SPEC = { page, screen }                            → { removed }
//   'signals'   SPEC = { pages, manifestFileKey, openFileKey, forced? } → { signals, mode, libraryDetected, reason }
//   'library-list'   SPEC = {}                                     → { collections }
//   'library-import' SPEC = { keys }  (at most 20)                 → { entries }
// library (mode b, docs/specs/2026-10-30-design-modes.md) = { pages, components?, cache, tokens }.
// Library items carry 'lib:<key>' ids in the plan and are imported by key, 20 at a
// time, after the plan resolves and before fonts load.

const COMPOSE_CORNERS = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
const COMPOSE_PADDING = { top: 'paddingTop', right: 'paddingRight', bottom: 'paddingBottom', left: 'paddingLeft' };

const composeLink = (fileKey, id) => `https://www.figma.com/design/${fileKey}?node-id=${String(id).replace(/:/g, '-')}`;

// 'marked' | 'unmarked' | null for the top-level frames called `name`.
function composeNameState(page, name) {
  const frames = composeTopFrames(page, name);
  if (!frames.length) return null;
  return frames.every(composeIsMarked) ? 'marked' : 'unmarked';
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

// A plan colour: a variable id, or { raw: '#rrggbb[aa]' } in mode b.
function composePaint(value, live) {
  if (value && typeof value === 'object' && 'raw' in value) {
    const hex = value.raw.slice(1);
    const channel = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
    return { type: 'SOLID', color: { r: channel(0), g: channel(2), b: channel(4) }, opacity: hex.length === 8 ? channel(6) : 1 };
  }
  return composeBoundPaint(live.variableNodes.get(value));
}

// A plan dimension: a variable id, or { raw: <number> } in mode b.
function composeSetDimension(node, field, value, live) {
  if (value && typeof value === 'object' && 'raw' in value) node[field] = value.raw;
  else node.setBoundVariable(field, live.variableNodes.get(value));
}

// Only the axes the plan names; the others stay as Figma made the node.
function composeSizing(node, sizing) {
  if (!sizing) return;
  if (sizing.horizontal) node.layoutSizingHorizontal = sizing.horizontal;
  if (sizing.vertical) node.layoutSizingVertical = sizing.vertical;
}

function composeStyleFrame(frame, plan, live) {
  frame.name = plan.name;
  frame.layoutMode = plan.layoutMode;
  frame.primaryAxisAlignItems = plan.primaryAxisAlignItems;
  frame.counterAxisAlignItems = plan.counterAxisAlignItems;
  // A new frame starts with a white fill; left in place it would be a raw colour.
  frame.fills = plan.fill ? [composePaint(plan.fill, live)] : [];
  if (plan.stroke) {
    frame.strokes = [composePaint(plan.stroke, live)];
    frame.strokeWeight = 1;
  }
  if (plan.itemSpacing) composeSetDimension(frame, 'itemSpacing', plan.itemSpacing, live);
  for (const [side, id] of Object.entries(plan.padding || {})) {
    if (id) composeSetDimension(frame, COMPOSE_PADDING[side], id, live);
  }
  if (plan.radius) for (const corner of COMPOSE_CORNERS) composeSetDimension(frame, corner, plan.radius, live);
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
    text.fills = [composePaint(plan.color, live)];
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

// Mode b: put every library item the plan names into the live maps under its
// 'lib:' id: a component or set the reader reached through an instance is used as
// it is (live.libraryNodes), anything else is imported by key, 20 at a time
// (variables always are). Library swap targets are rewritten to the node's id.
// Returns the cache entries whose values have moved since the cache was read.
async function composeImportLibrary(plan, live, spec) {
  const sets = new Set();
  const swaps = new Set();
  const variables = new Set();
  const collections = new Set();
  const take = (id, into) => { if (isLibraryId(id)) into.add(id); };
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'frame') {
      [node.fill, node.stroke, node.itemSpacing, node.radius, ...Object.values(node.padding || {})].forEach((id) => take(id, variables));
    } else if (node.type === 'text') take(node.color, variables);
    else if (node.type === 'component') {
      take(node.setId, sets);
      Object.values(node.otherProps).forEach((id) => take(id, swaps));
    }
    for (const child of node.children || []) walk(child);
    for (const slot of node.slots || []) slot.nodes.forEach(walk);
  };
  walk(plan.root);
  for (const { collectionId } of plan.modes) take(collectionId, collections);
  const keyOf = (id) => id.slice(LIBRARY_ID_PREFIX.length);
  const cached = new Map();
  for (const lib of Object.values((spec.library.cache && spec.library.cache.libraries) || {})) {
    for (const [key, v] of Object.entries(lib.variables || {})) cached.set(key, v);
  }
  // A collection is reached through one of its variables.
  const viaVariable = new Map();
  for (const id of collections) {
    const key = [...cached.entries()].find(([, v]) => v.collection === keyOf(id));
    if (!key) throw new Error(`the library cache holds no variable of collection ${keyOf(id)}; re-read the library`);
    viaVariable.set(id, key[0]);
  }
  const chunked = async (ids, load) => {
    const list = [...ids];
    const out = [];
    for (let i = 0; i < list.length; i += 20) out.push(...await Promise.all(list.slice(i, i + 20).map(load)));
    return out;
  };
  const known = (id) => live.libraryNodes && live.libraryNodes.get(id);
  const setNodes = await chunked(sets, (id) => known(id) || figma.importComponentSetByKeyAsync(keyOf(id)));
  [...sets].forEach((id, i) => live.setNodes.set(id, setNodes[i]));
  const swapNodes = await chunked(swaps, (id) => known(id) || figma.importComponentByKeyAsync(keyOf(id)));
  const swapIds = new Map([...swaps].map((id, i) => [id, swapNodes[i].id]));
  const rewrite = (node) => {
    if (!node) return;
    if (node.type === 'component') {
      for (const [k, v] of Object.entries(node.otherProps)) if (swapIds.has(v)) node.otherProps[k] = swapIds.get(v);
    }
    for (const child of node.children || []) rewrite(child);
    for (const slot of node.slots || []) slot.nodes.forEach(rewrite);
  };
  rewrite(plan.root);
  const varIds = [...variables];
  const varNodes = await chunked(varIds, (id) => figma.variables.importVariableByKeyAsync(keyOf(id)));
  varIds.forEach((id, i) => live.variableNodes.set(id, varNodes[i]));
  const viaNodes = await chunked([...viaVariable.values()].map((k) => `${LIBRARY_ID_PREFIX}${k}`), (id) => figma.variables.importVariableByKeyAsync(keyOf(id)));
  for (const [i, id] of [...viaVariable.keys()].entries()) {
    live.collectionNodes.set(id, await figma.variables.getVariableCollectionByIdAsync(viaNodes[i].variableCollectionId));
  }
  const fresh = await Promise.all(varNodes.map(libraryEntry));
  // Per mode: the cache on disk has its keys sorted, a fresh read is in mode order.
  const same = (a, b) => {
    const modes = Object.keys(a || {});
    return modes.length === Object.keys(b || {}).length && modes.every((m) => Object.prototype.hasOwnProperty.call(b, m) && a[m] === b[m]);
  };
  return fresh.filter((e) => {
    const old = cached.get(e.key);
    return e.collection.key && (!old || !same(old.values, e.values));
  });
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
  let library = null;
  if (spec.library) {
    const localPicks = libraryLocalPicks(plan, inventory);
    library = { localPicks, raws: plan.raws, staleCache: { entries: await composeImportLibrary(plan, live, spec) } };
  }
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
  return { ok: true, wipId: root.id, wipName, link: composeLink(spec.fileKey || figma.fileKey, root.id), ms: Date.now() - started, ...(library || {}) };
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
  if (MODE === 'signals') return readModeSignals(SPEC);
  if (MODE === 'library-list') return libraryList();
  if (MODE === 'library-import') return libraryImport(SPEC);
  throw new Error(`unknown MODE ${JSON.stringify(MODE)}: inventory, build, finalize, discard, signals, library-list or library-import`);
}
```
