# hoistDualNodes — `$type` inheritance and collision — design

**Issue:** [#55](https://github.com/jrpease/throughline/issues/55)
**Date:** 2026-08-23
**Depends on:** [#56](https://github.com/jrpease/throughline/pull/56) (#53). Same file,
and `references/native-adapter-config.md` is generated from the whole module, so
this branch stacks rather than forking from `main`.

## The two defects

`scripts/lib/sd-native.mjs`'s `hoistDualNodes` moves a dual node's child to a
camel-joined sibling: `text.sm.lineHeight` becomes `text.smLineHeight`, which
`name/camel` renders to `textSmLineHeight` — the identical symbol the un-hoisted
path would have produced. That part works and is tested.

1. **`$type` does not travel with the hoisted child.** If the child has no
   `$type` of its own and the enclosing group declares none, the hoisted token
   arrives untyped, no size transform fires, and it emits as a bare `20px`.
   Fails loudly — `no-bare-units` catches it.
2. **A name collision overwrites with no diagnostic.** If `text.smLineHeight`
   already exists as a sibling, the hoist silently replaces it. Fails silently.

## What the issue got wrong, and why it matters

The issue opens: *"DTCG permits a node carrying both a `$value` and children."*
`scripts/lib/dtcg.mjs:9` says the same — *"legal DTCG, and common in
Figma-derived sources."*

**Both are false against the current specification.** Design Tokens Format
Module, Draft Community Group Report of **30 July 2026**, §6.1 Group Structure:

> **Important:** The presence of a `$value` property definitively identifies an
> object as a token. If an object contains both `$value` and child tokens/groups,
> this creates an invalid structure where the object cannot be both a token and a
> group simultaneously. Tools *MUST* report this as an error.

This does not change what throughline should *do*. Figma-derived sources emit
dual nodes regardless, and refusing them would make the tool useless against its
own validation target. `hoistDualNodes` stays.

It changes two things that matter:

- **The two "legal DTCG" comments are factual errors** and are corrected. This
  repo demoted an adapter tier for overclaiming; a wrong citation of a spec is
  the same defect in a different place.
- **It settles defect 1.** The issue defers the fix pending a decision about
  "DTCG type-inheritance semantics… the spec does not obviously address the
  case." There is no such decision to make: the spec addresses the shape by
  forbidding it, so no reading of §5.2.2's inheritance rule governs it. We are
  defining behaviour for non-conforming input, and the deciding principle has to
  come from what this function is for.

## Decision — the hoist must be semantics-preserving

`hoistDualNodes` exists to make the hoisted child produce *"the identical symbol
the un-hoisted path would have produced."* That is a preservation guarantee, and
the name is not the only thing it has to preserve.

Apply DTCG's own inheritance rule (§5.2.2 — *"the token's type is inherited from
the closest parent group with a `$type` property"*) to the tree as authored:

| | closest ancestor carrying `$type` |
|---|---|
| before hoist | `text.sm` — the dual node itself |
| after hoist | `text` — the dual node is no longer an ancestor |

So the hoist **changes the token's resolved type** unless the type moves with it.
That is a bug in the hoist, not an open question about the spec. Carrying `$type`
onto the hoisted child restores exactly what the child would have resolved to in
place — the same argument that justifies the rename, applied to the other half of
the token's identity.

**Rule.** On hoist, if the child has no `$type` of its own, and the dual node
does, copy the dual node's `$type` onto the child. A child with its own `$type`
is never overwritten. Nothing else inherits — this is not a general
type-propagation pass.

Consequence worth naming: a dual node typed `dimension` with a child that is
genuinely something else, and that omits its own `$type`, now inherits
`dimension` and is wrong. It was untyped and wrong before. Both fail — the
difference is that the inherited case may fail *silently* where the untyped case
failed loudly under `no-bare-units`. That is the one real cost, and it is
accepted because the child omitting a `$type` under a differently-typed parent is
already malformed in a way no reading rescues, whereas the same-type case is the
overwhelmingly common one and is currently broken.

## Decision — collision throws

There is no reading under which silently discarding an authored token is
correct, and this project already holds that position in code: `nativeSources`
throws on mode collisions precisely because *"a token quietly disappearing
because two things resolved to one name"* is the worst failure in this pipeline.
This path is the same class with no equivalent guard.

Throw, naming both paths and the value being lost, in the shape `nativeSources`
already uses. Report **all** collisions in one error rather than the first —
`findModeCollisions` sets that precedent, and one-at-a-time errors make a
malformed source a repeated-run slog.

The check must catch a collision against **either** an authored sibling or an
earlier hoist in the same pass, since both lose a token.

## Changes

| File | Change |
|---|---|
| `scripts/lib/sd-native.mjs` | `hoistDualNodes`: carry `$type`; collect and throw on collisions. Must stay inside the `preprocess` `@doc-section` pair. |
| `scripts/lib/sd-native.test.mjs` | Fixtures for both defects. |
| `scripts/lib/dtcg.mjs` | Correct the "legal DTCG" comment. |
| `references/native-adapter-config.md` | Regenerate — CI-gated by `--check`. |

`preprocess`'s signature does not change. `flattenDtcg` is untouched: it descends
into dual nodes and yields both the parent value and the child, which is correct
regardless of the spec's view, because it reads what is actually there.

## Testing

1. **`$type` inheritance** — dual node typed `dimension`, child untyped: hoisted
   child arrives typed `dimension`. Child with its own `$type`: not overwritten.
   Dual node with no `$type`: child stays untyped (no invention).
2. **Collision** — camel-joined name already present as an authored sibling:
   throws, and the message names both paths.
3. **Collision between two hoists** in one pass: throws.
4. **Multiple collisions**: one error listing all of them.
5. **Regression** — the existing hoist tests pass unchanged; `preprocess` is
   still idempotent.
6. **End to end** — rebuild the four real outputs. **Expect no change:** 195
   declarations, 0 broken, `value-verified` 107. Zygarden's `text.*` children
   each carry `$type: dimension` and no name collides, so neither defect is
   reachable there. Confirming *nothing moved* is the actual assertion.
7. **Repo gates** — all six.

## Limitations

- **The real source cannot exercise either fix.** Both defects are unreachable in
  zygarden, which is why #50 did not hit them. Coverage is synthetic fixtures
  plus an end-to-end run that proves no regression. Stating this because the
  alternative — implying the e2e run validates the fix — is the overclaim this
  repo has been bitten by before.
- **Throwing is a breaking change** for any consumer whose source has a
  colliding name today. Their build currently succeeds and silently drops a
  token, so the break surfaces existing data loss rather than causing it.
- **Dual nodes remain unreported as invalid DTCG.** Detecting and warning on the
  shape itself is a separate question, and arguably belongs in a validator rather
  than a preprocessor. Out of scope; worth an issue.

## Out of scope

#51, #52, #54. This change must neither fix nor mask them.
