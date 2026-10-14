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
