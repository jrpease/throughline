# Unitless dimensions — design

**Issue:** [#52](https://github.com/jrpease/throughline/issues/52) — unitless
ratios emit as `.dp` / `CGFloat` with no unit semantics
**Date:** 2026-08-26
**Base branch:** `main`. #68 is merged and no native branch is open, so this
does not stack — the first item in this sequence that does not. See §8.

## 1. The measured problem

Built zygarden's real DTCG source through the live module (Style Dictionary
4.4.0, scratch harness, `libs/shared/util-tokens/src/tokens`,
`feature/apply-brandguide-styles`, light + mobile axes). Baseline reproduced
exactly: **195 declarations, 39 `.sp`, 50 `.dp`.**

Enumerating every token whose post-`preprocess` value is a bare number:

| | |
|---|---|
| Unitless-valued source tokens | 23 |
| Of those, `$type: fontWeight` (emit as bare integers — correct) | 18 |
| Of those, `$type: dimension` | **5** |

The five are the whole `leading.*` ramp:

```
val leadingTight   = 1.10.dp        public static let leadingTight   = CGFloat(1.10)
val leadingSnug    = 1.25.dp        public static let leadingSnug    = CGFloat(1.25)
val leadingNormal  = 1.50.dp        public static let leadingNormal  = CGFloat(1.50)
val leadingRelaxed = 1.70.dp        public static let leadingRelaxed = CGFloat(1.70)
val leadingLoose   = 2.00.dp        public static let leadingLoose   = CGFloat(2.00)
```

`1.50.dp` is one and a half density-independent pixels. The token means
"1.5x the font size."

**All five are orphaned.** Nothing in zygarden's source references `leading.*`;
every semantic `lineHeight` routes through `text.*.lineHeight`, which are
px-valued dual-node children that #51 already moved to `.sp`. So no consumer's
needs constrain the answer, and the blast radius of getting it wrong is small.

`tokens:validate-output` exits 0 on both platforms, as #52 predicted.

## 2. Three corrections to the issue's own text

All three measured, all three change what this spec must do.

**2.1 The Swift half is not the same defect.** #52 says the Swift path "has the
same problem in a different costume." It does not. A real dimension emits
`spacingSpace4 = CGFloat(16.00)`; Swift's `CGFloat` carries no unit claim about
*anything*, so for a ratio it is already an appropriate type.
`references/native-adapter-config.md` §4 states this correctly — "all three are
Android-only ... `CGFloat`, which carries no unit to be wrong about" — so it is
the issue text, not the codebase, that overstates. Swift is nonetheless changed
here, for a different reason: §5.2.

**That framing has a shelf life, and §5.5 is where it expires.** "No unit to be
wrong about" holds only while the `CGFloat` wrapper is present. Once it is
removed the constant carries a Swift *type* instead of a unit, and an `Int`
mismatch at a `CGFloat` use site is a real failure. This is therefore the first
item in the family whose behaviour change is **not** Android-only, and §5.5
states the regression for both platforms rather than inheriting §4's framing.

**2.2 It is not the silent half of the family.** The #60 handoff's open question
assumed #60 established this as the silent case, which argued it up the ranking.
Measured, that is wrong. `1.50.dp` is a `Dp`, and Compose's `TextStyle` takes
`TextUnit` for `lineHeight` with no `Dp` overload — so using `leadingNormal` for
its actual purpose is a **compile error**. #60's genuinely-silent case was a
*bare* `1.5` `Double` emitted on an untyped child, which is a different shape.

The ranking argument that put #52 in this slot therefore does not survive
contact with the output. The defect is real and worth fixing; it is smaller than
advertised, and this spec is sized to what was measured rather than to the
issue's framing.

**2.3 The issue's four options are the wrong four.** #52 offers: emit bare, emit
`.em`, filter out, or decide by role. Each is framed as inventing a native form
for a legal input. §3 shows the input is not legal, which reframes the question
entirely.

## 3. What DTCG actually says

Verified against the Format Module draft, not inherited from repo comments — the
same discipline #55 applied after finding two comments asserting a falsehood
about dual nodes.

- **§8.2 / §8.2.1 — a dimension MUST carry a unit.** `$value` "MUST be an object
  containing a numeric `value` ... and `unit` of measurement (`"px"` or
  `"rem"`)", and "`$value.unit` is still required even if `$value.value` is
  `0`."
- **§8.7 — `number` is the unitless type**, whose own stated example uses are
  "gradient stop positions or unitless line heights."
- **§9.8 — `lineHeight` MUST be a `number`** or a reference to one, "interpreted
  as a multiplier of the fontSize."

**A unitless `dimension` is invalid DTCG at MUST level.** This is the same
category as the dual node in #55: malformed input, not a legal shape being
interpreted. As with #55, this does not change what throughline must *do* —
Figma-derived sources emit the shape regardless — but it means behaviour here is
a judgment about malformed input and must not be argued as spec interpretation.

**The spec-correct authoring already works, unchanged.** Measured through the
real pipeline:

```
$type: number,    $value 1.5     ->  Kotlin: 1.5          Swift: 1.5
$type: number,    $value "1.5"   ->  Kotlin: 1.5          Swift: 1.5
$type: dimension, $value "1.5"   ->  Kotlin: 1.50.dp      Swift: CGFloat(1.50)
$type: dimension, $value "16"    ->  Kotlin: 16.00.dp     Swift: CGFloat(16.00)
$type: dimension, $value "16px"  ->  Kotlin: 16.00.dp     Swift: CGFloat(16.00)
```

`number` falls through every size transform and emits its raw value — which is
exactly the correct native form for a multiplier on both platforms. Nothing
needs to be built for the correct input. The work is entirely about the
incorrect one.

## 4. The irreducible ambiguity

Rows three and four above are the design problem. `"1.5"` and `"16"`, both typed
`dimension`, are **structurally identical inputs demanding opposite outputs**:

- `"1.5"` is a ratio. Correct output: bare.
- `"16"` is a forgotten `px`. Correct output: `16.00.dp`.

No property of the token separates them.

**Rejected: a magnitude threshold.** "Ratios are small, measurements are large"
breaks on `leading.loose: 2` against `spacing.hairline: 1`, and on any aspect
ratio stored as `16`.

**Rejected: a name heuristic.** `leading`/`lineHeight` implies ratio. But #51
established that this module takes typographic roles *only* from the member
names DTCG §9.8 fixes at MUST level, precisely to avoid guessing from arbitrary
names — and `leading` is not one of them. Adding a name heuristic here would
contradict #51's own reasoning and re-open the problem #63 exists to track.

**Only the author knows.** That is the finding this design is built on, and it
is why the answer is not a cleverer classifier. §5 picks the reading the spec
mandates; §6 tells the author what was assumed so they can correct it.

### 4.1 Rejected: a `preprocess` throw

Since §3 places this input in the same category as the dual node in #55, and
#55 answers its unrepairable case with a throw naming both paths, the throw
option needs an explicit rejection rather than an allusion.

**Rejected, on one measured difference.** #55's throw fires on **zero**
zygarden tokens — the collision it detects is not authored anywhere in the real
source, so the throw is a guard against a shape that does not occur. This throw
would fire on **five, immediately**, breaking the flagship Figma-derived source
on first run, and Figma emits no DTCG `number` tokens at all (§10), so every
source reaching this pipeline carries the shape.

The second difference is what is at stake. #55's collision **silently discards a
token** — a build that appears to succeed has lost data, and stopping is the
only way to surface it. Here nothing is lost: output is produced for every
token, with one reading of an ambiguous type. A fatal error for a token that
emits correctly under the mandated reading is disproportionate to the harm.

The throw remains the right answer for the case where output cannot be produced
at all. That is not this case.

## 5. The transform change

### 5.1 Placement: the transform filters, not `magnitude()`

The minimal-looking change is to make `magnitude()` return `null` for a bare
number, so `hasMagnitude` goes false and the transforms decline. Rejected.

`magnitude()` answers "what is this value's native magnitude," and for `1.5`
the honest answer *is* `1.5`, unscaled. The validator's `expectedMagnitude()`
answers the same question and returns `{ magnitude: 1.5 }`. Making the two
disagree creates a fourth divergent definition of a shared concept in this
codebase — which is exactly what [#57](https://github.com/jrpease/throughline/issues/57)
is already open to reconcile. `magnitude()` is left alone.

Instead, a predicate, stated precisely because the plan will transcribe it: a
token is a **ratio** when its authored value matches `magnitude()`'s own
number-and-optional-unit grammar *and the unit group is empty*. It reads
`token.original?.$value ?? token.$value` — the same accessor `authored()` uses,
and it must be the same one: `preprocess` resolves references in place before
Style Dictionary sees the tree, so `original.$value` already holds the resolved
literal, and reading the post-transform `$value` instead would test a value some
other transform may already have rewritten.

The three size transforms then exclude it:

```
size/unit-aware/swift       filter: (isDimension || isFontSize) && hasMagnitude && !isRatio
size/unit-aware/compose-dp  filter: isDimension && !isTextUnit && hasMagnitude && !isRatio
size/unit-aware/compose-sp  filter: (isTextUnit || isFontSize) && hasMagnitude && !isRatio
```

The token falls through untransformed and emits its raw value.

`magnitude()`'s consumers were enumerated before proposing this: `authored()`
in `sd-native.mjs`, feeding exactly these three transforms, plus its own tests.
It is not used by `validate-token-output.mjs`. Narrowing a shared helper without
accounting for every consumer caused review defects on both #53 and #55; the
enumeration is recorded here so the plan does not have to re-derive it.

### 5.2 Applied to Swift as well, for output-neutrality

§2.1 establishes Swift's `CGFloat(1.50)` is not wrong. It is changed anyway, and
the reason is not consistency for its own sake.

The advisory in §6 tells the author: *this is mistyped; make it
`$type: number`.* If they do that while Swift still wraps, Swift output changes
from `CGFloat(1.50)` to `1.5` as a side effect of taking our advice. Advice that
silently alters output is a trap.

With Swift declining too, the invariant holds:

> For a unitless value, `$type: dimension` and `$type: number` produce
> **identical output on both platforms.**

Taking the advice becomes a no-op. This is the load-bearing claim of the design,
so §7 makes it a test rather than a sentence.

Cases hunted for a counterexample, per the #60 lesson that the tidiest sentence
in a spec is the one most worth executing — all five hold, but the fifth holds
only because of a deliberate choice, and that choice changes a documented
contract:

- a numeric (non-string) `$value`: `magnitude()` stringifies, so it is caught.
- `$type: fontSize` with a unitless value: excluded from `compose-sp` and
  `swift` alike, so bare on both, matching `number`.
- a typography-named member: `classifyTextUnits` requires an absolute unit, so
  it is unstamped under either `$type`.
- `$type: number` reaching a size transform at all: it cannot —
  `isDimension`/`isFontSize` both false.
- **a source that sets `$extensions[EXT_NS].nativeUnit = "text"` itself on a
  unitless token.** See below.

**The explicit override on a unitless token: `!isRatio` goes on `compose-sp`
too — but not for the reason an earlier draft of this section gave.**

An earlier draft claimed `compose-sp`'s `!isRatio` was what held the invariant,
and that omitting it broke Swift. **That was wrong, and it was wrong in the way
this project keeps rediscovering: it was reasoned, not executed.** Built in
isolation across three filter variants, the actual behaviour is:

| variant | stamped `dimension` `"1.5"` | stamped `number` `"1.5"` | invariant |
|---|---|---|---|
| all three carry `!isRatio` | bare / bare | bare / bare | **holds** |
| `compose-sp` omits it | `1.50.sp` / bare | `1.50.sp` / bare | **holds** |
| `swift` omits it | — / `CGFloat(1.50)` | — / bare | **breaks** |

So the invariant is carried by **`size/unit-aware/swift`**, whose filter is
`isDimension || isFontSize` and therefore *is* sensitive to `$type`.
`compose-sp` filters on `isTextUnit || isFontSize`, and `isTextUnit` reads the
stamp rather than `$type` — so a stamped token behaves identically under both
`$type`s whatever `compose-sp` does. It cannot break the invariant, and it
cannot save it.

**`!isRatio` still belongs on `compose-sp`, on the merits rather than on the
invariant.** Without it, a stamped unitless token emits `1.50.sp` — 1.5
scale-pixels of text. That is precisely the output #51 gated `ABSOLUTE_UNIT` to
prevent, described there as "a loud failure traded for a silent one, which is
precisely the failure class this module exists to prevent." An explicit stamp
should not be able to produce it either.

The consequence for §7 matters: **an invariant test cannot catch a missing
`!isRatio` on `compose-sp`**, because the invariant holds without it. That
placement needs its own direct behavioural assertion — a stamped unitless token
emits bare — and §7 specifies both.

Narrowing the override costs something real, and #51 must be answered rather
than quietly overridden. #51 §7 accepted that "a tool that second-guesses an explicit
declaration has no override at all," and `classifyTextUnits`' own comment says
"A source that states the role itself wins" (`sd-native.mjs:267-270`). Under
this change that sentence stops being true for unitless values.

**It is still the right call, and the reason completes #51's argument rather
than reversing it.** #51 gated the *automatic* stamp on `ABSOLUTE_UNIT`
precisely because `1.50.sp` compiles and renders 1.5sp text — "a loud failure
traded for a silent one, which is precisely the failure class this module exists
to prevent." That reasoning is about the *value*, not about who did the
stamping: 1.5 scale-pixels of text is nonsense no matter who declared it. #51
simply did not extend the gate to the manual stamp.

So the override's scope is narrowed, and stated explicitly:

> The `nativeUnit` override chooses between `dp` and `sp` for a value that
> **has** a unit. It does not manufacture one. On a unitless value it is
> declined, because there is no magnitude for `sp` to scale.

This is an unrecorded behaviour change today; §7 gives it a test, §9 lists the
comment that must be corrected, and the changelog carries it. **No existing test
pins the old behaviour** — `sd-native.test.mjs:1035` covers only the
no-magnitude stamp — so nothing forces an implementer to confront this unless
the spec says so.

### 5.3 `ABSOLUTE_UNIT` is unchanged, and this resolves a tension #51 carried

#51 §6.3 declined to stamp a bare-valued `lineHeight` because both available
outputs were bad: `.dp` is a `Dp` where a `TextUnit` belongs, and `.sp` compiles
and renders 1.5sp text — a loud failure traded for a silent one.

This change introduces the third option. A unitless `lineHeight` is still not
stamped (`ABSOLUTE_UNIT` still requires `px`/`rem`, unmodified), is now also
declined by `compose-dp`, and emits bare — a Kotlin `Double`, which is what
DTCG §9.8 says a `lineHeight` is and what Compose's multiplier idiom wants.
`ABSOLUTE_UNIT` needs no change; its reasoning simply stops being a compromise.

### 5.4 The unitless-zero cost, stated rather than smoothed

`spacing.none: { $value: "0", $type: "dimension" }` flips from `0.00.dp` to
bare `0`. zygarden has none, but other sources will.

DTCG anticipated exactly this — §8.2.1's "still required even if
`$value.value` is `0`" exists for this case — so the input is invalid and §6
flags it. In Compose it fails loudly: `Modifier.padding(0)` does not compile
without `.dp`. On Swift it emits `0`, which infers `Int` and will not convert at
a `CGFloat` use site — see §5.5. It is a real behaviour change on both platforms
and §7 gives it a test and a changelog line.

### 5.5 The trade being made, named honestly

Today a *forgotten unit* — `spacing.gutter: "16"` meant as `16px` — emits
`16.00.dp`, which is **accidentally correct**, because px and dp map 1:1 by
convention. Under this change it emits bare `16`, which is wrong, and fails at
any Compose `Dp` use site.

**This regression lands on Swift too, and §2.1 does not cover it.** "CGFloat
carries no unit to be wrong about" is true only while the wrapper is there. Once
`CGFloat(16.00)` becomes bare `16`, the constant infers **`Int`**, and Swift
does not implicitly convert an `Int` constant at a `CGFloat` use site. So the
forgotten-unit case is a real Swift-side regression, not an Android-only one —
the first in this family that is not. The same applies to §5.4's zero.

So this trades accidental-correctness for loud-failure-plus-advice, on both
platforms. That is the right trade — it is the module's stated thesis, #53 made
the identical trade for invalid literals, and the correctness was luck rather
than design — but it is a regression for anyone relying on it, and it is
recorded as one rather than presented as a pure win.

## 6. The gate rule

### 6.1 `unitless-dimension`, advisory

Fires when a source token's effective `$type` is `dimension` or `fontSize` and
its resolved value is a bare number. Reports the token path, the emitted symbol,
and the fix: *type it `number`, or add the unit you meant.*

**Severity: advisory — reported, excluded from `ok`.**

An earlier draft rested this on a general principle — "the gate judges output,
and this is a source problem." **That principle is false in this codebase and is
withdrawn.** Mode collisions are fatal in `validate()` today
(`validate-token-output.mjs:185`) and are purely a source-list problem, so the
gate's actual contract already includes fatal source rules. The argument is the
narrower one, which does not need the principle:

- **The output is correct.** Under §5 a unitless dimension emits the ratio
  reading, which compiles and matches its magnitude. Failing a gate on output
  that is right — under the reading the spec itself mandates — inverts what the
  gate is for. Mode collisions are fatal because they mean output is *missing*
  a whole mode; nothing is missing or wrong here.
- **It relocates rather than avoids the cost that disqualifies a throw** (§4.1):
  zygarden trips this on five tokens on day one, and a red gate is a red gate
  wherever it fires.
- **Precedent exists in the same function.** `unparsedLines` and
  `unemittedTokens` are both reported and both excluded from `ok` — zygarden
  shows 19 unemitted tokens today at exit 0.

The claim is therefore about *this* source problem, not about source problems in
general: it is diagnosable, it does not corrupt output, and its own fix is a
one-line `$type` edit.

### 6.2 Where the type comes from

`flattenDtcg` returns `{ path: rawValue }` and drops `$type`. It has four
consumers — `validate-crosswalk.mjs`, `validate-token-output.mjs`,
`findModeCollisions`, and `sd-native.mjs`'s `preprocess` — and both validators
re-export it for the installed-file pattern. **Changing its return shape is out
of the question**; this is strictly additive.

A new `flattenDtcgTypes(obj)` in `lib/dtcg.mjs`, mirroring `flattenDtcg`'s walk
and returning `{ path: effectiveType }`:

- a token's own `$type` wins;
- otherwise the nearest ancestor **group**'s `$type`;
- a `$value`-bearing node is **not** an inheritance source for its children.

That third rule is the same one `hoistDualNodes` computes as `inherited`
(`sd-native.mjs:139`), and it must match, or two functions in this codebase
disagree about the type of the same tree.

**But matching `inherited` is not matching the pipeline, and the spec must not
claim otherwise.** `hoistDualNodes` types a child by *two* mechanisms. The
second is the **carry** (`sd-native.mjs:189-196`): where no group supplies a
type, the dual node's own `$type` is stamped onto an untyped hoisted child.
`flattenDtcgTypes` reads the **raw source**, where the hoist has not run, so it
cannot see the carry.

The consequence, stated as a limit:

> A unitless child with no own `$type`, under a `dimension`-typed dual node with
> no enclosing group type, is a `dimension` to the pipeline via the carry — so
> §5 flips it from `N.dp` to bare — but `flattenDtcgTypes` returns `undefined`
> for it and the advisory does **not** fire.

This is the worst-placed limit in the design, and it is recorded rather than
buried: that shape is exactly #60's "genuinely silent" case, the one this rule
most wants to catch. It is not reachable in zygarden — every dual-node child
there carries its own `$type` — so it is a stated limit here and a filed
follow-up (§10) rather than scope absorbed into this item.

Resolving it properly means running the advisory against the **preprocessed**
tree rather than the raw source, which is a larger change to how
`validate-token-output.mjs` reads its input: the gate deliberately validates
emitted output against the *authored* source, and pointing it at a preprocessed
tree would mean it no longer checks what the author wrote. That trade is not
this item's to make.

### 6.3 Deliberately not implemented

**DTCG §5.2.2 rule 1** — a reference-valued token takes its referent's type — is
not resolved here. An alias to a unitless dimension is not flagged; its
*referent* is, and the referent is the token the author edits. Flagging both
would be noise. Stated as a limit, in the manner of #63 and #64, rather than
hidden.

**#36's blind spot is inherited, not worsened.** The rule maps symbol to source
through the same `byKey` map, so a `normalizeKey` collision affects it exactly
as it affects the existing rules. The two items now touch the same file; #36
remains the place that is fixed.

## 7. Behaviour change and falsifiable prediction

The rule, in full:

> A token whose authored value parses as a bare number carrying no unit is not
> claimed by any size transform, on either platform. It emits its raw value.
> `tokens:validate-output` reports it as `unitless-dimension` when its effective
> `$type` is `dimension` or `fontSize`, without failing the gate.

**Prediction, to be checked by `diff -r` between a build at `main` and a build
at HEAD against zygarden's real source:**

| | before | after |
|---|---|---|
| Kotlin declarations | 195 | 195 |
| Containing `.sp` | 39 | 39 |
| Containing `.dp` | 50 | **45** |
| Changed lines, Kotlin | — | **5** (`leading*`, `N.dp` -> bare) |
| Changed lines, Swift | — | **5** (`CGFloat(N)` -> bare) |
| Every other line, both files | — | **byte-identical** |
| `tokens:validate-output` exit | 0 | 0, with 5 advisories **per platform run** |

If `.dp` does not land on exactly 45, something moved that should not have, and
the diff says what. Counting declarations alone would miss compensating changes;
the byte-level diff is the assertion.

**One shift inside the ramp the §1 table does not show.** `leading.loose: "2"`
emits bare `2`, which infers `Int` in both languages, while its four siblings
emit `Double`. Today all five are `2.00.dp` / `CGFloat(2.00)` and uniformly
floating-point. This is consistent with the design rather than an exception — a
`number`-typed `2` emits `2` today, so the §5.2 invariant holds — but it means
the five emitted constants are no longer of one type, which a consumer iterating
the ramp would notice before we did. Recorded here rather than discovered in
review.

**Tests.**

- `lib/dtcg.test.mjs` — `flattenDtcgTypes`: own type; inherited from a group;
  a `$value`-bearing node not acting as an inheritance source; nested groups;
  no type at all.
- `lib/sd-native.test.mjs` — the ratio predicate; each of the three size
  transforms declining a unitless value.
- `lib/sd-native.test.mjs` — **the output-neutrality invariant of §5.2**, as an
  executed assertion: the same value authored as `$type: dimension` and as
  `$type: number` emits identical output on both platforms.
- `lib/sd-native.test.mjs` — **a direct assertion that a stamped unitless token
  emits bare**, i.e. that `compose-sp` declines it. This is *not* an invariant
  test, and the distinction is the point: §5.2 measured that the invariant holds
  whether or not `compose-sp` carries `!isRatio`, so an invariant test cannot
  catch that placement. Only a behavioural assertion can. It doubles as the pin
  on the narrowed override contract, which no test currently holds.
- `lib/sd-native.test.mjs` — **the invariant test must exercise the Swift
  filter**, since §5.2 measured that as the one that actually carries it. A test
  that only compares Compose output would pass against the variant that breaks
  the design.
- `lib/sd-native.test.mjs` — **the unitless-zero regression of §5.4**, asserted
  explicitly, so the cost is recorded in a test and cannot later be reverted as
  though it were a bug.
- `validate-token-output.test.mjs` — the rule fires on a unitless dimension;
  does **not** fire on a unitless `number` or `fontWeight` (all 18 of zygarden's
  unitless non-dimensions are `fontWeight`); `ok` stays `true`; the advisory
  renders in `formatReport`.

## 8. Constraints

**Branch off `main`.** #68 is merged and no native branch is open. This is the
first item in the sequence that does not stack — #53, #55, #51 and #60 all had
to, because `scripts/lib/sd-native.mjs` generates
`references/native-adapter-config.md` from its whole body and concurrent
branches conflict guaranteed. If another native branch opens before this lands,
stack on it and retarget this PR to `main` **before** the parent merges: merging
a parent with `--delete-branch` auto-closes a stacked PR that cannot be reopened
once its head has been rebased, which cost PR #65.

**Regenerate the doc as part of the task, not at the end of the branch.** A
freshness test goes red the moment the module changes, and a suite with a known
failure is one a real regression hides behind.

**The e2e harness is scratchpad-only.** It survives at
`<scratchpad>/e2e` with Style Dictionary 4.4.0 and `scripts/lib` symlinked to
the repo's live tree. Rebuilding is the first step of any e2e run. No token
source is vendored: zygarden is external at `~/Dev/zygarden-frontend`, branch
`feature/apply-brandguide-styles`, read with `git show <branch>:<path>`. **Do
not check it out or modify it.**

**Verify at the emitted-output layer.** Executing the preprocessor is not
executing the pipeline. Every severity claim in §1 and §2 was measured on
emitted Kotlin and Swift, and every claim the plan adds must be too.

## 9. Documentation to update

The "three limits remain" list exists in **two** places that both feed the
generated doc, and `node scripts/build-native-adapter-config.mjs --check` gates
freshness in CI:

1. `scripts/build-native-adapter-config.mjs` — the prose list at ~line 133.
2. `scripts/lib/sd-native.mjs` — the same list in the `platform` doc-section's
   comment, plus the `ABSOLUTE_UNIT` comment at ~line 235, whose reasoning
   about the unitless case is superseded by §5.3.
3. **`scripts/lib/sd-native.mjs:267-270`** — `classifyTextUnits`' comment "A
   source that states the role itself wins. This is the override, and it costs
   no configuration parameter: declining to overwrite IS the feature." That
   sentence becomes false for unitless values under §5.2 and must be narrowed to
   match the stated scope: the override chooses between `dp` and `sp` for a
   value that has a unit; it does not manufacture one. This comment feeds the
   generated doc, so leaving it would ship a documented contract the code no
   longer honours.
4. `references/native-adapter-config.md` — regenerated.

Three remaining limits become two: the bare scale primitive (#63) and the
`em`-valued `letterSpacing` (#64).

**Changelog.** The `Unreleased` section gets **two** entries, not one: the §5.5
trade stated as a regression rather than only as a fix, and the §5.2 narrowing
of the `nativeUnit` override, which is a behaviour change to a contract #51
documented.

## 10. Follow-ups to file

- **The `number` type is unreachable from a Figma-derived source.** Figma emits
  no DTCG `number` tokens, so every ratio arrives mistyped and every user of
  this pipeline will meet the §6 advisory. Whether throughline's Figma
  extraction should type ratios as `number` at the source is a separate item,
  and the one that would actually close this class.
- **The advisory cannot see the hoist's `$type` carry** (§6.2). A unitless,
  untyped child of a `dimension`-typed dual node with no enclosing group type is
  flipped to bare by §5 and not flagged by §6 — and that shape is #60's
  genuinely-silent case, so it is the token the rule most wants. Fixing it means
  deciding whether `validate-token-output.mjs` may read a preprocessed tree,
  which trades away its property of checking emitted output against what the
  author actually wrote. A real decision, and not this item's.
- Anything the implementation turns up that is out of scope here — filed rather
  than absorbed, per #60 and #67.
