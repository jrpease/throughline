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
