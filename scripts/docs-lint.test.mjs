import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintRecord } from './docs-lint.mjs';

const rules = (ws) => ws.map((w) => w.rule);
const byRule = (ws, rule) => ws.filter((w) => w.rule === rule);

test('machinery vocabulary flagged in prose, exempt fields ignored', () => {
  const ws = lintRecord({
    name: 'Button',
    summary: 'Triggers an action.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog. It binds every color, spacing, radius, and type value to the semantic tokens.',
    tokensUsed: ['color.bg.primary'],
  });
  const hits = byRule(ws, 'machinery-vocabulary');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, 'description');
  // tokensUsed is exempt — its token names must not trip the rule
  assert.ok(!hits.some((w) => w.path.startsWith('tokensUsed')));
});

test('summary echo: spec worked example yields 100% and warns', () => {
  const ws = lintRecord({
    name: 'Button',
    summary: 'Triggers an action or event.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    whenToUse: ['Trigger an action or event — submit, confirm, open a dialog'],
  });
  const hits = byRule(ws, 'summary-echo');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, 'whenToUse[0]');
  assert.match(hits[0].message, /100%/);
});

test('summary echo: spec after-example does not warn', () => {
  const ws = lintRecord({
    name: 'Button',
    summary: 'Triggers an action or event.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    whenToUse: ['Something happens on the current page — save, confirm, open a dialog'],
  });
  assert.equal(byRule(ws, 'summary-echo').length, 0);
});

test('run-on sentence over 35 words flagged', () => {
  const long = 'This sentence keeps going and going with clause after clause after clause because nobody ever stopped it from growing far beyond what any patient reader can comfortably parse in one single breath which is exactly the failure mode';
  const ws = lintRecord({ name: 'X', summary: 'Short.', description: long + '.' });
  assert.equal(byRule(ws, 'run-on-sentence').length, 1);
});

test('summary length over 12 words flagged', () => {
  const ws = lintRecord({
    name: 'X',
    summary: 'This summary uses far too many words to say a very simple thing indeed.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
  });
  assert.equal(byRule(ws, 'summary-length').length, 1);
});

test('description length outside 15–70 words flagged, inside passes', () => {
  const short = lintRecord({ name: 'X', summary: 'Short.', description: 'Too short by far.' });
  assert.equal(byRule(short, 'description-length').length, 1);
  const ok = lintRecord({
    name: 'X', summary: 'Short.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog. Its six emphasis levels signal how important an action is.',
  });
  assert.equal(byRule(ok, 'description-length').length, 0);
});

test('guidance length, terminal stop, and dont shape on dos/donts', () => {
  const ws = lintRecord({
    name: 'X', summary: 'Short.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    dos: ['Lead with a verb'],                                     // no terminal stop
    donts: ["Don't use a button for navigation — use a Link",      // no terminal stop
            'Use a Link for navigation instead of this.'],          // wrong opener
  });
  assert.equal(byRule(ws, 'terminal-stop').length, 2);
  const shape = byRule(ws, 'dont-shape');
  assert.equal(shape.length, 1);
  assert.equal(shape[0].path, 'donts[1]');
});

test('spec after-example guidance passes clean', () => {
  const ws = lintRecord({
    name: 'X', summary: 'Short.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    donts: ["Don’t use a button to navigate. Use a Link."],
  });
  assert.equal(rules(ws).filter((r) => ['guidance-length', 'terminal-stop', 'dont-shape'].includes(r)).length, 0);
});

test('treatment lead flagged in first 4 words of a meaning; later mention passes', () => {
  const ws = lintRecord({
    name: 'X', summary: 'Short.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    variants: { type: {
      primary: 'Highest-emphasis, solid brand fill — the one primary action in a view.',
      secondary: 'A supporting action, rendered with a subtle border treatment.',
    } },
    states: { disabled: "Can’t be clicked or tabbed to." },
  });
  const hits = byRule(ws, 'treatment-lead');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, 'variants.type.primary');
});

test('empty meaning under 3 words flagged', () => {
  const ws = lintRecord({
    name: 'X', summary: 'Short.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    states: { hover: 'Pointer feedback.' },
  });
  const hits = byRule(ws, 'empty-meaning');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, 'states.hover');
});

test('a record following the standard produces zero warnings', () => {
  const ws = lintRecord({
    name: 'Button',
    summary: 'Triggers an action or event.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog. Its emphasis levels signal how important an action is.',
    whenToUse: ['Something happens on the current page — save, confirm, open a dialog'],
    whenNotToUse: ['Navigating to another page. Use a Link.'],
    variants: { type: { primary: 'The one main action in a view.' } },
    states: { disabled: "Can't be clicked or tabbed to." },
    dos: ['Lead with a verb.'],
    donts: ["Don't use a button to navigate. Use a Link."],
    accessibility: {
      role: 'button',
      keyboard: ['Enter or Space activates the button.'],
      notes: ['An icon-only button needs an aria-label so screen readers can announce it.'],
    },
    tokensUsed: ['color.bg.primary'],
    status: 'stable',
  });
  assert.deepEqual(ws, []);
});

test('missing optional blocks lint without crashing', () => {
  const ws = lintRecord({ name: 'X', summary: 'Short.', description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.' });
  assert.equal(rules(ws).length, 0);
});

test('curly-apostrophe contractions tokenize and pass dont-shape', () => {
  const ws = lintRecord({
    name: 'X', summary: 'Short.',
    description: 'A clickable control that starts an action: saving a form, confirming a choice, opening a dialog.',
    donts: ["Don’t use a button to navigate. Use a Link."],
    states: { disabled: "Can’t be clicked or tabbed to." },
  });
  assert.deepEqual(ws, []);
});

test('no-inline-code flags backticked terms in prose', () => {
  const ws = lintRecord({
    name: 'Input',
    accessibility: {
      notes: [
        'Set `aria-invalid` and link the message with `aria-describedby`.',
        'Give every field a label that points at it.',
      ],
    },
  });
  const hits = byRule(ws, 'no-inline-code');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, 'accessibility.notes[0]');
});

test('no-inline-code ignores a lone backtick and plain prose', () => {
  const ws = lintRecord({
    name: 'Input',
    summary: 'Collects a short typed value.',
    accessibility: { notes: ['Use the ` character sparingly.'] },
  });
  assert.equal(byRule(ws, 'no-inline-code').length, 0);
});
