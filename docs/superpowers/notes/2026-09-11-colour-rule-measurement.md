# The colour rule against real apps — measurement

**Date:** 2026-09-11
**Gate for:** #39, spec §8 phase 3 ("once colour has run against a real app and
the false-positive rate is known rather than guessed") and §11 ("if phase 2
produces false positives against a real app, narrow the rule").
**Verdict:** the rule is noisy as shipped, and **narrow it before release.**
Most of the noise is two mechanical classes, the rule is right about everything
else, and neither fix costs a true positive.

## Why this run exists

Every earlier run of `token-exists-for-literal` read an app written for the run
(`2026-08-31-adherence-gate-e2e.md`). That proves the extraction works. It says
nothing about how often the rule is wrong about code people wrote for their own
reasons, and that rate decides whether the gate stays switched on.

This run points it at two real apps and reads every finding by hand.

## Sources

| repo | commit | app | tokens |
|---|---|---|---|
| `throughline-ds` (`~/Dev/throughline-brand`) | `2a9d370` | Next.js marketing site, `apps/site` | `packages/tokens/dtcg/tokens.json`, a Figma Console export |
| `zygarden-frontend` | `ca61ca9a6` | Angular/SCSS, Nx: `apps/` and `libs/` | `libs/shared/util-tokens/src/tokens/color-*.json` (3 files) |

Gate at throughline `ec13fe5`. Both repos were read through `git clone --local`
copies in a scratch directory. Neither was modified.

**`docs:digest` was run in both clones first.** `throughline-ds` has no doc
records at all, so its index is empty (`0 component(s)`). That starves the
variant rule, which fails as `variant-rule-inert`, exactly as designed. **It
does not touch the colour rule**, which reads tokens and source, never records.
Thin records are a limit on this run's component findings and none on its colour
findings.

## Numbers

| run | files walked | colour literals | flagged | true | false | unclear |
|---|---|---|---|---|---|---|
| `throughline-ds` `--root apps` | 66 | 65 (in 6 files) | 14 | 9 | 5 | 0 |
| `zygarden` `--root apps` | 69 | 29 (in 7 files) | 11 | 11 | 0 | 0 |
| `zygarden` `--root libs` | 745 | 62 (in 7 files) | 48 | 1 | 46 | 1 |
| **total** | 880 | 156 | **73** | **21** | **51** | **1** |

**70% of what the rule flagged was wrong.** That is the headline, and it is
misleading on its own: 41 of the 51 are one file. Read by class, it is a much
more tractable picture.

Colour tokens the gate could compare: 33 of 56 in `throughline-ds`, 39 of 112 in
`zygarden`. Every flagged literal was a real hex with a real token behind it, so
**none of the 51 is an extraction bug.** They are all the right value in the
wrong place.

**Decision 3 held.** The other 83 literals matched no token (e.g. the site's `#F24E1E` Figma
node, zygarden's `#0f172a` button text) and none was reported.

**Every flag was read, not sampled**, with one exception. The 41 in the token
output were checked mechanically, not one by one: all 41 source lines are
custom-property declarations like `--color-neutral-0: #ffffff;`.

## False positives, by class

| class | flags | where | narrowable? |
|---|---|---|---|
| **The token package's own output** | 41 | `zygarden` `libs/shared/util-tokens/css/tokens.css` | **yes, cleanly** |
| **Hex in a comment** | 2 | `throughline-ds` `app/lab.css:44,48` | **yes, cleanly** |
| **A mask, where colour means nothing** | 4 | `zygarden` `account-settings.component.scss:24-28` | yes, narrowly |
| Hex inside string content | 2 | `throughline-ds` `sections/daily-cycle-state.ts:32,34` | no |
| `#fff` that must not follow a theme | 2 | a Google Slides logo (`node-logos.tsx:111`); a QR code data URI (`qr-code.helper.ts:21`) | no |

**1. The token package's own output.** `--root libs` is the natural root in an Nx
repo (745 files against `apps/`' 69), and the token package lives inside it. The
gate walks `tokens.css`, finds every primitive declared in hex, and fails each
one for duplicating itself. This is not specific to Nx: pointing the site's gate
at `throughline-ds/packages` flags `tokens/shadcn/tokens.css` 34 times, and 0
flags anywhere else in that tree. The walker excludes `dist` and `.next`, and has
no idea which directory is the design system itself.

**2. Hex in a comment.** The worst class, because it fails the code the gate
wants people to write:

```css
--lab-accent-blue:   var(--signal-500); /* #5B7FFF */
```

The token is used. The hex is a note to the next reader. The gate fails it.

**3. A mask.** `mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`
is the standard border-gradient idiom. Only alpha matters in a mask, so the
colour carries no meaning and no token could replace it usefully.

**4. String content.** A marketing section animates a fake token-sync diff,
`'--color-brand-500: #5B7FFF;'`. That is copy, not styling. Regex cannot tell it
from `backgroundColor: '#5B7FFF'`, and neither could a reviewer without reading
the file.

**5. `#fff` that must not follow a theme.** A third-party logo's white, and a QR
code's background inside an SVG data URI (which cannot see the page's CSS
variables anyway). If `color.neutral.0` moved to an off-white, both should stay
put.

## True positives

Twenty-one, and they are the drift the rule was written for.

- **A sibling already uses the token.** zygarden's brand guide:
  `&--do { color: var(--color-green-400) }` then `&--dont { color: #ef4444 }`, and
  `#ef4444` is `color.status.danger.500`. The same `dont` red appears in three
  more files.
- **The author says it is the token.** `node-logos.tsx:65`:
  `// shadcn/ui — … Real brand fill (ink).` then `fill="#1A1A18"`, which is
  `color-primitive.ink`. Same value at `lab.css:26` and `:33`.
- **A hand-maintained mirror.** `lab.css:76` `--substrate-node-solid: #5b7fff`,
  commented "keep in visual sync with the two tokens above", plus its JS
  fallback in `substrate-canvas.tsx:14`. The comment says three.js cannot parse
  `var()`, which is true, but `tokens.css` emits `--signal-500: #5B7FFF` as plain
  hex, so the canvas could read the token directly. The gate is right.
- A brand gradient hardcoded from `color.green.500` and `color.green.300`; `#fff`
  on a live badge, a toast and the scrollbar; a traffic-light green that is
  `color-primitive.success.500` in two files.

**One unclear:** a share-image palette drawn on a `<canvas>`
(`meta-statistics.component.ts:46`) whose `white` equals `color.neutral.0`.
Canvas cannot read `var()`, and the rest of that palette is off-system. Counted
as neither.

**One true positive worth arguing about:** an "Updating, please wait" overlay
built from an inline `cssText` string (`global-error-handler.service.ts:85`).
The page's CSS variables are loaded when it renders, so `var()` would work.
Counted true.

## What narrowing does, measured

A throwaway prototype applied the first two narrowings to the same inputs
through the gate's own `extract` and `buildTokenValues`, and the mask case was
counted from the per-finding reads above.

| | flagged | true | false | unclear | false rate |
|---|---|---|---|---|---|
| as shipped | 73 | 21 | 51 | 1 | 70% |
| skip the token package, blank out comments | 30 | 21 | 8 | 1 | 27% |
| … and skip hex inside `mask` / `-webkit-mask` | 26 | 21 | 4 | 1 | 15% |

**No true positive was lost at any step.** The prototype printed every surviving
flag, and all 21 are there. The counts moved (48 → 7 in `zygarden/libs`, 14 → 12
in the site), so the harness could see a change; this is not an empty result
standing in for a clean one.

What is left after all three is classes 4 and 5: four flags a regex cannot
separate from drift. That is the honest floor for a zero-parser gate.

## Other things this run turned up

- **`unknown-component` failed correct code 20 times out of 20 on the site.**
  `<Icons.Folder>` reads as `<Icons>` (the element pattern stops at the dot), and
  `Icons` is the system's icon namespace, not a component. `<CardTitle>` is part
  of `Card`, and `components.built` lists only `Card`. The rule also fires once
  per attribute rather than once per element, so a three-attribute tag fails three
  times, and a tag with no attributes is never checked at all. Not the colour
  rule; the same §11 applies to it. Filed as #120.
- **The report never says how many token values it skipped.** Spec §6 shows a
  `colour: N token values comparable, M skipped as non-hex` line. It is not
  implemented. Here it would have said 23 of 56 colour tokens skipped for
  `throughline-ds`, where aliases are collection-relative (`{canvas}` for
  `color-primitive.canvas`) and `resolveValue` cannot follow them, and 73 of 112
  for `zygarden`: 51 semantic aliases to primitives in another file, which
  `buildTokenValues` cannot follow because it resolves each file alone, and 22
  `color-mix()` values. The practical cost today is naming: findings cite a
  primitive where a semantic token is the better fix. Nothing was missed, since
  every skipped alias points at a primitive the gate did compare. Filed as #121.
- **Angular templates are never read.** The gate scans no `.html`. zygarden's
  135 templates hold 242 hex literals, **83 of which match a token** (51 in one
  SVG helper). Per spec §4 this is out of scope; it is the largest thing the
  rule cannot see in this repo.
- **Build output outside `dist` and `.next` is walked.** The local working copy
  of `throughline-ds` (read in place, not cloned, since the clone omits ignored
  files) has a gitignored `packages/ui/storybook-static`, where the
  colour rule flags 105 literals in minified Storybook bundles. A fresh clone and
  a CI checkout never see it; a local run from `packages/` would.
- **Two literals on one line print as two identical failures** (`lab.css:26`).
  Harmless, and slightly confusing to read.

## Recommendation

Narrow `token-exists-for-literal` before #39's gate ships. In order of evidence:

1. **Skip files inside the package that owns a `--tokens` file** (the nearest
   `package.json` above it: `packages/tokens` and `libs/shared/util-tokens`
   here). 41 false positives removed, 75 counting the site's `packages/` run, 0
   true positives lost. Say what was skipped in the report, so the exclusion is
   visible.
2. **Blank out comments before extracting hex,** keeping newlines so line
   numbers do not move: `/* */` everywhere, `//` in SCSS and JS/TS (not after a
   `:`, which is a URL). 2 false positives removed, 0 lost, and they are the two
   that punish correct code.
3. **Skip hex inside `mask` / `-webkit-mask` declarations.** 4 removed, 0 lost.
   Narrow and specific. Take it only if it stays small.

Do not narrow by value. Leaving out `#fff` would clear class 5 and also the
toast, the badge and the scrollbar, which are real. Do not downgrade the rule to
an advisory; §11 forbids it, and 21 true positives across two unrelated apps
say it earns its gate.

## What this run does not establish

- **Two apps.** Both are real, neither was written for this run, and they are
  different stacks. It is not a rate for the ecosystem.
- **The component and variant rules were not measured properly.**
  `throughline-ds` has no doc records, and zygarden has no JSX. The
  `unknown-component` result above is real, but it comes from one site.
- **False negatives were counted only where they were cheap to count** (Angular
  templates, skipped token values). No one read the 83 unmatched literals to ask
  whether any should have had a token.
- **The narrowed numbers come from a prototype**, not the change. The build
  that narrows the rule re-runs this measurement against the same commits.

## Reproduce

```sh
git clone --local ~/Dev/throughline-brand   measure/throughline-brand
git clone --local ~/Dev/zygarden-frontend   measure/zygarden-frontend
node scripts/build-docs-digest.mjs --root measure/throughline-brand
node scripts/build-docs-digest.mjs --root measure/zygarden-frontend

B=measure/throughline-brand
node scripts/validate-adherence.mjs --root $B/apps --system $B \
  --package @throughline-ds/ui --tokens $B/packages/tokens/dtcg/tokens.json
# 33 usages, 65 colour literals, 66 files — 14 token-exists-for-literal, exit 1

Z=measure/zygarden-frontend; T=$Z/libs/shared/util-tokens/src/tokens
for R in apps libs; do
  node scripts/validate-adherence.mjs --root $Z/$R --system $Z --package @zygarden/none \
    --tokens $T/color-primitives.json --tokens $T/color-semantic.dark.json \
    --tokens $T/color-semantic.light.json \
    --skip unknown-component --skip unknown-variant-value
done
# apps: 29 colour literals, 69 files — 11 flagged, exit 1
# libs: 62 colour literals, 745 files — 48 flagged, exit 1
```

Per-finding reads used a short script over the gate's own exports: `walk` with
the gate's file filter, then `extract(text)` and `buildTokenValues(files)`,
printing each literal's `file:line`, matched token and source line. Its flagged
counts match the CLI's on all three runs (14, 11, 48), which is the check that
it reads what the gate reads.

## After narrowing (#123)

The same commands, against the same commits (`2a9d370`, `ca61ca9a6`), with the
gate from `fix/123-narrow-colour-rule`. This time it's the change, not the
prototype. Spec: `docs/specs/2026-09-11-narrow-colour-rule.md`.

| run | files | colour literals | flagged | true | false | unclear | false rate |
|---|---|---|---|---|---|---|---|
| `throughline-ds` `--root apps` | 66 → 66 | 65 → 63 | 14 → 12 | 9 → 9 | 5 → 3 | 0 → 0 | 36% → 25% |
| `zygarden` `--root apps` | 69 → 69 | 29 → 29 | 11 → 11 | 11 → 11 | 0 → 0 | 0 → 0 | 0% → 0% |
| `zygarden` `--root libs` | 745 → 742 | 62 → 15 | 48 → 3 | 1 → 1 | 46 → 1 | 1 → 1 | 96% → 33% |
| **total** | 880 → 877 | 156 → 107 | **73 → 26** | **21 → 21** | **51 → 4** | **1 → 1** | **70% → 15%** |
| `throughline-ds` `--root packages` | 33 → 29 | 37 → 0 | 34 → 0 | 0 → 0 | 34 → 0 | 0 → 0 | 100% → none flagged |

`files` is the headline count, which is now files scanned: files walked minus
files excluded. The `packages` run was never part of the 73, so it sits outside
the total, same as above.

**All 21 true positives still fail.** Each run's flag list was diffed against
the as-shipped list, keeping duplicates, and every diff is removals only.
Nothing was added. Every removal is one of the false positives named in
the spec:

- **`throughline-ds` apps:** `lab.css:44` and `lab.css:48`, the two hex values
  in comments.
- **`zygarden` apps:** nothing.
- **`zygarden` libs:** the 41 `libs/shared/util-tokens/css/tokens.css` lines,
  and the mask at `account-settings.component.scss:24`, `:25`, `:27` and `:28`.
  Left: `qr-code.helper.ts:21` (false), `global-error-handler.service.ts:85`
  (true) and `meta-statistics.component.ts:46` (unclear).
- **`throughline-ds` packages:** all 34 `tokens/shadcn/tokens.css` lines.

The exclusion shows up in the report. The two runs whose root holds the token
package print:

```
excluded:     3 file(s) in measure/zygarden-frontend/libs/shared/util-tokens, the package that owns --tokens
excluded:     4 file(s) in measure/throughline-brand/packages/tokens, the package that owns --tokens
```

The `apps` runs print no `excluded:` line, because neither token package sits
beneath `apps/`.

**The `packages` run now fails `nothing-scanned`, and that's right.** With the
token package set aside, its 29 files hold no hex and import nothing from
`@throughline-ds/ui`, so the run verified nothing. It used to fail 34 times for
the wrong reason. Now it fails once for the right one.

The 4 false positives left are classes 4 and 5, the floor this note predicted:
`daily-cycle-state.ts:32` and `:34`, `node-logos.tsx:111`, and
`qr-code.helper.ts:21`.

## `unknown-component` after #120

The same site at the same commit (`2a9d370`), with the gate from
`fix/120-narrow-component-rule` at `15e59c2`. Spec:
`docs/specs/2026-09-11-narrow-component-rule.md`.

| `throughline-ds` `--root apps` | before | after |
|---|---|---|
| headline | 33 usages | 7 component references |
| attributes read (`not read:` denominator) | 33 | 16 |
| `unknown-component` flags | 20, all false | 0 |
| rule failures | 67 | 47 |

The 17 attributes that dropped out sat on `<Icons.Folder>`-style tags, which are
now left alone instead of read as `<Icons>`. `<CardTitle>`'s three still count
toward `not read:`. They just stop failing as a component, three times over. The
report says so:

```
parts:        CardTitle (Card) — not in components.built, read as part of the built component each name starts with
```

**Nothing else moved.** Colour and dimension flags diff empty on all four runs:
the site's `apps` and `packages`, and zygarden's `apps` and `libs`. The other
three reports differ only in the headline's first phrase, `0 usages` →
`0 component references`.

### The probe

Zero failures on correct code could also mean the rule stopped seeing anything.
The probe is the check that it didn't. A scratch copy of `apps/` gets one extra
file with three invented components and one real one:

```tsx
import { Hero, Buttons, CardGrid, Card } from '@throughline-ds/ui';
export const P = () => (
  <Card>
    <Hero />
    <Buttons variant="x" size="y" title="z" />
    <CardGrid />
    {/* <Hero /> */}
  </Card>
);
```

| probe | before | after |
|---|---|---|
| `<Hero />`, line 4, no attributes | missed | fails once |
| `<Buttons variant size title>`, line 5 | fails 3 times | fails once |
| `{/* <Hero /> */}` | not read | not read |
| `<CardGrid />` | missed | accepted as part of `Card` |
| the site's own `<Icons>` and `<CardTitle>` | 17 + 3 | 0 |
| rule failures | 70 | 49 |

After, the report names both parts:
`parts:        CardGrid (Card), CardTitle (Card) — …`.

`<CardGrid />` passing is the line the spec draws, not something the probe
caught by accident. An invented name that starts with a built name and a capital
letter passes, and the `parts:` line is where it shows up.

### What this doesn't establish

- **One JSX app.** zygarden is Angular and runs with the component rules
  skipped, so `unknown-component` has still only been read against one real
  site.
- **No doc records.** The site's docs index is empty, so this run says nothing
  about parts on a documented system. The unit tests pin that a part raises no
  variant failure or advisory.
- **An invented name shaped like a part passes.** `<CardGrid>` proves it. A
  declared-parts field in the manifest would close the gap, and the spec leaves
  that open until a real run shows one slipping through.
