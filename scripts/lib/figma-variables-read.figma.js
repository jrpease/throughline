// Figma plugin-API helpers for reading colour and number variables, shared by the Figma
// checks reader and the screen reader. This file is NOT a Node module:
// build-figma-checks.mjs inlines it into both generated scripts
// (references/figma-checks.md, references/figma-adherence.md). It depends on
// nothing else, so it carries its own mode-name fold. Async getters only
// (references/figma-scripting.md). Untested in Node, like the readers.

const foldModeName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function colorHex(value) {
  if (!value || typeof value !== 'object' || !('r' in value)) return null;
  const byte = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  const alpha = value.a === undefined ? 1 : value.a;
  return `#${byte(value.r)}${byte(value.g)}${byte(value.b)}${alpha < 1 ? byte(alpha) : ''}`;
}

// The raw value of `variable` in the mode named `modeName` (after the fold), else
// its collection's default mode, following aliases up to 10 hops.
async function resolveValue(variable, modeName, hops) {
  if (!variable || hops > 10) return null;
  const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  if (!collection) return null;
  const mode = collection.modes.find((m) => foldModeName(m.name) === foldModeName(modeName));
  const value = variable.valuesByMode[mode ? mode.modeId : collection.defaultModeId];
  if (value && value.type === 'VARIABLE_ALIAS') {
    return resolveValue(await figma.variables.getVariableByIdAsync(value.id), modeName, hops + 1);
  }
  return value === undefined ? null : value;
}

async function resolveColor(variable, modeName, hops) {
  return colorHex(await resolveValue(variable, modeName, hops));
}

// { [modeName]: number | null } over the variable's own collection, aliases followed.
async function variableNumbers(variable) {
  const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  const modes = {};
  for (const mode of collection ? collection.modes : []) {
    const value = await resolveValue(variable, mode.name, 0);
    modes[mode.name] = typeof value === 'number' ? value : null;
  }
  return modes;
}

// { modes: { [modeName]: hex | null }, defaultMode } over the variable's own collection.
async function variableColors(variable) {
  const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  if (!collection) return { modes: {}, defaultMode: undefined };
  const modes = {};
  for (const mode of collection.modes) modes[mode.name] = await resolveColor(variable, mode.name, 0);
  const fallback = collection.modes.find((m) => m.modeId === collection.defaultModeId);
  return { modes, defaultMode: fallback ? fallback.name : undefined };
}
