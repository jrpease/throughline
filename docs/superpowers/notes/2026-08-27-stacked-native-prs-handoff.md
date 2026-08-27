# Two stacked native PRs — handoff

**Date:** 2026-08-27
**Supersedes:** `2026-08-24-native-backlog-handoff.md`

## Read this first — there is an ordering constraint with a known cost

Two PRs are open and **stacked**:

| PR | issue | branch | base |
|---|---|---|---|
| [#69](https://github.com/jrpease/throughline/pull/69) | #52 unitless ratios | `fix/52-unitless-dimension` | `main` |
| [#74](https://github.com/jrpease/throughline/pull/74) | #54 stock transform accounting | `feat/54-stock-transform-accounting` | **`fix/52-unitless-dimension`** |

**#74 must be retargeted to `main` BEFORE #69 merges:**

```
gh pr edit 74 --base main
gh pr merge 69            # WITHOUT --delete-branch
git push origin --delete fix/52-unitless-dimension   # by hand, after
```

Merging the parent with `--delete-branch` auto-closes the stacked child, and
once the child's head has been rebased it **cannot be reopened** — GitHub
refuses even after the base branch is restored. That cost PR #65 on 2026-08-24
and its content had to be reopened as #66.

Both are stacked rather than parallel because `scripts/lib/sd-native.mjs`
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

**Nothing has been released since 0.15.0.** Eight items now sit unreleased:
#34, #50, #53, #55, #51, #60, #52, #54. A version cut was deferred once already
on 2026-08-26.

## Open questions for the next session

- **#73 — was #55's and #60's e2e evidence vacuous?** Filed 2026-08-26. The
  #52 cycle found that the documented symlink swap targets `scripts/lib`, while
  `build.mjs` imports a *different* top-level `lib/` of per-file symlinks —
  so following the note literally builds "main" from HEAD's code and produces a
  false byte-identical pass. Whether the earlier runs hit that is unverified.
  Worth answering before leaning on that harness again.
- **Which backlog slot is next.** #36 (validator silently drops a token to a key
  collision) is the last of the "instruments" items. The consumption-layer epic
  (#39–#44) has been parked pending a clean native base, which it now has. The
  native tail — #62, #63, #64, #67, #70, #71, #72 — is individually small, and
  #71/#72 are the same underlying gap in the advisory's type resolution and
  should be done as one item.
- **#54's own recorded limits** are in the spec's §12 rather than solved: a
  transform that is both run *and* declined is invisible; `REAL_STOCK` in the
  test file is a version-stamped literal needing re-blessing when a stock group
  next changes; the incomplete-preset message ships unasserted.

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
