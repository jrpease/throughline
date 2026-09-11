# Web output validation — end-to-end run (#37)

Date: 2026-09-11
Subject: `scripts/validate-token-output.mjs` web mode, Step 9 of
`docs/specs/2026-09-11-web-token-output-validation.md`
Built at: `7b31059` on `feat/37-web-output-validation`
**Verdict: PASS.** All sixteen runs came back the way the spec said they would.
The seven clean runs each have a control through the same CLI, in the same
session, and every control failed the way it was supposed to.

## Why this run exists

Unit tests prove the rules against fixtures someone wrote to fit them. They
don't prove the gate reads real CSS, and they can't prove a clean pass means
anything. So this run does two things. It points the gate at three real web
outputs that are correct and expects silence. Then it feeds the same CLI broken
output, some from stock Style Dictionary and some from a one-line edit of the
correct files, and expects each break to be named.

## Sources

| Source | Commit | What's in it |
| --- | --- | --- |
| zygarden-frontend, `libs/shared/util-tokens` | `ca61ca9a6` | 15 DTCG files and the repo's own emitter output, `css/tokens.css`: three blocks, 322 declarations |
| throughline-sample, `packages/tokens` | `01348d1` | `dtcg/primitives.json`, `semantic.light.json`, `semantic.dark.json`, and the shadcn build: `build/css/tokens.css`, plus the `_root.css` and `_light.css` it joins |
| throughline-brand, `packages/tokens` | `2a9d370` | `dtcg/tokens.json` and `shadcn/tokens.css`, whose names don't come from token paths |
| Stock Style Dictionary | 4.4.0 | The copy in throughline-sample's `node_modules`, through the stock `css` transform group, or `name/kebab` alone for the no-shorthand case |

zygarden and throughline-brand were read from clones in the session scratchpad
(`$M`). The stock build reads zygarden from `~/Dev/zygarden-frontend` instead.
That checkout is also at `ca61ca9a6`, and `diff -r` of the two
`src/tokens` directories is empty, so run 11 measures the same source runs 1 to
3 do.

## Commands

The controls were rebuilt first, into `$W/stock/`:

```sh
cd $W && node stock.mjs && node stock2.mjs && node stock3.mjs
# built zyg-root-stock.css
# built zyg-root-stock-console.css
# built unitless-stock.css
```

Then, from the repo root in zsh:

```sh
V='node scripts/validate-token-output.mjs'
Z=$M/zygarden-frontend/libs/shared/util-tokens; T=$Z/src/tokens; O=$Z/css/tokens.css
BASE=(); for f in $T/*.json; do case $f in *.light.json|*.desktop.json) ;; *) BASE+=(--source $f);; esac; done
LIGHT=(--source $T/color-primitives.json --source $T/color-semantic.light.json)
DESK=(--source $T/spacing-primitives.json --source $T/text-primitives.json --source $T/typography-primitives.json --source $T/leading-primitives.json --source $T/spacing-semantic.desktop.json --source $T/typography-semantic.desktop.json)
S=~/Dev/throughline-sample/packages/tokens; SP=(--source $S/dtcg/primitives.json)
sed 's/--color-bg-canvas: var(--color-neutral-0);/--color-bg-canvas: var(--color-neutral-50);/' $O > $W/mut-ref.css
sed 's/^  --color-neutral-0: #ffffff;$/  --color-neutral-zero: #ffffff;/' $O > $W/mut-dangle.css
```

Every run below adds `--min-match 1`, and runs as `$=V <args>`.

## Results

| # | Run | Expected | Came back |
|---|---|---|---|
| 1 | `--platform vanilla-css --output $O --block ':root' $BASE` | exit 0, 214/214, no failures | exit 0, `214/214 declarations in :root`, no failures |
| 2 | `--platform vanilla-css --output $O --block '[data-theme="light"]' $LIGHT` | exit 0, 39/39, no failures | exit 0, `39/39 declarations in [data-theme="light"]`, no failures |
| 3 | `--platform vanilla-css --output $O --block '@media (min-width: 768px) :root' $DESK` | exit 0, 69/69, no failures | exit 0, `69/69 declarations in @media (min-width: 768px) :root`, no failures |
| 4 | `--platform shadcn --output $S/build/css/tokens.css --block ':root' $SP --source $S/dtcg/semantic.dark.json` | exit 0, 147/147, 20 aliases, no failures | exit 0, `147/147`, `20 alias declaration(s)`, no failures |
| 5 | `--platform shadcn --output $S/build/css/tokens.css --block .light $SP --source $S/dtcg/semantic.light.json` | exit 0, 35/35, no failures | exit 0, `35/35 declarations in .light`, no failures |
| 6 | `--platform vanilla-css --output $S/build/css/_root.css --output $S/build/css/_light.css --block .light $SP --source $S/dtcg/semantic.light.json` | exit 0, 35/35, no failures | exit 0, `35/35 declarations in .light`, no failures |
| 7 | `--platform vanilla-css --output $O $BASE` (no `--block`) | exit 2, lists 3 blocks with counts 214, 39, 69 | exit 2, `":root" (214), "[data-theme=\"light\"]" (39), "@media (min-width: 768px) :root" (69)` |
| 8 | Run 6 with only `--output $S/build/css/_light.css` | exit 1, exactly 35 `dangling-reference`, 112 unemitted | exit 1, 35 `dangling-reference` and nothing else, `112 source token(s) are declared nowhere` |
| 9 | Run 2 with `--output $W/mut-ref.css` | exit 1, exactly 1 `reference-fidelity` (`--color-bg-canvas`) | exit 1, one failure: `[reference-fidelity] --color-bg-canvas: source {color.neutral.0} for color.bg.canvas, emitted var(--color-neutral-50)` |
| 10 | Run 2 with `--output $W/mut-dangle.css` | exit 1, exactly 3 `dangling-reference` to `--color-neutral-0` | exit 1, three failures, `--color-bg-canvas`, `--color-bg-surface-2` and `--color-text-onBrand`, each `references --color-neutral-0` |
| 11 | `--platform vanilla-css --output $W/stock/zyg-root-stock.css $BASE` | exit 1, exactly 5 `unit-fidelity` (`--leading-*`) and 13 `no-unresolved-reference`, no `unverifiable-dimension`, 13 unemitted | exit 1, `201/201`, 18 failures: 5 `unit-fidelity` (`--leading-tight` `1.1` → `1.1rem`, `snug`, `normal`, `relaxed`, `loose` `2` → `2rem`) and 13 `no-unresolved-reference`. No `unverifiable-dimension`. 13 unemitted, all `text.*.lineHeight` |
| 12 | `--platform vanilla-css --output $W/stock/unitless-stock.css --source $W/stock/unitless.json` | exit 1, exactly 2 `unit-fidelity` (`--space-4`, `--radius-md`) | exit 1, two failures: `--space-4: source 16 … emitted 16rem`, `--radius-md: source 12 … emitted 12rem` |
| 13 | `--platform vanilla-css --output $W/stock/composite-no-shorthand.css --source $W/stock/unitless.json` | exit 1, exactly 2 `invalid-value` | exit 1, two failures: `--shadow-card: [object Object]`, `--type-body: [object Object]` |
| 14 | `--platform vanilla-css --output $W/stock/composite-refs.css --source $W/stock/composite-refs.json` | exit 0, 6/6, no failures | exit 0, `6/6`, no failures |
| 15 | `--platform shadcn --output $M/throughline-brand/packages/tokens/shadcn/tokens.css --block ':root' --source $M/throughline-brand/packages/tokens/dtcg/tokens.json` | exit 1, 0 matched, the `name/kebab` message | exit 1, `0/83 declarations in :root`, 65 aliases, the `name/kebab` message, 148 unemitted |
| 16 | `--platform mui --output $O --source $T/color-primitives.json` | exit 2, names #127 | exit 2, `--platform mui is not supported: … See #127.` |

`grep -c unverifiable-dimension` is 0 in all sixteen reports.

### Which control covers which clean run

- **Runs 1 to 3** (zygarden's emitter) are covered by 9 and 10, the same file
  with one line changed, and by 11, the same source through stock Style
  Dictionary.
- **Runs 4 to 6** (throughline-sample's shadcn build) are covered by 8, the
  same build with one of its two files left out.
- **Run 14** (composite references in shorthand order) is covered by 13, a
  composite with no shorthand transform, and 12, a unitless source given `rem`.
- **Run 15** is the control for "a match rate of zero never passes". It's also
  the only run where aliases outnumber matches.

## Advisories

Only `dual-node` and `unitless-dimension` ever printed, which is what the spec
expected. No run printed a text-role advisory.

- **Run 1:** five `unitless-dimension`, one per `leading.*` token (source
  `"1.1"`, emitted `1.1`, and so on), and one `dual-node` naming 13 nodes
  (`text.xs`, `text.sm`, `text.base`, `text.lg`, `text.xl`, and 8 more).
- **Run 3:** the same `dual-node` advisory.
- **Run 11:** the same five `unitless-dimension` (emitted `1.1rem` and so on)
  and the same `dual-node`.
- **Runs 12 and 13:** `unitless-dimension` for `--space-4` and `--radius-md`.
- **Runs 2, 4 to 10, 14, 15 and 16:** none.

## Two things worth knowing

**The block listing escapes quotes.** Run 7 prints
`"[data-theme=\"light\"]"`, because keys go through `JSON.stringify`. Copy the
text between the outer quotes and you get the backslashes too, which is a key
no block has. The right thing to type is `--block '[data-theme="light"]'`.
It's in the spec's Open questions.

**The `dual-node` advisory points at failures that aren't there.** On runs 1
and 3 it ends "a no-unresolved-reference or dangling-reference failure above is
that happening", on a report with no failures above. The advisory itself is
right: those 13 nodes are invalid DTCG. It's only the pointer that assumes a
build which didn't reach them, and zygarden's emitter did. The wording is the
spec's, so it's in Open questions too.

## What these runs don't establish

- **Two real emitters and one stock build.** zygarden's hand-written emitter
  and throughline-sample's shadcn build are the only correct web outputs
  measured. Every other adapter shape is inferred from the contract.
- **No Tailwind v4 `@theme` output.** The `tailwind` platform reads the same
  way shadcn does, and the scanner reads `@theme inline` in a unit test, but no
  real Tailwind v4 build was run through it.
- **No MUI, and no Tailwind v3 config.** Run 16 proves `mui` refuses. It
  doesn't prove anything about what checking one would take (#127).
- **Colour values aren't compared.** Run 9 caught a wrong reference, not a
  wrong hex. A flattened `#ffffff` in place of `#fafafa` would pass.
