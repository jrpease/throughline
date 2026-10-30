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
