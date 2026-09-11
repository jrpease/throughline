# The dimension rule against real apps — measurement

**Date:** 2026-09-11
**Gate for:** #39 phase 3, spec `docs/specs/2026-09-11-dimension-rules.md`, Step 7.
**Verdict:** the build flags exactly what the prototype flagged. **93 flags
across the three runs the colour measurement used: 90 true, 0 false, 3
unclear.** The `rgb()` change adds 4 colour flags and moves nothing else.

## Why this run exists

The spec's numbers came from a throwaway prototype. A prototype that agrees with
itself proves nothing about the change. This run points the real gate at the
same two apps, at the same commits, and diffs every flag against the
prototype's list, keeping duplicates.

## Sources

| repo | commit | roots | tokens |
|---|---|---|---|
| `throughline-ds` (`~/Dev/throughline-brand`) | `2a9d370` | `apps`, `packages` | `packages/tokens/dtcg/tokens.json`, a Figma Console export |
| `zygarden-frontend` | `ca61ca9a6` | `apps`, `libs` | all 15 files in `libs/shared/util-tokens/src/tokens/` |

Gate at throughline `d19071a`, branch `feat/39-dimension-rules`. Both repos were
read through the same `git clone --local` copies as the colour measurement.
Neither was modified.

The zygarden runs pass every token file, not just the three `color-*.json` files
the colour runs used, because spacing, radius and type live in the other twelve.
The colour diffs below show that changed no colour flag.

## Commands

```sh
M=measure
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

All four exit 1.

Dimension flags against the prototype's, where `norm-dim-report.mjs` turns each
`[token-exists-for-dimension]` line into `<path>:<line>\t<category>\t<value>`:

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

**All four dimension diffs are empty**, against 105 expected lines (34, 12, 33,
26). That isn't an empty harness passing for a clean result: the reports hold
105 dimension failures, and the same `diff` shows four added lines for colour
below.

**Three colour diffs are empty.** zygarden `apps` adds exactly four lines and
removes none:

```
> [token-exists-for-literal] #77ae17 at …/zygarden-brand-guide/src/app/components/cursor/cursor.component.ts:110
> [token-exists-for-literal] #a3e622 at …/zygarden-brand-guide/src/app/services/animations.service.ts:177
> [token-exists-for-literal] #a3e622 at …/zygarden-brand-guide/src/styles/_nav.scss:167
> [token-exists-for-literal] #d946ef at …/zygarden-brand-guide/src/styles/_illustration.scss:185
```

## Numbers

| run | files | dimension literals | dimension flags | true | false | unclear | colour flags |
|---|---|---|---|---|---|---|---|
| `throughline-ds` `--root apps` | 66 | 113 | 34 | 34 | 0 | 0 | 12 → 12 |
| `zygarden` `--root apps` | 69 | 85 | 33 | 31 | 0 | 2 | 11 → 15 |
| `zygarden` `--root libs` | 742 | 2586 | 26 | 25 | 0 | 1 | 3 → 3 |
| **total** | 877 | 2784 | **93** | **90** | **0** | **3** | **26 → 30** |
| `throughline-ds` `--root packages` | 29 | 13 | 12 | story scaffolding, see below | | | 0 → 0 |

`files` is the headline count, files scanned. The `packages` run sits outside
the total, same as in the colour note.

Colour literals moved too: zygarden `apps` 29 → 33 and `libs` 15 → 16. Those are
the five opaque integer `rgb()` values in zygarden. Four match a token and fail.
The fifth, `rgba(48, 48, 52, 1)` at `manage-seeding.component.scss:34`, matches
none and isn't reported. That's Decision 3.

**The `packages` run no longer fails `nothing-scanned`.** After #123 it read
nothing, so it failed once for that. It now reads 13 dimension literals, and
fails 12 times on story layout wrappers instead.

## The `dimensions:` line

```
throughline-ds apps:      dimensions:   35 token values comparable — spacing 10, radius 4, font-size 9, line-height 5, letter-spacing 3, font-weight 4
throughline-ds packages:  dimensions:   35 token values comparable — spacing 10, radius 4, font-size 9, line-height 5, letter-spacing 3, font-weight 4
zygarden apps:            dimensions:   56 token values comparable — spacing 12, radius 5, font-size 13, line-height 18, letter-spacing 3, font-weight 5
zygarden libs:            dimensions:   56 token values comparable — spacing 12, radius 5, font-size 13, line-height 18, letter-spacing 3, font-weight 5
```

No category is zero in either system, so the naming vocabulary reaches every
kind of token both of them hold.

## Classes

The true, false and unclear calls are the prototype's hand reads, carried over
because the flag lists are identical. This run printed every flag's source line
and checked it against the class below.

**90 true.** In `throughline-ds`, mostly Tailwind arbitrary values and inline
styles that sit beside the token utilities they duplicate: `text-[11px]` nine
times against `typography-primitive.size.11`, `gap-[4px]` four times against
`spacing-primitive.space.4`, and `style={{ fontSize: 13 }}` four times against
`typography-primitive.size.13`. `md:py-[6rem]` sits in the same class list as
`py-stack-xl`. In zygarden, rem spacing and radii in SCSS: `padding: 0.5rem 1.25rem`
in five rules in `zygarden-client/src/styles.scss` that already take their
background from a token (`space.2` and `space.5`), and `border-*-radius: 1rem`
on the first and last cells of the leaderboard and standings table rows
(`radius.4`).

**3 unclear.**

- The Storybook decorator's `padding: 32px`, inside an HTML string at
  `zygarden-storybook/.storybook/preview.ts:47`.
- `padding: 1.5rem` at `zygarden-storybook/src/storybook-canvas.scss:6`.
- A Montserrat `font-weight: 800` at `home-page.component.scss:134`. It matches
  `typography.fontWeight.extrabold`, in a `.social-text` rule whose family and
  26px size have no token. Whether one weight token belongs in an otherwise
  off-system text style is a judgement call.

**12 story scaffolding in the `packages` run.** Every one is a layout wrapper
around a demo, like `gap: '0.75rem'` between buttons in `button.stories.tsx`,
plus `padding: '2rem'` in `.storybook/preview.tsx`. They're the same kind as the
first two unclear flags above. The spec leaves this as an open question: the
documented install scans `apps/`, and skipping stories means changing the shared
walker (#124).

**5 `@font-face` descriptors the prototype flagged before that narrowing.**
`font-weight` 400, 400, 600, 700 and 800 at `zygarden-client/src/styles.scss:205`,
`:213`, `:221`, `:229` and `:237`. The build doesn't flag them, and the empty
diff shows it lost nothing else by skipping them.

**4 new `rgb()` colour flags**, all in zygarden's brand guide and all written as
`rgba(…, 1)`. Read from source in this run, 2 true and 2 unclear:

- `_nav.scss:167`, the peak of a glow keyframe (`color.green.300`). True. A
  stylesheet can read `var()`, same as the brand gradient the colour note
  counted true.
- `animations.service.ts:177`, `hex.style.stroke = 'rgba(163, 230, 34, 1)'`
  (`color.green.300`). True. An inline style can read `var()`.
- `_illustration.scss:185`, a radial gradient stop on a magenta accent dot. It
  matches `color.shadow.400`. Unclear. The value is on the system, but a token
  named `shadow` doesn't read as the fix for an accent colour.
- `cursor.component.ts:110`, a GSAP tween's `borderColor` end value
  (`color.green.500`). Unclear. Whether GSAP tweens to a `var()` end value
  wasn't checked.

## What this run doesn't establish

- **Two apps.** Both are real and neither was written for this run. It isn't a
  rate for the ecosystem.
- **The true, false and unclear calls are the prototype's.** This run proves the
  build and the prototype flag the same lines. It didn't re-read all 105 by
  hand, apart from checking each source line against its class.
- **False negatives weren't counted.** Tailwind step classes like `p-4`, `.html`
  templates and component props are all out of scope, and no one counted what
  they hide. zygarden's arbitrary values mostly live in `.html` templates.
- **2691 dimension literals in the three runs matched no token and weren't
  read.** Decision 3 says
  they shouldn't be reported. Nobody asked whether any of them should have had a
  token.
