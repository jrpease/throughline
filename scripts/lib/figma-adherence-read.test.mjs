import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// figma-adherence-read.figma.js is plain plugin code with no exports; pull
// screensOn out of it the way the generated snippet inlines it.
const src = readFileSync(new URL('./figma-adherence-read.figma.js', import.meta.url), 'utf8');
const screensOn = new Function(`${src}; return screensOn;`)();

const frame = (name, children = []) => ({ type: 'FRAME', name, children });
const page = {
  name: 'Desktop',
  children: [
    frame('Home', [frame('Header')]),
    { type: 'SECTION', name: 'Checkout', children: [frame('Cart')] },
    // #202: a flow kept inside a container frame.
    frame('Pre-Launch', [frame('Waitlist'), frame('Confirm'), { type: 'TEXT', name: 'Note', children: [] }]),
  ],
};

test('with no names, the screens are top-level frames and frames in sections only', () => {
  assert.deepEqual(screensOn(page, []).map((s) => s.name), ['Home', 'Cart', 'Pre-Launch']);
});

test('a named screen is found one level inside a container frame', () => {
  assert.deepEqual(screensOn(page, ['Waitlist', 'Confirm', 'Cart']).map((s) => s.name), ['Waitlist', 'Confirm', 'Cart']);
});

test('a top-level screen wins over a nested frame of the same name', () => {
  const p = { name: 'P', children: [frame('Flow', [frame('Home')]), frame('Home', [])] };
  assert.equal(screensOn(p, ['Home'])[0], p.children[1]);
});

test('a name found nowhere still throws', () => {
  assert.throws(() => screensOn(page, ['Settings']), /no screen named "Settings" on page "Desktop"/);
});
