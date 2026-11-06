# Doc projection scripts: the Figma description and the MDX

Status: built
Date: 2026-11-06
Issue: #188

## Goal

A component's doc record feeds three surfaces: the doc card, the Figma component
description and the Storybook MDX file. Only the doc card is assembled by a script
(`doc-card-payload.mjs`); the other two are written by hand from prose on every run.
That broke Select Menu Item's MDX once (it has no stories file) and needed a pasted
pure-JS SHA-256 to stamp a description. After this ships, both are rendered by a
script from the record, byte for byte the same on every run, and the skills call
the scripts instead of describing the output.

## Non-goals

- JSDoc and the AI digest (`docs:digest` already renders the digest).
- Changing what the doc card renders.
- Checking the Figma description in CI. `docs:check` keeps reporting it as
  `edit-unverified`; the live check stays with the Figma-connected skill.
- Re-rendering the sample's live Figma descriptions. That's a reconcile run with
  Figma open, not part of this change.

## Decisions

All taken on Claude's recommendation on 2026-11-06: the owner said to work the
backlog taking every recommendation, and to share the summary before building.

| # | Decision | Chose | Why | Rules out |
|---|---|---|---|---|
| D1 | The description format (#188 asked to pick one) | The template `skills/component-builder/SKILL.md` already prescribes: summary, then `**When to use**` / `**When not to use**` / `**Do**` / `**Don't**` / `**Accessibility**` labels on their own line, bullets verbatim, empty blocks omitted, the `<!-- tl:doc <fp> -->` marker last. | It's the shipped contract. The two forms #188 saw on the sample ("When to use —", "**When to use:**") aren't in any file; the colon form is the AI digest's, not a description. Live descriptions in another form are drift to reconcile by re-rendering. | A new format; accepting several |
| D1a | The record's `description` paragraph | In the Figma description, after the summary. The template in the skill omitted it; it's added there. | `component-doc-schema.md`'s projection table marks `description` for the Figma description, and every live description on the sample carries it (read 2026-11-06). The template was the outlier. | A summary-only description |
| D2 | Where the description hash is computed | In Node, by the script: `render` = `fingerprint(text)` (sha256, first 16 hex, `lib/doc-record.mjs`). The Figma payload sets the description and returns whether the stored text equals what it was given, so no hash runs in the sandbox. | The sandbox has no SHA-256 (`lib/doc-card-plan.mjs:147`). Plain string equality proves the text arrived intact without one. | A pure-JS SHA-256 in the payload |
| D3 | How the payload finds the component | The one `COMPONENT_SET` or standalone `COMPONENT` named exactly the record's `name`, across all pages. None or more than one stops the run and says which. | Same exactly-one rule as the doc card's roles (#191) and compose's sets (#202). | First match |
| D4 | The MDX format | What the sample's 15 MDX files are: a JSX comment on line 1 carrying `docFingerprint: <fp>`, then the `Meta` import, then the sections as in `Button.mdx`. The prose saying "frontmatter" (the storybook skill, `component-doc-schema.md`) is corrected to match. | Those files build in Storybook today, and a renderer that reproduces them byte for byte is checkable. MDX frontmatter isn't what the sample's Storybook reads. | Frontmatter |
| D5 | A component with no stories file | `<Meta title="Components/<record name>" />` and no stories import; otherwise `import * as Stories from "./<File>.stories"` and `<Meta of={Stories} />`. The script decides by looking for `<File>.stories.*` beside the output. | Select Menu Item's working file. | Asking the caller to say |
| D6 | Where the scripts run | From the plugin (`${CLAUDE_PLUGIN_ROOT}/scripts/…`), like `doc-card-payload.mjs`; not added to the install set. | They're called by the skills during a doc run, never by the consumer's CI. Keeps the install list unchanged. | A `docs:render` npm script |

## Open questions

- **A `docs:render` npm script for MDX.** Worth adding if a team wants to re-render
  without an agent. Recommendation: not until someone asks. Unresolved.

## What shipped

2026-11-06, closing #188.

- `scripts/doc-description.mjs` (+ test): renders the description, prints `src` /
  `render`, writes the payload that sets it and returns `matches`.
- `scripts/render-mdx.mjs` (+ test, fixtures from the sample in
  `scripts/lib/fixtures/render-mdx/`): renders the MDX and prints the
  `storybookMdx` stamps.
- `skills/component-builder`, `skills/storybook-chromatic-builder`,
  `commands/document-component.md`, `references/component-doc-schema.md`,
  `scripts/README.md` and the regenerated adapters call the scripts. The
  component-builder template gains the `description` paragraph (D1a).

Verified: `node --test` 1121/1121 and every CI gate. Against the sample: 13 of 14
MDX files come out byte for byte, and Card differs only by a stray second newline at
the end of the file on disk; the 13 printed `render` stamps equal the manifest's.
Every MDX re-rendered by the CLI in a scratch clone, then `build-storybook` built
15 docs entries, Select Menu Item's titled `Meta` included. The live Tooltip
description hashes in Node to its recorded stamp, which confirms the `render` rule.
The description payload ran live on the sample's Button, set the text with
`matches: true`, and restored the original in the same call.

## Where it diverged

- **The sample has 14 MDX files, not 15.**
- **D1a was added during the build.** The skill's template had no `description`
  paragraph, while the schema's projection table and every live description do.
- **The live descriptions are in neither the template's form nor one form.** Read
  2026-11-06: Button uses "When to use — …" lines, Tooltip and Badge use
  "**When to use:** …; …". Re-rendering them is a reconcile run in Figma that
  updates the sample's `figmaDescription` stamps, left for when the owner wants it.
- **Step 4's description check set and restored the text** instead of leaving the
  re-rendered description in the sample, for the reason above.

## Plan

### Step 1 — `scripts/doc-description.mjs`

Files: `scripts/doc-description.mjs`, `scripts/doc-description.test.mjs`
Change: `renderDescription(record)` builds the D1 text. The CLI
`node scripts/doc-description.mjs <record.doc.json> [--out payload.js]` prints
`{ componentName, src, render }` and writes the `figma_execute` body (D2, D3) that
sets `description` and returns `{ id, name, matches, length }`.
Verify: unit tests on the template rules (empty blocks, one-sided accessibility,
marker last); the payload parses as an `AsyncFunction`; a stub-figma run sets the
text and returns `matches: true`, and refuses zero or two matches.

### Step 2 — `scripts/render-mdx.mjs`

Files: `scripts/render-mdx.mjs`, `scripts/render-mdx.test.mjs`
Change: `renderMdx(record, { recordFile, storiesFile })` builds the D4/D5 text. The
CLI `node scripts/render-mdx.mjs <record.doc.json> --out <Name>.mdx` writes it and
prints `{ src, render, file }` for `components.meta[<Name>].doc.surfaces.storybookMdx`.
Verify: the renderer reproduces all 14 MDX files in `~/Dev/throughline-sample`
byte for byte, and each printed `render` equals the manifest's stamp. A small
committed fixture pair (one with stories, one without) keeps that in CI.

### Step 3 — Call the scripts from the skills

Files: `skills/component-builder/SKILL.md`, `skills/storybook-chromatic-builder/SKILL.md`,
`commands/document-component.md`, `references/component-doc-schema.md`,
`scripts/README.md`, regenerated `adapters/**`
Change: the description and MDX steps run the scripts and stamp from their output;
the template stays as the rule the script implements. Fix "frontmatter" to the
line-1 comment (D4).
Verify: `node ci/validate-skills.mjs`, `node ci/validate-install-sets.mjs`,
`node scripts/adapters/generate.mjs --check` exit 0.

### Step 4 — Prove it live

Change: in a scratch copy of the sample, re-render every MDX with the script and
run the Storybook build. Run the description payload read-only-equivalent on the
sample Figma file only if the owner confirms the write.
Verify: Storybook build exits 0 with the rendered files; `git diff` on the copy is
empty.
