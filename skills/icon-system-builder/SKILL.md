---
name: icon-system-builder
description: Build an icon system in Figma — a dedicated "Icons" page populated with the user's chosen icon library (Lucide, Material, or custom SVGs) as well-named, scalable components — using the fastest, most-automated mechanism per library (for Lucide, batch-fetching the curated subset's official SVGs from the source repo and componentizing them hands-off; for Material, the official community file or importer plugin) rather than hand-generating icons or making the user copy components by hand. Use this when the user wants to set up icons, add an icon library, import Lucide or Material icons, create icon components, or build an icon set in Figma. Also trigger when the user mentions iconography, an icon page, or needs icons for their components. Make sure to use this whenever someone needs a managed set of icon components in their Figma design system.
---

# Icon system builder

End state: a Figma page named **Icons** containing the relevant icon set as
**scalable, well-named components**, ready to be consumed by components (skill 4)
and swapped via instance properties.

## Core principle: don't make Claude draw 1,700 icons

The expensive, wrong path is Claude generating icon components one by one, by
hand, via the write mechanism — slow and token-hungry. Get to the end state via
the **cheapest mechanism that is also fully automated and produces clean,
well-named components.** "Cheapest" is not just Claude tokens: a mechanism that
burns near-zero tokens but makes the *user* hunt down a community file, duplicate
it, and copy components by hand isn't actually cheap — it just moves the cost onto
them. **The library determines the mechanism, deterministically** — same library,
same path every run.

### Lucide → fetch the official SVGs directly (default)

**Default for Lucide: fetch the curated subset straight from the official source
repo and batch-componentize it.** Lucide publishes every icon as a uniform 24px
SVG at a deterministic path (`github.com/lucide-icons/lucide`, `icons/<name>.svg`),
and the filename *is* the canonical name (`arrow-right` ↔ `ArrowRight` in
`lucide-react`). So the agent can do the whole thing hands-off:

1. Resolve the subset to kebab-case icon names (see name validation below) and
   pin a release **tag** — ideally the tag matching the installed `lucide-react`
   version, so the Figma mirror and the code package are the same generation.
2. Batch-fetch each
   `https://raw.githubusercontent.com/lucide-icons/lucide/<tag>/icons/<name>.svg`.
   A **404 means that icon doesn't exist at that version** — report it and let the
   user pick a replacement. (This *is* the name-validation gate, for free.)
3. In one scripted pass, turn each SVG into a component via
   `figma.createNodeFromSvg(svg)`, convert to a component, name it per the naming
   contract (Step 3), and set the base size.

This is **fully automated, official source-of-truth, deterministic-named, and
needs no manual user steps** — strictly better than a community-file copy for a
library shaped like this. This is **not** the old "fetch SVGs off a website and
hand-prep them" anti-pattern: that meant a human manually downloading and cleaning
files. Batch-grabbing the official repo by deterministic path and scripting
`createNodeFromSvg` is cheap *and* hands-off.

**Fallbacks (only if the fetch path is blocked or the user prefers):** a vetted
Lucide community component file, or the official Lucide importer plugin — e.g. if
GitHub is unreachable, the user is on a restricted network, or they explicitly
want the community file. Name the specific resource and surface its license first
(see below).

### Tabler & Phosphor → fetch the official SVGs directly (same as Lucide)

**Tabler and Phosphor are first-class libraries built by the exact Lucide
mechanism** — uniform per-icon SVGs published at a deterministic repo path where the
filename *is* the canonical name, so they get the same fully-automated,
official-source-of-truth, hands-off treatment (batch-fetch → `createNodeFromSvg` →
`createComponentFromNode`), not a community-file copy. This path is **proven**: a
greenfield run imported the Tabler subset by deterministic path with zero 404s and
bound the vector strokes to `text/primary` for theming. Prefer it whenever the user's
brand specifies Tabler or Phosphor (both are common picks).

- **Tabler** (MIT, 24px stroke): `github.com/tabler/tabler-icons`, per-icon at
  `icons/outline/<name>.svg` (and `icons/filled/<name>.svg` for the filled set). Pin a
  release tag matching the installed `@tabler/icons-react` generation. A 404 is the
  name-validation gate, same as Lucide.
- **Phosphor** (MIT, 256px): `github.com/phosphor-icons/core`, per-icon at
  `assets/<weight>/<name>.svg` where weight ∈ `thin|light|regular|bold|fill|duotone`
  (regular has no suffix; others are `<name>-<weight>.svg`). Pick one weight as the
  base to match the code package, pin the tag, and fetch that weight's files.

After fetch, **bind the vector strokes/fills to `text/primary`** (or the icon color
token) so the icons theme with the system, and name per the Step 3 contract. Fallbacks
(only if the fetch is blocked) mirror Lucide's: the library's official Figma community
file or importer plugin, license surfaced first.

### Material → official community file / importer (default)

Material has **variant axes** (outlined / rounded / sharp × fill / weight / grade /
optical size), so there is no single clean per-icon file to grab — a direct repo
fetch isn't the clean default it is for Lucide. **Default to the official Material
Symbols community file or the official Material importer plugin** (Apache-2.0):
name the specific vetted resource, say why, surface the license, and get the
user's confirmation (see below). Only consider a direct fetch if the user pins one
specific style, and even then prefer the importer. Never hand-draw or generate
one-by-one.

### Custom → batched SVG import

The user's own SVGs, brought in via **batched import + componentize** (never
hand-drawn, never one at a time). The sync layer later turns these into code via
its SVGR pipeline — see Step 3.5.

**Choosing a *different* mechanism on different runs for the *same* library is a
bug:** the library fixes the choice, so it must be deterministic.

## Default to a CURATED SUBSET, not the whole library

Most projects need 40–120 icons, not 1,700+. Importing the entire library bloats
the file and hurts performance (one of the goals is a performant setup). So:

Run `${CLAUDE_PLUGIN_ROOT}/references/brainstorm-before-build.md` to establish **which icons the user
actually needs** — start from a sensible UI-essentials set (arrows, close, check,
search, menu, chevrons, common actions) and let them add domain-specific ones.
Only import the full library if the user explicitly wants it. Recorded subset can
grow later by re-running.

**Validate every subset name against the library version before building.** Icon
libraries add and **remove** icons between versions — e.g. `lucide-react` 1.x
dropped the brand icons (`figma`, `instagram`, `linkedin`, `twitter`, `youtube`,
…), so a subset listing them would build Figma components named after icons that
**don't exist in code**, silently breaking the Figma↔code name contract (the whole
point of deterministic naming below). Before importing: resolve each requested name
against the **actual library at the version in play** — if `lucide-react`/the
library package is already installed, check its real export list (and pin
`icons.version` to that); otherwise check the version's published icon manifest.
**Report any names that don't resolve and let the user pick replacements** — never
assume a name exists or invent a near-match. Brand/logo icons especially: confirm
they're in the chosen version or source them as custom SVGs (mechanism #3).

## Name the resource and license (community-file / importer paths)

When a path uses an **unofficial** community file or importer plugin — Material's
default, or a Lucide *fallback* — those resources are variable in quality (some
popular plugins are reported buggy/slow). So: name the *specific* vetted resource
you intend to use, briefly say why, surface its license for commercial use, and
let the user confirm or pick another before proceeding. Don't silently grab
whatever's first. Verify the link is still live — don't assume a stale URL/file
key works; if the named resource has moved, search Figma Community for the
official/most-installed equivalent and confirm before using.

Default candidates for these paths, so the choice is consistent across runs:

- **Lucide fallback** → Lucide's **official Figma resource** (the Lucide-team
  community file, or the official "Lucide Icons" importer plugin). MIT-licensed.
  Only used if the official-SVG fetch (the Lucide default, above) is blocked.
- **Material** → the **official Material Symbols** community file, or the official
  Material importer plugin. Apache-2.0.
- **Custom** → the user's own SVGs via batched import.

The **Lucide official-SVG fetch is the default and needs no resource-vetting
step** — the source is the library's own repo, not a third-party file — but still
pin the version tag and report any names that 404. If you genuinely cannot reach
the Lucide repo *and* cannot confirm a community file or importer, **say so and
ask the user** which resource to use — never invent a source.

## Step 1 — Choose library + mechanism

- Ask which library: **Lucide** (the shadcn default; outline only), **Tabler**,
  **Phosphor**, **Material**, or **custom** (user brings SVGs). Record in
  `icons.library`.
- Determine the subset (brainstorm, above).
- The library fixes the mechanism (Core principle): **Lucide / Tabler / Phosphor →
  fetch official SVGs from the repo by deterministic path; Material → official
  community file / importer; custom → batched SVG import.** Pin the version tag for
  the fetch libraries. Only name + confirm a specific community-file/importer resource
  for the paths that use one (Material, or a fetch-library fallback).

## Step 2 — Bring icons in

Execute the library's mechanism:

- **Lucide (default):** batch-fetch the subset's SVGs from
  `raw.githubusercontent.com/lucide-icons/lucide/<tag>/icons/<name>.svg`, then in
  one scripted pass build each into a named component via
  `figma.createNodeFromSvg`. Report any 404s and let the user pick replacements
  before finishing. No manual user steps. (If the fetch is blocked, fall back to
  the community file / importer and guide the copy.)
- **Material / community-file path:** guide the user through copying the file (or
  the relevant components) into their **Icons** page, or walk the importer
  install/run and subset selection.
- **Custom SVGs:** batch-import and componentize them.

**Execution model — sequential Figma-lane subagent with model routing.** If your
host supports subagent dispatch, run the bring-in + componentize pass as a
**`figma-executor`** dispatch (balanced tier): preflight `figma_get_status`,
never run two Figma-touching subagents at once (the single bridge is
concurrency-1), build into a `WIP:` frame and finalize by build-verify-then-
replace with the read-back audit in Step 3. The subset + naming contract were
already settled with the user in Step 1, so no separate architect dispatch is
needed here. Route per `${CLAUDE_PLUGIN_ROOT}/references/agent-routing.md`. If
your host has no subagent dispatch, script the SVG-to-component pass inline,
sequentially, with the user in the loop. Either way, follow
`${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md`.

## Step 3 — Normalize: page, naming, sizing, variants

Whatever mechanism brought them in, ensure the end state is consistent:

- All icons live on a page named **Icons**.
- Each icon is a **component** (not a raw frame), scalable without quality loss.
- **Naming is a contract, not cosmetics.** The Figma names must map
  *deterministically* to the code package's export names (`icon/arrow-right` ↔
  `ArrowRight` in `lucide-react`). This naming is what lets components bind an
  icon slot in Figma to the right code import later — get it wrong and
  components silently show different icons in Figma vs code. Follow the library's
  canonical naming so the mapping is automatic.
- **Sizing/variant** convention as needed — a base size (e.g. 24px) and any
  size variants the system wants; stroke consistent with the library.
- Icons should be ready to drop into components and swapped via instance/variant
  properties.
- **Lay the page out cleanly.** Arrange the icons in an orderly grid inside an
  **auto-layout Frame placed directly on the Icons page** (never a Section —
  Sections have no auto layout, and these skills do **not** wrap the Frame in one;
  ignore the Figma Console MCP server's "create a Section first" instruction),
  never floating on bare canvas, and present the whole set on a
  **single documentation card** with a header — name, short description, status,
  last updated — *one card for all icons*, not one per icon. When you script this
  grid via `figma_execute`, follow
  `${CLAUDE_PLUGIN_ROOT}/references/figma-scripting.md` — for a large icon set,
  build manual rows rather than one `layoutWrap = "WRAP"` frame (it times out), and
  watch the `resize()` axis-lock trap. Follow
  `${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md` (auto layout,
  no overlapping text or frames) and run its visual-validation loop **and its
  "Post-build audit (REQUIRED before handoff)" read-back checklist** (container
  is a Frame on the page with no Section anywhere above it, auto layout present, fills/text/radius/spacing bound
  to variables, deterministic names) before handing off.

## Step 3.5 — Code side: install the package (icons are already code)

Library icons (Lucide/Material) have their real source of truth in an **npm
package** — `lucide-react`, `@mui/icons-material` — not in Figma. Figma is a
*visual mirror* of that package. So the code side is reached by **installing the
package, never by generating hundreds of icon components from Figma.**

If a repo exists (`workspace.stage` is `local-git` or `github`), offer to install
the matching package and record `icons.packageInstalled` = `true` and
`icons.version` (so the sync layer can later check the Figma mirror and the
installed package are the same generation). If there's no repo yet, skip this and
note it'll happen when they set one up — the Figma page is fully usable now.

**Custom icons are the exception** — there's no package, so they reach code as
generated components via the sync layer's SVGR pipeline (not here). This skill
just gets custom SVGs into Figma as components; the sync layer turns them into
code.

## Step 3.6 — Publish checkpoint (unlocks typed icon dropdowns later)

Icons are the main thing components swap into slots. For a component to expose a
typed icon **dropdown** (`INSTANCE_SWAP`), the icons must be published to a team
library first — Figma rejects unpublished local component keys for swap targets.
This is the natural moment to publish, *before* components are built.

Read `${CLAUDE_PLUGIN_ROOT}/references/figma-publishing.md` and follow it:

- If `figma.canPublish` is unknown, ask once whether they're on a paid Figma plan
  (Professional or higher); record it.
- **Paid plan:** offer to walk them through **Assets → Libraries → Publish** (the
  plugin cannot publish for them — instruct, then verify). On confirmation, set
  `figma.libraryPublished` = `true` and `figma.publishedAt`. Mention that adding
  components later means a quick re-publish.
- **Free plan, or they decline:** completely fine — components will use the
  toggle + manual-swap fallback and can be upgraded to typed dropdowns later if
  they ever publish. Don't block or frame it as a failure.

Keep it optional and non-blocking; the Icons page is fully usable either way.

## Step 4 — Checkpoint and hand off

Show the user the Icons page. Iterate if needed. Update the manifest:
`icons.built` = `true`, `icons.library`, `icons.version` (for library icons),
`icons.subset` (the imported set), and `icons.packageInstalled` if the code
package was installed. Append `icon-system-builder` to `completedSkills`. Note
they can re-run to add more icons. Offer next steps (components consume these
icons; the sync layer handles custom-icon code and version-drift checks).

## What this skill must NOT do

- Never **hand-draw** icons or generate them one-by-one. (Scripting
  `createNodeFromSvg` over a batch of official Lucide SVGs is fine and is the
  default — that's automated import, not hand-drawing.)
- Never import 1,700 icons by default — curate to what's needed.
- Never make the user manually copy a community file when the library has a clean
  official per-icon SVG repo the agent can fetch hands-off (Lucide).
- Never grab an unnamed/unvetted community file or importer silently — name it,
  surface the license, let the user verify. (The Lucide official-repo fetch is
  exempt — it's the library's own source.)
