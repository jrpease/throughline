import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
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
