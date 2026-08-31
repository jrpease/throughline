# Group-level `$type` (#85) — e2e against zygarden

**Date:** 2026-08-31
**Gate for:** the #85 fix — routing all three text-role gates through DTCG 5.2.2
resolved types instead of each token's own literal `$type`.
**Verdict:** PASS. The fix makes two legal encodings of the same source emit
**byte-identical** output. Released 0.17.0 does not: it loses 12 symbols.

## Why this run exists

#85 claims a group-level `$type` makes the native text-role pipeline a silent
no-op. Unit tests can show the stamp appears; they cannot show what Compose
actually receives. This run measures the emitted output — running the
preprocessor is not running the pipeline.

## Harness

**Rebuilt**, because the prior session's harness had been partly cleared from
`/private/tmp` — `build.mjs`, `tokens/` and `node_modules/style-dictionary`
were gone while the directory tree survived. Anyone reading a note that says
"reused, still alive" should check before believing it.

- **Style Dictionary:** 4.4.0, installed fresh in the harness directory.
- **Source:** the same 15 zygarden token files, from
  `~/Dev/zygarden-brand-guide/libs/tokens/src/tokens/`. Read-only; that repo was
  not modified.
- **Mode pin:** light + mobile (the build drops any filename containing
  `desktop` or `dark`) — 12 of the 15 files, matching every prior run.
- **Module install, by copy and not symlink:** `lib/dtcg.mjs`,
  `lib/native-literal.mjs`, `lib/sd-native.mjs`. **Three files, not the two the
  2026-08-21 note lists** — that note's install list omits `native-literal.mjs`
  and a rebuild from it fails at import. This run is direct evidence for #87.
- **Branch:** `fix/85-group-type-resolution`; the "main" column is `a349453`,
  which is 0.17.0 as published.

## The fixture, and why it is legal rather than contrived

`group-type.mjs` re-encodes the source so `$type` sits on the **group** instead
of on each token, wherever a group's direct token children all agree on one
type. It moved `$type` off **167 of 322 tokens**.

This is not a mutation of meaning. DTCG 5.2.2 says a token's own `$type` wins,
otherwise the nearest ancestor group's — so both encodings describe the same
322 tokens, and a correct pipeline **must** emit the same bytes for both. That
is the discriminating property #77 asks for: the PASS condition is not an empty
diff against nothing, it is agreement between two encodings that are required to
agree.

A node carrying a `$value` is a token, not a group (DTCG 6.1), so the script
never makes a dual node an inheritance source. Dual-node children keep their own
`$type`. This fixture therefore tests group inheritance only, not the hoist
carry — see the open question below.

## Control — the fix changes nothing on the source as authored

zygarden types every token node, so 5.2.2 inheritance never fires on it. Both
builds of the **unmodified** source:

```
Tokens.kt    IDENTICAL
Tokens.swift IDENTICAL
```

No regression on the validation target, which is also why no previous e2e caught
this bug.

## Result — the group-typed encoding

| | main (0.17.0 as released) | with the fix |
|---|---|---|
| Kotlin declarations | **205** | **208** |
| `.sp` occurrences | **39** | **48** |
| unmatched source tokens | 6 | 3 |
| `unreferenced-text-sibling` advisories | **0** | **5** |
| vs. the per-token-typed build | differs | **byte-identical** |

**Twelve symbols, in two groups.**

Nine font sizes regress from `sp` to `dp` — `textXs`, `textSm`, `textBase`,
`textLg`, `textXl`, `text2xl`, `text3xl`, `text4xl`, `text5xl`. That is #51's
accessibility fix silently un-applied: Android text stops responding to the
user's system font-size setting.

Three letterSpacing symbols **vanish entirely** — `typographyLetterSpacingTight`,
`...Normal`, `...Wide`, which is why the declaration count falls 208 → 205. An
`em` value with no text role has no native form and is filtered out of Compose
output, so the tokens are not wrong, they are absent.

Swift is byte-identical in every combination. The sp/dp distinction is
Compose-only.

## The silent half, confirmed exactly

On main, against the group-typed source, `tokens:validate-output` reports:

```
tokens:validate-output — 205/205 emitted symbols matched a source token (100%)
5 advisory note(s) — reported, not gating:      (all unitless-dimension)
6 source token(s) had no matching emitted symbol.
```

**Zero `unreferenced-text-sibling` advisories.** A green run, a 100% match, and
nothing anywhere saying the text-role pipeline did not fire. With the fix, five
fire and name the tokens the graph could not reach — `text.6xl` through
`text.9xl` and `typography.letterSpacing.widest`.

## Compile verification

`ci/compile-native-output.mjs` (#82) against the fixed output:

```
[PASS] kotlin: typechecked to bytecode (against ci/stubs, not real Compose)
[PASS] swift: parsed only (UIKit unavailable; -typecheck impossible)
exit=0
```

## Corrections to what #85 says

- **The issue says "nothing is stamped at all" and "zero `sp`".** On this source
  it is 39 `sp`, not zero — a *partial* no-op. The member-name pass (#51) keeps
  working wherever the typographic members carry their own `$type`, and in
  zygarden they sit in mixed-type groups (`fontSize` beside `fontFamily` and
  `fontWeight`) that cannot legally hoist a shared type. The **graph-inference
  half is a total no-op**: all nine of 0.17.0's headline symbols, plus the three
  em letterSpacing tokens, are lost. "Zero `sp`" needs a source that also
  group-types its typographic members; that shape is covered by unit test, not
  by this run.
- **The issue's severity ranking is right for the wrong reason.** It is not that
  more tokens are affected than expected — it is that everything 0.17.0 shipped
  four days ago is undone by a re-encoding the spec explicitly permits.

## Open question this run did not settle

`hoistDualNodes` carries a dual node's `$type` onto a hoisted child where DTCG
inheritance supplies none. That carry runs **after** classification — it must,
because classification matches on the leaf name the hoist consumes. So a child
typed *only* by the carry is never stamped as text. Unchanged by this fix and
left alone deliberately: the carry is the hoist repairing what the hoist broke,
not a reading of the source, and stamping on an invented type would be a claim
the source never made. Pinned by test, filed separately rather than changed
under cover of #85 — which is the mistake #63 was careful not to make here.

## Reproduce

```
$ cd <harness>
$ node group-type.mjs tokens tokens-grouped     # moved $type off 167 tokens
$ node build.mjs tokens        out-85-head
$ node build.mjs tokens-grouped out-85g-head
$ diff out-85-head/Tokens.kt out-85g-head/Tokens.kt   # empty, with the fix
```
