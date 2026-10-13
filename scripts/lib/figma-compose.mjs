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
//   sizing:    { horizontal?: 'fill'|'hug', vertical?: 'fill'|'hug' }   (default hug)
//   Every visual value is a variable or text-style name.
//
// INVENTORY (what the reader returns):
//   {
//     sets: [{ name, id, page, props: [{ key, name, type, options?, slotLayout? }] }],
//                                             // key: 'label#10:273'; type: TEXT | BOOLEAN | VARIANT
//                                             // | INSTANCE_SWAP | SLOT; slotLayout: NONE | VERTICAL | HORIZONTAL
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

export const COMPOSE_ERROR_KINDS = [
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

// Up to three names, by longest shared folded prefix, then edit distance.
export function nearestNames(asked, names) {
  const want = composeFold(asked);
  const shared = (f) => { let n = 0; while (n < f.length && n < want.length && f[n] === want[n]) n++; return n; };
  return [...new Set(names)]
    .map((name) => ({ name, f: composeFold(name) }))
    .map((x) => ({ ...x, prefix: shared(x.f), dist: editDistance(want, x.f) }))
    .sort((a, b) => b.prefix - a.prefix || a.dist - b.dist || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((x) => x.name);
}

const byFold = (list, asked, nameOf = (x) => x.name) =>
  list.find((x) => nameOf(x) === asked) || list.find((x) => composeFold(nameOf(x)) === composeFold(asked));

export function resolveScreen(description, inventory) {
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

  function sizing(node, path, parent) {
    const s = node.sizing;
    if (s === undefined) return { horizontal: 'HUG', vertical: 'HUG' };
    if (!s || typeof s !== 'object') { fail('invalid', `${path}.sizing`, 'an object { horizontal, vertical }'); return null; }
    const out = {};
    for (const axis of ['horizontal', 'vertical']) {
      const v = s[axis] === undefined ? 'hug' : s[axis];
      if (!SIZING[v]) { fail('invalid', `${path}.sizing.${axis}`, `fill or hug, not ${JSON.stringify(v)}`); continue; }
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
      sizing: isRoot ? null : sizing(node, path, parent),
      children: Array.isArray(children)
        ? children.map((child, i) => resolveNode(child, `${path}.children[${i}]`, { slotLayout: null }))
        : [],
    };
  }

  function component(node, path, parent) {
    const set = byFold(inv.sets, String(node.component));
    const sizingPlan = sizing(node, path, parent);
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
      sizing: sizing(node, path, parent),
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
