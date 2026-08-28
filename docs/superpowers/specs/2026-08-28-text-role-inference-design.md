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

| token group | tokens | reached (**union**) | unreferenced |
|---|--:|--:|--:|
| `text.*` | 13 | 10 (`xs`–`6xl`) | 3 (`7xl`–`9xl`) |
| `typography.letterSpacing.*` | 4 | 3 | 1 (`widest`) |
| **total** | **17** | **13** | **4** |

**"Reached" here is the union across all 15 files, not what any one build
sees.** No single build reaches 10 `text.*` tokens, because the viewport axis
must be pinned and each pin drops a different referrer — see §6 and §8. Read
this table as the ceiling the source could support, never as a per-build count.

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

**`TEXT_ROLE_UNIT` and `EXT_NS` move with it, by the same rule.**
`textRoleGraph` needs `TEXT_ROLE_UNIT` for gate 2 and for defining
`unreferencedSiblings`, and needs `EXT_NS` to skip a token whose source already
carries a stamp. Both live in `sd-native.mjs` today, and `sd-native.mjs` imports
`dtcg.mjs` (line 13) — so `dtcg.mjs` reaching back for either would be an import
**cycle**. All three constants therefore move to `dtcg.mjs`, each keeping its
explanatory comment at the import site in `sd-native.mjs` so the generated doc
keeps its rationale. `sd-native.mjs` **re-exports `EXT_NS`**, which is already
part of its public surface: the transforms and their tests address the same key.

This is also what keeps the validator's install footprint unchanged.
`dtcg.mjs`'s own header records that it is copied alongside
`validate-token-output.mjs`, while `sd-native.mjs` installs separately. Putting
`EXT_NS` in `dtcg.mjs` lets the advisory read the stamp without
`validate-token-output.mjs` acquiring a new install-time sibling — which would
otherwise be a real consequence of a decision that looks purely cosmetic.

New order inside `preprocess`:

```
resolveInPlace → classifyTextUnits → applyTextRoleGraph → hoistDualNodes
```

**Before the hoist**, because the hoist rewrites `text.xs.lineHeight` to
`text.xsLineHeight` and the edge paths are written in pre-hoist names.

**Idempotency holds — but not for the obvious reason, and the obvious reason is
false.** It is tempting to say a second `preprocess` finds every value resolved
and so collects no edges. That is not quite true: `resolveInPlace` deliberately
leaves an **unresolvable** reference in place (`sd-native.mjs:103-105`) for Style
Dictionary to report, and such a value still looks like a whole-value reference
on a second pass. The edge set is not necessarily empty.

It holds for a narrower reason. An unresolvable reference names a path that does
not exist, so there is no referent node to stamp. **`applyTextRoleGraph` must
therefore tolerate an edge whose referent is missing and skip it rather than
throw** — on the first pass as much as the second. Given that, every stamp a
second pass could apply is one the first already applied, gate 3 declines to
overwrite it, the stamps survive `structuredClone`, and
`preprocess(preprocess(x))` stays `deepEqual` to `preprocess(x)`.

### 4.1 Files touched, and what the doc gate requires

| file | change |
|---|---|
| `scripts/lib/dtcg.mjs` | `textRoleGraph`, `mergeDtcg`, the three moved constants |
| `scripts/lib/sd-native.mjs` | `applyTextRoleGraph` in `preprocess`; imports the constants, re-exports `EXT_NS` |
| `scripts/validate-token-output.mjs` | the source-side advisory pass |
| `scripts/build-native-adapter-config.mjs` | `platform` prose (below) |
| `references/native-adapter-config.md` | regenerated, never hand-edited |
| `scripts/lib/dtcg.test.mjs`, `scripts/lib/sd-native.test.mjs`, `scripts/validate-token-output.test.mjs` | §7 |
| `CHANGELOG.md` | a `Breaking` entry |

`scripts/lib/sd-native.mjs` is gated by
`node scripts/build-native-adapter-config.mjs --check`, which regenerates
`references/native-adapter-config.md` from the module's own source between
`@doc-section` markers, interleaved with prose held in the generator. **Every
line of the module must fall inside a `@doc-section` pair, and every section
needs a matching prose entry** — the generator throws otherwise. So the new code
goes inside the existing `preprocess` section, and the gate is re-run and the
regenerated doc committed in the same change. `references/` ships in the
published tarball, so a stale doc here reaches consumers.

**This change falsifies two documented claims. Correcting them is part of the
work, not a follow-up:**

1. `scripts/lib/sd-native.mjs:330-332` — "A scale primitive carries no role.
   `text.base: "16px"` is a font size only to a human, so it emits as dp."
   No longer true of a referenced primitive.
2. `scripts/build-native-adapter-config.mjs:126` — "no nominal or structural
   signal marks it." The structural signal is exactly what this design adds.

Neither should simply be deleted. Both must state the new rule **and** its
remaining gap — the unreferenced tail of §1 — or the doc will overclaim in the
opposite direction.

**A third claim in the same comment is already stale, before this change.**
`sd-native.mjs:333-334` says an em-valued letterSpacing "is filtered out of
native output entirely, rather than emitted as Compose's `.em` TextUnit." #64
made that false for a **stamped** em value; it holds only for a role-less one.
The generator's own prose already reflects #64 and this comment does not. It is
corrected here rather than filed separately, because this change rewrites the
same bullet list and makes the bullet wronger — three more tokens become
stamped.

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

**A token whose source already stamps `nativeUnit` is excluded from
`unreferencedSiblings`** — it is closed already, and naming it would be noise.
This is why `textRoleGraph` needs `EXT_NS`, and why §4 moves it.

**Which tree the graph runs on.** `preprocess` receives one dict. `validate`
receives `sources` as an **array**, and today only ever flattens them
(`Object.assign` over `flattenDtcg` results), which destroys the group structure
`unreferencedSiblings` needs. So `dtcg.mjs` also gains **`mergeDtcg(dicts)`**: a
deep merge, later source winning — matching both the later-wins semantics
`validate` already applies to values and the single merged dict Style Dictionary
hands `preprocess`. The validator merges first, then calls `textRoleGraph` once.

Deliberately a merge and **not** a union of per-source graphs. §1 is itself a
demonstration that the two differ. The advisory exists to describe the build that
was actually run, and a build merges; a union would report a token as reached
when the build did not reach it, under-reporting the gap in the one direction
that matters.

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
- **Nine Kotlin symbols change type** from `Dp` to `TextUnit` — `16.00.dp`
  becomes `16.00.sp` — in *any* single build, on either viewport pin. **Ten is
  unreachable by any single build.** The two pins reach nine each and it is not
  the same nine: `typography-semantic.mobile.json` references
  `text.{xs,sm,base,lg,xl,2xl,3xl,4xl,5xl}` and
  `typography-semantic.desktop.json` references
  `text.{xs,sm,base,xl,2xl,3xl,4xl,5xl,6xl}` — a straight `text.lg` ↔ `text.6xl`
  swap. Ten is the union across both files (§1), which no build merges. So the
  e2e records the mode set it built, because the *set* is mode-dependent even
  though the *count* is not. A consumer using `Tokens.textBase` at a
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

**Unit, on `textRoleGraph`, for the cases §4 and §5 forced** — an edge whose
referent does not exist (must skip, not throw); a token already carrying a
source `nativeUnit` stamp (excluded from `unreferencedSiblings`); and
`mergeDtcg` over two mode files that disagree, with the graph computed on the
merged result, asserting the §1 behaviour that a later file's overwrite can
remove a referrer.

**Unit, on `validate`** — both advisories, including the case that matters most:
an advisory for a token that has **no emitted symbol**.

**The doc gate** — `node scripts/build-native-adapter-config.mjs --check` passes
after regeneration, and the regenerated `references/native-adapter-config.md` is
committed alongside. Per §4.1 this is a gate, not a nicety.

**e2e against zygarden's real source** — build both platforms, run
`ci/compile-native-output.mjs` on the output, and diff declaration counts and
unmatched counts against §6's table. A prediction that misses is a finding, not
a number to edit.

## 8. Limitations, stated rather than discovered later

- **Four tokens remain unfixed** on this source, and any source's unreferenced
  primitives will too. They are named by an advisory, not silently skipped.
- **The inference is mode-dependent, and symmetrically so.** `textRoleGraph`
  sees the dict the build merged, so a primitive referenced only from one
  viewport's typography set is inferred typographic in that build and not in the
  other — the same token emitting `sp` in one and `dp` in the other. On zygarden
  this is a **swap, not one stray token**: `text.6xl` is referenced only from
  `typography-semantic.desktop.json`, and `text.lg` only from
  `typography-semantic.mobile.json`. Each pin therefore stamps nine and files an
  advisory for the one it lost. **The count is stable across pins even though
  the set is not**, which is what makes this easy to miss: comparing bare totals
  between two mode sets shows no difference at all. This follows from inferring
  anything from a reference graph and is not separately fixable; the
  `unreferenced-text-sibling` advisory is what makes it visible, and a
  source-side stamp is what settles it. The e2e must record which mode set it
  built, or its counts cannot be reproduced.
- **No transitive inference.** A reference chain through a role-less
  intermediate is declined.
- **Whole-value references only.** A role-less token holding an interpolated
  expression that embeds a reference contributes no edge. `resolveInPlace`
  handles those for resolution; they are not evidence of a role.
- **A group-level `$type` is not seen.** The propagation gate mirrors
  `classifyTextUnits`'s direct `val.$type === 'dimension'` check, so a source
  declaring `$type` once on the group and not on each token is unreachable by
  the inference. This is a pre-existing property of `classifyTextUnits` rather
  than something introduced here, and zygarden declares `$type` on every token
  node — but it is a real limit and this list claims to be complete.
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
