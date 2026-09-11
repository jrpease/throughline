# Web output for tokens:validate-output

Status: built
Reviewed: 2026-09-11 — ready to build
Date: 2026-09-11
Issue: #37
Parent design: `docs/superpowers/specs/2026-08-21-token-output-validation-design.md`
(its scope limit "Native source files only in v1")
Evidence: a prototype of these rules, run against three real web outputs and
four Style Dictionary failures made on purpose. Files and commands are in the
Plan's Step 9.

## Goal

`tokens:validate-output` checks Swift and Kotlin against their DTCG source. Web
output gets nothing: `token-sync-layer` verifies a web adapter by checking that
"the config builds, the expected files appear, references resolve", and those
pass on broken CSS. Measured on zygarden's real source through stock Style
Dictionary 4.4.0's `css` group, the build exits 0 and ships:

- five `leading` ratios as `rem` (`1.1` → `1.1rem`, a 17.6px line height)
- thirteen dual-node references left raw in the CSS (`{text.5xl.lineHeight}`),
  even with `brokenReferences: 'throw'`
- and on a Figma-shaped source, `16` → `16rem` and `[object Object]` for any
  composite with no shorthand transform.

After this ships:

1. **`--platform shadcn`, `tailwind` and `vanilla-css` read CSS custom
   properties** and fail on all four of those, plus a `var()` that names the
   wrong token and a `var()` to a variable nothing declares.
2. **Correct output passes.** Zygarden's own emitter (3 blocks, 322
   declarations) and throughline-sample's shadcn build (2 blocks, 202
   declarations) both come back clean with `--min-match 1`. `var()`, `calc()`,
   `color-mix()` and units are never flagged for being CSS.
3. **`token-sync-layer` runs the gate on web output too**, so web adapters stop
   being verified by "it built".
4. **MUI is named as not checked yet**, in a follow-up issue, not guessed at.

## Non-goals

- **MUI theme objects and Tailwind v3 JavaScript configs.** A JavaScript theme
  has no CSS custom properties, and nothing in this repo or its samples shows
  what a generated one looks like. Deferred to a follow-up issue (Decisions).
- **Comparing colour values.** A flattened `#ffffff` against its source isn't
  checked, the same as native today.
- **Checking the text around a reference.** In
  `color-mix(in srgb, var(--a) 12%, transparent)` the `var()` is checked. The
  `12%` isn't.
- **Selector conventions.** Whether dark mode is `.dark` or `[data-theme]` is
  the adapter's business. The gate checks whichever block it's pointed at.
- **Variable names that don't come from the token path.** throughline-brand's
  build writes `--canvas` for `color-primitive.canvas`. No declaration matches,
  and the run fails as "nothing was verified", the same as a native build with
  the wrong naming.
- **Any change to what native platforms check or print.**
- **README.md's roadmap bullet**, `references/native-adapter-config.md` (it's
  generated from `lib/sd-native.mjs`), and the install set. No new file gets
  copied.
- **A release.**

## Decisions

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| Which `--platform` values read web output | `shadcn`, `tailwind` and `vanilla-css`, all read as CSS custom properties. `mui` exits 2 with a message naming the follow-up issue. | Recommended; accepted under Jordan's standing instruction (2026-09-11). shadcn and vanilla-css output is a CSS file by contract (`references/sync-adapters.md:34,37`). The monorepo this plugin scaffolds is Tailwind v4 (`CHANGELOG.md:899`), where the theme lives in CSS `@theme` blocks, so `tailwind` reads the same way. A MUI theme is a JavaScript object, and there's no example of a generated one anywhere to model an extractor on. #37 itself says deferring beats guessing, because a validator that rejects correct output is worse than none. | Parsing or executing JavaScript theme files. A Tailwind v3 `tailwind.config.js` passed as `--output` has no declarations and fails as "nothing was verified", never passes. |
| Per-platform rule sets | Native platforms keep today's path unchanged. Web platforms run a separate `validateWeb`, with its own rule list. Within web, one difference: shadcn and tailwind have an alias layer (next row). vanilla-css doesn't. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #37 asks for per-platform sets over one shared list. Two native rules invert on web, and `invalid-literal`'s Swift/Kotlin grammar means nothing there. Toggling rules off in one loop is the shape #37 rules out. | One shared rule loop with platform switches inside it. |
| Rules on web | **Failures:** `unit-fidelity` (web units, below), `unverifiable-dimension`, `reference-fidelity`, `dangling-reference`, `no-unresolved-reference`, `invalid-value`, plus the unchanged source-level `no-mode-collision` and name collisions. **Advisories:** `dual-node` and `unitless-dimension`, with web wording. **Not run:** `no-foreign-syntax`, `no-bare-units`, `invalid-literal`, `unreferenced-text-sibling`, `ambiguous-text-role`. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Each new failure rule was hit by a real stock Style Dictionary build or by a one-line edit of real correct output, and none fires on the two correct outputs. `unverifiable-dimension` carries over from native unchanged. The text-role advisories are about Compose `sp` and em letter spacing dropped from native output. Web emits em fine. | Flagging `var()`, `calc()`, `color-mix()` or units on web. |
| `unit-fidelity` on web | Read both sides as a number plus `px`, `rem`, `em`, `%` or no unit. Anything else is skipped. `rem` is 16px. Tolerance 0.001. Source `$type` `number` or `fontWeight`: the output must be unitless and equal. Source in `em` or `%`: same unit, equal number. Source in `px` or `rem`: output in `px` or `rem` with equal px, or a unitless `0`. Unitless source: output unitless, `px` or `rem`, equal as px. `$type` comes from `flattenDtcgTypes`, not `flattenPipelineTypes`. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Web values can legitimately change unit: throughline-brand writes source `16` as `1rem`, and both are right. What's wrong is a changed magnitude (`16` → `16rem`), a ratio given a unit (`1.1` → `1.1rem`), or a length losing its unit (`16px` → `16`, which CSS won't accept as a length). A unitless *dimension* that emits unitless passes, because zygarden's `leading.tight: "1.1"` is typed `dimension` and `1.1` is the right CSS. The `unitless-dimension` advisory already tells that author to fix the `$type`. Web builds don't run the dual-node hoist, so the spec's own types are what the build saw. | Native's px-only magnitude read. Failing a unitless dimension that emits unitless. |
| `reference-fidelity` | When a declaration holds a `var()`, collect the `{path}` references and literal `var(--x)` text from every string in its source `$value`, including inside an object. Sort both lists, fold them with `normalizeKey`, and compare. They must be equal. A declaration with a `var()` skips the magnitude check, since its referent is checked on its own line. A declaration without one is compared by value, even if its source was a reference. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Web adapters keep references, so the check that matters is that each `var()` names the token the source names. Sorting is needed because a composite puts its references in shorthand order: Style Dictionary emits `var(--font-weight-regular) var(--font-size-md)/1.5 var(--font-family-body)` from an object keyed `fontFamily, fontSize, fontWeight`. The prototype, comparing in order, failed that correct output. Flattened references stay legal because Style Dictionary's `outputReferencesFilter` flattens them on purpose. | Requiring references to be preserved. Catching two references swapped inside one value. |
| `dangling-reference` | A `var(--x)` in a checked declaration fails when no `--output` declares `--x` in any block, unless the source `$value` for that declaration contains `var(--x)` itself. Each missing name reported once per declaration. | Recommended; accepted under Jordan's standing instruction (2026-09-11). A `var()` to an undeclared variable is invalid when the page computes it, and nothing reports it. It's how a dropped dual-node child shows up once references are kept. A variable the author wrote into the source (`var(--font-inter)` from `next/font`) is theirs to define. | Checking that the variable is declared in the same mode block. |
| Several `--output` files | Web accepts `--output` more than once. The files are read in order and joined with a newline, and everything in them counts as declared. Native still takes exactly one, and a second exits 2. | Recommended; accepted under Jordan's standing instruction (2026-09-11). throughline-sample's build writes `_root.css` and `_light.css` before joining them. Checked alone, `_light.css` has 35 `var()`s to variables that live in `_root.css`: correct output, 35 false failures. Checked with both, it's clean. | A separate flag for "files that only declare". |
| `no-unresolved-reference` | Fails when the value, outside quoted strings, contains `{…}` with no braces inside. When it fires, `unverifiable-dimension` is left out for that declaration. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Stock Style Dictionary left thirteen `{text.X.lineHeight}` references in zygarden's CSS and exited 0. Leaving out the second rule is #57's rule: the specific rule names the cause, and "never compared" next to it points at a symptom. | Reporting both rules on one declaration. |
| `invalid-value` | Fails when the value, outside quoted strings, contains `[object Object]` or the word `NaN` or `undefined`. When it fires, `unverifiable-dimension` is left out for that declaration. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Style Dictionary 4.4.0 writes `--shadow-card: [object Object];` for a composite with no shorthand transform, and exits 0. `NaN` and `undefined` are the same JavaScript leak from a hand-written value transform. An empty value is left alone, because `--x: ;` is valid CSS and could be a real empty string. | A general CSS value grammar. Unbalanced-bracket checks. |
| Modes | `--block <key>` picks one block. A block's key is its enclosing at-rules and its selector, joined by single spaces, with whitespace collapsed and `, ` between list items: `:root`, `[data-theme="light"]`, `@media (min-width: 768px) :root`, `@layer base :root, .light`, `@theme inline`. Blocks with the same key are merged, and a later declaration of a name replaces an earlier one. With no `--block`, one key is used automatically. More than one exits 2 and lists each key with its declaration count. An unknown `--block` exits 2 with the same list. `--block` on a native platform exits 2. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Web puts every mode in one file. Native builds one file per mode, and the gate runs once per file with that build's sources (parent spec, Decision 3). One run per block with that block's sources is the same contract. Checking every block against one source list would fail correct dark values against light sources. Later-wins is what the cascade does. The listing is how someone finds the exact key to type. | Guessing a mode from selector names. One run across all blocks. |
| Which block counts as "emitted" | A source token counts as emitted when any `--output` declares it, in any block. | Recommended; accepted under Jordan's standing instruction (2026-09-11). A `.light` block holds only overrides, so every primitive would otherwise be "unemitted" on every run. Measured: 112 false lines for throughline-sample's `.light`. | Unemitted-per-block. |
| The alias layer (shadcn, tailwind) | On shadcn and tailwind, a declaration that matches no source token, whose whole value is one `var(--x)`, and whose `--x` is declared, is an alias. Aliases are counted, reported on their own line, and left out of the match rate's denominator. On vanilla-css they count like any unmatched declaration. | Recommended; accepted under Jordan's standing instruction (2026-09-11). shadcn's contract adds names with no token (`--background: var(--color-bg-canvas)`, `references/sync-adapters.md:34,93`). Tailwind v4 adds the same kind of layer in `@theme inline`. The installed script passes `--min-match 1` (`skills/token-sync-layer/SKILL.md:222`), so 20 shadcn aliases would fail throughline-sample's correct `:root` at 147/167. `dangling-reference` still checks every alias. vanilla-css has no layer by contract, so an unmatched name there is a naming problem. | Lowering `--min-match` for web. Exempting aliases on vanilla-css. |
| How CSS is read | A small scanner, not a line regex. It skips `/* */` comments, copies quoted strings whole, opens a block at `{`, closes one at `}`, and ends a declaration at `;` or `}`. A `{` inside a custom property's value is part of the value. Declarations outside every block are ignored. A declaration inside a block that isn't a custom property adds one to `unparsedLines`. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Modes are nesting, which a line regex can't see (`@media … { :root { … } }`). The `{` rule is what keeps `--lh: {text.xs.lineHeight};` readable, and CSS allows braces in custom property values anyway. Parentheses get no special handling. No output measured has a `;` inside unquoted parentheses, and matching them would let one stray `(` swallow the rest of the file. | SCSS or Less. Minified CSS with `;` inside `url(...)` without quotes. |
| Where the code lives | All in `scripts/validate-token-output.mjs`. Two pieces native already has move into helpers both paths call: the source index (mode collisions, merged flat map, name collisions, `byKey`) and the `unitless-dimension` advisory. Native's behaviour doesn't change, and the existing tests don't change. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The validator already installs with `lib/dtcg.mjs` and `lib/native-literal.mjs`, so no copy list changes (`ci/validate-install-sets.mjs`). One copy of each rule is #57's lesson: two copies drifted until a rule couldn't be reached. | A new `lib/` module. A second copy of the collision or advisory logic. |
| Wiring into `token-sync-layer` | Step 3's per-adapter verification runs `tokens:validate-output` for web and native alike, dropping "the config builds, the expected files appear, references resolve" for web. Step 4 says the same four files install for every target, and gives the web call once: once per mode block, with `--block` and that block's sources. The contract is stated once, in `scripts/README.md`, and linked from the skill and `references/sync-adapters.md`. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #37's point is that web output goes unchecked. A mode nothing calls leaves it unchecked. The parent spec replaced the same weak wording for native for the same reason. Stating it once and linking is how #86 was resolved: link, don't restate. | Leaving the skill's web check as it is. Restating flag semantics in the skill. |
| MUI follow-up | File one issue for JavaScript theme output: MUI theme objects and Tailwind v3 configs and presets, including checking a preset's `var()`s against the CSS it points at. The `mui` error message and the docs cite its number. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The standing instruction covers filing concrete deferred work, and #37 closes only when what it listed is either built or tracked. | Closing #37 with MUI silently dropped. |
| CHANGELOG | A new bullet under `[Unreleased]` → Added. | Recommended; accepted under Jordan's standing instruction (2026-09-11). It's a new user-facing capability of a shipped gate, not part of the unreleased adherence gate entry. | Folding it into another entry. |
| Evidence | A new e2e note, written by the build from the real change, plus `## What shipped` here. Every run whose pass condition is "no failures" is paired with a control through the same CLI in the same session, and each control must fail the way this spec expects. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #77's rule, now in `ci/README.md:80-99`, requires a control for any run that passes by showing nothing. Five clean runs prove nothing alone. | Recording prototype numbers as shipped. |

## Open questions

- **A variable declared only in another mode's block.** `:root` pointing at
  a `--x` that only `.dark` declares passes `dangling-reference`, but it's
  undefined in light mode. **I'd recommend waiting** until a real output shows
  it. Unresolved.
- **Two references swapped inside one value.** Sorted comparison can't see
  `0px var(--b) 2px var(--a)` against a source that names them the other way
  round. **I'd recommend waiting.** Composite shorthand order is what forced
  sorting, and a swap needs a hand-written format to make it. Unresolved.
- **Flattened colour values.** A web build with references off emits
  `#ffffff` for `{color.neutral.0}`, and nobody checks the hex. **I'd
  recommend doing it for native and web together**, if either needs it.
  Unresolved.
- **README.md's roadmap bullet** (`README.md:208`) still says only native
  targets are validated per build. **I'd recommend updating it with the
  release notes**, not in this change. Unresolved.
- **The block listing escapes quotes.** Keys go through `JSON.stringify`, so
  the exit-2 listing prints `"[data-theme=\"light\"]"`. Copying the text
  between the outer quotes carries the backslashes into `--block`, and no block
  has that key. **I'd recommend printing each key shell-quoted**
  (`'[data-theme="light"]'`), so the listing is paste-ready, the way the
  Modes decision intends. Surfaced by the build (run 7). Unresolved.
- **The `dual-node` advisory on a clean report.** Its last clause points at
  "a no-unresolved-reference or dangling-reference failure above", and on
  zygarden's correct `:root` there isn't one. **I'd recommend adding "if" to
  the clause** ("if there is a … failure above, that is this happening"). The
  advisory is right either way. Surfaced by the build (runs 1 and 3).
  Unresolved.
- **The `scripts/README.md` table row lists native-only rules.** Step 7 kept
  "no leaked CSS syntax, no bare unit literals" in the row it widened to cover
  web, and neither rule runs on web. The paragraph under `## Usage` says what
  web checks, so nothing is wrong, only ambiguous at a glance. **I'd recommend
  scoping those two clauses to Swift and Kotlin** in the same pass as the
  README roadmap bullet. Surfaced by the finish review. Unresolved.

## What shipped

`tokens:validate-output` reads web output. `--platform shadcn`, `tailwind` and
`vanilla-css` extract CSS custom properties with a scanner that follows
nesting, pick one mode block with `--block`, and accept `--output` more than
once. Six rules fail a web run: `unit-fidelity` with web units,
`reference-fidelity`, `dangling-reference`, `no-unresolved-reference`,
`invalid-value` and `unverifiable-dimension`. shadcn and tailwind leave alias
declarations out of the match rate. `--platform mui` exits 2 and points at
#127. Native platforms run exactly the path they ran before: the source index
and the `unitless-dimension` advisory moved into shared helpers, and no line of
the existing test file changed.

`token-sync-layer` now runs the gate for web adapters as well as native, and
`scripts/README.md` holds the web contract, linked from the skill and from
`references/sync-adapters.md`. CHANGELOG has the entry under `[Unreleased]`.

Evidence: `docs/superpowers/notes/2026-09-11-web-output-validation-e2e.md`.
All sixteen Step 9 runs matched their Expect column: zygarden's three blocks
(214, 39 and 69 declarations) and throughline-sample's shadcn build (147 with
20 aliases, and 35) came back clean, and every control failed the way this
spec said it would. `node --test` ran 622 tests with none failing, and the
other six CI steps exited 0.

## Where it diverged

- **Step 7, `SKILL.md`.** Rewrapping the execution-model paragraph also rewrapped
  the sentence after it ("Choose each subagent's model …") and the Step 4
  install heading, which the new text pushed past the paragraph's width. No
  wording outside the three specified edits changed.
- **Step 7, `references/sync-adapters.md`.** The sentence links the contract
  and says nothing about blocks, so no rule is restated there.
- **Step 9, harness.** `$W/stock.mjs` reads zygarden from
  `~/Dev/zygarden-frontend`, not the `$M` clone the Plan pins. Both are at
  `ca61ca9a6` and `diff -r` of their `src/tokens` is empty, so run 11 measures
  the same source. Recorded in the note.
- Nothing else diverged. Steps 1 to 6 recorded no divergence, and their
  commits left the Plan unamended.
- **Routing.** Steps 2, 4, 5 and 6 went to `implementer`. Steps 1, 3, 7, 8 and
  9 ran inline. The build recorded no step coming back `BLOCKED`, and none was
  re-dispatched.

## Plan

Everything runs from the repo root on branch `feat/37-web-output-validation`.

**Scratch material.** The prototype, Style Dictionary scripts and control
fixtures live in this session's scratchpad:

```sh
W=/private/tmp/claude-501/-Users-jordanpease-Dev-throughline/34e9781c-566c-40de-b615-11bc1fb97988/scratchpad/web37
M=/private/tmp/claude-501/-Users-jordanpease-Dev-throughline/34e9781c-566c-40de-b615-11bc1fb97988/scratchpad/measure
```

- `$W/proto.mjs` is a throwaway prototype of Steps 2 to 4. It's a reference
  only, and the briefs below are complete without it.
- `$W/stock.mjs`, `$W/stock2.mjs` and `$W/stock3.mjs` build the Style
  Dictionary controls into `$W/stock/`, using the Style Dictionary 4.4.0 in
  `~/Dev/throughline-sample/packages/tokens/node_modules`. Run them with
  `cd $W && node stock.mjs && node stock2.mjs && node stock3.mjs`.
- `$M/zygarden-frontend` is at `ca61ca9a6`, `$M/throughline-brand` at `2a9d370`,
  and `~/Dev/throughline-sample` at `01348d1`.

All code changes go in `scripts/validate-token-output.mjs`. Every new test goes
in `scripts/validate-token-output.test.mjs`, in its existing style: `node:test`,
`assert/strict`, inline fixtures, and `mkdtempSync` temp dirs with the existing
`runCli` helper for CLI tests. **No existing test may be edited.** If one fails,
the native path changed, and that's a bug in the step.

### Step 1 — File the follow-up issue for JavaScript theme output

Files: none (GitHub)

Change: inline, not `implementer`. Write the body with the `write-like-jordan`
skill and file it with `gh issue create --label enhancement`. Title:
`validate-token-output: JavaScript theme output (MUI, Tailwind v3)`. The body
says that #37 added web mode for CSS custom properties, and that a MUI theme
object and a Tailwind v3 config or preset are JavaScript, so neither is read.
It says nothing in the repo or its samples shows what a generated one looks
like, so an extractor would be a guess. It names the one concrete check a
preset needs: that every `var()` in it is declared by the CSS it ships with
(throughline-sample's `build/tailwind/preset.cjs` is the example). It links
this spec. Record the number as `N` for Steps 4 and 7. Filed as #127, so `N` is 127 below.

Verify: `gh issue view N --json state,title` → `OPEN` with that title.

### Step 2 — Read CSS custom properties

Files: `scripts/validate-token-output.mjs`, `scripts/validate-token-output.test.mjs`

Change:
- Export `normalizeBlock(s)`, returning
  `String(s).replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim()`.
- Export `extractCustomProperties(text)`, returning
  `{ declarations: [{ block, name, value }], unparsed }`. Walk the text one
  character at a time, keeping `stack` (an array of block keys), `seg` (the
  current segment) and `unparsed = 0`:
  - `/*`: jump past the next `*/`, or to the end if there isn't one, and add a
    single space to `seg`.
  - `"` or `'`: copy to `seg` through the matching closing quote. A backslash
    copies the next character too. Stop after a newline or at the end if the
    quote never closes.
  - `{`: if `seg` matches `/^\s*--[A-Za-z0-9_-]+\s*:/`, copy from this `{`
    through its matching `}` into `seg`, counting nested braces (to the end if
    none matches). Otherwise push `normalizeBlock(seg)` onto `stack` and clear
    `seg`.
  - `}`: flush, then `stack.pop()`.
  - `;`: flush.
  - Anything else: add it to `seg`.
  - At the end of the text, flush once more.
  - Flush: `s = seg.trim()`, then clear `seg`. Do nothing if `s` is empty or
    `stack` is empty. If `s` matches `/^(--[A-Za-z0-9_-]+)\s*:([\s\S]*)$/`, push
    `{ block: stack.join(' '), name: m[1], value: m[2].trim() }`. Otherwise add
    one to `unparsed`.
- Put a comment above the function naming this spec. It should say why it's a
  scanner (modes are nesting) and why a `{` inside a custom property's value
  stays in the value (unresolved references must stay readable).

Tests, each asserting `declarations` deep-equal (and `unparsed` where given):
- `'/**\n * Do not edit directly.\n */\n\n:root {\n  --a: 1px;\n  --b: var(--a); /* note */\n}\n'` →
  `[{ block: ':root', name: '--a', value: '1px' }, { block: ':root', name: '--b', value: 'var(--a)' }]`,
  `unparsed` 0.
- `':root {\n  --a: 1px;\n}\n[data-theme="light"] {\n  --a: 2px;\n}\n@media (min-width: 768px) {\n  :root {\n    --a: 3px;\n  }\n}\n'` →
  blocks, in order, `':root'`, `'[data-theme="light"]'`,
  `'@media (min-width: 768px) :root'`.
- `'@layer base {\n  :root,\n  .light {\n    --x: 2px;\n  }\n}\n'` → one
  declaration, block `'@layer base :root, .light'`.
- `'@theme inline {\n  --color-bg: var(--background);\n}\n'` → block `'@theme inline'`.
- `':root {\n  --lh: {text.xs.lineHeight};\n  --c: red;\n}\n'` → values
  `'{text.xs.lineHeight}'` and `'red'`.
- `':root { --f: "a;b}"; --g: 1px; }'` → values `'"a;b}"'` and `'1px'`.
- `':root { color: red; --a: 1px; }'` → one declaration, `unparsed` 1.
- `'--a: 1px;\n'` → `[]`, `unparsed` 0.
- `normalizeBlock('  :root ,\n .dark ')` → `':root, .dark'`.

Verify: `node --test scripts/validate-token-output.test.mjs` → all pass.

### Step 3 — Share the source index and the unitless-dimension advisory

Files: `scripts/validate-token-output.mjs`

Change: a refactor that doesn't change behaviour.
- Add `function indexSources(sources)`. It returns
  `{ collisions, flat, normalizationCollisions, byKey }`, computed exactly as
  `validate` computes them today: `findModeCollisions(sources)`, the merged
  `flattenDtcg` map, `findNormalizationCollisions(Object.keys(flat))`, and
  `byKey` without the collided keys. Move the comments that explain collided
  keys with the code.
- Add `function unitlessDimensionAdvisory({ path, flat, types, symbol, source, emitted })`.
  It returns the `{ rule: 'unitless-dimension', symbol, token, source, emitted }`
  object `validate` pushes today, or `null`, using the same `aliased` /
  `referentOf` / `UNITLESS` / `DIMENSIONAL` test. Move its comment with it.
- In `validate`, call both in place of the inline code. `types` still comes from
  `flattenPipelineTypes`.

Verify: `node --test scripts/validate-token-output.test.mjs` → all pass. This
step makes no change to the test file, so passing means native behaviour held.

### Step 4 — The web rules

Files: `scripts/validate-token-output.mjs`, `scripts/validate-token-output.test.mjs`

Change:
- Export
  `WEB_PLATFORMS = { shadcn: { aliasLayer: true }, tailwind: { aliasLayer: true }, 'vanilla-css': { aliasLayer: false } }`.
- Import `flattenDtcgTypes` from `./lib/dtcg.mjs`.
- Export `cssMagnitude(value)`: a `number` gives `{ n: value, unit: '' }`. A
  string, trimmed, matching `/^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em|%)?$/`
  gives `{ n: Number(m[1]), unit: m[2] ?? '' }`. Anything else gives `null`.
- Export `webUnitFidelity(source, emitted, type)`, taking two non-null
  `cssMagnitude` results. `px(x)` is `x.unit === 'rem' ? x.n * 16 : x.n`, and
  `close(a, b)` is `Math.abs(a - b) <= 0.001`. Return:
  - `type` is `'number'` or `'fontWeight'`: `emitted.unit === '' && close(emitted.n, px(source))`.
  - `source.unit` is `em` or `%`: `emitted.unit === source.unit && close(emitted.n, source.n)`.
  - `source.unit` is `px` or `rem`: `(emitted.unit === 'px' || emitted.unit === 'rem' || (emitted.unit === '' && emitted.n === 0)) && close(px(emitted), px(source))`.
  - otherwise (unitless source): `['', 'px', 'rem'].includes(emitted.unit) && close(px(emitted), source.n)`.
- Add `function validateWeb({ sources, output, platform, minMatch, block })`:
  1. `{ declarations, unparsed } = extractCustomProperties(output)`. Build
     `counts`, a `Map` from block key to declaration count, in first-seen
     order. `list` is
     `[...counts].map(([k, c]) => `${JSON.stringify(k)} (${c})`).join(', ')`.
  2. Resolve the block. If `block === undefined`: with one key, use it. With
     more than one, throw
     `new Error(`the output declares custom properties in ${counts.size} blocks — pass --block with one of: ${list}`)`.
     With none, leave it `undefined`. If `block` is given: `key = normalizeBlock(block)`.
     If `counts.size > 0` and `!counts.has(key)`, throw
     `new Error(`no block ${JSON.stringify(key)} in the output — its blocks are: ${list}`)`.
  3. `declared = new Set(declarations.map((d) => d.name))`. `selected` is a
     `Map` from name to value, filled in order from declarations whose `block`
     equals the resolved key, so a later one replaces an earlier one.
  4. `{ collisions, flat, normalizationCollisions, byKey } = indexSources(sources)`.
     `types` merges `flattenDtcgTypes(dtcg)` across sources.
  5. For each `[name, value]` of `selected`:
     - `unquoted = value.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')`.
     - `emittedVars = [...unquoted.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)].map((m) => m[1])`.
     - `path = byKey.get(normalizeKey(name))`. `strings(v)` returns `[v]` for a
       string, the flattened `strings` of `Object.values(v)` for an object, and
       `[]` otherwise. `raw = path === undefined ? '' : strings(flat[path]).join(' ')`.
       `authored` is the set of `var(--x)` names in `raw`.
     - For each name `v` in `new Set(emittedVars)` where `!declared.has(v) && !authored.has(v)`:
       push `{ rule: 'dangling-reference', symbol: name, reference: v }`.
     - `unresolved = /\{[^{}]*\}/.test(unquoted)`. If true, push
       `{ rule: 'no-unresolved-reference', symbol: name, emitted: value }`.
     - `invalid = /\[object Object\]|\bNaN\b|\bundefined\b/.test(unquoted)`. If
       true, push `{ rule: 'invalid-value', symbol: name, emitted: value }`.
     - If `path === undefined`: if `WEB_PLATFORMS[platform].aliasLayer`, and
       `value.trim()` matches `/^var\(\s*--[A-Za-z0-9_-]+\s*\)$/`, and
       `declared.has(emittedVars[0])`, add one to `aliases`. Then `continue`.
     - `source = resolveValue(path, flat)` in `try`. On throw, `continue`. Then
       add one to `matched`.
     - `advisory = unitlessDimensionAdvisory({ path, flat, types, symbol: name, source, emitted: value })`.
       Push it onto `advisories` if non-null.
     - If `emittedVars.length`: `want` is every `{x}` capture and every
       `var(--x)` name in `raw`, in order, each through `normalizeKey`, then
       sorted. `got` is `emittedVars.map(normalizeKey).sort()`. If
       `JSON.stringify(want) !== JSON.stringify(got)`, push
       `{ rule: 'reference-fidelity', symbol: name, token: path, source: typeof flat[path] === 'string' ? flat[path] : JSON.stringify(flat[path]), emitted: value }`.
       Then `continue`.
     - `s = cssMagnitude(source)`. If `null`, `continue`. `e = cssMagnitude(value)`.
       If `null`: unless `unresolved || invalid`, push
       `{ rule: 'unverifiable-dimension', symbol: name, token: path, source, emitted: value }`.
       Then `continue`.
     - If `!webUnitFidelity(s, e, types[path])`, push
       `{ rule: 'unit-fidelity', symbol: name, token: path, source, emitted: value }`.
  6. The `dual-node` advisory, computed as `validate` computes it. No text-role
     advisories.
  7. `total = selected.size`. `denominator = total - aliases`.
     `matchRate = denominator ? matched / denominator : 0`. `ok` uses
     `validate`'s formula.
  8. `declaredKeys` is the set of `normalizeKey` of every name in `declared`.
     `unemittedPaths` is every `byKey` path whose key isn't in `declaredKeys`.
  9. Return
     `{ platform, block: resolved key or null, total, aliases, matched, matchRate, failures, advisories, collisions, normalizationCollisions, minMatch, ok, unparsedLines: unparsed, unemittedTokens: unemittedPaths.length, unemittedPaths }`.
- At the top of `validate`: if `platform === 'mui'`, throw
  `new Error(`--platform mui is not supported: a MUI theme is a JavaScript object, and this gate reads CSS custom properties. See #127.`)`.
  If `platform in WEB_PLATFORMS`, return `validateWeb({ sources, output, platform, minMatch, block })`.
  `validate` gains a `block` parameter that the native path ignores.
- Put a comment above `validateWeb` naming this spec. It should say why
  `no-foreign-syntax` and `no-bare-units` don't run there, citing #37.

Tests. `web(dtcg, css, extra)` is a local helper calling
`validate({ sources: [{ file: 'a.json', dtcg }], output: css, platform: 'vanilla-css', minMatch: 0, ...extra })`.
Use the file's existing `rules(r)` helper.
- `cssMagnitude`: `'1rem'` → `{ n: 1, unit: 'rem' }`, `16` → `{ n: 16, unit: '' }`,
  and `'var(--a)'`, `'#fff'` and `'16vh'` → `null`.
- `webUnitFidelity(cssMagnitude(a), cssMagnitude(b), type)` is `true` for
  `('16px','16px','dimension')`, `('16px','1rem','dimension')`,
  `(16,'1rem','dimension')`, `(16,'16px','dimension')`,
  `('1.5','1.5','number')`, `(700,'700','fontWeight')`,
  `('-0.03em','-0.03em','dimension')`, `('50%','50%','dimension')`,
  `('0px','0','dimension')`, `('24px','24.0005px','dimension')` and
  `('1.1','1.1','dimension')`. It's `false` for
  `(16,'16rem','dimension')`, `('1.1','1.1rem','dimension')`,
  `('1.5','1.5px','number')`, `('-0.03em','-0.48px','dimension')`,
  `('50%','0.5','dimension')` and `('16px','16','dimension')`.
- Clean output passes. `dtcg = { space: { 4: { $type: 'dimension', $value: '16px' } }, gap: { md: { $type: 'dimension', $value: '{space.4}' } }, color: { ink: { $type: 'color', $value: '#111111' } }, lh: { body: { $type: 'number', $value: 1.5 } } }`
  with `':root {\n  --space-4: 1rem;\n  --gap-md: var(--space-4);\n  --color-ink: #111111;\n  --lh-body: 1.5;\n}\n'`
  gives `failures` `[]`, `matched` 4, `matchRate` 1 and `ok` true.
- Native rules don't run. `{ a: { $type: 'dimension', $value: '24px' }, b: { $type: 'color', $value: 'color-mix(in srgb, {color.ink} 10%, transparent)' }, color: { ink: { $type: 'color', $value: '#111' } } }`
  with `':root { --a: 24px; --b: color-mix(in srgb, var(--color-ink) 10%, transparent); --color-ink: #111; }'`
  gives `rules(r)` `[]`.
- `16rem` for `16`: `space.4` of `16` emitted `--space-4: 16rem;` gives `rules(r)` `['unit-fidelity']`.
- `reference-fidelity`: `SPACE = { space: { 4: { $type: 'dimension', $value: '16px' } }, gap: { md: { $type: 'dimension', $value: '{space.4}' } } }`
  with `':root { --space-4: 16px; --space-8: 32px; --gap-md: var(--space-8); }'`
  gives `['reference-fidelity']`.
- Composite references pass in shorthand order.
  `{ font: { family: { body: { $type: 'fontFamily', $value: 'Inter' } }, size: { md: { $type: 'dimension', $value: '16px' } }, weight: { regular: { $type: 'fontWeight', $value: 400 } } }, type: { body: { $type: 'typography', $value: { fontFamily: '{font.family.body}', fontSize: '{font.size.md}', fontWeight: '{font.weight.regular}', lineHeight: 1.5 } } } }`
  with `':root { --font-family-body: Inter; --font-size-md: 16px; --font-weight-regular: 400; --type-body: var(--font-weight-regular) var(--font-size-md)/1.5 var(--font-family-body); }'`
  gives `[]`.
- `dangling-reference`: `SPACE` with `':root { --gap-md: var(--space-4); }'`
  gives exactly one failure,
  `{ rule: 'dangling-reference', symbol: '--gap-md', reference: '--space-4' }`.
- A source-written `var()` isn't dangling: `font.sans` `$value: 'var(--font-inter)'`
  emitted `--font-sans: var(--font-inter);` gives `[]`.
- `no-unresolved-reference`: `{ text: { xs: { $type: 'dimension', $value: '12px', lineHeight: { $type: 'dimension', $value: '16px' } } }, t: { lh: { $type: 'dimension', $value: '{text.xs.lineHeight}' } } }`
  with `':root { --text-xs: 12px; --t-lh: {text.xs.lineHeight}; }'` gives
  exactly `['no-unresolved-reference']`, and `r.advisories` has a `dual-node`
  entry.
- `invalid-value`: `shadow.card` of `$type: 'shadow'` with an object `$value`,
  emitted `[object Object]`, gives exactly `['invalid-value']`. A string token
  `$value: 'undefined'` emitted `"undefined"` gives `[]`.
- The alias layer. `dtcg = { color: { bg: { $type: 'color', $value: '#fff' } } }`
  with `':root { --color-bg: #fff; --background: var(--color-bg); }'`: on
  `platform: 'shadcn'`, `aliases` 1 and `matchRate` 1. On `'vanilla-css'`,
  `aliases` 0 and `matchRate` 0.5. On `'shadcn'` with `--background: var(--nope)`,
  `aliases` 0 and `rules(r)` includes `'dangling-reference'`.
- Blocks. `css = ':root { --a: 1px; }\n.dark { --a: 2px; }\n'` with
  `{ a: { $type: 'dimension', $value: '2px' } }`: no `block` throws
  `/pass --block with one of: ":root" \(1\), ".dark" \(1\)/`. `block: ' .dark '`
  gives `failures` `[]` and `block` `'.dark'`. `block: ':root'` gives
  `['unit-fidelity']`. `block: '.nope'` throws `/no block ".nope"/`.
- Later wins. `':root { --a: 16rem; }\n:root { --a: 16px; }\n'` for
  `a` `16px` gives `failures` `[]` and `total` 1.
- Emitted means any block. `dtcg = { a: { $type: 'dimension', $value: '1px' }, b: { $type: 'dimension', $value: '2px' }, c: { $type: 'dimension', $value: '3px' } }`
  with `':root { --a: 1px; }\n.dark { --b: 2px; }\n'` and `block: ':root'`
  gives `unemittedPaths` `['c']`.
- `no-mode-collision` carries over:
  `validate({ sources: [{ file: 'mobile.json', dtcg: { a: { $type: 'dimension', $value: '1px' } } }, { file: 'desktop.json', dtcg: { a: { $type: 'dimension', $value: '2px' } } }], output: ':root { --a: 1px; }', platform: 'vanilla-css', minMatch: 0 })`
  gives `collisions.length === 1` and `ok` false.
- Text-role advisories don't run on web: `validate({ sources: roleSources(), output: ':root { --text-base: 16px; }', platform: 'vanilla-css', minMatch: 0 })`
  gives no advisory whose rule is `unreferenced-text-sibling` or
  `ambiguous-text-role`.
- `platform: 'mui'` throws `/mui is not supported/`.

Verify: `node --test scripts/validate-token-output.test.mjs` → all pass.

### Step 5 — The web report

Files: `scripts/validate-token-output.mjs`, `scripts/validate-token-output.test.mjs`

Change: in `formatReport`, `web = r.platform in WEB_PLATFORMS`, which is false
for today's results because they have no `platform`. With `web` false, every
line stays byte-identical. With `web` true:
- Headline:
  `` `tokens:validate-output — ${r.matched}/${r.total - r.aliases} declarations in ${r.block ?? 'the output'} matched a source token (${pct}%)` ``.
- If `r.aliases`, straight after the headline:
  `` `\n${r.aliases} alias declaration(s) with no source token — each is a var() to a variable the output declares, so they are left out of the match rate.` ``
- The name-collision explanation reads:
  `` `\nThese reduce to the same variable name, so the output declares it twice and the later one silently wins. They are also excluded from matching above, because there is no way to tell which source token a declaration came from. Rename one side in source.` ``
- Failure lines:
  - `unit-fidelity`: `` `  - [unit-fidelity] ${f.symbol}: source ${f.source} for ${f.token}, emitted ${f.emitted}` ``
  - `reference-fidelity`: `` `  - [reference-fidelity] ${f.symbol}: source ${f.source} for ${f.token}, emitted ${f.emitted} — its var() references don't name the tokens the source references` ``
  - `dangling-reference`: `` `  - [dangling-reference] ${f.symbol}: references ${f.reference}, which no --output declares` ``
  - `no-unresolved-reference`: `` `  - [no-unresolved-reference] ${f.symbol}: ${f.emitted} — a {reference} reached the output unresolved` ``
  - `invalid-value`: `` `  - [invalid-value] ${f.symbol}: ${f.emitted} — a JavaScript value was written into the CSS` ``
  - `unverifiable-dimension`: the existing line.
- After the failure list, if any failure is `no-unresolved-reference` or
  `dangling-reference`:
  `` `\nA {reference} left in the output, or a var() to a variable nothing declares, usually means the build did not reach a token that is a child of a node carrying its own $value. A build split across files must pass each file it ships as another --output.` ``
  If any is `invalid-value`:
  `` `\nAn [object Object] value is a composite token, such as typography or a shadow, with no shorthand transform registered for this platform.` ``
- Zero matches, when there are no name collisions:
  `` `\nNo declaration matched any source token, so nothing was verified. The variable names don't line up with the source token paths — a likely cause is a name transform that doesn't build the name from the whole path, as Style Dictionary's name/kebab does. A JavaScript theme file has no custom properties to read at all.` ``
  With collisions, the existing collision wording.
- `unparsedLines`:
  `` `\n${r.unparsedLines} declaration(s) that are not custom properties — not checked, and not counted above.` ``
- `dual-node` advisory:
  `` `  - [dual-node] ${a.paths.length} node(s) carry both a $value and child tokens: ${shown}${more}. DTCG §6.1 makes that invalid, and §6.2 defines $root as the way a group carries a base value alongside children. Stock Style Dictionary does not descend into these nodes, so their children can be missing from web output — a no-unresolved-reference or dangling-reference failure above is that happening.` ``
- `unitless-dimension` advisory:
  `` `  - [${a.rule}] ${a.symbol}: source ${JSON.stringify(a.source)} for ${a.token} is a dimension with no unit, which DTCG §8.2.1 does not permit. It emitted ${a.emitted}. If it is a ratio, type it "number" (§8.7); if it is a measurement, add the unit you meant.` ``
- Unemitted:
  `` `\n${r.unemittedTokens} source token(s) are declared nowhere in the output${paths.length ? `: ${shown}${more}` : ''}. A token this build filtered out, or the child of a node carrying its own $value that the build did not reach, shows up here.` ``

Tests:
- A web result with `platform: 'shadcn'`, `block: ':root'`, `total: 5`,
  `aliases: 1`, `matched: 4`, `matchRate: 1`, `minMatch: 1`, `ok: false`,
  `collisions: []`, `normalizationCollisions: []`, `unparsedLines: 1`,
  `unemittedTokens: 1`, `unemittedPaths: ['c.x']`, one failure of each of the
  six web rules with every field its Step 4 shape has, and advisories
  `[{ rule: 'dual-node', paths: ['text.xs'] }, { rule: 'unitless-dimension', symbol: '--lh', token: 'lh', source: '1.5', emitted: '1.5' }]`.
  Its joined text has no `undefined`, matches
  `/4\/4 declarations in :root matched a source token \(100%\)/`, `/1 alias declaration/`,
  each of the six rule names in brackets, `/which no --output declares/`,
  `/no shorthand transform/`, `/Stock Style Dictionary does not descend/`,
  `/1 declaration\(s\) that are not custom properties/` and
  `/declared nowhere in the output: c\.x/`, and doesn't match `/compile/`.
- A web zero-match result (`matched: 0`, `total: 3`, `aliases: 0`, no
  collisions) matches `/name\/kebab/`.
- Every existing `formatReport` test is unchanged and passes.

Verify: `node --test scripts/validate-token-output.test.mjs` → all pass.

### Step 6 — The CLI

Files: `scripts/validate-token-output.mjs`, `scripts/validate-token-output.test.mjs`

Change in `main()`:
- `output: { type: 'string', multiple: true }` and `block: { type: 'string' }`.
- The required check becomes `!values.source?.length || !values.output?.length || !values.platform`.
  The usage line becomes:
  `usage: validate-token-output.mjs --source <a.json> [--source <b.json>...] --output <file> [--output <file>...] --platform <ios-swift|android-kotlin|shadcn|tailwind|vanilla-css> [--block <selector>] [--min-match <ratio>]`.
- `web = values.platform in WEB_PLATFORMS`. If `!web && values.output.length > 1`,
  print `--output may be given more than once only for a web platform (shadcn, tailwind, vanilla-css)`
  and exit 2. If `!web && values.block !== undefined`, print
  `--block applies only to a web platform (shadcn, tailwind, vanilla-css)` and
  exit 2.
- Read each output in order with the existing error and exit 2 for an unreadable
  file, then join them with `'\n'`.
- Pass `block: values.block` to `validate`. The existing `catch`, which prints
  the message and exits 2, handles the block and `mui` errors.
- Update the header comment: it now covers generated Swift/Kotlin **and** web
  CSS custom properties, with a second usage example:
  `node validate-token-output.mjs --source a.json --output tokens.css --platform shadcn --block .dark`.

Tests, using `runCli` and a fresh temp dir each:
- `src` holds `{ "space": { "4": { "$value": "16px", "$type": "dimension" } }, "gap": { "md": { "$value": "{space.4}", "$type": "dimension" } } }`.
  `good.css` holds `:root {\n  --space-4: 1rem;\n  --gap-md: var(--space-4);\n}\n`.
  `--source src --output good.css --platform vanilla-css --min-match 1` → exit 0,
  with stdout matching `/2\/2 declarations in :root matched/`.
- `bad.css` with `--space-4: 16rem;` → exit 1, with stdout matching `/\[unit-fidelity\] --space-4/`.
- `two.css` with `:root { --space-4: 16px; }\n.dark { --space-4: 16px; }\n` and
  no `--block` → exit 2, with output matching `/":root" \(1\), ".dark" \(1\)/`.
  With `--block .dark` → exit 0. With `--block .nope` → exit 2.
- Split files: `root.css` holds `:root { --space-4: 16px; }` and `light.css`
  holds `.light { --gap-md: var(--space-4); }`. `--output root.css --output light.css --block .light`
  → exit 0. `--output light.css` alone → exit 1, matching `/\[dangling-reference\] --gap-md/`.
- `--platform ios-swift` with two `--output` → exit 2. With `--block :root` →
  exit 2.
- `--platform mui --output good.css` → exit 2, matching `/mui is not supported/`.
- The existing CLI tests are unchanged and pass.

Verify: `node --test scripts/validate-token-output.test.mjs` → all pass. Then
`node scripts/validate-token-output.mjs` with no arguments → exit 2 and the new
usage line.

### Step 7 — Documentation and the skill

Files: `scripts/README.md`, `skills/token-sync-layer/SKILL.md`,
`references/sync-adapters.md`, `CHANGELOG.md`, `adapters/**` (regenerated)

Change. The contract lives in one place, `scripts/README.md`, and the other two
link to it. Write prose with the `write-like-jordan` skill, matching the
neighbouring text.
- `scripts/README.md`:
  - In the top table's `validate-token-output.mjs` row, change "Assert generated
    native token output matches its DTCG source" to "Assert generated token
    output — Swift, Kotlin, or web CSS custom properties — matches its DTCG
    source". Leave the rest of the row.
  - Under `## Usage`, add `node validate-token-output.mjs --source dtcg/primitives.json --source dtcg/semantic.dark.json --output css/tokens.css --platform shadcn --block .dark --min-match 1`
    to the code block. Add a paragraph after the `validate-adherence.mjs`
    paragraph stating the web contract:
    - which platforms read CSS, and that `mui` and JavaScript configs aren't read yet (#127)
    - one run per mode block, with that block's sources
    - how a block key is spelled, and that the run lists them when it can't choose
    - `--output` repeats for a build split across files
    - what fails: the six web rules, one clause each
    - what never fails for being CSS: `var()`, `calc()`, `color-mix()`, units
    - that shadcn and tailwind leave alias declarations out of the match rate.
- `skills/token-sync-layer/SKILL.md`:
  - In Step 3's execution-model paragraph, replace the whole parenthetical after
    "verifies them". Today it runs across four wrapped lines (190-193), from
    "(for web: the config builds," to "four known native failure modes ship
    silently)", so find it by its first and last lines, not as one string. Its
    tail rebuts a phrase this edit deletes and counts only native failures, so
    it goes too. The replacement, in full: "(for web and native alike:
    `tokens:validate-output` passes — a clean build is not verification, it is
    the condition under which every known failure mode, web or native, ships
    silently)". Rewrap to the paragraph's width, keeping "for web and native
    alike" on one line so the Verify grep below can find it. Read the finished sentence as a
    whole, from "If your host supports subagent dispatch" to "to check each
    before combining".
  - In Step 4, change "Install the native token toolkit — all four files, as a
    set." to "Install the token toolkit — all four files, as a set, for web and
    native targets alike." The copy lines don't change.
  - After "Invoke it once per native output file, passing the same `--source`
    list that file's build used.", add: for web output (`shadcn`, `tailwind`,
    `vanilla-css`), run it once per mode block, naming the block with `--block`
    and passing the sources that block was built from. A MUI theme isn't
    checked yet (#127). The full contract is in
    `${CLAUDE_PLUGIN_ROOT}/scripts/README.md`.
- `references/sync-adapters.md`: at the end of the **Web adapters** bullet
  (lines 132-142), add one sentence saying `tokens:validate-output` checks
  generated web CSS against its source too, linking
  `${CLAUDE_PLUGIN_ROOT}/scripts/README.md`. No restated rules.
- `CHANGELOG.md`: a new bullet at the end of `[Unreleased]` → `### Added`,
  before `### Changed`, titled for `scripts/validate-token-output.mjs` web
  output (#37). It says what it catches, with the measured stock Style
  Dictionary cases (`1.1` → `1.1rem`, raw `{text.5xl.lineHeight}`, `16` →
  `16rem`, `[object Object]`). It says a run is one mode block, a split build
  passes every file, shadcn and tailwind aliases leave the match rate alone,
  and `token-sync-layer` now runs it for web. MUI isn't checked yet (#127).
- Run `node scripts/adapters/generate.mjs`.

Verify:
- `node ci/validate-install-sets.mjs` → exit 0.
- `node scripts/adapters/generate.mjs --check` → exit 0.
- `grep -n 'for web: the config builds' skills/token-sync-layer/SKILL.md` → no
  output. Before the edit it matches line 190; a check that also passes on the
  unchanged file proves nothing.
- `grep -n 'four known native failure modes' skills/token-sync-layer/SKILL.md` →
  no output. Before the edit it matches line 193.
- `grep -n 'for web and native alike' skills/token-sync-layer/SKILL.md` → at
  least one line. Before the edit it matches nothing.
- `grep -n 'block' scripts/README.md skills/token-sync-layer/SKILL.md` shows the new text.
- All four prose edits read by eye against the text around them.

### Step 8 — CI

Files: none

Change: none. Run each step of `.github/workflows/ci.yml` as its own command:
`node --test`; `node ci/validate-plugin.mjs`; `node ci/validate-skills.mjs`;
`node ci/validate-install-sets.mjs`; `node scripts/adapters/generate.mjs --check`;
`node scripts/build-doc-card-builder.mjs --check`;
`node scripts/build-native-adapter-config.mjs --check`.

Verify: all seven exit 0.

### Step 9 — Measure the real change, record it, close out this spec

Files: a new `docs/superpowers/notes/<date +%F>-web-output-validation-e2e.md`,
this spec

Change: confirm `git -C $M/zygarden-frontend log -1 --format=%h` is `ca61ca9a6`,
`git -C $M/throughline-brand log -1 --format=%h` is `2a9d370`, and
`git -C ~/Dev/throughline-sample log -1 --format=%h` is `01348d1`. Rebuild the
controls with `cd $W && node stock.mjs && node stock2.mjs && node stock3.mjs`.
Then, from the repo root, with `V='node scripts/validate-token-output.mjs'`
run as `$=V` in zsh, or written out in full:

```sh
Z=$M/zygarden-frontend/libs/shared/util-tokens; T=$Z/src/tokens; O=$Z/css/tokens.css
BASE=(); for f in $T/*.json; do case $f in *.light.json|*.desktop.json) ;; *) BASE+=(--source $f);; esac; done
LIGHT=(--source $T/color-primitives.json --source $T/color-semantic.light.json)
DESK=(--source $T/spacing-primitives.json --source $T/text-primitives.json --source $T/typography-primitives.json --source $T/leading-primitives.json --source $T/spacing-semantic.desktop.json --source $T/typography-semantic.desktop.json)
S=~/Dev/throughline-sample/packages/tokens; SP=(--source $S/dtcg/primitives.json)
sed 's/--color-bg-canvas: var(--color-neutral-0);/--color-bg-canvas: var(--color-neutral-50);/' $O > $W/mut-ref.css
sed 's/^  --color-neutral-0: #ffffff;$/  --color-neutral-zero: #ffffff;/' $O > $W/mut-dangle.css
```

Each run passes `--min-match 1`. Record the exit code and the report:

| # | Run | Expect |
|---|---|---|
| 1 | `--platform vanilla-css --output $O --block ':root' $BASE` | exit 0, 214/214, no failures |
| 2 | `--platform vanilla-css --output $O --block '[data-theme="light"]' $LIGHT` | exit 0, 39/39, no failures |
| 3 | `--platform vanilla-css --output $O --block '@media (min-width: 768px) :root' $DESK` | exit 0, 69/69, no failures |
| 4 | `--platform shadcn --output $S/build/css/tokens.css --block ':root' $SP --source $S/dtcg/semantic.dark.json` | exit 0, 147/147, 20 aliases, no failures |
| 5 | `--platform shadcn --output $S/build/css/tokens.css --block .light $SP --source $S/dtcg/semantic.light.json` | exit 0, 35/35, no failures |
| 6 | `--platform vanilla-css --output $S/build/css/_root.css --output $S/build/css/_light.css --block .light $SP --source $S/dtcg/semantic.light.json` | exit 0, 35/35, no failures |
| 7 | `--platform vanilla-css --output $O $BASE` (no `--block`) | exit 2, lists the 3 blocks with counts 214, 39, 69 |
| 8 | Run 6 with only `--output $S/build/css/_light.css` | exit 1, exactly 35 `dangling-reference`, 112 unemitted |
| 9 | Run 2 with `--output $W/mut-ref.css` | exit 1, exactly 1 `reference-fidelity` (`--color-bg-canvas`) |
| 10 | Run 2 with `--output $W/mut-dangle.css` | exit 1, exactly 3 `dangling-reference` to `--color-neutral-0` |
| 11 | `--platform vanilla-css --output $W/stock/zyg-root-stock.css $BASE` | exit 1, exactly 5 `unit-fidelity` (the `--leading-*` tokens) and 13 `no-unresolved-reference`, no `unverifiable-dimension`, 13 unemitted |
| 12 | `--platform vanilla-css --output $W/stock/unitless-stock.css --source $W/stock/unitless.json` | exit 1, exactly 2 `unit-fidelity` (`--space-4`, `--radius-md`) |
| 13 | `--platform vanilla-css --output $W/stock/composite-no-shorthand.css --source $W/stock/unitless.json` | exit 1, exactly 2 `invalid-value` |
| 14 | `--platform vanilla-css --output $W/stock/composite-refs.css --source $W/stock/composite-refs.json` | exit 0, 6/6, no failures |
| 15 | `--platform shadcn --output $M/throughline-brand/packages/tokens/shadcn/tokens.css --block ':root' --source $M/throughline-brand/packages/tokens/dtcg/tokens.json` | exit 1, 0 matched, the `name/kebab` message |
| 16 | `--platform mui --output $O --source $T/color-primitives.json` | exit 2, names #127 |

Runs 1–6 and 14 pass by showing no failures. Runs 8–13 and 15 are their
controls, through the same CLI in the same session. Write the note with:
sources and commits, the commands, this table filled with what actually came
back, each run's advisory lines (expected: `dual-node` and
`unitless-dimension` only), and what the runs don't establish: two real
emitters plus one stock build, no Tailwind v4 `@theme` output measured, and no
MUI.

Then close out this spec: add `## What shipped` and `## Where it diverged`, in
that order, between `## Open questions` and `## Plan`, and set `Status: built`.

Verify: every row matches its Expect column. A clean run with a failure, or a
control that comes back clean, means the build and the prototype disagree. Find
which is wrong before recording anything. A mechanical difference goes in "Where
it diverged". A difference that changes a Decision is an escalation. Per
`ci/README.md`, if a control comes back clean the harness is broken, and the
verdict isn't PASS until it's fixed.
