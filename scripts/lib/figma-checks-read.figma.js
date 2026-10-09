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
