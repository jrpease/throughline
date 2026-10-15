# Component drift, run against the sample

Date: 2026-10-15
Spec: `docs/specs/2026-10-15-component-drift.md`, Step 5
Repo: a scratch copy of `~/Dev/throughline-sample`'s design-system files (no app
needed: the components half reads only the manifest and the doc records). Figma:
the sample file (`OCiZiGpsJ4ncPD8r205BjC`), read-only. The real repo wasn't written.

The short version: **every row matched the expected table, the planted changes
behaved as designed, and a fresh agent running only `commands/drift.md` reported all
of it.** It also showed that two of the eight Figma findings were renames reported
as two unrelated axes, so the comparer now says "renamed?" for those.

## The Figma half

The components snippet, pasted as generated with `SPEC = { names }` (all 14
documented components) and no `componentsPage`, found the `Components` page itself
and returned every set. `compare-components` exited 1:

| Component | Expected (derived before the build) | Reported |
|---|---|---|
| Button | state: Figma-only `Active` | same |
| Input | state: Figma-only `Hover`, `Active` | same |
| Switch | state: Figma-only `Hover`, `Active` | same |
| Select | variant axis `error` record-only; state: Figma-only `Hover`, `Active` | same |
| Textarea | `error` record-only; `size` Figma-only; state: Figma-only `Hover`, `Active` | same |
| Radio | `selected` record-only; `checked` Figma-only | same on the first run; now "renamed? the record's selected is Figma's checked" |
| Tooltip | `side` record-only; `Placement` Figma-only | same on the first run; now "renamed? the record's side is Figma's Placement" |
| Select Menu Item | `selected`, `disabled` record-only | same |
| Avatar, Badge, Card, Checkbox, Select Menu, Spinner | nothing | nothing |

Select Menu Item isn't a rename: its record has two boolean axes where Figma has
one `State` axis, so no single Figma axis has the same options.

## The code half

| Change | Expected | Reported by `check` |
|---|---|---|
| None, before any stamp | "No code stamp yet" | same, exit 0 |
| `stamp-code` Button and Input | both clean, the other 12 code not stamped | "Code matches the doc records it was built from (2 stamped)", 12 not stamped |
| Input's record gains size `xl` | Input behind | `behind Input`, exit 0 |
| A Button size meaning reworded, its `tokensUsed` reversed | Button clean | clean |

## The fresh agent

A fresh agent ran `/throughline:drift` on the scratch copy from the command file
alone (pinning the file, unpinning after, changing nothing, saying no to every
offer). It ran `check`, `check --json` for the names, the variables snippet
(`compare-figma`: no Figma stamp in the sample, exit 0), skipped the screens
snippet (no `screens.json`), and ran the components snippet and
`compare-components` (exit 1). Its report named all eight Figma differences, with
Input's planted `xl` correctly on both sides (missing from Figma, and the code
behind), and the 12 unstamped components.

What it flagged, and what changed:

- **Radio and Tooltip read as renames,** and the fix text would have had someone
  add both names to the record. The comparer now pairs a whole record axis with a
  whole Figma axis of the same options as `renamed`, and the command says to
  rename one, never add both.
- **The command never said "behind" exits 0.** It does now.
- **"No stamp yet" lines had no reporting rule.** The command now says to report
  each in one line with the command that writes the stamp.

## Not covered

- **The builder stamping for real.** `stamp-code` was run by hand, not by a
  `storybook-chromatic-builder` run, as the composers' `record` lines were in the
  drift live run.
- **A per-component rebuild.** The fix text points at `component-pipeline` Stage 3,
  which invokes the builder "for this one component". Not exercised.
- **The other two test files.** Only the sample was connected. A components page
  named `    ↳ Components` is covered by a generator test, not a live read.
