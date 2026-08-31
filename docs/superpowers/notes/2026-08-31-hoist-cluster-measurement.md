# The dual-node hoist cluster — measurement before priority

**Date:** 2026-08-31
**Purpose:** six open issues describe defects in `hoistDualNodes` and its `$type`
carry. Four say "unmeasured" or "not reachable in zygarden". This run puts one
fixture per shape through the real pipeline before any of them is scheduled.
**Outcome:** the priority order this produces is the reverse of the intuitive one.

## Why this run exists

Three releases in five days went out over this subsystem, each cut when a PR
merged rather than when a body of work closed. Treating the remainder as one
release means knowing what is actually in it. #67 explicitly asks for this:
*"Worth measuring before deciding priority."*

## Harness

The rebuilt harness from the #85 run — Style Dictionary 4.4.0, `build.mjs`
(top-level + platform wiring), module installed by copy as
`lib/{dtcg,native-literal,sd-native}.mjs`. Baseline is `978de03`. Each fixture is
the minimal shape from its own issue, verbatim where the issue gave one.

## Result

| issue | emitted Kotlin | compiles | gate catches it |
|---|---|---|---|
| **#67** carry onto a hoisted group | `val textSmHeightsLine = 20px` | **NO** — `unresolved reference 'px'` | **yes** — `no-bare-units` + `unverifiable-dimension` |
| **#89** child typed only by the carry | `val textSmLineHeight = 20.00.dp` (wants `sp`) | yes | **no** |
| **#71** advisory cannot see the carry | `val carrySmLineHeight = 1.5` — a `Double` where `Dp` belongs | yes | **no** |
| **#72** untyped base behind a typed alias | `val baseRatio = 1.5` | yes | **no** |
| **#90** hoist invents a typographic name | `val aFontSize = 16.00.sp` | yes | n/a |

## What that changes

**#67 looked like the worst of the set and is the mildest.** It is the one where
the hoist invents a type outright, so it reads as the most serious defect. But
the invented type makes every size transform decline, the value falls through
raw, and the emitted file **does not compile** — and the existing gate names it
correctly with two rules. A consumer hitting this gets a red build and an
accurate message. That is the system working.

**#89, #71 and #72 are the silent ones.** Each compiles, each is wrong, and
nothing anywhere says so: a font size rendering as `dp` and ignoring the user's
system font-size setting; a `Double` where Compose wants a `Dp`; a unitless
dimension reported by no rule at all. This repo's recurring position is that a
green run which verified nothing is the worst outcome, and these are three of
them.

**#90 is the weakest.** It compiles, and the stamp it produces — `a.font.size`
emitting `sp` — is arguably what the author meant. Its real cost is that
`preprocess` is not idempotent, which contradicts four shipped comments. Worth
fixing for that reason, not for its output.

**Revised order: #89 → #71 + #72 → #67 → #90.** Silence first, then the loud one.

## The one that is not free

#67's fix is a single condition — restrict the carry to token children — but it
is not cosmetic. Where the carried type was **usable**, output changes:

```
in:  { text: { sm: { $value: "14px", $type: "dimension",
                     heights: { line: { $value: "20px" } } } } }

main:  val textSmHeightsLine = 20.00.dp     compiles
fixed: val textSmHeightsLine = 20px         does NOT compile
```

So the correct fix turns a green build red for this shape. Taken anyway, on
**#52's precedent**: a value whose type the source never stated is declined by
every transform and emitted raw, rather than having a type invented for it, and
the gate is what tells the author. The source here is under-specified — DTCG
8.2.1 requires a dimension to carry a `$type` and this one does not — and the
author gets `no-bare-units` plus `unverifiable-dimension` naming the exact
symbol. An invented type that happens to be right is still a guess.

**Regression control:** real zygarden, light+mobile pin, `Tokens.kt` and
`Tokens.swift` **byte-identical** before and after. The shape needs a dual node
with a group child, and zygarden's nine dual nodes have token children only.

## Results, appended as the cluster is fixed

One document for the whole release rather than one note per PR — the point of
batching this work is that the pieces are read together.

### #67 — carry restricted to token children

Output byte-identical on zygarden. On the usable-carried-type shape,
`20.00.dp` → bare `20px`, which does not compile, by design (see above).

### #89 — the carry is now modelled ahead of the hoist

```
main:   val textSmLineHeight = 20.00.dp
fixed:  val textSmLineHeight = 20.00.sp
```

Compile-verified: `kotlinc` typechecks to bytecode. Zygarden byte-identical in
both `Tokens.kt` and `Tokens.swift`.

The mechanism worth recording, because it generalises: the ordering did **not**
change. Classification still runs before the hoist, because the hoist consumes
the leaf name it matches on. What changed is that the carry is now *computed
ahead of time* from the raw tree by `flattenPipelineTypes`, so classification
reads the type the pipeline is going to apply rather than the type the tree
happens to hold at that instant. A rule that runs later can be modelled earlier
as long as its inputs are all present earlier — and the carry's are.

That is also why the map must be built on the **raw** dict: the carry's last
condition asks whether a value *was* a whole-value reference, and `resolveInPlace`
has already rewritten it to a literal by the time the resolved clone exists.

## Reproduce

```
$ cd <harness>
$ for f in 67 89 90 71 72; do node build.mjs tok-$f out-$f; done
$ for f in 67 89 90 71 72; do node <repo>/ci/compile-native-output.mjs out-$f --allow-missing; done
```
