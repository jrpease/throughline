# Narrow the component rule

Status: planned
Reviewed: 2026-09-11 — ready to build
Date: 2026-09-11
Issue: #120 (refs #39)
Evidence: `docs/superpowers/notes/2026-09-11-colour-rule-measurement.md` (#122), plus a
prototype of these rules run against the same site at the same commit
Parent design: `docs/superpowers/specs/2026-08-31-code-adherence-gate-design.md` (§4, §11)

## Goal

`unknown-component` has one real app to its name, and it failed correct code 20
times out of 20. A gate that does that gets switched off on day one. The parent
spec's §11 says what happens next: narrow the rule, never downgrade it to an
advisory.

The 20 break down into two misreads, and the code behind them has two more bugs:

1. **`<Icons.Folder>` reads as `<Icons>`.** The element pattern stops at the dot.
   `Icons` is `export * as Icons` from the site's UI package, the system's own
   icon namespace. 17 of the 20, from 13 tags.
2. **`<CardTitle>` is part of `Card`.** Same package, same `export { Card,
   CardTitle, … }` block. `components.built` lists `Card`. 3 of the 20, from one
   tag.
3. **It fires once per attribute.** `<CardTitle ref style className>` is those
   3.
4. **A tag with no attributes is never checked.** `import { Hero }` then
   `<Hero />` passes today.

After this ships, the same run against the same commit flags 0 components
instead of 20. A probe with invented components still fails `<Hero />` and
`<Buttons variant size title>` once each. Today it misses the first and fails
the second three times.

The cost is stated up front, because the issue asked for it: an invented name
that starts with a built component's name and continues with a capital letter
passes. `<CardGrid>` and `<ButtonX>` sit on the accepted side of the line, and a
test pins them there. The report names every name it accepted that way, so the
line stays visible.

## Non-goals

- **Downgrading the rule.** §11 rules it out.
- **Checking a part's props.** `<CardTitle>` is checked for existence only.
- **Declared parts in the manifest.** See Open questions.
- **Namespace imports.** `import * as UI from '@acme/ui'` then `<UI.Button>` isn't
  read before or after this change.
- **A member of a built component.** `<Dialog.Root>` is left alone like any
  other member.
- **Tracking strings.** A tag inside string content still reads as a tag, and a
  `//` inside a JSX string still blanks the rest of its line (parent spec,
  Decision 5).
- **Counting attributeless tags as referenced components.** See Decisions.
- **Vue and Svelte.** The component rules stay JSX-only (parent spec §4).
- **The skipped-token count** (#121) and **`storybook-static`** (#124).

## Decisions

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| Narrow, or make the rule advisory | Narrow. `unknown-component` keeps its `failure` verdict. | Parent spec §11, restated in #120. | Any verdict change for `unknown-component`. |
| What `<Icons.Folder>` is | A tag whose name has a `.Member` chain, and whose first segment is imported from `--package`, is left alone entirely. It isn't a component reference, its attributes aren't read, and it isn't counted. | #120's proposal: treat it as a use of the `Icons` export and leave it alone, unless the manifest can say it isn't part of the system. It can't. The icon set lives under `icons`, which names a library and a subset, never an export name. Not counting it is recommended; accepted under Jordan's standing instruction (2026-09-11). A member of a system export has nothing the manifest could list, so there's no inference to surface. | Guessing the namespace's name from `icons`. Checking `<Card.Title>` against `Card`. A report line for members. |
| How a compound part is recognised | A name that isn't in `components.built` is a part when a built name, normalised, is a strict prefix of its normalised form, and the character right after that prefix in the name as written is `A`–`Z`. When several built names qualify, the longest owns it. A name holding anything outside `[A-Za-z0-9]` is never a part. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #120 names the prefix match as the cheap version. The capital boundary turns away `Cardigan`, `Buttons` and `Card2`. The longest match gives `ButtonGroupText` to `ButtonGroup`, not `Button`. Measured: `CardTitle` is the only part on the site, and it resolves to `Card`. | Declaring parts in the manifest. `subComponents` isn't in `references/manifest-schema.md`, throughline-ds hand-wrote it on `ButtonGroup` only, and `Card` has none, so the site would still fail on day one. Reading the package's exports, which means resolving a specifier. A vocabulary of part words, which breaks on shadcn's `DropdownMenuSubTrigger`. |
| Where the line against typos sits | `<ButtonX>`, `<CardGrid>`, `<CardTitle>`, `<ButtonGroupText>` and `<SelectMenuItem>` (against `Select Menu`) are parts. `<Buttons>`, `<Buton>`, `<Cardigan>`, `<Card2>`, `<Hero>` and `<Card_Title>` aren't. `<Card>` itself isn't a part of `Card`. One unit test pins all twelve. | #120: "it needs a test that says where the line is." The side `ButtonX` lands on is recommended; accepted under Jordan's standing instruction (2026-09-11). In a TypeScript consumer, a name the package doesn't export is already a compile error. The probe shows what's left: `<Hero />` and `<Buttons>` fail, `<CardGrid />` doesn't. | Catching an invented name that starts with a built name and a capital. |
| What a part is checked for | Existence only. Its attributes are counted in the `not read:` denominator and nothing else. They're never checked against the owner's axes, raise no `unmodelled-prop` or `dynamic-value`, and don't add the owner to referenced components. | Recommended; accepted under Jordan's standing instruction (2026-09-11). `CardTitle`'s props aren't `Card`'s variants, so checking them there would fail correct code. Counting the owner as referenced would let a file that uses only parts trip `variant-rule-inert`. | Variant checks on a part. |
| How accepted parts show up | One `parts:` line under `components:`, listing each distinct accepted name with its owner: `parts:        CardTitle (Card) — not in components.built, read as part of the built component each name starts with`. Printed only when there's at least one. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The `ButtonX` line is a blind spot, and the parent spec's rule is that the gate never implies coverage it lacks. `excluded:` is the precedent: one line, printed only when non-empty. | Accepting parts silently. An advisory per part name, since a shadcn-heavy app could print thirty. |
| The rule's unit | One check per tag. `extract` returns `elements`, one `{ component, line }` per opening tag, with or without attributes. `unknown-component` reads `elements`. `usages` stays one per attribute and feeds only the variant rule and advisories. | #120: "Count per element, and check elements with no attributes." Keeping `usages` as it is keeps the variant rule and its tests unchanged. The shape is recommended; accepted under Jordan's standing instruction (2026-09-11). | De-duplicating attribute usages by line, which would merge two tags that share one. |
| Does an attributeless known tag count as referenced | No. `components: N referenced`, `undocumented-component` and `variant-rule-inert` keep reading attribute usages. | Recommended; accepted under Jordan's standing instruction (2026-09-11). #120 scopes the per-element change to `unknown-component`. Counting `<Spinner />` alone as referenced would make `variant-rule-inert` fail a run that passes today, and nothing measured asks for that. | `<Spinner />` on its own counting toward `components:`. |
| What the headline counts | `N component references`, the number of elements, replaces `N usages`. `not read:` keeps attributes as its denominator. `nothing-scanned` counts elements, not attributes. | Recommended; accepted under Jordan's standing instruction (2026-09-11). `usages` counted attributes, so a run that read only `<Spinner />` would print `0 usages` and pass. "Component reference" is already the phrase `nothing-scanned` uses. | A headline that counts attributes. |
| Comments | Import and element extraction read `blankComments` text, the same blanking hex and dimensions already use. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The colour narrowing left a commented-out `<Button>` for #120 (`docs/specs/2026-09-11-narrow-colour-rule.md`, Non-goals). Checking attributeless tags makes it matter, because `{/* <Hero /> */}` would start failing. Measured on the site: no change, 7 references with or without blanking. | Tracking strings. A protocol-relative `href="//cdn…"` blanks to the end of its line. |
| Type arguments | A `<` right after an identifier character, `$` or `.` doesn't open a tag. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Checking attributeless tags would read `useState<Variant>('a')` as `<Variant>` and fail correct code whenever `Variant` is imported from the package without `type`. The site's source holds 45 type arguments on a capitalised name, 26 of them `useRef<HTMLDivElement>`, and none of them imported from the package. Measured: no change, 7 references with or without the guard. | `return<Hero />` with no space, which Prettier never writes. |
| Where the code lives | `scripts/validate-adherence.mjs` only. `partOwner(name, built)` is exported. No new imports. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The install set doesn't change (`ci/validate-install-sets.mjs`). | A new `lib/` module. |
| CHANGELOG | Fold into the existing unreleased gate entry under `[Unreleased]` → Added, as a sixth "worth knowing" bullet. | Recommended; accepted under Jordan's standing instruction (2026-09-11). No user has run the gate. #109, #123 and the dimension rules set the precedent. | A Fixed entry for a bug nobody could have hit. |
| Where the before-and-after numbers live | A new section appended to the colour-rule measurement note, plus `## What shipped` here. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The 20-of-20 finding was recorded there, and #120 links to it. | A separate note. |

## Open questions

- **Declared parts.** A manifest field listing each component's parts would catch
  an invented `<CardGrid>`. That means a schema change, `component-builder` and
  `storybook-chromatic-builder` writing the field, and every existing manifest
  failing until someone fills it in. **I'd recommend waiting for a real run where
  an invented part slips through.** Unresolved.
- **Namespace imports** (`import * as UI from '@acme/ui'`). Neither measured app
  uses one. **I'd recommend waiting for evidence.** Unresolved.
- **A tag inside string content.** A code sample like `'<Hero />'` in a file that
  also imports `Hero` from the package now reads as a tag without attributes.
  The site has none. **I'd recommend waiting.** Unresolved.

## Plan

Everything below runs from the repo root on branch `fix/120-narrow-component-rule`.

**Scratch material.** The measurement clones, the baselines and the prototype
live in this session's scratchpad. Every command below uses:

```sh
M=/private/tmp/claude-501/-Users-jordanpease-Dev-throughline/34e9781c-566c-40de-b615-11bc1fb97988/scratchpad/measure
```

- `$M/throughline-brand` at `2a9d370`, and `$M/zygarden-frontend` at `ca61ca9a6`.
  If they're gone, rebuild them from the Reproduce block in
  `docs/superpowers/notes/2026-09-11-colour-rule-measurement.md`.
- `$M/before-120-brand-apps.txt`, `before-120-brand-packages.txt`,
  `before-120-zyg-apps.txt`, `before-120-zyg-libs.txt` and `before-120-probe.txt`
  are the gate's output on `main` at `18fe3a1`, before this change. If they're
  gone, re-run Step 5's commands from a `git worktree add <dir> 18fe3a1`.
- `$M/proto-120-lb.mjs` is a throwaway prototype of Steps 1 and 2, for reference.
  The briefs below are complete without it.

All code changes go in `scripts/validate-adherence.mjs`. Every new test goes in
`scripts/validate-adherence.test.mjs` in the house style: `node:test`, inline
fixtures, line numbers counted by hand in the fixture rather than read back off
the implementation, and tmp dirs for CLI tests.

### Step 1 — Read tags, members and comments in `extract`

Files: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`

Change:
- Add `// Component-rule narrowing (#120): docs/specs/2026-09-11-narrow-component-rule.md`
  to the file header's list of spec pointers.
- Replace `ELEMENT` with
  `/(?<![\w$.])<([A-Z][A-Za-z0-9]*)((?:\.[A-Za-z][A-Za-z0-9]*)*)\b([^>]*?)\/?>/g`.
  Group 1 is the name. Group 2 is a member chain like `.Folder`, and an empty
  string when there isn't one. Group 3 is the attribute text, which was group 2.
  Rewrite the comment above it: an opening JSX tag on a capitalised name, with an
  optional `.Member` chain and its attribute text, where a `<` straight after an
  identifier character is a type argument (`useState<Variant>`), not a tag.
- In `extract`:
  - First line: `const code = blankComments(text, path);`.
  - The `IMPORT` loop runs over `code` instead of `text`.
  - Declare `const elements = [];` beside `usages`.
  - The `ELEMENT` loop runs over `code`. For each match: `declared = imported.get(el[1])`,
    and `continue` if it's absent. Then `continue` if `el[2]` is non-empty, with a
    comment saying `<Icons.Folder>` is a member of something the system exports
    and is left alone (#120). Then `line = lineOf(code, el.index)`, push
    `{ component: declared, line }` onto `elements`, and push one usage per
    `el[3].matchAll(ATTR)` match, exactly as today.
  - `colourText` becomes `blankMasks(code, path)`. Replace the comment above it
    with one saying import, element and hex extraction all read comment-blanked
    text, and only hex also has masks blanked.
  - Return `{ imported, elements, usages, literals, dimensions: extractDimensions(text, path) }`.

Tests:
- `extract(SRC, '@acme/ui').elements` deep-equals
  `[{ component: 'Button', line: 7 }, { component: 'Card', line: 8 }]`. Line 1 of
  `SRC` is its leading newline, so `<Button` opens line 7 and `<Panel` line 8.
  `<Other>` isn't imported from the package.
- In `a.tsx`, `import { Icons } from '@acme/ui';\n<Icons.Folder size={13} className="x" aria-hidden />\n`
  yields `elements` `[]` and `usages` `[]`.
- In `a.tsx`, `import { Nonexistent } from '@acme/ui';\n<Nonexistent />\n` yields
  `elements` `[{ component: 'Nonexistent', line: 2 }]` and `usages` `[]`.
- In `a.tsx`, `import { Hero } from '@acme/ui';\n// <Hero />\n{/* <Hero /> */}\n<Hero />\n`
  yields `elements` `[{ component: 'Hero', line: 4 }]`.
- In `a.tsx`, `import { Variant } from '@acme/ui';\nconst [v] = useState<Variant>('a');\n`
  yields `elements` `[]`.
- In the existing "a multi-line tag is read" test, also assert that `elements`
  deep-equals `[{ component: 'Button', line: 2 }]`.

Verify: `node --test scripts/validate-adherence.test.mjs` → all pass, including
every existing test unchanged.

### Step 2 — Check once per tag, accept parts, report them, and wire the CLI

Files: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`

Change:
- Export `partOwner(name, built)`, with a comment naming this spec and saying
  `CardTitle` belongs to `Card`, and so does `ButtonX`, which a test pins:
  - Return `null` unless `/^[A-Za-z0-9]+$/.test(name)`.
  - `key = normalizeName(name)`. For each `b` of `built`, take `k = normalizeName(b)`
    and skip `b` when `k === ''`, `k.length >= key.length`, `!key.startsWith(k)`,
    `!/[A-Z]/.test(name[k.length])`, or `k` isn't longer than the best `k` so far.
    Otherwise `b` becomes the best.
  - Return the best `b`, or `null`.
- In `validate`:
  - Destructure each file as `{ path, elements = [], usages, literals, dimensions = [] }`.
  - `stats` gains `elements: 0` and `parts: new Map()`.
  - At the top of the per-file loop, before the usages loop:
    ```js
    for (const e of elements) {
      stats.elements += 1;
      if (off.has('unknown-component') || builtKeys.has(normalizeName(e.component))) continue;
      const owner = partOwner(e.component, built);
      if (owner) {
        if (!stats.parts.has(e.component)) stats.parts.set(e.component, owner);
        continue;
      }
      failures.push({ rule: 'unknown-component', component: e.component, file: path, line: e.line });
    }
    ```
  - In the usages loop, replace the whole `if (!declaredName) { … }` block with
    `if (!declaredName) continue;`, commented: existence is checked once per tag
    above, and an attribute on an unknown component or a part is counted and
    nothing more.
  - `nothing-scanned` fires when `stats.elements === 0 && stats.literals === 0 && stats.dimensions === 0`.
- In `formatReport`:
  - The headline reads
    `` `tokens:validate-adherence — ${s.elements} component references, ${s.literals} colour literals, ${s.dimensions} dimension literals, ${s.files} files` ``.
  - When `s.parts.size > 0`, a line straight after `components:` and before
    `variant axes:`:
    `` `  parts:        ${[...s.parts].map(([p, o]) => `${p} (${o})`).join(', ')} — not in components.built, read as part of the built component each name starts with` ``.
  - The `unknown-component` failure line doesn't change.
- In `main()`: destructure `{ elements, usages, literals, dimensions }` from
  `extract`, keep a file when
  `elements.length || usages.length || literals.length || dimensions.length`, and
  push `{ path, elements, usages, literals, dimensions }`.

Existing tests. These edits keep them meaning what they meant:
- Import `partOwner`.
- Replace the `file` helper with:
  ```js
  const elementsOf = (usages) => [
    ...new Map(usages.map((u) => [`${u.component}:${u.line}`, { component: u.component, line: u.line }])).values(),
  ];
  const file = (usages = [], literals = [], dimensions = [], elements = elementsOf(usages)) => [
    { path: 'a.tsx', elements, usages, literals, dimensions },
  ];
  ```
- In "nothing-scanned reports the files walked", change the headline regex to
  `/0 component references, 0 colour literals, 0 dimension literals, 12 files/`.
- In "every rule renders without undefined leaking into the text", add the usage
  `{ component: 'SpinnerIcon', attr: 'size', value: 'sm', line: 7 }` and assert the
  text matches `/parts:\s+SpinnerIcon \(Spinner\) — not in components\.built/`.

New tests:
- `partOwner` puts the line where this spec says. With
  `['Card', 'Button', 'ButtonGroup', 'Select Menu']`: `CardTitle` → `'Card'`,
  `CardGrid` → `'Card'`, `ButtonGroupText` → `'ButtonGroup'`, `SelectMenuItem` →
  `'Select Menu'`, `ButtonX` → `'Button'`. `Cardigan`, `Buttons`, `Buton`,
  `Card2`, `Card`, `Hero` and `Card_Title` → `null`. Name the test so it says
  `ButtonX` is accepted on purpose.
- An unknown component fails once per tag, not once per attribute: `BUILT`,
  `INDEX`, `TOKENS`, `DIMS`, and three usages of `Invented` on line 3 (`ref`
  `null`, `style` `null`, `className` `'a'`) give exactly one `unknown-component`
  failure.
- An attributeless unknown tag still fails: the same inputs with
  `file([], [], [], [{ component: 'Nonexistent', line: 2 }])` give failure rules
  deep-equal to `['unknown-component']`, so `nothing-scanned` doesn't fire.
- A part passes, and nothing past existence is checked: `built: ['Card']`,
  `index: { components: [{ name: 'Card', variants: { variant: { default: '' } }, states: {} }] }`,
  `TOKENS`, `DIMS`, and
  `file([{ component: 'CardTitle', attr: 'variant', value: 'x', line: 1 }, { component: 'CardTitle', attr: 'onClick', value: null, line: 1 }])`
  give `failures` `[]`, `advisories` `[]`, `[...r.stats.parts]` deep-equal to
  `[['CardTitle', 'Card']]`, and `r.stats.knownComponents.size === 0`.
- A skipped rule records no parts: `skip: ['unknown-component']` with elements for
  `Invented` and `SpinnerIcon` gives no `unknown-component` failure and
  `r.stats.parts.size === 0`.
- The headline counts tags, and a part is named once: `BUILT`, `INDEX`, `TOKENS`,
  `DIMS`, usages `Button variant="ghost"` and `Button size="lg"` on line 1 plus
  `SpinnerIcon size="sm"` on line 2, and elements `Button` line 1, `SpinnerIcon`
  line 2, `SpinnerIcon` line 3. The text matches `/— 3 component references, /` and
  `/not read:     0 of 3 attributes/`, and exactly one line contains `parts:`, with
  `SpinnerIcon (Spinner)` in it once. Then render the same call without the
  `SpinnerIcon` usage and elements, and assert no line contains `parts:`.
- A CLI test using the existing `tree` and `runCli` helpers:
  - Root `app/page.tsx` holds
    `import { Hero, CardTitle, Icons } from '@acme/ui';\nexport const P = () => (\n  <div>\n    <Hero />\n    <CardTitle ref={r} style={s} className="t" />\n    <Icons.Folder size={13} />\n  </div>\n);\n`.
  - The system tree holds `design-system.json` as
    `{ "components": { "built": ["Card"] } }` and `design-system/docs/index.json`
    as `{ "components": [] }`.
  - `--tokens` is `TOKENS_JSON` written to its own `tree`.
  - Expect exit 1. Exactly one output line contains `[unknown-component]`, and it
    matches `/<Hero> at .*page\.tsx:4/`. The output contains
    `parts:        CardTitle (Card)`, matches `/— 2 component references, /`, and
    doesn't contain `<Icons>`.

Verify: `node --test scripts/validate-adherence.test.mjs` → all pass. Then
`node scripts/validate-adherence.mjs` with no arguments → exit 2 and the usage
line, unchanged.

### Step 3 — Document it

Files: `CHANGELOG.md`, `scripts/README.md`

Change:
- `CHANGELOG.md`, the `scripts/validate-adherence.mjs` entry under `[Unreleased]`
  → Added. Write it with the `write-like-jordan` skill, matching the neighbouring
  bullets.
  - Change "Five things worth knowing" to "Six things worth knowing".
  - Add a bullet straight after the `variant-rule-inert` bullet:
    - A component is checked once per tag, and a tag with no attributes is
      checked too.
    - `<Icons.Folder>` is a member of something the package exports, and it's
      left alone.
    - A name that starts with a built component's name and continues with a
      capital letter is read as part of that component. `<CardTitle>` belongs to
      `Card`, and so would an invented `<CardGrid>`. The report lists every one on
      a `parts:` line.
    - A commented-out tag isn't code.
    - Against the throughline-ds site, this took the rule from 20 failures on
      correct code to 0.
- `scripts/README.md`: in the paragraph under `## Usage`, straight after the
  sentence ending "prints an `excluded:` line naming it.", add one sentence. A tag
  whose name starts with a built component's name and continues with a capital
  letter (`CardTitle` for `Card`) is read as part of that component, and the
  report lists each one on a `parts:` line.

Verify:
- `node ci/validate-install-sets.mjs` → exit 0. It parses `scripts/README.md`.
- `grep -n 'parts:' CHANGELOG.md scripts/README.md` shows the new text in both
  places, and nowhere else.
- Both edits read by eye against the neighbouring entries.

### Step 4 — CI

Files: none

Change: none. Run each step of `.github/workflows/ci.yml` as its own command:
`node --test`; `node ci/validate-plugin.mjs`; `node ci/validate-skills.mjs`;
`node ci/validate-install-sets.mjs`; `node scripts/adapters/generate.mjs --check`;
`node scripts/build-doc-card-builder.mjs --check`;
`node scripts/build-native-adapter-config.mjs --check`.

Verify: all seven exit 0.

### Step 5 — Measure the real change, record it, close out this spec

Files: `docs/superpowers/notes/2026-09-11-colour-rule-measurement.md`, this spec

Change: confirm the clones are still at `2a9d370`
(`git -C $M/throughline-brand log -1 --format=%h`) and `ca61ca9a6`
(`git -C $M/zygarden-frontend log -1 --format=%h`). Then, from the repo root:

```sh
B=$M/throughline-brand
node scripts/validate-adherence.mjs --root $B/apps --system $B \
  --package @throughline-ds/ui --tokens $B/packages/tokens/dtcg/tokens.json > $M/after-120-brand-apps.txt
node scripts/validate-adherence.mjs --root $B/packages --system $B \
  --package @throughline-ds/ui --tokens $B/packages/tokens/dtcg/tokens.json > $M/after-120-brand-packages.txt
Z=$M/zygarden-frontend; T=$Z/libs/shared/util-tokens/src/tokens
for R in apps libs; do
  node scripts/validate-adherence.mjs --root $Z/$R --system $Z --package @zygarden/none \
    $(for f in $T/*.json; do printf -- '--tokens %s ' "$f"; done) \
    --skip unknown-component --skip unknown-variant-value > $M/after-120-zyg-$R.txt
done
```

The probe is a scratch copy of the site with invented components added. It isn't
the clone, and nothing is written to the clone:

```sh
P=$M/probe-120
rm -rf $P && mkdir -p $P && cp -R $B/apps $P/apps
printf '%s\n' \
  "import { Hero, Buttons, CardGrid, Card } from '@throughline-ds/ui';" \
  "export const P = () => (" \
  "  <Card>" \
  "    <Hero />" \
  "    <Buttons variant=\"x\" size=\"y\" title=\"z\" />" \
  "    <CardGrid />" \
  "    {/* <Hero /> */}" \
  "  </Card>" \
  ");" > $P/apps/site/components/probe-120.tsx
node scripts/validate-adherence.mjs --root $P/apps --system $B \
  --package @throughline-ds/ui --tokens $B/packages/tokens/dtcg/tokens.json > $M/after-120-probe.txt
```

Colour and dimension flags must not move:

```sh
flags() { grep -E '\[token-exists-for-(literal|dimension)\]' "$1" | sed 's/ — .*//' | LC_ALL=C sort; }
for r in brand-apps brand-packages zyg-apps zyg-libs; do
  diff <(flags $M/before-120-$r.txt) <(flags $M/after-120-$r.txt)
done
```

Then whole reports:

```sh
diff $M/before-120-brand-apps.txt $M/after-120-brand-apps.txt
for r in brand-packages zyg-apps zyg-libs; do diff $M/before-120-$r.txt $M/after-120-$r.txt; done
grep '\[unknown-component\]' $M/before-120-probe.txt
grep '\[unknown-component\]\|parts:' $M/after-120-probe.txt
```

Append a section to the measurement note, "`unknown-component` after #120". It
holds:
- The commit, and a pointer to this spec.
- A before-and-after table for `throughline-ds` `--root apps`: the headline count
  (33 usages → 7 component references), attributes read (33 → 16),
  `unknown-component` flags (20 → 0, all 20 false, as the note's own reads found),
  and total rule failures (67 → 47).
- The `parts:` line from the run.
- The probe, before and after, as the check that the narrowed rule still fails an
  invented component. Today it misses `<Hero />` and fails `<Buttons>` three
  times. After, it fails each once, skips the commented-out tag, and accepts
  `<CardGrid />` as a part of `Card`, which is the line this spec draws.
- What the run doesn't establish: one JSX app, a system with no doc records, and
  the fact that an invented name shaped like a part passes.

Then close out this spec. Add `## What shipped` and `## Where it diverged`, in that
order, between `## Open questions` and `## Plan`, and set `Status: built`.

Verify:
- **Every flag diff is empty,** all four runs.
- **brand apps** whole-report diff shows only these changes: the headline
  (`33 usages` → `7 component references`), `not read:` (`0 of 33` → `0 of 16`), one
  added line `parts:        CardTitle (Card) — …`, `67 rule failure(s)` →
  `47 rule failure(s)`, and the 20 `[unknown-component]` lines removed (17 `<Icons>`,
  3 `<CardTitle>`).
- **brand packages, zygarden apps, zygarden libs** each differ only in the
  headline's first phrase (`0 usages` → `0 component references`).
- **Probe, before:** 3 lines of `[unknown-component] <Buttons>` at
  `probe-120.tsx:5`, no `<Hero>`, plus the site's own 17 `<Icons>` and 3
  `<CardTitle>`.
- **Probe, after:** exactly two `[unknown-component]` lines, `<Hero>` at
  `probe-120.tsx:4` and `<Buttons>` at `probe-120.tsx:5`, and a `parts:` line naming
  both `CardGrid (Card)` and `CardTitle (Card)`, in either order.

Any other line means the build and this spec disagree. Find which one is wrong
before recording numbers. A mechanical difference goes in "Where it diverged". A
difference that changes a Decision is an escalation.
