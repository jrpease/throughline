# Component documentation archetypes

The best-practice knowledge layer for the documentation generation pipeline
(`component-builder` Step: *Author the documentation record*). When authoring a
component's `.doc.json`, match the component to the nearest **archetype** below and
seed its `dos`, `donts`, `accessibility`, `whenToUse`, and `whenNotToUse` from that
entry, then specialize to the target framework and confirm with the user. Stamp
`provenance` as `best-practice` (or `w3c-apg` for the accessibility block) for
anything sourced here.

These are **seeds, not gospel** — the user's approval and the actual built
component override them. Sources: W3C ARIA Authoring Practices Guide (roles +
keyboard), Material 3, Shopify Polaris (content/usage), IBM Carbon (usage).

## Button

- **whenToUse:** trigger an action or event (submit, confirm, open a dialog).
- **whenNotToUse:** navigation between pages/URLs (use a Link).
- **dos:** lead the label with a verb; keep one primary (highest-emphasis) button
  per view; keep labels short (≤ ~3 words).
- **donts:** don't use a button for navigation (use a Link); don't stack multiple
  primary buttons; don't disable without telling the user why.
- **accessibility (w3c-apg):** role `button`; Enter and Space activate; an
  icon-only button needs an `aria-label`; disabled buttons are not focusable.

## Input / text field

- **whenToUse:** collect a single line of free-form text.
- **whenNotToUse:** choosing from a fixed set (use Select/Radio); long multi-line
  text (use Textarea).
- **dos:** always pair with a visible label; show format hints as helper text;
  reserve space for error text to avoid layout shift.
- **donts:** don't use placeholder text as the only label (pair with a visible
  label); don't validate on every keystroke before first blur.
- **accessibility (w3c-apg):** every input has a programmatically associated
  `<label>`; error state sets `aria-invalid` and links the message via
  `aria-describedby`.

## Checkbox / radio / toggle

- **whenToUse:** checkbox/toggle for independent on/off; radio for one-of-many.
- **whenNotToUse:** a single either/or action that takes effect immediately with no
  save (prefer a toggle) vs. a form choice (prefer radio/checkbox).
- **dos:** label the control, not just the group; make the label clickable.
- **donts:** don't use a radio group for multi-select (use checkboxes); don't use
  a toggle for choices that only apply after a separate Save.
- **accessibility (w3c-apg):** roles `checkbox` / `radio` / `switch`; Space
  toggles; radio groups navigate with arrow keys; state exposed via
  `aria-checked`.

## Card

- **whenToUse:** group related content and actions about a single subject.
- **whenNotToUse:** primary page layout scaffolding (use a layout/grid component); a
  bare list of text (use a List).
- **dos:** make the primary action obvious; keep one main call-to-action per card.
- **donts:** don't nest cards more than one level; don't make the whole card AND an
  inner button separately clickable in conflicting ways.
- **accessibility:** if the whole card is a link/button, it needs an accessible
  name; don't bury interactive controls that keyboard users can't reach in order.

## Modal / dialog

- **whenToUse:** interrupt for a focused task or a decision that blocks the flow.
- **whenNotToUse:** non-critical messages (use an inline banner or toast).
- **dos:** trap focus while open; return focus to the trigger on close; provide an
  explicit close affordance.
- **donts:** don't stack modals; don't put long scrolling forms in a small modal.
- **accessibility (w3c-apg):** role `dialog` with `aria-modal="true"`; labelled by
  its title (`aria-labelledby`); Escape closes; focus is trapped within.

## Badge / chip / tag

- **whenToUse:** short status, count, or category label (badge); a removable/
  selectable token (chip).
- **whenNotToUse:** interactive primary actions (use a Button).
- **dos:** keep text to a word or two; match badge color to its semantic meaning
  (success, warning, error).
- **donts:** don't rely on color alone to convey status (include text or an icon).
- **accessibility:** a removable chip's remove control needs an accessible name
  (e.g. "Remove <label>"); status conveyed with text, not color only (WCAG 1.4.1).

## Fallback (unlisted archetype)

For a component without an entry above: derive `dos`/`donts` from its role and
built structure, source the `accessibility` block from the matching W3C APG
pattern, and mark everything for user confirmation. Add a new archetype section
here once the component's guidance stabilizes.
