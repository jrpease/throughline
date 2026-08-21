# Token output validation — design

**Date:** 2026-08-21
**Status:** Proposed — revised after review

> **Origin.** A probe ran throughline's two native adapters (`ios-swift`,
> `android-kotlin`) against a real, shipping DTCG token source — zygarden's
> `libs/shared/util-tokens` on branch `feature/apply-brandguide-styles`, 15
> files, 322 `$value` entries. Both adapters exited `0` and produced output that
> is roughly half wrong. This spec covers making that class of failure
> detectable. It does **not** cover replacing Style Dictionary, which the probe
> also put in question — see Non-goals.
>
> **Revision note.** A critic review found the first draft's CLI contract had no
> mode axis, which broke its own symbol matching. Fixing that (Decision 3)
> converted a fourth probe finding — the 864 silent collisions — from
> undetectable into a validator rule. Four other findings are resolved inline
> and marked ⟨rev⟩.

## Problem

`skills/token-sync-layer/SKILL.md:150` tells the agent to verify each generated
adapter by checking that "the config builds, the expected files appear,
references resolve for web / flatten for native."

Every one of those checks passes on output that is unusable. The probe's
evidence, the first three surviving a *correct* per-mode configuration and the
fourth arising from the naive one:

| Failure | Count | Detected today? |
|---|---|---|
| Dimensions emitted at ×16 the authored value | 34 of 35 px primitives; 80 `CGFloat` emissions carry it | No — valid, compiling code |
| `color-mix()` expressions leaked into Swift/Kotlin | 11 per file | No — build exits 0 |
| Bare `px` / `%` literals where an expression belongs | 14 per file | No — build exits 0 |
| Whole theme dropped by path collision | 864 collisions, dark theme lost | No — build exits 0 |

The ×16 case is the serious one. `text.sm: "14px"` emits `CGFloat(224.00)`.
That is syntactically valid Swift, it compiles, it ships, and it renders every
font and spacing value at sixteen times its intended size. The cause is that the
`ios-swift` and `compose` transform groups assume dimension inputs are authored
in `rem` and multiply by 16; zygarden authors in `px`. Nothing reconciles the
assumption against the source.

The others are loud or lossy, but all four get past throughline's own
verification step and reach the user as "synced."

Two facts sharpen why this is a plugin defect rather than a zygarden quirk:

1. **The curated adapter failed identically to the generated one.**
   `ios-swift` ships as Tier 1 in `references/sync-adapters.md:38` — a "vetted
   preset, high confidence, no guessing." `android-kotlin` is Tier 2, explicitly
   unverified. They produced the same failures in the same counts. The tier
   distinction did not predict quality, which means the Tier 1 badge on
   `ios-swift` is currently making a promise the probe disproves.

2. **A precedent for the fix already exists in this repo.**
   `scripts/validate-crosswalk.mjs` is described in `scripts/README.md` as
   "resolve every `newToken` against the DTCG token source; assert resolved
   value == `newValue`, N/N. The CI gate." That is the right shape, pointed at
   generated native output instead of a crosswalk. Its *resolver* is not
   reusable — see Decision 5.

## Decisions

1. **Ship a validator, don't just document the hazard.** The failure modes are
   mechanical and so is their detection. A prose warning in `sync-adapters.md`
   would not have caught any of the four findings; a script catches all four.
   This also answers the standing critique that throughline's discipline is
   documented rather than enforced.

2. **Compare emitted values against the *authored unit*, not a fixed factor.**
   A source value in `px` must emit 1:1 (iOS points and Android dp both map 1:1
   to CSS px by convention); a source value in `rem` must emit at ×16. Today's
   bug is this rule applied unconditionally in one direction. The validator
   asserts the correct branch per token. ⟨rev⟩ The full unit table, including
   the unitless and non-expressible cases present in the fixture:

   | Authored | Expected native magnitude | Rationale |
   |---|---|---|
   | `px` | 1:1 | pt and dp map 1:1 to px by convention |
   | `rem` | ×16 | root-relative, 16px root |
   | unitless (e.g. `leading.tight: "1.1"`) | 1:1 | a ratio, not a length — never scaled |
   | `%` | *not expressible* | flagged by `no-bare-units`; excluded from `unit-fidelity` |
   | `em` | *not expressible* | parent-relative, unresolvable at build time |

3. **⟨rev⟩ The validator takes the same explicit source file list the adapter
   build used — not a directory — and treats a mode collision as a failure.**
   108 of the fixture's 322 token paths are defined in more than one file with
   different values per mode (`spacing.grid.columns` is `{spacing.space.3}` on
   desktop and `{spacing.space.1}` on mobile; every `color.bg.*` differs between
   light and dark). A directory glob therefore hands the matcher two or more
   conflicting source values per token with no way to choose.

   Passing the build's exact file list guarantees the validator and the build
   see identical inputs, with no separate mode vocabulary to drift. To close the
   case where *both* are wrong because the build globbed everything, a
   `no-mode-collision` rule fails when any token path is defined more than once
   with differing values across the given set. This is what makes the probe's
   864 collisions detectable, and it is why the mode fix earns its own rule
   rather than just a flag.

4. **Match emitted symbols to source tokens by normalized key.** Adapters name
   things differently (`color.bg.canvas` → `colorBgCanvas` in Swift,
   `color_bg_canvas` elsewhere). The validator lowercases both sides and strips
   every non-alphanumeric character, so both normalize to `colorbgcanvas`. The
   review confirmed the fixture has no cross-token collisions under this scheme
   once Decision 3 removes the mode-driven ones.

5. **⟨rev⟩ Write a dual-node-aware resolver; the crosswalk resolver cannot be
   reused.** A semantic token's unit lives on the primitive it references, so
   aliases must resolve to a terminal literal before the unit is read. But
   `flattenDtcg` in `scripts/validate-crosswalk.mjs:17-19` stops recursing at
   the first `$value` node, silently dropping dual-node children like
   `text.sm.lineHeight` — precisely the tokens most likely to be wrong. Zygarden's
   `walkTokens` (`emit-css.mjs:41-56`) is the correct shape: yield the node's own
   `$value` *and* keep descending into its non-`$`-prefixed children.

6. **⟨rev⟩ Zero matches is a failure, not a clean pass.** Exit 0 must mean
   "checked and correct," never "checked nothing." An adapter that renames
   systematically (`bg` → `background`, exactly the pattern `sync-adapters.md:38`
   shows with `Color.backgroundPrimary`) would match no tokens and pass every
   rule vacuously. The validator fails on zero matches and reports the match
   rate on every run; `--min-match <ratio>` (default `0.5`) sets a floor. The
   default is a heuristic guard against a broken naming assumption, not a
   correctness threshold, and is documented as such.

7. **Unmatched symbols are informational.** An adapter may legitimately emit
   tokens with no 1:1 source (composite text styles) or omit source tokens that
   don't apply to the platform. Failing on these would make the validator
   unusable; Decision 6 covers the case where the count is pathological.

8. **Install it into the user's repo, not just run it once.** Following
   `validate-crosswalk.mjs`'s model, the script is copied into
   `packages/tokens/scripts/` and registered as an npm script, so it remains a
   live gate on every future sync rather than a one-time check during setup.

9. **Correct the Tier 1 claim now, on this evidence.** `ios-swift` moves out of
   the curated table. This is not a deprecation — the adapter still works via
   the Tier 2 path — it removes a confidence claim the probe falsified.
   Re-promotion is available once it passes the validator against a real source.

10. **State what the adapter contract cannot express.** CSS expressions,
    dual-node DTCG, `%`/`em` dimensions, and a third mode axis are all legal in
    real token sources and all silently unsupported today. Naming them costs a
    short section and prevents the next silent failure.

## The validator

**File:** `scripts/validate-token-output.mjs`, with `scripts/validate-token-output.test.mjs`.
Zero-dependency ESM, `parseArgs` CLI, exported functions for testing — matching
every other script in `scripts/`.

**Invocation:**

```
node validate-token-output.mjs \
  --source <file.json...> \        # the exact list the adapter build used
  --output <file.swift|file.kt> \
  --platform <ios-swift|android-kotlin> \
  [--min-match <ratio>]            # default 0.5
```

**⟨rev⟩ Extraction.** Emitted `(symbol, value)` pairs are read from the
generated source with a per-platform declaration pattern — `public static let
<name> = <value>` for Swift, `val <name> = <value>` for Kotlin — taking the
remainder of the line as the raw value. Magnitude is then read from the known
dimension wrappers: `CGFloat(N)`, `N.dp`, `N.sp`, or a bare numeric. Values that
match no wrapper (colors such as `UIColor(red:…)` / `Color(0xff…)`, strings) are
exempt from `unit-fidelity` and subject only to the syntax rules. Multi-argument
constructors are never parsed for magnitude.

**Four rules:**

| Rule | Fails when | Catches |
|---|---|---|
| `unit-fidelity` | emitted magnitude ≠ expected magnitude for the authored unit (per Decision 2's table) | the ×16 scaling bug |
| `no-foreign-syntax` | output value contains `color-mix(`, `calc(`, or `var(` | leaked CSS expressions |
| `no-bare-units` | output value matches `/^-?(\d+(\.\d+)?\|\.\d+)(px\|rem\|em\|%)$/` | unresolved dual-node aliases |
| `no-mode-collision` | a token path is defined more than once across `--source` with differing values | the 864 silent collisions |

⟨rev⟩ The `no-bare-units` pattern admits negative and leading-dot magnitudes —
the fixture contains `-0.03em` at `typography-primitives.json:33`, which the
first draft's pattern would have passed.

**Output:** a per-rule tally, the match rate, and a list of failing tokens with
source value, emitted value, and rule name. Exit `0` when all rules pass and the
match rate clears the floor; exit `1` otherwise.

**Scope limits, stated rather than assumed:**

- **Native source files only in v1.** The web adapters emit CSS where `var()`
  and bare units are correct, so rules 2 and 3 invert there; a web mode is
  deferred rather than guessed at.
- **⟨rev⟩ Single output file per invocation.** `sync-adapters.md:38` describes
  `ios-swift` storing colors in asset-catalog light/dark variants — many JSON
  files. v1 validates the Swift/Kotlin source file only. Asset-catalog
  validation is a deliberate v1 limit, not an oversight; per-mode builds mean
  one invocation per mode already.

## Changes to existing files

- **`skills/token-sync-layer/SKILL.md`** — Step 3's verification criteria are
  replaced with running the validator. The current wording ("the config builds,
  the expected files appear, references resolve") is what let all four failures
  through and must not survive. Step 4 gains the install + npm-script
  registration, following the pattern `token-crosswalk-builder` uses.
- **`references/sync-adapters.md`** — `ios-swift` removed from the Tier 1 table
  (Decision 9); the curated set becomes four. Add a "What adapters cannot
  express" section (Decision 10). Add the unit-awareness requirement to the
  native-adapter description. Add the per-mode build requirement — the probe's
  864 collisions came from the naive reading of "the DTCG JSON is the universal
  input," which nothing currently warns against.
- **`README.md`** — split the "One library, many platforms" roadmap bullet
  (`README.md:208`) into an honest statement of current state.
- **`scripts/README.md`** — register the new script in the table.

## Non-goals

- **Replacing Style Dictionary.** The probe showed zygarden dropped it and
  replaced it with a 121-line direct DTCG emitter that handles all the
  fundamental failures. `references/sync-adapters.md:82` states that *every*
  adapter, both tiers, is a Style Dictionary v4 config preset — so this is a
  live architectural question. It is deliberately out of scope: the validator
  compares source tokens against emitted text and does not depend on how the
  output was produced, so it stays valuable under either answer, and shipping it
  first means the eventual decision is made against measured output rather than
  argument.
- **Fixing the transforms themselves.** The validator makes the ×16 bug
  *detectable*. Making it *not happen* means a custom unit-aware transform per
  native adapter, which is the natural next change but depends on the Style
  Dictionary decision above.
- **A web mode for the validator**, and **asset-catalog validation.** Both per
  the Scope limits above.
- **Per-platform component status, native component generation, mobile apps.**
  All downstream of a working token layer.
- **The viewport mode axis.** Documented as unsupported (Decision 10); mapping
  it to size classes and resource qualifiers is its own design.

## Phasing

- **Phase 1 — validator + tests.** The script, its unit tests built from the
  probe's real failure cases, and the `scripts/README.md` entry. Independently
  verifiable: it must flag exactly the four findings on the probe fixture and
  pass clean on a correct fixture.
- **Phase 2 — wire it in.** `token-sync-layer` Step 3 verification and Step 4
  install/registration.
- **Phase 3 — doc corrections.** `sync-adapters.md` tier change and new section;
  `README.md` roadmap bullet. No dependency on Phases 1–2; can land first if
  preferred.

## Testing

`node --test` (repo convention), plus `node ci/validate-plugin.mjs` and
`node ci/validate-skills.mjs` must stay green.

Validator unit tests assert against cases taken from the probe rather than
invented ones — the expected failures and their counts are known exactly:

- `text.sm: "14px"` emitting `CGFloat(224.00)` → one `unit-fidelity` failure.
- A `rem`-authored token emitting ×16 → passes (guards against over-correction).
- ⟨rev⟩ `leading.tight: "1.1"` (unitless) emitting `1.1` → passes; emitting
  `17.6` → one `unit-fidelity` failure.
- `color-mix(in srgb, UIColor(...) 4%, transparent)` → one `no-foreign-syntax`
  failure.
- `typographyTextStyleBodyLgLineHeight = 24px` → one `no-bare-units` failure.
- ⟨rev⟩ A bare `-0.03em` → one `no-bare-units` failure.
- ⟨rev⟩ `spacing.grid.columns` present in both mobile and desktop sources with
  differing values → one `no-mode-collision` failure.
- ⟨rev⟩ An output whose symbols match no source token → exit 1 on zero matches,
  not a vacuous pass.
- A clean native file → exit 0, zero failures.
- Symbol matching across camelCase / snake_case / kebab-case normalizes equal.
- ⟨rev⟩ A dual-node source (`text.sm` with both `$value` and a `lineHeight`
  child) → the resolver yields both, guarding the Decision 5 hole.

## Risks / open items

- **The 1:1 px→pt/dp rule is a convention, not a law.** It is the correct
  default and matches how both platforms are used in practice, but a user
  targeting a genuinely different density basis would see false failures. If
  that surfaces, the rule needs an opt-out flag; adding one now would be
  speculative.
- **⟨rev⟩ `validate-crosswalk.mjs` has the same dual-node hole, in shipped
  code.** `flattenDtcg:17-19` stops at the first `$value`, so crosswalk
  validation silently skips dual-node children today. This spec does not fix it
  — that is a separate change to a separate gate — but it is a real latent bug
  and should be filed rather than forgotten.
- **The extraction regexes are format-coupled.** They assume the
  `ios-swift/enum.swift` and `compose/object` output shapes. A different format
  option would need a different pattern; the validator should fail loudly on
  zero parsed declarations rather than silently matching nothing (Decision 6
  covers this).
- **Removing `ios-swift` from Tier 1 is user-visible.** The curated set drops
  from five to four. This is the honest move on the evidence, but it is a
  documented capability reduction and should be called out in the changelog
  rather than slipped in.
- **The validator cannot catch a wrong-but-plausible value that matches its
  source.** It verifies fidelity to the source, not that the source is right.
  Visual regression on native remains unaddressed and unrelated.
