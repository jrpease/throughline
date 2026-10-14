# Drift, run against the sample

Date: 2026-10-14
Spec: `docs/specs/2026-10-14-drift.md`, Step 6
Repo: a scratch copy of `~/Dev/throughline-sample` with `apps/web` (the recipe in
the `no-repo-has-a-consuming-app` memory). Figma: the sample file
(`OCiZiGpsJ4ncPD8r205BjC`). The real repo wasn't written.

The short version: **every planted change was found, and nothing that should have
stayed quiet was flagged. The run also found that the first Figma snippet design
couldn't work, so the variable stamp was rebuilt mid-run.**

## Setup

- Recorded the two code screens composed for #41 ("Book a demo", "Sign in") with
  `screens.mjs record` and their plan files, and the Figma "Reschedule" screen
  from #43 with its description read from the frame's plugin data. The Figma
  description was written to a file by hand, since the screen predates recording.
- Stamped the token output: `stamp --out` the DTCG folder and the four build
  folders, 10 files. Stamped the Figma variables: 7 collections.
- A clean `check` first: 3 screens clean, output matches, exit 0.

## What was changed, and what came back

| Change | Expected | `/throughline:drift` (fresh agent, command only) |
|---|---|---|
| Card's summary reworded | nothing | nothing |
| Input gains a size `xl` | stale | named under each screen: "contract changed since composition: Button, Input" |
| Button loses size `md` (`docs:digest` re-run) | broken | both code screens broken: `unknown-option at components[…].variants.size: md` |
| A line added to `build/css/_light.css` | edited | edited, with the note the next sync overwrites it |
| A line added to `packages/tokens/build.mjs` | nothing | nothing |
| `radius/xl` 24 → 28 in Figma | overdue | "Radius / Primitives (6 variables)" changed, exit 0 then (now 1) |
| Reschedule's stored description names `Date Picker` | broken (live) | stale from the check, broken from the live screens snippet: `missing-component at root.children[2].component: Date Picker` |

`radius/xl` was put back to 24 afterwards. The agent changed nothing in Figma or the project.

## What it found

- **The first variables snippet couldn't be handed on.** As specced, it returned
  every variable's values (147 on the sample, about 12 KB) for Node to compare,
  inside a 36 KB snippet that also carried the screen resolver. A fresh agent
  asked to stamp them stopped partway through retyping the snippet. Two changes:
  `figma-drift.md` now holds two snippets, a 5 KB variables one and the screens
  one; and the variables snippet returns one FNV-1a fingerprint per collection
  instead of values, so what an agent writes to a file stays a few lines on any
  system. The report names the collections that moved; the sync's own diff names
  the variables.
- **A Figma screen got two verdicts.** The check said stale, the live pass said
  broken. The command now says the live state wins and the contract change stays
  as a note.
- **`compare-figma` exited 0 on drift**, while `check` exits 1. It now exits 1 when
  a collection moved.
- **A broken variant gave no way forward.** The line now ends "(options now: sm,
  lg)", from the error `checkPlan` already returns.
- **"Untracked" wasn't defined in the command.** It now says where the line
  appears and what it means.

## Not covered

- **A real sync writing the stamp.** `/throughline:sync-figma-tokens` wasn't run
  end to end; its new steps (pre-check, `stamp`, `stamp-figma`) were run by hand
  in the same order.
- **A screen recorded by a composer.** The records were made with the composers'
  `record` lines, run by hand, not by a fresh `compose-code` or `compose-figma`
  run. The compose snippet's new reader file is covered by the fake-Figma tests
  and was exercised live through the screens snippet, which inlines the same file.
- **Released screens live.** Covered by tests, not planted here.
