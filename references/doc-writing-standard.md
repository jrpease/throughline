# Doc-writing standard

The writing standard for all doc-record (`.doc.json`) content. Applied by the
authoring pipeline in `component-builder` and `/document-component`. Every
projection — Figma component description, doc card, Storybook MDX, AI digest —
inherits this text unchanged; none of them are written separately.

**Governing rule: describe the thing and how to use it, never how it was
made.**

## Register

Plain reference: neutral and declarative for descriptions, imperative for
guidance — the register Polaris and Carbon use.

This is **not** the conversational guide voice of `references/guide-voice.md`.
Guide voice is for skill conversation — a guide talking to the person building
the system. This standard is for doc-record content — what gets written about
the component itself, read by whoever uses it later. Different audience,
different register; do not blend them.

## Per-block rules

Before/after pairs are the real Button record
(`throughline-sample/design-system/docs/components/Button.doc.json`).

### `description`

2–3 sentences: what it is, what it's for, and the one thing that most changes
how you use it. Never variant/size counts (the specimen and legend already show
them), never token binding, never a slot inventory.

> **Before:** "A clickable control that triggers an action — submitting a
> form, confirming a decision, or opening a dialog. It comes in six emphasis
> variants across three sizes, supports optional leading and trailing icons
> and a loading state, and binds every color, spacing, radius, and type value
> to the system's semantic tokens."
>
> **After:** "A clickable control that starts an action: saving a form,
> confirming a choice, opening a dialog. Its six emphasis levels signal how
> important an action is."

### `whenToUse` / `whenNotToUse`

Situations, never an echo of `summary`. `whenNotToUse` always names the
alternative.

> **Before:** summary "Triggers an action or event." → whenToUse[0] "Trigger
> an action or event — submit, confirm, open a dialog"
>
> **After:** "Something happens on the current page — save, confirm, open a
> dialog"

### `variants` / `states`

Lead with meaning; visual treatment is optional and never the whole entry.

> **Before:** "Highest-emphasis, solid brand fill — the one primary action in
> a view." → **After:** "The one main action in a view."
>
> **Before:** "Non-interactive and not focusable; reduced opacity." →
> **After:** "Can't be clicked or tabbed to."

### `dos` / `donts`

Imperative, one action per entry, ≤ 14 words, full stop. Don'ts open with
*Don't / Never / Avoid* and name the alternative.

> **Before:** "Don't use a button for navigation — use a Link" →
> **After:** "Don't use a button to navigate. Use a Link."

### `accessibility.notes`

What the reader must do, not what the framework emits.

> **Cut:** "Renders a native `<button>`, so `role=\"button\"` is implicit."
>
> **Before:** "An icon-only button needs an aria-label" → **After:** "An
> icon-only button needs an `aria-label` so screen readers can announce it."

## Vocabulary

Real names of things stay — `aria-label`, `role`, `Enter`, `Space` are what a
reader would search for.

Banned from user-facing prose: the system's own machinery vocabulary —
*token(s)*, *variable(s)*, *binding(s)*, *fingerprint(s)*, *provenance*,
*projection(s)*, *surface(s)* (machinery sense).

`tokensUsed` keeps its token names — it is a structured field, machine-useful,
never rendered as prose.

## Global rules

- Full sentences. No em-dash label-fragments bolting a clause onto a fragment.
- One set of strings for humans and AI — no dual copy. The digest (`llms.txt`
  / `index.json`) inherits the same text.

## The lint — `scripts/docs-lint.mjs`

Checks the mechanically reliable subset of this standard. Zero-dependency,
**warnings only, always exits 0**.

| Rule | Checks | Threshold |
|---|---|---|
| `machinery-vocabulary` | banned-word list in user-facing prose (all prose fields; `tokensUsed`, `name`, `status`, `provenance` exempt) | — |
| `summary-echo` | `whenToUse[0]` reusing the summary's content words (stopwords removed, naive plural/verb-s stemming) | > 60% overlap |
| `run-on-sentence` | sentence length | > 35 words |
| `summary-length` | `summary` length | > 12 words |
| `description-length` | `description` length | outside 15–70 words |
| `guidance-length` | `dos` / `donts` entry length | > 14 words |
| `dont-shape` | a `donts` entry not opening with *Don't / Never / Avoid* | — |
| `terminal-stop` | a `dos` / `donts` entry not ending with a full stop | — |
| `treatment-lead` | a variant/state meaning opening with a visual-treatment word ({fill, filled, solid, stroke, border, bordered, outline, shadow, opacity, elevation}) | first 4 words |
| `empty-meaning` | a variant or state meaning that's too short to say anything | < 3 words |

**Output contract:** always exits 0; one warning per line as
`<file>: <block-path>: <rule>: <message>`; `--json` emits
`{"warnings": [{path, rule, message}]}`.

**Deliberately not linted: verb-presence.** Not reliably detectable in plain
JS without an NLP dependency, and a rule that fires wrongly is worse than no
rule. It stays a prose rule, caught by the authoring pipeline and the user
approval step.

## Sequencing

1. Draft the record.
2. Write the file to disk.
3. `node ${CLAUDE_PLUGIN_ROOT}/scripts/docs-lint.mjs <file>`
4. Fix warnings.
5. Show the user.

The lint shapes the draft before approval — it does not nag afterward.

`imported` / `user` provenance blocks are never silently rewritten. The lint
still warns on them; the user decides per item.
