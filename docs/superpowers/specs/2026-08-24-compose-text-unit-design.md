# Compose text units — design

**Issue:** [#51](https://github.com/jrpease/throughline/issues/51) — Compose
sp/dp split never fires on spec-compliant DTCG
**Date:** 2026-08-24
**Base branch:** `fix/55-hoist-dual-nodes` (PR #59), not `main` — see §8

## 1. The measured problem

Built zygarden's real DTCG source through the live module (Style Dictionary
4.4.0, scratch harness, `libs/shared/util-tokens/src/tokens`, light + mobile
axes, 214 `$value` entries):

| | |
|---|---|
| Kotlin declarations emitted | 195 |
| Containing `.sp` | **0** |
| Dimension-typed source tokens | 106 |
| Of those, typographic by role | 52 |

`size/unit-aware/compose-sp` filters `$type === 'fontSize'`. DTCG defines no
`fontSize` type, so the branch is unreachable and every dimension falls through
to `size/unit-aware/compose-dp`.

## 2. Two corrections to the issue's own text

Both verified, both change what this spec must do.

**2.1 The severity mechanism stated in #51 is wrong.** The issue says this is
"an accessibility regression that compiles, renders, and looks correct to a
sighted developer." It does not compile. From the androidx source
(`compose/ui/ui-text/src/commonMain/kotlin/androidx/compose/ui/text/TextStyle.kt`),
every `TextStyle` constructor overload declares:

```kotlin
fontSize: TextUnit = TextUnit.Unspecified,
letterSpacing: TextUnit = TextUnit.Unspecified,
lineHeight: TextUnit = TextUnit.Unspecified,
```

`Dp` and `TextUnit` are distinct value classes with no implicit conversion and
no `Dp` overload. `fontSize = Tokens.typographyTextStyleH1FontSize` is a
compile error.

The bug is still real and still an accessibility bug, but it arrives one step
later: the developer hits the compile error and repairs it. The idiomatic-
looking repair is `Dp.toSp()`, which divides by `fontScale` and therefore
renders at exactly the authored dp size no matter what the user set. That
compiles, renders, and looks correct — the claim #51 makes about the output is
true of the workaround instead.

This matters for scope, not just for accuracy: because the failure is a
use-site type error, a *partial* fix is worth much less than it looks. A
`TextStyle` needs all of its text-unit members to be `TextUnit` before it
compiles at all.

**2.2 The problem is three roles, not one.** `fontSize` is the smallest of the
three groups.

| Role | Source tokens | Emitted today |
|---|---|---|
| `lineHeight` | 26 | `.dp` |
| `fontSize` | 13 | `.dp` |
| `letterSpacing` | 13 | dropped before transforms (§6.2) |

## 3. The identification rule

### 3.1 Why `$type` cannot carry this

DTCG's type set is `color`, `dimension`, `fontFamily`, `fontWeight`,
`duration`, `cubicBezier`, `number`, `strokeStyle`, `border`, `transition`,
`shadow`, `gradient`, `typography`. There is no `fontSize`. Font sizes are
`dimension`, which is also what spacing, radius, and stroke widths are. No
amount of `$type` inspection separates them. The fix must source the role from
somewhere else.

### 3.2 The signal: DTCG §9.8's own member names

The Format Module 2025.10 draft (30 July 2026), §9.8, specifies the typography
composite at MUST level:

> The `$type` property MUST be set to the string `typography`. The value MUST
> be an object with the following properties:
>
> - **fontFamily**: … MUST be a valid font family value or a reference to a
>   font family token.
> - **fontSize**: … MUST be a valid dimension value or a reference to a
>   dimension token.
> - **fontWeight**: … MUST be a valid font weight or a reference to a font
>   weight token.
> - **letterSpacing**: The horizontal spacing between characters. … MUST be a
>   valid dimension value or a reference to a dimension token.
> - **lineHeight**: The vertical spacing between lines of typography. … MUST
>   be a valid number value or a reference to a number token. The number
>   SHOULD be interpreted as a multiplier of the fontSize.

So `fontSize`, `letterSpacing`, and `lineHeight` are **the specification's own
names** for these roles. Matching on them is not a heuristic this project
invented; it is reading DTCG's vocabulary.

**State the limit honestly.** The spec puts those names inside a composite
token's `$value` object. zygarden — and every Figma-derived source of this
shape — puts them as sibling *token* names inside a group. Recognising them
there is a convention that mirrors the spec, not a guarantee the spec makes.
A source naming its font size `typography.body.size` is not covered, and §7
gives it an override.

### 3.3 Rejected alternatives

| Alternative | Why not |
|---|---|
| Require `$type: "fontSize"` in the source | Style Dictionary's pre-DTCG convention. Asking sources to be non-conformant to fix a conformant-source bug inverts the problem. |
| Detect the real DTCG `typography` composite | Correct where it applies and needs no convention — but zero occurrences in the real source, and Style Dictionary does not expand composite `$value` objects into member tokens. Fixes nothing measurable today. |
| Sibling-anchored: a `dimension` in a group that also holds a `fontFamily`-typed token | Genuinely structural. Covers the same 39 tokens and no more, at higher complexity, and breaks on a group holding only sizes. No coverage gain for the cost. |
| Reference-graph inference (`text.5xl` is referenced by a `fontSize`, so it is one) | The only option that reaches all 52. Rejected for now: aliases are resolved in place by this module's own preprocessor before Style Dictionary sees them, so the graph must be captured separately, and a token referenced by two different roles has no defined answer. Recorded as the option to revisit if §6.1 proves painful. |
| A new `nativePlatform({ textUnits: [...] })` parameter | New public API surface for a need no consumer has stated. §5.3 gets the same override for free. |

## 4. Where classification runs: before the hoist

`preprocess` already does two things in order — `resolveInPlace`, then
`hoistDualNodes`. Classification is inserted **before the hoist**.

This is not a stylistic choice. `hoistDualNodes` renames
`text.xs.lineHeight` to `text.xsLineHeight`; the leaf name is consumed by the
rename. Measured: of the 39 tokens this change fixes, **13 are hoisted
children**, so classifying after the hoist would silently miss a third of
them.

Matching a suffix against the hoisted camelCase name (`…LineHeight`) was
considered and rejected: it couples the role rule to the hoist's naming
scheme, and a case-insensitive form false-positives on names like
`baselineHeight`.

## 5. The carrier: `$extensions`

### 5.1 It survives to transform time

Verified by direct probe against Style Dictionary 4.4.0: a token carrying
`$extensions` reaches a transform's `filter` with the object intact.

```
FILTER a | $ext: {"com.throughline.native":{"unit":"text"}} | keys: $type,$value,$extensions
FILTER b | $ext: undefined                                 | keys: $type,$value
```

A `WeakSet` — the mechanism #55 used to carry `WAS_REF` — is **not** an option
here. It works inside `preprocess` because the marking and the reading happen
in the same tick on the same objects. A transform filter runs after Style
Dictionary has ingested the tree, and the membership does not survive.

### 5.2 Why `$extensions` rather than a plain property

`$extensions` is DTCG's sanctioned place for tool-specific metadata, so the
stamp is legal in the tree rather than a private prop riding along. A plain
property would work mechanically; this one is also *addressable by a source*,
which §5.3 depends on.

Namespace: `com.radicool.throughline` (package is `@radicool/throughline`).
Shape:

```json
"$extensions": { "com.radicool.throughline": { "nativeUnit": "text" } }
```

### 5.3 The override is free

Classification **must not overwrite an existing
`$extensions["com.radicool.throughline"].nativeUnit`.** A source that names its
font size something else declares the role itself and is honoured, with no new
configuration parameter and no new code path — just an assignment that declines
when the key is already set. `"device"` is the explicit opt-out for a
`lineHeight`-named token that really is a `Dp`.

## 6. Scope boundaries

Three neighbouring defects are deliberately left alone.

### 6.1 The 13 `text.*` scale primitives stay `.dp`

`text.base = 16px`, `text.3xl = 30px` — the ramp the semantic tokens reference.
No signal identifies these as typographic: not nominal, not structural. A
`text.*` prefix rule would catch them here and misfire on a source using
`text.*` for copy strings, and it has no spec backing whatsoever.

The mitigating fact is that every semantic token that references them **is**
fixed, so the tokens a consumer should reach for are correct:

```kotlin
val textBase = 16.00.dp                             // raw scale, role unknown
val typographyTextStyleBodyLgFontSize = 16.00.sp    // use this
```

Documented as a known limit. Filed as a follow-up, not guessed at.

### 6.2 The 13 `letterSpacing` tokens stay dropped

They resolve to `em` values (`-0.03em`), and `nativeFilter`'s `WEB_ONLY_UNIT`
removes them before any transform runs — so they appear in neither the Kotlin
nor the Swift output today. Compose has a real `.em` `TextUnit`, so this is a
genuine gap, but it is a *filter* gap, not a dp/sp gap. Different fix, filed
separately.

They are still classified by §3.2 — the stamp is cheap and correct — and simply
never reach a transform. If §6.2 is fixed later, the role is already there.

### 6.3 The 5 `leading.*` unitless ratios stay `.dp`

`leading.normal: "1.5"` typed `dimension` emits `1.50.dp`. This is the sibling
defect #51 cross-references and `references/native-adapter-config.md` §4
already documents. Not touched.

**It does, however, constrain this design.** `magnitude()` accepts a bare
number as a ratio, so a token *named* `lineHeight` and *valued* `"1.5"` would
be stamped and emit `1.50.sp` — which compiles and renders 1.5sp text. That
converts a loud failure (a `Dp` where a `TextUnit` is required) into a silent
one, which is precisely the failure class this module exists to prevent.

**Therefore: stamp only when the authored value carries an absolute unit**
(`px` or `rem`). A bare number is not classified and keeps today's behaviour.

## 7. Behaviour change

The rule, in full:

> During `preprocess`, before hoisting: a token whose `$type` is `dimension`,
> whose leaf name is `fontSize`, `letterSpacing`, or `lineHeight`, and whose
> authored `$value` carries an absolute unit (`px` or `rem`), is stamped
> `$extensions["com.radicool.throughline"].nativeUnit = "text"` — unless that
> key is already set, in which case the source's value stands.
>
> `size/unit-aware/compose-sp` filters on `nativeUnit === "text"`.
> `size/unit-aware/compose-dp` filters `dimension` **and not** `nativeUnit === "text"`.

`ios-swift` is unchanged. `size/unit-aware/swift` filters `dimension ||
fontSize` and emits `CGFloat` for both; iOS handles Dynamic Type at the use
site via `UIFontMetrics`, not in the token file. Measured: the Swift output is
already correct.

### 7.1 Falsifiable prediction

Against the zygarden light+mobile build:

- **Exactly 39 Kotlin declarations flip `.dp` → `.sp`**
  (13 `typography.textStyle.*.fontSize`, 13 `typography.textStyle.*.lineHeight`,
  13 hoisted `text.*LineHeight`).
- **The other 156 are byte-identical.**
- **The declaration count stays 195.**
- **`Tokens.swift` is byte-identical.**

Verified by building at base and at HEAD into separate directories and running
`diff -r` — not by counting declarations, which cannot see compensating
changes.

## 8. Constraints

- **Zero dependencies.** `scripts/lib/` is installed into consumer repos.
  Style Dictionary stays a parameter, never an import.
- **Branch off `fix/55-hoist-dual-nodes`, not `main`.**
  `references/native-adapter-config.md` is generated from the *whole body* of
  `scripts/lib/sd-native.mjs`, so two branches off `main` that both touch it
  conflict guaranteed.
- **Every code line must sit inside an `@doc-section` / `@doc-section-end`
  pair.** Only blank lines and `//` comments may sit outside one; the generator
  throws otherwise and `--check` gates it in CI.
- **Regenerate the reference doc at the end of every task**, not once at the
  end. A freshness test goes red the moment the module changes, and a suite
  with a known failure is one a real regression hides behind.
- **`preprocess` must stay structurally idempotent.** `deepEqual(preprocess(preprocess(x)), preprocess(x))`
  is an existing test. Stamping is idempotent by construction; the second pass
  finds the key already set and declines.
- **Six gates must stay green:** `node --test`, `ci/validate-plugin.mjs`,
  `ci/validate-skills.mjs`, `scripts/adapters/generate.mjs --check`,
  `scripts/build-doc-card-builder.mjs --check`,
  `scripts/build-native-adapter-config.mjs --check`.

## 9. Documentation to update

- `scripts/lib/sd-native.mjs` — the `@doc-section platform` comment block
  currently describes the sp branch as unreachable. It becomes a description of
  the rule plus the §6 limits.
- `references/native-adapter-config.md` §4 — generated; regenerating covers it.
  The "Font sizes emit as `dp`, not `sp`" bullet must go, replaced by the
  narrower `text.*` and `letterSpacing` limits.
- `references/sync-adapters.md` — states `android-kotlin` stays Tier 2 and
  cites this defect as the concrete reason. The citation must be corrected.
  **The tier does not change**: §6.3's unitless ratio remains, and the stated
  Tier 2 reason is consumption-side unknowns that building tokens does not
  exercise.
- `CHANGELOG.md` — `[Unreleased]`.

## 10. Follow-ups to file

1. `text.*` scale primitives have no role signal (§6.1) — reference-graph
   inference is the candidate.
2. `em`-valued `letterSpacing` is dropped rather than emitted as Compose `.em`
   (§6.2).
