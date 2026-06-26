# Token sync adapters

An **adapter** is a coherent preset that turns the normalized DTCG token JSON
into framework-specific output. Each adapter bundles **four conventions** that
always travel together — getting them as a unit is what prevents incoherent
combinations (e.g. "preserve references" + "iOS Swift", which is impossible
because Swift constants can't do runtime indirection):

1. **Where values live** — CSS vars + Tailwind preset, a JS theme object, a
   Swift enum/asset catalog, etc.
2. **How modes are expressed** — `:root` + `.dark` selectors, MUI palette
   objects, asset-catalog light/dark variants, resource qualifiers.
3. **Whether semantic→primitive references are preserved or flattened** — web
   adapters preserve (runtime themeable via CSS var indirection); native
   adapters flatten (compile-time constants).
4. **Naming convention** — `--background` (shadcn), `palette.primary.main`
   (MUI), `Color.backgroundPrimary` (Swift), etc.

The DTCG JSON is the **universal input**; the adapter is the **universal output
contract**. Adding a platform = adding an adapter, never re-authoring Figma.

## The two tiers: curated and generated

Adapters come in two tiers, and **the skill always tells the user which tier
they're on** — this manages expectations honestly.

### Tier 1 — curated adapters (vetted presets)

Five built-in adapters ship with framework-specific knowledge baked in. When the
user names one of these, use the vetted preset — high confidence, no guessing.

| Adapter | Values live in | Modes via | Sem→prim refs | Naming |
|---|---|---|---|---|
| `shadcn` | CSS vars + tailwind preset | `:root` + `.dark` | preserved | `--background` |
| `tailwind` | tailwind theme config | `dark:` variant / class strategy | preserved (via CSS vars) | `colors.background` |
| `mui` | JS theme object | `createTheme` palettes | preserved (object refs) | `palette.primary.main` |
| `vanilla-css` | one CSS file | `:root` + `[data-theme]` | preserved | `--color-bg-default` |
| `ios-swift` | Swift enum / asset catalog | light/dark asset variants | flattened | `Color.backgroundPrimary` |

These five were chosen for coverage of this plugin's web-first, design-led
audience: three React framework adapters (shadcn — the dominant new-project
choice; standalone Tailwind — for the large Tailwind-without-shadcn population;
MUI — the enterprise/Material standard), the universal `vanilla-css` escape
hatch (plain CSS custom properties, no framework), and one native slot
(`ios-swift`, the more standardized native pattern). Everything else —
Ant Design, Chakra, HeroUI, Android/Kotlin, Flutter, React Native, etc. — is
fully supported via Tier 2.

`shadcn` vs `tailwind`: shadcn emits CSS vars *plus* the specific var names
shadcn components expect; `tailwind` targets Tailwind used on its own, mapping
tokens into the Tailwind theme config. Related but distinct targets.

### Tier 2 — generated adapters (any other framework)

When the user names a framework **not** in the curated five, the skill does NOT
refuse and does NOT pretend it's curated. It **generates an adapter** via a
structured protocol:

1. Tell the user plainly this is a generated (not curated) adapter: "Chakra
   isn't one I have a vetted preset for — I'll generate one from its token
   conventions, and we'll verify it against a real component before relying on
   it."
2. Establish the **four conventions** (the checklist above) for the target
   framework — research its token/theme conventions and confirm with the user
   via the brainstorm-before-build protocol.
3. Draft the Style Dictionary config + any custom transforms/formats.
4. **Validate before trusting**: generate output and check it against a sample
   component in that framework — does the framework actually consume these
   tokens cleanly? A generated adapter is unverified until this passes.

### Saving validated generated adapters

Once a generated adapter is validated, **save it to the repo** at
`packages/tokens/adapters/<name>/` so future syncs reuse it instead of
regenerating. Over time the user accumulates their own vetted adapters. Record
saved custom adapters in the manifest (`sync.customAdapters`). (A validated
adapter could also be contributed back to the curated set in a future plugin
version, but that's not required.)

## How an adapter is implemented

Each adapter is a **Style Dictionary v4 config preset** plus any custom
transforms/formats it needs. Style Dictionary v4 ingests DTCG natively, so most
of the work is: register the platform, set the transform group, set the format,
and (for web adapters) configure `outputReferences: true` so semantic tokens
emit as references to primitive vars rather than flattened literals.

- **Web adapters** (`shadcn`, `tailwind`, `mui`, `vanilla-css`): set
  `outputReferences: true` so `--color-bg-default: var(--color-gray-50)` is
  emitted, preserving the cascade. Modes map to selectors per axis: theme
  overrides (from `Color/Semantic`) under `.dark` / `[data-theme="..."]`, and
  **brand overrides (from the multi-mode `_Color/Primitive`)** under a
  `[data-brand="..."]` selector. Single-mode collections emit flat values in
  `:root` with no theme selector. The
  `shadcn` adapter additionally emits a Tailwind preset mapping the CSS vars to
  Tailwind tokens; the standalone `tailwind` adapter maps tokens into the
  Tailwind theme config directly; `mui` emits a JS theme object whose palette
  references preserve the cascade through object structure.
- **Native adapters** (`ios-swift`, and generated native targets like
  Android/Kotlin): `outputReferences: false` — references resolve to literal
  values at build time, because the target language has no runtime var
  indirection. Modes map to the platform's native mechanism (asset catalog
  variants, resource qualifiers).

## Brownfield value transforms

On a retrofit, the values flowing into the adapters get three extra transforms (the
opacity 0–100→0–1 normalization happens earlier, at extraction). These affect what the
web adapters emit; native adapters resolve to literals so the channel/`color-mix` forms
apply to web targets. Full rationale: the 7 guardrails in
`${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`.

- **Channel alpha (web).** Color tokens emit as space-separated channels
  (`--color-bg-default: 239 68 68;`) consumed via
  `rgb(var(--color-bg-default) / <alpha-value>)`, so Tailwind's `/opacity` modifiers
  keep working. A finished `rgba(...)` would break them.
- **`/opacity` → `color-mix` (web).** A `/opacity` modifier on a var-based token can't
  fold its alpha into the var; emit `color-mix(in srgb, var(--token) NN%, transparent)`
  instead (or the channel-alpha form).
- **Float32 rounding at the export boundary.** Round values as they leave the pipeline
  (`Math.round(v*100)/100`) — normalizing inside Figma is a no-op because Figma
  re-quantizes to float32 on store.

These are applied in `token-sync-layer`'s extraction/transform step (its "Brownfield
transforms" subsection), not in the adapter presets.

## Output location

All adapter output lands in `packages/tokens/` in the monorepo, organized by
platform (e.g. `packages/tokens/css/`, `packages/tokens/swift/`). These are
**build artifacts** — never hand-edited, regenerated every sync. The
`packages/tokens/package.json` exports them for consumers (the UI package,
Storybook, a future app).

## Multiple platforms at once

A user can target several platforms (recorded in `sync.platforms`). Generating
each platform's output is independent and verifiable, which makes it a good fit
for **parallel subagent generation** — one subagent per adapter, each producing
and validating its platform's files, reviewed before the combined result is
landed in a PR. See the token-sync skill for the execution model.
