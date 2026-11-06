// Figma plugin-API reader for the screens half of drift, read-only. This file is
// NOT a Node module — build-figma-checks.mjs concatenates it after the inlined
// figma-adherence.mjs (dimensionBuckets), figma-compose.mjs (resolveScreen) and
// figma-compose-read.figma.js (page lookup, the marker, the inventory) into the
// screens snippet of references/figma-drift.md.
// It carries no writer. Untested in Node beyond the generator's tests.
//
// Entry point: runDriftScreens(SPEC), SPEC = { entries, library? }
//   entries: the figma entries of design-system/screens.json, as stored, all in
//     the file this runs in
//   library: { cache, systemCollectionKeys } for entries composed in a product
//     file (an entry with `library: { pages }`): its inventory is read through
//     the library parts on those pages, as compose read it, importing nothing
//     (design-modes Q43)
//   → { screens: [{ screen, page, state, errors }] }
//     state: clean | broken (the description no longer resolves) | gone | released

async function driftScreens(spec) {
  const inventories = new Map();
  const screens = [];
  for (const entry of spec.entries || []) {
    const row = { screen: entry.screen, page: entry.target, state: 'clean', errors: [] };
    screens.push(row);
    const page = composeFindPage(entry.target);
    if (!page) { row.state = 'gone'; row.errors.push(`no page named "${entry.target}"`); continue; }
    await page.loadAsync();
    const frames = composeTopFrames(page, entry.screen);
    if (!frames.length) { row.state = 'gone'; row.errors.push(`no frame named "${entry.screen}" on "${entry.target}"`); continue; }
    if (!frames.some(composeIsMarked)) { row.state = 'released'; continue; }
    const pages = entry.library && Array.isArray(entry.library.pages) ? entry.library.pages : null;
    if (pages && !spec.library) { row.state = 'broken'; row.errors.push('this entry was composed in a product file (it has library.pages) but SPEC.library was not given: pass { cache, systemCollectionKeys }'); continue; }
    const key = `${entry.componentsPage || ''}\u0000${entry.iconsPage || ''}\u0000${pages ? pages.join('\u0001') : ''}`;
    if (!inventories.has(key)) {
      // A components page renamed since is this entry's finding, not the run's end.
      try {
        const read = { componentsPage: entry.componentsPage, iconsPage: entry.iconsPage };
        if (pages) {
          read.library = { pages, cache: spec.library.cache || null, systemCollectionKeys: spec.library.systemCollectionKeys || [] };
        }
        inventories.set(key, (await composeReadInventory(read)).inventory);
      } catch (e) {
        inventories.set(key, { error: e.message });
      }
    }
    const inventory = inventories.get(key);
    if (inventory.error) { row.state = 'broken'; row.errors.push(inventory.error); continue; }
    const res = resolveScreen(entry.plan, inventory);
    if (!res.ok) {
      row.state = 'broken';
      row.errors = res.errors.map((e) => `${e.kind} at ${e.path}: ${e.asked}${e.nearest && e.nearest.length ? ` (nearest: ${e.nearest.join(', ')})` : ''}`);
    }
  }
  return { screens };
}

async function runDriftScreens(SPEC) {
  return driftScreens(SPEC || {});
}
