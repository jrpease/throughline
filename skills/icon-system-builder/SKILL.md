---
name: icon-system-builder
description: Build an icon system in Figma — a dedicated "Icons" page populated with the user's chosen icon library (Lucide, Material, or custom SVGs) as well-named, scalable components — using the fastest and cheapest mechanism (duplicating a vetted community component file or running an importer plugin) rather than hand-generating icons. Use this when the user wants to set up icons, add an icon library, import Lucide or Material icons, create icon components, or build an icon set in Figma. Also trigger when the user mentions iconography, an icon page, or needs icons for their components. Make sure to use this whenever someone needs a managed set of icon components in their Figma design system.
---

# Icon system builder

End state: a Figma page named **Icons** containing the relevant icon set as
**scalable, well-named components**, ready to be consumed by components (skill 4)
and swapped via instance properties.

## Core principle: don't make Claude draw 1,700 icons

The expensive, wrong path is Claude generating icon components one by one via the
write mechanism — slow and token-hungry. The icon libraries already publish Figma
resources. **Get to the end state via the cheapest mechanism that produces clean,
well-named components**, in this preference order:

1. **Duplicate a vetted community component file** (cheapest — near-zero Claude
   tokens; the user copies a Figma Community resource where icons are already
   components). Lucide and Material both have community files with the icons as
   publishable components.
2. **Run a reputable importer plugin** inside Figma (builds the component set
   from the library source, sometimes the latest release; can often import a
   subset). Use when no suitable community file fits, or when the user wants the
   latest/source-of-truth set.
3. **Generate from source SVGs (last resort)** — only for genuinely **custom**
   icons the user brings, or when neither above works. Even then, batch the
   import; never hand-draw.

**This order is a hard gate, not a vibe — the library determines the path.** For
a known library (Lucide, Material), the answer is **#1**, falling back to **#2**
only if no community file fits. **Never #3 for a known library.** In particular:
**fetching a library's SVGs from its website (e.g. lucide.dev) and hand-prepping
them into components IS mechanism #3 wearing a disguise** — it is the slow,
last-resort path, not a reasonable default. Do not take it for Lucide or Material;
they always have a community file (#1) or importer plugin (#2). Reserve SVG import
for custom icon sets only. Choosing a *different* mechanism on different runs for
the *same* library is a bug: the library fixes the choice, so it must be
deterministic.

## Default to a CURATED SUBSET, not the whole library

Most projects need 40–120 icons, not 1,700+. Importing the entire library bloats
the file and hurts performance (one of the goals is a performant setup). So:

Run `${CLAUDE_PLUGIN_ROOT}/references/brainstorm-before-build.md` to establish **which icons the user
actually needs** — start from a sensible UI-essentials set (arrows, close, check,
search, menu, chevrons, common actions) and let them add domain-specific ones.
Only import the full library if the user explicitly wants it. Recorded subset can
grow later by re-running.

## Name the specific resource and let the user verify

Community files and importer plugins are **unofficial and variable in quality**
(some popular plugins are reported buggy/slow). So: name the *specific* vetted
resource you intend to use, briefly say why, and let the user confirm or pick
another before proceeding. Don't silently grab whatever's first. Prefer
well-maintained, clearly-licensed resources; surface the license for commercial
use.

**Start from these default candidates so the choice is consistent across runs**
(verify the current link with the user — don't assume a stale URL/file key is
still live; if the named resource has moved, search Figma Community for the
official/most-installed equivalent and confirm before using):

- **Lucide** → prefer Lucide's **official Figma resource** (the Lucide-team
  community file, or the official "Lucide Icons" importer plugin for a subset/
  latest set). MIT-licensed. This is mechanism #1/#2 — never fall back to
  fetching SVGs off lucide.dev.
- **Material** → prefer the **official Material Symbols** community file, or the
  official Material icon importer plugin. Apache-2.0.
- **Custom** → the user's own SVGs via batched import (mechanism #3).

If you genuinely cannot confirm a community file or importer plugin for a known
library, **say so and ask the user** which resource to use — do **not** silently
drop to fetching website SVGs.

## Step 1 — Choose library + mechanism

- Ask which library: **Lucide** (the shadcn default; outline only),
  **Material**, or **custom** (user brings SVGs). Record in `icons.library`.
- Determine the subset (brainstorm, above).
- Pick the mechanism cheapest-first, name the specific resource, get the user's
  confirmation. For custom, plan a batched SVG import.

## Step 2 — Bring icons in

Execute the chosen mechanism. If duplicating a community file, guide the user
through copying it (or the relevant components) into their file's **Icons** page.
If using an importer plugin, walk the install/run and the subset selection. If
custom SVGs, batch-import and componentize them.

This is a Figma-authoring step — sequential, with the user in the loop; no
subagents.

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
  last updated — *one card for all icons*, not one per icon. Follow
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

- Never hand-generate the full icon set via the write mechanism when a community
  file or importer plugin can do it far cheaper.
- Never import 1,700 icons by default — curate to what's needed.
- Never grab an unnamed/unvetted resource silently — name it, surface the
  license, let the user verify.
