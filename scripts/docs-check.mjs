// docs:check — the documentation drift gate. Compares each component's canonical
// record and its rendered surfaces against the fingerprints recorded in
// design-system.json, and reports drift. Zero dependencies.
//
// Drift classes: canonical-changed | stale | edited | missing-surface | edit-unverified
// (edit-unverified = a surface the CLI cannot read, e.g. Figma — informational;
//  it is checked live by the Figma-connected skill instead.
//  missing-surface = a repo surface that declares a file which is now gone — failing;
//  distinct from edit-unverified, which has no file to read in the first place.)
//
// Usage: node docs-check.mjs [--root <dir>]   (default root: cwd)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadRecord, canonicalFingerprint, fingerprint } from './lib/doc-record.mjs';

// Surfaces whose rendered content the CLI can re-read from the repo.
const REPO_SURFACES = new Set(['storybookMdx']);

export function classifySurface({ currentCanonical, surface, currentRenderHash, fileMissing = false }) {
  const flags = [];
  if (surface.src !== currentCanonical) flags.push('stale');
  if (fileMissing) {
    flags.push('missing-surface');
  } else if (currentRenderHash === null) {
    flags.push('edit-unverified');
  } else if (surface.render !== currentRenderHash) {
    flags.push('edited');
  }
  return flags;
}

export function checkComponent({ name, meta, root }) {
  const out = [];
  const doc = meta && meta.doc;
  if (!doc) return out;

  const recordPath = join(root, doc.path);
  if (!existsSync(recordPath)) {
    out.push({ name, surface: 'canonical', flags: ['missing-record'] });
    return out;
  }
  const currentCanonical = canonicalFingerprint(loadRecord(recordPath));
  if (currentCanonical !== doc.fingerprint) {
    out.push({ name, surface: 'canonical', flags: ['canonical-changed'] });
  }

  for (const [surfaceName, surface] of Object.entries(doc.surfaces || {})) {
    let currentRenderHash = null;
    let fileMissing = false;
    if (REPO_SURFACES.has(surfaceName) && surface.file) {
      const filePath = join(root, surface.file);
      if (existsSync(filePath)) {
        currentRenderHash = fingerprint(readFileSync(filePath, 'utf8'));
      } else {
        fileMissing = true;
      }
    }
    const flags = classifySurface({ currentCanonical, surface, currentRenderHash, fileMissing });
    if (flags.length) out.push({ name, surface: surfaceName, flags });
  }
  return out;
}

export function checkAll(manifest, root) {
  const out = [];
  const meta = (manifest && manifest.components && manifest.components.meta) || {};
  for (const [name, m] of Object.entries(meta)) {
    out.push(...checkComponent({ name, meta: m, root }));
  }
  return out;
}

const FAILING = new Set(['canonical-changed', 'stale', 'edited', 'missing-record', 'missing-surface']);

function main() {
  const { values } = parseArgs({ options: { root: { type: 'string', default: '.' } } });
  const root = values.root;
  const manifestPath = join(root, 'design-system.json');
  if (!existsSync(manifestPath)) {
    console.error(`docs:check — no design-system.json at ${root}`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const results = checkAll(manifest, root);

  const drift = results.filter((r) => r.flags.some((f) => FAILING.has(f)));
  const info = results.filter((r) => !r.flags.some((f) => FAILING.has(f)));

  for (const r of drift) console.error(`  ✗ ${r.name} · ${r.surface}: ${r.flags.join(', ')}`);
  for (const r of info) console.log(`  ~ ${r.name} · ${r.surface}: ${r.flags.join(', ')} (check in a Figma session)`);

  if (drift.length) {
    console.error(`✗ docs:check — ${drift.length} drifted surface(s); reconcile with /document-component`);
    process.exit(1);
  }
  console.log(`✓ docs:check — no drift${info.length ? ` (${info.length} Figma surface(s) unverified)` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
