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
// In-scope globals when assembled: checkScreens (figma-adherence.mjs),
// variableColors (figma-variables-read.figma.js), and the caller-filled slots
// TARGET = { page, screens? } and SKIP = [rule, ...]. The snapshot shape is
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
    const byte = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    out.push({
      kind,
      hex: `#${byte(paint.color.r)}${byte(paint.color.g)}${byte(paint.color.b)}`,
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

function overriddenRecords(instance, path) {
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
    const scopes = variable.scopes || [];
    const all = scopes.includes('ALL_SCOPES');
    for (const value of Object.values(variable.valuesByMode)) {
      if (all || scopes.includes('GAP')) add(gap, value, variable.name);
      if (all || scopes.includes('CORNER_RADIUS')) add(radius, value, variable.name);
    }
  }
  return { colours, gap, radius };
}

async function readScreens(target) {
  const page = figma.root.children.find((p) => p.name === target.page);
  if (!page) throw new Error(`no page named "${target.page}"`);
  await page.loadAsync();
  const screens = screensOn(page, target.screens);
  const nodes = [];
  const walk = (node, path, isRoot) => {
    if (node.visible === false) return;
    if (node.type === 'INSTANCE') {
      nodes.push(...overriddenRecords(node, path));
      return;
    }
    const mixedPaints = node.fills === figma.mixed;
    nodes.push({
      id: node.id,
      path,
      isRoot,
      inInstance: false,
      overridden: [],
      paints: [...solidPaints(node, 'fills', 'fill'), ...solidPaints(node, 'strokes', 'stroke')],
      mixedPaints,
      gap: gapOf(node),
      padding: paddingOf(node),
      radius: radiusOf(node),
      detached: detachedOf(node, page),
    });
    for (const child of node.children || []) walk(child, `${path} / ${child.name}`, false);
  };
  for (const screen of screens) walk(screen, `${page.name} / ${screen.name}`, true);
  return {
    fileKey: figma.fileKey,
    screens: screens.map((s) => ({ id: s.id, name: s.name })),
    nodes,
    tokens: await readTokens(),
  };
}

async function runScreenGate(TARGET, SKIP) {
  return checkScreens(await readScreens(TARGET), { skip: SKIP || [] });
}
