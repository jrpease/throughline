# Ranked backlog — session 2 handoff

**Date:** 2026-08-24
**Supersedes:** `2026-08-23-ranked-backlog-handoff.md`

## Where the backlog stands

Agreed order, one item at a time, full brainstorm → spec → `/review-spec` → plan
→ subagent execution → PR, pausing after each PR:

**#53 ✅ merged → #55 ✅ PR #59 open → #51 → #52 → #36 → #54**

| | |
|---|---|
| **#53** | Merged as `698a236`. Native output that did not compile: 196 declarations with 15 broken symbols → **195 with 0**. |
| **#55** | [PR #59](https://github.com/jrpease/throughline/pull/59), open, 20 commits. Collision throw + `$type` inheritance. **331 tests**, six gates green. |
| Follow-ups filed | [#57](https://github.com/jrpease/throughline/issues/57), [#58](https://github.com/jrpease/throughline/issues/58), [#60](https://github.com/jrpease/throughline/issues/60), [#61](https://github.com/jrpease/throughline/issues/61) |

## Start here — three things that change how the next item goes

**1. #51 is no longer the issue it was when we ranked it.** #59 *widens* it,
deliberately and with a test recording that: an untyped `fontSize` child hoisted
under a `dimension`-typed dual node now inherits `dimension` and emits `.dp`
rather than `.sp`, which defeats the user's font-scale accessibility setting.
The bare literal it used to emit was caught loudly by `no-bare-units`; that gate
no longer fires on it. So #51's blast radius grew, and its fix — deciding how
DTCG font sizes are identified without a name-based heuristic — is now
load-bearing for two changes rather than one.

**2. Branch off the open native branch, not `main`.** `scripts/lib/sd-native.mjs`
generates `references/native-adapter-config.md` from its *whole body*, so two
branches that both touch it conflict guaranteed. #55 was stacked on #53 for this
reason and rebased with `git rebase --onto main <old-tip>` after the squash
merge. #51, #52 and #54 all touch the same file. Also: regenerate the doc at the
end of **every** task, not once at the end — a freshness test goes red the moment
the module changes, and a suite with a known failure is one a real regression
hides behind.

**3. The e2e harness is scratchpad-only and will not survive.** It lived at
`<session-scratchpad>/e2e` with style-dictionary 4.4.0 and `scripts/lib`
symlinked to the repo's live code. No token source is vendored here — zygarden
is external, at `~/Dev/zygarden-frontend`, branch
`feature/apply-brandguide-styles`, read with `git show <branch>:<path>`. Do not
check it out or modify it. Rebuilding is the first step of any e2e run.

**The assertion worth reusing:** rather than counting declarations, build at
`main` and at `HEAD` and `diff -r`. Byte-identical output rules out compensating
changes that counts would miss, and with the harness up it is nearly free.

## What #55 established that outlives it

**DTCG forbids dual nodes.** #55's premise — "DTCG permits a node carrying both
a `$value` and children" — is false against the 30 July 2026 draft, §6.1,
MUST-level, and §6.2's `$root` is the sanctioned alternative. Two repo comments
repeating that falsehood are corrected in #59. This does not change what
throughline does — Figma emits dual nodes — but behaviour for the shape is a
judgment about malformed input, and must not be argued as spec interpretation.

**DTCG §5.2.2 orders type resolution**, and the ordering is load-bearing here: a
reference-valued token takes its *referent's* type, outranking group
inheritance. `preprocess` runs `resolveInPlace` before `hoistDualNodes`, so by
hoist time every whole-value reference is already a literal and the hoist cannot
tell. A module-level `WeakSet` records them while the reference is still
visible. Anything touching that pipeline must preserve this.

## Open questions

- **Merge order.** #59 targets `main` and is mergeable. Nothing blocks it.
- **#60 is the honest loose end of #59.** Where an enclosing *group* carries a
  `$type` that correctly describes a hoisted child, the dual node's type shadows
  it — the one accepted cost that turns correct output into wrong, and the only
  one with no test. Deliberate: a test would read as endorsement.
- **Does the consumption-layer epic (#39–#44) start after #54, or sooner?** The
  original reasoning was that #39 should begin on a clean base. Two of the four
  correctness items are now done.

## Working note on process

Across #53 and #55, reviews caught six defects a green suite could not, and
**every one was a defect in the written design, not the implementation**. Two
reached code and were caught only by an escalated-tier review reading real
output. Both had the same cause: narrowing or deleting a shared helper without
accounting for every consumer it served. Worth spending review budget on the
spec and on the diff against real output rather than on transcription.
