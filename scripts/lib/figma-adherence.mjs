// The adherence gate for Figma screens as a pure checker: detached components,
// raw colours a token has, and raw gaps, padding and radii a token has. ZERO
// imports, `export const`/`export function` only. It is inlined, with the shared
// variable reader and the screen reader below it, into the generated Figma script
// (references/figma-adherence.md) by build-figma-checks.mjs, so it must run in
// both Node and the Figma plugin sandbox.
//
// Spec: docs/specs/2026-10-13-figma-adherence-gate.md
// The code-side counterpart is scripts/validate-adherence.mjs. Both follow its
// spec's Decision 3: a raw value fails only when a token has it; any other raw
// value is an advisory.
//
// SNAPSHOT (what the reader returns):
//   {
//     fileKey,
//     screens: [{ id, name }],
//     nodes: [{
//       id, path,                       // path: 'Page / Screen / … / Node'
//       isRoot,                         // the screen frame itself
//       inInstance,                     // an overridden node inside an INSTANCE (or the instance itself)
//       underDetached,                  // a detached frame, or anything inside one
//       overridden: ['fills' | 'strokes'],   // inInstance nodes only
//       paints: [{ kind: 'fill' | 'stroke', hex: '#rrggbb', bound, styled }],   // visible SOLID paints only
//       mixedPaints,                    // fills is figma.mixed (text with mixed runs)
//       gap: { value, bound, renders } | null,
//       padding: [{ side, value, bound }],
//       radius: [{ corner, value, bound }],
//       detached: { kind: 'local' | 'library', name, id, key } | null,
//     }],
//     tokens: {
//       colours: { '#rrggbb': [variableName] },   // every mode's value
//       gap: { '<number>': [variableName] },      // FLOAT scoped GAP or ALL_SCOPES
//       radius: { '<number>': [variableName] },   // FLOAT scoped CORNER_RADIUS or ALL_SCOPES
//     },
//   }
//
// RESULT: { pass, failures, advisories, counts, skipped }
//   failures/advisories: [{ rule, id, path, detail, link }], sorted by path then detail
//   counts: { [rule]: { checked, failed } }
//   `pass` is false when any failure exists. A failed assertion is data; nothing throws.

export const RULES = ['detached-component', 'raw-colour', 'raw-dimension'];

const PAINT_FIELD = { fill: 'fills', stroke: 'strokes' };

// Which dimension tables a number variable belongs in. An explicit scope decides.
// A variable left at ALL_SCOPES (Figma's default) counts only when its name says
// what it is: on Zygarden every number variable is ALL_SCOPES, and without the
// name test a 72 px gap failed with "bind text/7xl". Letter-spacing says "spacing"
// but is type, not layout.
const SPACING_WORDS = /spac|gap|inset|stack|inline|padding|gutter/i;
const NOT_SPACING = /letter/i;
const RADIUS_WORDS = /radius|corner|round/i;
export function dimensionBuckets(name, scopes = []) {
  const all = scopes.includes('ALL_SCOPES');
  return {
    gap: scopes.includes('GAP') || (all && SPACING_WORDS.test(name) && !NOT_SPACING.test(name)),
    radius: scopes.includes('CORNER_RADIUS') || (all && RADIUS_WORDS.test(name)),
  };
}

export function checkScreens(snapshot, { skip = [] } = {}) {
  const nodes = snapshot.nodes ?? [];
  const tokens = snapshot.tokens ?? {};
  const colours = tokens.colours ?? {};
  const gapTokens = tokens.gap ?? {};
  const radiusTokens = tokens.radius ?? {};
  const on = (rule) => !skip.includes(rule);
  const link = (id) => `https://www.figma.com/design/${snapshot.fileKey}?node-id=${String(id).replace(/:/g, '-')}`;

  const failures = [];
  const advisories = [];
  const counts = Object.fromEntries(RULES.filter(on).map((rule) => [rule, { checked: 0, failed: 0 }]));
  const fail = (rule, node, detail) => {
    counts[rule].failed += 1;
    failures.push({ rule, id: node.id, path: node.path, detail, link: link(node.id) });
  };
  const advise = (rule, node, detail) => advisories.push({ rule, id: node.id, path: node.path, detail, link: link(node.id) });

  // A raw value fails when a token has it, naming the token; otherwise it is an advisory.
  const raw = (rule, node, table, value, what) => {
    counts[rule].checked += 1;
    const names = table[String(value)];
    if (names && names.length) fail(rule, node, `${what}: bind ${names.join(', ')}`);
    else advise(rule, node, rule === 'raw-colour' ? `${what}: no colour variable has this value` : `off-scale ${what}`);
  };

  for (const node of nodes) {
    if (on('detached-component')) {
      counts['detached-component'].checked += 1;
      const d = node.detached;
      if (d) {
        let from;
        if (d.kind === 'library') from = `a library component (key ${d.key})`;
        else if (d.name) from = d.name;
        else from = `a local component on another page (id ${d.id})`;
        fail('detached-component', node, `detached from ${from}`);
      }
    }

    // Inside a detached copy, the one detached-component failure is the finding:
    // re-instancing fixes every raw value under it. On 01. Design System's
    // Archtypes page, checking them anyway turned 8 detached frames into ~200 failures.
    if (node.underDetached) continue;

    if (on('raw-colour')) {
      if (node.mixedPaints) advise('raw-colour', node, 'mixed paints not read');
      for (const paint of node.paints ?? []) {
        if (node.inInstance && !(node.overridden ?? []).includes(PAINT_FIELD[paint.kind])) continue;
        if (paint.bound || paint.styled) {
          counts['raw-colour'].checked += 1;
          continue;
        }
        raw('raw-colour', node, colours, paint.hex, `${paint.kind} ${paint.hex}`);
      }
    }

    if (on('raw-dimension') && !node.inInstance) {
      const gap = node.gap;
      if (gap && gap.renders && gap.value > 0) {
        if (gap.bound) counts['raw-dimension'].checked += 1;
        else raw('raw-dimension', node, gapTokens, gap.value, `gap ${gap.value}`);
      }
      for (const p of node.padding ?? []) {
        if (!(p.value > 0)) continue;
        if (p.bound) counts['raw-dimension'].checked += 1;
        else raw('raw-dimension', node, gapTokens, p.value, `padding-${p.side} ${p.value}`);
      }
      if (!node.isRoot) {
        for (const r of node.radius ?? []) {
          if (!(r.value > 0)) continue;
          if (r.bound) counts['raw-dimension'].checked += 1;
          else raw('raw-dimension', node, radiusTokens, r.value, `radius-${r.corner} ${r.value}`);
        }
      }
    }
  }

  // Every enabled rule must have had something to check (code gate Decision 7).
  const inert = (rule, detail) => failures.push({ rule, id: null, path: '', detail, link: null });
  if (nodes.length === 0) inert('nothing-scanned', 'no node was read; check the page and screen names');
  if (on('raw-colour') && Object.keys(colours).length === 0) {
    inert('colour-rule-inert', 'the file has no local colour variables, so no raw colour could be matched to one');
  }
  if (on('raw-dimension') && Object.keys(gapTokens).length === 0 && Object.keys(radiusTokens).length === 0) {
    inert('dimension-rule-inert', 'the file has no local number variable scoped for gap, padding or radius');
  }

  const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0);
  failures.sort(byPath);
  advisories.sort(byPath);
  return { pass: failures.length === 0, failures, advisories, counts, skipped: RULES.filter((rule) => !on(rule)) };
}
