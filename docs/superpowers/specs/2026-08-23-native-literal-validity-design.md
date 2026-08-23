# Native literal validity — design

**Issue:** [#53](https://github.com/jrpease/throughline/issues/53)
**Date:** 2026-08-23
**Revision:** 2 — the shared predicate was redesigned after review; see
[Revision history](#revision-history).

## The problem

Fifteen symbols per generated file are not valid Swift or Kotlin. Measured on a
real 322-token DTCG source, in all four generated files (`ios-swift` and
`android-kotlin` × light and dark):

```swift
public static let typographyFontFamilyWeb = Nunito Sans                          // 14 of these
public static let gradientBrandPrimary = linear-gradient(90deg, #77AE17 0%, ...)  // 1
```

Out of 196 declarations. Both pass `tokens:validate-output` today, because
`matched` increments when an emitted symbol's *name* resolves to a source token
and a non-numeric value is never compared. So the gate reports 196/196 and exit
0 over output that does not compile.

`ios-swift` was restored to Tier 1 in #50 on the strength of that run. #50 added
a caveat beside the tier table rather than leave the inference standing, but a
caveat is not a fix.

### Why nothing catches it

Two independent gaps line up:

1. **Style Dictionary quotes by `$type`.** `content/swift/literal` and
   `asset/swift/literal` quote `$type: content` and `$type: asset`. A
   `$type: fontFamily` token matches neither and passes through bare. This is
   stock behaviour — `sd-native.mjs` keeps both stock transforms; there simply
   is no stock transform for `fontFamily`.
2. **`no-foreign-syntax` matches only `color-mix|calc|var`**
   (`scripts/validate-token-output.mjs:88`), so it never sees
   `linear-gradient(`.

### What the source actually contains

Grounding matters here, because the issue title says "gradient" and the source
says otherwise:

| Token | `$type` | `$value` |
|---|---|---|
| `gradient.brand.primary` | **`string`** | `linear-gradient(90deg, #77AE17 0%, #AFEF21 100%)` |
| `typography.fontFamily.Web` | `fontFamily` | `Nunito Sans` |

There is **one** `fontFamily` token. The 14 emitted symbols are it plus 13
aliases at `typography.textStyle.*.fontFamily`, which the
`dtcg/resolve-dual-node` preprocessor resolves to it before Style Dictionary
runs.

So this is not a gradient-specific gap. It is **a string-valued token whose
value has no valid native literal form**, and `$type: gradient` is not
involved.

## The general discriminator

A CSS function and a native call expression look alike until you check the
callee:

- `linear-gradient` and `color-mix` are **not valid Swift or Kotlin
  identifiers** — the hyphen disqualifies them.
- `calc` and `var` *are* valid identifiers, but their arguments
  (`1rem + 2px`, `--x`) are not literals.
- `Nunito Sans` is two adjacent identifiers with no operator between them.

A recursive literal grammar rejects all four **without naming any of them**.
That is the property worth having: the next unanticipated case is caught by the
same rule, which is what the issue means by "it would have caught both cases
without anyone anticipating `fontFamily` specifically."

### Grammar

```
literal  := number | string | boolean | call | unitized
call     := ident '(' ( arg (',' arg)* )? ')'
arg      := (ident ':')? literal
number   := '-'? ( digits ('.' digits)? | '.' digits | '0x' hexdigits ) suffix?
string   := '"' ( escape | not-quote-not-newline )* '"'
boolean  := 'true' | 'false'
unitized := number '.' unit
ident    := [A-Za-z_][A-Za-z0-9_]*
```

The parser **must consume the whole value**: trailing input after a complete
literal is a failure, so `400 garbage` is rejected. Whitespace is permitted
around `(`, `,`, `:` and `)`.

Per-platform:

| | `suffix` | `unit` | `escape` |
|---|---|---|---|
| `ios-swift` | — | — | `\0 \\ \t \n \r \" \' \u{…}` |
| `android-kotlin` | `f` `F` `L` | `dp` `sp` `em` | `\\ \t \n \r \" \' \$ \uXXXX` |

The escape sets are per-platform on purpose: `\$` is valid in Kotlin (escaping
template interpolation) and is **not** a valid Swift escape. A shared escape set
would over-accept on iOS. An unterminated string, or a raw newline inside one,
is a failure on both.

`sp` and `em` are accepted although the current build emits neither, because
#51 and #52 will make them appear and a grammar that rejected them would turn
those fixes into false failures.

### Verified against real output

Every one of the 196 real declarations was enumerated by distinct
right-hand-side shape, and a prototype of the grammar above was run against
them:

| Shape | Platform | Verdict |
|---|---|---|
| `CGFloat(14.00)` | ios-swift | accept |
| `UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)` | ios-swift | accept |
| `Color(0xffffffff)` | android-kotlin | accept |
| `16.00.dp` | android-kotlin | accept |
| `400` | both | accept |
| `Nunito Sans` | both | **reject** |
| `linear-gradient(90deg, #77AE17 0%, #AFEF21 100%)` | both | **reject** |

Two rejected shapes, 15 symbols — exactly the defect and nothing else. **The
grammar introduces no false positive on any output this project currently
produces.** That is measured against live repo code in the surviving #50 e2e
harness, not reasoned about.

Note `16.00.dp` is correctly *rejected* for `ios-swift`, which has no `unit`
production. The grammar discriminates by platform rather than accepting a union.

## Changes

### 1. `scripts/lib/native-literal.mjs` — the shared grammar (new file)

The grammar has three consumers, so it is its own module rather than living in
either of them. This follows the precedent set by `lib/dtcg.mjs`, which #34
extracted for exactly this reason — one reader shared by both token gates.

```js
export function isValidLiteral(value, grammar) -> boolean
export const GRAMMAR = { 'ios-swift': {...}, 'android-kotlin': {...} }
```

Zero dependencies, so it installs into a consumer's `packages/tokens/scripts/`
beside `lib/dtcg.mjs` and `lib/sd-native.mjs` the same way they do.

### 2. `scripts/validate-token-output.mjs` — the `invalid-literal` rule

**Rule interaction.** `14px` would satisfy `no-bare-units` *and*
`invalid-literal`; `calc(1rem + 2px)` would satisfy `no-foreign-syntax` *and*
`invalid-literal`. Reporting a symbol three times is noise. So:

> `invalid-literal` is recorded for a symbol only when neither
> `no-foreign-syntax` nor `no-bare-units` fired on that same symbol.

The specific rules keep their specific, actionable messages, their existing
tests pass unchanged, and the general rule is the net underneath them. Neither
existing rule is deleted: `no-foreign-syntax` names the CSS construct, which
diagnoses better than "not a valid literal."

**Placement.** The check sits **beside the other two rules, before the
name-match `continue` at `validate-token-output.mjs:134`**. A symbol whose name
does not resolve to a source token is still subject to all three rules —
otherwise a broken symbol could escape the gate purely by being unnamed in the
source, which is the wrong direction for a validity check.

**Message.** `invalid-literal` must say what was expected, since "invalid" alone
sends the reader nowhere:

```
- [invalid-literal] typographyFontFamilyWeb: emitted `Nunito Sans` is not a valid
  ios-swift literal — parsing stopped at "Sans" (offset 7); a string value must
  be quoted
- [invalid-literal] gradientBrandPrimary: emitted `linear-gradient(90deg, ...)` is
  not a valid ios-swift literal — parsing stopped at "-gradient(..." (offset 6);
  a call expression's callee must be a valid identifier
```

The parser returns the offset and remaining text where it stopped, so the
diagnosis is derived rather than pattern-matched against a list of CSS function
names.

### 3. `scripts/lib/sd-native.mjs` — quoting, and a second filter predicate

**Two quoting transforms, not one:**

- `value/swift-string-literal`
- `value/kotlin-string-literal`

Kotlin must escape `$` — `"$foo"` is template interpolation, so an unescaped
`$` in a token value silently changes meaning or fails to compile. Swift must
not. Both escape `\` and `"`, and both encode a literal newline as `\n`. A
single platform-sniffing transform would hide that difference; two named
transforms mirror the existing `size/unit-aware/swift` vs
`size/unit-aware/compose-dp` split, which is the module's established shape.

**Filter — an explicit `$type` set:**

| `$type` | Quoted? |
|---|---|
| `fontFamily` | yes |
| `string` | yes — **unless the value is CSS-function-shaped** |
| `fontWeight` | only when non-numeric |
| anything else | no |

**The refusal is load-bearing, and revision 2 lost it.** `gradient.brand.primary`
is `$type: string`. Blanket-quoting that type turns
`linear-gradient(90deg, ...)` into `"linear-gradient(90deg, ...)"` — which
parses as a valid literal, survives the filter, and ships. That is the option
this design's own §"The general discriminator" rejects outright: output that
compiles and means nothing, and *worse* than the bug being fixed, because a
syntax error a compiler catches becomes a plausible string constant it does
not. It also defeats `invalid-literal`, the rule built for this exact symbol.

So the quoting transform **refuses** a value shaped like a function call:

```js
const CSS_FUNCTION = /^[A-Za-z][A-Za-z0-9-]*\s*\(/;
```

This is the predicate revision 1 called `hasNoNativeForm`. Revision 1 was wrong
to hand it to the *filter*; revision 2 over-corrected by deleting it entirely,
taking the quoting refusal with it. It is correct here and only here, because
`isQuotable` is already narrowed to string-valued `$type`s — colours never
reach it, so the false positives that killed revision 1's filter use cannot
occur.

The `fontWeight` predicate, stated so it cannot be read two ways:

```js
Number.isNaN(Number(String(value).trim()))
```

`fontWeight: "bold"` is quoted; `fontWeight: "400"` and `fontWeight: 400` are
not, and continue to emit as valid native integers. DTCG permits the keyword
form, which would otherwise emit as a bare identifier and hit the identical
failure.

A DTCG `fontFamily` may be an array (`["Nunito Sans", "sans-serif"]`). It is
joined with `", "` and quoted once.

The module's own comment warns that "a hand-picked list silently drops whatever
it forgets," and that warning was correct when nothing backstopped it. It is
answered here by the `invalid-literal` rule landing in the same change: a
`$type` the list forgets now **fails the gate loudly** instead of shipping
broken. That is the division of labour this design rests on —

> the transform handles the types we know; the validator catches the ones we
> didn't.

It is also why the two halves ship together rather than as separate PRs. Either
alone leaves the other's failure mode open.

**The filter — `emitsNativeLiteral`, composed with the existing
`nativeFilter`.**

The gradient must not be emitted. The question is what predicate decides that,
and revision 1 got it wrong (see [Revision history](#revision-history)).

`nativeFilter` keeps its current contract exactly — *"is the **authored** value
a web-only unit"* — along with its existing tests. A second, separate predicate
is added:

```js
export function hasNativeForm(token, platform)
// isValidLiteral($value) || !CSS_FUNCTION.test($value)
```

It asks a different question — *"after every transform has run, is this value
something the target language could express at all?"* — and it reads the
**transformed** `$value`, not `original.$value`. `nativePlatform()` composes
the two at the one place that knows the platform:

```js
filter: (token) => nativeFilter(token) && hasNativeForm(token, platform)
```

**Only a value that is both invalid *and* function-shaped is dropped.** An
earlier draft dropped everything the grammar rejected, which silently swallowed
`duration` (`200ms`), `cubicBezier` (`0.5,0,1,1`), and — on Kotlin only, which
has no stock content/asset quoting transform — `content` and `asset` tokens.
That directly contradicted the division of labour below: a `$type` the quoting
list forgets is supposed to fail **loudly**, and a filtered token never reaches
`invalid-literal` at all (`unemittedTokens` is informational and never fails
the gate). Measured on a real build with probe tokens for each of those types,
the two-part predicate drops only the gradients and leaves all four loud, on
both platforms.

Two named predicates, one job each, composed once. This replaces revision 1's
single `hasNoNativeForm` regex, which was measured to be wrong in both possible
readings.

Why the grammar is the right filter, and not a special case: a filter that asked
"is this a CSS function" needs an exemption for every transform that rescues one
— `value/color-mix-to-hex8` first, and whatever comes next — which is precisely
the hand-picked list this module indicts. Asking "did the transforms produce a
valid literal" needs no exemptions at all, because a rescued value passes on its
own merits. It also means the filter automatically respects a consumer's added
transforms rather than second-guessing them.

**Measured, on live repo code, both platforms:** with the grammar as the filter
predicate and *before* the quoting transform exists, the set it removes is
exactly the 15 broken symbols — `typography.fontFamily.Web`, the 13
`typography.textStyle.*.fontFamily` aliases, and `gradient.brand.primary`. Zero
of the 11 `color-mix` tokens, zero of the 74 colours, and zero of the 89
dimensions are touched.

### 4. Documentation

- `references/native-adapter-config.md` is **generated** from `sd-native.mjs`
  by slicing on `@doc-section` markers and is gated in CI by
  `build-native-adapter-config.mjs --check`. New module code must sit inside a
  marker pair — the generator fails when code falls outside every pair — and
  the doc must be regenerated in the same commit.
- `references/sync-adapters.md` carries the #50 caveat stating the output does
  not compile. It is retired, and replaced with what remains true after this
  change (see [Limitations](#limitations-stated-rather-than-hidden)).

## Testing

Verification is layered, because a grammar is exactly the kind of thing that
passes its own hand-written examples and fails on real output.

1. **Grammar, table-driven** (`native-literal.test.mjs`, new) — the seven real
   shapes above with their verdicts, plus `calc(1rem + 2px)`, `var(--x)`,
   `color-mix(in srgb, #fff 10%, transparent)`, `14px`, `"quoted"`, `true`, a
   nested call, `400 garbage` (trailing input), `"unterminated`, a zero-argument
   call, and the per-platform pairs: `16.00.dp` accepted for `android-kotlin`
   and rejected for `ios-swift`; `"a\$b"` accepted for Kotlin and rejected for
   Swift.
2. **Rule interaction** (`validate-token-output.test.mjs`) — `14px` reports
   `no-bare-units` once and *not* `invalid-literal`; `calc(...)` reports
   `no-foreign-syntax` once and not `invalid-literal`; `Nunito Sans` reports
   `invalid-literal` alone. An unmatched symbol with a broken value still
   reports (placement, per §2).
3. **Non-regression on #52** — `1.50.dp` must still pass. This change must not
   mask an open issue.
4. **Transforms and filter** (`sd-native.test.mjs`) — quoting per `$type`, the
   `fontWeight` numeric/keyword split, array join, `$` escaped for Kotlin and
   not for Swift, `"` and `\` escaped for both. `nativeFilter`'s existing tests
   are unchanged; `emitsNativeLiteral` gets its own. The existing
   `p.files[0].filter === nativeFilter` identity assertion
   (`sd-native.test.mjs:170`) becomes a behavioural assertion, since the filter
   is now a composition.
5. **End-to-end, through real Style Dictionary 4.4.0** — rebuild all four
   combinations against live repo code and assert:
   - `invalid-literal` count on the **pre-fix** snapshot is 15 per file — the
     rule catches the real defect;
   - the count on **post-fix** output is 0;
   - the declaration total and `matched` both fall 196 → 195 — the filtered
     gradient and nothing else — with `unemittedTokens` rising by exactly 1;
   - no other rule newly fires, and the `measure.mjs` value-verified split is
     unchanged for every non-string token.

   Step 5 is the one that matters. Steps 1–4 prove the code does what it says;
   only step 5 proves it does it to the artifact the issue is about.
6. **Repo gates** — `node --test`, plugin manifests, skill frontmatter,
   adapters `--check`, doc-card `--check`, native-config `--check`.

### What is measured today, and what is still a prediction

Stated separately, because this area was demoted once for overclaiming:

- **Measured** against live repo code: the 15-symbol defect reproduces in all
  four files; the grammar accepts all 196 current declarations except those 15;
  the grammar-as-filter removes exactly those 15 and nothing else on both
  platforms.
- **Predicted, and to be confirmed by step 5:** that after the quoting
  transform runs, the 14 `fontFamily` symbols become valid quoted strings and
  survive the filter, leaving 195. This assumes `$type: fontFamily` survives the
  resolve/hoist preprocessor on all 14. #55 documents that `hoistDualNodes`
  drops `$type` on hoisted children, so type survival through that pipeline is
  exactly the kind of thing that fails. Step 5 catches it if it does.

## Limitations, stated rather than hidden

- **Nothing is compiled.** No `swiftc` or `kotlinc` runs. `invalid-literal`
  asserts that a value is a well-formed *literal*, not that the file compiles —
  a call to an undefined function or a type mismatch still passes. This narrows
  the "does not compile" gap; it does not close it. The
  `references/sync-adapters.md` wording must say that, not imply a compiler ran.
- **The gradient is dropped, not translated.** A consumer who wants it on
  native must author a native-expressible token. The drop appears in
  `unemittedTokens`, so it is visible in the report rather than silent — but
  `unemittedTokens` is informational and never fails the gate, so a future
  authored `calc(...)` token would be excluded without failing anything. That is
  consistent with the existing `%`/`em` treatment and is a stated choice, not an
  oversight. It is also the reason the filter is deliberately narrow: **only**
  CSS-function-shaped values take this silent path. Anything else the grammar
  rejects is emitted and fails `invalid-literal` loudly, because a silent drop
  is the weaker outcome and should be reserved for the one case where no native
  form exists at all.
- **The filter now depends on transform output.** `emitsNativeLiteral` reads the
  transformed `$value`, so a consumer who removes a transform changes what is
  filtered. This is the intended behaviour — the filter's question is "did the
  transforms handle this" — but it is a real coupling and is worth knowing when
  debugging an unexpected drop.
- **Colour values are still matched by name only.** No rule compares a colour's
  value to its source. Unchanged by this work, and still true of the 74 colour
  symbols per file.

## Out of scope

#51 (Compose `sp`/`dp`), #52 (unitless ratios), #54 (`PLATFORMS` derivation),
#55 (`hoistDualNodes`). This change must neither fix nor mask them. Test 3
exists specifically to prove #52 is still reachable afterwards, and the grammar
accepts `.sp` so that #51's fix does not read as a new failure.

## Revision history

**Revision 3 (2026-08-23)** — Task 3's review found a Critical defect authored
in revision 2, measured on real output: the gradient was **quoted rather than
dropped**, emitting
`public static let gradientBrandPrimary = "linear-gradient(90deg, ...)"` and
leaving 196 declarations where this spec requires 195. `emitsNativeLiteral`
dropped **zero** tokens on both platforms — the filter, the larger half of the
change, was inert against the artifact it exists for.

Cause: revision 1's `hasNoNativeForm` served two consumers. Its *filter* use was
wrong and revision 2 correctly replaced it with the grammar — but revision 2
deleted the predicate outright, silently losing its *quoting-refusal* use, which
had been correct. `$type: string` then blanket-quoted the gradient.

A second finding from the same review: dropping everything the grammar rejected
turned loud failures into silent drops for `duration`, `cubicBezier`, and
Kotlin `content`/`asset`, contradicting this design's own central claim.

Both are fixed above: the refusal returns, scoped to the quoting transform
only, and the filter drops only what is invalid **and** function-shaped. Two
lessons worth keeping — a predicate correct for one consumer is not thereby
correct for another, and deleting a shared helper must account for every use
it served, not just the broken one.

**Revision 2 (2026-08-23)** — review found the revision 1 predicate blocking.
Revision 1 proposed a single `hasNoNativeForm(value)` regex,
`/^[A-Za-z][A-Za-z0-9-]*\s*\(/`, shared by the filter and the quoting transform.
Both possible readings were measured to be wrong:

| Applied to | Tokens dropped |
|---|---|
| `original.$value` | 12 — the 11 `color-mix` tokens `value/color-mix-to-hex8` exists to rescue, plus the gradient |
| transformed `$value` | 164 — 74 `UIColor(...)`, 89 `CGFloat(...)`, plus the gradient: essentially the whole file |

The regex accepts hyphenated and valid-identifier callees alike, which is
exactly what the "general discriminator" section says must be distinguished. It
is replaced by `emitsNativeLiteral`, which reuses the grammar and needs no
exemption list. The revision-1 claim that one predicate could serve both
consumers unchanged was wrong.
