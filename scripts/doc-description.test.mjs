import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderDescription, buildDescriptionPayload } from './doc-description.mjs';
import { canonicalFingerprint, fingerprint } from './lib/doc-record.mjs';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const BUTTON = JSON.parse(readFileSync(new URL('./lib/fixtures/render-mdx/Button.doc.json', import.meta.url), 'utf8'));

test('the description follows the component-builder template, block by block', () => {
  const { text, src } = renderDescription(BUTTON);
  assert.equal(src, canonicalFingerprint(BUTTON));
  assert.equal(text, [
    'Triggers an action or event.',
    BUTTON.description,
    '**When to use**\n- The user needs to make something happen on the current page, like saving, confirming, or opening a dialog.\n- A view needs one obvious primary action.',
    '**When not to use**\n- The control takes the user to another page or URL. Use a Link; the link variant only looks like a link and still triggers an action.',
    '**Do**\n- Lead the label with a verb.\n- Keep one primary button per view.\n- Keep labels to about three words.',
    "**Don't**\n- Don't use a button to navigate. Use a Link.\n- Don't stack two primary buttons in one view.\n- Don't disable a button without telling the user why.",
    '**Accessibility**\n- Enter activates the button.\n- Space activates the button.\n- An icon-only button needs an aria-label so screen readers can announce it.\n- A disabled or loading button can\'t take keyboard focus. Say why it is unavailable somewhere a screen reader will reach.',
    `<!-- tl:doc ${src} -->`,
  ].join('\n\n'));
});

test('empty blocks drop with their label; Accessibility stays while either list has lines', () => {
  const base = { name: 'X', summary: 'S.', description: 'D.', whenToUse: [], dos: ['Do it.'], accessibility: { keyboard: [], notes: ['A note.'] } };
  const { text, src } = renderDescription(base);
  assert.equal(text, `S.\n\nD.\n\n**Do**\n- Do it.\n\n**Accessibility**\n- A note.\n\n<!-- tl:doc ${src} -->`);
  const none = renderDescription({ ...base, accessibility: { keyboard: [], notes: [] } }).text;
  assert.doesNotMatch(none, /Accessibility/);
  assert.match(none, /<!-- tl:doc [0-9a-f]{16} -->$/);
});

const stubFigma = (nodes) => ({
  loadAllPagesAsync: async () => {},
  root: { findAllWithCriteria: () => nodes },
});
const page = (name) => ({ type: 'PAGE', name });

test('the payload sets the one matching component and proves the text arrived', async () => {
  const p = buildDescriptionPayload(BUTTON);
  assert.equal(p.render, fingerprint(p.text));
  const set = { id: '1:1', name: 'Button', type: 'COMPONENT_SET', parent: page('Components'), description: '' };
  const variant = { id: '1:2', name: 'Button', type: 'COMPONENT', parent: set };
  const other = { id: '2:1', name: 'Badge', type: 'COMPONENT_SET', parent: page('Components'), description: '' };
  const out = await new AsyncFunction('figma', p.code)(stubFigma([set, variant, other]));
  assert.deepEqual(out, { id: '1:1', name: 'Button', matches: true, length: p.text.length });
  assert.equal(set.description, p.text);
  assert.equal(other.description, '');
});

test('the payload refuses zero or two components with the name, writing nothing', async () => {
  const { code } = buildDescriptionPayload(BUTTON);
  await assert.rejects(new AsyncFunction('figma', code)(stubFigma([])), /0 components named "Button", not exactly one$/);
  const a = { id: '1:1', name: 'Button', type: 'COMPONENT_SET', parent: page('Components'), description: '' };
  const b = { id: '9:1', name: 'Button', type: 'COMPONENT_SET', parent: page('Legacy'), description: '' };
  await assert.rejects(new AsyncFunction('figma', code)(stubFigma([a, b])), /2 components named "Button", not exactly one \(1:1 on Components, 9:1 on Legacy\)/);
  assert.equal(a.description, '');
});

test('a record missing a required field is refused', () => {
  assert.throws(() => buildDescriptionPayload({ name: 'X', summary: 'S.' }), /description/);
});
