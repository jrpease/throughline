# Dimension rules for the adherence gate

Status: built
Reviewed: 2026-09-11 — ready to build
Date: 2026-09-11
Issue: #39, phase 3
Parent design: `docs/superpowers/specs/2026-08-31-code-adherence-gate-design.md` (§4, §8, §11)
Evidence: a prototype of exactly these rules, run against the two apps and the
commits in `docs/superpowers/notes/2026-09-11-colour-rule-measurement.md`

## Goal

The gate catches `#3B82F6` when a token holds that exact colour. It says nothing
about `padding: 16px` when `space.4` holds 16px, and #39 asks for both. The
parent spec held dimensions back for one reason: a 16px token can show up in
code as `16px`, `1rem`, `16` or `p-[16px]`, and getting that comparison wrong in
either direction is worse than not making it.

This spec makes the comparison, and it was measured before it was written. A
prototype of these rules read the same three runs the colour measurement used.
It flagged 98 literals. Every one was read by hand: 90 real drift, 5 false and 3
unclear. All 5 false positives were `font-weight` inside `@font-face` blocks,
so this spec skips those. That leaves **93 flags, 90 true, 0 false, 3 unclear**.

After it ships:

1. **Spacing, radius and type literals fail the build** when a token in the same
   category holds that exact value. That covers CSS, SCSS, inline styles, CSS in
   strings and Tailwind arbitrary values.
2. **Opaque `rgb()` colours are compared too**, which settles the question the
   parent spec's §11 left for this phase.
3. **Phase 4, the props block, has its answer.** It isn't triggered, and #39
   closes when this lands.

`padding: 13px` still passes on a 4/8/12/16 scale. The parent spec's Decision 3
carries over unchanged: no token for the value means no finding.

## Non-goals

- **A value with no token.** `13px`, `2.5vh`, `50%`. Decision 3 of the parent
  spec.
- **Tailwind scale steps and token utilities.** `p-4`, `rounded-lg` and
  `gap-inline-md` resolve through the consumer's Tailwind config, and reading
  that means running its JavaScript. Only arbitrary values like `p-[16px]` are
  read.
- **Component props.** `<Stack gap="16px">` and `gap={16}` aren't declarations.
  Props belong to the variant rule.
- **Anything outside the six properties below.** Shorthands like
  `font: 500 16px/1.5 Inter`, `inset`, `width`, `height`, border widths,
  shadows, icon sizes, opacity, z-index, breakpoints, `font-family`.
- **Definitions.** `--gap: 16px` and `$gap: 16px` declare a value. They don't use
  one.
- **Angular and HTML templates.** The gate scans no `.html`, per the parent
  spec's §4.
- **Cross-file aliases and a count of skipped dimension tokens.** Same shape as
  #121, and it resolves there.
- **`hsl()`, percentage channels and alpha below 1.**
- **A root font size other than 16px**, and a flag to set one.
- **Tailwind prefixes** like `tw-p-[16px]`.
- **The walker.** `lib/source-scan.mjs` doesn't change. That includes stories,
  and `storybook-static` (#124).
- **The props block (phase 4).** See Decisions.

## Decisions

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| Which properties | Six categories. **spacing:** `padding`, `margin` and each longhand (`-top`, `-right`, `-bottom`, `-left`, `-inline`, `-block`, `-inline-start`, `-inline-end`, `-block-start`, `-block-end`), plus `gap`, `row-gap`, `column-gap`, `grid-gap`, `grid-row-gap`, `grid-column-gap`. **radius:** `border-radius` and its eight corner longhands. **type:** `font-size`, `line-height`, `letter-spacing`, `font-weight`. Kebab-case and camelCase both. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #39 names spacing, radius and type. The four type properties are what "type" means in a scale. `font-weight` has a real DTCG type (`fontWeight`) and flagged 6 times in the prototype: 5 true and 1 unclear. | `inset`, `top`/`left`, `width`/`height`, borders, `font` shorthand and every other property. |
| Verdict and rule names | A new **failure** rule, `token-exists-for-dimension`, separate from `token-exists-for-literal`. It has its own inert rule, `dimension-rule-inert`. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Parent spec Decisions 6 and 7 and §11: every rule gates, and a noisy one gets narrowed, never downgraded. A separate name lets `--skip` turn off dimensions without turning off colour, or the reverse. | An advisory verdict. Folding dimensions into the colour rule's name. |
| Match within a category, or across all dimensions | Within its category only. `font-size: 12px` is compared only with font-size tokens. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Measured: matching across categories added 12 flags and all 12 were wrong, like `text-[12px]` against `radius.md` and `border-radius: 24px` against `spacing.space.6`. | A value-only lookup. |
| How a token's category is known | From the words in its path. Split the path on `.`, `-` and `_`, lowercase each word, and read from the leaf up. The first category word decides. Words: `space` `spacing` `gap` `inset` `stack` `gutter` `padding` `margin` → spacing. `radius` `rounded` `corner` → radius. `fontsize` `text` → font-size. `lineheight` `leading` → line-height. `letterspacing` `tracking` → letter-spacing. `fontweight` → font-weight. `size` and `weight` decide too: font-size or font-weight when a word above them is `font`, `text`, `typography` or `type`, and **no category** otherwise. A `$type` of `fontWeight` is always font-weight. A token whose effective `$type` is known and isn't `dimension`, `number` or `fontWeight` gets no category. | Recommended; accepted under Jordan's standing instruction (2026-09-11). DTCG's `dimension` type doesn't say what a length is for. This repo already reads role from names (`TEXT_UNIT_NAMES`, `textRoleGraph` in `lib/dtcg.mjs`). The rule sorts all three real naming shapes correctly: the generated sample (`space.4`, `radius.md`, `font.size.200`, `font.lineHeight.tight`), throughline-ds's Figma export (`spacing-primitive.space.16`, `typography-primitive.size.11`, with `spacing-primitive.size.icon.lg` left out) and zygarden (`spacing.space.4`, `text.xs`, `text.xs.lineHeight`, `leading.tight`, `typography.letterSpacing.tight`). Neither real token file carries Figma scopes in `$extensions`. | A category-mapping flag or config file. Reading Figma scopes. A token named against this vocabulary (`scale.3`) is never compared, and the report's per-category counts are where that shows. |
| Units | **px and rem compare as px, at 16px per rem.** A unitless token value in a length category is px. `em` compares only with `em`. `%` never compares. `line-height` compares unitless with unitless and px with px. `font-weight` compares whole numbers from 1 to 1000. | Recommended; accepted under Jordan's standing instruction (2026-09-11). It's the equivalence the system's own build makes. throughline-ds's token `space.16: 16` ships as `--space-16: 1rem`, and `magnitude()` in `lib/sd-native.mjs` reads rem as ×16. Neither app changes the root font size. The rem conversion found 48 of the 93 flags (`border-radius: 1rem` against `radius.4`, `padding: 0.5rem 1.25rem` against `space.2` and `space.5`). All 48 read as true or unclear. | Exact-unit matching only. Getting an app with `html { font-size: 62.5% }` right: there, `1rem` would flag against a 16px token. That app's token CSS is off by the same ratio anyway. |
| Rounding | Round to 3 decimal places on both sides before comparing. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Figma exports store float32 (`1.7000000476837158`). Rounding to 2 places would fold `0.025em` into `0.03em`. | Any tolerance wider than 0.0005. |
| Zero | Never compared, on either side. | Recommended; accepted under Jordan's standing instruction (2026-09-11). `margin: 0` isn't a choice from a scale, and both real systems hold a `space.0`. An earlier prototype saw 419 zero literals across the three runs. | Flagging `0`, `0px` or `-0`. |
| What source is read | Two shapes, in every scanned file type. **Declarations:** `property: value`, with the property in the table above, the value running to the next `;`, `{`, `}`, `,` or newline, and quotes treated as spaces. **Tailwind arbitrary values:** `p-[16px]`, `-mt-[4px]`, `rounded-tl-[8px]`, `text-[11px]`, `leading-[1.6]`, `tracking-[-0.01em]`, `font-[500]`, including after a variant like `md:`. A bare number is px only in a script file (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.vue`, `.svelte`), and only when the value isn't quoted. That's React's inline-style rule. Anywhere else a bare length number is ignored. | Recommended; accepted under Jordan's standing instruction (2026-09-11). An earlier prototype counted the contexts in throughline-ds: 74 Tailwind arbitrary values, 23 unquoted numbers in inline styles, 20 quoted strings. Zygarden is almost all SCSS. Stopping at `,` is what separates `{ fontSize: 13, marginTop: 16 }`, and none of the six properties takes a top-level comma. | Tailwind step classes. `font` shorthand. Quoted object keys (`'font-size': 12`). |
| Numbers inside parentheses | Skipped. Everything between `(` and its matching `)` is blanked before numbers are read, and an unclosed `(` blanks to the end of the value. | Recommended; accepted under Jordan's standing instruction (2026-09-11). `var(--space-4, 16px)` is correct code: the 16px is the token's fallback. `calc()`, `clamp()`, `min()` and `max()` arguments are arithmetic, not scale steps. The measured cost is 6 flags: 5 fluid bounds in zygarden's brand guide, like `clamp(3rem, 18vw, var(--text-9xl))`, and 1 in throughline-ds. | Flagging a clamp bound that equals a token. |
| `@font-face` | Declarations inside an `@font-face { … }` block are blanked before dimensions are read. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Measured: the only 5 false positives in the prototype were the `font-weight` descriptors in `zygarden-client/src/styles.scss`'s `@font-face` blocks. Those describe a font file, and a token can't stand in. Removing them cost 0 true positives. | Skipping any other at-rule. |
| Comments, and the token package | Comments are blanked with the existing `blankComments` before dimensions are read. The CLI's token-package exclusion already applies to every rule, so it covers this one. Masks don't matter here. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Same reasoning as the colour narrowing (`docs/specs/2026-09-11-narrow-colour-rule.md`): a comment isn't code, and a token package isn't its own consumer. | Comment-blanking that differs between the two rules. |
| What the report prints | The headline gains `N dimension literals`. A new line reads `dimensions:   N token values comparable — spacing a, radius b, font-size c, line-height d, letter-spacing e, font-weight f`. The failure line shows the category, the literal as written and, when that differs, the value it was compared as: `[token-exists-for-dimension] spacing 1rem (16px) at app/a.scss:12 — spacing.space.4 resolves to exactly this value`. `nothing-scanned` counts dimension literals as something read. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The per-category counts are how a system whose names miss the vocabulary finds out (`radius 0`), which is the naming rule's blind spot made visible. Showing `(16px)` keeps a rem or Tailwind finding readable. | A per-category inert rule. A silent skip count. |
| `rgb()` and `hsl()` (parent §11) | **Normalise opaque integer `rgb()` / `rgba()` to hex on both sides.** Channels must be whole numbers from 0 to 255, comma- or space-separated. The alpha must be absent, `1`, `1.0` or `100%`. `hsl()`, percentage channels, any alpha below 1 and anything holding `var()` stay uncomparable. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Measured across the three runs: 100 `rgb()`/`hsl()` literals: 91 with alpha below 1 (no hex token can match those), 4 holding `var()`, and 5 opaque with integer channels. 4 of those 5 match a token, all in zygarden's brand guide (`rgba(163, 230, 34, 1)` is `color.green.300`). No token in any of the three systems is authored as `rgb()` or `hsl()`. Integer rgb to hex is exact. hsl to rgb rounds, and a guess is worse than declining. | Normalising `hsl()`, percentages or alpha. |
| Where the code lives | All in `scripts/validate-adherence.mjs`, importing only what it already imports plus `flattenDtcgTypes` from `lib/dtcg.mjs`. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The install set doesn't change, so no skill copy list or `scripts/README.md` table changes (`ci/validate-install-sets.mjs`). | A new `lib/` module. |
| Is phase 4 (a props block) triggered? | **No.** #39 closes when this lands. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The parent spec's §8 triggers it only "if the coverage line from phase 2 shows the axis convention does not hold in practice". Nothing has shown that. The convention held 14 of 14 in a generated system (`2026-08-31-adherence-convention-measurement.md`), and 13 of 15 attributes matched in the e2e, where both misses were real non-axis props (`placeholder`, `value`). The colour measurement couldn't produce a coverage number at all: throughline-ds has no doc records (`variant axes: 0 of 0`), and zygarden has no JSX. The one counter-example is a hand-authored conceptual axis, which `--skip unknown-variant-value` already answers. | Scheduling the props block now. What would reopen it: a run against a JSX app **with** doc records that fails `variant-rule-inert` because the names disagree. |
| CHANGELOG | Fold into the existing unreleased gate entry under `[Unreleased]` → Added. | Recommended; accepted under Jordan's standing instruction (2026-09-11). No user has run the gate. #109 and #123 set the precedent. | A separate Added entry for an unreleased feature. |
| Where the real numbers live | A new measurement note, written by the build from the real change, not the prototype, plus `## What shipped` in this spec. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The colour rule's evidence lives in a note, and this rule's belongs beside it. | Recording prototype numbers as shipped. |

## Open questions

- **Story scaffolding.** Pointed at throughline-ds's `packages/`, the prototype
  flags 12 layout wrappers in `.stories.tsx` files and `.storybook/preview.tsx`
  (`gap: '0.75rem'` between demo buttons). The documented install scans `apps/`,
  and skipping `.stories.` means changing the walker `grep-color-usage.mjs` and
  `guard-token-removal.mjs` share. **I'd recommend waiting for a real run from
  `apps/` that hits it, and folding it into #124 if one does.** Unresolved.
- **Tailwind prefixes** (`tw-p-[16px]`). Zygarden sets a `tw-` prefix, but its
  arbitrary values live in `.html` templates the gate doesn't read.
  **I'd recommend waiting for evidence.** Unresolved.
- **Root font size.** An app that sets `html { font-size: 62.5% }` would see
  `1rem` flagged against a 16px token. **I'd recommend waiting**, since neither
  real app does it and that app's token CSS has the same problem. Unresolved.
- **Object numbers that aren't styles.** `{ padding: 16 }` handed to a chart
  library reads as a px spacing literal. It didn't appear in either app.
  **I'd recommend waiting.** Unresolved.
- **Skipped dimension tokens and cross-file aliases.** zygarden's
  `radius-semantic.json` points into `radius-primitives.json`, so its semantic
  radii aren't compared. The primitives they point at are, so nothing is missed,
  but a finding names `radius.4` where `radius.card` is the better fix.
  **I'd recommend handling it in #121**, alongside the colour version.
  Unresolved.

## What shipped

All seven steps, on `feat/39-dimension-rules`, in `scripts/validate-adherence.mjs`
and its tests, plus the CHANGELOG and `scripts/README.md`.

- **`token-exists-for-dimension`** fails a spacing, radius or type literal a
  token in the same category already holds, read from declarations and Tailwind
  arbitrary values. **`dimension-rule-inert`** fails a run whose token files
  yield no comparable dimension. The report's headline counts dimension
  literals, and a `dimensions:` line counts comparable tokens per category.
- **Opaque integer `rgb()` / `rgba()`** is normalised to hex on both sides of
  the colour rule.
- **Phase 4 isn't triggered.** #39 closes when this lands.

Measured against the real change, not the prototype, in
`docs/superpowers/notes/2026-09-11-dimension-rule-measurement.md`:

| run | files | dimension literals | dimension flags | true | false | unclear | colour flags |
|---|---|---|---|---|---|---|---|
| `throughline-ds` `--root apps` | 66 | 113 | 34 | 34 | 0 | 0 | 12 → 12 |
| `zygarden` `--root apps` | 69 | 85 | 33 | 31 | 0 | 2 | 11 → 15 |
| `zygarden` `--root libs` | 742 | 2586 | 26 | 25 | 0 | 1 | 3 → 3 |
| **total** | 877 | 2784 | **93** | **90** | **0** | **3** | **26 → 30** |
| `throughline-ds` `--root packages` | 29 | 13 | 12 | story scaffolding | | | 0 → 0 |

Every dimension flag list is identical to the prototype's, duplicates kept. The
only colour change is the four expected `rgb()` flags in zygarden `apps`. CI's
seven steps pass, with 587 tests.

## Where it diverged

- **Routing.** Steps 1 to 4 went to `implementer`. Steps 5, 6 and 7 ran inline.
  None came back BLOCKED.
- **Step 3 exports two helpers it didn't name as exports.** `blankParens` and
  `blankFontFaces` are exported, beside `blankComments` and `blankMasks`, which
  already were. Nothing imports them yet. Behaviour matches the step.
- **Step 5's `grep -n 'dimension'` shows no new CHANGELOG line.** The entry says
  "spacing, radius or type", the words a reader uses, not "dimension". The
  check ran as `grep -n 'spacing, radius or type' scripts/README.md CHANGELOG.md`
  instead, which shows the table row, the usage sentence and the new bullet. The
  README's usage sentence matches the original grep.
- **Step 5's `rgb()` bullet carries an example** (`rgba(163, 230, 34, 1)` and
  `#a3e622`) the step didn't list. It's the value the measurement found.
- **Step 7's colour flags got a read the step didn't ask for.** The four new
  `rgb()` flags are 2 true and 2 unclear, read from source in this run and
  recorded in the note. They sit outside the 93.

Nothing else moved. Every other Verify passed as written.

## Plan

Everything below runs from the repo root on branch `feat/39-dimension-rules`.

**Scratch material.** The measurement clones, the prototype and the expected
flag lists live in this session's scratchpad. Every command below uses:

```sh
M=/private/tmp/claude-501/-Users-jordanpease-Dev-throughline/34e9781c-566c-40de-b615-11bc1fb97988/scratchpad/measure
```

- `$M/throughline-brand` at `2a9d370`, and `$M/zygarden-frontend` at `ca61ca9a6`.
  If they're gone, rebuild them from the Reproduce block in
  `docs/superpowers/notes/2026-09-11-colour-rule-measurement.md`.
- `$M/dim-spec-proto.mjs` is a throwaway prototype of Steps 2 and 3, and
  `$M/rgb-spec-proto.mjs` of Step 1. They're a reference only. The briefs below
  are complete without them.
- `$M/expected/dim-*.tsv` hold the prototype's flags as
  `<path relative to --root>:<line>\t<category>\t<compared value>`, sorted with
  `LC_ALL=C`. `$M/norm-dim-report.mjs` turns a gate report into the same shape.
- `$M/after-*.txt` are the colour runs after #123, to diff colour flags against.

All code changes go in `scripts/validate-adherence.mjs`. Every new test goes in
`scripts/validate-adherence.test.mjs` in the house style: `node:test`, inline
fixtures, line numbers counted by hand in the fixture rather than read back off
the implementation, and tmp dirs for CLI tests.

### Step 1 — Compare opaque `rgb()` colours

Files: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`

Change:
- Export `rgbToHex(value)`:
  - Match `String(value).trim()` against `/^rgba?\(\s*([^()]*)\)$/i`. No match
    returns `null`.
  - Split the capture on `/[\s,/]+/` and drop empty parts. Fewer than 3 or more
    than 4 parts returns `null`.
  - Each of the first three parts must match `/^\d{1,3}$/` and be `<= 255`.
    Otherwise return `null`.
  - A fourth part must match `/^(1(\.0+)?|100%)$/`. Otherwise return `null`.
  - Return `normalizeHex('#' + the three channels as two-digit lowercase hex)`.
- Add `const RGB = /\brgba?\([^()]*\)/gi;` next to `HEX`, and change the comment
  above `HEX` to say that hex and opaque integer `rgb()` are compared (see
  `rgbToHex`), and that `hsl()` and alpha below 1 are not.
- In `extract`, after the `HEX` loop, loop `colourText.matchAll(RGB)`. For each
  match with a non-null `rgbToHex(m[0])`, push `{ value, line: lineOf(colourText, m.index) }`
  onto `literals`.
- In `buildTokenValues`, compute `const hex = normalizeHex(resolved) ?? rgbToHex(resolved);`.
- Leave `normalizeHex` unchanged.

Tests:
- `rgbToHex` returns `#3b82f6` for `rgb(59, 130, 246)`, `rgba(59,130,246,1)`,
  `rgb(59 130 246 / 100%)` and `rgb(59 130 246 / 1.0)`.
- `rgbToHex` returns `null` for `rgba(59, 130, 246, 0.5)`, `rgb(50%, 10%, 0%)`,
  `rgb(var(--c) / 1)`, `hsl(217 91% 60%)`, `rgb(256, 0, 0)` and `rgb(1, 2)`.
- `extract` on `.a { border-color: rgba(59, 130, 246, 1); }\n` with path
  `a.scss` has `literals` deep-equal to `[{ value: '#3b82f6', line: 1 }]`.
- The same declaration inside `/* … */` yields no literal, and so does
  `mask: linear-gradient(rgb(255, 255, 255) 0 0);` in `a.scss`.
- Change the existing test "a non-hex token value is counted uncomparable, not
  compared" to use `hsl(217 91% 60%)`. It still expects `t.size === 0`.
- New: `buildTokenValues([{ c: { x: { $value: 'rgb(59, 130, 246)', $type: 'color' } } }]).get('#3b82f6')`
  deep-equals `['c.x']`.
- The existing `normalizeHex('rgb(1,2,3)') === null` assertion still passes.

Verify: `node --test scripts/validate-adherence.test.mjs` → all pass.

### Step 2 — Classify dimension tokens and build their value map

Files: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`

Change:
- Import `flattenDtcgTypes` from `./lib/dtcg.mjs` alongside `flattenDtcg` and
  `resolveValue`.
- Export `DIMENSION_CATEGORIES = ['spacing', 'radius', 'font-size', 'line-height', 'letter-spacing', 'font-weight']`.
  Every report line lists categories in this order.
- Export `dimensionCategory(path, type)`:
  - If `type !== undefined` and `type` isn't `dimension`, `number` or
    `fontWeight`, return `null`. If `type === 'fontWeight'`, return
    `'font-weight'`.
  - `words = path.split('.').flatMap((s) => s.toLowerCase().split(/[-_]/)).filter(Boolean)`.
  - Walk `words` from the last index to the first:
    - If the word is `size` or `weight`: if any earlier word (index below this
      one) is in `{font, text, typography, type}`, return `'font-size'` for
      `size` or `'font-weight'` for `weight`. Otherwise return `null`.
    - If the word is in this map, return its value: `space`, `spacing`, `gap`,
      `inset`, `stack`, `gutter`, `padding`, `margin` → `spacing`. `radius`,
      `rounded`, `corner` → `radius`. `fontsize`, `text` → `font-size`.
      `lineheight`, `leading` → `line-height`. `letterspacing`, `tracking` →
      `letter-spacing`. `fontweight` → `font-weight`.
  - Return `null` if no word decided.
- Export `canonicalDimension(raw, category, unitless)`. `unitless` is `'px'` or
  `null` and says what a bare number means for a length category.
  - A `number` raw is `n` with unit `''`. A `string` raw must match
    `/^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em|%)?$/` after `trim()`, giving `n`
    and unit (`''` when absent). Anything else returns `null`.
  - Return `null` if `n` isn't finite, `n === 0`, or the unit is `%`.
  - `r3(x)` is `Math.round(x * 1000) / 1000`, with `-0` turned into `0`.
  - `font-weight`: return `String(n)` only when the unit is `''`, `n` is an
    integer and `0 < n <= 1000`. Otherwise `null`.
  - `line-height` with unit `''`: return `String(r3(n))`.
  - Unit `em`: `` `${r3(n)}em` ``. Unit `rem`: `` `${r3(n * 16)}px` ``. Unit
    `px`: `` `${r3(n)}px` ``.
  - Unit `''` in any other category: `` `${r3(n)}px` `` when `unitless === 'px'`,
    otherwise `null`.
- Export `buildDimensionValues(dicts)`. It returns a
  `Map<category, Map<value, path[]>>`, and creates a category's inner map only
  when a value is added to it. For each dict, take `flat = flattenDtcg(dict)` and
  `types = flattenDtcgTypes(dict)`. For each path:
  - `category = dimensionCategory(path, types[path])`. Skip it if `null`.
  - Resolve with `resolveValue(path, flat)` inside `try`/`catch`. Skip it on
    throw.
  - `value = canonicalDimension(resolved, category, 'px')`. Skip it if `null`.
  - Push `path` onto `out.get(category).get(value)`.
- Add a comment above these functions naming this spec, and add the spec to the
  file header's list of spec pointers.

Tests:
- `dimensionCategory` returns the category shown for each `[path, type]`. These
  are the three real naming shapes:
  - `space.4`, `spacing-primitive.space.16`, `spacing-semantic.inline.lg` and
    `space.inset.sm` (all `dimension`) → `spacing`. So does `space.4` with type
    `undefined`.
  - `radius.md`, `radius-semantic.card`, `border.radius.sm` → `radius`.
  - `font.size.200`, `typography-primitive.size.11`, `text.xs`,
    `typography.textStyle.displayLg.fontSize` → `font-size`.
  - `text.xs.lineHeight`, `leading.tight`, and `font.lineHeight.tight` with type
    `number` → `line-height`.
  - `typography.letterSpacing.tight`, `typography-primitive.tracking.h1` →
    `letter-spacing`.
  - `font.weight.bold` and `typography.fontWeight.regular` with type
    `fontWeight` → `font-weight`.
  - `stroke.weight.thin`, `spacing-primitive.size.icon.lg`,
    `border-semantic.width.default`, `focus.ringWidth` (all `dimension`),
    `opacity-primitive.opacity.40` (`number`), `color.text.primary` (`color`)
    and `typography-primitive.family.display` (`string`) → `null`.
- `canonicalDimension` gives these results for `(raw, category, unitless)`:
  - `(16, 'spacing', 'px')` → `'16px'`. `('16px', 'spacing', null)` → `'16px'`.
    `('1rem', 'spacing', null)` → `'16px'`. `('1.0rem', 'spacing', null)` →
    `'16px'`. `('0.6875rem', 'font-size', null)` → `'11px'`.
  - `('16', 'spacing', null)` → `null`. `('16', 'spacing', 'px')` → `'16px'`.
  - `(0, 'spacing', 'px')`, `('0px', 'spacing', null)`, `('-0px', 'spacing', null)`
    and `('50%', 'radius', null)` → `null`.
  - `('-0.03em', 'letter-spacing', null)` → `'-0.03em'`.
    `('0.025em', 'letter-spacing', null)` → `'0.025em'`.
    `('-2', 'letter-spacing', 'px')` → `'-2px'`.
  - `(1.7000000476837158, 'line-height', 'px')` → `'1.7'`.
    `('1.5', 'line-height', null)` → `'1.5'`. `('20px', 'line-height', null)` →
    `'20px'`.
  - `(400, 'font-weight', 'px')` and `('400', 'font-weight', null)` → `'400'`.
    `('bold', 'font-weight', null)` and `('400px', 'font-weight', null)` →
    `null`.
  - `({ value: 16, unit: 'px' }, 'spacing', 'px')`,
    `('calc(1rem + 2px)', 'spacing', null)` and `('16vh', 'spacing', null)` →
    `null`.
- `buildDimensionValues` on
  `{ space: { $type: 'dimension', 4: { $value: '16px' } }, inset: { md: { $value: '{space.4}', $type: 'dimension' } }, radius: { lg: { $value: 16, $type: 'dimension' } }, font: { size: { base: { $value: '1rem', $type: 'dimension' } } }, zero: { space: { 0: { $value: '0px', $type: 'dimension' } } } }`:
  - `get('spacing').get('16px')` deep-equals `['space.4', 'inset.md']`.
  - `get('radius').get('16px')` deep-equals `['radius.lg']`.
  - `get('font-size').get('16px')` deep-equals `['font.size.base']`.
  - `get('spacing').size === 1`, so the zero token is absent.
- `buildDimensionValues` doesn't throw on an unknown reference or a two-token
  cycle, both typed `dimension`.

Verify: `node --test scripts/validate-adherence.test.mjs` → all pass.

### Step 3 — Read dimension literals from source

Files: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`

Change:
- Build a `Map` from a normalised property name to its category. The name is
  lowercase with every `-` removed, so `padding-inline-start` and
  `paddingInlineStart` are both `paddinginlinestart`.
  - `padding` and `margin`, each with the suffixes `''`, `top`, `right`,
    `bottom`, `left`, `inline`, `block`, `inlinestart`, `inlineend`,
    `blockstart`, `blockend` → `spacing`.
  - `gap`, `rowgap`, `columngap`, `gridgap`, `gridrowgap`, `gridcolumngap` →
    `spacing`.
  - `border${c}radius` for `c` in `''`, `topleft`, `topright`, `bottomright`,
    `bottomleft`, `startstart`, `startend`, `endstart`, `endend` → `radius`.
  - `fontsize` → `font-size`, `lineheight` → `line-height`, `letterspacing` →
    `letter-spacing`, `fontweight` → `font-weight`.
- Add these regexes:
  - `DECLARATION = /(?<![\w$@.#-])([a-zA-Z][a-zA-Z-]*)\s*:\s*([^;{}\n,]*)/g`
  - `VALUE_NUMBER = /(?<![\w.#$%-])-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)?(?![\w.%(-])/g`
  - `TAILWIND = /(?<![\w-])(-?)(p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?|text|leading|tracking|font)-\[([^\]\s]+)\]/g`
  - `SCRIPT_FILE = /\.(tsx?|jsx?|mjs|cjs|vue|svelte)$/`
- A Tailwind utility's category: one starting `p`, `m`, `gap` or `space` →
  `spacing`. One starting `rounded` → `radius`. `text` → `font-size`, `leading`
  → `line-height`, `tracking` → `letter-spacing`, `font` → `font-weight`.
- `blankParens(value)`: walk the characters, tracking depth. `(` adds one to the
  depth and becomes a space. `)` at depth above 0 takes one off and becomes a
  space. Any other character becomes a space while the depth is above 0. The
  length is unchanged.
- `blankFontFaces(text)`: replace every match of `/@font-face\s*\{[^}]*\}/g` with
  the same string where every character except `\n` is a space. Reuse the
  existing `spaces` helper.
- Export `extractDimensions(text, path = '')`, returning
  `[{ category, written, value, line }]`:
  - `t = blankFontFaces(blankComments(text, path))`, with lines counted by
    `lineOf(t, index)`.
  - For each `DECLARATION` match: look up the category of
    `m[1].toLowerCase().replace(/-/g, '')`, and skip it if absent.
    `quoted = /^\s*['"`]/.test(m[2])`. `v = blankParens(m[2].replace(/['"`]/g, ' '))`.
    For each `VALUE_NUMBER` match `n` in `v`:
    `value = canonicalDimension(n[0], category, SCRIPT_FILE.test(path) && !quoted ? 'px' : null)`.
    If non-null, push `{ category, written: n[0], value, line: lineOf(t, m.index) }`.
  - For each `TAILWIND` match: skip it if `m[1] === '-'` and `m[3]` starts with
    `-`. `value = canonicalDimension(m[1] + m[3], category, null)`. If non-null,
    push `{ category, written: `${m[1]}${m[2]}-[${m[3]}]`, value, line: lineOf(t, m.index) }`.
- `extract` returns `{ imported, usages, literals, dimensions }`, with
  `dimensions = extractDimensions(text, path)`. Import, element and hex
  extraction don't change.

Tests. Each fixture is passed to `extract(text, '@acme/ui', path)` and asserts on
`.dimensions`, mapped to `[category, written, value, line]`:
- `a.scss`, `.a {\n  padding: 0 32px;\n  border-radius: 0.5rem;\n  margin: 0;\n}\n` →
  `[['spacing','32px','32px',2], ['radius','0.5rem','8px',3]]`.
- `a.css` holding `.a {` on line 1, then one declaration per line, in this order:
  `padding-inline-start: 8px;`, `border-top-left-radius: 4px;`, `row-gap: 12px;`,
  `line-height: 1.5;`, `letter-spacing: -0.02em;`, `font-weight: 600;`,
  `font-size: 14px;`. Expect one entry each, in order: spacing 8px, radius 4px,
  spacing 12px, line-height 1.5, letter-spacing -0.02em, font-weight 600,
  font-size 14px, at lines 2 to 8. The closing `}` is line 9.
- `a.tsx`, `<div style={{ marginTop: 16, fontSize: 13, lineHeight: 1.05, fontWeight: 500, padding: '8px 12px' }} />\n` →
  `[['spacing','16','16px',1], ['font-size','13','13px',1], ['line-height','1.05','1.05',1], ['font-weight','500','500',1], ['spacing','8px','8px',1], ['spacing','12px','12px',1]]`.
- `.a { margin-top: 16; }\n` in `a.scss` → `[]`. `const s = { padding: '16' };\n`
  in `a.tsx` → `[]`.
- `a.tsx`, `<div className="p-[16px] md:py-[6rem] -mt-[4px] rounded-[8px] text-[11px] text-[#fff] leading-[1.6] tracking-[-0.01em] font-[500] w-[16px] tw-p-[16px]" />\n` →
  `[['spacing','p-[16px]','16px',1], ['spacing','py-[6rem]','96px',1], ['spacing','-mt-[4px]','-4px',1], ['radius','rounded-[8px]','8px',1], ['font-size','text-[11px]','11px',1], ['line-height','leading-[1.6]','1.6',1], ['letter-spacing','tracking-[-0.01em]','-0.01em',1], ['font-weight','font-[500]','500',1]]`.
- `a.scss`, `.a {\n  padding: calc(100% - 16px) 8px;\n  font-size: clamp(3rem, 11vw, 13rem);\n  margin: var(--space-4, 16px);\n  gap: max(8px, 1vw);\n}\n` →
  `[['spacing','8px','8px',2]]`.
- `a.scss`, `/* padding: 16px */\n// margin: 8px\n.a { gap: 4px; }\n` →
  `[['spacing','4px','4px',3]]`.
- `a.css`, `@font-face {\n  font-family: 'X';\n  font-weight: 400;\n}\n.a { font-weight: 400; }\n` →
  `[['font-weight','400','400',5]]`.
- `a.scss`, `.a { --gap: 16px; }\n$gap: 16px;\n` → `[]`.
- The existing `SRC` fixture has `extract(SRC, '@acme/ui').dimensions` deep-equal
  to `[]`.

Verify: `node --test scripts/validate-adherence.test.mjs` → all pass.

### Step 4 — The rule, its report and the CLI

Files: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`

Change in `validate`:
- Accept `dimensionValues = new Map()`. Each `files` entry may carry
  `dimensions`, read as `dimensions = []` when absent.
- Add `stats.dimensions = 0`, plus `stats.dimensionTokens`: an object keyed by
  every entry of `DIMENSION_CATEGORIES`, where each value is the total number of
  token paths across that category's inner map (0 when the category is absent).
- In the per-file loop, after literals, for each `d` of `dimensions`: add one to
  `stats.dimensions`. Skip the rest if `token-exists-for-dimension` is skipped.
  Otherwise `tokens = dimensionValues.get(d.category)?.get(d.value)`. If
  `tokens`, push
  `{ rule: 'token-exists-for-dimension', category: d.category, written: d.written, value: d.value, tokens, file: path, line: d.line }`.
- `nothing-scanned` fires only when `stats.usages`, `stats.literals` and
  `stats.dimensions` are all 0.
- After the `colour-rule-inert` check, add: if `token-exists-for-dimension` isn't
  skipped and `dimensionValues.size === 0`, push
  `{ rule: 'dimension-rule-inert' }`.

Change in `formatReport`:
- Headline:
  `` `tokens:validate-adherence — ${s.usages} usages, ${s.literals} colour literals, ${s.dimensions} dimension literals, ${s.files} files` ``.
- Straight after the `not read:` line, and before any `excluded:` line:
  `` `  dimensions:   ${total} token values comparable — ${DIMENSION_CATEGORIES.map((c) => `${c} ${s.dimensionTokens[c]}`).join(', ')}` ``,
  where `total` is the sum of the six counts.
- Failure branch for `token-exists-for-dimension`:
  `` `  - [${f.rule}] ${f.category} ${f.written}${f.written === f.value ? '' : ` (${f.value})`} at ${f.file}:${f.line} — ${f.tokens.join(', ')} resolve${f.tokens.length === 1 ? 's' : ''} to exactly this value` ``.
- Failure branch for `dimension-rule-inert`:
  `` `  - [${f.rule}] no token file yielded a comparable spacing, radius or type value, so nothing was checked against. Pass the --tokens file that holds them, or --skip token-exists-for-dimension if this system has none.` ``.
- In the `nothing-scanned` line, change "yielded no component reference and no
  colour literal" to "yielded no component reference, colour literal or
  dimension literal". Leave the rest of the sentence alone.

Change in `main()`:
- Read the token files once, as
  `const tokenDicts = (values.tokens ?? []).map((f) => read(f, 'a token source'));`.
  Pass `tokenDicts` to `buildTokenValues`, and to a new
  `buildDimensionValues(tokenDicts)`.
- Keep a scanned file when `usages.length || literals.length || dimensions.length`,
  and push `{ path, usages, literals, dimensions }`.
- Pass `dimensionValues` to `validate`.

Existing tests. These edits keep them meaning what they meant:
- Add `const DIMS = buildDimensionValues([{ space: { 4: { $value: '16px', $type: 'dimension' } } }]);`
  beside `TOKENS`, and import `buildDimensionValues`, `extractDimensions`,
  `dimensionCategory`, `canonicalDimension` and `rgbToHex`.
- Change the helper to
  `const file = (usages = [], literals = [], dimensions = []) => [{ path: 'a.tsx', usages, literals, dimensions }];`.
- Add `dimensionValues: DIMS` to **every** `validate({ … })` call that passes
  `tokenValues: TOKENS`. Without it, each one would also fail
  `dimension-rule-inert`.
- In "nothing-scanned reports the files walked", change the headline assertion to
  `/0 usages, 0 colour literals, 0 dimension literals, 12 files/`.
- In "every rule renders without undefined leaking into the text", pass
  `dimensionValues: DIMS` and add
  `[{ category: 'spacing', written: '1rem', value: '16px', line: 6 }]` as the
  file's dimensions. Then assert the text matches
  `/\[token-exists-for-dimension\] spacing 1rem \(16px\) at a\.tsx:6 — space\.4 resolves to exactly this value/`.
  In the same test, render `validate({ files: [], dimensionValues: new Map() })`
  and assert that its text has no `undefined` and matches
  `/dimension-rule-inert/` and `/--skip token-exists-for-dimension/`.

New tests:
- A dimension equal to a token in its category fails: `DIMS` with
  `{ category: 'spacing', written: '16px', value: '16px', line: 1 }` gives
  exactly one `token-exists-for-dimension` failure, with `tokens` deep-equal to
  `['space.4']`.
- The same value in another category is silent: `category: 'radius'` with `DIMS`
  gives no dimension failure.
- A value with no token is silent: `value: '13px'` gives no failure.
- Skipped means neither run nor inert: `skip: ['token-exists-for-dimension']`
  with `dimensionValues: new Map()` and a spacing dimension gives no
  `token-exists-for-dimension` and no `dimension-rule-inert`.
- An empty map is inert: `dimensionValues: new Map()` without the skip includes
  `dimension-rule-inert`.
- `nothing-scanned` is silent when only a dimension was read.
- The report counts comparable tokens per category: with `DIMS`, the text matches
  `/dimensions:   1 token values comparable — spacing 1, radius 0, font-size 0, line-height 0, letter-spacing 0, font-weight 0/`.
- A CLI test using the existing `tree` helper and `SYSTEM`:
  - Root `app/page.scss` holds `.a { padding: 1rem; }\n`.
  - `tokens.json` holds
    `{ "space": { "4": { "$value": "16px", "$type": "dimension" } }, "c": { "$value": "#3B82F6", "$type": "color" } }`
    and sits outside the root, in its own `tree`.
  - The run passes `--skip unknown-variant-value` (reuse `runCli`).
  - Expect exit 1, output matching
    `/\[token-exists-for-dimension\] spacing 1rem \(16px\) at .*page\.scss:1 — space\.4 resolves to exactly this value/`,
    and a headline containing `0 colour literals, 1 dimension literals, 1 files`.

Verify: `node --test scripts/validate-adherence.test.mjs` → all pass. Then
`node scripts/validate-adherence.mjs` with no arguments → exit 2 and the usage
line, unchanged.

### Step 5 — Document it

Files: `CHANGELOG.md`, `scripts/README.md`

Change:
- `CHANGELOG.md`, the `scripts/validate-adherence.mjs` entry under `[Unreleased]`
  → Added. Write it with the `write-like-jordan` skill, matching the
  neighbouring bullets.
  - In the opening paragraph, the list of what fails gains "a spacing, radius
    or type literal a token already holds, in the same category".
  - Replace the "Only hex colours are compared" bullet. Hex and opaque
    `rgb()` are compared. `hsl()` and anything with alpha below 1 are left
    alone rather than guessed at. Keep its last clause: a literal with no
    matching token is never reported at all.
  - Add a bullet on dimensions:
    - `1rem` and `16px` count as the same value, because that's what the token
      build emits.
    - A value is only compared against tokens in its own category, and a token's
      category comes from its name. The report prints how many tokens landed in
      each category, so a system whose names don't fit shows it.
    - Numbers inside `calc()`, `clamp()` or a `var()` fallback, `0`, and
      `@font-face` descriptors are left alone.
    - Tailwind step classes like `p-4` aren't read, only arbitrary values like
      `p-[16px]`.
  - Update "Four things worth knowing" to match the new count.
- `scripts/README.md`:
  - In the top table's `validate-adherence.mjs` row, change "no colour literal
    duplicates a token" to "no colour, spacing, radius or type literal
    duplicates a token".
  - In the paragraph under `## Usage`, add one sentence: `--skip
    token-exists-for-dimension` is the answer for a system with no spacing,
    radius or type tokens, which otherwise fails as `dimension-rule-inert`.

Verify:
- `node ci/validate-install-sets.mjs` → exit 0. It parses `scripts/README.md`.
- `grep -n 'dimension' scripts/README.md CHANGELOG.md` shows the new text in both
  places named above, and nowhere else changed.
- Both edits read by eye against the neighbouring entries.

### Step 6 — CI

Files: none

Change: none. Run each step of `.github/workflows/ci.yml` as its own command:
`node --test`; `node ci/validate-plugin.mjs`; `node ci/validate-skills.mjs`;
`node ci/validate-install-sets.mjs`; `node scripts/adapters/generate.mjs --check`;
`node scripts/build-doc-card-builder.mjs --check`;
`node scripts/build-native-adapter-config.mjs --check`.

Verify: all seven exit 0.

### Step 7 — Measure the real change, record it, close out this spec

Files: a new `docs/superpowers/notes/<date +%F>-dimension-rule-measurement.md`,
this spec

Change: confirm the clones are still at `2a9d370`
(`git -C $M/throughline-brand log -1 --format=%h`) and `ca61ca9a6`
(`git -C $M/zygarden-frontend log -1 --format=%h`). Then, from the repo root:

```sh
B=$M/throughline-brand
node scripts/validate-adherence.mjs --root $B/apps --system $B \
  --package @throughline-ds/ui --tokens $B/packages/tokens/dtcg/tokens.json > $M/dim-brand-apps.txt
node scripts/validate-adherence.mjs --root $B/packages --system $B \
  --package @throughline-ds/ui --tokens $B/packages/tokens/dtcg/tokens.json > $M/dim-brand-packages.txt
Z=$M/zygarden-frontend; T=$Z/libs/shared/util-tokens/src/tokens
for R in apps libs; do
  node scripts/validate-adherence.mjs --root $Z/$R --system $Z --package @zygarden/none \
    $(for f in $T/*.json; do printf -- '--tokens %s ' "$f"; done) \
    --skip unknown-component --skip unknown-variant-value > $M/dim-zyg-$R.txt
done
```

Dimension flags against the prototype's, keeping duplicates:

```sh
d() { node $M/norm-dim-report.mjs "$1" "$2" | LC_ALL=C sort; }
diff <(d $M/dim-brand-apps.txt $B/apps)         $M/expected/dim-brand-apps.tsv
diff <(d $M/dim-brand-packages.txt $B/packages) $M/expected/dim-brand-packages.tsv
diff <(d $M/dim-zyg-apps.txt $Z/apps)           $M/expected/dim-zyg-apps.tsv
diff <(d $M/dim-zyg-libs.txt $Z/libs)           $M/expected/dim-zyg-libs.tsv
```

Colour flags against the runs after #123:

```sh
flags() { grep -o '\[token-exists-for-literal\] #[0-9a-f]* at [^ ]*' "$1" | LC_ALL=C sort; }
diff <(flags $M/after-brand-apps.txt)     <(flags $M/dim-brand-apps.txt)
diff <(flags $M/after-brand-packages.txt) <(flags $M/dim-brand-packages.txt)
diff <(flags $M/after-zyg-apps.txt)       <(flags $M/dim-zyg-apps.txt)
diff <(flags $M/after-zyg-libs.txt)       <(flags $M/dim-zyg-libs.txt)
```

Write the note. It has:
- Sources and commits.
- The commands above.
- A per-run table: files, dimension literals, dimension flags, true, false,
  unclear, and colour flags before and after.
- The `dimensions:` line from each run.
- Classes. 90 true, mostly `text-[11px]`, `gap-[4px]` and inline `fontSize: 13`
  in throughline-ds, and rem spacing and radii in zygarden. 3 unclear: the
  Storybook decorator's `padding: 32px` at
  `zygarden-storybook/.storybook/preview.ts:47`,
  `zygarden-storybook/src/storybook-canvas.scss:6`, and a Montserrat
  `font-weight: 800` at `home-page.component.scss:134`. The 12 story-scaffolding
  flags in the `packages` run. The 5 `@font-face` descriptors the prototype
  flagged before that narrowing. The 4 new `rgb()` colour flags.
- What the run doesn't establish: two apps, prototype-read classes, and false
  negatives not counted (Tailwind step classes, `.html` templates, props).

Then close out this spec: add `## What shipped` and `## Where it diverged`, in
that order, between `## Open questions` and `## Plan`, and set `Status: built`.

Verify: every dimension diff is **empty**. The expected totals are brand apps
34, brand packages 12, zygarden apps 33 and zygarden libs 26: 105 lines, and 93
across the three runs the colour measurement used. Of the colour diffs, brand
apps (12), brand packages (0) and zygarden libs (3) are empty. zygarden apps
shows **only these four added lines** (11 → 15):

```
> [token-exists-for-literal] #77ae17 at …/zygarden-brand-guide/src/app/components/cursor/cursor.component.ts:110
> [token-exists-for-literal] #a3e622 at …/zygarden-brand-guide/src/app/services/animations.service.ts:177
> [token-exists-for-literal] #d946ef at …/zygarden-brand-guide/src/styles/_illustration.scss:185
> [token-exists-for-literal] #a3e622 at …/zygarden-brand-guide/src/styles/_nav.scss:167
```

Any other line means the build and the prototype disagree. Find which one is
wrong before recording numbers. A mechanical difference goes in "Where it
diverged". A difference that changes a Decision is an escalation.
