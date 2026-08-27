# Native stack landed, and the e2e evidence audit — handoff

**Date:** 2026-08-27
**Supersedes:** `2026-08-24-native-backlog-handoff.md`

## The stacked landing — done, and the trap that is not in the old instructions

Both PRs landed on 2026-08-27. `main` is at `a8123fe`.

| PR | issue | squash commit |
|---|---|---|
| [#69](https://github.com/jrpease/throughline/pull/69) | #52 unitless ratios | `509845a` |
| [#74](https://github.com/jrpease/throughline/pull/74) | #54 stock transform accounting | `a8123fe` |

The retarget-before-merge ordering worked as written — `gh pr edit 74 --base main`,
then `gh pr merge 69` **without** `--delete-branch`. #74 stayed open. That part of
the constraint is settled; it exists because merging a parent with
`--delete-branch` auto-closes the stacked child, which cannot be reopened once its
head has been rebased. That cost PR #65 on 2026-08-24.

**What the instructions did not say, and nearly cost a bad merge:** the moment you
retarget the child while the parent is still open, GitHub reports it
`MERGEABLE / CLEAN` — with **26 commits**, its own 10 plus the parent's 16.
Nothing in that status reveals the parent is riding along, and merging there
would have squashed both PRs into one commit under the child's title. After the
parent squash-merges, the child does *not* shrink on its own, because the squash
orphaned its copies of the parent's commits. Rebase explicitly:

```
git rebase --onto origin/main <parent-tip> <child-branch>
git push --force-with-lease
```

#74 went 26 → 10 commits and 8 files this way, no conflicts. **Verify the commit
count after retargeting, not just the mergeable flag.**

Both were stacked rather than parallel because `scripts/lib/sd-native.mjs`
generates `references/native-adapter-config.md` from its whole body, so two
branches off `main` that both touch it conflict guaranteed.

## What shipped

**#54 — stock transform accounting.** `PLATFORMS` claimed to mirror Style
Dictionary's stock transform groups but nothing checked it, and the four
rem-assuming transforms it declines existed only as an *absence* from an array.
Now each preset carries `stockGroup`, the exclusions are a declared map with
reasons, and `auditStockGroups` warns at registration about any stock transform
neither run nor declined. Warns, never throws; never changes an exit code.

The design inverts what the issue proposed. Rather than snapshotting the stock
lists and asserting live-vs-snapshot, it asks whether anything in the live group
is unaccounted for — which needs **no snapshot**, so there is nothing to keep
fresh and no way to confuse "our snapshot is stale" with "Style Dictionary
drifted." Spec: `docs/superpowers/specs/2026-08-27-stock-transform-accounting-design.md`.

## The measured drift table, because it took two installs to get

Read from real installs via `StyleDictionary.hooks.transformGroups`:

| group | 4.4.0 | 5.5.2 |
|---|---|---|
| `ios-swift` | 6 names | **identical** |
| `compose` | 6 names | **identical** |
| `ios` | …`size/remToPt` | …`size/remToFloat` — **renamed** |
| transforms registered | 55 | 62 — **+7** |

Both drift directions are real in Style Dictionary; they have simply not landed
on the two groups we consume. `hooks.transformGroups` is readable **statically
on the class** in both versions, and on an instance too.

**The Style Dictionary installs live in the session scratchpad and will not
survive.** Rebuild with
`npm install style-dictionary@<v> --prefix <dir> --no-save` — never into the
repo, which declares zero dependencies deliberately.

## What is unfinished

**Nothing has been released since 0.15.0.** Ten CHANGELOG entries across eight
issues now sit unreleased: #34, #50, #53, #55, #51, #60, #52, #54. A version cut
has been deferred twice — 2026-08-26 and again 2026-08-27.

**PR [#76](https://github.com/jrpease/throughline/pull/76) is open** — a
documentation-only change scoping the #55 e2e procedure to the harness that ran
it. One commit, green, `MERGEABLE/CLEAN` against `main`.

## Open questions for the next session

- **#73 — was #55's and #60's e2e evidence vacuous?** **Answered and closed
  2026-08-27: no.** Both runs were sound, neither for the reason the issue
  assumed. #55 ran at 10:22, before the top-level `lib/` directory existed
  (born 13:46), so a build importing `./lib/` would have thrown
  `ERR_MODULE_NOT_FOUND`; both builds recorded `EXIT:0`, so the swap hit the
  only surface present. #60 ran synthetic fixtures reaching the defect, and
  those moved across the swap (`20px` → `20.00.dp`) — which a no-op cannot do.
  What was stale was the *procedure text*, frozen after the harness was
  restructured and inherited four days later. `2026-08-24-hoist-dual-nodes-e2e.md`
  now carries a warning ahead of its steps (PR #76), and the general practice is
  [#77](https://github.com/jrpease/throughline/issues/77).
- **Which backlog slot is next.** #36 (validator silently drops a token to a key
  collision) is the last of the "instruments" items. The consumption-layer epic
  (#39–#44) has been parked pending a clean native base, which it now has. The
  native tail — #62, #63, #64, #67, #70, #71, #72 — is individually small, and
  #71/#72 are the same underlying gap in the advisory's type resolution and
  should be done as one item.
- **#54's own recorded limits** are in the spec's §12 rather than solved. One
  is now tracked as [#75](https://github.com/jrpease/throughline/issues/75) —
  a transform that is both run *and* declined is invisible, and because the
  decline reasons ship in `references/native-adapter-config.md`, a contradiction
  there is published documentation disagreeing with what runs. Two were left
  untracked by choice: `REAL_STOCK` in the test file is a version-stamped
  literal that will need re-blessing when a stock group next changes, and the
  incomplete-preset message ships unasserted (deliberately — reaching it would
  need a test-only injection parameter).

## Working note

The #54 cycle cost **zero** string-mismatch fix rounds, against one each in
#52, #55 and #60. The difference was executing the plan's own implementation
code against the plan's own test literals *before committing the plan* — ten
verbatim assertions, one tool call. A plan that specifies both code and exact
expected strings is itself runnable, and nothing else catches that class of
defect: both halves read as correct in isolation and reviewers pass them.

The second habit worth keeping: **pair every negative control with a positive
one.** "Zero warnings" and "the check never runs" are indistinguishable. #54's
guard was proven by mutating a real Style Dictionary object to inject the
failure and confirming the exact expected warning fired once.
