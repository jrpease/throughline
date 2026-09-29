# `color-contrast` and `orphan-token`, measured against two real systems

Date: 2026-09-29
Issues: #141 (contrast), #137 (orphan-token)

Both rules shipped in Phase 4 (#136, #139) and can fail a build. Both were
fixture-tested and had never run against a system anyone uses. The adherence
gate's colour rule shipped the same way and turned out 70% wrong
(`2026-09-11-colour-rule-measurement.md`). This run checks whether these two
share that problem.

## Sources

| repo | commit | tokens | how they were read |
|---|---|---|---|
| `throughline-ds` (`~/Dev/throughline-ds`) | `2a9d370` | `packages/tokens/dtcg/tokens.json`, a raw Figma Console export | as committed, and through the repo's own `normalize.mjs` written out as `semantic.light.json` / `semantic.dark.json` |
| `zygarden-frontend` | `ca61ca9a6` | `libs/shared/util-tokens/src/tokens/*.json` | as committed |

Gate at throughline main `de31124`. Both repos were read through
`git clone --local` copies in a scratch directory, with `docs:digest` run first.
Neither original was touched.

**Why throughline-ds needed its files written out.** Its token build renames and
splits modes in memory (`packages/tokens/scripts/normalize.mjs`), and dark lives
in `$extensions`. The committed file has `color-semantic.text.primary` with
collection-relative aliases (`{ink}`). The current `token-sync-layer` Step 2
writes one clean-named file per mode, so writing out `normalize()`'s `root` and
`dark` gives the layout a re-sync would produce. The written files went into the
clone's `packages/tokens/dtcg/`, **not the scratch directory**. A first run with
them outside the package left the token package unexcluded, and its generated
CSS counted as binding evidence for every colour. That run's orphan count (29,
all of them wrong) is not used below.

```
B=brand; T=$B/packages/tokens/dtcg
node scripts/verify-check.mjs --root $B \
  --tokens $T/semantic.light.json --tokens $T/semantic.dark.json

Z=zyg; T=$Z/libs/shared/util-tokens/src/tokens
node scripts/verify-check.mjs --root $Z --tokens $T/color-primitives.json \
  --tokens $T/color-semantic.light.json --tokens $T/color-semantic.dark.json \
  --skip orphan-token                                    # contrast
node scripts/verify-check.mjs --root $Z --tokens $T/color-primitives.json \
  --tokens $T/color-semantic.light.json --tokens $T/spacing-primitives.json \
  --tokens $T/spacing-semantic.desktop.json --tokens $T/radius-primitives.json \
  --tokens $T/radius-semantic.json --tokens $T/typography-primitives.json \
  --tokens $T/typography-semantic.desktop.json --tokens $T/stroke-primitives.json \
  --tokens $T/stroke-semantic.json --tokens $T/text-primitives.json \
  --tokens $T/leading-primitives.json --skip color-contrast  # orphans
```

zygarden's orphan run pins light and desktop, one file per axis. Per the
zygarden memory, merging every mode file is not a build.

## `color-contrast` (#141)

| system | pairs compared | failed | real | wrong |
|---|---|---|---|---|
| throughline-ds, written out | 16 (8 × light, dark) | 4 | 4 | 0 |
| throughline-ds, as committed | 0 | `contrast-rule-inert` | — | — |
| zygarden | 0 (6 skipped as non-hex) | `contrast-rule-inert` | — | — |

**The pairs aren't noisy.** Every failure is a real one:

- `text.onEmphasis` on `bg.emphasis`, dark, **3.54:1** (`#FFFFFF` on `#5B7FFF`).
  The default `Button` and `Badge` put text on exactly this pair.
- `status.danger.text` on `status.danger.bg`, dark, **3.73:1**. The destructive
  `Badge` uses exactly this pair.
- `status.success.text` on `status.success.bg`, light, **3.59:1**, and
  `status.warning.text` on `status.warning.bg`, light, **3.63:1**. No code uses
  either pair yet, but they are text-on-background roles by construction, so
  these are real failures that haven't surfaced.

`text/disabled` stays excluded, and nothing else earned a place beside it.
**No change to `CONTRAST_PAIRS`.**

**Inert fired on both systems as they are committed, and neither is the upgrade
case #141 worried about.**

- throughline-ds's committed layout predates the current sync. `verify:check`
  is itself new in this release and is registered by the sync, and the sync
  writes the file-per-mode, clean-named layout the rule reads. A consumer can't
  have `verify:check` on the old layout without hand-registering it.
- zygarden isn't a throughline-synced system. It has its own emitter and its own
  role names: `bg.canvas` for `bg.default`, `text.onBrand` on `brand.primary`,
  `interactive.link`. Its three status pairs match by name but hold
  `color-mix()` values, which are skipped as non-hex. `--skip color-contrast` is
  the honest answer there, and the inert message already says so.

What this run could not measure is a *retrofit* synced by throughline.
`retrofit-planner` renames roles in place towards throughline's structure, so a
retrofit should land on matching names. No such system exists to check.

## `orphan-token` (#137)

| system | candidates | flagged | real | wrong |
|---|---|---|---|---|
| throughline-ds | 65 | 61 | 12 | **49 (80%)** |
| zygarden | 112 | 61 | 61 | 0 |

**One cause explains the whole split.** A token counts as bound when a scanned
file contains its path, lowercased with punctuation stripped. zygarden's emitter
writes the path as the variable name (`dtcgPathToCssVar` swaps `.` for `-`), so
`--typography-textStyle-h1-fontSize` normalizes to the path and the rule reads
it correctly. throughline-ds's build renames on the way out, and the code
consumes the renamed form:

| token | emitted | used in code as |
|---|---|---|
| `spacing.inset.lg` | `--space-inset-lg` | `p-inset-lg`, `gap-x-inset-lg` |
| `typography.size.h1` | `--type-size-h1` | `packages/ui/src/typography.css` |
| `color.bg.emphasis` | `--color-bg-emphasis` | `bg-bg-emphasis` |
| `radius.card` | `--radius-card` | `rounded-card` |

None of those usages contains the path. The 49 wrong flags: all 14 `spacing.*`,
all 16 `typography.*`, 14 colour roles and all 5 `radius.*`, every one used,
most of them many times over.

The 12 real ones: `bg.inverse`, the success and warning status sets (five
tokens), `border.offset.focus`, the three `border.width.*`, `opacity.muted` and
`opacity.overlay.scrim`. None of them appears anywhere in `apps/` or
`packages/ui/src/`.

zygarden's 61 were checked by searching the app for every one of the 21 token
groups by its short name and its kebab form. The only hits were `h1`–`h3` and
`control`, and all of them were `<h1>` tags and `form-control` classes. The app
references tokens through `var(--…)` 117 times, never to one of these.

**This isn't a throughline-ds quirk.** The `shadcn` adapter row in
`references/sync-adapters.md` names `--background`, not `--color-bg-default`, and
any Tailwind preset puts a utility name between the token and the code. The rule
reads the path, the code reads what the build emitted, and the two agree only when
the build doesn't rename.

The rule's LIMIT comment (`scripts/verify-check.mjs:82-87`) says every miss is a
false negative, never a false failure. On a renaming build, that is backwards.

## What this run does not establish

- A throughline retrofit's role names, for contrast inert.
- Any system synced by the *current* `shadcn` adapter end to end. throughline-ds
  was synced by an earlier one with a hand-written build.
- zygarden's orphans in dark and mobile. The pins were light and desktop.

## After #137: binding by the path without its first segment

A token is now also bound when a scanned file contains its path minus the first
segment, normalized the same way (`inset-lg`, `bg-emphasis`, `card`). Same
commands, same clones, gate on `fix/137-orphan-binding`:

| system | flagged before | flagged after | real kept | wrong |
|---|---|---|---|---|
| throughline-ds | 61 | 12 | 12 of 12 | 0 |
| zygarden | 61 | 56 | 56 of 61 | 0 |

**The five zygarden tokens it stopped flagging** are one-word tails that turn up
elsewhere: `stroke.divider` (`zy-divider`, 68 uses), `stroke.focusRing`
(`focus-ring`), `stroke.border`, `radius.control` (`form-control`) and
`spacing.grid.columns`. Those are misses, not wrong failures: the direction the
rule's LIMIT comment commits it to.

A variant that tried only tails of two or more segments kept all but one of
zygarden's and still failed throughline-ds's five `radius.*` tokens, which
Tailwind reaches as `rounded-card`. Decided in conversation on 2026-09-29: always
use the tail.

`color-contrast` is unchanged by this and still reports the same four failures.
