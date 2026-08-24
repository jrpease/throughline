# hoistDualNodes — `$type` inheritance and collision — design

**Issue:** [#55](https://github.com/jrpease/throughline/issues/55)
**Date:** 2026-08-23
**Revision:** 4 — the accepted-cost section now records the *correct becomes
wrong* sub-case alongside *loud becomes silent*. See
[Revision history](#revision-history).
**Depends on:** [#56](https://github.com/jrpease/throughline/pull/56) (#53). Same
file, and `references/native-adapter-config.md` is generated from the whole
module, so this branch stacks rather than forking from `main`.

## The two defects

`scripts/lib/sd-native.mjs`'s `hoistDualNodes` moves a dual node's child to a
camel-joined sibling: `text.sm.lineHeight` becomes `text.smLineHeight`, which
`name/camel` renders to `textSmLineHeight` — the identical symbol the un-hoisted
path would have produced. That part works and is tested.

Both defects reproduce against the shipped function:

```
A. $type does not travel
   in : {"text":{"sm":{"$value":"14px","$type":"dimension","lineHeight":{"$value":"20px"}}}}
   out: {"text":{"sm":{"$value":"14px","$type":"dimension"},"smLineHeight":{"$value":"20px"}}}
                                                             ^ untyped

B. collision with an authored sibling
   in : {"text":{"sm":{"$value":"14px","lineHeight":{"$value":"20px"}},"smLineHeight":{"$value":"28px"}}}
   out: {"text":{"sm":{"$value":"14px"},"smLineHeight":{"$value":"20px"}}}
                                                        ^ authored 28px is gone
```

**A third variant the issue does not name, also measured:** two *hoists* can
collide with each other, with no authored sibling involved.

```
D. in : {"t":{"a":{"$value":"1px","bC":{"$value":"2px"}},"aB":{"$value":"3px","c":{"$value":"4px"}}}}
   out: {"t":{"a":{"$value":"1px"},"aB":{"$value":"3px"},"aBC":{"$value":"4px"}}}
                                                          ^ a.bC's 2px is gone
```

`t.a.bC` and `t.aB.c` both camel-join to `t.aBC`. Any collision guard has to
cover this, not only collisions against authored siblings.

## What the issue got wrong, and why it matters

The issue opens: *"DTCG permits a node carrying both a `$value` and children."*

**That is false against the current specification.** Design Tokens Format Module,
Draft Community Group Report of **30 July 2026**, §6.1 Group Structure:

> **Important:** The presence of a `$value` property definitively identifies an
> object as a token. If an object contains both `$value` and child tokens/groups,
> this creates an invalid structure where the object cannot be both a token and a
> group simultaneously. Tools *MUST* report this as an error.

Normative, not a note. And the prohibition is deliberate rather than an
oversight: §6.2 defines `$root` as the sanctioned way to express exactly what a
dual node is reaching for — *"Groups MAY contain a root token alongside child
tokens and nested groups. A root token provides a base value for the group while
allowing for variants or extensions."* The shape has a blessed spelling; the
dual node is not it.

This does not change what throughline should *do*. Figma-derived sources emit
dual nodes regardless, and refusing them would make the tool useless against its
own validation target. `hoistDualNodes` stays.

It changes two things:

- **Two comments in this repo state the falsehood** and are corrected:
  - `scripts/lib/sd-native.mjs:61` — *"legal DTCG, and common in Figma-derived
    sources"*, inside the `preprocess` `@doc-section`, so it flows into
    `references/native-adapter-config.md:128`.
  - `scripts/build-native-adapter-config.mjs:102` — hand-written narrative prose,
    *"The dual-node pattern is legal DTCG and common in Figma-derived sources"*,
    which becomes `references/native-adapter-config.md:117`.

  Revision 1 of this spec cited `scripts/lib/dtcg.mjs:9` for this. **That was
  wrong** — `dtcg.mjs` describes the traversal behaviour and makes no legality
  claim at all. Correcting it would have left both real claims standing, and
  `--check` would still pass, since the generator was unchanged. A wrong citation
  in the paragraph arguing that wrong citations are defects.
- **It removes the question the issue defers on.** The issue holds defect 1
  pending a decision about *"DTCG type-inheritance semantics… the spec does not
  obviously address the case."* The spec addresses the shape by forbidding it, so
  there is no conforming reading to discover. What remains is a judgment call
  about non-conforming input — which is a different and smaller thing than a spec
  interpretation, and should not be dressed up as one.

## Decision — carry `$type`, as a judgment about malformed input

**Carry it.** On hoist, if the child has no `$type` of its own and the dual node
does, copy the dual node's `$type` onto the child.

The grounds are pragmatic, and stating them as anything stronger would be
overclaiming:

1. **It is what the author meant.** A dual node typed `dimension` with a
   `lineHeight` child is one concept; the type describes the family.
2. **It is what the real producer emits.** In zygarden every `text.*` child
   already carries `$type: dimension` explicitly — the same answer the
   inheritance would give.
3. **The alternative is worse in the common case.** Untyped means no size
   transform fires and the token emits as a bare literal.

**What this argument is not.** Revision 1 presented this as a deduction from
DTCG §5.2.2 — *"the token's type is inherited from the closest parent group with
a `$type` property"* — claiming the hoist changes the child's resolved type from
`text.sm` to `text` and so must preserve it. That argument does not survive
contact with the text it cites, in two ways:

- §5.2.2 and §6.7.3 both say **parent *group***. §6.1, quoted above, says a node
  with `$value` is *definitively a token*. So the dual node is not a group, and
  the rule does not name it as an inheritance source. Under a strict reading both
  the before and after columns resolve to `text`, and there is nothing to
  preserve.
- Nothing in this pipeline resolves the child's type pre-hoist anyway. Style
  Dictionary's collector never reaches it — that is the whole reason the hoist
  exists — and `flattenDtcg` carries values, not types. The "before" state
  described a resolution no consumer performs.

It was also self-contradictory: the preceding section disqualified §5.2.2 as
governing, and the next paragraph decided by §5.2.2. Recorded here rather than
quietly deleted, because this repo's failure mode is confident wrong reasoning
surviving into architecture.

### Exclusion — a child whose authored value was a whole-value reference

§5.2.2 orders its rules: **(1)** if the value is a reference, the type is the
*resolved type of the referent*; **(2)** *otherwise* inherit from the closest
parent group. Rule 1 outranks rule 2. Stamping the dual node's `$type` over a
reference-valued child inverts that precedence.

This is not hypothetical, and it manufactures an instance of an open issue.
Measured:

```
authored : text.sm  { $value "14px", $type "dimension",
                      lineHeight: { $value "{ratio.normal}" } }     ratio.normal is $type number
after preprocess : { "$value": "1.5" }        <- resolveInPlace already flattened the reference
naive rule gives : { "$value": "1.5", "$type": "dimension" }   -> emits 1.50.dp  (a new #52)
5.2.2 rule 1 says: { "$value": "1.5", "$type": "number" }
```

`preprocess` is `hoistDualNodes(resolveInPlace(...))`, so by the time the hoist
runs every whole-value reference is already a literal and the hoist cannot tell
the two apart.

**Rule.** A child whose *authored* `$value` was a whole-value reference does not
inherit. It keeps whatever it has, which is today's behaviour — no regression,
and no new #52 instances.

**Mechanism.** `resolveInPlace` already tests `WHOLE_REF` and is the only place
that still knows. It records such a node in a **module-level `WeakSet`**; the
hoist checks membership and skips inheritance.

A `Symbol` property was tried first and rejected on review. It is invisible to
`Object.entries` and `JSON.stringify`, and real Style Dictionary (4.4.0 and
5.5.2) tolerates it — but `assert.deepEqual` under `node:assert/strict`
**does** compare own symbol properties, and `structuredClone` drops them. So
`preprocess(preprocess(x))` differed structurally from `preprocess(x)` whenever
a reference was present, breaking the idempotency this module documents at
`sd-native.mjs:308` and relies on in real builds. The shipped idempotency test
passed only because its fixture contained no alias — a trap for whoever edited
that fixture next. A `WeakSet` writes nothing to the object, so the property
holds exactly rather than being managed, and entries are collected with the
clone.

Reordering the pipeline to hoist before resolving is **not** the fix: aliases
elsewhere in the source point at the pre-hoist path (`{text.sm.lineHeight}`), and
renaming first would break them.

### The accepted cost, stated accurately

A dual node typed `dimension`, with a child that is genuinely something else,
that omits its own `$type`, and whose value is a literal, now inherits
`dimension` and is wrong.

Revision 1 claimed this trades a loud failure for a silent one, and that the
shape is "malformed in a way no reading rescues." Both parts were wrong:

- **`no-bare-units` is narrower than claimed.** `BARE_UNIT` is
  `/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)$/` — it fires only on a
  *unit-suffixed* literal. Verified: `20px` caught, `1.5` not. The archetypal
  wrongly-typed child is a unitless ratio, so the "loud before" baseline holds
  for `20px` and fails for the case most likely to occur.
- **"No reading rescues it" is false.** §5.2.2 rule 1 rescues a reference-valued
  child exactly, which is why the exclusion above exists.

The honest statement of the residual cost: *a child with a **literal** value, no
`$type`, and a parent whose type does not describe it is malformed, and is
accepted as newly silent.* That is narrow, and it is the price of fixing the
common case.

Revision 2 wrote "a *differently-typed* parent" there, which was too narrow —
see the #51 case below, where the parent's type is `dimension` and so is the
child's, and the emitted unit is still wrong.

**And "loud becomes silent" does not cover every case either.** One sub-case is
*correct becomes wrong*. When an enclosing **group** carries a `$type` that does
describe the child, the carry shadows it — DTCG §5.2.2 inherits from the closest
parent *group*, and the dual node is a token, not a group, so before this change
the group's type was the one that applied. Measured against `main`:

```
in   : { text: { $type: "dimension",
                 sm: { $value: "#fff", $type: "color",
                       lineHeight: { $value: "20px" } } } }
main : text.smLineHeight = { $value: "20px" }                  -> inherits dimension from the group: RIGHT
HEAD : text.smLineHeight = { $value: "20px", $type: "color" }  -> WRONG
```

There was no loud failure here and no malformed input by the standard the
sentence above uses — there was a right answer, and the carry replaces it.

Not fixed, deliberately. The rule that would fix it — carry the dual node's
`$type` only when no enclosing group supplies one — means threading the ancestor
group chain through the recursion for a shape that requires a dual node typed
differently from both its parent group and its own child. Unreachable in
zygarden, and the added machinery is a worse trade than the defect. Recorded
here so the residual is described accurately rather than flatteringly, which is
the whole point of this section.

### Blast radius — two open issues, both widened, both recorded

The rule converts a loud failure into a silent one in two measured cases. Both
are the *same mechanism*, and both are demonstrated by test rather than
asserted away, because "this change must neither fix nor mask them" is worth
nothing if the widening is simply not looked for.

| Issue | Shape the rule now produces | Before | After |
|---|---|---|---|
| **#52** | untyped **unitless** literal child under a `dimension` dual node | `1.5` | `1.50.dp` — a ratio in density-independent pixels |
| **#51** | untyped **fontSize** child under a `dimension` dual node | `18px` bare, caught by `no-bare-units` | `18.00.dp` — compiles, wrong unit, defeats the user's font-scale setting |

Neither is *masked* — no existing instance is hidden, and the test asserting
`1.50.dp` still validates keeps #52 reachable. Both are widened: the rule
manufactures the shape in sources where it did not occur.

**Not fixed here, deliberately.** The mechanism is the one this section already
accepts, and the only way to exempt #51's case would be to special-case a child
*named* `fontSize` — a name-based heuristic, which is the precise thing #51
exists to complain about. Fixing it properly means deciding how DTCG font sizes
are identified, which is #51's own open question.

Neither instance is reachable in zygarden: every `text.*` and
`typography.textStyle.*` child carries an explicit `$type`, so nothing inherits.

## Decision — collision throws

There is no reading under which silently discarding an authored token is
correct, and this project already holds that position in code: `nativeSources`
throws on mode collisions precisely because a token quietly disappearing because
two names resolved to one is the worst failure in this pipeline. This path is the
same class with no equivalent guard.

Fully specified, because four things about "throw" are underdetermined:

1. **What counts as a collision.** The camel-joined name is already present on
   the destination node — as an authored token, as an authored **group** (which
   would destroy a whole subtree), or as a name already claimed by an earlier
   hoist in the same pass (case D above). All three are collisions.
2. **Identical values still throw.** `findModeCollisions` exempts identical
   values (`defs.length > 1 && distinct.size > 1`), and revision 1 cited it as
   precedent without noting the divergence. We diverge deliberately: a mode
   collision is a *dedupe* across files where identical definitions are
   genuinely redundant, whereas this is two distinct authored tokens landing on
   one name. Even with equal `$value`, they may differ in `$type` or
   `$description`, and the source is malformed either way. Throw regardless of
   value.
3. **Detect, do not assign.** To report every collision the pass must continue
   past the first, and continuing while still performing the overwriting
   assignment means later detections are computed against an already-corrupted
   tree. Confirmed: with `{ text: { sm: {…lineHeight}, smLineHeight: {…bold} } }`,
   `sm`'s hoist replaces `smLineHeight` while the enclosing loop's
   `Object.entries` snapshot still holds the detached old object, so
   `smLineHeightBold` is emitted from a node no longer in the tree. On collision:
   record it, claim the name, and skip the assignment.
4. **The top frame throws, not the deepest.** `hoistDualNodes` is self-recursive.
   An accumulator must be threaded through the recursion and the throw must
   happen once, after the whole tree is walked. An implementation that throws at
   the end of each frame reports one subtree and stops. The recursion is
   depth-first (`hoistDualNodes(val)` runs before the parent hoists its own
   children), so the deepest frame finishes first — this is the natural mistake
   to make.

Error shape mirrors `nativeSources`: count, cause, then up to five collisions
naming both paths and the value at risk, with an "…and N more" tail.

## Changes

| File | Change |
|---|---|
| `scripts/lib/sd-native.mjs` | `hoistDualNodes`: carry `$type` with the reference exclusion; thread a collision accumulator; throw from the top frame. `resolveInPlace`: tag whole-value references. Both must stay inside the `preprocess` `@doc-section` pair. |
| `scripts/lib/sd-native.test.mjs` | Fixtures for both defects, the third collision variant, and the exclusion. |
| `scripts/build-native-adapter-config.mjs` | Correct the "legal DTCG" narrative prose at :102. |
| `references/native-adapter-config.md` | Regenerate — CI-gated by `--check`. |

`preprocess`'s signature does not change. `scripts/lib/dtcg.mjs` is **not**
touched — revision 1 listed it in error. `flattenDtcg` stays as is: it descends
into dual nodes and yields both the parent value and the child, which is right
regardless of the spec's view, because it reads what is actually there.

## Testing

Each item names the depth it exercises, because a `$type` carry that runs in the
wrong recursion frame passes every single-level test.

1. **`$type` inheritance, one level** — dual node typed `dimension`, child
   untyped → child arrives typed. Child with its own `$type` → not overwritten.
   Dual node with no `$type` → child stays untyped, nothing invented.
2. **`$type` inheritance, two levels** — `text.sm` typed, `lineHeight` untyped
   and itself dual with a `tight` child. Both `smLineHeight` and
   `smLineHeightTight` arrive typed. This is the test that catches a wrong
   recursion frame. (The current depth-first order already produces both names
   correctly; the assertion is that the types follow.)
3. **Reference exclusion** — child whose authored `$value` is `{ratio.normal}`
   where `ratio.normal` is `$type: number`, under a `dimension` dual node: the
   child does **not** become `dimension`.
4. **Collision, authored token sibling** — throws; message names both paths.
5. **Collision, authored *group* sibling** — throws rather than destroying the
   subtree.
6. **Collision between two hoists** (case D) — throws.
7. **Collision with identical values** — throws anyway.
8. **Multiple collisions at different depths** — one error listing all of them.
   Different depths specifically, to catch a throw from the wrong frame.
9. **Idempotency** — `preprocess(preprocess(x))` equals `preprocess(x)`.
   `sd-native.mjs:246` asserts idempotency in prose and real builds rely on it,
   but **no such test exists today** — revision 1 wrongly described this as a
   regression test to preserve. It has to be written.
10. **Regression** — the existing hoist and "does not mutate its input" tests
    pass unchanged.
11. **#52 widening** — a demonstration that an untyped unitless literal child now
    inherits `dimension`. Asserted so the widening is recorded, not discovered
    later.
12. **Repo gates** — all six.

## Limitations

- **The real source cannot exercise either fix.** Both defects are unreachable in
  zygarden — its `text.*` children each carry `$type: dimension` and no name
  collides — which is why #50 did not hit them. Coverage is synthetic fixtures
  plus an end-to-end run proving no regression.
- **The end-to-end run is not reproducible by a reviewer or by CI.** No token
  source is vendored in this repo; zygarden is external, read from
  `~/Dev/zygarden-frontend` at branch `feature/apply-brandguide-styles`, through
  a scratch harness with style-dictionary installed. The expected result is *no
  change*: 195 declarations, 0 broken, `value-verified` 107. Confirming nothing
  moved is the whole assertion, and it is an author-run check.
- **Throwing is a breaking change** for any consumer whose source has a colliding
  name today. Their build currently succeeds and silently drops a token, so the
  break surfaces existing data loss rather than causing it.
- **Dual nodes remain unreported as invalid DTCG.** Now that the shape is known
  to be non-conforming, detecting and reporting it is a real option — but it
  belongs in a validator, not a preprocessor whose job is to make the build work.
  Out of scope; filed as #58.

## Out of scope

#51, #52, #54. This change must neither fix nor mask them — see test 11, which
records the one place it widens #52 rather than leaving the claim unexamined.

## Revision history

**Revision 4 (2026-08-24)** — the final whole-branch review. One correction,
again to a claim rather than the decision: the accepted-cost section framed the
residual entirely as *loud becomes silent*, and one sub-case is *correct becomes
wrong*. Where an enclosing group carries a `$type` that describes the child, the
carry shadows it — and DTCG §5.2.2 inherits from the closest parent *group*, so
the group's type is the one that applied before. Measured and recorded above,
with the reason it is not fixed.

The same review found two things outside this document, both fixed rather than
recorded: the collision error message described only the authored-sibling case
and misdirected on the hoist-vs-hoist variant, and `CHANGELOG.md` had no entry
for a change that makes a consumer's build throw.

**Revision 3 (2026-08-24)** — Task 2's review, during execution. Two
corrections, both to claims this document made rather than to the decision:

1. **The mechanism changed from a `Symbol` property to a `WeakSet`.** The symbol
   was compared by `assert.deepEqual` and dropped by `structuredClone`, so it
   broke structural idempotency — and the test meant to catch that passed only
   because its fixture had no alias.
2. **The blast-radius section named only #52; the rule widens #51 by the
   identical mechanism.** An untyped `fontSize` child under a `dimension` dual
   node becomes `dimension`, so `18px` (bare, caught loudly) becomes `18.00.dp`
   (compiles, wrong unit). The accepted-cost sentence said "a *differently-typed*
   parent," which does not describe that case at all. Both widenings are now
   tabulated and each has its own test.

**Revision 2 (2026-08-23)** — `/review-spec` returned "needs revision" and was
right on every count that mattered. Four corrections:

1. **Mis-citation.** Revision 1 attributed the "legal DTCG" claim to
   `scripts/lib/dtcg.mjs:9`, which does not make it. The real sites are
   `sd-native.mjs:61` and `build-native-adapter-config.mjs:102`. Following
   revision 1's Changes table would have edited an innocent comment and left both
   falsehoods in place.
2. **The defect-1 argument was unsound and self-contradictory** — it disqualified
   §5.2.2 and then reasoned from it, and it read "parent group" as "ancestor"
   when §6.1 says a dual node is definitively a token. Restated as the judgment
   about malformed input that it actually is.
3. **A real hazard the rule created**: reference-valued children. `resolveInPlace`
   flattens references before the hoist, so the naive rule stamps the parent's
   `$type` over the referent's, inverting §5.2.2's own precedence and
   manufacturing a new #52 instance. Exclusion added.
4. **The accepted-cost paragraph flattered the decision** — `no-bare-units` does
   not catch a unitless ratio, so the "loud before" baseline was false for the
   likeliest case, and "no reading rescues it" was contradicted by §5.2.2 rule 1.

Also: collision behaviour fully specified (four underdetermined points), the
idempotency test identified as missing rather than existing, test depths named,
and the e2e run marked as author-run and not CI-reproducible.
