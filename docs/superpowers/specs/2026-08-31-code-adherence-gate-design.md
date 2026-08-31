# Code adherence gate — design

**Date:** 2026-08-31
**Status:** Proposed
**Issue:** #39, keystone of the consumption-layer epic (#39–#44)

> **Origin.** #39 proposes a zero-dependency gate that fails a build when code
> using a design system has drifted from it. Before writing this, the records
> the gate would read were surveyed. **Two of the issue's four rules assume data
> that does not exist**, and one of them cannot be built as written. The
> correction is §1; everything after it is designed against what the records
> actually hold.

## 1. What the issue assumes, and what the records hold

#39's rules, checked against the schema:

| Rule as written | Buildable? |
|---|---|
| every component referenced exists in the system | **yes** — `index.json` `components[].name`, and `design-system.json` `components.built` |
| every prop/variant value is in that component's declared set | **partly, and much less than it sounds** |
| no raw color/spacing/radius/type literals where a token exists | **yes, with a narrowing** |
| no ad-hoc CSS that duplicates a token's value | **the same rule as above**, not a separate one |

**There is no `props` field in a component doc record.** Not in
`references/component-doc-schema.md`, not in the archetypes, not in
`scripts/lib/doc-record.mjs`. The only enumerated value sets anywhere are the
**keys** of `variants.<axis>` and of `states`:

```json
"variants": { "type": { "primary": "…", "secondary": "…", "ghost": "…" },
              "size": { "sm": "…", "md": "…", "lg": "…" } },
"states":   { "hover": "…", "disabled": "…" }
```

So a boolean prop, a slot, an event handler, a prop with a free-form string
value — none has a declared set, and the gate cannot say anything about them.

Worse for the rule as written: **nothing asserts that a variant axis name is the
code component's prop name.** `skills/storybook-chromatic-builder/SKILL.md:80`
states it as a convention — "variant matrices (type/size/state) become the
component's props/variants" — and no record, no manifest field and no check
enforces it. A gate that reads `variants.type` and then inspects a `type={...}`
prop is trusting a convention, not a contract.

That is the single most important finding here, and §3's Decision 2 is the
response to it.

## 2. Problem

ThroughLine builds design systems and has no way to verify that code *using* one
adheres to it. The failure is specific and it is getting more likely, not less:
an agent composing a screen will write `variant="tertiary"` where only
`primary`/`secondary` exist, `padding: 13px` against a 4/8/12/16 scale, or
`#3B82F6` where `color.brand.primary` holds exactly that value.

#39's own framing is the right one and worth keeping verbatim: **a good
inventory is necessary and not sufficient.** `docs:digest` already produces one.
A perfect inventory still gets ignored under pressure, so adherence has to be
*verified*, not requested.

This repo has the precedent. `validate-token-output.mjs` exists because the sync
step's own verification passed output that was half wrong. Same shape here, one
layer out: the system is correct, and the code using it drifts.

## 3. Decisions

**1. Read `design-system/docs/index.json`, not the records and never
`llms.txt`.** The digest copies `variants` and `states` verbatim
(`scripts/build-docs-digest.mjs:24-25`), so one file carries every component
name, every variant axis and every allowed value. `llms.txt` is prose and
**omits variants and states entirely** (`:39-46`) — a gate built on it would
silently check nothing. Reading `index.json` also means the gate stays correct
when records move, and it gives one obvious failure mode when `docs:digest` has
not been run.

**2. Narrow rule 2 to variant axes, treat the axis name as the prop name, and
report an unrecognised prop rather than judging it.** Given §1, the honest
version of "every prop/variant value is in that component's declared set" is:

- a JSX attribute whose name matches a declared variant axis **is** checked
  against that axis's keys — an unknown value is a failure;
- an attribute matching no axis is **not** checked and **not** condemned. It may
  be a legitimate prop the system does not model. It is counted, and the count
  is reported, so the gate never implies coverage it does not have.

The alternative — extend the doc record with a real props block (types,
defaults, required) — is a larger change to a schema with a fingerprint, a
projection table and four consumers. It belongs in its own issue, and this gate
should not wait for it.

**3. Flag a literal only when the system has a token for that exact value.**
This is what makes the rule survivable. `#3B82F6` where `color.brand.primary`
resolves to `#3B82F6` is unambiguous drift — the token exists and was not used.
A hex matching *no* token is not necessarily drift; it may be an illustration, a
one-off marketing surface, a third-party embed. Flagging every raw literal makes
the gate noisy, and a noisy gate gets switched off — which is the only failure
mode that matters for a tool nobody has to run.

**4. Match values against `packages/tokens/dtcg/tokens.json`, not against build
output.** Web colour output is emitted as space-separated channels
(`--color-bg-default: 239 68 68;`, `references/sync-adapters.md:210-213`), so a
hex in source will never string-match the CSS. `flattenDtcg` + `resolveValue`
from `lib/dtcg.mjs` give dot-path → resolved literal with alias chains followed,
and both are already installed beside the gate that will consume them.

**5. Extraction is regex over source files — the fourth member of an existing
family — and the shared walker gets extracted rather than copied a third time.**
`grep-color-usage.mjs` and `guard-token-removal.mjs` already scan a consumer
repo with the same shape: `--root`, a `walk` generator, `DEFAULT_EXCLUDES`,
regex per file type, exported pure functions plus a CLI. No parser, no AST, no
ESLint peer dependency — consistent with a project that declares zero
dependencies precisely so its gates install anywhere.

Both existing scanners define `DEFAULT_EXCLUDES` **separately**. A third copy is
exactly the drift #57 was filed for. `walk` and the exclude list move to
`lib/source-scan.mjs` and all three import it.

**6. Every rule is separately gating or advisory, and the split is stated here
rather than discovered on upgrade.** This project has shipped three breaking
releases in one week over gate/advisory lines. See §4.

**7. A run that verified nothing must not exit 0.** `validate-token-output`
already encodes this as `matched > 0` in its `ok` expression. If the gate finds
no `index.json`, or an `index.json` with no components, or scans a root where no
file references any known component, it must fail and say so. A green run that
checked nothing is the failure class this repo keeps filing issues about.

**8. Useful with no generation feature at all.** Pointed at a hand-written app,
the gate reports where that app has drifted. That is the shipping story, and it
is why #39 comes first: it is independently valuable, and building it is what
settles what "adherence" means before #41 generates anything against that
definition.

## 4. The rules

Read from `index.json`, `design-system.json` and `dtcg/tokens.json`; checked
against usages extracted from source under `--root`.

| rule | verdict | fires when |
|---|---|---|
| `unknown-component` | **failure** | a JSX element whose name matches a component-shaped identifier imported from the system package, and which is not in `index.json` |
| `unknown-variant-value` | **failure** | an attribute whose name is a declared variant axis for that component, with a literal value not among that axis's keys |
| `token-exists-for-literal` | **failure** | a colour literal whose normalised value equals a token's resolved value |
| `unmodelled-prop` | **advisory** | an attribute on a known component matching no declared axis — counted and named, never judged |
| `dynamic-value` | **advisory** | an attribute whose value is not a literal (`variant={x}`), so the gate cannot see it |
| `no-token-for-literal` | **not reported in v1** | a colour literal matching no token — see Decision 3 |

`token-exists-for-literal` covers #39's third *and* fourth rules: "a raw literal
where a token exists" and "ad-hoc CSS duplicating a token's value" are the same
check against the same table, differing only in which file types are scanned.

**Colour only in v1.** Dimensions are deferred to phase 2 (§8): a token
resolving to `16px` may legitimately appear in code as `1rem`, `16px`, `1em` or
a Tailwind step, and getting that comparison wrong in either direction is worse
than not making it yet. Colour has one canonical normalisation (lowercase hex,
expand `#abc`, strip a `ff` alpha) and the existing `rawHexRgba` pattern in
`grep-color-usage.mjs:31` to build on.

## 5. Where the code lives

```
scripts/validate-adherence.mjs      the gate: extract, check, report, CLI
scripts/lib/source-scan.mjs         walk + DEFAULT_EXCLUDES, extracted from
                                    grep-color-usage.mjs and guard-token-removal.mjs
```

Exported pure functions, mirroring `validate-token-output.mjs` so the two read
alike:

- `extractUsages(text, filename)` → `[{ component, attr, value, line }]`
- `validate({ index, manifest, tokens, usages })` → the result object
- `formatReport(r)` → `string[]`

The extraction/rules split matters beyond tidiness. Extraction is the fragile,
ecosystem-specific half; the rules are the stable, valuable half. Keeping them
separate means an ESLint rule or a TypeScript AST walk can drive the same rules
later without redesigning what adherence means.

## 6. CLI and output

```
node validate-adherence.mjs --root <dir> [--system <dir>] [--min-usages <n>]
```

`--system` defaults to `--root`; it exists for a monorepo where the app and the
design system sit in different packages.

Exit codes follow `validate-token-output.mjs` exactly: **2** for any CLI or IO
problem, **1** when the result is not `ok`, **0** otherwise. `advisories` is
deliberately absent from the `ok` expression, as it is there.

`formatReport` returns lines, headline first:

```
tokens:validate-adherence — 47 usages across 12 files, 9 components matched

3 rule failure(s):
  - [unknown-variant-value] Button variant="tertiary" at app/checkout.tsx:31 —
    declared values for "variant" are primary, secondary, ghost
  - [token-exists-for-literal] #3b82f6 at app/hero.tsx:12 — color.brand.primary
    resolves to exactly this value

2 advisory note(s) — reported, not gating:
  - [unmodelled-prop] Button "elevated" at app/nav.tsx:8 — no declared variant
    axis of that name; the system does not model this prop
```

## 7. Install and wiring

Copied into the consumer's repo like every other gate, because a path inside the
plugin install is not reachable from the consumer's CI
(`scripts/README.md:92-93`):

- `validate-adherence.mjs` → `packages/tokens/scripts/`
- `lib/source-scan.mjs`, `lib/dtcg.mjs` → `packages/tokens/scripts/lib/`
- register `"adherence:check": "node scripts/validate-adherence.mjs --root ../../apps"`

Installed by `storybook-chromatic-builder`, beside `docs:check` — that skill
already installs the docs set and already owns the "wire this into CI" step.
`scripts/README.md`'s install-as-a-set table gains a row; the skills do not
restate it.

**CI wiring stays prose**, consistent with every existing gate: no workflow
template ships to consumers today, and this is not the change that should
introduce one.

## 8. Phasing

1. **Extract `lib/source-scan.mjs`** and point the two existing scanners at it.
   No behaviour change; it is a prerequisite, and it closes the third-copy risk
   before the copy is made.
2. **The gate, colour only**, with `unknown-component`, `unknown-variant-value`,
   `token-exists-for-literal` and the two advisories.
3. **Dimensions**, once colour has run against a real app and the false-positive
   rate is known rather than guessed.
4. **A real props block in the doc record**, if usage shows the variant-axis
   narrowing is too thin. Its own issue, its own spec.

Phase 2 is the shippable unit.

## 9. Testing

Unit tests in the house style — pure functions, fixtures inline. The ones that
have to exist:

- an unknown variant value fails; a declared one does not
- an attribute matching no axis is an advisory and does **not** affect `ok`
- a hex equal to a token's resolved value fails; a hex matching no token is
  silent in v1
- an aliased hex (`{color.brand.primary}` → `#3b82f6`) resolves through the
  chain and still matches
- `#ABC`, `#aabbcc`, `#AABBCCFF` all normalise to one value
- **no `index.json` exits non-zero**, and says `docs:digest` has not been run
- **zero usages found exits non-zero** — Decision 7, and the test that keeps this
  gate from becoming one that cannot fail

**And one end-to-end run before it ships**, against a real app rather than
fixtures. Every gate in this project that was verified only at the unit layer
has been wrong about what it emits; the discipline here is to check at the layer
the user sees.

## 10. Non-goals

- **Parsing.** No AST, no ESLint plugin, no TypeScript compiler. Decision 5.
- **The Figma side.** #40.
- **Composition.** #41, #42. This gate is what makes those safe to build; it is
  not part of them.
- **Fixing drift.** The gate reports; it does not rewrite the user's code.
- **A props block in the doc record.** Phase 4, its own issue.
- **A CI workflow template.** §7.

## 11. Risks and open items

**A noisy gate gets switched off.** This is the existential risk and Decision 3
is the main mitigation. If phase 2 produces false positives against a real app,
the answer is to narrow the rule, not to downgrade it to an advisory and call it
shipped.

**Regex extraction has real limits, and they must be stated in the module rather
than discovered.** Spread props (`<Button {...props} />`), aliased imports
(`import { Button as Btn }`), computed values, and components rendered through a
variable will not be seen. The `dynamic-value` advisory exists so the gate
reports the size of its own blind spot instead of implying full coverage.

**The axis-name-is-prop-name convention is unverified.** §1. If it does not hold
in a real repo, `unknown-variant-value` under-fires silently. Worth measuring in
the phase 2 e2e: how many attributes matched an axis, versus how many were
counted as unmodelled.

**A repo with no doc records gets no coverage.** Decision 7 makes that loud, but
the deeper answer is that this gate's usefulness is bounded by documentation
coverage — which is itself a reason to run it, since the report names exactly
what is undocumented.

**Monorepo layout is assumed, not detected.** `--system` defaulting to `--root`
covers the single-package case; anything else needs the flag. If that proves
awkward, read the path from `design-system.json` rather than adding more flags.
