# Doc card v5 Step 1 — live run

Date: 2026-10-26
Spec: `docs/specs/2026-10-15-doc-card-v5.md` (Plan, Step 1.7)
Files: the sample (`~/Dev/throughline-sample`, Figma "Throughline Plugin Test",
`OCiZiGpsJ4ncPD8r205BjC`); second file "01. Design System"
(`bk45RXGcpqiFZgbR5cQiWt`), after Zygarden was blocked (see the last two sections).

## Result

All 14 sample cards render as v5, and each card's `recordHash` matches the
hash `doc-card-payload.mjs` predicted.

| Card | Node | recordHash (= expected) | render | cardWidth |
|---|---|---|---|---|
| Spinner | 11:321 | 00e1ab36 | 65916735 | 1552 |
| Button | 10:897 | 8c2ad467 | a4f26129 | 2152 |
| Input | 12:467 | 6dc54097 | 5f85e803 | 2170 |
| Textarea | 14:685 | b20b5c24 | 647929c2 | 2290 |
| Select | 14:637 | 8ee7f8ed | e676dd7d | 2170 |
| Select Menu | 24:773 | c256b843 | a556f6f6 | 1552 |
| Select Menu Item | 437:1000 | e38af931 | 5a2cc3f0 | 1552 |
| Checkbox | 12:500 | 225811ad | db26251b | 1552 |
| Radio | 14:660 | 858295a3 | 38d5712c | 1552 |
| Tooltip | 15:703 | c7b57f38 | 51767f41 | 1552 |
| Avatar | 12:382 | a199187c | 583beffe | 1552 |
| Switch | 12:525 | d87cdc6f | 61e77291 | 1552 |
| Card | 12:578 | 500e148a | 76da8392 | 1552 |
| Badge | 12:354 | 42c165c4 | e44bf9e3 | 1552 |

Every card except Spinner returned `tagged: true, migrated: true, kitDrawn: false`.
Spinner's first render drew the kit; that call's summary was lost (see
"The stall"), and the re-render returned `migrated: false`.

## Checks

- **Hash match.** All 14 `recordHash` values equal `expectedRecordHash`.
- **Tag lookup.** Spinner re-rendered with no `--node-id` and found its card by tag.
- **Stable render.** Re-rendering unchanged Spinner returned the same `render`
  (`65916735`) and `migrated: false`.
- **Finalize.** `setDocCardStatus` took Spinner to `beta`, then `stable`; the
  header's `Status` read back as each. `final` throws
  `status "final" is not one of draft / beta / stable / deprecated …`.
- **Kit bindings.** `_Doc/Header` (COMPONENT_SET, 4 variants) and
  `_Doc/Band header`: 28 solid paints, all with `boundVariables.color`; 19
  text layers, all with a text style. Properties are `Title`, `Summary`,
  `Updated`, `Status` and `Title`, `Lede`, `Unreviewed`, as the Plan names them.
- **Instances stay attached.** Instance counts per set on Screens and
  Components were taken before and after. The only change is `_Doc/Header`
  going from 1 to 14 (the new headers); 0 detached. Button's 8 instances, Input's 5,
  Select Menu Item's 12 and the rest are unchanged.
- **Unreviewed chip.** It's on cards whose record blocks are all
  unprotected, and absent on Button and Card, whose `description` is
  `imported+user`. That's the decision 11 rule.
- **docs:check** (the sample's own copy) after stamping: "no drift (28 Figma
  surface(s) unverified)". Both Figma surfaces per component read
  `edit-unverified`, as decision 18 says.
- **Screenshots.** Spinner, Button, Input, Select Menu, Select Menu Item, Card,
  Tooltip, Switch and Badge were checked by eye. Each has the header, then
  Specimen with its lede hidden, then Usage with its blocks in order and the
  two-column Do/Don't with tone rules. The rules look grey in some exports and
  vivid in others; a read-back shows identical bindings and resolved colours, so
  that's 2px down-sampling.

## The stall

The first render (Spinner, kit draw plus migration) timed out at 30 s, and so did
the first re-render. Both stalls were in `loadNodeFonts` right after
`createInstance()`: `loadFontAsync` never resolved, while `setTimeout` still
fired. The same calls in isolation took milliseconds, and 60 sequential
`setTextStyleIdAsync` took 46 ms. So the cause is not the number of awaits.

The abandoned run stayed parked mid-write. It finished on its own later, when a
`figma_take_screenshot` forced a redraw. Its return value was lost.

Once Figma Desktop was brought to the front and kept visible, the same render
took 195 ms, and every card after it 250–550 ms. Figma seems to answer these
async calls only on a redraw, which a hidden window doesn't get.

The renderer is fine as written. The fix is procedural: keep Figma visible
during a write run. After a timeout, read the card's state before retrying,
because the abandoned run may still finish. `doc-card-builder.md` says neither.

## What the plan assumed that wasn't so

- **The split was already done.** `Select Menu Item — Documentation`
  (`437:1000`) already existed with its own set and no `Usage — Select Menu
  Item` band left on the Select Menu card. So decision 23's "13 cards today, 14
  after the split" is 14 today, and Plan step 1.7.4 had nothing to do.
- **Legacy card shapes.** On 13 cards the v4 header is an unnamed `Frame`, not
  `Header`. On both Select Menu cards the set sits inside a `Preview` frame.
  The classifier took the first as the legacy header and the second as the
  specimen holder (it contains the set) without changes.
- **v2 → v4 fields.** The sample manifest was at schema 2. Per the plan, only the
  v4 → v8 fields were added (`audit.docSurface`, `verification`,
  `figma.docCardTextStyles`, `figma.docKit`). The "`docs` retrofit phase" in
  the v4 → v5 note names no field, so nothing was added for it.

## How the run was driven

The first Spinner render pasted the exact `doc-card-payload.mjs` output
(comment lines dropped). To avoid re-pasting 32 KB per card, the remaining
renders installed the same snippet once as
`globalThis.__docCard(RECORD, CANONICAL_FP)` and called it with each card's
`RECORD`, `CANONICAL_FP` and `ARGS` taken from `buildPayload`.

The kit-draw block was left out of that install, because the kit already
existed. The renderer reads `CANONICAL_FP` as a top-level constant, so one
install can't serve many cards as written. That's why the wrapper takes it
as an argument.

## Choices made for the sample

- Roles: `surfaceBand` = `color/bg/subtle`, `surfaceHeader` =
  `color/bg/inverse`, `textOnHeader` = `color/bg/canvas` (the file has no
  inverse text variable; `color/text/onBrand` is #181818 in both modes),
  `radiusBand` = `radius/lg`, `toneCaution` = `color/warning/default`.
- Text styles: `Heading/S` (v4's title was 24px), `Heading/XS`,
  `Body/Default`, `Caption`.

## Open findings

- **Status chip contrast on the inverse header. Resolved 2026-10-27.** Jordan
  pointed out that both headers ignored the brand: black on 01's yellow-and-red
  system, white (Dark mode's "inverse") on the sample's black-and-green one.
  Decision 4's "suggest an inverse surface" rule was the cause. He chose:
  - 01: `surface/brand-primary-default` (yellow) with `text/on-brand-primary`
    (red), about 4.6:1;
  - the sample: `color/bg/canvas` (#181818 in Dark) with `color/brand/primary`
    (green), about 6.8:1;
  - status chips take `textOnHeader`, since tones vanish on a brand header.
  Decisions 4 and 27 are amended in the spec, the renderer and the builder's
  setup prose changed to match, the sample manifest was updated, and both kits
  were restyled in place (4 fills, 16 texts, 4 chip outlines each). Cards
  follow their kit, so none was re-rendered.
- **The sample's black header had no edge.** Its surface was the same
  #181818 as the card behind it, so the header read as green text on the card
  rather than a block. Resolved 2026-10-27: Jordan's own artboards always set
  the header off from the artboard fill (01: `surface/greyscale-elevated` on
  white with a yellow accent; Zygarden: `color/bg/surface/1` on
  `color/bg/canvas`), so decision 4 now requires it and the renderer refuses a
  header whose fill matches the card's. Run against the sample before the
  restyle, the guard threw `the header fill #181818 matches the fill of card
  10:897`. Jordan chose a raised grey, `color/bg/muted` (#353535), with green
  text (about 4.7:1); the kit was restyled in place and all 14 cards read
  #353535 on #181818.
- **The header has square corners** while bands use `radiusBand`. That's as the
  Plan specifies (the header gets no radius), but it reads as unfinished next to
  the rounded bands. Resolved 2026-10-28: a newly drawn kit gives the header
  `radiusBand`. The sample's and 01's kits predate it and stay square until
  rounded by hand.
- **2026-10-28 re-render with the 3:1 warning.** Spinner (`11:321`) re-rendered
  on the branch's renderer: `recordHash` `00e1ab36` and `render` `65916735`,
  both unchanged from the manifest, and `headerContrast` #353535 on #181818 at
  1.45:1, verdict `warn`. The first attempt stalled at 30 s with Figma covered;
  the card read back without its fingerprint, and the parked render finished
  once Figma was side by side with the terminal, as the builder's stall
  procedure says. Both runs used a trimmed copy of the generated snippet; the
  kit-drawing branch did not run, so the new header radius is not yet proven
  live.

## The fresh agent's walk through `/document-component`

A fresh agent with no Figma connection followed `commands/document-component.md`
to refresh Badge's card, up to the first Figma call. Its payload matched
(`ff71370d3e66b48f`, `42c165c4`). What it had to guess, v5-specific first:

- **`--node-id` can't be decided offline.** The command says to pass it "only
  for a card that has never been rendered by v5". The agent used the
  manifest's `renderer: "5"` as the signal, which the command never names.
- **"Verify the returned summary"** isn't defined beyond the `recordHash`
  comparison. Should `tagged`, `migrated` or `cardWidth` be checked?
- **Working directory.** `--manifest` defaults to `./design-system.json`, so the
  payload command only works from the project root, and the command doesn't
  say so. `--out` and the 30 s `timeout` are only in `doc-card-builder.md`.
- **Draft status on a refresh.** component-builder's "first write status
  `draft`" step would demote an existing `stable` component if followed on a
  refresh.
- **Wrong manifest path.** The command writes `meta[name].doc.surfaces`; the real
  path is `components.meta[name].doc.surfaces`.
- **Not v5-specific:**
  - There's no refresh-only path: Step 1 always runs the full authoring
    pipeline and its interview.
  - docs-lint's 12 warnings on Badge would force a rewrite and a new
    `updatedAt`.
  - The `archetype` field is missing from the record.
  - The drift and version check comes after the render, not before it.
  - The bridge-instance preflight isn't named.
  - The command doesn't say whether to take a screenshot.
- **The sample repo's own `scripts/lib/doc-card-plan.mjs` is still v4.** The
  command's version check catches that; docs:check alone doesn't, because the
  manifest now says renderer 5.

## Second file: Zygarden is blocked before any write

Zygarden (`k5EV3vXCZ7eTKFgqS0TMFv`) can't be rendered, because its spacing
variables can't be named uniquely:

- Every name from `spacing/space/0` to `spacing/space/24` exists in both
  `Spacing Primitives` and `Spacing Semantic`.
- `radius/pill` is in both radius collections.
- The only spacing variables with unique names are `spacing/grid/*`.

The payload resolves each role by exact name and requires exactly one match.
Its own resolution code, run in Zygarden with a sensible mapping, throws
`docCardVariables.spacePadding "spacing/space/6" resolves to 2 variables, not
exactly one`. It throws before any write, so nothing in the file changed.

This was already true in v4: `main`'s `doc-card-payload.mjs:56-57` has the
same lookup. So it isn't a v5 regression, but it means the card can't render on
a system that reuses variable names across collections. Recording a role needs
a way to name the collection.

Colour and radius roles resolve fine there: `color/text/*`,
`color/status/*/text`, `color/stroke/default`, `color/bg/surface/*` and
`radius/card` are all unique. Filed as #191.

## Second file: "01. Design System" renders

"01. Design System" (`bk45RXGcpqiFZgbR5cQiWt`) has 216 variables in seven
collections, one mode each (Light, Default). No variable or text-style name
repeats, so the #191 problem doesn't apply. The test was run without a
manifest change in any repo: a scratch manifest and a scratch record for
`badge` lived in the session's scratchpad.

- **Roles:** `text/greyscale-default`, `text/greyscale-secondary`,
  `feedback/{success,error,warning}-default`, `border/greyscale-default`,
  `spacing/6` / `8` / `6` / `2` (24/32/24/8 px, the sample's values),
  `background/greyscale-subtle`, `background/greyscale-inverse` (#000),
  `text/on-dark`, `radius/lg`. The `-default` tones were picked over `-text`
  because they read on the black header; the `-text` ones are dark.
- **Text styles:** `Lato/H4`, `Lato/H5`, `Lato/Body/Regular`,
  `Lato/Caption/Regular`.
- **Card:** a scratch page, "ThroughLine scratch — doc card v5", with a VERTICAL
  frame holding a clone of the `badge` set (4 variants).

Results:

- **Kit draw.** The first render ran with `figma.docKit: null` and
  `--node-id`. It drew `_Doc/Header` and `_Doc/Band header` on a new
  "Documentation Kit" page, tagged the file and the card, then stalled (see
  below) and finished on its own once Figma was visible.
- **Tag lookup and hash.** The re-render, with `figma.docKit` set and no
  `--node-id`, found the card by its tag and returned `recordHash: f59111df`,
  equal to the prediction. It returned `render: bff9b976`, `cardWidth: 1520`,
  `kitDrawn: false`, `migrated: false`, in 186 ms.
- **Bindings.** The kit's 28 solid paints are all bound, and its 19 text layers
  all styled. On the card, the only unbound paints are the scratch frame's own
  fill and the component set's default dashed stroke, neither drawn by the
  renderer.
- **Screenshot.** Black header with a `beta` chip in warning orange; Specimen
  with its lede hidden; Usage with the Unreviewed chip and all six blocks in
  order. Two things to note: Lato's H4 title is smaller than the sample's, and
  the status chip reads fine here because the header is genuinely dark. That
  supports the earlier finding that the contrast problem is the sample's Dark
  mode putting a white surface behind the header, not the chip design itself.

**The stall happened twice more here.** Both times the run parked at
`loadFontAsync` right after an instance edit, and both times Figma was
behind the terminal. The second stall came after Figma had been brought
forward and then covered again so a reply could be typed. With Figma side by
side with the terminal, the parked run finished within seconds and the next
render took 186 ms. So it isn't a quirk of the sample file. Any write run
needs the Figma window on screen for its whole length, not just at the start.

## Later-band issues (Step 1.8)

Filed 2026-10-28, one per later band in decision 2:

- #192 Doc card: live Do/Don't examples
- #193 Doc card: Related band
- #194 Doc card: Content band
- #195 Doc card: Platform differences band
- #196 Doc card: Anatomy band
