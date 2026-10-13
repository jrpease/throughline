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
