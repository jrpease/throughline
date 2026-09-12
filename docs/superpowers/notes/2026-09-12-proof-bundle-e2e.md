# Verification proof bundle — end-to-end run (#110)

Date: 2026-09-12
Subject: `scripts/verify-check.mjs`, Plan Step 12 of
`docs/specs/2026-09-12-verification-proof-bundle.md`

Unit tests prove the rules. Only a real install proves that a consumer who
follows `scripts/README.md` ends up with a gate that runs. This is that run, with
every control the spec asks for.

## The harness

A fixture design system in the session scratchpad, built by a script rather than
by hand so it can be rebuilt:

```
design-system.json                              schemaVersion 6, no verification key
design-system/docs/components/Button.doc.json   complete, archetype button
design-system/docs/components/Card.doc.json     archetype card
apps/web/app.tsx                                binds color.bg.primary, space.md
packages/tokens/package.json                    the owner package
packages/tokens/dtcg/tokens.json                4 primitives, 4 semantics
packages/tokens/web/tokens.css                  generated, names every token
packages/tokens/scripts/                        the docs install set, 11 files
```

`components.built` is `["Button", "Card"]`, both at `"status": "draft"`.

**Run the strong way, not the convenient one.** The eleven files of the
documentation install set were copied into `packages/tokens/scripts/` and all
five npm scripts registered, then every run below is `npm run verify:check` from
`packages/tokens` — not `node scripts/verify-check.mjs --root <fixture>` from the
plugin checkout. That is what proves the install set closes under its imports,
that the registered form is substitutable, and that `orphan-token` actually runs
for someone who follows the README.

The registered command needed no editing for this layout:

```json
"verify:check": "node scripts/verify-check.mjs --root ../.. --tokens dtcg/tokens.json"
```

`--root ../..` reaches the fixture root from the tokens package, and
`--tokens dtcg/tokens.json` is the real source. A consumer who drops `--tokens`
instead of substituting it gets `orphan-token` skipped on every run, which is the
failure mode the README paragraph exists to prevent.

## Baseline: a system that has not adopted the bundle

Before any entry is recorded, the manifest has no `verification` key at all:

```
verify:check — 2 component(s), 2 doc record(s), 4 token candidate(s), 1 file(s) scanned, 0 stage file(s) read
  excluded:     12 file(s) in ../../packages/tokens, the package that owns --tokens
1 informational note(s) — reported, not gating:
  ~ [proof-unadopted] design-system.json has no "verification" key, so this system has not adopted the proof bundle and the proof-integrity checks are skipped. The first verify-check.mjs --record adopts it.
exit=0
```

The three derived rules still ran — 4 token candidates, 2 records, 2 components —
and the proof-integrity checks were skipped. An existing system upgrading to
schema 7 sees this, not a wall of failures.

## 1. The first record adopts the bundle

```
node scripts/verify-check.mjs --record --stage component-builder --subject Button \
  --entry entry-button-cb.json --root ../..
✓ verify:check — recorded component-builder · Button (f17fafe54790d753)
```

The stage file at `design-system/proof/component-builder.json` holds one subject,
`Button`, with its four attested checks (`structural-read-back`,
`state-baseline`, `figma-name`, `review`), a screenshot pointer and
`advancedBecause`. The manifest gained the pointer and the bump:

```json
schemaVersion: 7
{
  "path": "design-system/proof",
  "stages": {
    "component-builder": {
      "at": "2026-09-12T10:00:00Z",
      "adoptedAt": "2026-09-12T10:00:00Z",
      "exempt": ["Card"],
      "fingerprint": "f17fafe54790d753"
    }
  }
}
```

`exempt` is `["Card"]`, and that is the capture-once-then-shrink rule working in
one step: the first record captured the whole of `components.built`
(`["Button", "Card"]`) and then removed its own subject. `Button` is proven,
`Card` is grandfathered.

## 2. The clean run

```
verify:check — 2 component(s), 2 doc record(s), 4 token candidate(s), 1 file(s) scanned, 1 stage file(s) read
  excluded:     12 file(s) in ../../packages/tokens, the package that owns --tokens
exit=0
```

`Card` has no entry and does not fail. That is the adoption scope working, not
luck — it is in the `exempt` list quoted above. The `excluded:` line is the
evidence that `orphan-token` is reading application code rather than the token
package's own generated output: 12 files set aside, 1 file scanned, and that one
file is `apps/web/app.tsx`.

## 3. Eight controls, each the single difference from that clean run

Each control was applied to the clean system, run, and reverted before the next,
so no control can fail for an earlier control's reason.

| Control | Reported | Exit |
| --- | --- | --- |
| `disabled` deleted from the Button record | `[state-incomplete] Button documents no disabled state — its archetype's baseline requires it.` | 1 |
| A semantic token nothing names | `[orphan-token] color.bg.danger — an alias no other token references, no scanned file mentions and no doc record lists in tokensUsed.` | 1 |
| Record renamed to `Buttons` | `[name-drift] Button is spelled Button (manifest), Buttons (record), Button (file), Button (dir) — one component, more than one name.` | 1 |
| Stage file hand-edited | `[proof-stale] design-system/proof/component-builder.json does not match the fingerprint in design-system.json — it was edited outside the recorder.` | 1 |
| Stage file deleted | `[proof-missing] component-builder is listed in design-system.json verification.stages, but design-system/proof/component-builder.json is gone.` | 1 |
| `Dialog` added to `components.built`, no entry | `[proof-missing] component-builder owes Dialog an entry and has none — record one with verify-check.mjs --record --stage component-builder --subject Dialog.` | 1 |
| `orphan-token` recorded as `pass` with an orphan present | `[proof-contradicted] component-builder recorded orphan-token as "pass" for Button, but this run derives "fail". A derived result is a cache, not a claim.` | 1 |
| Every rule skipped | `[nothing-verified] the enabled rules examined nothing: no alias token candidate, no doc record, no component in components.built.` | 1 |

Two details worth keeping. The `Dialog` control is the one that proves the
adoption scope is a scope and not an off switch: `Dialog` was added after the
capture, so it is not in `exempt`, and it fails. And the `proof-contradicted`
control reported **two** failures — the orphan itself and the contradiction —
which is right: the recorded cache and the thing it was wrong about are separate
problems.

Restored, the system returns to `exit=0`.

## 4. The three controls for rules that can fail silently

### The harness bug this run found

The first attempt at the partition control did not discriminate, and it is worth
recording why. The control adds an orphan token to `dtcg/tokens.json`, deletes
`packages/tokens/package.json` so the partition can no longer find an owner
package, and expects the orphan to go *undetected* because the generated
`web/tokens.css` — now scanned — names every token.

It came back red instead:

```
verify:check — … 5 token candidate(s), 13 file(s) scanned, 1 stage file(s) read
  - [orphan-token] color.bg.danger — an alias no other token references…
exit=1
```

13 files scanned and no `excluded:` line, so the partition was genuinely off —
but the orphan was still caught, because the fixture's generated CSS was stale.
I had added the token to the DTCG source and not to the generated output, which
Style Dictionary would have rewritten. The control was asserting nothing.

Per `ci/README.md:69-99`, a control that comes back the wrong way means the
harness is broken, not the code clean. Fixed by keeping the generated output in
sync with the source the way a real build would, and repeated below.

### The orphan rule is not blinded by generated output

With the orphan in both the source and the generated CSS:

```
# owner package intact
verify:check — 3 component(s), 2 doc record(s), 5 token candidate(s), 1 file(s) scanned, 2 stage file(s) read
  excluded:     12 file(s) in ../../packages/tokens, the package that owns --tokens
  - [orphan-token] color.bg.danger …
exit=1

# packages/tokens/package.json deleted
verify:check — 3 component(s), 2 doc record(s), 5 token candidate(s), 13 file(s) scanned, 2 stage file(s) read
exit=0

# package.json restored
  excluded:     12 file(s) in ../../packages/tokens, the package that owns --tokens
  - [orphan-token] color.bg.danger …
exit=1
```

**The middle run is the point.** The gate comes back green on a system that still
has an orphan, because the token package's own generated output binds every
semantic token to itself. That pair is the only evidence that the `excluded:`
line is doing work rather than decorating the report — without the partition,
`orphan-token` could never fire on a real repo.

The middle run was invoked as `node scripts/verify-check.mjs --root ../.. --tokens
dtcg/tokens.json` rather than through `npm run`, because deleting
`package.json` deletes the npm script. Same command, same cwd, same arguments.

The orphan was then removed from both files and the system confirmed clean at
`exit=0` before either control below, both of which assert a zero.

### A promotion does not drag a grandfathered component into the gate

`Card` was built before adoption and is in `component-builder`'s `exempt` list.
Refreshing its `updatedAt` to today and setting its `status` to `"stable"` —
exactly what a `storybook-chromatic-builder` run does when it promotes a
component built before adoption:

```
verify:check — 2 component(s), 2 doc record(s), 4 token candidate(s), 1 file(s) scanned, 1 stage file(s) read
  excluded:     12 file(s) in ../../packages/tokens, the package that owns --tokens
exit=0
```

Still clean, and no `proof-missing` for `Card`. Nothing about `Card` changed
except a timestamp a *different* stage wrote. This is the end-to-end form of the
regression against the date-comparison design this spec replaced: had the gate
compared `meta[name].updatedAt` against `adoptedAt`, one promotion run would have
failed every component that predates the bundle.

This ran while `component-builder` was still the only listed stage, so it
isolates that stage's grandfathering.

### The lifecycle gate is a gate, not an off switch

Two prerequisites first, or the control tests nothing. A
`storybook-chromatic-builder` entry for `Button`, so that stage is in
`verification.stages` and `checkProof` iterates it at all:

```
✓ verify:check — recorded storybook-chromatic-builder · Button (0cb0cd334e1967f0)
{ "at": "2026-09-12T11:00:00Z", "adoptedAt": "2026-09-12T11:00:00Z",
  "exempt": ["Card"], "fingerprint": "0cb0cd334e1967f0" }
```

Then `Menu` added at `"status": "draft"` *after* that record, so it is not in the
storybook stage's captured `exempt`, and a `component-builder` entry recorded for
it so the only stage that can still owe it anything is the storybook one.

```
# Menu at draft
verify:check — 3 component(s), 2 doc record(s), 4 token candidate(s), 1 file(s) scanned, 2 stage file(s) read
exit=0

# Menu flipped to stable, nothing else changed
  - [proof-missing] storybook-chromatic-builder owes Menu an entry and has none — record one with verify-check.mjs --record --stage storybook-chromatic-builder --subject Menu.
exit=1
```

The only difference between those two runs is the status, and that is the whole
claim. A component built in Figma and not yet storied owes the storying stage
nothing — the normal state between the two skills. Once promoted, it owes an
entry. The failure line names the stage that reported it, which matters because
two stages can owe entries for the same component.

## 5. Restored

`Menu` back to `draft`:

```
verify:check — 3 component(s), 2 doc record(s), 4 token candidate(s), 1 file(s) scanned, 2 stage file(s) read
  excluded:     12 file(s) in ../../packages/tokens, the package that owns --tokens
exit=0
```

## Residual risk

- **The fixture is authored, not harvested.** The token source, the doc records
  and the consuming app were written for this run. The rules and the report are
  proven against real-shaped inputs and the install set is proven to close, but
  no run here reads a design system a person built for their own purposes.
- **`orphan-token`'s noise on a real app is still unmeasured.** One authored
  orphan in a four-semantic system says the rule fires and that the partition is
  load-bearing. It says nothing about the false-positive rate on a real codebase,
  which is the open question the spec carries and `--skip orphan-token` is the
  escape hatch for.
- **The attested half is unexercised end to end.** Every attested check here came
  from a hand-written entry file, not from a live `figma-executor` return. What
  is proven is that the store records them and the report prints them, never that
  an agent fills them in correctly.
- **One entry per stage-and-subject, latest wins.** The `proof-contradicted`
  control overwrote `Button`'s `component-builder` entry to set it up. That is
  the documented no-history behaviour, and it means a rebuild erases what the
  previous build proved.
