# Verification proof bundle + negative stop conditions

Status: planned
Reviewed: 2026-09-12 — needs revision
Date: 2026-09-12
Issue: #110
Supersedes: `docs/superpowers/plans/2026-07-15-verification-proof-bundle-handoff.md`
(its map of solved/partial/gaps still holds; its `schemaVersion` 5 → 6 proposal
at `:84` is stale — v6 shipped `figma.docCardVariables`, so this is 6 → 7)
Plan: `2026-09-11-backlog-remediation-plan.md` §3 Phase 4, §4 Q8

## Goal

Today a stage advances on evidence nobody keeps. The `figma-executor` read-back,
the `reviewer` verdict and each executor's `DONE` / `DONE_WITH_CONCERNS` /
`BLOCKED` are real checks, and all of them are prose that evaporates when the
run ends. Nothing on disk says what a stage checked, what it found, or why it
was allowed to advance — so "run it twice, same structure" is the only durable
claim the system makes, and that proves idempotency, not quality.

After this ships:

1. **Each stage leaves a durable entry on disk** at
   `design-system/proof/<stage>.json` — what changed, which checks ran, what each
   found, and why the stage advanced — with a fingerprint pointer in
   `design-system.json` so a hand-edited entry is caught, the same way
   `docs:check` catches a hand-edited surface.
2. **`verify:check` re-derives what it can** rather than trusting the record. A
   check marked `derived` is recomputed off disk on every run, and a stored
   result that disagrees with the recomputation fails as `proof-contradicted`. A
   check marked `attested` is an agent's live observation (Figma), reported the
   way `edit-unverified` already is: visible, never the reason a run passes.
   `storybook-chromatic-builder` is the stage that records derived results, since
   it is the one that runs the gate before it records.
3. **Three gaps close as entries in it**, not as bolt-ons:
   `orphan-token` (a token nothing names), `state-incomplete` (a component
   documented without its archetype's baseline interaction states) and
   `name-drift` (one component, three spellings across manifest, record and
   code).
4. **A run that verified nothing fails.** `nothing-verified` is the same
   discipline `nothing-scanned` and `colour-rule-inert` already carry.

## Non-goals

- **A release.** No version bump, no CHANGELOG move, no tag.
- **Re-checking documentation drift.** `docs:check` owns canonical-vs-surface
  drift and stays the only thing that computes it. `verify:check` never
  recomputes a doc fingerprint for drift purposes.
- **Reading Figma from the CLI.** The gate is zero-dependency Node over files on
  disk. Everything only Figma can answer stays attested.
- **Duplicating the `figma-executor` read-back.** It keeps asserting structure;
  its result is recorded, not recomputed.
- **History.** One entry per stage-and-subject, latest wins. No append-only
  journal (Open questions).
- **Figma-side orphan variables** — a Figma variable no layer binds. That needs a
  whole-file node walk and is its own item (Open questions).
- **Changing `agents/reviewer.md` or `agents/code-executor.md`.** The dispatching
  skill records the verdict it already receives.
- **Wiring `verify:check` into this plugin's own CI.** It is a gate for a
  consumer's design system; this repo has no `design-system.json`.
- **Gating conditional interaction states** (`loading`, `error`, `success`,
  `selected`). Whether one applies is a design judgment; only the unconditional
  baseline is asserted.

## Decisions

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| Is the bundle the enforcement mechanism or the record? | The record. Gates enforce; the bundle persists what each gate found and why the stage advanced. `verify:check` is a reader that re-derives, contradicts and fails — it does not replace the checks the skills already run. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The handoff (`:70-78`) calls the bundle the keystone but never settles this. Every check that matters already has a home where its inputs live (the read-back is in Figma, `docs:check` is on disk). Making the bundle the enforcer would move checks away from their inputs and duplicate `docs:check` and the read-back — the two things #110 explicitly says to reuse. | A single mega-gate that re-runs every stage's checks. Skills reporting in prose with the bundle as an afterthought. |
| Where the bundle lives | Folder-resident JSON at `design-system/proof/<stage>.json`, one file per stage, keyed by subject. `design-system.json` carries a new top-level `verification` pointer: `{ path, stages: { <stage>: { at, fingerprint } } }`. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Exactly the `meta[name].doc` discipline (`references/component-doc-schema.md:105-131`): content on disk, pointers and hashes in the manifest. Manifest rule 4 (`references/manifest-schema.md:365`) says the manifest is human-readable and must not take opaque blobs, and entries grow per run. Folder-resident means `component-builder` can write one at `workspace.stage: "folder"`, before any repo — the same reason doc records live there (`component-doc-schema.md:10-13`). | Entries inside `components.meta[name]`, which has no home for a system-wide stage like a token sync, and grows the manifest without bound. A store under `docs/`, which is the decision journal's (`manifest-schema.md:346`). |
| Manifest schema | `schemaVersion` 6 → 7, adding top-level `verification`, default `null`. No existing field changes. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The handoff's 5 → 6 is stale: v6 shipped `figma.docCardVariables` (`references/manifest-schema.md:379-381`). The additive-with-default shape is what v4→v5 and v5→v6 both did. | Reusing v6. Any change to an existing field. |
| One entry's shape | `{ at, changed: [], checks: [{ name, method, result, evidence }], screenshot?, advancedBecause }`, stored under `subjects[<name>]`; system-wide stages use the subject `"system"`. `evidence` and `screenshot` are pointers, hashes or one-line summaries — never content. `at` is an ISO string passed in by the caller. | Recommended; accepted under Jordan's standing instruction (2026-09-11). It is the handoff's proposed shape (`:87-90`) with `stage`/`subject` lifted into the file and key, since storing them twice invites the two to disagree. Pointers-not-content matches `meta[name].doc`. `at` is passed in because `Date.now()` is unavailable in some execution contexts (handoff `:88`). | A flat log keyed only by stage, which cannot say which component a check was about. Screenshots or diffs inlined into the store. |
| Derived vs. attested (the fork open since 2026-08-07) | Both, labelled, and not equal. `method: "derived"` means `verify:check` recomputes it off disk every run; the stored result is a cache, and a disagreement fails as `proof-contradicted`. `method: "attested"` means an agent observed it live; it is printed on the informational line and is never the reason a run passes. **`proof-contradicted` needs a writer to be reachable, so `storybook-chromatic-builder` records the two component-scoped derived results (`state-incomplete`, `name-drift`) it already has in hand** from the `verify:check` run its own Step 5.5 performs. `component-builder` (folder stage, no repo to scan) and `token-sync-layer` record attested checks only, and that is a property of those stages rather than a condition of a run — so there is no `attested-only` report line. | Recommended; accepted under Jordan's standing instruction (2026-09-11). This is the question the brainstorm paused on: a bundle written by the agent that did the work is self-attestation, and `docs:check` has teeth because it recomputes rather than trusting a report. The repo already has the precedent for the honest half — `edit-unverified` (`scripts/docs-check.mjs:5-11`) records what the CLI cannot read without pretending it verified it. Naming a writer is what keeps the fork real: with no stage recording a derived result, `proof-contradicted` would be reachable only from a hand-written entry, and the label would be decoration. `attested-only` is dropped because it would print for every `component-builder` and `token-sync-layer` subject on every run forever — a line that never varies carries no information, and the report already prints each check with its method. | A bundle that is trusted because it was written. Dropping Figma observations entirely, which would lose the read-back's result. A `derived` label with no writer in v1. A standing informational line that is true of the stage's design rather than of this run. |
| What `verify:check` fails on | `proof-missing`, `proof-contradicted`, `proof-stale` (a stage file that exists but whose fingerprint ≠ the manifest's), `orphan-token`, `state-incomplete`, `name-drift`, `nothing-verified`, and `orphan-rule-inert`. Informational: `archetype-unknown` and `proof-unadopted`. Exit `0` clean, `1` a failure, `2` bad arguments. **`nothing-verified` counts subjects examined, not rules enabled**: zero alias candidates, zero doc records and zero built components means nothing was verified, however many rules were switched on. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The failing/informational split and the exit codes are the house convention (`scripts/docs-check.mjs:86`, `scripts/README.md:115-116`). `nothing-verified` is `nothing-scanned`'s rule (`validate-adherence.mjs:623-630`), and that rule counts what the scan *found* (`stats.elements`, `stats.literals`, `stats.dimensions`), not how many rules were on — counting enabled rules would pass a system with no doc records at all, which is exactly the green-having-read-nothing run the rule exists to stop. A missing file is `proof-missing` only; `proof-stale` is about disagreement between a file and its hash, so the two classes never fire on the same condition. | A warnings-only gate. Advisory-only negative conditions, which the plan rules out at §3 Phase 3.2. A green run over an empty system. |
| Adoption on an existing system | A manifest with no `verification` key at all reports `proof-unadopted` (informational) and skips every proof-integrity check; the three negative conditions still run. Once `verification` exists, the proof checks are scoped to what the system actually adopted, by **two independent gates a component must fail before it is flagged**. **(1) The stage must owe it an entry, by lifecycle.** `component-builder` is owed by every name in `components.built`; `storybook-chromatic-builder` is owed only by a component whose `components.meta[name].status` is `"stable"`. **(2) The component must postdate adoption** — `components.meta[name].updatedAt` strictly later than `verification.stages[<stage>].adoptedAt`, an ISO string written once on the stage's first `--record` and **never overwritten**. A stage listed in `verification.stages` whose file is gone fails as `proof-missing` regardless. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Every existing project has zero entries. Failing them on upgrade is the standing warning wall `layout-upgrade-available` was written to avoid (`references/component-doc-schema.md:139-143`), and the same shape as the brownfield-first-run adoption rule (`:152-154`). **The lifecycle gate is what makes the rule answerable from the manifest rather than from timing.** The manifest states the lifecycle outright (`references/manifest-schema.md:254-258`): a component is created at `"draft"` by `component-builder` and promoted to `"stable"` by `storybook-chromatic-builder` when its code and stories are built and approved. A component built in Figma and not yet storied is `draft` — the normal, correct state between the two skills — so the storybook stage is owed nothing for it, and the second batch of components in a repo cannot fail a gate the storying skill has not yet reached. Without that gate, time alone would flag it: any `updatedAt` later than the adoption moment and no entry is a failure, which is every draft component. **`adoptedAt` is stored rather than derived because deriving it does not hold still.** `mergeEntry` is latest-wins and replaces a subject's `at` along with the rest of its entry, so an earliest-`at`-across-the-file reading slides forward whenever the earliest subject is rebuilt — silently widening the exemption, and un-flagging a component that was correctly failing. A value written once on first adoption is the only one that means "when did this system opt in". `updatedAt` is stamped at creation and refreshed on every re-run (`:250-262`), so it is the honest "when was this last touched". A component with no `updatedAt` is exempt — a stated false negative, in the same house style as `orphan-token`'s limit. | Failing every pre-existing system on the first run. Failing every already-built component the moment one entry is recorded. **Failing a component for not having reached a stage yet.** An adoption moment recomputed from entries, which moves when an unrelated component is rebuilt. Silently passing a system that opted in and then stopped writing entries. |
| `orphan-token` definition | A source token whose own `$value` is an alias (`{…}`) and which nothing names: no other token's `$value` references it, no scanned source file's text contains its normalized key, and no component doc record lists it in `tokensUsed`. Primitives (tokens whose value is a literal) are exempt. Binding evidence is permissive: `normalizeKey(fileText).includes(normalizeKey(path))`. Fires `orphan-rule-inert` when no source token is an alias. **The walk excludes the package that owns `--tokens`**, reusing `tokenPackageDirs` from `validate-adherence.mjs` and reporting the exclusion on an `excluded:` line. | Recommended; accepted under Jordan's standing instruction (2026-09-11). "A token defined and bound by nothing" (#110) needs a definition a zero-dependency CLI can compute. **The owner-package exclusion is what makes the rule able to fire at all.** Style Dictionary writes its output into `packages/tokens/<platform>/` (`skills/token-sync-layer/SKILL.md:204`), emitting every token by name; `SOURCE_EXT` (`scripts/lib/source-scan.mjs:27`) yields `.css`, `.mjs` and `.js`, and `DEFAULT_EXCLUDES` (`:14-23`) does not exclude that directory. Under the registered `--root ../..` the generated output is inside the walk, so `normalizeText(path)` is a substring of the generated CSS for *every* semantic token and nothing could ever be an orphan. `validate-adherence.mjs:800-812` already partitions exactly this out for exactly this reason, and prints what it set aside (`:676`) rather than dropping it silently — this gate reuses that function rather than growing a second definition of "the package that owns the tokens". A token whose value is an alias is the semantic tier by construction in a two-tier system (`references/manifest-schema.md:211`), and the semantic tier is the layer code is supposed to consume; a primitive is legitimately reached only through a semantic, so gating it would fail correct systems. Permissive matching is deliberate: `normalizeKey` already folds every adapter's naming convention (`validate-token-output.mjs:181-185`), so a token counts as bound if its name appears anywhere, in any spelling. A failing rule must not guess. | Failing an unused primitive. Class-name-aware scanning (a Tailwind `bg-bg-primary` is caught by the substring fold, not by understanding Tailwind). Checking Figma variable bindings. |
| `orphan-token`'s stated limit | A token counts as bound when its key is a substring of a normalized file, so `color.bg.primary` is bound by a mention of `color.bg.primary.hover`, and by prose that happens to contain the words. Stated in the code comment and in `scripts/README.md`, not hidden. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Every miss is a false negative (an orphan reported as bound), never a false failure. `lib/dtcg.mjs:87-92` is the house precedent for writing a limit down rather than papering over it. | Word-boundary matching, which would miss `--color-bg-primary` inside `var()` chains and every camelCase adapter symbol. |
| `state-incomplete` — what is asserted | Per component doc record: resolve its archetype, then require every state in that archetype's **unconditional** baseline, minus `default`, to be a key of `record.states` (compared with `normalizeName`). Baselines: `button` and `choice` → hover, focus, active, disabled; `input` → hover, focus, disabled; `card`, `modal`, `badge`, `other` → none (exempt). | Recommended; accepted under Jordan's standing instruction (2026-09-11). The baseline is `references/figma-component-standards.md:126-138`, which is prescriptive prose today and gated nowhere. `default` is dropped because "the resting state" is not documentation — the Figma matrix still requires it, and that half is the executor's attested check. Conditional states (`loading`, `error`, `success`, `selected`) are dropped because the standard itself makes them situational ("decide *which* conditional states apply"), and a hard gate cannot decide that. What is left is exactly the miss #110 names: a spec that forgets `disabled`. | Failing a Card for having no hover state. Gating `loading` on every button. |
| How the archetype is known | A new **optional, non-projected** `archetype` field on the doc record (`button` \| `input` \| `choice` \| `card` \| `modal` \| `badge` \| `other`), written by the authoring pipeline that already matches one. When absent, fall back to an exact `normalizeName` match of the record's `name` against a synonym table (`button`; `input`/`textfield`/`textinput`; `checkbox`/`radio`/`toggle`/`switch`/`chip`; `card`; `modal`/`dialog`; `badge`/`tag`). Neither resolving → `archetype-unknown`, informational. | Recommended; accepted under Jordan's standing instruction (2026-09-11). `component-builder` Step 4.5 already "matches the component to the nearest archetype" (`skills/component-builder/SKILL.md:257-260`) and throws the answer away. The name fallback means a component called `Button` cannot dodge the gate by omitting the field. Exact-match-only keeps `IconButton` out: a conservative resolver produces no false failures. `archetype` stays out of `PROJECTED_KEYS` (`scripts/lib/doc-record.mjs:11-16`) because it is classification, not projected content — so adding it changes no existing fingerprint and forces no re-render. | Inferring an archetype by prefix or fuzzy match. A required field, which would fail every existing record. |
| `name-drift` — what is compared | For each name in `components.built`: the doc record's own `name`, and — when `meta[name].doc.surfaces.storybookMdx.file` is set — that path's basename minus `.mdx` and its parent directory. All folded with `normalizeName` and required equal. The Figma spelling is recorded by the executor as an attested check. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The manifest, the record and the code surface are the three spellings a CLI can read; `packages/ui/src/<Name>/<Name>.mdx` is the convention Step 5.5 writes (`skills/storybook-chromatic-builder/SKILL.md:236-237`). `normalizeName` is the fold the adherence gate already uses for exactly this comparison (`scripts/lib/source-scan.mjs:45`). Deterministic naming is stated as a contract in two skills and asserted in neither (`component-builder` Step 5). | Reading Figma from the CLI. Parsing TSX for the exported symbol, which the MDX path already implies. |
| Where the code lives | One new script `scripts/verify-check.mjs` plus two new modules, `scripts/lib/proof.mjs` (entry shape, stage-file load/merge, fingerprint) and `scripts/lib/component-states.mjs` (the archetype table + resolver). It imports the existing `lib/doc-record.mjs`, `lib/dtcg.mjs` and `lib/source-scan.mjs`. No change to `validate-adherence.mjs` or `docs-check.mjs`. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The three checks share `validate-adherence.mjs`'s inputs but not its question: that gate asks whether consuming code adheres to the system, this one asks whether the system is self-consistent. Sharing the libs is how this repo shares (`scripts/README.md:15-19`); sharing the script would mean two report shapes in one CLI. Each rule exists once, which is #57's lesson. | A second copy of the DTCG flatten or the source walker. Growing `adherence:check` a fourth concern. |
| How stages write entries | `verify-check.mjs --record --stage <name> [--subject <Name>] --entry <file.json>` merges one entry into the stage file, recomputes the file's fingerprint and stamps `verification.stages[<stage>]` in the manifest. Skills call it; they never hand-write the store or hand-compute a hash. | Recommended; accepted under Jordan's standing instruction (2026-09-11). At folder stage there is no `package.json` and no npm script, but skills already run plugin scripts by absolute path there — `component-builder` runs `node ${CLAUDE_PLUGIN_ROOT}/scripts/docs-lint.mjs` at exactly that point (`skills/component-builder/SKILL.md:266-267`). A writer means the fingerprint and the pointer can never drift from the file. | Skills writing JSON and a sha256 by hand. A second CLI for recording. |
| Which stages emit, in v1 | `component-builder` (subject = component), `storybook-chromatic-builder` (subject = component), `token-sync-layer` (subject `"system"`). `/document-component` and the retrofit phases do not. | Recommended; accepted under Jordan's standing instruction (2026-09-11). These three are where the negative conditions' evidence is produced: the Figma build, the code build, and the token sync. Starting with the stages that have something to prove keeps the first version measurable. | A bundle entry for every skill, most of which would carry only `advancedBecause`. |
| The executor's new assertion | `agents/figma-executor.md` step 4 gains one line: before finalizing, compare the spec's declared `state` axis against the archetype baseline in `references/figma-component-standards.md`, and return `BLOCKED` naming the missing state rather than building a matrix that omits one. The values it saw are reported for the entry as an attested check. **Scoped exactly as conservatively as the CLI's resolver**: the assertion applies only when the component is one the standards prose names outright — a Button, an Input / text field, or a Checkbox / radio / toggle / chip. For anything else, the executor does not block on states. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #110's second gap is that "the read-back checks only the spec's declared matrix. A spec that forgets `disabled` passes." The read-back is the only place that sees the built matrix, so that is where the assertion belongs; the derived half (`state-incomplete` on the record) is an independent second layer, not a substitute. The scope has to be stated, because an unscoped mirror is worse than no mirror: `references/figma-component-standards.md:126-138` gives a baseline for those three component kinds and nothing else, so an executor asked to "compare against the baseline" with no named archetype would be inventing one — and a `Card` or an `IconButton` returning `BLOCKED` for lacking `hover` is a false failure in the one place a false failure costs the most, since `BLOCKED` stops the build. This is the same rule `resolveArchetype` follows on the CLI side (exact match, `archetype-unknown` otherwise), so the two halves fail and abstain on the same set. | Teaching the CLI to read a Figma variant matrix. Leaving the executor to trust the spec. An executor that blocks a Card for having no hover state. Two resolvers with different notions of which components owe states. |
| Reviewer verdicts | Recorded by the dispatching skill as an attested check named `review`, carrying `approved` / `changes-requested`. `agents/reviewer.md` is unchanged. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The dispatcher already receives the verdict as the subagent's return value; changing the agent contract to emit structured data is a second, larger change with its own failure modes. | A structured return contract for the agent tier in this change. |
| Install and registration | `verify-check.mjs`, `lib/proof.mjs` and `lib/component-states.mjs` join the **Documentation scripts — install as a set** table in `scripts/README.md`, registering `verify:check`. The set goes from eight files and four scripts to eleven files and five. `storybook-chromatic-builder` Step 1's stated counts move with it. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The set is the documentation-and-verification set a consuming repo gets, and `ci/validate-install-sets.mjs` already checks both the import closure and the stated counts — the mechanism that exists precisely because a script shipped without its registration twice (#103, #105). The three new files' imports are all already in the set. | A fourth install set. Copying the script without registering an npm script. |
| CLI surface | `verify-check.mjs [--root <dir>] [--tokens <file>]… [--source <dir>]… [--skip <rule>]…`, plus the `--record` mode above. With no `--tokens`, `orphan-token` is reported as skipped, not passed. With no `--source`, the walk covers `--root`. **The registered form carries those paths**: `"verify:check": "node scripts/verify-check.mjs --root ../.. --tokens dtcg/tokens.json"`, placeholders the installing skill substitutes for the repo's real layout, exactly as `adherence:check` already requires. | Recommended; accepted under Jordan's standing instruction (2026-09-11). This is `validate-adherence.mjs`'s surface (`scripts/README.md:60-80`): explicit paths because cwd is the package holding the script, repeatable `--tokens` for a system whose values span mode files, and `--skip` as the supported answer for a rule a repo genuinely cannot apply. A skipped rule is absent rather than inert. The registered form has to carry the paths for the same reason the `adherence:check` row does: a bare `node scripts/verify-check.mjs` has no `--tokens`, so every consumer who registers what the table says would run a gate with `orphan-token` permanently skipped — #110's first stop condition, disabled by its own registration. | Defaulting `--tokens` to a guessed path. Silently passing a run that had no token source. Registering the gate in a form that can never run one of its rules. |
| Wiring it into a consumer's CI before `orphan-token` has been measured | Wire it now, all three rules live. `--skip orphan-token` is the visible, documented escape hatch for a repo it misfires on; measurement narrows the rule, it does not gate the wiring. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The plan's §3 Phase 3.2 noisy-rule worry is real, but a rule nobody runs is a rule nobody measures, and the earlier draft held the two positions at once — an open question saying "measure before it is registered in anyone's CI" beside a Plan step that registers it. `--skip` is already this repo's answer for a rule a repo cannot apply (`scripts/README.md:76-80`) and it prints on the report's `skipped:` line, so switching it off stays visible rather than silent. | Registering the gate with `orphan-token` quietly off (by dropping `--tokens`). Holding the whole gate back for one unmeasured rule. |
| CHANGELOG | One new bullet under `[Unreleased]` → Added, naming the new gate, the manifest bump to 7, and the three rules. | Recommended; accepted under Jordan's standing instruction (2026-09-11). It is a new user-facing capability and a manifest schema change; every prior schema bump has its own entry (`CHANGELOG.md:817`, `:1099`, `:1210`). | Folding it into the adherence-gate entry. Any version bump or `[Unreleased]` move. |
| Evidence | A new e2e note written by the build from the real change, plus `## What shipped` here. Every run whose pass condition is "no failures" is paired, in the same session and through the same CLI, with a control that must fail. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #77's rule, now in `ci/README.md:69-99`: an absence cannot report on itself, and a green gate proves nothing without a case it must reject. | Recording unit-test counts as end-to-end evidence. |

## Open questions

- **History.** One entry per stage-and-subject, latest wins, so the third rebuild
  of a component erases the first two. **I'd recommend waiting** — the manifest
  models state, not history, everywhere else, and nobody has asked "what did this
  check say last month" yet. An append-only `design-system/proof/journal.ndjson`
  is the obvious shape if they do. Unresolved.
- **How noisy `orphan-token` is on a real app.** The rule is reasoned about and
  fixture-tested, not measured against a real codebase; the noisy-rule risk is the
  one §3 Phase 3.2 of the plan calls out for the colour rule. **I'd recommend
  measuring it against the Phase 3 app (§4 Q7, `throughline-ds`) once it is
  wired**, and narrowing rather than downgrading it if it is noisy. The wiring
  does not wait on the measurement (Decisions); `--skip orphan-token` is the
  escape hatch until then. Unresolved.
- **Figma-side orphan variables.** A Figma variable no layer binds is the other
  half of "defined and bound by nothing", and it needs a whole-file node walk
  collecting `boundVariables`. **I'd recommend a separate item** once the bundle
  exists to record its result. Unresolved.
- **Making `archetype` required.** While it is optional, a component the name
  table cannot resolve is exempt from `state-incomplete`. **I'd recommend
  revisiting once records carry it in practice** — requiring it today fails every
  existing record. Unresolved.
- **`proof-missing` granularity.** A built component with no entry is flagged
  only when `verification` exists, *and* the stage owes it an entry by lifecycle
  (`storybook-chromatic-builder` only for a `stable` component), *and* its
  `components.meta[name].updatedAt` postdates that stage's recorded `adoptedAt`.
  So a component carrying no `updatedAt` at all is never flagged, and neither is
  one whose `status` the manifest never promoted — a component stuck at `draft`
  forever is invisible to the rule. **I'd recommend leaving both false
  negatives** until adoption is real: the alternative is failing components whose
  history the manifest cannot date, or second-guessing a lifecycle the manifest
  states. A `draft` component that never advances is a different problem from an
  unproven one, and probably wants its own staleness rule. Unresolved.
- **Whether `advancedBecause` should be constrained.** It is free prose today, so
  a stage can advance "because it looked fine". **I'd recommend a controlled
  vocabulary later**, once there are real entries to generalise from.
  Unresolved.

## Plan

Everything runs from the repo root on branch `feat/110-verification-proof-bundle`.

New code goes in `scripts/verify-check.mjs`, `scripts/lib/proof.mjs` and
`scripts/lib/component-states.mjs`. Every new test goes in the matching
`*.test.mjs` beside it, in the existing style: `node:test`, `assert/strict`,
inline fixtures, `mkdtempSync` temp dirs (`scripts/docs-check.test.mjs` is the
model). **No existing test may be edited.** If one fails, a shared module's
behaviour changed, and that is a bug in the step.

Run the full CI set after any step that touches code or a skill:

```sh
node --test
node ci/validate-plugin.mjs
node ci/validate-skills.mjs
node ci/validate-install-sets.mjs
node scripts/adapters/generate.mjs --check
node scripts/build-doc-card-builder.mjs --check
node scripts/build-native-adapter-config.mjs --check
```

### Step 1 — Re-baseline the 2026-07-15 handoff

Files: `docs/superpowers/plans/2026-07-15-verification-proof-bundle-handoff.md`

Change: inline, not `implementer`. Add a blockquote directly under the existing
one at the top, in Jordan's voice (use the `write-like-jordan` skill), saying the
design pass this doc asked for is done and lives at
`docs/specs/2026-09-12-verification-proof-bundle.md`; that the map of
solved/partial/gaps in "The honest map" still holds; and that the one stale claim
is the `schemaVersion` 5 → 6 proposal at `:84` — v6 shipped
`figma.docCardVariables`, so the bundle lands as 6 → 7. Do not edit the body:
the open questions it lists are answered in the spec's Decisions table, and
rewriting them here splits the record.

Verify: read it back; the header names the spec path and states 6 → 7.

### Step 2 — The contract document

Files: `references/proof-bundle.md` (new)

Change: write the reference for the store, in the plain reference register of
`references/manifest-schema.md` (not guide voice). It states:

- **Where it lives.** `design-system/proof/<stage>.json`, folder-resident from
  the first component, exactly like `design-system/docs/`. Never moves across
  folder → repo.
- **The file shape.** `{ "stage": "<name>", "subjects": { "<subject>": <entry> } }`.
  Subject is a component name, or `"system"` for a stage that is not
  per-component.
- **The entry shape.** `{ at, changed, checks, screenshot?, advancedBecause }`:
  `at` an ISO string supplied by the caller; `changed` an array of one-line
  strings; `checks` an array of `{ name, method, result, evidence }` where
  `method` is `"derived"` or `"attested"` and `result` is `"pass"` or `"fail"`;
  `screenshot` an optional pointer (node id or repo-relative path);
  `advancedBecause` one line saying why the stage was allowed to advance.
- **Pointers, never content** — the same rule as `meta[name].doc`, with the
  reason: the store is committed and read by humans.
- **`derived` vs `attested`**, stated as the load-bearing distinction: a derived
  check is one `verify:check` recomputes off disk, and its stored result is a
  cache that must agree; an attested check is an agent's live observation,
  printed informationally and never the reason a run passes. Cross-reference
  `edit-unverified` in `references/component-doc-schema.md`.
- **The manifest pointer**, `verification`, and that skills write it only through
  `verify-check.mjs --record`. Document `adoptedAt` here as the write-once field:
  set on a stage's first recorded entry and never rewritten, because it is what
  scopes `proof-missing` to components that postdate adoption. `at` moves with
  the latest entry; `adoptedAt` does not.
- **The stage vocabulary in v1**: `component-builder`, `storybook-chromatic-builder`,
  `token-sync-layer` — the first two keyed by component, the last by the subject
  `"system"`. State that the machine-readable copy of that split is
  `PER_COMPONENT_STAGES` in `scripts/lib/proof.mjs`, and that a change here must
  change that constant.
- **The check names in v1** and which method each uses: `structural-read-back`
  (attested), `state-baseline` (attested), `figma-name` (attested), `review`
  (attested), `build` (attested), `orphan-token` (derived), `state-incomplete`
  (derived), `name-drift` (derived). State **which stage records the derived
  ones**: `storybook-chromatic-builder` only, because it is the one stage that
  runs `verify:check` before it records and so has the results in hand.
  `component-builder` runs at folder stage with no repo to scan, and
  `token-sync-layer`'s subject is the system — both record attested checks only.
  A derived result in a stage file is a cache that the next run recomputes, and a
  disagreement is `proof-contradicted`.
- A worked example of one stage file with two subjects.

Reference other files as `${CLAUDE_PLUGIN_ROOT}/references/<file>.md`, the
convention every reference uses.

Files: `ci/validate-skills.mjs`, `ci/validate-skills.test.mjs`

Change: give that worked example a real mechanical check, because today there
isn't one. `validateManifestDoc` (`ci/validate-skills.mjs:68-82`) parses exactly
one block — the first ```` ```json ```` in `references/manifest-schema.md` — and
asserts only that `schemaVersion` is an integer. Nothing checks any other
reference doc's JSON. Add `export function validateReferenceJson({ fileName, source })`:
every ```` ```json ```` block in the file must parse, reported as
`references/<file>: json block <n> does not parse: <message>`. Call it from
`main()` over every `references/*.md`, alongside the existing
`validateManifestDoc`, which keeps its `schemaVersion` assertion for the manifest
doc alone. Add the reference-doc count to the success line. Surveyed before
writing it: the only ```` ```json ```` blocks under `references/` today are one in
`manifest-schema.md` and two in `component-doc-schema.md`, and all three parse —
so this check is one the current tree already satisfies.

**Match the fence language exactly — ```` ```jsonc ```` is deliberately out of
scope, not an oversight.** `references/crosswalk-schema.md:19` and `:79` are
`jsonc` blocks carrying `//` comments, which `JSON.parse` rejects by design: they
are annotated examples for a human, not machine-read shapes. Match `json` and not
a `json` *prefix*, and say that in a comment above the regex, so the next person
does not "fix" it to catch `jsonc` and turn a correct reference doc into a red CI.

Tests in the file's existing style (`ci/validate-skills.test.mjs:60-80` is the
model): two well-formed blocks → `[]`; a source whose second block is malformed →
one problem naming the file and the block index; a source with no JSON block →
`[]`, since most reference docs have none.

Verify: `node --test` → the new `validate-skills` tests pass, suite green.
`node ci/validate-skills.mjs` → passes, and its success line counts the reference
docs it read, with `references/proof-bundle.md`'s worked example among the blocks
it parsed. Then read the example back and confirm it matches the shape the prose
states — the parse check proves it is JSON, not that it is the right JSON.

### Step 3 — The archetype state baseline

Files: `scripts/lib/component-states.mjs` (new),
`scripts/lib/component-states.test.mjs` (new)

Change: a zero-dependency module exporting:

- `ARCHETYPES` — the ordered id list
  `['button', 'input', 'choice', 'card', 'modal', 'badge', 'other']`.
- `BASELINE_STATES` — a `Map` (or plain object) from archetype id to the required
  state array: `button` → `['hover', 'focus', 'active', 'disabled']`; `choice` →
  the same four; `input` → `['hover', 'focus', 'disabled']`; `card`, `modal`,
  `badge`, `other` → `[]`.
- `NAME_SYNONYMS` — normalized-name → archetype id:
  `button`→`button`; `input`, `textfield`, `textinput`→`input`; `checkbox`,
  `radio`, `toggle`, `switch`, `chip`→`choice`; `card`→`card`; `modal`,
  `dialog`→`modal`; `badge`, `tag`→`badge`.
- `resolveArchetype(record)` — returns `record.archetype` when it is one of
  `ARCHETYPES`; else looks up `normalizeName(record.name)` in `NAME_SYNONYMS`
  (import `normalizeName` from `./source-scan.mjs`); else `null`. Exact match
  only — no prefix or fuzzy matching.
- `missingStates(record)` — returns `[]` when `resolveArchetype` is `null` or its
  baseline is empty; otherwise the baseline entries whose `normalizeName` is not
  among the `normalizeName`-folded keys of `record.states ?? {}`.

Put a comment above `BASELINE_STATES` naming this spec, stating that the source
of truth for the prose is `references/figma-component-standards.md:126-138`, that
`default` is deliberately excluded (documenting the resting state is not
documentation; the Figma matrix requirement is the executor's), and that
conditional states (`loading`, `error`, `success`, `selected`) are deliberately
excluded because whether one applies is a design judgment. Mark it MAINTENANCE:
a change to the prose baseline must change this table.

Tests: `resolveArchetype` on `{ archetype: 'input', name: 'Button' }` → `'input'`
(explicit wins); on `{ name: 'Text Field' }` → `'input'`; on
`{ name: 'IconButton' }` → `null`; on `{ archetype: 'nonsense', name: 'Button' }`
→ `'button'` (unknown explicit falls through to the name). `missingStates` on a
Button record with `states: { hover: '', focus: '', disabled: '' }` →
`['active']`; with all four → `[]`; on `{ name: 'Card' }` with no states → `[]`;
on `{ name: 'Button' }` with no `states` key → all four.

Verify: `node --test` → the new file's tests pass, suite green.

### Step 4 — The store: load, merge, fingerprint

Files: `scripts/lib/proof.mjs` (new), `scripts/lib/proof.test.mjs` (new)

Change: a zero-dependency module. Import `stableStringify` and `fingerprint`
from `./doc-record.mjs` — do not write a second hash.

- `PROOF_DIR = 'design-system/proof'`.
- `STAGES` — the v1 stage vocabulary,
  `['component-builder', 'storybook-chromatic-builder', 'token-sync-layer']`.
- `PER_COMPONENT_STAGES` — `new Set(['component-builder', 'storybook-chromatic-builder'])`.
  Every other stage in `STAGES` is system-wide and keyed by the subject
  `"system"`. This is the constant `checkProof` asks "is this stage keyed by
  component?"; it lives here, with the rest of the store's vocabulary, rather
  than being implied by the prose in `references/proof-bundle.md`.
- `DERIVED_RULE_SCOPE` — `{ 'orphan-token': 'system', 'state-incomplete': 'component', 'name-drift': 'component' }`,
  which tells the reader how to compare a recorded result against a rerun (Step 6).
- `stageAdoptedAt(manifest, stage)` → `manifest.verification?.stages?.[stage]?.adoptedAt ?? null`.
  The adoption moment is **read from the manifest, never derived from the stage
  file**. Record mode writes it once, on the stage's first `--record`, and never
  overwrites it (Step 6). Put a comment here saying why, because the derived
  version is the obvious-looking mistake: `mergeEntry` is latest-wins and
  replaces a subject's `at`, so "the earliest `at` in the file" slides forward
  every time the earliest subject is rebuilt, silently widening the exemption
  and un-flagging a component that was correctly failing.
- `stagePath(root, stage)` → `join(root, PROOF_DIR, `${stage}.json`)`.
- `loadStage(root, stage)` → the parsed object, or `null` when the file does not
  exist.
- `stageFingerprint(stageFile)` → `fingerprint(stableStringify(stageFile))`.
- `entryProblems(entry)` → an array of human-readable strings: `at` must be a
  non-empty string; `advancedBecause` must be a non-empty string; `changed` must
  be an array of strings (may be empty); `checks` must be a non-empty array, each
  member an object with a non-empty string `name`, `method` in
  `['derived', 'attested']`, `result` in `['pass', 'fail']`, and a string
  `evidence`; `screenshot`, when present, must be a string. Returns `[]` when the
  entry is well formed.
- `mergeEntry(stageFile, stage, subject, entry)` → a new stage-file object with
  `stage` set and `subjects[subject]` replaced, with subject keys sorted so the
  file is stable to write and diff.
- `recordedChecks(stageFile)` → a flat array of
  `{ subject, name, method, result, evidence }` across every subject, for the
  reader to compare against.

Tests: `entryProblems` returns `[]` for a well-formed entry, and one problem each
for a missing `at`, an empty `checks`, a `method` of `"guessed"`, a `result` of
`"maybe"`. `mergeEntry` on a `null` stage file creates
`{ stage, subjects: { Button: … } }`; on an existing file replaces one subject
and leaves the other untouched, with keys sorted. `stageFingerprint` is stable
across key insertion order (build the same object two ways, assert equal hashes)
and changes when any value changes. `stageAdoptedAt` returns the manifest's recorded
`adoptedAt` for a stage, `null` for a stage the manifest does not list, and
`null` for a manifest with no `verification` — and, as the regression that
pins the decision, **is unchanged by `mergeEntry` replacing the earliest
subject's `at` with a later one**.
`PER_COMPONENT_STAGES` holds `component-builder` and not `token-sync-layer`, and
every one of its members is in `STAGES`.

Verify: `node --test` → the new tests pass, suite green.

### Step 5 — The three derived checks

Files: `scripts/verify-check.mjs` (new), `scripts/verify-check.test.mjs` (new)

Change: the pure half of the gate — no CLI yet, no `process.exit`. Header comment
in the style of `scripts/docs-check.mjs:1-14`: what the gate is, the failing and
informational classes, the usage line, and a pointer to this spec. Imports:
`loadRecord` from `./lib/doc-record.mjs`, `flattenDtcg` from `./lib/dtcg.mjs`,
`walk`, `normalizeName` from `./lib/source-scan.mjs`, the new
`./lib/component-states.mjs` and `./lib/proof.mjs`.

Export, each pure and separately testable:

- `normalizeText(s)` → `String(s).toLowerCase().replace(/[^a-z0-9]/g, '')`. This
  is `normalizeKey` from `validate-token-output.mjs`; it is re-declared here
  rather than imported because that script is not in this install set. Say so in
  a comment.
- `aliasTargets(flat)` → the set of token paths referenced by any token's
  `$value`, found with the DTCG reference form `{path}` anywhere in a string
  value (an object value's string members count too).
- `checkOrphanTokens({ flat, fileTexts, records })` → `{ failures, inert }`.
  A token is a **candidate** when its own `$value` is a string containing a
  `{…}` reference. A candidate is **bound** when it is in `aliasTargets`, or its
  `normalizeText(path)` is a substring of any entry of `fileTexts` (each entry
  pre-normalized by the caller), or any record's `tokensUsed` contains a string
  whose `normalizeText` equals it. Unbound candidates become
  `{ rule: 'orphan-token', token }`. `inert` is `true` when there were no
  candidates at all.
- `checkStates({ records })` → failures `{ rule: 'state-incomplete', name, missing }`
  from `missingStates`, plus informational
  `{ rule: 'archetype-unknown', name }` for a record `resolveArchetype` returns
  `null` for.
- `checkNames({ built, meta, records })` → for each name in `built`, compare
  `normalizeName` of: the manifest name; the record's `name` when a record
  exists; and, when `meta[name]?.doc?.surfaces?.storybookMdx?.file` is set, the
  basename minus its extension and the parent directory name of that path. Any
  disagreement is one `{ rule: 'name-drift', name, spellings: { manifest, record, file, dir } }`
  listing only the surfaces that were available.

**How a record is found for a name.** `records` is a `Map` keyed by component
name, never an array: the caller (Step 6) keys each loaded `*.doc.json` by
`meta[name].doc.path` when the manifest sets one for that name, and otherwise by
the file's basename minus `.doc.json` — the naming `component-doc-schema.md:105-112`
already documents. `loadRecord` (`scripts/lib/doc-record.mjs:52`) just parses, so
the key comes from where the file was found, not from inside it. The record's own
`name` field is therefore one of the spellings being compared and never the key
— which is what makes manifest `Button` plus a record named `Buttons` a
`name-drift` failure rather than a record that silently cannot be found.
`checkStates` reads the same map and reports `archetype-unknown` against the key.

Put a comment above `checkOrphanTokens` stating the permissive-substring limit
from the Decisions table, in the style of `scripts/lib/dtcg.mjs:87-92`.

Tests, each with inline fixtures:
- `aliasTargets` finds a reference in a plain string value and in an object
  value's member.
- `checkOrphanTokens`: a semantic token nothing names → one failure; the same
  token mentioned in a file text → none; the same token in a record's
  `tokensUsed` → none; the same token referenced by another token → none; a
  primitive (literal value) nothing names → none; a source with no aliases at all
  → `inert` true.
- `checkStates`: a Button record missing `disabled` → one failure naming
  `disabled`; a complete Button → none; a `Card` → none; an unresolvable name →
  no failure and one `archetype-unknown`.
- `checkNames`: manifest `Button` with a record named `Buttons` → one failure; a
  `storybookMdx` file of `packages/ui/src/Btn/Btn.mdx` under manifest `Button` →
  one failure; `packages/ui/src/Button/Button.mdx` → none; a component with no
  record and no surface → none.

Verify: `node --test` → the new tests pass, suite green.

### Step 6 — The reader, the recorder and the report

Files: `scripts/verify-check.mjs`, `scripts/verify-check.test.mjs`

Change: add the proof-integrity layer, the report and the CLI.

- `checkProof({ manifest, root, derived, built, meta, skipped })` → when
  `manifest.verification` is absent entirely, the single informational
  `proof-unadopted` and nothing else. Otherwise, for each stage named in
  `manifest.verification.stages`:
  - `proof-missing` when the stage file is not on disk. This class owns "the file
    is gone"; `proof-stale` never fires for a missing file.
  - `proof-stale` when the file exists and its recomputed `stageFingerprint` ≠
    the recorded `fingerprint`.
  - `proof-missing` (per component) for each stage in `PER_COMPONENT_STAGES`
    whose file exists: a name in `components.built` with no `subjects[name]`
    entry that clears **both** gates below. Both must be true before it is
    flagged, and each rules out a different false failure.
    - **The stage owes it an entry** — `stageOwes(stage, name, meta)`:
      `component-builder` is owed by every name in `components.built`;
      `storybook-chromatic-builder` is owed only when
      `meta[name].status === 'stable'`. A missing or unknown `status` is not
      owed. This is the manifest's own lifecycle (`references/manifest-schema.md:254-258`):
      a component is created at `draft` by `component-builder` and promoted to
      `stable` by `storybook-chromatic-builder` once its code and stories are
      built and approved. **A `draft` component is one that has not reached the
      storying stage — the normal state between the two skills — and flagging it
      would fail every component built in Figma and not yet storied.** Put that
      sentence in the comment above the rule.
    - **It postdates adoption** — `meta[name].updatedAt` parses as a date
      strictly later than `stageAdoptedAt(manifest, stage)`. A component with no
      `updatedAt`, an unparseable one, or one that predates adoption is exempt:
      it was built before this system adopted the bundle, and failing it is the
      warning wall the Adoption decision rules out. The exemption is a stated
      false negative; put it in the comment too.

    A stage the manifest lists with no `adoptedAt` at all (a store recorded
    before this field existed) exempts every component for that stage rather
    than flagging all of them — the same adoption posture, applied to the
    pointer itself.
  - `proof-contradicted` when a recorded check whose `method` is `"derived"`
    disagrees with the rerun. How they are compared comes from
    `DERIVED_RULE_SCOPE`:
    - **component-scoped** (`state-incomplete`, `name-drift`): a check recorded
      under subject `S` with `result: "pass"` contradicts when the rerun's
      failures for that rule name `S`; `result: "fail"` contradicts when they do
      not.
    - **system-scoped** (`orphan-token`): the rerun found orphans or it did not,
      system-wide. Any recorded `orphan-token` check, under any subject,
      contradicts when its `result` disagrees with that — the subject says where
      the claim was recorded, not what it was about, and the report prints both.
    - A recorded derived check whose rule is in `skipped`, or whose name is not
      in `DERIVED_RULE_SCOPE`, is not compared. A rule this run did not compute
      cannot contradict anything, and pretending otherwise would fail a repo for
      using `--skip`.
- `formatReport(result)` → an array of lines, headed by a count line in the shape
  `validate-adherence.mjs`'s uses, and counting **subjects, not rules**:
  components checked, records read, token candidates considered, files scanned,
  stages read. Then an `excluded:` line naming each owner package set aside and
  how many files it held, in the shape `validate-adherence.mjs:676` prints
  (`excluded: <n> file(s) in <dir>, the package that owns --tokens`), then
  `skipped:` when `--skip` was passed, then failures one per
  line as `  - [rule] detail`, then informational lines as `  ~ …`. Every rule
  prints what to do about it, the way `docs-check.mjs:109` names
  `/document-component`.
- `main()` with `parseArgs`: `root` (string, default `'.'`), `tokens`
  (string, multiple), `source` (string, multiple), `skip` (string, multiple), and
  the recorder's `record` (boolean), `stage` (string), `subject` (string),
  `entry` (string).
  - **Gate mode** (no `--record`): read `design-system.json` under `--root`,
    exit `2` with a message when it is absent (same wording shape as
    `docs-check.mjs:93`). Load every `--tokens` file, merge with `flattenDtcg`.
    Walk each `--source` dir (or `--root` when none given) with `walk` from
    `lib/source-scan.mjs`, **then partition out the package that owns
    `--tokens`** — `import { tokenPackageDirs } from './validate-adherence.mjs'`
    and drop every walked path under one of the returned dirs, counting what was
    set aside for the report's `excluded:` line. Pre-normalize the text of what
    survives. Port the partition from `validate-adherence.mjs:800-812`, realpath
    comparison included, rather than writing a second one: a tmpdir fixture or a
    symlinked checkout would otherwise never match. **Without this the
    `orphan-token` rule cannot fire at all** — Style Dictionary writes every
    token by name into `packages/tokens/<platform>/`
    (`skills/token-sync-layer/SKILL.md:204`), `SOURCE_EXT` yields `.css`, `.mjs`
    and `.js`, and nothing in `DEFAULT_EXCLUDES` covers that directory, so under
    the registered `--root ../..` the generated output binds every semantic token
    to itself. Say that in the comment above the partition.
    Importing is deliberate and changes no line of `validate-adherence.mjs`: the
    function is already exported (`:445`), that script is already in this install
    set, and its `main()` is guarded by the house `import.meta.url` idiom, so
    importing it runs nothing. Load every
    `design-system/docs/components/*.doc.json` into the `Map` Step 5 describes,
    keyed by basename minus `.doc.json`, with a `meta[name].doc.path` that points
    elsewhere winning for that name. Run the three checks, minus any named in
    `--skip`, then `checkProof`. Fail with `nothing-verified` when the enabled
    derived rules **examined nothing**: no alias candidate for `orphan-token`, no
    doc record for `state-incomplete`, and no name in `components.built` for
    `name-drift`. The count is of subjects, not of rules switched on — a rule
    that ran over zero subjects has verified nothing, and counting it as having
    run would pass a system with no doc records at all. A rule switched off with
    `--skip` is absent and contributes nothing either way. Fail with
    `orphan-rule-inert` when `orphan-token` ran and had no candidates; both can
    fire on the same run, as `nothing-scanned` and `colour-rule-inert` already
    do. Print the report; exit `1` on any failure, else `0`.
  - **Record mode** (`--record`): require `--stage` and `--entry`; `--subject`
    defaults to `"system"`. **`design-system.json` must already exist under
    `--root`; exit `2` with the same message shape as gate mode when it does
    not.** Manifest rule 1 (`references/manifest-schema.md:9`) has each skill
    create the manifest with defaults if absent, but that is the owning skill's
    job on its own first action — this CLI is a recorder those skills call after
    they have already read and written it, so a missing manifest here means the
    caller is pointed at the wrong root, and creating one would bury that in a
    stray file. Read and `JSON.parse` the entry file, run
    `entryProblems`, exit `2` listing them when non-empty. `loadStage`,
    `mergeEntry`, write the stage file (pretty-printed, trailing newline,
    creating `design-system/proof/`), then read `design-system.json`, set
    `verification.path` to `PROOF_DIR` and `verification.stages[stage]` to
    `{ at: entry.at, fingerprint: stageFingerprint(next) }`, bump
    `schemaVersion` to `7` when it is lower, and write it back with two-space
    indentation and a trailing newline. **Set `adoptedAt` on that stage to
    `entry.at` only when the stage has none — never overwrite an existing one.**
    It is the one field in the store that records when this system opted in, and
    a value that can be rewritten is a value that slides: `at` is replaced on
    every re-record, so an `adoptedAt` that followed it would widen the
    `proof-missing` exemption every time the oldest component was rebuilt. Print
    one line naming the stage, the subject and the fingerprint. Exit `0`.
- Guard `main()` with the house idiom:
  `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)`.

Tests, using `mkdtempSync` fixtures and a `runCli` helper that spawns the script
with `node` (model it on `scripts/validate-token-output.test.mjs`'s helper):
- A clean system exits `0` and prints no failure lines. State the fixture
  explicitly: `components.built` is `["Button", "Card"]`, both carry a
  `meta[name].updatedAt` earlier than the stage's recorded `adoptedAt`, and only
  `Button` has an entry — so `Card` is exempt under the adoption scope, and the
  clean run is clean for the reason the design says it is.
- The same system with `disabled` removed from the Button record exits `1` and
  the output names `state-incomplete`. **This is the discriminating control for
  the clean run above** — assert both in the same test file.
- The same system with `Card`'s `meta.updatedAt` moved past the stage's
  `adoptedAt` and still no entry exits `1` with `proof-missing` — the control
  that proves the adoption scope is a scope and not an off switch.
- **The lifecycle gate, both ways, for `storybook-chromatic-builder`.** A
  `draft` component whose `updatedAt` postdates `adoptedAt` with no entry exits
  `0` — the stage does not owe it one yet, which is the normal state of a
  component built in Figma and not yet storied. The same component at
  `"status": "stable"` exits `1` with `proof-missing`. Assert both in one test:
  the only difference between them is the status, and that is the whole claim.
- **`adoptedAt` does not slide.** Record a second entry for the earliest subject
  with a much later `at`, then re-run: a component that was failing
  `proof-missing` still fails. This is the regression for the store's
  latest-wins `at`, and it is the test that would have caught the earlier
  earliest-entry-in-the-file design.
- **`orphan-token` is not blinded by the tokens package.** A fixture with
  `packages/tokens/package.json`, a `packages/tokens/dtcg/tokens.json` passed as
  `--tokens`, and a generated `packages/tokens/web/tokens.css` naming every
  token, walked with `--root` at the fixture root: the orphaned semantic token
  still fails, and the report prints the `excluded:` line naming that package.
  Without the partition this test passes green with no failure, which is the bug
  it exists to hold shut.
- A manifest with no `verification` exits `0` and prints `proof-unadopted`.
- A stage file whose content is edited after recording exits `1` with
  `proof-stale`.
- An entry recording `orphan-token` as `pass` for a system that has one exits `1`
  with `proof-contradicted`.
- A run with no `--tokens` and every other rule skipped exits `1` with
  `nothing-verified`.
- A system with every rule enabled but no doc records and an empty
  `components.built` exits `1` with `nothing-verified` — the case that separates
  counting subjects from counting enabled rules.
- An entry recording `state-incomplete` as `pass` for a subject the rerun fails
  exits `1` with `proof-contradicted`, and the same check recorded for a subject
  the rerun passes does not.
- Record mode writes the stage file, stamps the manifest and bumps
  `schemaVersion` 6 → 7; a second record for another subject leaves the first
  intact and changes the fingerprint.
- Record mode with a malformed entry (no `advancedBecause`) exits `2` and writes
  nothing.

Verify: `node --test` → all pass, suite green.

### Step 7 — Manifest schema 7

Files: `references/manifest-schema.md`

Change:
- Heading and the JSON block: `schemaVersion` `6` → `7`, and add a top-level
  `"verification": null` after `"retrofit"` and before `"completedSkills"`.
- A `### verification` field-reference section after `### retrofit`, in the
  existing register: the pointer at the folder-resident proof store, `null` until
  the first stage records an entry; `path` the store directory
  (`design-system/proof`); `stages` an object keyed by stage name holding
  `{ at, adoptedAt, fingerprint }`, where `fingerprint` is over the whole stage
  file so a hand-edited entry is caught, `at` is the latest recorded entry's
  timestamp, and `adoptedAt` is the first one's — written once and never
  overwritten, since it is what scopes the per-component `proof-missing` rule to
  components that postdate the system's adoption of the bundle. State that the manifest holds pointers and hashes,
  never entries, for the same reason `meta[name].doc` does, and that skills write
  it only through `verify-check.mjs --record`. Link
  `${CLAUDE_PLUGIN_ROOT}/references/proof-bundle.md`.
- A `**v6 → v7 migration:**` paragraph at the end, matching the two above it: add
  `verification` (default `null`), populated on the first recorded stage entry.
  Bump `schemaVersion` to `7`. No existing field changes.

Files: `references/component-doc-schema.md`

Change: add `archetype` to the schema block (`"archetype": "button"`) and to the
field list as optional classification metadata — one of `button`, `input`,
`choice`, `card`, `modal`, `badge`, `other` — stating that it is **excluded from
the fingerprint**, like `provenance`, because it is classification rather than
projected content, and that `verify:check` reads it to decide which baseline
interaction states a component owes. Add `"active"` to the example record's
`states` object: the example is a Button, and the baseline requires it.

Verify: `node ci/validate-skills.mjs` → passes. With Step 2's
`validateReferenceJson` in place this is a real check on both edited files: every
JSON block in `manifest-schema.md` and `component-doc-schema.md` parses, and the
manifest doc's `schemaVersion` is still asserted to be an integer. Without that
step it would have covered only the first block of `manifest-schema.md`. `node
--test` → green: the doc-record fingerprint tests must be unaffected, which is
the point of keeping `archetype` out of `PROJECTED_KEYS`.

### Step 8 — The install set

Files: `scripts/README.md`

Change:
- Three rows in the main script table, in the documentation-scripts region:
  `verify-check.mjs` (purpose: the verification proof bundle — records each
  stage's entry and re-derives what it can, failing on an orphaned token, a
  component missing a baseline interaction state, a name that drifts between the
  manifest, its record and its code surface, or a recorded result the rerun
  contradicts; installed as `verify:check`), `lib/proof.mjs` and
  `lib/component-states.mjs` (both `—` in the "Installed as" column).
- The **Documentation scripts — install as a set** table: add
  `verify-check.mjs` with
  `"verify:check": "node scripts/verify-check.mjs --root ../.. --tokens dtcg/tokens.json"`,
  and `lib/proof.mjs` and `lib/component-states.mjs` with `—`. The paths are
  explicit for the same reason the `adherence:check` row's are: cwd is the
  package holding the script, and a bare `node scripts/verify-check.mjs` passes
  no `--tokens`, which by this gate's own rule skips `orphan-token` on every run.
  Say in the paragraph under the table that `verify:check`, like
  `adherence:check`, carries placeholder paths the installing skill substitutes
  for the repo's layout — and that dropping `--tokens` rather than substituting
  it is how a repo ends up with a rule that never runs.
- The sentence above that table (`scripts/README.md:34`): "the same **eight**
  files and register the same **four** scripts" → **eleven** and **five**.
- **`scripts/README.md:49`**, the line under the table: "check `package.json` for
  all **four** npm scripts every time" → "all **five** npm scripts every time".
  It is inside the section `parseDocsSet` reads (the marker down to the next
  `## `, which is `## Usage`), and `COUNT_RE`
  (`ci/validate-install-sets.mjs:105`) matches `four npm scripts`, so
  `countProblems` fails the build on it exactly as it would the sentence above
  the table. Those are the only two count claims in the section; both move.
- A `## Usage` paragraph for the gate after the `validate-token-output.mjs` one:
  the two modes, the flags, that a skipped rule is absent rather than inert, that
  a run with no `--tokens` reports `orphan-token` as skipped rather than passed,
  the permissive-substring limit stated plainly, and the derived-vs-attested
  rule. Add its invocation to the fenced usage block at the top of `## Usage`.

Files: `skills/storybook-chromatic-builder/SKILL.md`

Change: Step 1's install paragraph — "copy the eight files and register the four
npm scripts" → "copy the eleven files and register the five npm scripts", and
extend the substitution sentence that already singles out `adherence:check`
(`skills/storybook-chromatic-builder/SKILL.md:36-42`) to name `verify:check`
too: its `--root` and `--tokens` need the repo's real paths, and registering it
without `--tokens` leaves `orphan-token` skipped on every run. Do not restate the
file list; that table is the single source of truth, as the paragraph already
says.

Verify: `node ci/validate-install-sets.mjs` → passes, and its output line reports
`docs set (11 files)`. This step is the one most likely to fail that gate: it
checks both the import closure and every stated count.

### Step 9 — Where stages emit

Files: `skills/component-builder/SKILL.md`

Change:
- Step 4.5, in the archetype-enrichment bullet (2): after matching the nearest
  archetype, record its id in the record's `archetype` field, and name the seven
  ids.
- Step 6, after the manifest paragraph: record the stage entry. One call per
  component, `node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-check.mjs --record
  --stage component-builder --subject <Name> --entry <tmp>.json`, with the entry
  carrying `changed` (what was built), the attested checks
  `structural-read-back`, `state-baseline` and `figma-name` from what the
  executor returned, `review` when a reviewer ran, `screenshot` when one was
  captured, and `advancedBecause`. Point at
  `${CLAUDE_PLUGIN_ROOT}/references/proof-bundle.md` for the shape rather than
  restating it. Say plainly that an entry is written only for a component that
  actually finished, and that a `BLOCKED` component gets none.

Files: `skills/storybook-chromatic-builder/SKILL.md`

Change: Step 7, alongside the manifest updates — record one entry per finalized
component for stage `storybook-chromatic-builder`, with attested `build` (the
story build outcome) and `review` checks, `advancedBecause`, and **the two
component-scoped derived results (`state-incomplete`, `name-drift`) read off the
`verify:check` report from Step 5.5**, recorded with `method: "derived"`. This is
the one stage that records derived results, and it can only do so because it has
already run the gate — say that, and point at
`${CLAUDE_PLUGIN_ROOT}/references/proof-bundle.md` for the shape.

In Step 5.5's "Wire the gate" paragraph
(`skills/storybook-chromatic-builder/SKILL.md:250-253`), add `verify:check`
beside `docs:check` as part of the repo's verification, and run it once here —
**with the repo's real `--tokens` path**, so `orphan-token` actually runs rather
than reporting as skipped. All three rules go live now (Decisions); if the orphan
rule misfires on this repo, `--skip orphan-token` is the documented answer and it
prints on the report's `skipped:` line. Dropping `--tokens` is not: that switches
the rule off silently.

**State the ordering invariant explicitly, in both steps, because the gate runs
before the recorder and that is not an accident.** Step 5.5 runs `verify:check`
while this run's components are still `draft` — Step 6 is what promotes them to
`stable`, and Step 7 is what records their entries. So the stage is owed nothing
for them yet and the gate passes; by the next run they are `stable` and have
entries. A reader who moves the `verify:check` call after Step 6, or the
recording before it, breaks that: the components would be `stable`, owed an
entry, and not yet have one. Say in Step 6 that the promotion to `stable` is what
makes a component owe a `storybook-chromatic-builder` entry, so nobody reorders
the two without seeing the consequence.

Files: `skills/token-sync-layer/SKILL.md`

Change: Step 6, alongside `sync.lastRun` — record one entry for stage
`token-sync-layer`, subject `system`, with `changed` summarising tokens added,
changed, deleted and probable renames, and the attested `tokens:validate-output`
result as a check.

Files: `agents/figma-executor.md`

Change: in step 4's structural self-verify loop, add the baseline-state
assertion: before finalizing, compare the spec's declared `state` axis against
the archetype baseline in
`${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md`, and return
`BLOCKED` naming the missing state rather than building a matrix that omits one.

**Write the scope into the same line, in the imperative the agent file uses.**
The assertion applies only when the component is one the standards prose names
outright — a Button, an Input / text field, or a Checkbox / radio / toggle /
chip (`references/figma-component-standards.md:126-138` gives a baseline for
those three and no others). For anything else — a Card, a Modal, an
`IconButton` — the executor does not assert states and does not block. Say why
in the line: `BLOCKED` stops the build, so a mirror that guesses at an archetype
turns the cheapest kind of false positive into the most expensive one, and this
is the same conservative rule `resolveArchetype` follows on the CLI side.

In step 6, add that the return names the state axis values it saw, so the
dispatching skill can record them. Agents are not part of the adapter generator,
so no regeneration is needed for this file alone.

Verify: `node ci/validate-skills.mjs` and `node ci/validate-install-sets.mjs`
pass; read each edited step back and confirm it names the command and the
reference, and restates neither the entry shape nor the install list.

### Step 10 — Regenerate adapters and run the full gate set

Files: `adapters/**` (generated)

Change: `node scripts/adapters/generate.mjs`. Never hand-edit anything under
`adapters/`.

Verify: run all seven CI commands from the top of this Plan; every one exits `0`.

### Step 11 — CHANGELOG

Files: `CHANGELOG.md`

Change: one bullet under `[Unreleased]` → Added, written with the
`write-like-jordan` skill and matching the register of the entries beside it. It
names: the new `verify:check` gate and the store it reads
(`design-system/proof/<stage>.json` plus the manifest's `verification` pointer);
manifest `schemaVersion` 7, additive with a `null` default; the three rules that
fail (`orphan-token`, `state-incomplete`, `name-drift`) and what each means in
one clause; the derived-vs-attested rule, since it is the thing a user has to
understand to read a report; and that it is installed with the documentation
scripts and runs nothing until a repo registers it — the same caveat the
adherence-gate entry carries. No version bump, no `[Unreleased]` move.

Verify: read it back against the two entries above it for register and shape.

### Step 12 — Measure it end to end, with controls

Files: `docs/superpowers/notes/2026-09-12-proof-bundle-e2e.md` (new), this spec

Change: build a fixture design system in the session scratchpad — a
`design-system.json` at `schemaVersion: 6` whose `components.built` is
`["Button", "Card"]`, with `components.meta` giving both an `updatedAt` dated
before the entry recorded in step 1 below; two doc records (a complete `Button`
and a `Card`); a small DTCG source with primitives and semantics; and a source
file that references some of them. Give the fixture a real
`packages/tokens/package.json` with the DTCG source under it and a generated
`packages/tokens/web/tokens.css` naming every token, so the owner-package
partition is exercised by the end-to-end run and not only by a unit test.

**Run it the strong way: copy the docs install set into the fixture and invoke
`npm run verify:check` from there**, substituting the registered command's
placeholder paths for the fixture's real layout — not
`node scripts/verify-check.mjs --root <fixture>` from the plugin checkout. The
fixture run is the one that proves what this step is for: that the install set
closes, that the registered form is substitutable, and that a consumer who
follows `scripts/README.md` ends up with `orphan-token` actually running. The
in-place invocation would skip all three.

1. Record a `component-builder` entry for `Button` only; show the stage file, the
   manifest pointer and the bump to `7`.
2. Run the gate clean → exits `0`. `Card` has no entry and does not fail, because
   its `updatedAt` predates the stage's recorded `adoptedAt` — that is the
   adoption scope working, and the note should say so rather than leave it
   looking like luck. The report's `excluded:` line should name
   `packages/tokens`; quote it, since it is the evidence that `orphan-token` is
   looking at application code rather than at generated token output.
3. **The discriminating controls, each run immediately after the clean run and
   each of which must fail:** delete `disabled` from the Button record
   (`state-incomplete`); add a semantic token nothing names (`orphan-token`);
   rename the record to `Buttons` (`name-drift`); hand-edit the stage file
   (`proof-stale`); delete the stage file (`proof-missing`); promote `Card` to
   `"status": "stable"` and move its `updatedAt` past the stage's `adoptedAt`
   with no entry recorded for it (`proof-missing`, per component); record
   `orphan-token` as `pass` with an orphan present (`proof-contradicted`); run
   with every rule skipped (`nothing-verified`).
4. **Two controls for the rules that can fail silently rather than loudly.**
   These are the ones a green run cannot distinguish from a working gate, so
   each needs its own pass/fail pair in the note:
   - **The orphan rule is not blinded by generated output.** With the orphan
     token from step 3 still present, confirm it fails. Then delete
     `packages/tokens/package.json` so the partition can no longer find an owner
     package, re-run, and show the orphan going *undetected* — the gate comes
     back green on a system that still has an orphan. Restore the file and show
     it failing again. That pair is the only evidence that the `excluded:` line
     is doing work rather than decorating the report.
   - **The lifecycle gate is a gate, not an off switch.** Add a third component
     at `"status": "draft"` whose `updatedAt` postdates `adoptedAt`, with no
     `storybook-chromatic-builder` entry: the gate exits `0`, because a
     component built in Figma and not yet storied owes that stage nothing. Flip
     it to `"stable"` and re-run: `proof-missing`. Nothing else changes between
     the two runs.
5. Restore, re-run clean → exits `0` again.

Write the note with the real commands and their real output, following
`ci/README.md:69-99`: the clean result counts only because the controls in the
same session failed the way this spec says they must. If a control comes back
clean, the harness is broken — fix it and repeat, do not record the run.

Then add `## What shipped` and `## Where it diverged` to this spec and set
`Status: built`.

Verify: the note contains both the clean run and every control's output; `node --test`
and the six other CI commands are green on the final tree.
