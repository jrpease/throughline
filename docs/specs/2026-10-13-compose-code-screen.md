# Compose a screen in code from the design system

Status: built
Reviewed: 2026-10-13 — needs revision (lookalikes pass both checks, raw values only fail when they duplicate a token, no spacing scale on the sample, the script would be dropped from the adapter payload, casing, marker scope, after-the-cap behaviour, Plan commands that don't exist, live-run setup). Revised the same day. Re-reviewed: resolved except, narrowly, how `scale-utility` is defined, sub-parts in the plan, sizing and weight, and live-run dependencies. Revised again with the code; every finding is addressed.
Date: 2026-10-13
Backlog: #112, Phase 5 — #41
Builds on: `docs/specs/2026-10-13-compose-figma-screen.md` (the Figma composer, whose gap shape this reuses), the code adherence gate (`scripts/validate-adherence.mjs`)

The owner asked for this to continue Phase 5 (2026-10-13), under the session's
standing instruction: "Take your recommendations when you have a question. Only
pull me in when there is an important P0 question." Every decision below was made
by Claude on that instruction, after reading the gate, probing its `extract` on a
sample screen, and reading the sample repo (`~/Dev/throughline-sample`). None was
put to the owner one by one, and any can be reopened. The ones most worth the
owner's glance are the eighth command, leaving routing to the user, and v1 being
Tailwind-only. This answers the Figma spec's open question about one command for
both sides: two commands.

## Goal

The Figma side can now compose a screen from the library. The code side can check
an app against the system, but nothing writes one. After this ships, a user asks
for a screen in code, the agent checks its plan against the system's own
inventory before writing a line, writes one screen file that imports only the
system's components and binds every spacing, type and colour value to a token,
and gates that file as a hard step. A component the system doesn't have is
reported as a gap in the same shape the Figma composer uses, never written as a
one-off.

## Non-goals

- **Flows and app scaffolds.** One screen, one file. A flow is several runs.
- **Routing.** The screen is written as a component at a path the user names. The
  command says how to mount it; it doesn't edit a router, a `pages/` tree or a
  layout. Routers differ per app and an edit there touches code the user owns.
- **Creating an app.** The target app must exist.
- **Frameworks other than Tailwind-based React.** v1 writes React for
  `uiFramework` `shadcn` or `tailwind`. MUI styles through `sx` and theme spacing
  numbers, and vanilla CSS through stylesheets; each needs its own raw-value rule,
  so both wait for a real project. Swift has no reader, and Angular templates
  carry no imports for the component rules to read. Vue and Svelte files are read
  by the gate, but the composer writes React only for now.
- **A description shared with Figma.** Still blocked on a mapping between Figma
  property names and code props (Code Connect), as the Figma spec records.
- **Aggregating gaps.** #43. This run names its gaps in the shape #43 will
  collect.
- **Data, state and behaviour.** Handlers are stubs. Fetching, validation and
  stores are the app's.

## Decisions

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| Unit of work | One screen, written as one new component file. | The Figma composer's unit; a flow is runs of it. One file is also what can be gated without reading the rest of the app. | Flows, app scaffolds |
| Where it writes | A path the user names, inside an existing app. The command asks for it unless given. The file's first line is the marker `// Composed by throughline: <screen>.`, or its second line when the first is a directive (`'use client'`, `"use server"`). A file already at the path is replaced only when it carries the marker **naming the same screen**. An unmarked file, or one marked for another screen, is a `name-taken` error before anything is written. | Same rule as Figma: never overwrite what a person wrote, and never let one screen silently replace another at a reused path. Next apps need the directive first. | Editing routers; overwriting by path |
| Vocabulary | `components.built` joined to the docs index (`index.json`) are the only components, each with its documented variant axes, values and states, plus `whenToUse` / `whenNotToUse`. The agent may read a listed component's own source for prop names and exported sub-parts (`CardHeader`), since the index records neither. A sub-part comes with its owner: the plan lists `Card`, and may list `CardHeader`, which `check` resolves to `Card` through the gate's `partOwner` (a part takes no variants). Imports come only from the system's package specifier. | #41's approach. The index has no props or import path, and the gate already accepts sub-parts through `partOwner`. Reading the source is reading, not inventing. | Components outside the inventory; deep imports |
| Check before writing | `check` resolves the plan first: the components the screen will use, each with its variant props. It returns every error at once: `missing-component` (with nearest names), `unknown-prop` (an axis the record doesn't have; any axis on an undocumented component), `unknown-option` (a value the axis doesn't have), `name-taken`, `invalid`. Axes and values match case-folded, and the resolved plan returns them in the record's own casing, which the agent writes. Any error means nothing is written. Kinds and error shape (`{ kind, path, asked, nearest? }`) are the Figma composer's. | Catches gaps before any code exists, so the user decides about a missing component rather than finding a workaround in the file. The gate matches variant values exactly, so writing the record's casing is what keeps a passing plan from failing the gate. Sharing the shape gives #43 one record from both sides. | Writing first and letting the gate find gaps |
| Gaps | A `missing-component` goes back to the user before writing: leave it out, use a named existing component, or stop. Never substituted silently, never built locally. | #43's premise, as on the Figma side. | Placeholder components |
| What counts as bound | In a composed file, colour, spacing, sizing, type size and font weight are written only as token CSS variables (`gap-[var(--space-gap-md)]`, `style={{ padding: 'var(--space-4)' }}`) or as utilities the system's preset generates from tokens (`bg-primary`, `rounded-md`, `font-sans`). Default-scale Tailwind utilities for spacing, sizing, type size and weight (`gap-4`, `p-6`, `w-80`, `text-lg`, `font-semibold`) are not bound. Percentages, fractions (`w-1/2`) and keywords (`w-full`, `h-screen`) are layout, not values. Links may be plain `<a>`: the sample has no Link component, and an anchor isn't a control a system usually owns. | The gate fails a raw value only when a token holds that exact value (`validate-adherence.mjs:896`, `:913`); `#123456` with no matching token passes. And throughline's generated preset extends only colours, radius and font family (the sample's `preset.cjs`), so `gap-4` is Tailwind's own 16px. "Bound" has to mean "names a token" for this to hold. | Raw values that happen to match no token; Tailwind's default scale |
| Composer rules | `gate` runs the adherence gate's own `extract` and `validate` on the one file, then three rules that hold only for composed files. `raw-value`: any colour literal or dimension `extract` finds, matched to a token or not, plus the sizing `extract` doesn't read (an arbitrary `w-`/`h-`/`size-`/`min-`/`max-` value that isn't a `var()`, and a width or height declaration with a raw length). `scale-utility`: read anywhere in the comment-blanked file, so `cn(…)` and template strings count, after any variants (`md:`) and as negatives, the prefixes `p m` (with `x y t r b l s e`), `gap(-x/-y)`, `space-x/-y`, `w h size min-w min-h max-w max-h inset(-x/-y) top right bottom left text leading tracking`, with a value of a non-zero number, `px`, or `xs sm base lg xl 2xl…9xl`; and `font-thin` through `font-black`. Preset names (`text-primary`, `font-sans`) don't match the value list, so they pass. `off-plan`: a lowercase `button`, `input`, `select` or `textarea` element, or a package component whose name, or owner through `partOwner`, isn't in the plan. `gate` resolves the plan itself and compares names case-folded. `variant-rule-inert` is moved to advisories in this mode. | The gate checks an app against drift; a composed file can be held to "nothing raw, nothing hand-built" outright. `off-plan` is what makes the plan binding: probed, `extract` doesn't see a lowercase `<button>`, so a hand-built control passed both checks without it. The inert guard fires whenever known components set no variant prop, which one correct file often does; the other guards fire on one file only when something is really wrong. | Holding composed code to the app's looser bar; a plan the file can ignore |
| Gate failures | A failure goes back to the agent to fix the file and re-run `gate`, up to three attempts in all (a cap chosen here, not borrowed). After the third failure the run stops: the file stays at its path, marked, and the report lists its failures and says a re-run replaces it. | Unlike Figma, a code failure is the agent's own writing, so a retry can fix it. Leaving the file matches Figma leaving its `WIP:` frame; the marker makes it safe to replace. | Handing over ungated code; deleting the user's view of what failed |
| Gate settings | Search the repo's `package.json` files (skipping `node_modules`) for an `adherence:check` script. If one exists, take its `--system`, `--package` and every `--tokens`, resolved against that package's directory. Otherwise ask for the package specifier and token files once. | The registration lives in the tokens package with paths relative to it (`scripts/README.md`). The sample has no registration, so asking must work too. | A new manifest key |
| Who runs it | A new command, `/throughline:compose-code`. | The sibling of `/throughline:compose-figma`. An eighth command, but composing in code is a user-facing act like composing in Figma. | Folding it into compose-figma |
| Shape | `scripts/compose-code.mjs`, run from the plugin (`node ${CLAUDE_PLUGIN_ROOT}/scripts/compose-code.mjs`, or `.throughline/scripts` in the adapters), shipped in the adapter payload like `doc-card-payload.mjs`. Modes: `inventory`, `check --plan <file>`, `gate --plan <file> --file <path>`. It imports the gate and `nearestNames`; `lib/figma-compose.mjs` leaves `PLUGIN_INTERNAL` so that import resolves in the adapter payload (the file is import-free). | Running from the plugin keeps it in step with the plugin's gate. An internal file is dropped from the payload, so the Cursor, Codex and generic versions of the command would run a missing script. | A second copy of the gate or of `nearestNames` |

## Open questions

- **`nearestNames` is noisy for a name with no near match (#174).** Shared code, so
  fixing #174 fixes both sides. Not this branch.
- **A system whose preset does generate a spacing scale.** `scale-utility` would
  fail its token-backed `gap-4`. Throughline's own preset doesn't generate one, so
  v1 flags every default-scale utility. Recommendation: read the preset's theme
  keys when a real system needs it.
- **Re-checking the marker at write time.** Figma's `finalize` re-checks because
  the file can change between calls. Here the agent checks, then writes seconds
  later. Recommendation: leave it; `gate` is run on the written file anyway.

## What shipped

- `scripts/compose-code.mjs` and `scripts/compose-code.test.mjs`: `inventory`, `check`, `gate`, with the marker, plan resolution (casing, sub-parts) and the three composer rules. 18 tests, each rule mutation-checked by hand.
- `commands/compose-code.md`, with adapters regenerated.
- `scripts/install.mjs`: `lib/figma-compose.mjs` leaves `PLUGIN_INTERNAL`, and `install.test.mjs` asserts both files install.
- `scripts/README.md` rows, the README paragraph, the CHANGELOG 0.27.0 entry, and the version bump.
- `docs/notes/2026-10-13-compose-code-live-run.md`.

## Where it diverged

- **`off-plan` also flags imports.** The agent-driven run imported `ArrowRight` from `lucide-react`, and the gate passed it. Now any import other than the system's package (and its subpaths) and React is `off-plan`, relative imports included. The Decisions row described only elements and components.
- **The command's prose gained five things the run lacked:** repeated `--tokens`, where token variable names and preset utilities live, suggesting alternatives by `whenToUse` rather than the spelling-based `nearest`, a size no token holds, and mounting in an app with no router.
- **The live run's screen sits in a card about a third of the window wide, not 400px.** The sample has no sizing token, so a fixed width can't be bound; the composer approximates and reports it, as the command now says.
- **Icons are a gap on the sample.** `@ds/ui` doesn't re-export the Lucide icons Button's icon slots take, so the Figma screen's arrow has no code equivalent.

## Plan

### Step 1 — the script, tested

Files: `scripts/compose-code.mjs`, `scripts/compose-code.test.mjs`, `scripts/install.mjs` (`lib/figma-compose.mjs` leaves `PLUGIN_INTERNAL`), `scripts/install.test.mjs` (drop its assertion for that entry; add `compose-code.mjs` and `lib/figma-compose.mjs` to the must-install list)
Change: Pure exports:
- `COMPOSED_MARKER(screen)` and `readMarker(text)` → the screen name or `null`; the marker is accepted on line 1, or line 2 after a directive string.
- `codeInventory({ manifest, index, pkg })` → `{ package, components: [{ name, documented, summary, whenToUse, whenNotToUse, variants: { axis: [values] }, states }] }`, built from `components.built` joined to `index.json` by `normalizeName`.
- `checkPlan(plan, inventory, { existing })`, where `plan = { screen, file, components: [{ name, variants? }] }` and `existing` is `null` or the marker's screen name (`''` for an unmarked file) → `{ ok, errors, plan }`, where `plan` carries each component's record name and variants in the record's casing. Errors and kinds as in Decisions; paths like `components[2].variants.size`.
- `gateFile({ file, text, plan, manifest, index, tokenDicts, pkg })` → the gate's `validate` result for that file with `variant-rule-inert` moved to advisories, plus `raw-value`, `scale-utility` and `off-plan` failures with line numbers.

CLI: `inventory --system <dir> --package <spec>` (JSON out); `check --system --package --plan <file>` (reads the target file's marker; JSON out; exit 0 ok, 1 errors, 2 usage); `gate --system --package --tokens <file>… --plan <file> --file <path>` (the gate's `formatReport` lines, then the composer rules; exit 0 / 1 / 2).
Verify: `node --test scripts/compose-code.test.mjs scripts/install.test.mjs` → passes, covering: an ok plan with casing resolved; missing component with nearest names; unknown axis; unknown value; variants on an undocumented component; unmarked file, file marked for another screen, file marked for this screen, marker after `'use client'`; every error at once; `raw-value` on a hex with no matching token and on `p-[16px]`; `scale-utility` on `gap-4` and `text-lg` but not on `gap-[var(--x)]`, `bg-primary` or `w-full`; `off-plan` on `<button>` and on a package component missing from the plan; a clean file passing; `variant-rule-inert` downgraded. Then, by hand, break each composer rule in turn and confirm a test fails.

### Step 2 — the command

Files: `commands/compose-code.md`; adapters regenerated by `node scripts/adapters/generate.mjs`
Change: Steps mirroring compose-figma: read `design-system.json` (`project.uiFramework`; stop unless `shadcn` or `tailwind`); find the gate settings as in Decisions; ask the target path; run `inventory`; plan the component list; run `check` and resolve errors with the user as compose-figma steps 4–5 do; write the file with the marker, using the resolved casing; run `gate`, fixing and re-running up to three attempts; report the file, whether it replaced one, the gate's counts, every gap with nearest names, and how to mount the screen. Never edit a component, a token or the router. Keep the words "copy" and "install" out of the paragraph that names the script's path (`ci/validate-install-sets.mjs` reads those as a copy claim).
Verify: `node scripts/adapters/generate.mjs --check` and `node ci/validate-skills.mjs` and `node ci/validate-install-sets.mjs` → all clean.

### Step 3 — prose and version

Files: `README.md`, `CHANGELOG.md` (0.27.0), `package.json`, `.claude-plugin/plugin.json`, README install lines, `scripts/README.md` (the plugin-run list beside `doc-card-payload.mjs`, and `lib/figma-compose.mjs`'s row, which says it isn't installed)
Change: one README paragraph beside compose-figma's; CHANGELOG entry in Jordan's voice (`write-like-jordan`); version 0.27.0.
Verify: the ten CI commands, by name: `node --test`, `node ci/validate-plugin.mjs`, `node ci/validate-skills.mjs`, `node ci/validate-install-sets.mjs`, `node ci/check-pinned-runs.mjs`, and `--check` on `scripts/adapters/generate.mjs`, `scripts/build-doc-card-builder.mjs`, `scripts/build-native-adapter-config.mjs`, `scripts/build-state-baseline.mjs`, `scripts/build-figma-checks.mjs` → all pass.

### Step 4 — live run

Files: none committed except `docs/notes/2026-10-13-compose-code-live-run.md`
Change: Copy `~/Dev/throughline-sample` to the scratchpad; the real repo is not written. In the copy, create `apps/web`: a Vite React app depending on `@ds/ui` and `@ds/tokens` (both `workspace:*`; the Tailwind config requires the tokens preset directly, and pnpm's isolated layout won't reach it through `@ds/ui`), with devDependencies `vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `tailwindcss@3`, `postcss`, `autoprefixer`, `typescript`, with its own `postcss.config.cjs` and `tailwind.config.cjs` (`presets: [require('@ds/tokens/tailwind')]`, `content` covering `./src/**/*.tsx` and `../../packages/ui/src/**/*.tsx`), importing `@ds/ui/styles`, and `<html class="light">`, because the Figma "Sign in" was composed in Light and the token CSS defaults to dark. Run `pnpm install` in the copy. Gate settings: `--system <copy>`, `--package @ds/ui`, `--tokens` on all three of `packages/tokens/dtcg/primitives.json`, `semantic.light.json`, `semantic.dark.json`. A fresh agent follows `commands/compose-code.md` for the same "Sign in" screen composed in Figma, and for one asking for a DatePicker.
Verify: the gate passes on the composed file; the DatePicker request stops before writing with nearest names; a re-run replaces the marked file and an unmarked file at the path is refused; the screen renders in the browser and matches the Figma "Sign in" in structure (screenshot both); the console is clean.
