# Accessibility checks for components, not just tokens

Status: planned
Reviewed: 2026-09-30 — needs revision (one Plan blocker, rest minor; revised since)
Date: 2026-09-29
Issue: #140
Builds on: `docs/specs/2026-09-12-verification-proof-bundle.md` (#110) for the
attested check, and the adherence gate (`scripts/validate-adherence.mjs`, #39)
for the usage rules. Sequenced with #138.

## Goal

The README promises accessibility checks when components are created. Today
nothing checks a component. A Button can ship with no focus ring, a Badge can
carry status in colour alone, and an icon-only Button can have no name, and every
gate stays green. The rules exist, but only as prose seeds in doc records
(`references/component-doc-archetypes.md:26`, `:83`) and in the post-build
audit's description of a focus ring (`references/figma-component-standards.md:146-194`).

After this ships, three things fail instead of passing silently:

- **A button, input or choice built in Figma without its framework's focus
  indicator on every focus variant**, for the frameworks with a fixed recipe
  (see Decisions). The build stops, whether the executor runs it or the skill
  builds inline, and component-builder records the result. iOS and custom
  frameworks are skipped, and so is multi-framework when the manifest records
  it by name. A multi-framework project that leaves `uiFramework` unset is
  checked against the shadcn ring, which is its correct recipe.
- **An icon-only button in app code with no accessible name.**
- **A status badge in app code with no text.**

## Non-goals

- **Storybook's a11y addon (axe), or any test runner.** Not in v1.
- **Focus-ring contrast.** WCAG 1.4.11's 3:1 for non-text needs the `border/*`
  table `scripts/lib/contrast.mjs:18-19` says is a separate job.
- **Native elements.** `<img>` without `alt` and `<svg>` without a title are
  eslint-plugin-jsx-a11y's job. The design system doesn't own them.
- **Vue, Svelte and Angular templates.** The usage rules read JSX. The new
  reader and both usage rules run only on script files (`.js`, `.jsx`, `.ts`,
  `.tsx`, `.mjs`, `.cjs`), never on `.vue`, `.svelte` or `.html`, and that is an
  explicit file-type check. The existing component rules skip other templates by
  convention, not by a gate: the walk includes `.vue` and `.svelte`
  (`validate-adherence.mjs:850`).
- **Any new CLI check for focus.** The CLI can't see a focus ring. No component
  source path is recorded, and the doc record's `accessibility` block is free text.
- **Checking a component's contract.** For names and status, v1 checks how a
  component is used, not whether its definition makes accessible use possible.
- **Proving components built before this ships.** They are checked when next
  touched or rebuilt, never swept.
- **Recording the usage rules in the proof bundle.** They are adherence-gate
  failures only.

## Decisions

Settled in conversation on 2026-09-29 and 30. Twelve questions were answered in the
grilling session. The spec review raised eight more, answered the same day, and
the re-review three more, answered on 2026-09-30. The Plan review raised three
more and its re-review two more, all answered on 2026-09-30. Several rows below split or refine one of those
answers. In every case the recommendation was the choice.

Three lists were written as recommendations and accepted whole, rather than
answered item by item: the label-like prop list (in "When an element has an
accessible name"), the fixed exempt list (in "Self-closing elements"), and
`vanilla` as a second spelling of `vanilla-css` (in "Which indicator counts").
The measurement is the first place to question them.

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| What v1 covers | All three: focus indicator, text alternatives, status beyond colour | All three are stated as rules in the repo already and asserted nowhere | Deferring any of the three |
| Where text alternatives and status-by-colour are checked | In **consuming code**, as new adherence-gate rules | Both depend on how a component is used. `<Button><TrashIcon /></Button>` and a Badge with no text are the real bugs, and the adherence gate is where consuming code is read. It reads opening tags and their attributes today (`validate-adherence.mjs:22-28`). Seeing children needs the reader below | A check on the component contract alone, or both places in v1 |
| What a finding does | **Fails**, narrowed to exact matches, abstaining on anything unresolved, and **measured before it ships** | #141 and #137 showed a failing rule's precision is only known after a real run. The repo's discipline is to narrow, never downgrade (#123) | Shipping as an advisory first |
| What the usage rules are measured against | **throughline-ds**, the only JSX codebase on hand, in two labelled samples. The first is its site through the gate as a consumer runs it. The second is its ui package's own components and stories through a one-off script that treats their relative imports as the system package. The gate isn't changed to see them. The note says plainly that this is one codebase | zygarden is Angular, so the usage rules abstain there. The site alone renders three `<Button>`s and one `<Badge>`, all with visible text, so it would pass without exercising either rule | Waiting for a second JSX app before shipping; measuring the site alone; widening the gate's import match to reach the ui package |
| Storybook's a11y addon | Not in v1 | It runs per rendered story, needs a test runner in CI, overlaps contrast, and would be a new dependency in every consumer's Storybook | Installing it with `test: 'error'` now |
| What the Figma focus check asserts | For components resolving to `button`, `input` or `choice` (by name, as the executor's state check does, since no doc record exists until Step 4.5 so `IconButton` abstains): **every focus variant carries the focus indicator its framework's recipe prescribes**, bound to `border/focus`. The executor reads it back programmatically, and a missing indicator is `BLOCKED`, as a missing state already is. component-builder records it as a new attested check, `focus-indicator`, which gets a row in the check table (`references/proof-bundle.md:204-216`). Nothing validates check names, so a missing row would drift silently | The standards already name the failure this catches: a transparent variant (ghost, link) with no ring. "Every focus variant" is what catches it | "An indicator exists somewhere"; ring contrast in v1 |
| Which indicator counts, per framework | Keyed off `project.uiFramework`, the same recipes the build follows (`figma-component-standards.md:151-166`). Checked for **exactly these values**: `shadcn`, `tailwind` and an absent or `null` value (the manifest default, `manifest-schema.md:23`) get a ring on every focus variant, plus the border recoloured to `border/focus` on a variant that has a stroke. A ghost or link variant has no border to recolour, so only its ring is asserted. `mui` gets an input's border thickened and recoloured, and a ring on buttons and other clickables. `vanilla-css` and `vanilla` (the manifest schema's example spelling, `manifest-schema.md:121-122`) get an `OUTSIDE` offset outline stroke. **Every other value is skipped**, including `ios-swift`, multi-framework and any tier-2 framework. component-builder reads `uiFramework` for the inline build (`skills/component-builder/SKILL.md:132-141`), but **it does not reach the executor today**: neither the architect's spec (`agents/architect.md:18`) nor `agents/figma-executor.md` mentions it. **The executor reads `project.uiFramework` from `design-system.json` itself**, the file it already reads for `figma.fileKey` (`agents/figma-executor.md:16`) | One shape blocks a correct MUI Input and every iOS control. Asserting the border on every variant would block a correct ghost button. The standards give tier-2 a researched idiom with the shadcn ring as a fallback (`:164-166`), and the check can't tell a researched idiom from the fallback, so a failure there could be wrong. The manifest has no fixed value set, so the list is explicit. Multi-framework gets the shadcn ring in the standards (`:151`), but the manifest has no value spelled for it, so it can't be listed and is skipped. Reading the manifest directly leaves one source of truth | A single ring shape for every framework; checking shadcn and the default only; asserting the border recolour on a variant with no stroke; carrying `uiFramework` through the architect's spec, which would be a second copy of one value and a hand-off the architect could forget |
| What counts as a focus variant | A variant whose `state` axis value is exactly `focus` after `normalizeName`. `Focused`, `focus-visible` and `hover+focus` abstain, and so does focus modelled as a boolean property | The same exact-match precedent as the executor's state check (`agents/figma-executor.md:19`) and `missingStates` (`scripts/lib/component-states.mjs:49-56`) | Substring matching on `focus` |
| Components built before this ships | **Checked when next touched or rebuilt**, never swept. A rebuild runs the check. `verify:check` does not flag a built component whose proof lacks `focus-indicator` | Flagging every missing entry would turn every existing system red on upgrade. The standards already say to retrofit rings on touch (`figma-component-standards.md:188-194`) | A sweep, or a failing "missing focus-indicator" rule |
| The inline build path | A host with no subagent dispatch runs **the same read-back inline**, as part of component-builder's post-build audit, stops on a missing indicator, and records `focus-indicator` the same way | Otherwise "the build stops" is true only where an executor exists, which is the gap #135 closed for the file check | Leaving the inline path to audit item 9's prose alone |
| What the CLI re-derives for focus | **Nothing new.** Focus stays attested, backed by what `state-incomplete` already derives (the record declares a focus state) | No component source path is recorded, and guessing one is a precision risk for a failing rule | Finding the source by convention and grepping for `focus-visible`; a schema change to record the path first |
| Which app-code elements get the name rule | Imported system components whose **name** folds to `button` or `iconbutton`, or whose record says `archetype: "button"`. This is a short list of its own, separate from the state table. **JSX only** | The state table maps `IconButton` to nothing on purpose, since its state baseline differs from a Button's. But it is exactly the component the name rule exists for | Reusing `resolveArchetype` unchanged, which would skip `IconButton` |
| Which app-code elements get the status rule | Imported system components that `resolveArchetype` resolves to `badge` (the name folds to `badge` or `tag`, or the record says `archetype: "badge"`). **JSX only**. A badge whose only content is a named icon passes, under the same naming rule as buttons | The existing table already covers status components exactly. The Badge seed says to "include text or an icon" (`component-doc-archetypes.md:81`), and a named icon satisfies that. Because both rules share one naming rule, a badge's own `aria-label` or `title` also passes (`<Badge aria-label="Error" />`), even though neither is visible. That's a miss, not a wrong failure, and it's accepted | A manifest list; an icon-only badge failing against its own archetype's guidance |
| How the gate learns a record's archetype | **`archetype` is added to the docs index** (`design-system/docs/index.json`, built by `scripts/build-docs-digest.mjs:15-32`), which the gate already reads | Nothing hashes the index, so the change is cheap. Today the gate can only resolve by name | The gate reading `.doc.json` records directly |
| The JSX reader | **A new element-subtree reader is the first build step**, measured against the existing component rules before the new rules use it. It pairs open and close tags across nesting, reads past `=>` inside attribute expressions, records whether a tag is self-closing, and records a `{...props}` spread. An element it can't pair cleanly **abstains**. It runs **alongside** today's `ELEMENT` extractor, not in place of it: the existing component rules keep their regex, and the reader is measured by comparing its element counts with the extractor's on the same app. Only the two new rules read it | Today's extractor is one opening-tag regex (`validate-adherence.mjs:25`). It sees no children, no closing tags and no spreads, and `onClick={() => x}` ends a tag early. Its floor decides the precision the new rules can have, so it gets measured on its own | Judging only single-line elements with no reader; a separate spec ahead of this one; moving the existing component rules onto the reader, which would change what they read |
| Whether the usage rules fail as inert when they find nothing | **No inert failure.** The report prints, per rule, how many elements it **checked and how many it abstained on**, so zero checked is visible | An app that uses no Badge isn't misconfigured. Counting checks alone would hide a rule that abstained on everything | An inert failure with `--skip` as the escape |
| When an element has an accessible name | It carries a non-empty `aria-label`, `aria-labelledby` or `title` (literal, or any expression), **or anything between its tags does**, **or there is any non-whitespace text or `{expression}` between its tags**. It fails when everything between its tags is elements and whitespace and none of them carries a name. An expression counts as text. **Any element carrying `{...props}` abstains**, with or without children, since the spread may be the label. **A descendant makes the element abstain** if it carries `{...props}` or a label-like prop: `label`, `alt`, `text`, `i18nKey`, `defaultMessage`, `message`, `id`, or any prop name ending in `Label` or `Text`. Otherwise descendants are judged only by `aria-label`, `aria-labelledby`, `title` and text, so `size`, `strokeWidth` and `color` on an icon don't cause a skip. Other unknown props cause a skip only on self-closing elements (see below), because an element with children has its children to judge by. `aria-label=""` and whitespace-only children count as unnamed | `<Button asChild><a>Go</a></Button>` and `<Button><TrashIcon aria-label="Delete" /></Button>` are both accessible and must pass: an accessible name is computed from descendants too, and icon libraries put the label on the icon. `<Button {...props}><TrashIcon /></Button>` is the common wrapper-component pattern, and its name may arrive in the spread. Skipping on every unknown prop of a descendant would skip almost every icon button, since icons carry `size` and `color`. The label-like list keeps the realistic cases from failing wrongly without gutting the rule, and the measurement shows whether it's right. The i18n props are there because `<Button><Trans i18nKey="delete" /></Button>` and `<Button><FormattedMessage id="delete" /></Button>` are named at runtime, and throughline-ds has no i18n, so the measurement can't catch them. Treating an expression as text makes the uncertain case a miss, never a wrong failure. JSX drops whitespace-only children, so they name nothing | Counting only direct text children; counting only the element's own attributes; failing an element whose props are spread |
| Self-closing elements | They **fail unless named**, by the same rule for both usage rules. They **abstain** if the element carries any prop other than: the record's `variants` keys and `states` keys, `className`, `style`, or a fixed list that can never be a label (`on*` handlers, `disabled`, `type`, `key`, `ref`, `id`, `data-*`, `aria-hidden`, `asChild`). Any other prop, and any `{...props}`, may be a label, so the element abstains. **With no doc record**, only `className`, `style` and the fixed list are exempt, so `<IconButton variant="ghost" />` abstains. `<Badge tone="danger" />` fails when `tone` is one of the record's `variants` keys, and so does a self-closing element whose only extra prop is a `states` key | A bare `<Badge variant="danger" />` is exactly the colour-only dot the status rule exists for. Without the fixed list, almost every self-closing element abstains and the rule never runs. With no record there is no way to tell a variant from a label prop, so abstaining is the safe direction | Always abstaining on self-closing elements; guessing variant names for components with no record |
| Rule names | `unnamed-control` and `colour-only-status` | Say what's wrong, like the gate's other rules. British "colour" matches the adherence gate's own spelling (`colour-rule-inert`) | WCAG-worded names |
| Whether the usage rules can be switched off | **Both are in the adherence gate's `SKIPPABLE`** (`validate-adherence.mjs:796`), under `--skip` like every other failing rule | A team that hits a wrong failure gets the same escape as for every other rule | Rules that can only be escaped by removing the gate |
| The proof bundle | The usage rules are **adherence-gate failures only**, never also recorded as bundle entries. #140's issue text, which says both halves become bundle entries, gets corrected | The adherence gate isn't part of the bundle, and a second record of the same finding is one more thing to drift | Recording the adherence result in the bundle |
| Sequencing the Figma half | The focus check is proven in **the same live Figma session as #138**: one real build through `figma-executor` exercises the attested path and `focus-indicator` together. The usage rules ship when measured and don't wait on Figma | #138 already names the attested path's live proof as the gap. Merging a second attested check without it widens that gap | Merging the focus check on fixture evidence alone |

## Open questions

- **Focus-ring contrast.** It's out of v1. Recommend filing it as its own issue,
  together with the `border/*` non-text table `contrast.mjs` already names.
  Unresolved.
- **Whether the vanilla check asserts the `offset/focus` gap.** The recipe puts
  the ring `offset/focus` clear of the edge (`figma-component-standards.md:158-162`).
  The gap lives in the ring child's geometry, not in a binding. Recommend leaving
  it unasserted in v1. The Plan asserts only `strokeAlign` and the `border/focus`
  binding, and an answer of yes adds one assertion to Step 6 without changing any
  other step. Unresolved.

## Plan

Two PRs. Steps 1–5 are the usage rules and ship once Step 4's measurement is in.
Steps 6–7 are the focus check. They can merge as prose, but the check isn't
claimed until Step 7 runs in the #138 session. Step 8 closes both.

Every step ends with the full CI set, as `.github/workflows/ci.yml:17-29` runs it:

```
node --test && node ci/validate-plugin.mjs && node ci/validate-skills.mjs && \
node ci/validate-install-sets.mjs && node scripts/adapters/generate.mjs --check && \
node scripts/build-doc-card-builder.mjs --check && \
node scripts/build-native-adapter-config.mjs --check
```

Each step's Verify adds the narrower check that proves the step itself.

### Step 1 — The JSX subtree reader, measured alone

Files: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`
Change: Add an exported `readSubtrees(code, imported)` in
`validate-adherence.mjs` itself, not a new `lib/` file. Every lib file is a line in
the consumer copy list (`scripts/README.md:41-54`), and `lib/component-states.mjs`
is already on it. For every opening tag of a name in `imported` (the same match
`ELEMENT` makes at `:25`, skipping `.Member` names as `:240` does), scan forward
from `<`:

- **Attributes.** Each is `{ name, kind, value }`:
  - `kind: 'literal'`, with `value` the string, for `name="…"` or `name='…'`.
    A quoted string ends at its matching quote.
  - `kind: 'expr'`, with `value: null`, for `name={…}`. The `{` opens a
    brace-depth count that ignores braces inside `'`, `"` and `` ` `` strings,
    so `onClick={() => x}` doesn't end the tag.
  - `kind: 'bare'`, with `value: null`, for a name with no `=` (`asChild`,
    `aria-hidden`).
  - `{...expr}` in attribute position isn't an attribute. It sets `spread: true`.
  - The tag ends at a `>` or `/>` at depth zero.
- **Children**, for a tag that isn't self-closing. Read until the matching
  `</Name>`. Nested tags of any name, `<>`/`</>` fragments included, are tracked
  on a stack and become child elements. `{…}` at depth zero is an expression
  child, and one that is empty or whitespace-only once `blankComments` has run
  (a JSX comment `{/* */}`) is dropped. Other text is a text child.
- **Returns** `{ component, line, selfClosing, paired, attrs, spread, children }`.
  Children are `{ type: 'text'|'expr', value }` or `{ type: 'element', name,
  attrs, spread, selfClosing, children }`.
- **Abstaining.** Reaching end of file, or a closing tag that doesn't match the
  top of the stack, gives `paired: false` and `children: []`. Nothing is guessed.
- **Nesting.** Every matched target gets its own entry, even when it sits inside
  another target. `<Card><Button>Go</Button></Card>` gives two entries: the Card,
  with the Button among its children, and the Button on its own. The rules judge
  each target once, from its own entry.

`extract` calls it only when `path` matches `/\.(jsx?|tsx?|mjs|cjs)$/`, and
returns the result as `subtrees`, which is `[]` for any other path, the default
`''` included. `elements` and `usages` don't change. The `files.push` condition at
`:875` also admits a file with `subtrees.length`.

Tests call `extract(src, '@acme/ui', 'x.tsx')`. The existing tests pass no path
(`validate-adherence.test.mjs:41-72`), and copying that style would give no
subtrees and green tests that checked nothing. Cover:

- nested pairing, and a same-name element nested inside itself, giving two
  entries
- a Button inside a Card, giving two entries
- an arrow function in an attribute, and `>` inside a string attribute
- each attribute kind, including bare `asChild`
- self-closing, and a spread on the element and on a child
- a fragment child and a JSX comment child
- an unclosed element returning `paired: false`
- a `.vue` path and no path at all, each returning `subtrees: []`

Verify: `node --test scripts/validate-adherence.test.mjs` → all pass. Then, on a
`git clone --local` of throughline-ds at `2a9d370` in the scratchpad (`$B`):

```
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { walk } from "./scripts/lib/source-scan.mjs";
import { extract } from "./scripts/validate-adherence.mjs";
let extractor = 0, reader = 0, unpaired = 0;
for (const p of walk(process.argv[1], { fileFilter: /\.(jsx?|tsx?|mjs|cjs)$/ })) {
  const r = extract(readFileSync(p, "utf8"), "@throughline-ds/ui", p);
  extractor += r.elements.length; reader += r.subtrees.length;
  unpaired += r.subtrees.filter((s) => !s.paired).length;
}
console.log({ extractor, reader, unpaired });' "$B/apps/site"
```

→ `unpaired` is the number that matters. Every unpaired element is looked at
and explained in the Step 4 note, and one the reader should have paired is a bug
fixed in this step. `reader` equals `extractor` by construction, since both start
from the same match, so that equality proves only that the reader skips no
target. Today's `extractor` on the site is 7.

### Step 2 — `archetype` in the docs index

Files: `scripts/build-docs-digest.mjs`, `scripts/build-docs-digest.test.mjs`
Change: In `buildIndex` (`:18-31`), add `archetype: r.archetype ?? null` after
`name`. Add a test where one record has `archetype: 'button'` and one has none.
Both round-trip, the second as `null`. No committed fixture asserts the index's
shape: every `index.json` in the tests is an inline `{ components: [] }`, as the
Plan review confirmed. So nothing else changes.
Verify: `node --test scripts/build-docs-digest.test.mjs` → pass, including the new
test.

### Step 3 — `unnamed-control` and `colour-only-status`

Files: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`
Change: In `validate` (`:523`), for every file's `subtrees`:

- **Targets.** Look up the record with `records.get(normalizeName(component))`
  (`:536`).
  - `unnamed-control` targets an element whose folded name is `button` or
    `iconbutton`, or whose record has `archetype: "button"`.
  - `colour-only-status` targets an element for which
    `resolveArchetype(record ?? { name: component })` returns `badge`, imported
    from `./lib/component-states.mjs`.
  - An element can match both only through a record, and then each rule judges it
    once.
- **Judgement.** The same for both rules, applied in this order:
  1. **Abstain** when `paired` is false or the element has a spread.
  2. **Abstain** when any descendant has a spread or a label-like prop: `label`,
     `alt`, `text`, `i18nKey`, `defaultMessage`, `message`, `id`, or a name
     matching `/(Label|Text)$/`.
  3. **Named** when the element or any descendant has `aria-label`,
     `aria-labelledby` or `title` of kind `expr`, or of kind `literal` with a
     non-empty trimmed value. A `bare` one names nothing.
  4. **Named** when any `text` child anywhere in the subtree is non-whitespace,
     or there's any `expr` child.
  5. **Self-closing abstains** when it has a prop outside this list:
     - the record's `variants` and `states` keys (none without a record)
     - `className`, `style`, `disabled`, `type`, `key`, `ref`, `id`,
       `aria-hidden` and `asChild`
     - any name matching `/^on[A-Z]/` or `/^data-/`
     - `aria-label`, `aria-labelledby` and `title`, which step 3 has already
       judged
  6. Otherwise it **fails**, pushing `{ rule, component, path, line }`.
- **Skipping.** Add both names to `SKIPPABLE` (`:796`). An `off.has(rule)` guard
  goes around each rule, and a skipped rule is absent from `stats.a11y`, the same
  as a skipped rule elsewhere in the gate.
- **Counts.** `stats.a11y[rule] = { checked, abstained }`, where `checked` means
  passed plus failed.
- **The report.** `formatReport` prints one line immediately after the
  `dimensions:` line (`:720`), before `excluded:` and `skipped:`, naming only the
  rules that ran, and omitted when both are skipped:
  `  a11y:         unnamed-control N checked, M abstained; colour-only-status N checked, M abstained`.
  It prints a failure line per finding, in the style of the existing ones.
- **No inert failure.**

Tests, each fixture with a `.tsx` path, one or more per numbered case, with a
failing and a passing fixture each. They include the spec's own examples:

- **Fail:** `<Button><TrashIcon /></Button>`,
  `<Button><TrashIcon size={16} color="red" /></Button>` and
  `<Badge aria-label="" />`. So does `<Badge tone="danger" />` when the record's
  variants hold `tone`.
- **Pass:** `<Button><TrashIcon aria-label="Delete" /></Button>`,
  `<Button asChild><a>Go</a></Button>` and `<Button>{label}</Button>`.
- **Abstain:** `<Button><Trans i18nKey="delete" /></Button>`,
  `<Button {...props}><TrashIcon /></Button>`,
  `<Badge tone="danger" />` with no record, and `<IconButton variant="ghost" />`
  with no record.

A `--skip unnamed-control` test shows the rule absent from failures and from the
a11y line. A test skipping both shows no a11y line at all. A formatReport test asserts the line and where it sits.
Verify: `node --test scripts/validate-adherence.test.mjs` → all pass, and the
existing tests pass unchanged. That's the proof the old rules read what they read
before.

### Step 4 — Measure, and write the note

Files: `docs/notes/<date>-accessibility-usage-rules-measurement.md` (new), and a
throwaway script in the scratchpad
Change: Two samples on the Step 1 clone, each with its own table in the shape of
`docs/notes/2026-09-29-proof-bundle-rules-measurement.md`. Every checked, failed
and abstained element is read and marked real or wrong.

- **Sample A, the site as a consumer runs it.** Run
  `node scripts/build-docs-digest.mjs --root $B`, which creates an empty index,
  since the repo has no doc records. Then:

  ```
  node scripts/validate-adherence.mjs --root $B/apps --system $B \
    --package @throughline-ds/ui --tokens $B/packages/tokens/dtcg/tokens.json
  ```

  It exits 1 on 47 existing failures, 46 `token-exists-for-*` and one
  `variant-rule-inert`, as counted in the Plan re-review. That's expected and not
  part of this measurement. Read the `a11y:`
  line and any `unnamed-control` or `colour-only-status` failures.
- **Sample B, the ui package's own code.** Write a scratch script that walks
  `$B/packages/ui/src` for script files, skipping `*.test.*`. For each file, it
  builds `imported` from that file's relative imports whose last path segment
  folds (`normalizeName`) to a name in `components.built` of
  `$B/design-system.json`, calls `readSubtrees`, and runs the Step 3
  judgement through `validate({ files, index })`. Record how elements were
  counted. `grep -rhoE '<(Button|Badge)\b' $B/packages/ui/src | sort | uniq -c`
  gives 20 `<Button>`s and 2 `<Badge>`s. `\b` keeps `<ButtonGroup>` out, and no
  test file holds either. One Badge is `<Badge {...args} />`, which abstains.
  The other has text, so it's checked.
- **The note** includes the Step 1 counts and every unpaired element. It states
  plainly that this is one codebase, and that Sample B is reached by a script, not
  by the gate.

Verify: Sample B checks at least one element under each rule. If it doesn't, the
measurement hasn't exercised the rule, and the step isn't done. Every failure in
either sample is marked real. A wrong one means the rule is narrowed and Step 3's
tests are extended before anything ships. The note's Sample A counts match a rerun
of the command.

### Step 5 — Document the usage rules

Files: `scripts/README.md`, `CHANGELOG.md`
Change:

- Add the two rules to the `validate-adherence.mjs` row at `scripts/README.md:14`,
  one sentence each. Say they read script files only, abstain rather than guess,
  and can be switched off with `--skip`.
- The `lib/component-states.mjs` row (`:29`) now says it's copied alongside both
  `verify-check.mjs` and `validate-adherence.mjs`.
- Under `## [Unreleased]`, add `### Added` with both rules, the a11y report line
  and `archetype` in the docs index.

Verify: `node ci/validate-install-sets.mjs` → pass. The docs-set table at
`:41-54` already lists `lib/component-states.mjs`, so the copy list still closes.
`grep -n "validate-adherence" scripts/README.md | grep component-states` → one
hit. The rest of the prose is reviewed by eye.

### Step 6 — The focus read-back, written where both build paths run it

Files: `references/figma-component-standards.md`, `agents/figma-executor.md`,
`skills/component-builder/SKILL.md`, `references/proof-bundle.md`, and the adapter
copies `generate.mjs` rewrites from the SKILL.md:
`adapters/generic/skills/component-builder/SKILL.md`,
`adapters/codex/prompts/component-builder.md` and
`adapters/cursor/.cursor/rules/component-builder.mdc`
Change:

- **Standards, audit item 9 (`:563`).** Add a programmatic read-back after the
  existing prose, and name it the `focus-indicator` check there.
  - **Scope.** It applies to components resolving by name to `button`, `input`
    or `choice`, and only when `uiFramework` is exactly `shadcn`, `tailwind`,
    `mui`, `vanilla-css` or `vanilla`, or absent or `null`. Otherwise it's
    skipped, and the skip is said.
  - **What it reads.** Every variant whose `state` value is exactly `focus` after
    `normalizeName`.
  - **Ring recipes** (shadcn, tailwind, absent or null; mui on anything but an
    input). The variant has either a visible `DROP_SHADOW` effect whose colour is
    bound to the `border/focus` variable, or a direct child with
    `layoutPositioning = "ABSOLUTE"` and `strokeAlign = "OUTSIDE"` whose stroke
    is bound to `border/focus`. A shadcn, tailwind or default variant that has a
    stroke of its own must also have that stroke bound to `border/focus`. One
    without a stroke (ghost, link) is judged on the ring alone.
  - **mui inputs.** The variant's own stroke is bound to `border/focus` and its
    weight to `width/focus`.
  - **vanilla.** The variant or a direct child carries a stroke bound to
    `border/focus` with `strokeAlign = "OUTSIDE"`. The `offset/focus` gap isn't
    asserted (see Open questions).
  - **The result.** A miss stops the build, naming the variant and what was
    missing.
- **Executor step 1 (`figma-executor.md:16`).** Alongside `figma.fileKey`,
  read `project.uiFramework` from the same `design-system.json`.
- **Executor step 4 (`figma-executor.md:19`).** After the state check, run the
  item 9 read-back against that `uiFramework`. Return `BLOCKED`
  naming the variant. Step 6's return value names the `focus-indicator` outcome:
  passed, or skipped and why.
- **component-builder.**
  - The inline path runs the item 9 read-back as part of the post-build audit
    (`:177`) and stops on a miss.
  - The record step (`:363-367`) adds `focus-indicator` to the attested checks
    whenever the read-back ran and passed, and omits it when skipped.
  - Then run `node scripts/adapters/generate.mjs` to rewrite the two adapter
    copies.
- **proof-bundle.md.** Add a row at `:204-216`:
  `| \`focus-indicator\` | attested | \`component-builder\` |`.

`verify-check.mjs` doesn't change. No rule reads `focus-indicator`, so an older
component with no such entry isn't flagged, as the legacy decision requires.

Verify: the grep below finds at least one hit in each file. It's the step's real
check, since the CI validators read frontmatter and manifests, not this prose.

```
for f in references/proof-bundle.md references/figma-component-standards.md \
  skills/component-builder/SKILL.md agents/figma-executor.md; do
  grep -c "focus-indicator" "$f"; done
grep -c "uiFramework" agents/figma-executor.md
```

Then `node scripts/adapters/generate.mjs --check` → pass, which proves the
adapter copies were regenerated. The read-back prose is reviewed by eye against
the "Which indicator counts" Decisions row.

### Step 7 — Live proof, in the #138 session

Files: none, apart from a note appended to #138's
Change: In the live Figma session #138 runs, against the system that session
builds on, on a system whose manifest has `uiFramework: "shadcn"`. throughline-ds's already
does. If #138's system uses another value, run this step on a shadcn system
instead rather than change #138's:

1. Build one Button with filled and ghost variants through `figma-executor`,
   from a normal architect spec.
2. Build a second component, `RinglessButton`, with the same matrix, from an
   architect spec edited by hand to omit the ring on the ghost focus variant.
   The executor always rebuilds from its spec into a fresh `WIP:` frame, so
   editing the finished component and rebuilding would restore the ring. The spec
   is the only place to remove it.

Verify:

- The Button returns `DONE` with `focus-indicator` passed, and component-builder's
  entry for it carries `focus-indicator`.
- `node scripts/verify-check.mjs --root <system> --tokens <each mode file>`
  reports no failure naming `Button`. No rule reads `focus-indicator`, so this
  proves only that the recorded entry passes `proof.mjs`'s shape check. The step
  keeps it for that reason. Unrelated rules may fail on that system.
  throughline-ds, for one, has four real `color-contrast` failures. Any that
  appear are listed in the note, not treated as this step's result.
- `RinglessButton` returns `BLOCKED` naming its ghost focus variant and leaves its
  `WIP:` frame unfinalized.

Until this runs, the CHANGELOG doesn't claim the focus check.

### Step 8 — Close out

Files: `CHANGELOG.md`, issue #140
Change:

- Add the focus check to `### Added` once Step 7 has passed.
- Correct #140's text, which says both halves land as bundle entries: the usage
  rules are adherence-gate failures only. Confirm the edit with the user before
  posting, since it's outward-facing.
- Put the focus-ring contrast Open question to the user. Filing that issue is
  their call and sits outside this Plan.

Verify: `gh issue view 140` shows the corrected text. The full CI set passes.
