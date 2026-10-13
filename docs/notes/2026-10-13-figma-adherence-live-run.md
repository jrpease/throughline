# The Figma adherence gate, run against live files

Date: 2026-10-13
Spec: `docs/specs/2026-10-13-figma-adherence-gate.md`, Step 6
Files: "Zygarden Design System" (`k5EV3vXCZ7eTKFgqS0TMFv`), "01. Design System" (`bk45RXGcpqiFZgbR5cQiWt`), "Throughline Plugin Test" (`OCiZiGpsJ4ncPD8r205BjC`)

The short version: **the first run produced two kinds of wrong result, and both
were narrowed before anything shipped.** After narrowing, every failure on all
three pages was checked against the census and is right. Everything ran
read-only; nothing in any file changed.

## What was run

- **The screen gate**, read-only, on Zygarden's `Templates` and on 01. Design
  System's `↳ Templates` and `↳ Archtypes`. The first Zygarden run used the
  generated script with comments stripped. Later runs used a trimmed
  transcription of the same reader and checker, carrying each narrowing as it was
  made. The narrowings then went into the source, with tests, and the
  generated file was regenerated.
- **The existing-set checks** (`MODE = 'existing'`) on the sample: the generated
  checks script, with comments and two unused definitions (the text-contrast pair
  table and `missingStates`) left out.

## What was wrong, and the narrowing

1. **Font sizes counted as spacing.** Zygarden leaves every number variable at
   `ALL_SCOPES`, Figma's default. The first run failed a 72 px gap with "bind
   text/7xl", and suggested `radius/4` and `text/base` for 16 px gaps. Scopes
   only separate kinds when a team sets them. **Narrowed:** an explicit scope
   decides; an `ALL_SCOPES` variable counts as spacing only when its name says so
   (and isn't letter-spacing), and as radius only when its name says so
   (`dimensionBuckets` in `figma-adherence.mjs`, tested). After it, the 72 px gap
   is an advisory and every failure names exactly one spacing variable.
2. **One detached frame reported as dozens of failures.** On `↳ Archtypes`, the 8
   detached `hud-*` frames hold raw paints and overridden instances. The first run
   reported 136 raw-colour and 88 raw-dimension failures, about 200 of which sat
   inside the detached frames. Re-instancing fixes all of them at once.
   **Narrowed:** inside a detached frame the raw rules don't run, and the one
   `detached-component` failure is the finding (`underDetached`, tested).
3. **Page names nobody types.** 01. Design System's pages are named
   `"    ↳ Templates"`, with leading spaces. **Fixed:** a page also matches on its
   trimmed name when exactly one page does.

## Numbers, after narrowing

| Page | Screens | Nodes | Read | Failures | Advisories |
|---|---|---|---|---|---|
| Zygarden `Templates` | 6 | — | 53 ms | 7 `raw-dimension` (gaps 16 and 24, each naming one `spacing/space/*`) | 8 raw colour (`#e8e7e7` text, no token), 6 off-scale (gap 72; the `bg` frame's 200 gap and padding) |
| 01. Design System `↳ Templates` | 9 | 123 | 86 ms | 21 `raw-dimension` (gaps 8 and 12, naming `spacing/2`/`spacing/3`) | 0 |
| 01. Design System `↳ Archtypes` | 8 | 200 | 95 ms | 8 `detached-component`, 8 `raw-colour` (each card's white background: bind `color/grey/0`, `surface/greyscale-default`, …), 40 `raw-dimension` (each card's gap 64 and 40 padding) | 0 |

Each matches the census taken before the build: 21 rendering gaps and 8 detached
frames on 01. Design System; on Zygarden, on-scale gaps of 16 and 24, the 72 and
200 off-scale values, and 8 raw text paints at `#e8e7e7`. The `colour-rule-inert`
and `dimension-rule-inert` checks didn't fire on any page: every file has local
variables of both kinds.

## Existing component sets (#170), on the sample

| Set | `surfaces` | Result |
|---|---|---|
| `button` (lowercase, to exercise the fold) | `color/bg/canvas` | pass: states, 18 focus rings, 4 contrast pairs in 2 modes |
| Button | `color/bg/canvas`, `color/bg/muted` | **fail**, the discriminating control: `color/focus/ring on color/bg/muted in Light: 2.99:1, needs 3:1` |
| Checkbox, `controlLayer: 'box'` | `color/bg/canvas` | pass: 3 focus rings, 2 contrast pairs |
| Switch | none | pass; focus contrast skipped, saying no surfaces were named |
| Carousel | — | throws "no component set named "Carousel" in this file" |

All five took 129 ms together.

## What wasn't measured

- **Zygarden's existing sets.** Not re-run. Their focus states are INSIDE strokes
  (measured earlier the same day), so `focus-indicator` fails and contrast skips:
  the #169 gap the spec records.
- **The full generated screen script after narrowing.** The narrowed logic ran
  live as a transcription; the generated file itself is exercised end to end only
  by the Node snippet test against a fake Figma.
- **A file whose variables come from a published library**, and text with mixed
  paints, on a live file. Fixtures only.
- **`/throughline:check-figma` driven end to end by an agent**, including the
  surfaces question. The scripts it calls ran; the command's prose did not.
