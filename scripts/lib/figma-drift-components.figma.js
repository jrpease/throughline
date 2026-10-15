// Figma plugin-API reader for the components half of drift, read-only. This file
// is NOT a Node module — build-figma-checks.mjs copies it, with nothing inlined,
// into the components snippet of references/figma-drift.md, which an agent
// carries by hand, so it stays small. The comparison with each doc record happens
// in Node (drift-check.mjs compare-components).
// Untested in Node beyond the generator's tests.
//
// Entry point: runDriftComponents(SPEC), SPEC = { names, componentsPage? }
//   names: the documented components (drift-check.mjs check --json, components.documented)
//   componentsPage: the page to read; without it, the one page whose folded name is
//     "components". Only that page is loaded.
//   → { page, components: { <name as asked>: { axes: { <axis>: [options] } } | null } }
//     null when no component set on the page folds to that name.

const driftFold = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function driftComponentsPage(name) {
  const pages = figma.root.children;
  if (name !== undefined && name !== null) {
    const exact = pages.find((p) => p.name === name);
    if (exact) return exact;
    const trimmed = pages.filter((p) => p.name.trim() === String(name).trim());
    if (trimmed.length === 1) return trimmed[0];
    throw new Error(`${trimmed.length ? `${trimmed.length} pages are` : 'no page is'} named "${name}"; pages: ${pages.map((p) => p.name).join(', ')}`);
  }
  const found = pages.filter((p) => driftFold(p.name) === 'components');
  if (found.length === 1) return found[0];
  throw new Error(`${found.length ? `${found.length} pages` : 'no page'} named like "Components"; pass componentsPage. Pages: ${pages.map((p) => p.name).join(', ')}`);
}

// The getter throws when Figma flags the set as conflicting (duplicate variant
// combinations). Fall back to the axes and values the children declare.
function driftAxes(set) {
  try {
    return Object.fromEntries(Object.entries(set.variantGroupProperties).map(([axis, { values }]) => [axis, values]));
  } catch {
    const axes = {};
    for (const child of set.children) {
      for (const [axis, value] of Object.entries(child.variantProperties || {})) {
        axes[axis] = axes[axis] || [];
        if (!axes[axis].includes(value)) axes[axis].push(value);
      }
    }
    return axes;
  }
}

async function runDriftComponents(SPEC) {
  const spec = SPEC || {};
  const page = driftComponentsPage(spec.componentsPage);
  await page.loadAsync();
  const sets = page.findAllWithCriteria({ types: ['COMPONENT_SET'] });
  const components = {};
  for (const name of spec.names || []) {
    const set = sets.find((s) => driftFold(s.name) === driftFold(name));
    components[name] = set ? { axes: driftAxes(set) } : null;
  }
  return { page: page.name, components };
}
