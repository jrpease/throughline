// Figma plugin-API reader for a connected library's variables. This file is NOT a
// Node module: build-figma-checks.mjs inlines it into references/figma-compose.md
// after figma-adherence.mjs (dimensionBuckets) and figma-variables-read.figma.js
// (variableColors, variableNumbers). Untested in Node beyond the generator's
// fake-Figma test.
//
// Spec: docs/specs/2026-10-30-design-modes.md (Q9). Live on 2026-10-30, importing
// hung while the file was behind another tab and took 201 ms with it in front;
// 20 imports in one Promise.all took 396 ms.
//
// libraryList() → { collections: [{ library, key, name, variables: [{ key, name, resolvedType }] }] }
//   Names and keys only: Figma's library listing carries no values.
// libraryImport({ keys }) → { entries: [cache-shaped entry], skipped: [name] }, at most
//   20 keys a call. skipped: variables whose collection couldn't be read.
//   Importing adds the library variables to the file (invisible; no layers change).
//   Aliases are followed to a concrete value; one that can't be followed is null.

const LIBRARY_IMPORT_LIMIT = 20;

async function libraryList() {
  const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  const variables = await Promise.all(collections.map((c) => figma.teamLibrary.getVariablesInLibraryCollectionAsync(c.key)));
  return {
    collections: collections.map((c, i) => ({
      library: c.libraryName, key: c.key, name: c.name,
      variables: variables[i].map((v) => ({ key: v.key, name: v.name, resolvedType: v.resolvedType })),
    })),
  };
}

// A cache entry for an imported (or already present) library variable.
async function libraryEntry(variable) {
  const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  let kinds = [];
  let values = {};
  if (variable.resolvedType === 'COLOR') {
    kinds = ['colour'];
    values = (await variableColors(variable)).modes;
  } else if (variable.resolvedType === 'FLOAT') {
    const buckets = dimensionBuckets(variable.name, variable.scopes || []);
    kinds = [buckets.gap && 'gap', buckets.radius && 'radius'].filter(Boolean);
    values = await variableNumbers(variable);
  }
  return {
    key: variable.key, name: variable.name, resolvedType: variable.resolvedType, kinds, values,
    collection: {
      key: collection ? collection.key : null,
      name: collection ? collection.name : null,
      modes: collection ? collection.modes.map((m) => ({ id: m.modeId, name: m.name })) : [],
    },
  };
}

async function libraryImport(spec) {
  const keys = (spec && spec.keys) || [];
  if (keys.length > LIBRARY_IMPORT_LIMIT) throw new Error(`library-import takes at most ${LIBRARY_IMPORT_LIMIT} keys a call, not ${keys.length}; run it in chunks`);
  const imported = await Promise.all(keys.map((key) => figma.variables.importVariableByKeyAsync(key)));
  const all = await Promise.all(imported.map(libraryEntry));
  return {
    entries: all.filter((e) => e.collection.key),
    skipped: all.filter((e) => !e.collection.key).map((e) => e.name),
  };
}
