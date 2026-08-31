# Three open PRs — handoff

**Date:** 2026-08-28
**Supersedes:** `2026-08-28-v0.16.0-shipped-handoff.md`, which says **0 open PRs**
and carries a figure this session disproved. Both were true when written.

## State in one line

`main` is unchanged at `e45afc4`. **Three PRs are open**, all CI-green, all
mutually independent — zero file overlap between any pair, so they merge in any
order. Nothing is blocked on anything.

| PR | branch | closes | what it is |
|---|---|---|---|
| [#82](https://github.com/jrpease/throughline/pull/82) | `feat/81-compile-verification` | #81 | `ci/compile-native-output.mjs` + stubs; four e2e notes corrected |
| [#83](https://github.com/jrpease/throughline/pull/83) | `fix/80-release-gate-parity` | #80 | the missing release gate, plus a test that keeps the two lists in sync |
| [#84](https://github.com/jrpease/throughline/pull/84) | `feat/63-text-role-inference` | #63 | text-role inference from the reference graph |

**#84 is a breaking release** — nine Kotlin symbols change from `Dp` to
`TextUnit`. Its changelog entry is written and names the opt-out.

**One ordering note:** #84's e2e borrowed `ci/compile-native-output.mjs` from
#82's unmerged branch, read-only, and its note says so. If #82 is abandoned
rather than merged, that citation dangles — merging #82 first makes it true
retroactively. Not a blocker either way.

## What #63 changed, in one paragraph

A dimension referenced **only** by `fontSize`/`letterSpacing`/`lineHeight`
members is now stamped typographic, so `text.base` emits `sp` and `em` letter
spacing reaches Compose. Measured on 8 real builds: Kotlin 208 → 211
declarations, Swift byte-identical, Android unmatched 6 → **3**. A primitive
*nothing* references is deliberately not inferred — `tokens:validate-output`
names it instead (`unreferenced-text-sibling`), rather than guessing.

## Corrections this session made to things previously written down

- **"#63 takes Android from 6 unmatched to 2" was wrong — it is 6 → 3.**
  `typography.letterSpacing.widest` is referenced by nothing, so the graph
  cannot reach it. The figure had propagated from the issue into the previous
  handoff note; both occurrences are fixed.
- **A design spec claimed "nine or ten symbols change, mode-dependent."** The
  e2e disproved it: nine in any single build, but not the same nine — mobile and
  desktop swap `text.lg` ↔ `text.6xl`. Ten is a union across all 15 source
  files. **A merge of all 15 files is not a build** — it is a mode collision
  `nativeSources()` rejects, and merging anyway hides reference edges. Any
  measurement against zygarden must state which viewport pin it used.
- **Five places asserted the old limitation.** One of them,
  `references/sync-adapters.md`, ships to consumers and had been wrong since
  **#64**. All five now state the new rule and its remaining gap.

## Open issues filed this session

- **#85** — a group-level `$type` makes the whole native text-role pipeline a
  silent no-op: nothing stamped, zero `sp` on Android, and no advisory saying
  so. Pre-existing (#51), not introduced by #63. `flattenDtcgTypes` already
  implements DTCG 5.2.2 correctly and sits in the same file. **The substantial
  one.**
- **#86** — `references/` ships but only one file in it is gated; behaviour
  claims live in four or five places at once.
- **#87** — the 2026-08-21 e2e note's harness install list is missing
  `native-literal.mjs` (required since #70), so a rebuild from it fails. Two-line
  fix; needs a branch, since every current branch has an open PR.

## Where the backlog stands after these merge

- **#36** — validator silently drops a token on a `normalizeKey` collision. Last
  of the "instruments" items, outside the contended `sd-native.mjs`.
- **Native tail** — #57, #58, #61, #62, #67, #71, #72, #75. #71/#72 are one
  underlying gap in the advisory's type resolution and should be done together.
- **Consumption layer** — #39–#44. The largest unstarted body of work that is
  not #48, and the native base it was parked on is now clean.
- **#48** — native SwiftUI/Compose components. Multi-month; keep it distinct
  from token work in any roadmap statement.

## Open questions

- **Is a release cadence wanted?** 0.16.0 followed 0.15.0 by two weeks. #84 is
  breaking, so it forces a version decision when it merges.
- **#85 changes #51's behaviour**, so fixing it likely needs its own `Breaking`
  entry. Worth deciding whether it rides the same release as #84 or a later one.
