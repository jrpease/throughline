# `unnamed-control` and `colour-only-status`, measured against throughline-ds

Date: 2026-09-30
Issue: #140
Spec: `docs/specs/2026-09-29-component-accessibility-checks.md` (Plan Steps 1 and 4)

Both rules fail a build, so the spec says they get measured before they ship.
#137 and #141 showed why: a failing rule's precision is only known after it runs
on code someone actually wrote.

The short version: **no wrong failures, and no real ones either.** Every element
the rules checked was accessible, and they said so. The run also found one gap
in what the rules can catch. This system's most likely icon-only bug is a
pattern the rules skip.

## Sources

| repo | commit | what was read |
|---|---|---|
| `throughline-ds` (`~/Dev/throughline-ds`) | `2a9d370` | `apps/site` through the gate, and `packages/ui/src` through a scratch script |

Read through a `git clone --local` copy in the scratch directory, never the
original. The repo has no doc records. `docs:digest` wrote an empty index, so
every element took the no-record path.

This is one codebase. It's the only JSX one on hand. zygarden is Angular, and the
rules don't read Angular templates.

## The reader (Step 1)

The new JSX reader has to pair every element with its closing tag, or it
abstains. That floor decides everything downstream, so it was measured on its
own first.

| run | files | elements read | unpaired |
|---|---|---|---|
| system components in `apps/site`, as the gate targets them | 66 | 7 (extractor: 7) | 0 |
| every capitalised component in `apps/site` | 49 | 157 | 0 |
| every capitalised component in `packages/ui/src` | 17 | 66 | 0 |

The second and third rows treat every capitalised JSX name as a target, which
reads far more nesting than the rules ever will. One nested case was checked by
hand: `expert-design-team-scene.tsx:311`, a `Card` holding an `Avatar`, a
`CardTitle` and a `Button` three levels down. The reader's tree matched the
source exactly.

The extractor and reader counts agree by construction, since both start from the
same match. The number that means something is unpaired, and it's zero.

## The rules (Step 4)

**Sample A, the site as a consumer runs the gate:**

```
node scripts/build-docs-digest.mjs --root $B
node scripts/validate-adherence.mjs --root $B/apps --system $B \
  --package @throughline-ds/ui --tokens $B/packages/tokens/dtcg/tokens.json
```

It exits 1 on 47 failures: 46 `token-exists-for-*` and one `variant-rule-inert`.
Neither rule is part of this measurement.

**Sample B, the ui package's own components and stories.** They import the
system by relative path, which the gate's `--package` never matches. So a scratch
script built each file's import map from relative imports whose last path segment
folds to a name in `components.built`, ran `readSubtrees`, and judged through
`validate`. `*.test.*` files were skipped. `grep -rhoE '<(Button|Badge)\b'
packages/ui/src` counts 20 `<Button>`s and 2 `<Badge>`s, and the script reached
all 22.

| sample | rule | checked | failed | real | wrong | abstained |
|---|---|---|---|---|---|---|
| A (site) | `unnamed-control` | 3 | 0 | — | 0 | 0 |
| A (site) | `colour-only-status` | 1 | 0 | — | 0 | 0 |
| B (ui package) | `unnamed-control` | 19 | 0 | — | 0 | 1 |
| B (ui package) | `colour-only-status` | 1 | 0 | — | 0 | 1 |

Every checked element was read by hand, and every one is named:

- 21 of the 22 Buttons checked across both samples carry visible text: `Save`, `Cancel`, `One`, `Message`,
  and so on.
- `button-group.stories.tsx:104` is `<Button trailingIcon={Icons.ChevronDown}
  aria-label="More save options" />`, named by its `aria-label`.
- The site's `<Badge>` and the ui package's `<Badge key={v} variant={v}>` both
  hold text.

Both abstentions are a `{...args}` spread: `button.stories.tsx:52` and
`badge.stories.tsx:20`. The spread may carry the label, so abstaining is right.

**What this shows:** across 24 checked elements, no wrong failures.

**What it can't show:** whether the rules catch a real bug. The corpus has none.
Catching one rests on the unit tests alone.

## The gap: icon props skip the rule

This system builds an icon-only button as a self-closing `Button` with an icon
prop: `leadingIcon` or `trailingIcon`. The one at `button-group.stories.tsx:104`
is named. The same element without its `aria-label` would be exactly the bug
`unnamed-control` exists for. The rule doesn't fail it. It skips:

```
<Button trailingIcon={Icons.ChevronDown} />                     checked 0, abstained 1
<Button trailingIcon={Icons.ChevronDown} aria-label="More" />   checked 1, abstained 0
```

That's the spec working as written. A self-closing element abstains on any prop
outside the record's variant and state keys and the fixed never-a-label list,
and `trailingIcon` is on neither. An icon prop takes a component, not text, so it
can't be the label. But the rule has no way to know that about a prop name it
has never seen.

So on this system, `unnamed-control` catches `<Button><TrashIcon /></Button>`,
but not the `trailingIcon` form, which is the one its own code uses. That's a
miss, not a wrong failure, and the rule is still safe to ship. It's also the
first thing to decide next. See the spec's Open questions.
