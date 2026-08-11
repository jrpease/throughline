import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifySurface, checkAll } from './docs-check.mjs';
import { canonicalFingerprint, fingerprint } from './lib/doc-record.mjs';

test('classifySurface: in sync returns no flags', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'a', surface: { src: 'a', render: 'r' }, currentRenderHash: 'r' }),
    [],
  );
});

test('classifySurface: stale when canonical moved', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'b', surface: { src: 'a', render: 'r' }, currentRenderHash: 'r' }),
    ['stale'],
  );
});

test('classifySurface: edited when rendered content changed', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'a', surface: { src: 'a', render: 'r' }, currentRenderHash: 'r2' }),
    ['edited'],
  );
});

test('classifySurface: edit-unverified when surface unreadable', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'a', surface: { src: 'a', render: 'r' }, currentRenderHash: null }),
    ['edit-unverified'],
  );
});

test('classifySurface: missing-surface when a declared repo file is gone', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'a', surface: { src: 'a', render: 'r' }, currentRenderHash: null, fileMissing: true }),
    ['missing-surface'],
  );
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'docs-check-'));
  mkdirSync(join(root, 'design-system', 'docs', 'components'), { recursive: true });
  mkdirSync(join(root, 'packages', 'ui', 'src', 'Button'), { recursive: true });
  const record = { name: 'Button', summary: 's', description: 'd' };
  writeFileSync(
    join(root, 'design-system', 'docs', 'components', 'Button.doc.json'),
    JSON.stringify(record),
  );
  const fp = canonicalFingerprint(record);
  const mdx = 'docFingerprint: ' + fp + '\n# Button\n';
  writeFileSync(join(root, 'packages', 'ui', 'src', 'Button', 'Button.mdx'), mdx);
  const manifest = {
    components: {
      meta: {
        Button: {
          doc: {
            path: 'design-system/docs/components/Button.doc.json',
            fingerprint: fp,
            surfaces: {
              storybookMdx: { src: fp, render: fingerprint(mdx), file: 'packages/ui/src/Button/Button.mdx' },
              figmaDescription: { src: fp, render: 'whatever' },
            },
          },
        },
      },
    },
  };
  return { root, manifest, fp };
}

test('checkAll: reports no drift for an in-sync system (Figma is edit-unverified only)', () => {
  const { root, manifest } = fixture();
  const results = checkAll(manifest, root);
  const drift = results.filter((r) => r.flags.some((f) => f === 'stale' || f === 'edited' || f === 'canonical-changed'));
  assert.equal(drift.length, 0);
  // Figma surface is surfaced as edit-unverified (informational).
  assert.ok(results.some((r) => r.surface === 'figmaDescription' && r.flags.includes('edit-unverified')));
});

test('checkAll: flags canonical-changed when the record file drifts from the manifest', () => {
  const { root, manifest } = fixture();
  writeFileSync(
    join(root, 'design-system', 'docs', 'components', 'Button.doc.json'),
    JSON.stringify({ name: 'Button', summary: 'CHANGED', description: 'd' }),
  );
  const results = checkAll(manifest, root);
  assert.ok(results.some((r) => r.surface === 'canonical' && r.flags.includes('canonical-changed')));
});

test('checkAll: flags edited when the MDX file is hand-modified', () => {
  const { root, manifest } = fixture();
  writeFileSync(join(root, 'packages', 'ui', 'src', 'Button', 'Button.mdx'), '# Hand edited\n');
  const results = checkAll(manifest, root);
  assert.ok(results.some((r) => r.surface === 'storybookMdx' && r.flags.includes('edited')));
});

test('checkAll: flags missing-surface (failing) when a rendered repo file is deleted', () => {
  const { root, manifest } = fixture();
  rmSync(join(root, 'packages', 'ui', 'src', 'Button', 'Button.mdx'));
  const results = checkAll(manifest, root);
  const mdx = results.find((r) => r.surface === 'storybookMdx');
  assert.ok(mdx, 'storybookMdx surface should be reported');
  assert.ok(mdx.flags.includes('missing-surface'), `expected missing-surface, got ${mdx.flags.join(',')}`);
  // Must NOT be silently downgraded to the passing edit-unverified class.
  assert.ok(!mdx.flags.includes('edit-unverified'));
});

test('classifySurface: layout-upgrade-available when docCard renderer is missing', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'a', surface: { src: 'a', render: 'r' }, currentRenderHash: 'r', expectedRenderer: '2' }),
    ['layout-upgrade-available'],
  );
});

test('classifySurface: layout-upgrade-available when renderer is lower; silent when equal or higher', () => {
  const base = { currentCanonical: 'a', currentRenderHash: 'r' };
  assert.deepEqual(
    classifySurface({ ...base, surface: { src: 'a', render: 'r', renderer: '1' }, expectedRenderer: '2' }),
    ['layout-upgrade-available'],
  );
  assert.deepEqual(
    classifySurface({ ...base, surface: { src: 'a', render: 'r', renderer: '2' }, expectedRenderer: '2' }),
    [],
  );
  assert.deepEqual(
    classifySurface({ ...base, surface: { src: 'a', render: 'r', renderer: '3' }, expectedRenderer: '2' }),
    [],
  );
});

test('classifySurface: no renderer check when expectedRenderer is null (non-docCard surfaces)', () => {
  assert.deepEqual(
    classifySurface({ currentCanonical: 'a', surface: { src: 'a', render: 'r' }, currentRenderHash: 'r' }),
    [],
  );
});

test('checkAll: an old-layout docCard is informational, never in the failing set', () => {
  const { root, manifest, fp } = fixture();
  manifest.components.meta.Button.doc.surfaces.docCard = { src: fp, render: 'whatever' };
  const results = checkAll(manifest, root);
  const docCard = results.find((r) => r.surface === 'docCard');
  assert.ok(docCard, 'docCard surface should be reported');
  assert.ok(docCard.flags.includes('layout-upgrade-available'));
  // Every docCard flag must be informational — none from the failing set.
  const failing = new Set(['canonical-changed', 'stale', 'edited', 'missing-record', 'missing-surface']);
  assert.ok(docCard.flags.every((f) => !failing.has(f)), `unexpected failing flag in ${docCard.flags.join(',')}`);
});

test('checkAll: a stamped docCard (renderer "3") reports no layout upgrade', () => {
  const { root, manifest, fp } = fixture();
  manifest.components.meta.Button.doc.surfaces.docCard = { src: fp, render: 'whatever', renderer: '3' };
  const results = checkAll(manifest, root);
  const docCard = results.find((r) => r.surface === 'docCard');
  // Still edit-unverified (the CLI can't read Figma), but no layout flag.
  assert.ok(!docCard || !docCard.flags.includes('layout-upgrade-available'));
});
