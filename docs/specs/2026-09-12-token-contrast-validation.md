# Colour contrast as a stop condition in the proof bundle

Status: planned
Reviewed: 2026-09-12 — needs revision
Date: 2026-09-12
Issue: #45
Builds on: `docs/specs/2026-09-12-verification-proof-bundle.md` (#110) — its store,
its derived/attested fork, and its stage vocabulary are the mechanism this uses
Plan: `2026-09-11-backlog-remediation-plan.md` §3 Phase 4, §4 Q3 ("rank #45 after
Phase 3"); ranked in #112 directly after #110

## Goal

The README has promised "automatic a11y validation when tokens and components are
created, so modes can't be built with poor color contrast" since before any of it
existed. Today `skills/token-builder/SKILL.md:259-265` states the contract in
prose — `text/onEmphasis` "must contrast with the emphasis fill in *every* mode" —
and nothing anywhere computes a ratio.

After this ships:

1. **A mode whose semantic text role fails contrast over its own surface stops the
   token build.** `token-builder` computes the declared pairs' ratios in every
   mode before it checkpoints the semantic tier, and does not advance past a
   failing pair without the user explicitly accepting it.
2. **The same failure is a derived rule in `verify:check`.** `color-contrast` is
   computed off the DTCG sources on every run, the fourth negative stop condition
   beside `orphan-token`, `state-incomplete` and `name-drift` — not a checker
   bolted on beside the gate.
3. **Both halves land as entries in the proof bundle**, in the shape #110 already
   defines: the Figma-side observation as the attested `contrast-baseline`, the
   CLI-side recomputation as the derived `color-contrast`. The pairing is exactly
   `state-baseline` (attested, in Figma) to `state-incomplete` (derived, off
   disk).
4. **`token-sync-layer` runs the gate before it records**, so a contrast failure
   stops a token sync rather than shipping into `packages/tokens/`.

## Non-goals

- **Component-level accessibility.** Focus indicators, status conveyed by more
  than colour (`references/component-doc-archetypes.md:83`), text alternatives —
  the issue calls these "a second, larger step" and they stay one. A follow-up
  issue, not this spec.
- **Reading Figma from the CLI.** Unchanged from #110: the gate is
  zero-dependency Node over files on disk, and everything only Figma can answer
  stays attested.
- **A second script or npm script.** No `tokens:check-contrast`. The rule lives in
  `verify-check.mjs`, which is what "an entry in the bundle, not a checker bolted
  on beside it" means in practice.
- **The doc card's surface-vs-variant-fill rule**
  (`references/figma-component-standards.md:338-344`). That is a token-*choice*
  check on one artboard, owned by the doc-card build; it is not a WCAG ratio over
  semantic roles.
- **A release.** No version bump, no `[Unreleased]` move, no tag.
- **Changing what `docs:check`, `adherence:check` or `tokens:validate-output`
  own.** None of them gains a colour rule.
- **Wiring `verify:check` into this plugin's own CI.** This repo has no
  `design-system.json`; the gate is a consumer's.

## Decisions

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| Where the check lives | A fourth **derived** rule, `color-contrast`, inside `scripts/verify-check.mjs`, computed off the `--tokens` DTCG sources. The colour maths and the pair table live in a new `scripts/lib/contrast.mjs`, exactly as the archetype baseline lives in `scripts/lib/component-states.mjs`. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The ranking comment on #45 is explicit: contrast sits after #110 "so each stop condition lands as an entry in it, not as a checker bolted on beside it". A rule that fails a build has one home in this repo, and `verify:check` is it. The table/resolver split is the shape `component-states.mjs` already set: the table is the thing a maintainer edits, the rule is the thing the gate runs. | A standalone `tokens:check-contrast` script — the bolt-on the ranking rules out. A rule inside `tokens:validate-output`, which asserts output *fidelity* to its source and would have to grow a second question. An advisory that only warns, which §3 Phase 3.2 of the plan rules out for negative conditions. |
| Derived, not attested, for the CLI half | `method: "derived"`. The stored result is a cache; `verify:check` recomputes the ratio off the DTCG source every run, and a disagreement is `proof-contradicted`. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #110's fork turns on one question: can the CLI look at the inputs? A contrast ratio over DTCG values is arithmetic over a file on disk — the most recomputable thing in the bundle. Recording it as attested would be the self-attestation the whole store exists to avoid (`references/proof-bundle.md:54-70`). | A contrast result trusted because a skill wrote it. A rule whose only evidence is an agent's word. |
| The Figma-time half, and what it is called | `token-builder` asserts the same pairs in Figma before it checkpoints the semantic tier, and records the result as the **attested** check `contrast-baseline`. Two names for two methods, never one name recorded both ways. | Recommended; accepted under Jordan's standing instruction (2026-09-11). This is the existing `state-baseline` / `state-incomplete` pairing, one layer down: the agent asserts in the place where the thing is built, the CLI re-derives independently off disk, and neither substitutes for the other (#110's "The executor's new assertion" row). Distinct names matter mechanically as well as editorially — `checkProof` compares stored derived results by check *name*, and a name recorded both ways in different stages would make the reference's check table ambiguous about which method it is. | Recording the Figma observation as `color-contrast` too. Leaving the Figma-time check as prose, which is the evaporating-check problem #110 exists to fix. Treating the CLI rule as a substitute for creation-time validation, when #45's whole point is catching it "at creation time rather than in review". |
| `token-builder` becomes a proof stage | `STAGES` grows to four: `component-builder`, `storybook-chromatic-builder`, `token-sync-layer`, `token-builder`. The new one is system-wide (subject `"system"`), so `PER_COMPONENT_STAGES` is unchanged and no `exempt` list applies to it. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #110's v1 vocabulary was chosen as "where the negative conditions' evidence is produced: the Figma build, the code build, and the token sync". Token *creation* is now such a place, so adding it satisfies that rule rather than contradicting it — and `references/proof-bundle.md:164-168` already anticipates the vocabulary changing, requiring only that the constant and the prose move together. The mechanics are all generic: a system-wide stage records with no `--subject`, omits `exempt`, and `checkProof` applies only the file-existence, fingerprint and derived-comparison checks to it. `token-builder` runs at folder stage with no repo, exactly like `component-builder`, and writes the manifest itself (Step 2 sets `tokens.primitivesBuilt`), so the recorder's "the manifest must already exist" precondition holds. | Leaving the Figma-side check unrecorded, so the bundle carries no evidence the strongest creation-time gate ever ran. Making `token-builder` per-component, which would mean nothing for a stage whose subject is the whole colour system. |
| Which pairs are checked | Eight, named explicitly in `CONTRAST_PAIRS`: `color.text.primary`, `color.text.secondary` and `color.text.link` each over `color.bg.default`; `color.text.onEmphasis` over `color.bg.emphasis`; `color.text.inverse` over `color.bg.inverse`; and `color.status.{success,warning,danger}.text` over that status's own `.bg`. A pair whose sides are not both present in a mode is **not evaluated** — it contributes nothing, neither pass nor failure. | Recommended; accepted under Jordan's standing instruction (2026-09-11). These are the pairs the system's own role definitions already assert a contract for (`skills/token-builder/SKILL.md:250-265`): a role named `onEmphasis` exists *because* it must be legible on `bg/emphasis`, and a status text role exists to sit on that status's background. Every one of them is a pair where a failure is unambiguously a bug rather than a design choice. The conservatism is `resolveArchetype`'s: exact matches only, abstain otherwise, so the rule produces no false failures on a system that names its roles differently. | Every `text/*` over every `bg/*`, which would fail `text/inverse` over `bg/default` — a pair that is *supposed* to have no contrast contract. Inferring pairs from names. Failing a system for not having a role. |
| Role paths are matched on a normalized fold | A pair side matches a token whose dotted path folds equal under `normalizeText` (lowercase, alphanumerics only), so `color.text.onEmphasis`, `color.text.on-emphasis` and `color.text.on_emphasis` are one role. | Recommended; accepted under Jordan's standing instruction (2026-09-11). `normalizeText` is already declared in `verify-check.mjs:50` for exactly this job, and `validate-token-output.mjs`'s `normalizeKey` — the same fold — exists because one role is spelled several ways across adapters. Folding costs nothing and removes a class of silent abstention where the rule looks green because it recognised nothing. | Exact string equality on the dotted path, which quietly disables the rule for a system that hyphenates. Fuzzy or prefix matching, which would pull in `color.text.onEmphasisSubtle`. |
| The threshold | WCAG 2.2 AA for normal text: **4.5:1**, one number, applied to every pair. AAA (7:1) is not reported at all. Large-text 3:1 is not applied. | Recommended; accepted under Jordan's standing instruction (2026-09-11). A gate that fails a build states the floor, and AA is the floor every accessibility policy this plugin's users answer to starts from. An AAA line is dropped for the reason #110 dropped `attested-only`: a line that prints for almost every system on almost every run carries no information. Large text is not applied because a colour role does not say what size it is used at — `text/primary` is body copy as well as headings, so 4.5:1 is the binding requirement for it anyway, and choosing 3:1 per role would need a fact the colour tier does not hold. | An AAA gate, which would fail correct, accessible systems. A permanent informational AAA line. A per-role size table the token system has no source for. |
| `text/disabled` is excluded | No pair involves `color.text.disabled`. Stated in the table's comment, with the reason. | Recommended; accepted under Jordan's standing instruction (2026-09-11). WCAG 1.4.3 exempts inactive user-interface components from the contrast minimum, and a disabled role is low-contrast *on purpose* — gating it would fail every correct system, which is the one direction a failing rule must never err in. This is the same posture as excluding `default` from the state baseline. | Failing a system for having a properly-muted disabled colour. |
| What a "mode" is | One `--tokens` file. Each file is evaluated as its own mode, with aliases resolved against the pool of every `--tokens` file and the file's own definitions winning — the exact rule `resolvedTokens` already applies (#121). The mode's label in the report is the file's basename minus its extension. | Recommended; accepted under Jordan's standing instruction (2026-09-11). It is the house model already: `findModeCollisions` (`lib/dtcg.mjs:205`) exists because "a token path defined in more than one source file with differing values means the build's source list spans modes"; `nativeSources` guards one build per mode from one explicit source list; `validate-token-output` is run once per mode block with that block's sources. Reusing it means a light/dark system passes `--tokens semantic.light.json --tokens semantic.dark.json --tokens primitives.json` and every pair is checked twice, once per mode, with primitives resolving across — which is precisely "must contrast in *every* mode". A single-file system is one mode and still checked. | A new `--mode` flag, when repeatable `--tokens` already carries the axis. Evaluating the merged `flat` that `gateMode` builds with `Object.assign`, which would check only whichever file was passed last — the light-only build `findModeCollisions` was written to stop, reintroduced inside the gate. Inferring modes from group names nested inside one file (Open questions). |
| Where the values come from | Reuse `resolvedTokens` from `validate-adherence.mjs` by exporting it and adding a `source` index to what it yields; reuse its `normalizeHex` and `rgbToHex` for comparability. No new resolver, no new colour parser. | Recommended; accepted under Jordan's standing instruction (2026-09-11). `verify-check.mjs:28` already imports `tokenPackageDirs` from that module for the same reason, both files are in the same install set, and its `main()` is guarded by the house `import.meta.url` idiom so importing runs nothing. The generator already encodes #121's hard-won rule — a file's own paths win over the pool, so two mode files defining one path each keep their own value — and writing a second one would mean two definitions of "what is this token worth in this mode" that can disagree. Adding a field to what it yields breaks nothing: all three existing consumers destructure the fields they use. | A second alias resolver in `lib/contrast.mjs`. A second hex parser, when `normalizeHex`/`rgbToHex` are already exported and already handle `#abc`, `#aabbccff` and `rgb()`. Moving `resolvedTokens` into `lib/dtcg.mjs` in this change, which is a larger refactor of a module with four consumers and is not needed to ship this. |
| Alpha | A **hex** alpha foreground (`#rrggbbaa`) is composited over its pair's background (`src-over`) and compared. A pair whose **background** carries alpha is skipped and counted. An `rgba()` foreground with a real alpha is not composited: `rgbToHex` (`validate-adherence.mjs:171-183`) returns `null` for it, so it lands in the non-hex skip count — #121's existing limit, inherited rather than re-litigated here. | Recommended; accepted under Jordan's standing instruction (2026-09-11). A translucent foreground over a known opaque background has one correct answer and roughly ten lines of arithmetic. A translucent background does not: what is behind it is a layout fact the token tier does not hold, and guessing it would produce a ratio nobody can check. Skipping *and counting* is #121's rule — the report shows the blind spot rather than hiding it. | Failing a pair for having alpha, which would fail correct systems using tinted status backgrounds. Compositing a translucent background over a guessed canvas colour. |
| Pairs the rule cannot compare | Skipped and counted on a `contrast:` report line, split into unresolvable, non-hex and alpha-background — the shape `validate-adherence.mjs:672` prints for colour tokens. All three counts are **pairs**, in the mode they were skipped in, not tokens: a broken alias on one side of `text/onEmphasis` in Dark is one unresolvable pair, and the same system's Light mode still reports its pair as compared. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #121 is the precedent and its reasoning transfers exactly: a colour the gate cannot compare is a hole in the check, and a number on the report is what stops the hole being mistaken for a pass. | A silent skip. Guessing at a value the resolver could not reach. |
| `nothing-verified` and inertness | The examined count gains the number of pairs evaluated, and a new failing class `contrast-rule-inert` fires when `color-contrast` ran and evaluated no pair at all — the same shape as `orphan-rule-inert`. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Without the first half, the token-sync invocation below (which skips the other three rules) would fail `nothing-verified` on a perfectly good system, because the existing counter sums candidates, records and built components — all three zeroed by `--skip`. Without the second, a system whose roles are named differently would report a clean contrast run having compared nothing, which is exactly the green-having-read-nothing outcome `nothing-scanned`, `orphan-rule-inert` and `dimension-rule-inert` all exist to stop. The upgrade cost is stated rather than discovered: `contrast-rule-inert` is a new failing class, so an existing consumer whose registered `verify:check` already passes `--tokens` but whose semantic roles are not spelled the way the table expects — a retrofit system, or one predating `token-builder`'s role set — goes red on upgrade with nothing changed on their side. That is `orphan-rule-inert`'s shape exactly, `--skip color-contrast` is the answer, and both the CHANGELOG bullet (Step 12) and the failure text (Step 4) have to say so. | A gate that passes because every rule was switched off. A contrast rule that recognises no role and calls it a pass. |
| Who records the derived result | `token-sync-layer`, which runs `verify:check` in its Step 5 before recording in Step 6 — making it the second stage that records derived results, and for the same stated reason as the first: it has the gate's output in hand rather than asserting it. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #110 named `storybook-chromatic-builder` the only such stage *because* it was the only one that ran the gate first, not as a property of the stage. The token sync is where DTCG sources land on disk, so it is the moment `color-contrast` is both computable and consequential, and its entry is already system-subject. `proof-contradicted` stays reachable for this rule, which is what keeps the `derived` label real. | Recording contrast under a component stage, where a system-wide colour property has no subject. An entry recorded without running the gate, which would be an attestation wearing a derived label. |
| What stops a token sync | A `color-contrast` failure stops it. Other failures in the same report — `proof-missing` for a component, `state-incomplete`, `proof-stale` — are surfaced to the user and in the PR body, but do not stop the sync. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The sync owns the token tier and nothing else. A token sync blocked because some component's storybook entry is missing is the false wall #110's whole adoption decision was written to avoid, and it would teach users to stop reading the report. The rule the sync owns is the one that stops it. | A sync gated on the gate's exit code, which imports every other stage's state into a token change. A contrast failure that only warns, which is the advisory the plan rules out. |
| Which rules the sync's gate run skips | `--skip orphan-token --skip state-incomplete --skip name-drift`, stated with the reason in the skill. | Recommended; accepted under Jordan's standing instruction (2026-09-11). `orphan-token` in particular would fail nearly every sync that does its job: a sync that adds a token is adding one nothing in the repo names yet, which is the rule's definition of an orphan. The component rules are about records and code surfaces the sync does not touch. `--skip` is the house answer for a rule a run cannot apply, it prints on the report's `skipped:` line, and `checkProof` already declines to compare a recorded derived result whose rule was skipped — so the storybook stage's cached results are not contradicted by a run that never computed them. | Running the full gate at sync time and teaching people to ignore its output. Dropping `--tokens`, which would switch contrast off silently along with `orphan-token`. |
| The override path in Figma | `token-builder` stops on a failing pair, reports the ratio and the roles in guide voice, and recommends the fix (re-point that mode's alias at a primitive with more separation). If the user explicitly accepts the failure anyway, the skill records `contrast-baseline` with `result: "fail"`, names the acceptance in `advancedBecause`, and lists the accepted pairs structurally as `accepted: [{ fg, bg, mode }]` on that check. **The acceptance travels in the bundle, and the sync subtracts it**: `token-sync-layer` runs the gate exactly as it always does, then drops from the `color-contrast` failures any whose `(fg, bg, mode)` triple matches a recorded accepted entry, comparing on the same normalized fold the rule itself uses. Nothing left → the sync proceeds and says in one line, and in the PR body, which pair it is not re-litigating. Anything left → it stops as normal. The repo's registered CI `verify:check` is the storying skill's to handle: when `storybook-chromatic-builder` wires that script it reads the same entry and registers `--skip color-contrast` with the reason inline, rather than asking the user to remember a hand-edit to a script that does not exist yet at token-build time. | Recommended; accepted under Jordan's standing instruction (2026-09-11). It is the user's brand and their call; what the plugin owes them is that the call is explicit, recorded, and that its downstream cost is stated before they make it rather than discovered at the next sync. Routing the escape hatch through the bundle is what makes the promise reachable: the sync's gate run is constructed by the skill, not by an npm script, so a `--skip` "registered in the repo" could never reach it — and at first sync there is nothing registered to reach, because the docs install set arrives with `storybook-chromatic-builder`, which runs *after* the sync in the pipeline (`README.md:134-141`). Reading the acceptance off the store keeps the decision where it was made and visible in the sync's own message and in the PR body, and keeps the gate itself dumb: no attested `fail` ever switches a derived rule off inside `verify-check.mjs`. **Subtracting matched failures rather than skipping the run is what makes "only an accepted one" true of the mechanism and not merely of this sentence.** An acceptance is about one pair in one mode; switching the rule off for the sync would carry every *other* pair through unchecked too — including one introduced in Figma after the acceptance was given — which is a silent hole in the only rule that invocation has live. Subtraction also retires itself: a pair the user later fixes stops appearing in the failures, so there is nothing left to match and nothing to clean up, where a skip would stay in force until somebody thought to re-run `token-builder`. And because the run actually happens, the entry records `color-contrast` as a real derived result instead of omitting it, which keeps `proof-contradicted` reachable on the path the design intends. The triple is matched exactly, so a stale or malformed `accepted` entry matches nothing and the sync stops — the safe direction to fail in. | A silent override. A hard stop with no path forward, which a plugin that does not own the brand cannot justify — and which is what "register `--skip color-contrast`" alone would have delivered, since nothing registered reaches the sync's own invocation. An override that leaves no trace in the bundle. A gate that reads an agent's attested failure and disables its own rule, which is the self-attestation the store exists to avoid. **An acceptance that silences contrast for every later sync**, carrying a pair introduced after it straight through unchecked. **An acceptance that has to be retired by hand** once the pair is fixed. An override recognised by parsing prose. |
| Install and registration | `lib/contrast.mjs` joins the **Documentation scripts — install as a set** table in `scripts/README.md` with `—` in the npm column. The set goes from eleven files to **twelve**; the script count stays **five**. | Recommended; accepted under Jordan's standing instruction (2026-09-11). It is imported by `verify-check.mjs`, so `ci/validate-install-sets.mjs`'s closure check requires it in the table, and `countProblems` will fail the build on every stale count claim — `scripts/README.md:37` and `skills/storybook-chromatic-builder/SKILL.md:36` — which is the mechanism that exists because a script shipped without its registration twice (#103, #105). | A new npm script for a module nothing invokes directly. A fourth install set. |
| README roadmap | Narrow the "Built-in accessibility checks" bullet to what will then be true: colour contrast validated when tokens are created and again when they sync, component-level accessibility still ahead. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The bullet is the promise #45 was filed against, and half of it comes true here. Leaving it whole would keep overclaiming the component half; the same correction was made for the native-validation line when #37 changed the fact behind it. | Deleting the bullet, which would drop a real roadmap item. Leaving a promise that is now half-shipped and still reads as neither. |
| CHANGELOG | One bullet under `[Unreleased]` → Added, in the register of the `verify:check` entry above it, naming the rule, the pair table, the mode model, the two stages that record it and the `--skip` escape hatch. | Recommended; accepted under Jordan's standing instruction (2026-09-11). It is a user-facing capability and a change to the stage vocabulary skills write into. No schema bump: `verification` already exists at `schemaVersion` 7 and gains no field. | Folding it into the #110 entry. Any version bump or `[Unreleased]` move. |
| Evidence | An e2e note built from a real fixture, with a discriminating control for every rule whose pass condition is an absence, plus `## What shipped` here. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #77's rule, now in `ci/README.md:69-99`: an absence cannot report on itself, and the control that matters most here is a two-mode fixture that passes in Light and fails in Dark — the exact claim the rule makes and the one a merged-modes implementation would silently get wrong. | Unit-test counts as end-to-end evidence. A green run with no case that must fail. |

## Open questions

- **`bg/subtle` and `bg/muted` as text surfaces.** `text/primary` on a subtle or
  muted surface is extremely common and a real failure mode, but a system is free
  to use those roles for non-text surfaces, so pairing them would risk the first
  false failures in the table. **I'd recommend adding them after the rule has been
  measured against a real system** (the same measure-then-narrow discipline the
  colour rule got in #123), not before. Unresolved.
- **AAA (7:1).** Reported informationally, offered as an opt-in flag, or left out.
  **I'd recommend leaving it out until someone asks** — v1's argument against a
  standing informational line stands, and an opt-in flag with no user is
  speculative. Unresolved.
- **Non-text contrast (WCAG 1.4.11).** `border/focus` and `border/emphasis` owe
  3:1 against the surface they sit on, which is a different threshold and a
  different pair shape. **I'd recommend a second table once the text table has
  been measured** — the focus ring's surface is more variable than a text role's,
  so the abstention rules need thought. Unresolved.
- **Compositing a translucent background.** A `status/*/bg` carrying alpha is
  skipped today. **I'd recommend compositing it over `color.bg.default`** if
  measurement shows the skip counts are material — the table already knows the
  canvas role — but not before, because it is a guess about layering. Unresolved.
- **A DTCG source that nests modes inside one file.** The mode model is one file
  per mode. A source that expresses modes as groups inside a single file
  (`color.light.*` / `color.dark.*`) would present as one mode whose role paths do
  not match the table, so the rule abstains and says so via
  `contrast-rule-inert`. **I'd recommend leaving it abstaining** until such a
  source actually appears; guessing a mode axis out of group names is how a rule
  starts failing correct systems. Unresolved.
- **Component-level accessibility** — focus indicator presence, status conveyed by
  more than colour, text alternatives. The issue's stated second step. **I'd
  recommend its own item after this ships**, designed against
  `references/figma-component-standards.md:146-166` and
  `references/component-doc-archetypes.md:83`. Unresolved.
- **How noisy the rule is on a real system.** Reasoned about and fixture-tested,
  not measured against a shipped design system. **I'd recommend measuring it
  against `throughline-ds` once it is wired**, and narrowing the table rather than
  downgrading the rule if it is noisy — §4 Q7's app, and #123's outcome. Unresolved.

## Plan

Everything runs from the repo root on branch `feat/45-token-contrast-validation`.

New code goes in `scripts/lib/contrast.mjs` and `scripts/verify-check.mjs`. Every
new test goes in the matching `*.test.mjs` beside it, in the existing style:
`node:test`, `assert/strict`, inline fixtures, `mkdtempSync` temp dirs
(`scripts/verify-check.test.mjs` is the model, and its `runCli` / `fixture` /
`gate` helpers at `:127-243` are what CLI tests build on). **No existing test may
be edited** — new tests may be added to an existing file, but if an existing one
fails, a shared module's behaviour changed and that is a bug in the step.

**One carve-out, named here because Step 4 walks straight into it.** The shared
`gate` helper (`scripts/verify-check.test.mjs:236`) runs every CLI test over the
shared `TOKENS` fixture (`:136-144`), which defines `color.blue.500`,
`color.bg.primary` and `color.bg.canvas` — no side of any pair in
`CONTRAST_PAIRS`. The moment Step 4 adds `contrast-rule-inert`, that fixture is
precisely the system the new class is designed to fail, and the six existing
tests asserting a clean run exits `0` (`:255`, `:262`, `:296`, `:317`, `:348`,
`:378`) go red by design rather than by regression. **Change the helper, not the
tests**:

```js
// The shared fixture names none of the colour roles CONTRAST_PAIRS checks, so
// color-contrast would abstain and fail contrast-rule-inert on every CLI test
// here. That rule has its own fixture and its own invocations below.
const gate = (root, extra = []) =>
  runCli(['--root', root, '--tokens', tokensPath(root), '--skip', 'color-contrast', ...extra]);
```

No test body changes, and the flag is the same one the Decisions already tell a
consumer whose roles are spelled differently to register — the helper hides
nothing this spec does not state. The new CLI tests in Step 4 call `runCli`
directly rather than `gate`, because they need the rule live.

Do **not** extend `TOKENS` with the eight roles instead. Every semantic token
added there becomes an orphan in the existing `orphan-token` tests unless
`generatedCss` and `apps/web/app.css` grow with it, which is a far larger edit to
a fixture most of the file depends on, to make one rule fire.

Run the full CI set after any step that touches code or a skill, each as its own
command:

```sh
node --test
node ci/validate-plugin.mjs
node ci/validate-skills.mjs
node ci/validate-install-sets.mjs
node scripts/adapters/generate.mjs --check
node scripts/build-doc-card-builder.mjs --check
node scripts/build-native-adapter-config.mjs --check
```

### Step 1 — The contrast module: WCAG maths and the pair table

Files: `scripts/lib/contrast.mjs` (new), `scripts/lib/contrast.test.mjs` (new)

Change: a zero-dependency module, in the shape and comment register of
`scripts/lib/component-states.mjs`. Header comment naming this spec, stating that
the source of truth for the prose contract is `skills/token-builder/SKILL.md:250-265`,
and marked MAINTENANCE: a change to the semantic role set must change this table.

Export:

- `AA_NORMAL_TEXT = 4.5` — the one threshold, WCAG 2.2 AA for normal text.
- `CONTRAST_PAIRS` — an ordered array of
  `{ fg, bg, threshold, why }` with `threshold: AA_NORMAL_TEXT` on every entry:
  1. `color.text.primary` on `color.bg.default`
  2. `color.text.secondary` on `color.bg.default`
  3. `color.text.link` on `color.bg.default`
  4. `color.text.onEmphasis` on `color.bg.emphasis`
  5. `color.text.inverse` on `color.bg.inverse`
  6. `color.status.success.text` on `color.status.success.bg`
  7. `color.status.warning.text` on `color.status.warning.bg`
  8. `color.status.danger.text` on `color.status.danger.bg`

  `why` is one short sentence per pair, printed nowhere but read by the next
  maintainer — e.g. for pair 4, "the role exists because it sits on the emphasis
  fill; that is the whole reason it is not `text/inverse`".
- `relativeLuminance(rgb)` — WCAG 2.x sRGB relative luminance over
  `{ r, g, b }` channels in 0–255: channel `c/255`, then
  `c <= 0.03928 ? c/12.92 : ((c + 0.055)/1.055) ** 2.4`, then
  `0.2126 R + 0.7152 G + 0.0722 B`.
- `contrastRatio(hexA, hexB)` — `(lighter + 0.05) / (darker + 0.05)` over the two
  luminances. Takes two `#rrggbb` strings (no alpha; the caller composites first)
  and returns the raw ratio, unrounded.
- `parseHex(hex)` → `{ r, g, b, a }` with `a` in 0–1 from a `#rrggbb` or
  `#rrggbbaa` string, `null` for anything else.
- `composite(fgHex, bgHex)` → the `#rrggbb` of `fg` drawn over `bg` with src-over
  (`out = fg*a + bg*(1-a)`), rounded per channel. Returns `bgHex` unchanged when
  the foreground is fully transparent, and `fgHex` when it is fully opaque.

Put a comment above `CONTRAST_PAIRS` stating, with reasons: that `text/disabled`
is excluded because WCAG 1.4.3 exempts inactive components and a disabled role is
deliberately low-contrast, so gating it would fail correct systems; that
`bg/subtle` and `bg/muted` are deliberately not paired in v1 (Open questions);
that `border/*` needs the 3:1 non-text threshold and is a separate table; and that
one threshold is applied because a colour role does not say what text size it is
used at.

Tests, inline fixtures:
- `contrastRatio('#000000', '#ffffff')` → `21` (within 1e-9); `('#ffffff', '#ffffff')` → `1`.
- The pair that straddles the threshold, both sides, in one test:
  `('#767676', '#ffffff')` is ≥ 4.5 and `('#777777', '#ffffff')` is < 4.5. This is
  the discriminating pair for the whole rule — assert both.
- `contrastRatio` is symmetric: swapping the arguments gives the same number.
- `parseHex('#abc')` → `null` (the caller normalizes first, so only 6- and 8-digit
  forms reach here); `parseHex('#00000080')` has `a` ≈ 0.502.
- `composite('#ffffff80', '#000000')` → `'#808080'` (±1 per channel);
  `composite('#ffffff00', '#123456')` → `'#123456'`;
  `composite('#ffffffff', '#000000')` → `'#ffffff'`.
- `CONTRAST_PAIRS` has 8 entries, every `threshold` is `AA_NORMAL_TEXT`, no `fg`
  mentions `disabled`, and every entry has a non-empty `why`.

Verify: `node --test` → the new file's tests pass, suite green.

### Step 2 — Expose the per-mode resolved values

Files: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`

Change: two lines of production code, no behaviour change.

1. Add `export` to `function* resolvedTokens(dicts)` (`scripts/validate-adherence.mjs:256`).
2. Add a `source` field to both `yield` statements inside it, carrying the index
   `i` of the dict the token came from — `yield { path, type: types[path], resolves: false, source: i }`
   and the resolving equivalent. Nothing else in the function changes.

Put one sentence in the comment above it saying the `source` index is what lets a
caller group a system's tokens by mode, since one `--tokens` file is one mode, and
naming `scripts/verify-check.mjs` as that caller.

All three existing consumers — `buildTokenValues` (`:238`), `skippedColourTokens`
(`:283`) and `buildDimensionValues` (`:395`) — destructure only the fields they
use and are unaffected by a new key. Do not touch any other function in this
file.

Tests: add one new test to `scripts/validate-adherence.test.mjs` (do not edit any
existing test) asserting that `resolvedTokens` over two dicts — a primitives dict
and a semantic dict aliasing into it — yields the semantic token with `source: 1`
and the primitive with `source: 0`, and that the semantic token resolves through
the cross-file pool.

Verify: `node --test` → the new test passes and every existing
`validate-adherence` test still passes, which is what proves this was additive.

### Step 3 — The derived rule, as a pure function

Files: `scripts/verify-check.mjs`, `scripts/verify-check.test.mjs`

Change: the pure half. Import `AA_NORMAL_TEXT`, `CONTRAST_PAIRS`, `contrastRatio`,
`parseHex` and `composite` from `./lib/contrast.mjs`, and `normalizeHex`,
`rgbToHex` from `./validate-adherence.mjs` (which this file already imports
`tokenPackageDirs` from).

Export `checkContrast({ modes })` → `{ failures, skipped, pairs }`, where `modes`
is an array of `{ mode, values, unresolved }` — `mode` a label string, `values` a
`Map` from dotted token path to its resolved raw value, and `unresolved` a `Set`
of the dotted paths that mode defines but whose alias chain did not resolve. All
three are built by the caller in Step 4.

For each mode, for each entry in `CONTRAST_PAIRS`:

- Find each side by **normalized path**: build the mode's lookup once as a `Map`
  from `normalizeText(path)` to its value, and a second normalized `Set` from
  `unresolved`. Look up `normalizeText(pair.fg)` / `normalizeText(pair.bg)`. A
  side present in neither means the pair is **not evaluated** in this mode — not
  counted, not skipped, not failed.
- A side the mode defines but could not resolve (present in the normalized
  `unresolved` set) skips the pair, counted as `unresolvable`. The count is of
  **pairs**, in the mode that could not be compared — not of tokens, so the three
  numbers on the `contrast:` line are all in the same unit.
- Convert each remaining side with `normalizeHex(value) ?? rgbToHex(value)`. A
  side that comes back `null` skips the pair, counted as `nonHex`. `rgbToHex`
  returns `null` for an `rgba()` with a real alpha, so a translucent `rgba()`
  foreground lands here rather than being composited — #121's limit, carried
  forward deliberately.
- If the background has alpha (`parseHex(bg).a < 1`), skip the pair, counted as
  `alphaBackground`.
- If the foreground has alpha, `composite` it over the background first.
- Compute `contrastRatio`; increment `pairs`. When the ratio is below
  `pair.threshold`, push
  `{ rule: 'color-contrast', mode, fg: pair.fg, bg: pair.bg, fgValue, bgValue, ratio, threshold: pair.threshold }`.

`skipped` is `{ unresolvable, nonHex, alphaBackground }` summed across modes,
every one of them a pair count; `pairs` is the count of pairs actually compared
across all modes — the number `nothing-verified` reads in Step 4.

Put a comment above `checkContrast` stating: that a pair is evaluated once per
mode and must clear in every one of them, so a system that passes in Light and
fails in Dark fails; that a pair whose roles are absent abstains rather than
passing, which is why `contrast-rule-inert` exists; and the alpha rule with its
reason (a translucent foreground has one correct answer over a known background; a
translucent background does not, because what is behind it is a layout fact the
token tier does not hold).

Tests, inline fixtures built as plain `Map`s:
- **The mode claim, which is the whole rule.** Two modes over the same pair —
  `light` where `color.text.onEmphasis` is `#ffffff` on `#1d4ed8`, and `dark`
  where it is `#94a3b8` on `#1d4ed8`: exactly one failure, naming `dark`, with
  `ratio` below 4.5 and the light mode absent from the failures.
- A single mode where every pair present clears → no failures, `pairs` equal to
  the number of pairs the fixture defines.
- A hyphenated spelling (`color.text.on-emphasis`) is matched by the normalized
  fold and still fails when it should.
- A mode defining only `color.text.primary` and no `color.bg.default` → no
  failures, `pairs` 0 (the abstention case).
- An empty `modes` array → no failures, `pairs` 0.
- A translucent foreground (`#ffffff80`) over an opaque background is composited,
  not skipped — assert it is compared (`pairs` 1) and that the ratio matches
  `contrastRatio(composite(...), bg)`.
- A translucent background (`#1d4ed880`) skips the pair and increments
  `skipped.alphaBackground`.
- A non-hex value (`var(--x)`) skips the pair and increments `skipped.nonHex`,
  and so does a translucent `rgba(255, 255, 255, 0.5)` foreground — the case the
  Alpha decision calls out, asserted so the limit is pinned rather than assumed.
- A pair with one side in `unresolved` skips and increments
  `skipped.unresolvable`, with `pairs` 0 — and the *other* mode of the same
  fixture, which resolves, still reports `pairs` 1. That pairing is what proves
  the count is per pair per mode.

Verify: `node --test` → the new tests pass, suite green.

### Step 4 — Wire the rule into the gate, the report and the store vocabulary

Files: `scripts/lib/proof.mjs`, `scripts/lib/proof.test.mjs`,
`scripts/verify-check.mjs`, `scripts/verify-check.test.mjs`

Change, in `scripts/lib/proof.mjs`: add `'color-contrast': 'system'` to
`DERIVED_RULE_SCOPE`, with a one-line comment saying contrast is a property of the
token system as a whole, not of any component, so a recorded result is compared
against the rerun system-wide — the same scope `orphan-token` has.

Also extend `entryProblems`: when a check carries `accepted`, it must be an array
of objects each with non-empty string `fg`, `bg` and `mode`. Absent is fine — the
field is optional and only `contrast-baseline` uses it. Validate it because it is
load-bearing: `token-sync-layer` subtracts these triples from real failures
(Step 9), so a malformed one is the difference between a pair the user accepted
and a pair nobody has seen. Reject it at the recorder rather than letting the
sync silently match nothing. Tests: a check with a well-formed `accepted` returns
`[]`; one whose `accepted` is an object, or holds an entry missing `mode`, each
return one problem naming the check index.

Change, in `scripts/verify-check.mjs`:

- **Imports**: add `resolvedTokens` to the existing `./validate-adherence.mjs`
  import (`:28`, which already brings in `tokenPackageDirs` and which Step 3
  extended with `normalizeHex` and `rgbToHex`). Step 2 is what made it
  importable.
- **Header comment**: add `color-contrast` and `contrast-rule-inert` to the
  Failing list.
- **`gateMode`**: keep the parsed token dicts, not only the merged `flat`. Build
  the modes array once:
  ```js
  const dicts = values.tokens.map((file) => readJson(file, 'a token source'));
  ```
  (merge into `flat` from those same dicts, so each file is still read once), then
  group `resolvedTokens(dicts)` by its new `source` index into one
  `{ mode, values, unresolved }` entry per file, `mode` being
  `basename(file).replace(/\.[^.]+$/, '')`. A token whose `resolves` is `true`
  goes into `values`; one whose `resolves` is `false` goes into that mode's
  `unresolved` set instead, so `checkContrast` can count the *pair* it broke
  rather than the gate counting loose tokens. Nothing here counts unresolvable
  tokens for the report — the report's `unresolvable` number comes back from
  `checkContrast` as a pair count.
- Run the rule unless skipped, exactly as the other three are run:
  ```js
  if (!skipped.has('color-contrast')) {
    const contrast = checkContrast({ modes });
    derived.push(...contrast.failures);
    contrastPairs = contrast.pairs;
    contrastSkipped = contrast.skipped;
  }
  ```
  With no `--tokens`, `color-contrast` is added to `skipped` alongside
  `orphan-token` — there is no token source to read, so the rule is absent rather
  than passed. Extend the existing comment there to say both rules.
- **`nothing-verified`**: add `(skipped.has('color-contrast') ? 0 : contrastPairs)`
  to the `examined` sum, with a comment saying a contrast pair is a subject the
  same way a token candidate is, and that without this a run which skips the other
  three rules — which is exactly how `token-sync-layer` invokes the gate — would
  fail `nothing-verified` on a healthy system.
- **`contrast-rule-inert`**: push `{ rule: 'contrast-rule-inert' }` when
  `color-contrast` ran and `contrastPairs === 0`. Both it and `nothing-verified`
  can fire on the same run, as `orphan-rule-inert` already can.
- **`formatReport`**: add `${s.modes} token mode(s)` to the headline count line,
  and a `contrast:` line after the `excluded:` lines, in the shape
  `validate-adherence.mjs:672` uses:
  `  contrast:     <n> pair(s) compared across <m> mode(s), <x> skipped as unresolvable, <y> skipped as non-hex, <z> skipped for a translucent background`.
  Print it only when `color-contrast` was not skipped. All four numbers are pairs
  in the mode they occurred in, which is why the line says "pair(s)" once and
  means it across the whole line.
- **`failureDetail`**: add the two classes, each naming what to do, as every rule
  does:
  - `color-contrast` →
    `` `${f.fg} on ${f.bg} is ${f.ratio.toFixed(2)}:1 in ${f.mode} (${f.fgValue} on ${f.bgValue}) — WCAG AA needs ${f.threshold}:1 for normal text. Re-point one side of the pair at a primitive with more separation in that mode; the pair has to clear in every mode, not on average.` ``
  - `contrast-rule-inert` → `'no token source held both sides of any checked colour pair, so color-contrast compared nothing. Pass the --tokens file that holds the semantic colour tier, or --skip color-contrast if this system names its roles differently.'`

Tests in `scripts/lib/proof.test.mjs` (new tests only): `DERIVED_RULE_SCOPE`
carries `color-contrast` as `'system'`, and every key in it is a rule name the
gate can produce.

Tests in `scripts/verify-check.test.mjs`, using the existing `fixture` and
`runCli` helpers and adding a two-mode token fixture. **These call `runCli`
directly, not `gate`** — the preamble's carve-out gives `gate` a standing
`--skip color-contrast`, and every test below needs the rule live:
- **The end-to-end mode claim, both ways, in one test.** A fixture with
  `dtcg/semantic.light.json` and `dtcg/semantic.dark.json` (plus primitives) whose
  pairs all clear → exit `0`, and the report's `contrast:` line names 2 modes.
  Then re-point the dark file's `color.text.onEmphasis` at a low-contrast
  primitive → exit `1`, with a `color-contrast` line naming `semantic.dark`. The
  only difference between the two runs is one value in one mode, which is the
  claim.
- A run over a single `--tokens` file with no colour roles the table knows exits
  `1` with `contrast-rule-inert`.
- `--skip color-contrast` on that same fixture removes both the failure and the
  `contrast:` line, and `color-contrast` appears on the `skipped:` line.
- A run with `--skip orphan-token --skip state-incomplete --skip name-drift` over
  a fixture with contrast pairs exits `0` and does **not** report
  `nothing-verified` — the regression for the token-sync invocation. Assert the
  absence of that rule name in the output, not just the exit code.
- An entry recording `color-contrast` as `pass` for a system whose rerun fails it
  exits `1` with `proof-contradicted`.

Verify: `node --test` → all pass, suite green. Then run the gate by hand against
the two-mode fixture and read the report: the headline counts modes, the
`contrast:` line counts pairs, and the failure line names the mode.

### Step 5 — `token-builder` joins the stage vocabulary

Files: `scripts/lib/proof.mjs`, `scripts/lib/proof.test.mjs`

Change: add `'token-builder'` to `STAGES`. Do **not** add it to
`PER_COMPONENT_STAGES` — its subject is `"system"`, like `token-sync-layer`.
Extend the comment above `STAGES` to say that a change here must also update
`references/proof-bundle.md`'s stage table (it already says this; keep it true).

Tests (new tests only): `STAGES` contains `token-builder`,
`PER_COMPONENT_STAGES` does not, and every member of `PER_COMPONENT_STAGES` is in
`STAGES`.

Verify: `node --test` → green. Then
`node scripts/verify-check.mjs --record --stage token-builder --entry <tmp>.json --root <tmp fixture>`
against a throwaway fixture with a `design-system.json`: it records under subject
`system`, writes no `exempt` key, and stamps `verification.stages['token-builder']`.

### Step 6 — The contract document

Files: `references/proof-bundle.md`

Change, in the plain reference register the file already uses:

- **The stage vocabulary table** gains a row: `token-builder` → `"system"`. Keep
  the sentence naming `PER_COMPONENT_STAGES` as the machine-readable copy of the
  split.
- **The check names table** gains two rows: `contrast-baseline` (attested,
  recorded by `token-builder`) and `color-contrast` (derived, recorded by
  `token-sync-layer`).
- **The paragraph under that table** currently says
  `storybook-chromatic-builder` is the *only* stage that records derived results.
  Rewrite it to say there are now two, and that both qualify for the same reason
  and only that reason: each runs `verify:check` before it records, so it has the
  result in hand rather than asserting it. Keep the existing sentence explaining
  why `component-builder` records attested checks only (folder stage, no repo to
  scan). `token-sync-layer` moves out of that sentence, since it now records one
  derived result.
- **A short subsection** after the check-names table, `### Contrast: two checks,
  two methods`, stating: `contrast-baseline` is the ratio an agent computed in
  Figma from resolved variable values per mode, attested because the CLI cannot
  read Figma; `color-contrast` is the same question recomputed off the DTCG source
  by `verify:check`, derived because it can be. Neither substitutes for the other,
  and this is the same pairing as `state-baseline` / `state-incomplete`.
- **The entry shape section** (`:34-52`) gains the optional `accepted` field, and
  this is where it is defined: a check may carry
  `accepted: [{ fg, bg, mode }]`, listing pairs a user explicitly accepted as
  failing. Only `contrast-baseline` uses it today. State what reads it and how —
  `token-sync-layer` subtracts an exactly-matching `(fg, bg, mode)` triple from
  that sync's `color-contrast` failures, and `storybook-chromatic-builder` uses
  its presence to decide whether the registered `verify:check` carries
  `--skip color-contrast` — and state the rule that keeps it honest: **it is data
  a caller subtracts, never something `verify-check.mjs` reads**. The gate does
  not know the field exists; an attested result never switches a derived rule off
  inside the gate. Say too that a triple which no longer matches any failure is
  inert, which is how an acceptance retires when the pair is fixed.

Reference other files as `${CLAUDE_PLUGIN_ROOT}/references/<file>.md`.

Verify: `node ci/validate-skills.mjs` → passes, and its success line counts the
reference docs it read (the JSON block in this file must still parse). Read the
edited sections back against `scripts/lib/proof.mjs` and confirm the stage list
and the check table match the constants exactly.

### Step 7 — The install set and its stated counts

Files: `scripts/README.md`, `skills/storybook-chromatic-builder/SKILL.md`

Change, in `scripts/README.md`:

- A row in the main script table, next to `lib/proof.mjs` and
  `lib/component-states.mjs`: `lib/contrast.mjs` — "The WCAG contrast maths and the
  semantic colour pairs behind `color-contrast` — which text role must clear which
  surface, in every mode, and where the rule deliberately abstains." Installed as:
  `copied alongside verify-check.mjs`.
- A row in the **Documentation scripts — install as a set** table:
  `lib/contrast.mjs` | `— (imported by the above)`.
- `scripts/README.md:37` — "the same **eleven** files and register the same
  **five**" → **twelve** and **five**. The script count does not move; only the
  file count does. Leave `:55` ("all five npm scripts") alone.
- The `verify-check.mjs` usage paragraph (`:129-153`) gains the new rule: the
  failing list gains `color-contrast` and `contrast-rule-inert`; one short
  paragraph states that a `--tokens` file is a mode, that a pair must clear in
  every mode, that a pair whose roles are absent abstains rather than passing
  (hence `contrast-rule-inert`), that the threshold is WCAG AA 4.5:1 for normal
  text, that `text/disabled` is excluded because WCAG 1.4.3 exempts inactive
  components, and that a translucent foreground is composited while a translucent
  background is skipped and counted. Name `--skip color-contrast` as the escape
  hatch for a system whose roles are named differently.
- One sentence in the placeholder paragraph at `:57-62`, next to the existing
  warning about dropping `--tokens`: the registered form carries a single
  `dtcg/tokens.json`, and a system with more than one mode file registers **one
  `--tokens` per mode file**, because one file is one mode. Registering a
  multi-mode system with one file leaves a script that checks Light and reports
  that it checked one mode — quieter than the dropped-`--tokens` failure above it
  and just as wrong.

Change, in `skills/storybook-chromatic-builder/SKILL.md:35-36`: "copy the eleven
files and register the five npm scripts" → "copy the twelve files and register the
five npm scripts". Extend the `verify:check` substitution sentence at `:41` — the
one that already says `--root` and `--tokens` need the repo's real values — with
the mode rule: one `--tokens` flag per mode file, since `color-contrast` checks
each file as its own mode and a single-file registration silently checks only
one. Change nothing else in that paragraph — the table is the single source of
truth for the list, as it already says.

**Three more changes in that file, all of which go untrue the moment this
merges.** They are here because this is the step that already edits it:

- `:260`, in the Step 5.5 wiring paragraph: "All three rules (`orphan-token`,
  `state-incomplete`, `name-drift`) go live now" → four, naming `color-contrast`,
  and noting that its escape hatch is `--skip color-contrast` on the same terms
  as `--skip orphan-token` beside it.
- `:339`, in the Step 7 recording paragraph: "This is the one stage that records
  derived results" → it is now one of two, and for the same reason — it runs the
  gate before it records. Point at `references/proof-bundle.md`, which Step 6
  corrects in the same way, rather than restating which the other stage is.
- **Step 5.5 gains the accepted-pair read**, which is what stops this skill's
  mandatory gate run from becoming a wall the user cannot pass. Before wiring the
  script, read `design-system/proof/token-builder.json` under the repo root: when
  its `system` entry's `contrast-baseline` carries a non-empty `accepted`,
  register `verify:check` with `--skip color-contrast`, and say in one line that
  contrast is skipped in CI because a pair was accepted when the mode was built,
  naming the pair and that removing the flag is what re-enables the rule once it
  is fixed. This skill is where the registered script is created, so it is the
  only place that can apply the consequence — `token-builder` runs at folder
  stage, before any repo, and cannot edit a `package.json` that does not exist.
  Without this, Step 5.5's "confirm it passes before handing off" is a hard stop
  on a path the Override decision says is supported.

Verify: `node ci/validate-install-sets.mjs` → passes, and its output line reports
`docs set (12 files)`. This step is the one most likely to fail that gate: it
checks the import closure and every stated count in both files.

### Step 8 — `token-builder` asserts contrast and records it

Files: `skills/token-builder/SKILL.md`

Change, in **Step 3**, after the existing "Verify the aliases resolve" paragraph
and before the checkpoint:

- Add a **contrast assertion** paragraph. Using the same
  `figma_get_variables` read (filtered to `Color/Semantic`,
  `resolveAliases: true`) that already verifies the aliases, convert Figma's 0–1
  RGBA channels to hex, then **run the shipped module rather than doing the
  arithmetic in the transcript**: shape the per-mode values as
  `[{ mode, values: { "<dotted token path>": "#rrggbb" } }]` and pass them to a single
  `node` invocation that imports `CONTRAST_PAIRS`, `contrastRatio`, `composite`
  and `AA_NORMAL_TEXT` from
  `${CLAUDE_PLUGIN_ROOT}/scripts/lib/contrast.mjs` and prints one line per pair
  per mode — e.g.
  `node --input-type=module -e "<import, read JSON from process.argv[1], loop CONTRAST_PAIRS × modes, print mode/fg/bg/ratio>" '<the JSON>'`.
  The module is being shipped precisely so the maths has one home; the skill
  reads the table and calls the function, and restates neither. The pairs are
  named by their semantic roles (`text/onEmphasis` on `bg/emphasis`,
  `text/primary` on `bg/default`, each status text on its own status
  background); a role the system does not have is not asserted.
- **The keys are dotted token paths, not Figma variable names.** Figma calls the
  role `text/onEmphasis` in the `Color/Semantic` collection; `CONTRAST_PAIRS`
  spells it `color.text.onEmphasis`, and no normalized fold bridges the two —
  `colorsemantictextonemphasis` is not `colortextonemphasis`. Apply the name
  mapping the sync already defines (`${CLAUDE_PLUGIN_ROOT}/skills/token-sync-layer/SKILL.md`,
  the **Name mapping** rule): the category drives the top-level group and the
  tier is dropped, so `Color/Semantic` + `text/onEmphasis` → `color.text.onEmphasis`.
  Point at that rule rather than restating it. Both halves of this check have to
  agree on the spelling, or the Figma-time half asserts pairs the CLI half never
  sees and the two never disagree because they never meet.
- **A failing pair stops the tier.** Do not proceed to the checkpoint or to Step 4
  with a pair below 4.5:1. Report it in guide voice
  (`${CLAUDE_PLUGIN_ROOT}/references/guide-voice.md`): name the two roles, the
  mode, the measured ratio and the required one, then give **one** recommended
  fix — re-point that mode's alias at a primitive with more separation, naming a
  specific step in the ramp that clears — rather than a menu of options. This is
  the "modes can't be built with poor colour contrast" promise, and it is the
  cheapest place in the whole system to catch it: the mode is being defined right
  now, and nothing is built on it yet.
- **If the user explicitly accepts a failing pair**, continue, and say plainly in
  the same breath what it costs downstream — describing the mechanism that
  actually exists, not a registration that cannot reach the sync:
  1. the acceptance is recorded in this stage's entry (`contrast-baseline` at
     `result: "fail"`, `advancedBecause` naming it, and the pair itself listed in
     `accepted`), and `token-sync-layer` subtracts exactly that pair from its own
     gate run, so the **next token sync is not blocked** by it — while any *other*
     failing pair, including one introduced later, still stops the sync;
  2. the repo's own registered `verify:check` — the one
     `storybook-chromatic-builder` wires into CI later — derives the same ratio
     off the DTCG source and would fail there, so that skill registers the script
     with `--skip color-contrast` when it finds this acceptance, and says so at
     the time. Nothing is owed to a script that does not exist yet.

  Say both, in that order, and then say how each one ends, because they do not end
  the same way. Fixing the pair in Figma **retires the sync's side by itself**:
  the failure stops appearing, the recorded triple matches nothing, and the sync
  goes back to normal with nothing to clean up. The registered
  `--skip color-contrast` does **not** heal — it is a line in the repo's
  `package.json` and stays until someone removes it, which is the one thing this
  override leaves behind. Say that plainly rather than letting them find it: a
  user who fixes the pair months later and still sees contrast skipped in CI has
  been told the gate is live when it is not.

Change, in **Step 4**, alongside the existing manifest update:

- Record the stage entry: `node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-check.mjs
  --record --stage token-builder --entry <tmp>.json` (subject defaults to
  `"system"`; this stage is not per-component). Build `<tmp>.json` with `changed`
  summarising the collections and modes created, the attested check
  `contrast-baseline` carrying `result` and a one-line `evidence` naming the
  tightest ratio per mode (`"Light 5.2:1, Dark 4.9:1 — tightest is text/onEmphasis
  on bg/emphasis"`), and `advancedBecause`. When the user accepted a failing pair,
  the check's `result` is `"fail"`, `advancedBecause` names the acceptance, and
  the check carries `accepted: [{ fg, bg, mode }]` — one entry per accepted pair,
  `fg` and `bg` as the dotted token paths `CONTRAST_PAIRS` uses and `mode` as the
  mode label. **Write the pair structurally as well as in prose**: `advancedBecause`
  is for whoever reads the bundle later, and `accepted` is what
  `token-sync-layer` matches against, so an acceptance recorded only in prose
  would stop the next sync exactly as if it had never been given. Accept only the
  pairs the user actually accepted — the list is the scope of the override.
  The entry shape is `${CLAUDE_PLUGIN_ROOT}/references/proof-bundle.md` — do not
  restate it here.
- State that the entry is written only when the tier actually completed: a run
  that stopped on a failing pair and was not resumed records nothing, the same
  rule `component-builder` follows for a `BLOCKED` component.

Verify: `node ci/validate-skills.mjs` and `node ci/validate-install-sets.mjs`
pass. Read both edited steps back and confirm they name the command and the two
references, restate neither the pair table nor the entry shape, and that the stop
is stated as a stop.

### Step 9 — `token-sync-layer` runs the gate, then records the derived result

Files: `skills/token-sync-layer/SKILL.md`

Change, in **Step 5** (the full-regeneration and rename-detection step), before
the PR is opened:

- Add a "Check contrast before it ships" paragraph. Run the gate once against the
  DTCG sources this sync just wrote — always, with no accepted-pair exception;
  the next bullet filters the result, never the run:
  ```
  node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-check.mjs --root <repo root> \
    --tokens <each DTCG source, one flag per mode file> \
    --skip orphan-token --skip state-incomplete --skip name-drift
  ```
  **One `--tokens` flag per mode file** — that is what makes the pair get checked
  in every mode; passing only one file of a multi-mode system checks one mode and
  says so on the report's `contrast:` line.
- **Honour an accepted pair, and only an accepted one.** After the gate has run,
  read `design-system/proof/token-builder.json` under the same `--root` (it may
  not exist; then there is nothing to honour). Collect the `accepted` array from
  its `system` entry's `contrast-baseline` check, then drop from this run's
  `color-contrast` failures every one whose `(fg, bg, mode)` matches an entry in
  it, comparing `fg` and `bg` on the same `normalizeText` fold the rule matches
  roles with and `mode` on its label. **Match the triple exactly and subtract
  nothing else.** Do not treat `result: "fail"` on its own as the condition, and
  do **not** pattern-match `advancedBecause`: the first switches off a whole rule
  on the strength of one pair, and the second reads prose written for a human as
  though it were a test.
- **Then judge what is left.** No failures remaining → proceed, and say in one
  line which pair was accepted and is not being re-litigated, in the sync's
  message and in the PR body. That line is where the override stays visible, and
  it is the only place, since a subtracted failure is by definition not on the
  report. Any failure remaining → stop, exactly as if there had been no
  acceptance: a pair the user never saw, in any mode, is the case this rule
  exists for, and an acceptance given for one pair must not carry another one
  through. An `accepted` list that matches nothing — because the pair was fixed,
  or was never recorded properly — subtracts nothing and the sync behaves as
  though there were no acceptance at all, which is both the fail-safe direction
  and how an acceptance retires itself once the pair clears.
- **State which failure stops the sync and which does not.** A `color-contrast`
  failure stops it: do not open the PR, report the failing pair and mode in guide
  voice, and say the fix is in Figma (re-point that mode's alias), not in the
  generated output, which is a build artifact. Any other failure in the report is
  surfaced to the user and summarised in the PR body but does not stop the sync —
  the token sync owns the token tier, and a component's missing proof entry is not
  its to block on.
- **Say why the three rules are skipped**, so nobody removes the flags: a sync
  that adds a token is adding one nothing in the repo names yet, which is
  `orphan-token`'s definition of an orphan, so running it here would fail nearly
  every sync that does its job; `state-incomplete` and `name-drift` are about doc
  records and code surfaces this skill does not touch. They stay live in the
  storying skill's run of the same gate.

Change, in **Step 6**, in the existing record paragraph: the entry now also
carries the **derived** check `color-contrast`, with the result read off the Step
5 report and `evidence` naming the modes checked and the tightest ratio. The gate
runs on every sync, so this check is always recorded — there is no path on which
it is omitted. When a failure was subtracted as an accepted pair, the result is
the one the gate reported for what remained, and `advancedBecause` names the
accepted pair as the reason the sync proceeded; `evidence` says which pair was
subtracted. Recording the gate's real output, rather than omitting the check on
an override path, is what keeps the `derived` label honest and
`proof-contradicted` reachable here. State the ordering invariant explicitly: the
gate runs in Step 5 and the record is written in Step 6, and it is that order
which makes recording a derived result honest — this stage has the gate's output
in hand rather than asserting it, which is the one and only reason a stage may
record `method: "derived"`. Point at
`${CLAUDE_PLUGIN_ROOT}/references/proof-bundle.md`; do not restate the entry
shape.

Verify: `node ci/validate-skills.mjs` and `node ci/validate-install-sets.mjs`
pass. Read both steps back and confirm the ordering invariant is stated in the
step that depends on it, that the skip flags carry their reason inline, and that
the accepted-pair read names the file, states the condition as an exact
`(fg, bg, mode)` match against the recorded `accepted` array rather than as a
recorded `fail` or as prose to be interpreted, happens **after** the gate run
rather than in place of it, and says what it does **not** subtract.

### Step 10 — The README roadmap line

Files: `README.md`

Change: rewrite the "Built-in accessibility checks" bullet (`:207`) in Jordan's
voice — use the `write-like-jordan` skill — so it states what is true after this
ships and what is not: colour contrast on the semantic pairs is checked when the
tokens are created in Figma and again when they sync to code, in every mode, and
fails the build rather than warning; component-level accessibility (focus
indicators, status conveyed by more than colour) is still ahead. Keep it a
roadmap bullet — it is not fully delivered — but stop it promising the half that
now exists as though it does not.

Verify: read it back beside the native-validation bullet below it, which is the
model for a roadmap line that states a shipped half precisely. **This step has no
mechanical check and cannot have one**: nothing in `ci/` reads the root
`README.md` — `ci/validate-install-sets.mjs` reads `scripts/README.md` only, and
neither `ci/validate-plugin.mjs` nor `ci/validate-skills.mjs` opens either file.
The read-back is the verification, and Step 11's CI set is what proves nothing
else moved.

### Step 11 — Regenerate adapters and run the full gate set

Files: `adapters/**` (generated)

Change: `node scripts/adapters/generate.mjs`. Never hand-edit anything under
`adapters/`.

Verify: run all seven CI commands from the top of this Plan; every one exits `0`.

### Step 12 — CHANGELOG

Files: `CHANGELOG.md`

Change: one bullet under `[Unreleased]` → Added, written with the
`write-like-jordan` skill and matching the register of the `verify:check` entry
above it (`CHANGELOG.md:110-151`). It names: the new `color-contrast` rule and
what it compares (the eight semantic pairs, at WCAG AA 4.5:1, in every mode);
that one `--tokens` file is one mode, so a system that passes in Light and fails
in Dark fails; that the same check runs in Figma at token-creation time as the
attested `contrast-baseline`, and that `token-builder` now records a proof entry;
that a contrast failure stops a token sync; that `text/disabled` is excluded and
why; and `--skip color-contrast` as the visible escape hatch, naming **who will
need it** — a system whose semantic roles are not spelled the way the table
expects will see the new `contrast-rule-inert` failure on upgrade with nothing
changed on its side, and that is the flag for it. No schema bump —
`verification` is unchanged at `schemaVersion` 7. No version bump, no
`[Unreleased]` move.

Verify: read it back against the two entries above it for register and shape. As
with Step 10, no checker reads `CHANGELOG.md`, so the read-back is the
verification by design rather than by omission.

### Step 13 — Measure it end to end, with controls

Files: `docs/superpowers/notes/2026-09-12-token-contrast-e2e.md` (new), this spec

Change: build a fixture design system in the session scratchpad — a
`design-system.json` at `schemaVersion` 7, a `packages/tokens/package.json`, and a
DTCG source split the way a real light/dark system is:
`dtcg/primitives.json` (the ramps), `dtcg/semantic.light.json` and
`dtcg/semantic.dark.json` (the eight roles, aliasing the ramps). Copy the docs
install set in and invoke `npm run verify:check` from the tokens package with both
mode files passed — not `node scripts/verify-check.mjs` from the plugin checkout.
The fixture run is what proves the install set closes and that the registered form
is substitutable.

1. **The clean run** → exits `0`. Quote the `contrast:` line: it must name 2 modes
   and a non-zero pair count. A run reporting 1 mode means the mode files were not
   both passed, and the whole rule is then untested.
2. **The discriminating control, which is the rule's central claim.** Re-point
   `color.text.onEmphasis` in `semantic.dark.json` only, at a primitive that
   fails against `bg/emphasis` — leaving Light untouched — and re-run: exit `1`,
   one `color-contrast` failure, naming `semantic.dark`. Quote the line. Revert.
3. **Every other control, each run immediately after a clean run and reverted
   before the next**, so each is the single difference from a green system:
   - a source with no recognised colour roles → `contrast-rule-inert`;
   - `--skip color-contrast` with the dark failure in place → exit `0` and
     `color-contrast` on the `skipped:` line. This is the escape hatch a consumer
     adds to their registered script when their roles are named differently, and
     the control proves it works and stays visible on the report. It is also what
     `storybook-chromatic-builder` registers when it finds an acceptance (Step 7);
     it is **not** `token-sync-layer`'s accepted-pair path, which runs the gate
     and subtracts from the result (Step 9);
   - the token-sync invocation — `--skip orphan-token --skip state-incomplete
     --skip name-drift` on a healthy fixture → exit `0` with **no**
     `nothing-verified`. This is the control for Step 4's counter change, and
     without it a regression there would only ever appear in a user's sync;
   - a `token-sync-layer` entry recording `color-contrast` as `pass` while the
     dark failure is in place → exit `1` with `proof-contradicted`;
   - **the accepted-pair subtraction, both ways.** This is the Override
     decision's central claim, and the sync proceeds there *because a failure was
     subtracted* — an absence, so by the Evidence decision it owes a control. The
     subtraction lives in the skill rather than the CLI, so exercise it against
     the real report: with the dark failure in place, record a `token-builder`
     entry whose `contrast-baseline` carries
     `accepted: [{ fg: "color.text.onEmphasis", bg: "color.bg.emphasis", mode: "semantic.dark" }]`,
     apply Step 9's matching rule to the gate's `color-contrast` failures, and
     show nothing is left — the sync proceeds. Then break a **second** pair
     (`color.text.primary` over `color.bg.default`, same mode), re-run the gate
     and apply the same rule: that failure is still standing, so the sync stops.
     One acceptance must not carry an unrelated pair through, and a green run
     cannot be told from a broken rule without this pair.
4. **The alpha pair, both ways.** A `status/danger/text` at 50% alpha over an
   opaque `status/danger/bg` is composited and compared (it appears in the pair
   count); the same pair with the *background* at 50% alpha is skipped and shows
   on the `contrast:` line as a translucent-background skip. Both in the same
   session — the skip is only trustworthy next to a case that was not skipped.
5. **Record mode for the new stage.** Record a `token-builder` entry with an
   attested `contrast-baseline`; show the stage file at
   `design-system/proof/token-builder.json`, the manifest pointer with no
   `exempt` key, and that a second record leaves the first stage's pointer
   untouched.
6. Restore, re-run clean → exits `0` again.

Write the note with the real commands and their real output, following
`ci/README.md:69-99`: the clean result counts only because the controls in the
same session failed the way this spec says they must. **If a control comes back
clean, the harness is broken, not the code** — fix it and repeat, do not record
the run.

Then add `## What shipped` and `## Where it diverged` to this spec and set
`Status: built`.

Verify: the note contains the clean run and every control's output; `node --test`
and the six other CI commands are green on the final tree.
