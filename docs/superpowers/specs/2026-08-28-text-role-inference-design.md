# Text-role inference from the reference graph — design

**Issue:** #63 (with the #64 evidence comment)
**Date:** 2026-08-28
**Status:** approved in chat, not yet planned

A scale primitive states no typographic role, so `text.base: "16px"` emits as
`16.00.dp` on Android and `typography.letterSpacing.widest: "0.15em"` is dropped
from output entirely. #51 sources the role from the member names DTCG §9.8 fixes
for the typography composite — `fontSize`, `letterSpacing`, `lineHeight` — which
covers semantic tokens and not the primitives they reference.

This design infers the role for a primitive from the **reference graph**: a
dimension referenced only by typographic members is itself typographic. That is
structural rather than nominal, so it needs no `text.*` path convention and no
spec backing the spec does not give.

## 1. What was measured

Measured on zygarden's real source (`libs/shared/util-tokens/src/tokens/`,
15 files), not reasoned about. Measured **twice**, because the first measurement
was wrong in a way worth recording.

Merging the 15 files as a build merges them — later file wins on a colliding
path — gives 101 edges and reports `text.6xl` as unreferenced. Taking the
**union** of edges across all 15 files gives **194 edges**, and `text.6xl` has a
referrer after all: it lives in `typography-semantic.desktop.json`, which
`typography-semantic.mobile.json` overwrote in the merge.

| token group | tokens | reached | unreferenced |
|---|--:|--:|--:|
| `text.*` | 13 | 10 (`xs`–`6xl`) | 3 (`7xl`–`9xl`) |
| `typography.letterSpacing.*` | 4 | 3 | 1 (`widest`) |
| **total** | **17** | **13** | **4** |

Every one of the 13 is referenced **only** by leaf names in
`{fontSize, letterSpacing, lineHeight}`. **Zero mixed cases** across the whole
source, in either direction: nothing outside these two groups is reached by a
typographic reference, and nothing inside them is reached by a non-typographic
one.

The 4 the graph cannot reach are **unreferenced** — nothing in the source points
at them at all. That is not a shortcoming of the rule; it is the absence of any
structural signal whatsoever.

**The reach is therefore mode-dependent**, which §8 states as a limitation
rather than leaving to be discovered.

`$type: "dimension"` sits on each token node directly in this source, not
inherited from the group, so the propagation gate can mirror
`classifyTextUnits`'s existing check exactly rather than resolve inherited types.

## 2. Three corrections to the issue's own text

The issue and its comment were written before any of this was measured. Each of
these was checked rather than assumed, and the design depends on them.

**2.1 "Closing this issue would take Android from 6 unmatched to 2" is wrong.**
It is **6 → 3**. The 6 are the four `letterSpacing` primitives plus a
`linear-gradient()` and a `100%`. The graph reaches three of the four;
`typography.letterSpacing.widest` is referenced by nothing, under either
measurement in §1, and stays dropped.
This number was repeated into the v0.16.0 handoff note, which should be
corrected when this lands.

**2.2 "The graph would have to be captured during `resolveInPlace` and carried,
most likely on `$extensions`" is not so.** Nothing needs carrying. `preprocess`
already holds the **unresolved** dict — it clones it before resolving — so the
graph is computed from the original and the stamp applied to the clone, entirely
within one `preprocess` call. Only the stamp survives, which is exactly what
`classifyTextUnits` already does. `resolveInPlace` does not change, and #55's
`WeakSet` is not involved.

**2.3 "A token referenced by both a `fontSize` and a spacing role has no
obviously correct answer" — it has one: decline and say so.** Measured, the case
does not occur on this source at all. The rule is still written for it, because
a silent guess in an ambiguous case is the failure class this module exists to
prevent.

Also worth recording: the issue calls the graph "the only option that reaches all
52 typographic tokens." It does not reach all of them, per §1.

## 3. The rule

A **whole-value reference edge** is `{ from, to, leaf }` where a token's
authored `$value` is exactly `{some.path}`. A referrer is **typographic** when
its leaf name is in `TEXT_UNIT_NAMES` = `{fontSize, letterSpacing, lineHeight}`.

A referrer whose leaf name is anything else is **counter-evidence, not neutral.**
A dimension referenced by something that is not a typographic member is a length
— which is precisely what the current `dp` default already asserts about it.
Treating it as neutral would let a single typographic reference convert a
spacing ramp.

> **Stamp a referent `nativeUnit: "text"` iff it has at least one referrer and
> every one of its referrers is typographic.**

Then the same three gates `classifyTextUnits` applies, verbatim:

1. `$type === 'dimension'`
2. the value matches `TEXT_ROLE_UNIT` — so a unitless ratio is never stamped,
   because stamping one would be a claim the source never made (#52)
3. `nativeUnit` is not already present — so a source-authored stamp still wins

Gate 3 gives both an **escape hatch** and an **opt-out** for free: a source can
stamp `nativeUnit: "text"` on a token the graph cannot reach, or stamp anything
else to decline the inference. Both already work today, by way of the
`!('nativeUnit' in ns)` guard, and both were verified by running `preprocess`
rather than read off the source. Neither is documented and nothing pins them.

**Single-pass, not transitive.** A chain `fontSize → {alias.x} → {text.base}`
is declined at the second hop, because `alias.x`'s leaf name states no role and
is therefore counter-evidence. Zygarden has no such chain — every edge is
direct. A fixpoint would need a semantics for the intermediate that cannot be
justified from the spec, so this is a stated limitation (§8), not an oversight.

## 4. Where the code lives

`textRoleGraph(dict)` goes in **`scripts/lib/dtcg.mjs`**, a pure function over
the unresolved source tree, returning:

- `typographic: Set<path>` — referents every referrer of which is typographic
- `ambiguous: [{ path, textLeaves, otherLeaves }]` — declined, reported
- `unreferencedSiblings: [{ path, group }]` — a `dimension` token with zero
  referrers, passing `TEXT_ROLE_UNIT`, whose group holds a sibling in
  `typographic`

`dtcg.mjs` rather than `sd-native.mjs` because there are **two** consumers.
`validate-token-output.mjs` already imports from `./lib/dtcg.mjs`, and
`sd-native.mjs` already declares it a sibling dependency in the installation
prose the generated doc carries. Computing the graph twice in two modules is the
drift this repo keeps filing issues about.

`TEXT_UNIT_NAMES` moves to `dtcg.mjs` and is exported; `sd-native.mjs` imports
it. **Its explanatory comment stays in `sd-native.mjs` above the import**, so the
generated `references/native-adapter-config.md` keeps the DTCG §9.8 rationale
for why those three names and no others. A reader of the doc sees an import
rather than a literal set — an accepted, small loss against having one
definition.

New order inside `preprocess`:

```
resolveInPlace → classifyTextUnits → applyTextRoleGraph → hoistDualNodes
```

**Before the hoist**, because the hoist rewrites `text.xs.lineHeight` to
`text.xsLineHeight` and the edge paths are written in pre-hoist names.

**Idempotency holds without new machinery.** On a second `preprocess` the values
are already resolved, so there are no whole-value references, so the graph is
empty and no new stamps appear; the stamps from the first pass survive
`structuredClone`. This is the same argument `classifyTextUnits` already relies
on, and `preprocess(preprocess(x))` stays `deepEqual` to `preprocess(x)`.

## 5. The advisory

Two new `tokens:validate-output` advisories, both **reported, not gating**,
joining `unitless-dimension` under the existing "advisory note(s)" heading:

- **`unreferenced-text-sibling`** — a `dimension` token nothing references, whose
  group has siblings the graph did infer typographic. Names the token, names the
  group, and states that a source-side `nativeUnit: "text"` stamp closes it.
  This is what keeps the 4 from §1 from being a silent gap, and what makes the
  mode dependence in §8 visible rather than mysterious.
- **`ambiguous-text-role`** — a token with referrers on both sides. Names both
  sets of leaf names so the author can see what disagreed.

**One structural wrinkle.** `validate`'s existing loop iterates **emitted
declarations**, and `typography.letterSpacing.widest` is never emitted — the `em`
filter drops it. So this advisory cannot ride the declaration loop and needs a
**source-side** pass. `formatReport`'s advisory rendering also assumes
`a.symbol` exists; these advisories carry a token path and may carry no symbol
at all. Both are new shape rather than a tweak, and are the part of this work
most likely to be got subtly wrong.

## 6. What changes in emitted output

This is a **breaking** change and gets a `Breaking` changelog entry.

The table below is a **prediction to be verified at e2e time against real
output**, not a claim:

| | now | predicted |
|---|--:|--:|
| Kotlin declarations | 208 | 211 |
| Swift declarations | 195 | 195 |
| Android unmatched source tokens | 6 | 3 |
| iOS unmatched source tokens | 19 | 19 |

- `letterSpacing.{tight,normal,wide}` stop being filtered out of Compose output
  and emit as `.em` TextUnits — the three new declarations.
- `text.xs`–`text.5xl` change from `16.00.dp` (type `Dp`) to `16.00.sp` (type
  `TextUnit`), and `text.6xl` joins them in a build whose mode set includes the
  desktop typography file. **Nine or ten Kotlin symbols change type**, which of
  the two being mode-dependent per §8 — so the e2e records the mode set it built
  rather than reporting a bare number. A consumer using `Tokens.textBase` at a
  `Modifier.padding` site stops compiling. That is the break, and it is the
  correct one: those symbols were always font sizes.
- Swift is untouched. The `sp`/`dp` distinction is Compose-only, and iOS letter
  spacing stays deliberately excluded (§9).

`ci/compile-native-output.mjs` (#81) verifies the new Kotlin actually compiles
rather than merely differing.

## 7. Testing

**Unit, on `textRoleGraph`** — fixtures covering: referrers all typographic;
referrers mixed; zero referrers; a chain through a role-less intermediate; a
unitless referent; a dual node (`$value` plus a `lineHeight` child, since that
is the shape this source is full of); and a referent already carrying a source
stamp.

**Unit, on `preprocess`** — that the stamp lands, that idempotency holds, that
the escape hatch and the opt-out both work. The last two work today by accident
of a guard nobody tests; this pins them.

**Unit, on `validate`** — both advisories, including the case that matters most:
an advisory for a token that has **no emitted symbol**.

**e2e against zygarden's real source** — build both platforms, run
`ci/compile-native-output.mjs` on the output, and diff declaration counts and
unmatched counts against §6's table. A prediction that misses is a finding, not
a number to edit.

## 8. Limitations, stated rather than discovered later

- **Four tokens remain unfixed** on this source, and any source's unreferenced
  primitives will too. They are named by an advisory, not silently skipped.
- **The inference is mode-dependent.** `textRoleGraph` sees the dict the build
  merged, so a primitive referenced only from the desktop typography set is
  inferred typographic in a desktop build and not in a mobile one — the same
  token emitting `sp` in one and `dp` in the other. `text.6xl` is exactly this
  case on zygarden. This follows from inferring anything from a reference graph
  at all and is not separately fixable; the `unreferenced-text-sibling` advisory
  is what makes it visible, and a source-side stamp is what settles it. The e2e
  must record which mode set it built, or its counts cannot be reproduced.
- **No transitive inference.** A reference chain through a role-less
  intermediate is declined.
- **Whole-value references only.** A role-less token holding an interpolated
  expression that embeds a reference contributes no edge. `resolveInPlace`
  handles those for resolution; they are not evidence of a role.
- **The inference is only as good as the source's naming.** It rests entirely on
  DTCG §9.8's three member names, exactly as #51 does. A source naming its font
  size `typography.body.size` is reached by neither, and stamps `$extensions`
  itself.

## 9. Out of scope

- **Group-unanimity inference** — treating every member of a group as
  typographic when its referenced members unanimously are. It reaches 17/17 on
  zygarden and was **considered and declined**: a source whose non-typographic
  usage is not expressed as DTCG references (component CSS reading the custom
  property directly) would have an entire spacing ramp silently become `sp`,
  with no edge anywhere to contradict it. That is a guess wearing the costume of
  a structural rule.
- **A `text.*` path convention** — no spec backing, misfires on any source using
  `text.*` for copy strings. Rejected in the issue and still rejected.
- **iOS letter spacing** — an `NSAttributedString` kern in points needs a font
  size the token does not carry, so no constant Swift could emit is right at
  every font size. Excluded deliberately, unchanged here.
- **Making the inference configurable.** The escape hatch and opt-out in §3
  already cover the cases a flag would, per token, from the source.
