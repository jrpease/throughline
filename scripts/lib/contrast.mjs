// The WCAG contrast maths and the semantic colour pair table behind the
// `color-contrast` rule (`docs/specs/2026-09-12-token-contrast-validation.md`,
// step 1). Source of truth for the prose contract is
// `skills/token-builder/SKILL.md:250-265`.
//
// MAINTENANCE: a change to the semantic role set must change this table.

export const AA_NORMAL_TEXT = 4.5;

// `text/disabled` is excluded: WCAG 1.4.3 exempts inactive user-interface
// components from the contrast minimum, and a disabled role is deliberately
// low-contrast — gating it would fail correct systems.
//
// `bg/subtle` and `bg/muted` are deliberately not paired in v1 (Open
// questions) — a system is free to use those roles for non-text surfaces, so
// pairing them risks the first false failures in the table.
//
// `border/*` needs the 3:1 non-text threshold (WCAG 1.4.11) and is a separate
// table; this one is text-on-surface only.
//
// One threshold is applied to every pair because a colour role does not say
// what text size it is used at — `text/primary` is body copy as well as
// headings, so 4.5:1 is the binding requirement for it anyway.
export const CONTRAST_PAIRS = [
  {
    fg: 'color.text.primary',
    bg: 'color.bg.default',
    threshold: AA_NORMAL_TEXT,
    why: 'the default reading pair; if this fails, body copy fails everywhere at once',
  },
  {
    fg: 'color.text.secondary',
    bg: 'color.bg.default',
    threshold: AA_NORMAL_TEXT,
    why: 'secondary text is still text, and still has to clear AA on the same surface primary does',
  },
  {
    fg: 'color.text.link',
    bg: 'color.bg.default',
    threshold: AA_NORMAL_TEXT,
    why: 'a link that fails contrast is a link nobody can find, regardless of colour meaning',
  },
  {
    fg: 'color.text.onEmphasis',
    bg: 'color.bg.emphasis',
    threshold: AA_NORMAL_TEXT,
    why: 'the role exists because it sits on the emphasis fill; that is the whole reason it is not `text/inverse`',
  },
  {
    fg: 'color.text.inverse',
    bg: 'color.bg.inverse',
    threshold: AA_NORMAL_TEXT,
    why: 'the inverse pair flips with the theme, and both sides have to keep clearing together',
  },
  {
    fg: 'color.status.success.text',
    bg: 'color.status.success.bg',
    threshold: AA_NORMAL_TEXT,
    why: 'a status text role exists to sit on that status\'s own background, not any other surface',
  },
  {
    fg: 'color.status.warning.text',
    bg: 'color.status.warning.bg',
    threshold: AA_NORMAL_TEXT,
    why: 'a status text role exists to sit on that status\'s own background, not any other surface',
  },
  {
    fg: 'color.status.danger.text',
    bg: 'color.status.danger.bg',
    threshold: AA_NORMAL_TEXT,
    why: 'a status text role exists to sit on that status\'s own background, not any other surface',
  },
];

// WCAG 2.x sRGB relative luminance over 0-255 channels.
export function relativeLuminance({ r, g, b }) {
  const linearize = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

// Takes two `#rrggbb` strings (no alpha; the caller composites first) and
// returns the raw ratio, unrounded.
export function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(parseHex(hexA));
  const lumB = relativeLuminance(parseHex(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

// `#rrggbb` or `#rrggbbaa` → `{ r, g, b, a }` with `a` in 0-1. `null` for
// anything else.
export function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  const match = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(hex);
  if (!match) return null;
  const digits = match[1];
  const r = parseInt(digits.slice(0, 2), 16);
  const g = parseInt(digits.slice(2, 4), 16);
  const b = parseInt(digits.slice(4, 6), 16);
  const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

// The `#rrggbb` of `fg` drawn over `bg` with src-over (`out = fg*a + bg*(1-a)`).
export function composite(fgHex, bgHex) {
  const fg = parseHex(fgHex);
  if (fg.a === 0) return bgHex;
  if (fg.a === 1) return fgHex.slice(0, 7);
  const bg = parseHex(bgHex);
  const mix = (fgChannel, bgChannel) => Math.round(fgChannel * fg.a + bgChannel * (1 - fg.a));
  const toHex = (value) => value.toString(16).padStart(2, '0');
  return `#${toHex(mix(fg.r, bg.r))}${toHex(mix(fg.g, bg.g))}${toHex(mix(fg.b, bg.b))}`;
}
