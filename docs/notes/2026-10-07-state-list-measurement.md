# The shared state list, measured against two real systems

Date: 2026-10-07
Issue: #159

The state list is now one table (`references/state-baseline.md`, generated from
`scripts/lib/component-states.mjs`), and it widens both checks. `verify:check`
now requires `selected` on checkboxes, radios, toggles, switches and chips. The
Figma state and `focus-indicator` checks now cover `switch`, `textfield` and
`textinput`. Both are new ways to fail, so this run asks how many components
newly fail on a real system.

The short version: **zero new failures on either system, and that says little.**
Neither one documents a component the new rules touch.

## What was run

| repo | commit | how it was read |
|---|---|---|
| `throughline-ds` | `2a9d370` | `git clone --local` copy in a scratch directory |
| `zygarden-frontend` | `e91fe91fd` (`main`) | `git clone --local` copy in a scratch directory |

Neither original was touched. `feature/apply-brandguide-styles` does not exist
in the zygarden clone, local or remote, so this is `main`.

```
node scripts/build-docs-digest.mjs
node scripts/verify-check.mjs --root . --skip orphan-token --skip name-drift --skip color-contrast
```

BEFORE ran from a `git worktree` of the parent commit, AFTER from this branch.
Only `state-incomplete` is in play: the other three rules are skipped, since
the change doesn't touch them.

## Numbers

| system | components | doc records | `state-incomplete` before | after |
|---|---|---|---|---|
| throughline-ds | 8 | 0 | 0 | 0 |
| zygarden | 1 | 1 (`SurfaceCard`) | 0 | 0 |

- throughline-ds has no doc records, so `state-incomplete` had nothing to read.
  `verify:check` fails both before and after with `nothing-verified`, which is
  unrelated. Its built components are `Spinner`, `Badge`, `Avatar`, `Button`,
  `Input`, `Checkbox`, `Card` and `ButtonGroup`. `Checkbox` is the only one the
  new `selected` requirement would reach, and `checkbox.tsx` has `checked` as a
  prop and styles `data-[state=checked]`, so a record for it would have
  something to say.
- zygarden's one record is `SurfaceCard`, which resolves to no archetype
  (`archetype-unknown`, informational) before and after.
- zygarden is Angular. A file search for `chip`, `switch`, `toggle`, `radio`,
  `checkbox`, `textfield` and `textinput` found only `language-switcher`, which
  isn't a `switch`.

**The rule can see the change.** To check that zero isn't blindness, a `Chip`
record with `hover`, `focus`, `active` and `disabled` was added to the zygarden
clone. Before: no failure. After: `state-incomplete`, "Chip documents no selected
state". The record was removed afterwards.

## What this means

Nothing here shows a wrong failure, and nothing here shows a right one. The
`selected` requirement is sound for what it names. A checkbox, radio, toggle,
switch or chip that has no selected state isn't one, and the Figma standards
already required it. Whether `Switch`, `TextField` and `TextInput` owe the states
their archetype lists is the same judgment the CLI has made since 0.19.

## What wasn't measured

- **The Figma side.** The executor's state check and `focus-indicator` need a live
  Figma file through the bridge, and there isn't one here. No Switch, TextField
  or TextInput was built or read back.
- **Any system with doc records for choice controls or inputs.** Neither one has
  them, so the number that matters, how many existing records newly fail
  `selected`, is unmeasured. The first consumer who documents a Chip or Switch
  without `selected` is the first real data point.
- zygarden's `feature/apply-brandguide-styles`.
