# Figma library publishing

Why and when the user publishes their Figma file as a **team library**, what the
plugin can and cannot do about it, and how that gates the *typed* instance-swap
dropdown on components. Read by `icon-system-builder`, `component-builder`, and
the Code Connect step in `storybook-chromatic-builder`.

## The problem this solves

A component slot that holds another component (an icon in a button, an avatar in
a card) is best exposed as a typed `INSTANCE_SWAP` **property** — a dropdown in
the Figma panel listing the allowed swap targets. But Figma's bridge **rejects
local (unpublished) component keys** as preferred values for `INSTANCE_SWAP`. So
the typed dropdown can only be added once the swap-target components (your icons,
mainly) have been **published to a team library**, which makes their keys
resolvable.

Until then the slot still fully works via the **toggle + manual-swap** fallback
(show/hide the slot, swap the instance by hand). That fallback is a real, shippable
slot — not a broken state. The typed dropdown is a later *upgrade*.

## Two hard constraints

1. **The plugin cannot publish.** Publishing is **not** exposed by the Figma
   plugin API or the figma-console MCP — there is no publish tool. It is a manual
   UI action the **user** performs: open the **Assets** panel → **Libraries** →
   **Publish** (review the changes, then publish). The plugin's job is to
   *instruct, then verify* — never to publish on the user's behalf, and never to
   claim it published something it can't.

2. **Publishing is plan-gated.** Publishing a team library requires a **paid
   Figma plan (Professional or higher)**. On the free plan the user **cannot**
   publish at all — so for them the toggle + manual-swap slot is the *only* path
   and the typed dropdown is simply unavailable. Frame this as a plan limitation,
   never as a failure or something they did wrong.

## Capability check (detect first, then ask once, record it)

Before relying on publishing, establish whether the user *can* publish and whether
they *have* — but **treat a default/`false` `figma.libraryPublished` as _unverified_,
not "definitely not published" (bug B3).** Apply the read discipline in
`${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`: never assert "unpublished"
without a verified read.

1. **Attempt detection — but expect it to be inconclusive for a self-publish.** Try
   reading for published library artifacts, but know that **neither available tool can
   actually confirm the file published *itself*:**
   - `figma_get_library_components` (REST) returns **`401/403 Invalid token`** unless a
     `FIGMA_ACCESS_TOKEN` with `file_content:read` scope is configured for the REST path
     — which it usually isn't in this setup.
   - `figma_get_library_variables` (bridge) lists only libraries the file has
     **subscribed to** (external), never the file's *own* publish — so it returns empty
     for a self-publish even when the file is published.

   So this step is real but usually **inconclusive**; only record
   `figma.libraryPublished: true` if a read genuinely resolves the file's own published
   artifacts. Do **not** treat the expected empty/error as "not published."
2. **Trust the user's confirmation.** Because detection can't confirm a self-publish,
   the flow falls through to asking — this is the *normal* path, not a failure of
   detection. Ask a single plain question — "Is this file published to a team library?"
   — and, separately, if `figma.canPublish` is `null`: "Are you on a paid Figma plan
   (Professional or higher)? Publishing a shared library — which unlocks the nicer typed
   icon dropdowns — needs one." Record `true`/`false` for each, and **proceed on the
   user's answer**.
3. **Persist.** Record `figma.libraryPublished` (+ `publishedAt`) and `figma.canPublish`.
   Don't probe repeatedly; read the manifest and only re-ask if state is genuinely
   missing.

**The real signal is a later `INSTANCE_SWAP` key rejection.** Since you can't verify a
self-publish up front, treat the user's "yes, published" as good enough to proceed, and
let the *bridge* be the ground truth: if adding a typed `INSTANCE_SWAP` with published
keys is then **rejected** (local/unpublished key error), that's the authoritative
"not actually published yet" — re-check with the user and fall back to the toggle +
manual-swap slot. Don't block the build waiting for a confirmation the tools can't give.

Frame the unpublished path as a **graceful choice**, never a failure — the toggle +
manual-swap slot is fully functional.

## Sequencing — one publish checkpoint, after icons

Swap targets must be published *before* components can reference them via typed
dropdowns, and icons are the main swap target. So the natural order is:

1. `icon-system-builder` builds the Icons.
2. **Publish checkpoint** (paid plan): walk the user through Assets → Libraries →
   Publish; verify; set `figma.libraryPublished` + `publishedAt`.
3. `component-builder` builds components — now able to add typed `INSTANCE_SWAP`
   dropdowns pointing at the published icons.

Prefer a **single** publish checkpoint over republishing repeatedly. Adding more
components later means the user re-publishes once to expose the new keys — tell
them that's expected, don't make it feel like churn.

## What `component-builder` does with this

For each slot that would be a typed `INSTANCE_SWAP`:

1. **Resolve publish state via the capability check above** — attempt detection
   (expect it to be inconclusive for a self-publish), trust the user's confirmation,
   then persist. A default/`false` `libraryPublished` is *unverified* — never treat it
   as a final "no". Don't wait on a confirmation the tools can't give; the real signal
   is a typed-`INSTANCE_SWAP` key rejection at build time (below).
2. **Confirmed published** (`libraryPublished` true after detect-or-ask, `canPublish`
   true): add the typed `INSTANCE_SWAP` dropdown with preferred values.
3. **Confirmed not published** (free plan, or the user said not yet): build the
   **toggle + manual-swap** slot instead, tell the user *why* in plain terms, and add
   the component name to `components.instanceSwapUpgradePending` in the manifest. This
   is a graceful choice, not a failure.

## The upgrade pass

When the user later publishes (or upgrades their plan), a subsequent
`component-builder` / `component-pipeline` run reads
`components.instanceSwapUpgradePending`, offers to add the now-possible typed
dropdowns to those components, and clears each entry as it succeeds. This is why
the fallback is tracked rather than silently lost.

## Plain-language framing

- Paid-plan user, not yet published: "To get the nice dropdown pickers for icons,
  Figma needs your components published as a shared library. It's a quick manual
  step — Assets panel → Libraries → Publish. Want me to walk you through it?"
- Free-plan user: "The typed icon dropdown needs a paid Figma plan, so we'll use
  the toggle-and-swap version instead — it works exactly the same in your designs,
  just without the dropdown menu. If you upgrade later, I can add the dropdowns."
