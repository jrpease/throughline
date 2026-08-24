# Native-token backlog — handoff

**Date:** 2026-08-24
**Supersedes:** `2026-08-24-ranked-backlog-handoff.md`

## Where the backlog stands

Agreed order, one item at a time, full brainstorm → spec → `/review-spec` →
plan → subagent execution → PR, pausing after each PR:

**#53 ✅ → #55 ✅ → #51 ✅ → #60 ✅ (PR #68 open) → #52 → #36 → #54**

| | |
|---|---|
| **#53** | Merged `698a236`. Native output that did not compile: 196 declarations with 15 broken symbols → **195 with 0**. |
| **#55** | Merged `b593b3b` (PR #59). Collision throw + `$type` inheritance. |
| **#51** | Merged `b73adcf` (PR #66). Compose font sizes and line heights emit `.sp`: **39 declarations flipped, zero magnitude drift.** |
| **#60** | [PR #68](https://github.com/jrpease/throughline/pull/68), **open**. Group `$type` no longer shadowed. 353 tests, six gates, e2e byte-identical. |
| Filed across these | #57, #58, #60✅, #61, #62, #63, #64, #67 |

**#60 was ranked above the remaining originals** because it was the one item
that turned correct output into wrong. That ranking survived contact with the
evidence only partly — see below.

## Start here — three things that change how the next item goes

**1. Measure severity on emitted output, not on a `preprocess` tree.** #60's
issue text, and spec revision 4 that spawned it, both claimed "correct becomes
wrong rather than loud becomes silent." Built end-to-end, #60's own example
emits `val textSmLineHeight = 20px` — does not compile, and
`tokens:validate-output` catches it under `no-bare-units` and
`unverifiable-dimension`. The genuinely silent case is a *unitless* child:
`val textSmLineHeight = 1.5`, a `Double` where a `Dp` belongs, passing the gate
clean. The deciding rule — `BARE_UNIT` fires only on unit-suffixed literals —
was already written two paragraphs above the wrong claim.

This matters directly for **#52**, which is *about* unitless ratios. Its
severity should be measured the same way before its spec argues anything.

**2. The stack is gone; branch off `main` again.** `scripts/lib/sd-native.mjs`
generates `references/native-adapter-config.md` from its whole body, so
concurrent branches conflict guaranteed — that is why #53/#55/#51 were stacked.
All three are merged and #68 is the only open native branch. If #52 starts
before #68 merges, **stack on `fix/60-group-type-shadowing`** and retarget the
child PR to `main` *before* the parent merges. Merging a parent with
`--delete-branch` auto-closes the stacked PR and it cannot be reopened once its
head has been rebased; that cost PR #65 on 2026-08-24, and its content had to
be reopened as #66.

**3. The e2e harness survives in this session's scratchpad and is the strongest
assertion available.** `<scratchpad>/e2e` holds style-dictionary 4.4.0 with
`lib/` symlinked to the repo's live `scripts/lib`, so building at `main` and at
`HEAD` and running `diff -r` is nearly free and rules out compensating changes
that declaration counts would miss. It is scratchpad-only and will not survive
indefinitely; rebuilding is the first step of any e2e run. No token source is
vendored — zygarden is external at `~/Dev/zygarden-frontend`, branch
`feature/apply-brandguide-styles`, read with `git show <branch>:<path>`.
**Do not check it out or modify it.**

Current baseline on `main` and on #68: **195 declarations, 39 `.sp`, 50 `.dp`**,
Kotlin and Swift byte-identical between the two.

## What #60 established that outlives it

**The hoist's type rule, stated no wider than it holds.** `hoistDualNodes`
never *changes* a type DTCG inheritance already determines; where inheritance
determines none, the carry supplies the dual node's as a repair. The tempting
stronger form — "a child ends with the type DTCG inheritance gives it in the
authored tree" — is false in exactly the case the carry exists for, and false
again when the hoisted node is a **group**, which acquires the type and passes
it to children the source never typed. That second case is
[#67](https://github.com/jrpease/throughline/issues/67), filed rather than
absorbed.

**The guard is one value per frame**, and the reason it is not more:

```js
const inherited = '$value' in node ? groupType : (node.$type ?? groupType);
```

Looking through `$value`-bearing nodes is what makes a dual node a non-source,
and the same value serves both the recursive descent and the carry guard,
because a hoisted child lands as a member of the frame it is computed for.
Anything touching that recursion must preserve both properties.

## Open questions

- **Does #52 still rank where it did?** It is the unitless-ratio case, which
  #60 just established is the *silent* half of this defect family — which
  argues it up, not down.
- **Does the consumption-layer epic (#39–#44) start after #54, or sooner?** All
  four native correctness items from the original ranking are now done or in
  review. The original reasoning was that #39 should begin on a clean base.
- **#67 vs #52 vs #36 for the next slot.** #67 is fresh, unmeasured, and
  unreachable in zygarden; measuring it is cheap and would settle it.

## Working note on process

Across #53, #55, #51 and #60, every defect a review caught was **a defect in the
written design, not the implementation** — and in #60 the reviewer's finding was
against prose I had written to *correct* earlier wrong prose. Two patterns worth
carrying:

- A tidy invariant is the most dangerous sentence in a spec, because it reads as
  the thing that makes a fix principled. State it, then hunt the case that
  breaks it.
- "Verification means executing something" has a layer. Executing the
  preprocessor is not executing the pipeline.
