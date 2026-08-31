# Code adherence gate — design

**Date:** 2026-08-31
**Status:** Proposed — revised after review
**Issue:** #39, keystone of the consumption-layer epic (#39–#44)

> **Origin.** #39 proposes a zero-dependency gate that fails a build when code
> using a design system has drifted from it. The records it would read were
> surveyed first. **One of the issue's four rules assumes data that does not
> exist, and a second is a duplicate of a third** — the correction is §1.
>
> **Revision note.** A critic review found the first draft's narrowing had
> quietly reduced the gate to one working rule while its prose still claimed
> four, and that its own worked example contradicted the schema it quoted three
> sections earlier. That is now stated rather than smoothed over: **the colour
> rule is this gate's value in v1**, and the variant rule is scoped, measured and
> floored rather than advertised. Six other findings are resolved inline and
> marked ⟨rev⟩.

## 1. What the issue assumes, and what the records hold

| Rule as written | Buildable? |
|---|---|
| every component referenced exists in the system | **yes** — `design-system.json` `components.built` |
| every prop/variant value is in that component's declared set | **only for variant axes, and only where a naming convention holds** — see below |
| no raw color/spacing/radius/type literals where a token exists | **yes, colour in v1** |
| no ad-hoc CSS that duplicates a token's value | **the same check as rule 3**, not a separate one |

**There is no `props` field in a component doc record.** Not in
`references/component-doc-schema.md:53-57`, not in the archetypes, not in
`scripts/lib/doc-record.mjs:13`. The only enumerated value sets anywhere are the
**keys** of `variants.<axis>` and of `states`:

```json
"variants": { "type": { "primary": "…", "secondary": "…", "ghost": "…" },
              "size": { "sm": "…", "md": "…", "lg": "…" } },
"states":   { "hover": "…", "disabled": "…" }
```

A boolean prop, a slot, an event handler, a free-string prop: none has a
declared set.

**And nothing asserts that an axis name is the code component's prop name.**
`skills/storybook-chromatic-builder/SKILL.md:80` states it as a convention —
"variant matrices (type/size/state) become the component's props/variants" — and
no record, manifest field or check enforces it.

⟨rev⟩ **This is worse than "a limitation", and the first draft hid it.** The
schema's own example names the axis `type`. React components conventionally take
`variant`. So #39's headline case — `variant="tertiary"` on a Button whose axis
is `type` — does not match any axis, and a gate that only checks matched axes
says nothing about it. The first draft's §6 sample output even printed
`declared values for "variant"`, which contradicts the schema quoted above.

Decision 2 is the response, and it is a demotion, not a repair.

## 2. Problem

ThroughLine builds design systems and cannot verify that code *using* one
adheres. An agent composing a screen writes `variant="tertiary"` where only
`primary`/`secondary` exist, `padding: 13px` against a 4/8/12/16 scale, or
`#3B82F6` where `color.brand.primary` holds exactly that value.

#39's framing is right and worth keeping: **a good inventory is necessary and not
sufficient.** `docs:digest` already produces one. A perfect inventory still gets
ignored under pressure, so adherence has to be *verified*, not requested.

The precedent is `validate-token-output.mjs`, which exists because the sync
step's own verification passed output that was half wrong. Same shape, one layer
out: the system is correct, and the code using it drifts.

## 3. Decisions

**1. Read `design-system/docs/index.json` for vocabulary and
`design-system.json` for existence. Never `llms.txt`.** The digest copies
`variants` and `states` verbatim (`scripts/build-docs-digest.mjs:24-25`), so one
file carries every axis and allowed value. `llms.txt` is prose and **omits both
entirely** (`:39-46`) — a gate built on it would silently check nothing.

⟨rev⟩ Existence comes from `components.built`, which
`references/manifest-schema.md:262-263` names as the source of truth for it. The
first draft used `index.json` for both, which makes a real, built, *undocumented*
component a hard failure on correct code — the fastest possible route to this
gate being switched off. A built component with no doc record is an **advisory**
(`undocumented-component`), not a failure.

**2. The variant rule is scoped to matched axis names, measured, and floored —
and it is not what makes this gate worth shipping.** Given §1, `unknown-variant-value`
can only fire where an attribute name equals a declared axis name. That is a
convention this repo's own schema and skill contradict in their examples, so
coverage will often be zero.

Three consequences, all stated rather than discovered:

- An attribute matching no axis and no declared state is **counted and named**
  (`unmodelled-prop`, advisory). The gate never implies coverage it lacks.
- The report prints **axis coverage** — how many attributes on known components
  matched a declared axis, against how many did not.
- ⟨rev⟩ If coverage is **zero** while known components were found, the run
  **fails** (`variant-rule-inert`). A rule that checked nothing must not pass
  silently; see Decision 7.

⟨rev⟩ **And an honest note on redundancy.** In a TypeScript consumer whose
component package types its props, `variant="tertiary"` is already a compile
error. This rule's incremental value is confined to JavaScript consumers, props
typed as bare `string`, and repos where the design system is consumed across a
package boundary without types. **That is not the case for this gate.** The
colour rule is, and it is redundant with nothing.

**3. Flag a literal only where the system has a token for that exact value.**
`#3B82F6` where `color.brand.primary` resolves to `#3B82F6` is unambiguous drift
— the token exists and was not used. A hex matching *no* token is not
necessarily drift; it may be an illustration, a one-off marketing surface, a
third-party embed. Flagging every raw literal makes the gate noisy, and a noisy
gate gets switched off, which is the only failure mode that matters for a tool
nobody is forced to run.

**This is the gate's primary value in v1.** It is framework-agnostic, catches a
real and common drift, and no compiler catches it.

**4. Match against `packages/tokens/dtcg/tokens.json`, not build output.** Web
colour is emitted as space-separated channels (`--color-bg-default: 239 68 68;`,
`references/sync-adapters.md:205-208`), so a hex in source never string-matches
the CSS. `flattenDtcg` + `resolveValue` from `lib/dtcg.mjs` give dot-path →
resolved literal with alias chains followed.

⟨rev⟩ Three constraints the first draft left unstated:

- **`resolveValue` throws** on an unknown path and on a cycle. It is wrapped;
  a token that cannot be resolved is skipped and counted, never fatal. A gate
  that reports must not die mid-report.
- **`--tokens` is repeatable.** A real system spans mode files, which is why
  `findModeCollisions` exists at all. The value→token map is built across every
  file given, and a value held by more than one token names all candidates.
- **Hex on both sides, or no comparison.** A token whose `$value` is `rgb()`,
  `hsl()`, a named colour or a DTCG colour object is not compared, and neither is
  a non-hex literal in source. Both are counted and the counts are reported, so
  the blind spot is visible rather than silent.

**5. Extraction is regex over source files — the fourth member of an existing
family — and the shared walker is extracted first, in its own PR.**
`grep-color-usage.mjs` and `guard-token-removal.mjs` already scan a consumer repo
the same way: `--root`, a `walk` generator, `DEFAULT_EXCLUDES`, regex per file
type. No parser, no AST, no ESLint peer dependency — consistent with a project
that declares zero dependencies precisely so its gates install anywhere.

⟨rev⟩ Both define `DEFAULT_EXCLUDES` separately with identical bodies
(`grep-color-usage.mjs:41-50`, `guard-token-removal.mjs:16-25`), and a third copy
is exactly what #57 was filed for. But the extraction is **not** a no-op refactor:
both `walk`s are byte-identical *except* the file-extension filter, which sits
inside the loop (`SOURCE_EXT` vs `/\.tsx?$/`), and both `export` it. A shared
`walk` therefore takes a third parameter — a public API change to a script
`token-crosswalk-builder` copies into consumer repos
(`scripts/README.md:63`). Adding an import without adding `lib/source-scan.mjs`
to that copy list breaks it at import, the exact failure `scripts/README.md:78`
warns about. Phase 1 is its own PR with its own blast radius (§8).

**6. Every rule is separately gating or advisory, and the split is stated here
rather than discovered on upgrade.** This project shipped three breaking releases
in one week over gate/advisory lines. See §4.

**7. ⟨rev⟩ Every *enabled rule* must have had something to check, not just the
run as a whole.** `validate-token-output` encodes this as `matched > 0` in `ok`.
The first draft applied it once, globally, which left two holes: a missing or
empty `dtcg/tokens.json` silently disables the colour rule while the run stays
green on component matches, and an `index.json` where no component declares
`variants` silently disables the variant rule — which, given Decision 2, is the
*likely* steady state rather than a corner case.

So the check is per rule. A rule that had no input to work with fails the run and
names itself: `colour-rule-inert`, `variant-rule-inert`. A rule the caller
explicitly disabled with `--skip` is not inert, it is absent, and is reported as
skipped.

**8. Useful with no generation feature at all.** Pointed at a hand-written app,
the gate reports where that app has drifted. That is the shipping story, and why
#39 comes first: building it is what settles what "adherence" means before #41
generates anything against that definition.

## 4. The rules

| rule | verdict | fires when | scans |
|---|---|---|---|
| `unknown-component` | **failure** | a JSX element whose name is imported from `--package` and is not in `components.built` | `.tsx`, `.jsx` |
| `unknown-variant-value` | **failure** | an attribute whose name equals a declared variant axis, with a literal value not among that axis's keys | `.tsx`, `.jsx` |
| `token-exists-for-literal` | **failure** | a hex literal whose normalised value equals a token's resolved hex value | `.tsx`, `.jsx`, `.ts`, `.js`, `.css`, `.scss`, `.vue`, `.svelte` |
| `colour-rule-inert` | **failure** | no token file yielded a comparable hex value | — |
| `variant-rule-inert` | **failure** | known components were found and **no** attribute matched any declared axis | — |
| `undocumented-component` | advisory | in `components.built`, no record in `index.json`, so its variants cannot be checked | — |
| `unmodelled-prop` | advisory | an attribute on a known component matching no declared axis and no declared state | `.tsx`, `.jsx` |
| `dynamic-value` | advisory | an attribute whose value is not a literal (`variant={x}`), so it cannot be read | `.tsx`, `.jsx` |
| `uncomparable-colour` | advisory | a literal or a token value that is not hex, so Decision 4 declines to compare it | — |
| `no-token-for-literal` | **not reported in v1** | a hex matching no token — see Decision 3 | — |

⟨rev⟩ **Declared `states` keys count as known attribute names**, so `disabled` on
a component whose record declares `states.disabled` is not reported as
unmodelled. Their *values* are not checked — a state is not an enumerated value
set in the way a variant axis is.

⟨rev⟩ **The component and variant rules are JSX-only in v1.** A Vue or Svelte
consumer gets the colour rule and nothing else, which is why Decision 7 is per
rule: such a run must not fail for "no component references."

`token-exists-for-literal` covers #39's third *and* fourth rules — "a raw literal
where a token exists" and "ad-hoc CSS duplicating a token's value" are the same
check against the same table, differing only in file type. ⟨rev⟩ Colour only;
#39's rule 3 also names spacing, radius and type, and those are phase 3.

**Why colour only.** A token resolving to `16px` may legitimately appear as
`1rem`, `16px`, `1em` or a Tailwind step, and getting that comparison wrong in
either direction is worse than deferring it. Colour has one canonical
normalisation — lowercase, expand `#abc`, strip a trailing `ff` — and the
`rawHexRgba` pattern at `grep-color-usage.mjs:31` to build on.

## 5. Where the code lives

```
scripts/validate-adherence.mjs      the gate: extract, check, report, CLI
scripts/lib/source-scan.mjs         walk(root, excludes, fileFilter) + DEFAULT_EXCLUDES
```

Exported pure functions, mirroring `validate-token-output.mjs`:

- ⟨rev⟩ `extract(text, filename)` → `{ usages, literals }` — two collections, not
  one. A hex in a `.css` file has neither a component nor an attribute, so
  `[{ component, attr, value, line }]` alone cannot carry the colour rule.
  `usages` are `{ component, attr, value, line }`; `literals` are
  `{ value, line }`.
- `validate({ built, index, tokens, usages, literals })` → the result object
- `formatReport(r)` → `string[]`

The extraction/rules split matters beyond tidiness. Extraction is the fragile,
ecosystem-specific half; the rules are the stable half. Keeping them separate
means an ESLint rule or a TypeScript AST walk can drive the same rules later
without redesigning what adherence means.

## 6. CLI and output

```
node validate-adherence.mjs --root <dir> --system <dir> --package <specifier>
                            --tokens <file> [--tokens <file>...] [--skip <rule>]
```

- `--root` — the app source to scan.
- ⟨rev⟩ `--system` — the directory holding `design-system.json` and
  `design-system/docs/`. **Required, no default.** The first draft defaulted it
  to `--root`, which made §7's own install example resolve to
  `../../apps/design-system/docs/index.json` and fail on first run.
- ⟨rev⟩ `--package` — the npm specifier of the design system package, e.g.
  `@acme/ui`. Required by `unknown-component`, which fires on elements imported
  from it. Nothing in the manifest records this, so it is a flag.
- ⟨rev⟩ `--tokens` — repeatable; one per mode file. See Decision 4.
- ⟨rev⟩ `--skip <rule>` — replaces the first draft's `--min-usages`, which had no
  default, no semantics and, if `0` were permitted, would have defeated Decision 7
  by flag. A skipped rule is reported as skipped and does not gate.

Exit codes follow `validate-token-output.mjs`: **2** for any CLI or IO problem,
**1** when the result is not `ok`, **0** otherwise. `advisories` is deliberately
absent from the `ok` expression, as it is there.

`formatReport` returns lines:

```
tokens:validate-adherence — 47 usages, 118 colour literals, 12 files
  components: 9 of 11 built components referenced, 2 undocumented
  variant axes: 3 of 31 attributes matched a declared axis
  colour: 402 token values comparable, 6 skipped as non-hex

2 rule failure(s):
  - [token-exists-for-literal] #3b82f6 at app/hero.tsx:12 — color.brand.primary
    resolves to exactly this value
  - [unknown-variant-value] Card size="jumbo" at app/grid.tsx:44 — declared
    values for "size" are sm, md, lg

3 advisory note(s) — reported, not gating:
  - [unmodelled-prop] Button "variant" at app/checkout.tsx:31 — no declared axis
    or state of that name; the system models this component's axes as type, size
```

⟨rev⟩ That last advisory is the honest rendering of §1's problem, and the
coverage line above it (`3 of 31`) is what tells a maintainer their records and
their code disagree about names.

## 7. Install and wiring

Copied into the consumer's repo like every other gate, because a path inside the
plugin install is not reachable from the consumer's CI (`scripts/README.md:80-81`):

- `validate-adherence.mjs` → `packages/tokens/scripts/`
- `lib/source-scan.mjs`, `lib/dtcg.mjs` → `packages/tokens/scripts/lib/`

⟨rev⟩ Registered with every path explicit, since cwd is the package holding the
script:

```json
"adherence:check": "node scripts/validate-adherence.mjs --root ../../apps --system ../.. --package @acme/ui --tokens dtcg/tokens.json"
```

⟨rev⟩ Installed by **both** `storybook-chromatic-builder` and
`/document-component`, which `scripts/README.md:28-45` establishes install the
same set and register the same scripts — and which closes with the instruction
that a refresh adding a file must also add its npm script. `scripts/README.md`'s
install-as-a-set table gains a row; the skills do not restate it.

⟨rev⟩ Phase 1 adds `lib/source-scan.mjs` to `token-crosswalk-builder`'s copy list
as well, because `guard-token-removal.mjs` ships there and will import it.

**CI wiring stays prose**, consistent with every existing gate: no workflow
template ships to consumers today, and this is not the change that introduces one.

## 8. Phasing

1. **Extract `lib/source-scan.mjs`.** ⟨rev⟩ Its own PR. It changes an exported
   `walk`'s signature in two scripts, one of which ships to consumers, and it
   edits a skill's copy list. Different blast radius from the gate; reviewable
   on its own.
2. **The gate, colour first.** `token-exists-for-literal` plus
   `unknown-component`, `unknown-variant-value` and the advisories. Shippable.
3. **Dimensions**, once colour has run against a real app and the false-positive
   rate is known rather than guessed.
4. **A real props block in the doc record**, if the coverage line from phase 2
   shows the axis convention does not hold in practice. Its own issue, its own
   spec — the schema has a fingerprint, a projection table and four consumers.

## 9. Testing

Unit tests in the house style — pure functions, fixtures inline:

- an unknown variant value fails; a declared one does not
- an attribute matching no axis is an advisory and does **not** affect `ok`
- a declared **state** name is not reported as unmodelled
- a hex equal to a token's resolved value fails; a hex matching no token is silent
- an aliased hex resolves through the chain and still matches
- `#ABC`, `#aabbcc`, `#AABBCCFF` normalise to one value
- a token whose `$value` is `rgb(...)` is counted uncomparable, not compared
- ⟨rev⟩ an unresolvable or circular token reference is **skipped and counted**,
  and does not throw
- ⟨rev⟩ a built component with no doc record is an advisory, not a failure
- **no `index.json` exits non-zero**, naming `docs:digest`
- ⟨rev⟩ **no comparable token value exits non-zero** (`colour-rule-inert`)
- ⟨rev⟩ **known components found and zero axis matches exits non-zero**
  (`variant-rule-inert`) — the test that keeps Decision 2 from becoming a rule
  that cannot fail
- ⟨rev⟩ a Vue-only repo running colour-only **passes**, and is not failed for
  having no component references

**And one end-to-end run before it ships**, against a real app rather than
fixtures. Every gate in this project verified only at the unit layer has been
wrong about what it emits. ⟨rev⟩ The number to record from that run is the
**axis coverage ratio** — it is the measurement that decides whether phase 4 is
needed, and the first draft's claim that the convention was "worth measuring"
was treating as open a question this repo's own documents already answer in the
negative.

## 10. Non-goals

- **Parsing.** No AST, no ESLint plugin, no TypeScript compiler. Decision 5.
- **The Figma side.** #40.
- **Composition.** #41, #42. This gate is what makes those safe to build.
- **Fixing drift.** The gate reports; it does not rewrite the user's code.
- **A props block in the doc record.** Phase 4, its own issue.
- **A CI workflow template.** §7.
- ⟨rev⟩ **Non-JSX component analysis.** Vue and Svelte get the colour rule only.

## 11. Risks and open items

**A noisy gate gets switched off.** The existential risk; Decision 3 is the
mitigation. If phase 2 produces false positives against a real app, narrow the
rule — do not downgrade it to an advisory and call it shipped.

**Regex extraction has real limits, stated here rather than discovered.** Spread
props (`<Button {...props} />`), aliased imports (`import { Button as Btn }`),
computed values, and components rendered through a variable will not be seen. The
`dynamic-value` advisory reports the size of that blind spot instead of implying
full coverage.

⟨rev⟩ **The variant rule may be worth nothing in a given repo, and the gate now
says so instead of hoping.** If the axis-naming convention does not hold, the
coverage line reads `0 of N` and the run fails as `variant-rule-inert`. That is
the intended behaviour: loud and answerable, not silently green.

**A repo with no doc records gets no variant coverage.** Decision 7 makes it
loud. The deeper answer is that this gate's usefulness is bounded by
documentation coverage — itself a reason to run it, since the report names what
is undocumented.

⟨rev⟩ **Colour tokens authored as non-hex reduce the gate to nothing quietly.**
`uncomparable-colour` counts them and the headline prints the comparable total,
so a system authored entirely in `hsl()` fails as `colour-rule-inert` rather than
passing green. Whether to normalise `rgb()`/`hsl()` into hex is a phase 3
question; doing it wrong is worse than declining.
