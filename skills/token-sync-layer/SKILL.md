---
name: token-sync-layer
description: Sync Figma design variables into code-ready token files via DTCG JSON and Style Dictionary, emitting framework-specific outputs (shadcn/Tailwind, MUI, vanilla CSS, iOS Swift, Android Kotlin, or custom), and set up the reusable "sync figma tokens" command. Use this when the user wants to turn Figma tokens into code, sync design tokens, generate tokens.css or a Tailwind config or tokens.swift, set up a token pipeline, or run "sync figma tokens". Also trigger when the user mentions Style Dictionary, design token export, or keeping code in sync with Figma.
---

# Token sync layer

Compiles Figma variables into code. The pipeline is one-directional — Figma is
the source of truth for token values; code consumes generated artifacts that are
never hand-edited:

```
Figma variables → DTCG JSON → Style Dictionary → adapter output (per platform)
```

This skill both performs the sync and installs the reusable `/sync-figma-tokens`
command so the user can re-run it anytime tokens change.

## Calibrate

Read `user.codingLevel` (`${CLAUDE_PLUGIN_ROOT}/references/coding-level.md`) and scale explanation
accordingly. The pipeline involves several developer concepts (JSON, build
tools, PRs) — for `new` users, explain each plainly the first time; for
`comfortable` users, be terse. Actions are identical across levels.

## Prerequisites (offer to run them, don't bail)

Read the manifest. This skill needs two things:

1. **Tokens in Figma** — `tokens.semanticBuilt` should be true. If no tokens
   exist, offer to run `token-builder` first.
2. **At least a local git repo** — `workspace.stage` must be `local-git` or
   `github` (so the sync can land changes as a reviewable diff/PR). If it's still
   `folder`, this is the soft-nudge seam: offer to run `repository-builder` to
   add version history first. Explain plainly why ("the sync writes code files,
   and git lets you review exactly what changed before keeping it"). If the user
   is at `local-git` but not `github`, **strongly recommend** connecting a remote
   (GitHub or similar) so the sync can land as a real reviewable PR — the cleanest
   review model — but don't force it; a reviewed branch diff works at `local-git`.

A live Figma connection is also required — do a cheap liveness read; if it
fails, offer `figma-environment-setup`.

## Step 1 — Choose target platform(s)

Ask which platform(s) the user is building for. Read
`${CLAUDE_PLUGIN_ROOT}/references/sync-adapters.md` for the two-tier adapter model.

- **Curated (Tier 1):** `shadcn`, `tailwind`, `mui`, `vanilla-css`, `ios-swift`.
  Vetted presets — high confidence.
- **Generated (Tier 2):** any other framework (Ant Design, Chakra, HeroUI,
  Android/Kotlin, Flutter, etc.). The skill generates an adapter and
  verifies it against a real component before trusting it.

**Always tell the user which tier they're on.** If they name a curated one, say
it'll be solid. If they name anything else, be honest: "That's not one I have a
vetted preset for — I'll generate an adapter from its conventions and we'll check
it against a real component before relying on it." Follow the Tier 2 protocol in
the reference, and offer to **save** a validated generated adapter to
`packages/tokens/adapters/` (record it in `sync.customAdapters`) so future syncs
reuse it.

A user can target several platforms at once. Record the choices in
`sync.platforms`. The adapter is what absorbs all framework-specific shaping —
which is why the Figma variables stayed framework-neutral.

Also set `project.uiFramework` if it's still null (this or component-builder sets
it at first relevance, whichever runs first; the other reads it). If
component-builder already set it, the chosen adapter(s) should be consistent with
it.

## Step 2 — Extract Figma variables to DTCG JSON

Using the active write mechanism (`figma.mechanism`, default Console MCP —
prefer its full-design-system extraction, which works on any Figma plan), read
**every variable collection** (there are now several per tier, e.g.
`_Color/Primitive`, `Spacing/Primitive`, `Color/Semantic`, …) and normalize them
into **DTCG-format JSON** (`$value`, `$type`, with semantic tokens expressed as
`{group.token}` references to primitives, not flattened literals).

Three rules for the multi-collection structure:
- **Iterate N collections**, not a fixed two. Don't assume one `Primitives` +
  one `Semantic`.
- **Single-mode collections are non-themed** — a collection with one mode (e.g.
  `Spacing/Semantic`) emits flat values, never a phantom `default` theme
  alongside `:root`/`.dark`.
- **Primitives can be multi-mode** — `_Color/Primitive` carries a Brand axis, so
  emit **brand themes from the primitive tier**, not just light/dark from
  semantics. Preserve modes (light/dark/brand/device) as the DTCG structure the
  adapters expect.
- **Name mapping:** collapse the tier/category prefix into clean token names —
  `_Color/Primitive` + `gray/500` → `color.gray.500` (not
  `color.primitive.gray.500`); `Color/Semantic` + `text/primary` →
  `color.text.primary`. The category drives the top-level group; the tier (and
  the `_`) is dropped from the emitted name.
- **Opacity: normalize 0–100 → 0–1 on extraction.** Opacity tokens are stored in
  Figma on the **0–100 scale** (a quirk of how Figma binds variables to a node's
  `opacity` field — see the opacity scale rule in `token-builder`). CSS `opacity`,
  Tailwind opacity, and native alpha are all **0–1**, so when normalizing any
  opacity token (the `Opacity/*` collections, or any FLOAT bound to opacity)
  **divide its value by 100** before writing DTCG (`40` → `0.4`). Do this once at
  extraction so every adapter emits a correct 0–1 value; an un-normalized `40`
  lands as `opacity: 40` in CSS and renders the element fully opaque. token-builder
  and token-sync-layer are a **matched pair** on this — neither is correct alone.

This DTCG JSON is the canonical intermediate. Write it to a known location in
`packages/tokens/`, **one file per mode**, because every gate downstream reads a
file as a mode. A single-mode system writes `packages/tokens/dtcg/tokens.json`; a
light/dark system writes `packages/tokens/dtcg/primitives.json`,
`packages/tokens/dtcg/semantic.light.json` and
`packages/tokens/dtcg/semantic.dark.json` — the ramps once, then each mode's
semantic aliases in its own file. Nesting the modes as groups inside a single
file (`color.light.*` / `color.dark.*`) is the layout `color-contrast` abstains
on, and writing a multi-mode system to one `tokens.json` is what leaves the
registered `verify:check` checking a single mode and reporting that it checked
one. Do not trust the MCP's built-in CSS/Tailwind exporters for final output —
route through Style Dictionary so the adapter system governs the result.

### Brownfield transforms (learned the hard way)

On a **retrofit** (`tokens.intakeMode: "retrofit"`), apply these transforms in
addition to the opacity normalization above. Each cost real debugging time on a live
retrofit — see the guardrails in
`${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`.

- **Alpha as channels, not baked CSS vars (so Tailwind `/opacity` survives).** Emit
  colors as space-separated channels with a slash-alpha slot —
  `--color-x: 239 68 68;` consumed as `rgb(var(--color-x) / <alpha-value>)` — rather
  than a finished `rgba(...)`. A baked `rgba()` can't accept Tailwind's `/opacity`
  modifier; the channel form keeps `bg-x/50` working after the retrofit.
- **`/opacity` on var-based tokens → `color-mix` or channel alpha (guardrail 6).**
  Where existing code applies a `/opacity` modifier to a token that is now a CSS var,
  you can't fold the alpha into the var. Convert to
  `color-mix(in srgb, var(--color-x) NN%, transparent)` (or the channel-alpha form
  above). Never carry a raw `/opacity` onto a var-based token.
- **Round float32 noise at the export boundary (guardrail 2).** Figma stores values as
  float32 and re-quantizes on write, so normalizing *inside* Figma is a no-op. Round at
  the **export boundary** instead — `Math.round(v * 100) / 100` as values leave the
  pipeline — so `0.30000001192092896` lands as `0.3` in the generated files. Do this in
  the extraction/transform step, never by hand-editing the generated output (guardrail 7).

These are transforms on the *values* the adapters emit; the adapter presets themselves
are unchanged. See `${CLAUDE_PLUGIN_ROOT}/references/sync-adapters.md` for where they
fit in the adapter output.

## Step 3 — Set up Style Dictionary + adapters

Install and configure Style Dictionary v4 in `packages/tokens/`. For each chosen
platform, apply its adapter preset (per `${CLAUDE_PLUGIN_ROOT}/references/sync-adapters.md`):
register the platform, transform group, format, and `outputReferences`
(true for web → preserves the semantic→primitive cascade; false for native →
flattens). Web adapters emit `:root`/`.dark` (or `[data-theme]`); the shadcn
adapter also emits a Tailwind preset.

**Native targets import the shipped configuration; they do not transcribe it.**
Copy `${CLAUDE_PLUGIN_ROOT}/scripts/lib/sd-native.mjs` into
`packages/tokens/scripts/lib/` (see Step 4) and call it. The stock `ios-swift`
and `compose` transform groups emit every `px`-authored dimension at ×16 its
value — valid, compiling, silently wrong — and mishandle `color-mix()` and
dual-node DTCG the same way. Never build a native platform from a stock
`transformGroup`.

```js
import StyleDictionary from 'style-dictionary';
import { registerNativeTransforms, nativePlatform, nativeSources }
  from './scripts/lib/sd-native.mjs';

registerNativeTransforms(StyleDictionary);

for (const mode of MODES) {                     // e.g. ['light', 'dark']
  const sd = new StyleDictionary({
    source: nativeSources(sourcesFor(mode)),    // guards against a mode collapse
    preprocessors: ['dtcg/resolve-dual-node'],
    platforms: {
      ios: nativePlatform({ platform: 'ios-swift', buildPath: `ios/${mode}/` }),
      // android also requires packageName:
      // android: nativePlatform({ platform: 'android-kotlin',
      //   buildPath: `android/${mode}/`, packageName: 'com.example.tokens' }),
    },
  });
  await sd.buildAllPlatforms();
}
```

**One build per mode combination, and never a glob.** Style Dictionary dedupes
by dot-path, so a single build over the whole token directory collapses light
and dark into whichever file sorted last, silently dropping a mode. Passing each
mode's sources through `nativeSources` turns that into a thrown error naming the
colliding paths. The `dtcg/resolve-dual-node` preprocessor throws too, on its
own collision: a dual node's hoisted child renamed to a camel-joined name that
an existing sibling or an earlier hoist in the same pass already has. Then run
`tokens:validate-output` against each generated file with that same source
list. See `${CLAUDE_PLUGIN_ROOT}/references/native-adapter-config.md`.

**Execution model — subagent dispatch with model routing.** Generating each
platform's output is independent and verifiable. If your host supports subagent
dispatch, dispatch **one `code-executor` per adapter** — each produces its
platform's files and verifies them (for web and native alike:
`tokens:validate-output` passes — a clean build is not verification, it is the
condition under which every known failure mode, web or native, ships silently)
— then a **`reviewer`** to check each before combining. Choose each subagent's
model from its role tier per
`${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md` (`code-executor` → fast,
`reviewer` → balanced), and only dispatch once each adapter's spec is complete
enough to transcribe. If your host has no subagent dispatch, generate and verify
each adapter inline instead. For a single platform, run inline either way. This
is a code-gen stage, so these subagents may run in parallel — unlike Figma
authoring, which is always sequential.

## Step 4 — Build and place outputs

Run the Style Dictionary build. Outputs land in `packages/tokens/<platform>/`
as **build artifacts** — regenerated every sync, never hand-edited. Wire
`packages/tokens/package.json` to export them so the UI package, Storybook, and
any future app consume them.

**Install the token toolkit — all four files, as a set, for web and native
targets alike.** Copy these from `${CLAUDE_PLUGIN_ROOT}/scripts/` into the
user's repo verbatim:

- `validate-token-output.mjs` → `packages/tokens/scripts/validate-token-output.mjs`
- `lib/dtcg.mjs` → `packages/tokens/scripts/lib/dtcg.mjs`
- `lib/native-literal.mjs` → `packages/tokens/scripts/lib/native-literal.mjs`
- `lib/sd-native.mjs` → `packages/tokens/scripts/lib/sd-native.mjs`

`sd-native.mjs` and the validator both import `dtcg.mjs` and
`native-literal.mjs`, so copying any of them without the others breaks at
import. Then register the gate so it stays live on every future sync:

```json
"tokens:validate-output": "node scripts/validate-token-output.mjs --min-match 1"
```

Invoke it once per native output file, passing the same `--source` list that
file's build used. For web output (`shadcn`, `tailwind`, `vanilla-css`), invoke
it once per mode block instead: name the block with `--block` and pass the
sources that block was built from. A MUI theme isn't checked yet (#127). The
full contract is in `${CLAUDE_PLUGIN_ROOT}/scripts/README.md`. `--min-match 1`
is what makes it a gate: the flag defaults to `0.5`, so without it a 60% match
rate exits `0`.

## Step 4.5 — Icon code sync (install check + custom SVGR)

Icons reach code differently from tokens, so handle them here if the system has
icons (`icons.built` true):

- **Library icons (Lucide/Material)** — verify the npm package is installed
  (`icons.packageInstalled`); install it if not. Then **check version drift**:
  compare the installed package version against `icons.version` (the version the
  Figma mirror was built from). If they differ, an icon could exist on one side
  and not the other — flag it and **offer to align** them (bump the package, or
  note the Figma mirror should be refreshed). Never generate library icon
  component code — the package *is* the code.
- **Custom icons** — these the repo owns, so generate them: export the custom
  SVGs from Figma, optimize, and componentize via SVGR into `packages/ui` (or a
  dedicated icons package). This is real code generation and rides the same
  **`code-executor` (fast) + `reviewer` (balanced)** routing and PR-review as
  token output (SVGR transforms are the textbook mechanical op the fast tier is
  for) — see the Step 4 execution model.

## Step 5 — Full regeneration + rename detection (the safety net)

The sync is a **full regeneration** every run: outputs are rebuilt from current
Figma state, so a token **deleted** in Figma disappears from output (no orphans).
But a naive full regen can't tell a **rename** from a delete-plus-add — and a
rename silently breaks every consumer of the old name.

So before writing, **diff against the previous output** and run a rename
heuristic: if a token vanished and a new one appeared with an identical `$value`
and `$type`, flag it as a **probable rename** (e.g. `color.bg.default →
color.surface.default?`). Surface these prominently. Also surface plain
deletions (consumers will break — that's intentional, but the human should see
it).

### Check contrast before it ships

Run the gate once against the DTCG sources this sync just wrote — **always**, with
no accepted-pair exception. The paragraphs below filter the result, never the run:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-check.mjs --root <repo root> \
  --tokens <each DTCG source, one flag per mode file> \
  --skip orphan-token --skip state-incomplete --skip name-drift
```

**One `--tokens` flag per mode file** — that is what makes each pair get checked
in every mode. Passing a single file of a multi-mode system checks one mode, and
says so on the report's `contrast:` line.

**Why those three rules are skipped, so nobody removes the flags.** A sync that
adds a token is adding one nothing in the repo names yet, which is
`orphan-token`'s definition of an orphan — running it here would fail nearly
every sync that does its job. `state-incomplete` and `name-drift` are about doc
records and code surfaces this skill does not touch. All three stay live in
`storybook-chromatic-builder`'s run of the same gate.

**Honour an accepted pair, and only an accepted one.** After the gate has run,
read `design-system/proof/token-builder.json` under the same `--root` (it may not
exist, in which case there is nothing to honour). Collect the `accepted` array
from its `system` entry's `contrast-baseline` check, then drop from this run's
`color-contrast` failures every one whose `(fg, bg, mode)` matches an entry in it,
comparing `fg` and `bg` on the same normalized fold the rule matches roles with
(lowercase, alphanumerics only). **Translate `mode` before comparing it:** the
recorded value is the Figma mode name `token-builder` saw (`Dark`), and the gate
labels a mode by its DTCG file's basename (`semantic.dark`). This skill is the one
that knows both — it read the Figma modes and it wrote the files — so map each
Figma mode to the file it generated for that mode, and compare against that label.
Untranslated, the triple can never match and the override path silently does not
exist. Match the triple exactly, and subtract nothing else.

**What this reads.** The gate has no machine-readable output, so this operates on
`formatReport`'s failure lines — `<fg> on <bg> is <ratio>:1 in <mode> …` — which
carry all three fields in fixed positions. That is machine-formatted output with a
stated shape, not prose. Do **not** treat `result: "fail"` on its own as the
condition, and do **not** pattern-match `advancedBecause`: the first switches off a
whole rule on the strength of one pair, and the second reads prose written for a
human as though it were a test.

**Then judge what is left.** Nothing remaining → proceed, and say in one line which
pair was accepted and is not being re-litigated, both in the sync's message and in
the PR body. That line is where the override stays visible, and it is the only
place, since a subtracted failure is by definition not on the report. Anything
remaining → stop, exactly as if there had been no acceptance: a pair the user never
saw, in any mode, is the case this rule exists for, and an acceptance given for one
pair must not carry another one through. An `accepted` list that matches nothing —
because the pair was fixed, or was never recorded properly — subtracts nothing and
the sync behaves as though there were no acceptance at all, which is both the
fail-safe direction and how an acceptance retires itself once the pair clears.

**A `color-contrast` failure stops the sync.** Do not open the PR. Report the
failing pair and mode in guide voice
(`${CLAUDE_PLUGIN_ROOT}/references/guide-voice.md`), and say the fix is in Figma —
re-point that mode's alias — not in the generated output, which is a build
artifact. **Any other failure in the report does not stop the sync**: surface it to
the user and summarize it in the PR body, but the token sync owns the token tier,
and a component's missing proof entry is not its to block on.

## Step 6 — Land it as a reviewable PR (never silent)

Never overwrite token files silently. The output of a sync is a **pull request**
(or, if the repo is only `local-git`, a clearly-described diff/commit on a
branch the user reviews). The PR body is the human safety net — it should
summarize: tokens added, changed, deleted, and **probable renames flagged for
review** so the reviewer can do a find-and-replace instead of merging a break.

For `new` users, explain what a PR is plainly ("a proposed change you review and
approve before it becomes official — like track-changes for code") and walk the
review. For `comfortable` users, just open it.

**Chromatic note.** This PR is *token-only* — it changes `packages/tokens` but no
story files. Token changes are global, so Chromatic should re-snapshot **every**
story for a sync PR. Don't rely on TurboSnap (`onlyChanged: true`) here — its
incremental model keeps missing global token changes; default to full snapshots.
If a sync PR reports "0 snapshots captured," TurboSnap is the cause — see the
TurboSnap section in `storybook-chromatic-builder`.

Update the manifest: `sync.lastRun` (timestamp), `tokens.lastSync`, confirm
`sync.platforms`. Append `token-sync-layer` to `completedSkills`.

Alongside that, record the stage entry: `node
${CLAUDE_PLUGIN_ROOT}/scripts/verify-check.mjs --record --stage
token-sync-layer --entry <tmp>.json` (subject defaults to `"system"`, since this
stage isn't per-component). Build `<tmp>.json` with `changed` summarizing tokens
added, changed, deleted and probable renames, and the attested
`tokens:validate-output` result as a check, plus `advancedBecause`. The entry
shape is `${CLAUDE_PLUGIN_ROOT}/references/proof-bundle.md` — don't restate it
here.

The entry also carries the **derived** check `color-contrast`, its result read off
the Step 5 report, with `evidence` naming the modes checked and the tightest
ratio. The gate runs on every sync, so this check is always recorded — there is no
path on which it is omitted.

**When a failure was subtracted, record `result: "fail"` — what the gate actually
reported** — with `advancedBecause` naming the accepted pair as the reason the sync
proceeded anyway, and `evidence` saying which pair was subtracted. Do not record
`pass` on the grounds that nothing remained after subtraction: the gate does not
know about subtraction, the pair still fails on disk, and the next sync's own gate
run recomputes it, so a recorded `pass` would raise `proof-contradicted` on every
later sync report. A stored result that disagrees with the file it claims to
describe is an attestation wearing a derived label.

**Expect one `proof-contradicted` line on the first sync after the user fixes the
pair**, and say why when you relay it: the stored `fail` is now disagreed with by a
rerun that passes, which `checkProof` reports in both directions. It does not stop
the sync, and this step re-records the pass on that same run, so it clears itself
in one pass. Relaying an expected, self-healing line as a problem is how a user is
taught to distrust the gate.

**The ordering is the point.** The gate runs in Step 5 and the record is written
here in Step 6, and it is that order which makes recording a derived result honest:
this stage has the gate's output in hand rather than asserting it, which is the one
and only reason a stage may record `method: "derived"`.

## Step 7 — Install the `/sync-figma-tokens` command

Set up the reusable command (the plugin ships it in `commands/`) so the user can
re-run this whole pipeline anytime tokens change in Figma. Explain that the
workflow going forward is: tweak tokens in Figma → run `/sync-figma-tokens` →
review the PR → merge. That loop is the entire point of the one-directional
source-of-truth model. Confirm the command works by describing how to invoke it.

## What this skill must NOT do

- Never hand-edit generated token files or let the user treat them as editable —
  they're build artifacts; changes go in Figma and re-sync.
- Never flatten semantic→primitive references for web adapters (kills theming).
- Never write token files silently — always a reviewable PR/diff.
- Never merge or push to a protected branch on the user's behalf without review.
- Never skip rename detection — a silent rename is the worst failure mode.
- Never bake alpha into finished `rgba(...)` on a retrofit — emit channels
  (`rgb(var(--x) / <alpha-value>)`) so Tailwind `/opacity` modifiers survive.
- Never carry a `/opacity` modifier onto a var-based token — convert to `color-mix`
  or channel alpha (guardrail 6).
- Never normalize float32 inside Figma (it re-quantizes) — round at the export
  boundary (`Math.round(v*100)/100`, guardrail 2).
