# Fixing what drift found, on the real sample

Date: 2026-10-15
Follows: `docs/notes/2026-10-15-component-drift-live-run.md`, which reported eight
Figma-vs-record differences on the sample and stopped there.
Repo: `~/Dev/throughline-sample` itself, not a scratch copy (sample PR #23).
Figma: the sample file (`OCiZiGpsJ4ncPD8r205BjC`), pinned for the writes.

The short version: **all eight are fixed and drift's component check now says the
14 components match. Five of the eight were records missing states the plugin's own
baseline requires, so drift was right to flag them and the fix was always going to
be in the record. The projections the fix needs are half scripted: the doc card has
a payload script with a hash to check against, and the Figma description and MDX
have nothing.**

## How each one was settled

The code was the tiebreaker, and `BASELINE_STATES` in
`scripts/lib/component-states.mjs` settled the states before the code was read.

| Component | Difference | Fix | Side changed |
|---|---|---|---|
| Button | Figma-only `Active` | baseline `button` includes `active` | record |
| Input, Switch | Figma-only `Hover`, `Active` | baseline | record |
| Select | `error` axis record-only; `Hover`, `Active` | the record had `error` as an axis and a state; Input and Figma use the state only | record |
| Textarea | as Select, plus `size` Figma-only | `size` was added in Figma on purpose (sample HANDOFF) | record |
| Radio | `selected` vs `checked` | user's call: `checked`, like Checkbox and Switch | record |
| Tooltip | `side` vs `Placement` | the code prop is `side` | Figma |
| Select Menu Item | two booleans vs one `State` axis | user's call: match the code | Figma |

Three were the user's call (Textarea, Radio, Select Menu Item); the rest followed
from the baseline and the code.

**The code is behind the records now, and drift can't say so.** The code Button
has no `:active`, and Input, Select, Textarea and Switch have no hover or active
styling at all. The sample has never run `stamp-code`, so `drift:check` has no
shape to compare against and reports "no code stamp" rather than "behind". A record
that moves before the first stamp moves silently. This is the behaviour 0.30.0
documents, and it's the case it leaves open.

## The Figma half

- **Tooltip:** `editComponentProperty('Placement', { name: 'side' })`. Options
  stay `Top`/`Bottom`/`Left`/`Right`; the comparer folds case.
- **Select Menu Item** (`23:752`), rebuilt in place, not replaced: the five
  existing variants were renamed into the new matrix and seven clones filled the
  rest. A replacement would have orphaned its 12 instances (9 + 3), most inside
  the `Select Menu` set. Read back: 12 variants, `selected` × `disabled` ×
  `State` (Default / Hover / Focused), and the 9 + 3 instances still on the same
  two variants.
- The set is the full cross product, because `figma-checks` fails a sparse matrix
  (`button-sparse` fixture). The code can't hover or focus a disabled row, so
  those four variants look the same as disabled Default.

## The projections

All seven changed records were re-projected and stamped. `docs:check` is clean.

- **Doc cards:** `doc-card-payload.mjs` per card. The renderer was pasted once
  (14 KB, comments stripped) and installed on `globalThis`, then each card was a
  small call carrying its record. All seven `renderHash` values matched the
  payload's `expectedRenderHash`, which also proves the hand-carried record
  arrived intact. **Two cards in one call timed out** at 30 s. Both finished in
  the background; re-rendering each alone returned the hashes. The builder says
  one card per call, and it means it.
- **Figma descriptions:** only the `<!-- tl:doc -->` marker depends on the
  fingerprint, plus three sentences that listed states. The stamp is
  `sha256(description).slice(0, 16)`, and the plugin sandbox has no SHA-256.
  `component-doc-schema.md` says the Figma-connected skill computes "the identical
  hash"; nothing ships that does. A pure-JS SHA-256 in `figma_execute` did,
  checked against Tooltip's unchanged stamp (`4e4811f8dff170f9`) first.
- **MDX:** no script renders it; the builder skill describes it in prose. A
  scratch renderer reproduced six of the seven untouched files byte for byte (Card
  has one stray trailing line). It still broke Select Menu Item, which has no
  stories file of its own and uses `<Meta title=…>`: the Storybook build caught
  it. `docs:check` didn't, because it hashes the file the renderer wrote.

## Not covered

- **Code catching up.** The states and Textarea's `size` are in the records, not
  the components. That's a `storybook-chromatic-builder` run, then `stamp-code`.
- **`/throughline:document-component` as written.** This run did its steps by
  hand at seven-component scale, not one component through the command with a
  fresh agent.
- **Two pre-existing oddities left alone:** the Select Menu Item check renders
  white in Figma where the code and record say brand, and that card's chip reads
  `Stable` while the manifest says `final`.
