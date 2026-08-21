# Token output validation — session handoff

**Date:** 2026-08-21
**Landed:** [#34](https://github.com/jrpease/throughline/pull/34) (squashed as `c9dcf91`)

## What shipped

`scripts/validate-token-output.mjs` — a zero-dependency validator that checks
generated native (Swift/Kotlin) token output against its DTCG source. Five
rules: `unit-fidelity` (judged against the **authored unit**, not a fixed
factor), `no-foreign-syntax`, `no-bare-units`, `no-mode-collision`,
`unverifiable-dimension`. Exit `0` pass / `1` validation failure / `2` usage
error, and **zero matches is a failure** — exit 0 never means "checked nothing".

Alongside it: one dual-node-aware DTCG reader (`scripts/lib/dtcg.mjs`) shared by
both token gates, `ios-swift` demoted out of Tier 1, and
`references/native-adapter-config.md` — the Style Dictionary configuration that
actually fixes the failures rather than only detecting them.

## The thing to understand before touching this

**The stock `ios-swift` and `compose` transform groups emit every `px`-authored
dimension at ×16 its value, in code that compiles.** `text.sm: "14px"` becomes
`CGFloat(224.00)`. That is the failure this whole area exists to prevent, and it
is invisible without the validator.

Second: **the spec's original premise was wrong, and the correction matters.**
It argued Style Dictionary could not handle real token shapes, citing zygarden's
removal of it. That removal was a YAGNI cleanup of unused output in a different
repo, months before throughline existed. A spike proved SD properly configured
emits 196 matched symbols from the same source. Every failure was a
configuration defect.

> **Correction (2026-08-21, from #35's verification run).** "196/196 correct
> symbols" overstated what was measured, and the phrase has been removed above.
> `matched` increments when an emitted symbol's name resolves to a source token;
> the value is compared only when the source value has a numeric magnitude. Of
> the 196, **107 had a magnitude verified**; colour and string values are matched
> by name only and are checked by no rule. Do not repeat the original phrasing —
> see `docs/superpowers/notes/2026-08-21-native-config-e2e-results.md`. Do not reopen "should we replace Style Dictionary" — it is
answered, and the answer is no. The reasoning is appended to
`docs/superpowers/specs/2026-08-21-token-output-validation-design.md`.

## The live thread

`references/native-adapter-config.md` documents the verified configuration, but
the **shipped presets still use stock transform groups**. So today the ×16 bug
is detectable and not fixed — a user has to apply the config by hand.

**[#35](https://github.com/jrpease/throughline/issues/35) is the highest-value
next piece of work in this area.** It closes that gap, and it is also the
re-promotion criterion for `ios-swift` back to Tier 1.

## Also open, from this session

- **Validator follow-ups:** [#36](https://github.com/jrpease/throughline/issues/36)
  (normalizeKey collision), [#37](https://github.com/jrpease/throughline/issues/37)
  (web mode), [#38](https://github.com/jrpease/throughline/issues/38)
  (asset catalogs).
- **Consumption-layer epic** — #39 through #44: letting users build apps and
  interfaces *with* a finished design system, in Figma and code, without drift or
  hallucination. **[#39](https://github.com/jrpease/throughline/issues/39) is the
  keystone** (adherence gate for generated code) and should be built first and
  alone: it is independently useful against hand-written code, and generating UI
  before it exists means generating with no way to prove adherence.
- **Audit backlog** — #45 (a11y), #46 (Figma↔code drift), #47 (per-platform
  component status), #48 (native component generation), #49 (governance).

## Open questions

- Should the code-side and Figma-side screen composition (#41 / #42) share one
  screen description, so a screen can be produced on both sides from a single
  source? Strongest version, and the one most likely to overreach.
- #44 (composed-screen drift) and #46 (Figma↔code drift) are the same problem at
  two levels. Probably one spec, not two.
- `ios-swift` re-promotion was deliberately *not* done when the config was
  documented — the shipped preset is still broken, so the badge would overclaim.
  Confirm that reasoning still holds when #35 lands.

## Working notes

- Zygarden is the real-world fixture. Tokens at
  `~/Dev/zygarden-frontend/libs/shared/util-tokens`, branch
  `feature/apply-brandguide-styles` (not `main`). Read with
  `git show <branch>:<path>` — do not check it out or modify that repo.
- Verify claims about third-party behaviour before writing them into a spec.
  Two assertions in this session's work were wrong because upstream was not
  checked: Style Dictionary's capability, and whether `ios-swift/enum.swift`
  emits inline comments. The second nearly shipped a validator that a documented
  token could defeat.
