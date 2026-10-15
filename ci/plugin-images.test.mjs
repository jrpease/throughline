// The plugin directory's scanner reads the bytes of every image in the plugin
// and flags a run that spells a download-and-run command (it held 0.30.0 over
// "IeX" inside hero.png's compressed pixels). Metadata chunks are screened the
// same way. Keep shipped images free of both: strip text and provenance chunks,
// and re-encode (another zlib level or strategy) when the pixel data happens to
// spell one of these.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMMAND = /\b(iex|irm|iwr|curl|wget|bash|zsh|powershell|pwsh|invoke-expression|invoke-webrequest)\b/i;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'cHRM', 'pHYs', 'iCCP']);

const images = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter((p) => IMAGE.test(p) && !p.startsWith('docs/superpowers/'));

test('there are shipped images to check', () => {
  assert.ok(images.includes('.claude-plugin/icon.png'));
});

for (const path of images) {
  test(`${path}: no byte run spells a download-and-run command`, () => {
    const found = readFileSync(`${ROOT}${path}`).toString('latin1').match(COMMAND);
    assert.equal(found, null, found && `"${found[0]}" at byte ${found.index}: re-encode the image`);
  });
  if (/\.png$/i.test(path)) {
    test(`${path}: no text or provenance chunks`, () => {
      const b = readFileSync(`${ROOT}${path}`);
      const extra = [];
      for (let o = 8; o < b.length; o += 12 + b.readUInt32BE(o)) {
        const type = b.toString('latin1', o + 4, o + 8);
        if (!KEEP.has(type)) extra.push(type);
      }
      assert.deepEqual(extra, [], 'strip these chunks');
    });
  }
}
