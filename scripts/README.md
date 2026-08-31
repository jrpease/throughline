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
| `validate-token-output.mjs` | Assert generated native token output matches its DTCG source: authored-unit fidelity, no leaked CSS syntax, no bare unit literals, no mode collisions. Fails when no emitted symbol matches a source token, and reports match rate, unparsed lines, and unemitted tokens on every run. | `tokens:validate-output` |
| `validate-adherence.mjs` | Assert the code *consuming* a design system still adheres to it: every referenced component exists, every literal variant value is one the system declares, and no colour literal duplicates a token that already holds that value. Fails when an enabled rule had nothing to check, so a green run always means something was verified. | `adherence:check` |
| `lib/source-scan.mjs` | Shared source-tree walker (`walk`, `DEFAULT_EXCLUDES`, `SOURCE_EXT`) plus `normalizeName`, the display-name-to-code-identifier fold. Every gate that scans a consumer's repo reads it from here rather than carrying its own copy. | copied alongside `guard-token-removal.mjs` |
| `lib/crosswalk.mjs` | Shared loader + structural validation for `crosswalk.json` (used by the validator and reverse-index). | copied alongside |
| `lib/dtcg.mjs` | Shared DTCG flatten + `{alias}` resolution. Dual-node aware: a node carrying both a `$value` and children yields its own value **and** is descended into. Used by `validate-crosswalk.mjs` and `validate-token-output.mjs`. | copied alongside both |
| `lib/sd-native.mjs` | The Style Dictionary native configuration as code: unit-aware dimension transforms, `color-mix` computation, dual-node preprocessing, platform assembly, and a per-mode source guard. Style Dictionary is a parameter, never an import. | copied alongside `validate-token-output.mjs` |
| `lib/native-literal.mjs` | Shared grammar for "is this a well-formed Swift or Kotlin literal": parses rather than pattern-matches, so an unquoted string, a raw CSS function, or any other unanticipated case fails the same way. Used by `sd-native.mjs`'s output filter and by `validate-token-output.mjs`'s invalid-literal rule. | copied alongside `validate-token-output.mjs` and `lib/sd-native.mjs` |
| `crosswalk.schema.json` | The finalized JSON Schema for `crosswalk.json` (contract + editor support). | copied beside `crosswalk.json` |
| `build-docs-digest.mjs` | Aggregate every `design-system/docs/components/*.doc.json` into `design-system/docs/index.json` + `llms.txt` for AI/human consumers. | `docs:digest` |
| `docs-check.mjs` | Drift gate — verifies each component's doc surfaces still match its canonical record (via `lib/doc-record.mjs` fingerprints). Exits 1 on drift. | `docs:check` |
| `docs-lint.mjs` | Copy lint for .doc.json records — warnings only, always exits 0 on a parseable record; the mechanical subset of `references/doc-writing-standard.md`. | `docs:lint` |
| `lib/doc-record.mjs` | Canonical record load + `canonicalFingerprint` (sha256 over the record minus `provenance`). The fingerprint every surface is stamped with. | copied alongside docs-check.mjs |
| `lib/doc-card-render.figma.js` | Figma renderer template for the doc card's `Usage` band and header. Inlined into `references/doc-card-builder.md`; never executed as a module. | plugin-internal (not installed) |
| `lib/doc-card-plan.mjs` | Pure layout planner for the doc card's `Usage` band + `DOC_CARD_RENDERER_VERSION` (single source of the layout version). Inlined into `references/doc-card-builder.md`; imported by `docs-check.mjs`. | copied alongside docs-check.mjs; also inlined into the generated builder |
| `build-doc-card-builder.mjs` | Generate `references/doc-card-builder.md` from the planner + the Figma renderer template (`lib/doc-card-render.figma.js`). `--check` gates CI. | plugin-internal (not installed) |
| `build-native-adapter-config.mjs` | Generate `references/native-adapter-config.md` by slicing `lib/sd-native.mjs` on its `@doc-section` markers and interleaving each fragment under its prose. Fails when module code falls outside every section, so the doc cannot silently ship incomplete. `--check` gates CI. | plugin-internal (not installed) |

**Documentation scripts — install as a set.** Copying these files without
registering them leaves a repo with a script on disk and no entry point, which
is how a stale `docs:check` went unnoticed for a full release. Both
`storybook-chromatic-builder` (first-time setup) and `/document-component`
(freshness refresh) install the same seven files and register the same four
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

A refresh that adds a file must also add its npm script; check `package.json`
for all four every time, not just the file that changed.

The crosswalk contract is documented in
`${CLAUDE_PLUGIN_ROOT}/references/crosswalk-schema.md`.

## Usage

```bash
node validate-crosswalk.mjs --crosswalk crosswalk.json --tokens dtcg/tokens.json
node build-reverse-index.mjs --crosswalk crosswalk.json --out crosswalk.reverse.json
node guard-token-removal.mjs --root . --symbols symbols-to-remove.txt
node validate-adherence.mjs --root ../../apps --system ../.. --package @acme/ui --tokens dtcg/tokens.json
```

`validate-adherence.mjs` takes every path explicitly because cwd is the package
holding the script, not the repo root. `--system` has no default: defaulting it
to `--root` resolves to a path that does not exist. `--tokens` is repeatable, so
a system whose values span mode files passes each one. `--skip <rule>` switches a
rule off entirely — a skipped rule is absent rather than inert, which is the
supported answer for a repo the rule cannot apply to (a Vue or Svelte app has no
JSX for the component rules to read).

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

This auto-discovers every `**/*.test.mjs` recursively (31 tests). Don't use
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
