# Native literal validity — design

**Issue:** [#53](https://github.com/jrpease/throughline/issues/53)
**Date:** 2026-08-23

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

There is **one** `fontFamily` token. The 14 emitted symbols are aliases at
`typography.textStyle.*.fontFamily` that the `dtcg/resolve-dual-node`
preprocessor resolves to it before Style Dictionary runs.

So this is not a gradient-specific gap. It is **a string-valued token whose
value has no valid native literal form**, and `$type: gradient` is not involved.

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
call     := ident '(' arg (',' arg)* ')'
arg      := (ident ':')? literal
number   := '-'? ( digits ('.' digits)? | '0x' hexdigits ) suffix?
string   := '"' ( escape | not-quote )* '"'
boolean  := 'true' | 'false'
unitized := number '.' unit                       -- android-kotlin only
ident    := [A-Za-z_][A-Za-z0-9_]*
```

Per-platform:

| | `suffix` | `unit` |
|---|---|---|
| `ios-swift` | — | — |
| `android-kotlin` | `f` `F` `L` | `dp` `sp` `em` |

`sp` and `em` are accepted although the current build emits neither, because
#51 and #52 will make them appear and a grammar that rejected them would turn
those fixes into false failures.

### Verified against real output, not assumed

Every one of the 196 real declarations was enumerated by distinct
right-hand-side shape:

| Shape | Platform | Verdict |
|---|---|---|
| `CGFloat(14.00)` | ios-swift | accept |
| `UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)` | ios-swift | accept |
| `Color(0xffffffff)` | android-kotlin | accept |
| `16.00.dp` | android-kotlin | accept |
| `400` | both | accept |
| `Nunito Sans` | both | **reject** |
| `linear-gradient(90deg, #77AE17 0%, #AFEF21 100%)` | both | **reject** |

Two rejected shapes, 15 symbols — exactly the defect and nothing else. **The new
rule introduces no false positive on any output this project currently
produces.** That is measured from the surviving #50 e2e harness, not reasoned
about.

## Changes

### 1. `scripts/validate-token-output.mjs` — the `invalid-literal` rule

A recursive-descent literal parser (~50 lines, zero dependencies, consistent
with the file's existing posture) and a per-platform grammar table beside
`DECL`.

**Rule interaction.** A value like `14px` would satisfy `no-bare-units` *and*
`invalid-literal`; `calc(1rem + 2px)` would satisfy `no-foreign-syntax` *and*
`invalid-literal`. Reporting a symbol three times is noise. So:

> `invalid-literal` is recorded for a symbol only when neither
> `no-foreign-syntax` nor `no-bare-units` fired on that same symbol.

The specific rules keep their specific, actionable messages, their existing
tests pass unchanged, and the general rule is the net underneath them. Neither
existing rule is deleted: `no-foreign-syntax` names the CSS construct, which
diagnoses better than "not a valid literal."

**Message.** `invalid-literal` must say what was expected, since "invalid" alone
sends the reader nowhere:

```
- [invalid-literal] typographyFontFamilyWeb: emitted `Nunito Sans` is not a valid
  ios-swift literal — a string value must be quoted
- [invalid-literal] gradientBrandPrimary: emitted `linear-gradient(90deg, ...)` is
  not a valid ios-swift literal — `linear-gradient` is not a valid identifier, so
  this is a CSS construct with no native form
```

The parser returns the failure position and the token that stopped it, so the
second clause is derived rather than pattern-matched against a list of CSS
function names.

### 2. `scripts/lib/sd-native.mjs` — quoting, and one shared predicate

**`hasNoNativeForm(value)`** — exported. True for a string value shaped like a
function call: `/^[A-Za-z][A-Za-z0-9-]*\s*\(/`.

It is consumed by **both**:

- `nativeFilter`, which drops such a token from native output the way `%` and
  `em` dimensions are already dropped. The drop is reported, not hidden — the
  validator's existing `unemittedTokens` counter already accounts for it.
- The quoting transforms, which **refuse** to quote such a value.

One predicate, two consumers, so they cannot disagree. The refusal matters: if
the filter is ever bypassed or overridden by a consumer, the gradient stays
bare and fails the gate loudly, rather than becoming
`"linear-gradient(90deg, ...)"` — a string that compiles and means nothing.
Output that compiles but is wrong is the exact failure class this module exists
to prevent, and quoting it would reintroduce that class in the change meant to
close it.

**Two quoting transforms, not one:**

- `value/swift-string-literal`
- `value/kotlin-string-literal`

Kotlin must escape `$` — `"$foo"` is template interpolation, so an unescaped
`$` in a token value silently changes meaning or fails to compile. Swift must
not escape it. Both escape `\` and `"`, and both encode a literal newline as
`\n`. A single platform-sniffing transform would hide that difference; two named
transforms mirror the existing `size/unit-aware/swift` vs
`size/unit-aware/compose-dp` split, which is the module's established shape.

**Filter — an explicit `$type` set:**

| `$type` | Quoted? |
|---|---|
| `fontFamily` | yes |
| `string` | yes |
| `fontWeight` | only when the value is a keyword, not a number |
| anything else | no |

`fontWeight` is in the set because DTCG permits a keyword (`"bold"`), which
would emit as a bare identifier and hit the identical failure. `fontWeight:
"400"` already emits as a valid native integer and must stay untouched.

The module's own comment warns that "a hand-picked list silently drops whatever
it forgets," and that warning was correct when nothing backstopped it. It is
answered here by the `invalid-literal` rule landing in the same change: a
`$type` the list forgets now **fails the gate loudly** instead of shipping
broken. That is the division of labour this design rests on —

> the transform handles the types we know; the validator catches the ones we
> didn't.

It is also why the two halves ship together rather than as separate PRs. Either
alone leaves the other's failure mode open.

A DTCG `fontFamily` may be an array (`["Nunito Sans", "sans-serif"]`). It is
joined with `", "` and quoted once.

**Registration.** `value/swift-string-literal` is appended to the `ios-swift`
transform list and `value/kotlin-string-literal` to `android-kotlin`, in
`PLATFORMS`.

### 3. Documentation

- `references/native-adapter-config.md` is **generated** from `sd-native.mjs`
  by slicing on `@doc-section` markers and is gated in CI by
  `build-native-adapter-config.mjs --check`. New module code must sit inside a
  marker pair — the generator fails when code falls outside every pair — and
  the doc must be regenerated in the same commit.
- `references/sync-adapters.md` carries the #50 caveat stating the output does
  not compile. It is retired, and replaced with what remains true after this
  change (see Limitations).

## Testing

Verification is layered, because a grammar is exactly the kind of thing that
passes its own hand-written examples and fails on real output.

1. **Grammar, table-driven** (`validate-token-output.test.mjs`) — the seven real
   shapes above with their verdicts, plus `calc(1rem + 2px)`, `var(--x)`,
   `color-mix(in srgb, #fff 10%, transparent)`, `14px`, `"quoted"`, `true`, and
   a nested call.
2. **Rule interaction** — `14px` reports `no-bare-units` once and *not*
   `invalid-literal`; `calc(...)` reports `no-foreign-syntax` once and not
   `invalid-literal`; `Nunito Sans` reports `invalid-literal` alone.
3. **Non-regression on #52** — `1.50.dp` must still pass. This change must not
   mask an open issue.
4. **Transforms** (`sd-native.test.mjs`) — quoting per `$type`, the
   `fontWeight` numeric/keyword split, array join, `$` escaped for Kotlin and
   not for Swift, `"` and `\` escaped for both, and `hasNoNativeForm` values
   left unquoted by the transform and dropped by `nativeFilter`.
5. **End-to-end, through real Style Dictionary 4.4.0** — rebuild all four
   combinations in the surviving #50 harness and assert:
   - `invalid-literal` count on the **pre-fix** output files is 15 per file
     (the rule catches the real defect), and
   - the count on **post-fix** output is 0, with the declaration total and
     `matched` both falling 196 → 195 (the filtered gradient, and nothing
     else), `unemittedTokens` rising by exactly 1, and no other rule newly
     firing.

   Step 5 is the one that matters. Steps 1–4 prove the code does what it says;
   only step 5 proves it does it to the artifact the issue is about.
6. **Repo gates** — `node --test`, plugin manifests, skill frontmatter,
   adapters `--check`, doc-card `--check`, native-config `--check`.

## Limitations, stated rather than hidden

- **Nothing is compiled.** No `swiftc` or `kotlinc` runs. `invalid-literal`
  asserts that a value is a well-formed *literal*, not that the file compiles —
  a call to an undefined function or a type mismatch still passes. This narrows
  the "does not compile" gap; it does not close it. The `references/sync-adapters.md`
  wording must say that, not imply a compiler ran.
- **The gradient is dropped, not translated.** A consumer who wants it on
  native must author a native-expressible token. The drop appears in
  `unemittedTokens`, so it is visible in the report rather than silent.
- **Colour values are still matched by name only.** No rule compares a colour's
  value to its source. Unchanged by this work, and still true of the 74 colour
  symbols per file.

## Out of scope

#51 (Compose `sp`/`dp`), #52 (unitless ratios), #54 (`PLATFORMS` derivation),
#55 (`hoistDualNodes`). This change must neither fix nor mask them. Test 3
exists specifically to prove #52 is still reachable afterwards.
