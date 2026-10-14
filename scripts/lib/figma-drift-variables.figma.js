// Figma plugin-API reader for the variables half of drift, read-only. This file
// is NOT a Node module — build-figma-checks.mjs concatenates it after the inlined
// figma-variables-read.figma.js (colorHex) into the variables snippet of
// references/figma-drift.md. It is kept apart from the screens reader so the
// snippet every token sync runs stays small, and it returns one fingerprint per
// collection rather than every value: on 2026-10-14 an agent handing 147 values
// on to a file by hand was the step that failed. The comparison happens in Node
// (scripts/drift-check.mjs).
// Awaits are few and fixed: every local variable and collection is read once, and
// aliases resolve from those maps. Only an alias to a variable outside the file
// costs an await. Untested in Node beyond the generator's tests.
//
// Entry point: runDriftVariables()
//   → { "<collection>": { variables, hash } }
//   hash: FNV-1a (32-bit, hex) over every variable in the collection, sorted by
//   name, each as its name, type and value per mode (sorted by mode name), colours
//   as hex and aliases followed (by mode name, else the target's default). Two
//   collections with the same name share one line; Figma allows it, rarely. The
//   result stays small however many variables a file has, so it can be written to
//   a file by hand; the sync's own diff shows which variables moved.

function driftHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

async function driftVariables() {
  const collections = new Map();
  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) collections.set(c.id, c);
  const variables = new Map();
  for (const v of await figma.variables.getLocalVariablesAsync()) variables.set(v.id, v);
  const fold = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

  async function valueOf(variable, modeName, hops) {
    if (!variable || hops > 10) return null;
    const collection = collections.get(variable.variableCollectionId)
      || await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    if (!collection) return null;
    const mode = collection.modes.find((m) => fold(m.name) === fold(modeName));
    const value = variable.valuesByMode[mode ? mode.modeId : collection.defaultModeId];
    if (value && value.type === 'VARIABLE_ALIAS') {
      const target = variables.get(value.id) || await figma.variables.getVariableByIdAsync(value.id);
      return valueOf(target, modeName, hops + 1);
    }
    if (value && typeof value === 'object' && 'r' in value) return colorHex(value);
    return value === undefined ? null : value;
  }

  const rows = new Map();
  for (const variable of variables.values()) {
    const collection = collections.get(variable.variableCollectionId);
    if (!collection) continue;
    const modes = [];
    for (const mode of collection.modes) modes.push([mode.name, await valueOf(variable, mode.name, 0)]);
    modes.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    if (!rows.has(collection.name)) rows.set(collection.name, []);
    rows.get(collection.name).push([variable.name, variable.resolvedType, modes]);
  }
  const out = {};
  for (const [name, list] of rows) {
    list.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    out[name] = { variables: list.length, hash: driftHash(JSON.stringify(list)) };
  }
  return out;
}

async function runDriftVariables() {
  return driftVariables();
}
