// Figma plugin-API reader for the mode signals, read-only. This file is NOT a Node
// module: build-figma-checks.mjs inlines it into references/figma-compose.md after
// the compose reader (for composeFindPage) and design-mode.mjs (detectMode).
// Async getters only. Untested in Node beyond the generator's fake-Figma test.
//
// Spec: docs/specs/2026-10-30-design-modes.md (Q3, Q5)
//
// readModeSignals({ pages, manifestFileKey, openFileKey, forced })
//   → { signals, mode, libraryDetected, reason }
// Only the named pages are loaded and walked. The instance walk stops at the first
// library instance: detection needs one, and every instance costs an await.

async function readModeSignals(spec) {
  const libraryCollections = (await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()).length;
  let remoteInstances = 0;
  let localSets = 0;
  for (const name of spec.pages || []) {
    const page = composeFindPage(name);
    if (!page) continue;
    await page.loadAsync();
    localSets += page.findAllWithCriteria({ types: ['COMPONENT_SET'] }).filter((s) => !s.remote).length;
    if (remoteInstances) continue;
    const instances = page.findAllWithCriteria({ types: ['INSTANCE'] });
    for (let i = 0; i < instances.length && !remoteInstances; i += 20) {
      const mains = await Promise.all(instances.slice(i, i + 20).map((n) => n.getMainComponentAsync()));
      if (mains.some((m) => m && m.remote)) remoteInstances = 1;
    }
  }
  const localVariables = (await figma.variables.getLocalVariablesAsync()).length;
  const signals = {
    manifestFileKey: spec.manifestFileKey || null,
    openFileKey: spec.openFileKey || null,
    libraryCollections, remoteInstances, localVariables, localSets,
    forced: spec.forced || null,
  };
  return { signals, ...detectMode(signals) };
}
