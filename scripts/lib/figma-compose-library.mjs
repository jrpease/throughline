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

export const LIBRARY_ID_PREFIX = 'lib:';
export const libraryId = (key) => `${LIBRARY_ID_PREFIX}${key}`;
export const isLibraryId = (id) => typeof id === 'string' && id.startsWith(LIBRARY_ID_PREFIX);
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

export function mergeLibraryInventory(local, library) {
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
export function libraryLocalPicks(plan, inventory) {
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
