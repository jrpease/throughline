# ThroughLine scripts

The executable analog of `references/`: canonical, vetted, **zero-dependency** Node
(ESM) scripts that the brownfield skills install into a user's monorepo. Authored and
tested here; copied verbatim by `token-crosswalk-builder` into the user's
`packages/tokens/scripts/`.

| Script | Purpose | Installed as |
| --- | --- | --- |
| `validate-crosswalk.mjs` | Resolve every `newToken` against the DTCG token source; assert resolved value == `newValue`, N/N. The CI gate. | `tokens:validate` |
| `build-reverse-index.mjs` | Emit a `codeToken -> newToken` map from the crosswalk to semi-automate SCSS/Tailwind swaps. | `tokens:reverse-index` |
| `guard-token-removal.mjs` | Grep `.ts/.tsx` (minus generated + tests) for about-to-be-deleted symbols; blocks cleanup until zero references remain. | run during the cleanup phase |
| `validate-token-output.mjs` | Assert generated token output — Swift, Kotlin, or web CSS custom properties — matches its DTCG source: authored-unit fidelity, no leaked CSS syntax, no bare unit literals, no mode collisions. Fails when no emitted symbol matches a source token, and reports match rate, unparsed lines, and unemitted tokens on every run. | `tokens:validate-output` |
| `validate-adherence.mjs` | Assert the code *consuming* a design system still adheres to it: every referenced component exists, every literal variant value is one the system declares, and no colour, spacing, radius or type literal duplicates a token that already holds that value. Fails when an enabled rule had nothing to check, so a green run always means something was verified. | `adherence:check` |
| `lib/source-scan.mjs` | Shared source-tree walker (`walk`, `DEFAULT_EXCLUDES`, `SOURCE_EXT`) plus `normalizeName`, the display-name-to-code-identifier fold. Every gate that scans a consumer's repo reads it from here rather than carrying its own copy. | copied alongside `guard-token-removal.mjs` |
| `lib/crosswalk.mjs` | Shared loader + structural validation for `crosswalk.json` (used by the validator and reverse-index). | copied alongside |
| `lib/dtcg.mjs` | Shared DTCG flatten + `{alias}` resolution. Dual-node aware: a node carrying both a `$value` and children yields its own value **and** is descended into. Used by `validate-crosswalk.mjs`, `validate-token-output.mjs`, `validate-adherence.mjs`, and `lib/sd-native.mjs`. | copied alongside each of those |
| `lib/sd-native.mjs` | The Style Dictionary native configuration as code: unit-aware dimension transforms, `color-mix` computation, dual-node preprocessing, platform assembly, and a per-mode source guard. Style Dictionary is a parameter, never an import. | copied alongside `validate-token-output.mjs` |
| `lib/native-literal.mjs` | Shared grammar for "is this a well-formed Swift or Kotlin literal": parses rather than pattern-matches, so an unquoted string, a raw CSS function, or any other unanticipated case fails the same way. Used by `sd-native.mjs`'s output filter and by `validate-token-output.mjs`'s invalid-literal rule. | copied alongside `validate-token-output.mjs` and `lib/sd-native.mjs` |
| `crosswalk.schema.json` | The finalized JSON Schema for `crosswalk.json` (contract + editor support). | copied beside `crosswalk.json` |
| `build-docs-digest.mjs` | Aggregate every `design-system/docs/components/*.doc.json` into `design-system/docs/index.json` + `llms.txt` for AI/human consumers. | `docs:digest` |
| `docs-check.mjs` | Drift gate — verifies each component's doc surfaces still match its canonical record (via `lib/doc-record.mjs` fingerprints). Exits 1 on drift. | `docs:check` |
| `docs-lint.mjs` | Copy lint for .doc.json records — warnings only, always exits 0 on a parseable record; the mechanical subset of `references/doc-writing-standard.md`. | `docs:lint` |
| `lib/doc-record.mjs` | Canonical record load + `canonicalFingerprint` (sha256 over the record minus `provenance`). The fingerprint every surface is stamped with. | copied alongside docs-check.mjs |
| `lib/doc-card-render.figma.js` | Figma renderer template for the doc card's `Usage` band and header. Inlined into `references/doc-card-builder.md`; never executed as a module. | plugin-internal (not installed) |
| `lib/doc-card-plan.mjs` | Pure layout planner for the doc card's `Usage` band + `DOC_CARD_RENDERER_VERSION` (single source of the layout version). Inlined into `references/doc-card-builder.md`; imported by `docs-check.mjs`. | copied alongside docs-check.mjs; also inlined into the generated builder |
| `verify-check.mjs` | The verification proof bundle: records each stage's entry, and re-derives what it can rather than trusting the record. Fails on an orphaned token, a component documented without its archetype's baseline interaction states, a name that drifts between the manifest, its record and its code surface, or a recorded result the rerun contradicts. | `verify:check` |
| `lib/proof.mjs` | The proof store's vocabulary and mechanics: the stage list, entry validation, latest-wins merge, and the fingerprint the manifest pointer carries. | copied alongside `verify-check.mjs` |
| `lib/component-states.mjs` | The archetype table and resolver behind `state-incomplete` — which baseline interaction states each kind of component owes, and when to abstain. | copied alongside `verify-check.mjs` |
| `build-doc-card-builder.mjs` | Generate `references/doc-card-builder.md` from the planner + the Figma renderer template (`lib/doc-card-render.figma.js`). `--check` gates CI. | plugin-internal (not installed) |
| `build-native-adapter-config.mjs` | Generate `references/native-adapter-config.md` by slicing `lib/sd-native.mjs` on its `@doc-section` markers and interleaving each fragment under its prose. Fails when module code falls outside every section, so the doc cannot silently ship incomplete. `--check` gates CI. | plugin-internal (not installed) |

**Documentation scripts — install as a set.** Copying these files without
registering them leaves a repo with a script on disk and no entry point, which
is how a stale `docs:check` went unnoticed for a full release. Both
`storybook-chromatic-builder` (first-time setup) and `/document-component`
(freshness refresh) install the same eleven files and register the same five
scripts:

| File | npm script |
| --- | --- |
| `build-docs-digest.mjs` | `"docs:digest": "node scripts/build-docs-digest.mjs"` |
| `docs-check.mjs` | `"docs:check": "node scripts/docs-check.mjs"` |
| `docs-lint.mjs` | `"docs:lint": "node scripts/docs-lint.mjs"` |
| `lib/doc-record.mjs` | — (imported by the above) |
| `lib/doc-card-plan.mjs` | — (imported by the above) |
| `validate-adherence.mjs` | `"adherence:check": "node scripts/validate-adherence.mjs --root ../../apps --system ../.. --package <specifier> --tokens dtcg/tokens.json"` |
| `lib/source-scan.mjs` | — (imported by the above) |
| `lib/dtcg.mjs` | — (imported by the above) |
| `verify-check.mjs` | `"verify:check": "node scripts/verify-check.mjs --root ../.. --tokens dtcg/tokens.json"` |
| `lib/proof.mjs` | — (imported by the above) |
| `lib/component-states.mjs` | — (imported by the above) |

A refresh that adds a file must also add its npm script; check `package.json`
for all five npm scripts every time, not just the file that changed.

`verify:check`, like `adherence:check`, carries placeholder paths the installing
skill substitutes for the repo's real layout. Dropping `--tokens` rather than
substituting it is how a repo ends up with a rule that never runs: with no token
source there is nothing to read, so the gate reports `orphan-token` as skipped on
every run — #110's first stop condition, disabled by its own registration.

The crosswalk contract is documented in
`${CLAUDE_PLUGIN_ROOT}/references/crosswalk-schema.md`.

## Usage

```bash
node validate-crosswalk.mjs --crosswalk crosswalk.json --tokens dtcg/tokens.json
node build-reverse-index.mjs --crosswalk crosswalk.json --out crosswalk.reverse.json
node guard-token-removal.mjs --root . --symbols symbols-to-remove.txt
node validate-adherence.mjs --root ../../apps --system ../.. --package @acme/ui --tokens dtcg/tokens.json
node validate-token-output.mjs --source dtcg/primitives.json --source dtcg/semantic.dark.json --output css/tokens.css --platform shadcn --block .dark --min-match 1
node verify-check.mjs --root ../.. --tokens dtcg/tokens.json
node verify-check.mjs --record --stage component-builder --subject Button --entry entry.json
```

`validate-adherence.mjs` takes every path explicitly because cwd is the package
holding the script, not the repo root. `--system` has no default: defaulting it
to `--root` resolves to a path that does not exist. `--tokens` is repeatable, so
a system whose values span mode files passes each one. An alias resolves against
every `--tokens` file, so a semantic file can point at primitives in another, and
the report's `colour:` line counts the colour tokens it skipped as unresolvable or
non-hex. Files inside the package
that owns a `--tokens` file are not scanned when that package sits beneath
`--root`, and the report prints an `excluded:` line naming it. A tag whose name
starts with a built component's name and continues with a capital letter
(`CardTitle` for `Card`) is read as part of that component, and the report lists
each one on a `parts:` line. `--skip <rule>`
switches a rule off entirely — a skipped rule is absent rather than inert, which
is the supported answer for a repo the rule cannot apply to (a Vue or Svelte app
has no JSX for the component rules to read). `--skip token-exists-for-dimension`
is the answer for a system with no spacing, radius or type tokens, which
otherwise fails as `dimension-rule-inert`.

`validate-token-output.mjs` reads web output as CSS custom properties for
`--platform shadcn`, `tailwind` and `vanilla-css`. `mui` exits `2`: a MUI theme,
like a Tailwind v3 JavaScript config, has no custom properties to read, and
isn't checked yet (#127). Web puts every mode in one file, so run the gate once
per mode block, passing the sources that block was built from. `--block` names
the block by its enclosing at-rules and selector, joined by single spaces:
`:root`, `.dark`, `[data-theme="light"]`, `@media (min-width: 768px) :root`,
`@theme inline`. A file with one block needs no `--block`. A file with several,
or a `--block` that isn't there, exits `2` and lists every block with its
declaration count, so the exact key is in the error. A build split across files
passes each one as another `--output`: everything declared in any of them counts
as declared, and a token declared in any block counts as emitted. Six rules fail
a web run:

- `unit-fidelity` — the value changed magnitude, or a ratio gained a unit, or a
  length lost one (`16` → `16rem`, `1.1` → `1.1rem`, `16px` → `16`). `16` →
  `1rem` passes.
- `reference-fidelity` — a declaration's `var()`s don't name the tokens its
  source references.
- `dangling-reference` — a `var()` to a variable no `--output` declares, unless
  the source wrote that `var()` itself.
- `no-unresolved-reference` — a `{reference}` reached the CSS unresolved.
- `invalid-value` — `[object Object]`, `NaN` or `undefined` was written into the
  CSS.
- `unverifiable-dimension` — a dimension came out in a form the gate can't
  compare, so it was never checked.

Nothing fails for being CSS: `var()`, `calc()`, `color-mix()` and units are all
legal output. On `shadcn` and `tailwind`, a declaration with no source token
whose whole value is a `var()` to a declared variable is an alias layer
(`--background: var(--color-bg-canvas)`). The report counts aliases on their own
line and leaves them out of the match rate, so `--min-match 1` still holds.

`verify-check.mjs` has two modes. The **gate** — `--root <dir>`, repeatable
`--tokens` and `--source`, repeatable `--skip` — reads the proof store at
`design-system/proof/`, re-derives every check a stage recorded as `derived`, and
fails on `orphan-token`, `state-incomplete`, `name-drift`, `proof-missing`,
`proof-stale`, `proof-contradicted`, `nothing-verified` and `orphan-rule-inert`.
`archetype-unknown` and `proof-unadopted` are informational. With no `--source`
the walk covers `--root`; the package that owns a `--tokens` file is set aside
either way, and the report prints an `excluded:` line naming it — without that,
generated token output binds every semantic token to itself and `orphan-token`
can never fire. The **recorder** — `--record --stage <name> [--subject <Name>]
--entry <file.json>` — merges one entry into that stage's file, recomputes its
fingerprint and stamps the manifest's `verification` pointer. Skills call it;
nothing hand-writes the store or hand-computes a hash.

`--skip <rule>` switches a rule off entirely, and a skipped rule is absent rather
than inert. With no `--tokens` there is no token source to read, so
`orphan-token` is reported as skipped rather than passed. The orphan rule counts
a token as bound when its normalized key appears anywhere in a scanned file, so
`color.bg.primary` is bound by a mention of `color.bg.primary.hover`: every miss
is an orphan reported as bound, never a correct system failed. A `derived` check
is one the gate recomputes off disk, and its recorded result is a cache that must
agree — a disagreement is `proof-contradicted`. An `attested` check is an agent's
live observation of something the CLI cannot read, printed informationally and
never the reason a run passes. See
`${CLAUDE_PLUGIN_ROOT}/references/proof-bundle.md`.

Exit codes: `0` success, `1` validation/guard failure (mismatch, missing token,
conflict, or remaining reference), `2` bad CLI arguments.

## How the skill installs these

`token-crosswalk-builder` copies `lib/crosswalk.mjs`, `lib/dtcg.mjs`,
`lib/source-scan.mjs`, `validate-crosswalk.mjs`, `build-reverse-index.mjs`,
`guard-token-removal.mjs`, and
`crosswalk.schema.json` into the user's `packages/tokens/scripts/` (schema beside `crosswalk.json`), then
wires `packages/tokens/package.json`:

```jsonc
"scripts": {
  "tokens:validate": "node scripts/validate-crosswalk.mjs --crosswalk crosswalk.json --tokens dtcg/tokens.json",
  "tokens:reverse-index": "node scripts/build-reverse-index.mjs --crosswalk crosswalk.json --out crosswalk.reverse.json"
}
```

`token-sync-layer` copies `validate-token-output.mjs`, `lib/dtcg.mjs`,
`lib/native-literal.mjs`, **and** `lib/sd-native.mjs`, and wires
`"tokens:validate-output"`. All four travel together: `sd-native.mjs` and the
validator both import `lib/dtcg.mjs` and `lib/native-literal.mjs`, so
installing any one of them alone breaks at import time.

The scripts version with the user's repo so their CI runs them locally — a path
inside the plugin install would not be reachable from the user's CI.

## Tests

Run the suite from the repo root (no install step — uses only Node built-ins):

```bash
node --test
```

This auto-discovers every `**/*.test.mjs` recursively. Don't use
`node --test scripts/` — a directory positional is treated as a test name on
Node >=21 and errors; a `scripts/*.test.mjs` glob silently skips `scripts/lib/`.

## Multi-agent adapters (`scripts/adapters/`)

`SKILL.md`/`commands`/`.mcp.json` are the canonical source. Generated Cursor,
Codex, and generic-AGENTS.md adapters live in `adapters/<target>/` and are
committed. After editing any skill or command, regenerate:

    node scripts/adapters/generate.mjs

CI runs `node scripts/adapters/generate.mjs --check` and fails if the committed
`adapters/` tree is stale. Never hand-edit files under `adapters/` — edit the
source and regenerate.

Users install a target into their own project with the installer, which copies
the committed `adapters/<target>/` tree plus the runtime payload
(`references/` + `scripts/`, minus `scripts/adapters/`) into `.throughline/`,
rewriting `${CLAUDE_PLUGIN_ROOT}` → `.throughline`:

    npx @radicool/throughline init --target=cursor|codex|generic

See `scripts/install.mjs` (pure core + CLI + `install.test.mjs`).

## Documentation scripts

`docs:digest` and `docs:check` operate on the folder-resident documentation store
at `design-system/docs/`. Both share `lib/doc-record.mjs` (record loading +
fingerprinting). `docs:check` re-reads repo surfaces (Storybook MDX); Figma
surfaces are marked `edit-unverified` and are checked live by the Figma-connected
skills. See `${CLAUDE_PLUGIN_ROOT}/references/component-doc-schema.md` for the
record schema and fingerprint contract.
