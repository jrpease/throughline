// Figma plugin-API reader for the stop-condition checks. This file is NOT a
// Node module — build-figma-checks.mjs concatenates it after the inlined
// component-states.mjs, contrast.mjs, figma-checks.mjs and
// figma-variables-read.figma.js into references/figma-checks.md, and
// the result runs inside figma_execute (dynamic-page mode). Constraints honored
// here (see references/figma-scripting.md): async getters only, variable names
// and per-mode colour values resolved with getVariableByIdAsync and only for
// focus variants and their controlLayer, plus the EXPECT.surfaces names, which
// are looked up among the file's LOCAL colour variables only (a surface from a
// published library reads as missing). Untested in Node, like the doc-card
// renderer; the pure checker it feeds is unit-tested.
//
// In-scope globals when assembled: normalizeName (inlined
// component-states.mjs), variableColors (figma-variables-read.figma.js),
// checkSpec, checkBuilt, checkExisting (bound from withTable) and the
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

// The set a build just made: the COMPONENT_SET in the `WIP: <name>` frame on the
// current page. A frame holding plain FRAMEs where the set should be is a failed
// assertion, not a missing target, so it comes back as `{ empty }` for the
// structural check to name.
async function findWipSet(expect) {
  await figma.currentPage.loadAsync();
  const frameName = `WIP: ${expect.name}`;
  const frame = figma.currentPage.findOne((n) => n.name === frameName);
  if (!frame) throw new Error(`no node named "${frameName}" on the current page`);
  const set = frame.type === 'COMPONENT_SET' ? frame : (frame.children || []).find((c) => c.type === 'COMPONENT_SET');
  if (set) return { set };
  const first = (frame.children || [])[0];
  return { empty: { type: first ? first.type : 'NONE', variantGroupProperties: {}, children: [] } };
}

// A set already in the library: the first COMPONENT_SET whose name folds to the
// same name. With `pageName`, only that page is loaded (exact name, or a unique
// match on the trimmed name). Without it every page is loaded in turn until one
// has the set, which on a miss is the whole file; a whole-file load stalled the
// bridge on a large file, so callers pass the page.
async function findExistingSet(name, pageName) {
  const want = normalizeName(name);
  let pages = figma.root.children;
  if (pageName !== undefined && pageName !== null) {
    const exact = pages.filter((p) => p.name === pageName);
    const trimmed = pages.filter((p) => p.name.trim() === String(pageName).trim());
    pages = exact.length ? exact : trimmed.length === 1 ? trimmed : [];
    if (!pages.length) throw new Error(`no page named "${pageName}"`);
  }
  for (const page of pages) {
    await page.loadAsync();
    const set = page.findAllWithCriteria({ types: ['COMPONENT_SET'] }).find((s) => normalizeName(s.name) === want);
    if (set) return set;
  }
  throw new Error(`no component set named "${name}"${pageName ? ` on page "${pageName}"` : ' in this file'}`);
}

async function readSet(set, expect) {
  readVariables.clear();

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
  if (MODE === 'built') {
    const { set, empty } = await findWipSet(EXPECT);
    return checkBuilt(set ? await readSet(set, EXPECT) : empty, EXPECT);
  }
  if (MODE === 'existing') return checkExisting(await readSet(await findExistingSet(EXPECT.name, EXPECT.page), EXPECT), EXPECT);
  throw new Error(`MODE must be 'spec', 'built' or 'existing', got ${JSON.stringify(MODE)}`);
}
