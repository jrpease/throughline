# Figma scripting via `figma_execute`

Shared gotchas for **any** skill that writes to Figma through the Console MCP's
`figma_execute` (component-builder, icon-system-builder, token-builder,
token-sheet-builder). The bridge runs in Figma's **`dynamic-page`** document mode
and executes batched JS. Several behaviors below have caused silent, hard-to-
screenshot corruption — read this before authoring `figma_execute` scripts, and
keep the read-backs in your post-build audit.

## Preflight: one *live* bridge instance per file (concurrent-write corruption)

Before any write, call **`figma_get_status`** and inspect `otherInstances`.
Concurrent writes from two **live** Desktop Bridge instances connected to the same
`fileKey` collide and produce **truncated parent frames and orphaned node
fragments** at negative coordinates — damage a screenshot won't reveal. So a second
*live* instance is a hard stop.

**But do not hard-block on *stale* entries (bug B4).** Users routinely hit a wall
where `otherInstances` lists ports they never opened — phantom/stale connections
left by a plugin reload, a file switch, or an MCP reconnect that spawned a new port
without reaping the old one. Telling them to "close the other instance" is useless
when they never opened one. Distinguish the two cases before blocking:

1. **Verify liveness, don't assume it.** Treat an `otherInstances` entry as
   *suspected stale* until confirmed live. Attempt a `figma_reconnect` (or re-read
   `figma_get_status`) — stale ports typically drop out after a reconnect — or use a
   liveness/heartbeat signal if the MCP exposes one.
2. **Only the genuinely-live count blocks.** If exactly one live instance remains
   after reaping stale entries, proceed. Only block when **two or more** instances
   are confirmed live.
3. **If you must block, be actionable.** Name the exact ports, state which are
   suspected stale vs. live, and give a concrete clear path (run `figma_reconnect`,
   reload the bridge plugin, or restart the MCP client) — never a bare "shut down
   the others." If only stale entries remain and they won't clear, say so plainly
   and let the user proceed rather than dead-ending them.

This is the bridge-side application of the read-discipline principle (B4) in
`${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`: don't assert "another
instance is active" without confirming it's actually live.

## Read discipline: never report "empty" without a verified read (B1/B2)

Before reporting that a file has no variables, no text styles, or no effect styles,
you MUST have run an explicit read **for that specific class** that returned empty —
after the file is fully loaded. Two real bugs came from violating this:

- **B1** — a first read returned `0` variables on a fully-populated file (stale/early
  read) and was reported as fact. **Fix:** `await figma.loadAllPagesAsync()` before
  counting; treat a `0` on first read as suspect and re-read before reporting; prefer
  the dedicated `figma_get_variables` tool (handles `dynamic-page`, resolves aliases).
- **B2** — "no text styles" was asserted because no text *variables* were found —
  styles were never read. **Fix:** variables and styles are different surfaces. Read
  each independently: variables (`figma_get_variables`), text styles
  (`figma_get_text_styles`), effect/paint styles (`figma_get_styles`). Report "none"
  only for the class whose own read came back empty.

An unexpectedly-empty result is a possible read error, not ground truth. See the
full principle in `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`.

## `dynamic-page` mode: use the async APIs — reads **and** writes

Synchronous document-wide getters *and several setters* throw under
`dynamic-page` (the error reads `Cannot call with documentAccess: dynamic-page.
Use figma.<x>Async instead.`). Use the async variants and `await` them:

- **Node lookup:** `await figma.getNodeByIdAsync(id)` (**not** `figma.getNodeById(id)`).
  This is the most common one in write-back scripts (finding a doc card / `Status`
  chip by id) — default every node lookup to the async form.
- **Reads:** `getLocalVariableCollectionsAsync`, `getVariableByIdAsync`,
  `getVariablesByCollectionAsync`, `getStyleByIdAsync`, `loadAllPagesAsync`.
- **Writes / setters:** `setCurrentPageAsync(page)` (**not** `figma.currentPage =`),
  `setTextStyleIdAsync(id)` (**not** `node.textStyleId =`), and likewise
  `setFillStyleIdAsync`, `setStrokeStyleIdAsync`, `setEffectStyleIdAsync`.

Generate scripts with the async forms from the start — retrofitting after a sync
setter throws mid-build is how partial writes happen. For a simple verification
read, prefer the dedicated `figma_get_variables` tool (it handles `dynamic-page`
correctly and resolves aliases with `resolveAliases: true`) over a hand-written
script.

## `resize()` locks the *opposite* auto-layout axis to FIXED

Calling `node.resize(w, h)` on an auto-layout frame to set one dimension silently
flips the **other** axis' sizing mode to `FIXED`, pinning it. The classic symptom
is an auto-layout frame that **collapses to ~10px** on the pinned axis with content
overlapping or clipped (seen on color grids, variant cells, whole component sets).
A screenshot may not show it — only a sizing-mode/height read-back does.

**Pattern — prefer the layout-sizing setters; if you must `resize()`, re-assert
the modes immediately after:**

```js
// Preferred: express hug/fill intent directly (no axis gets pinned)
frame.layoutSizingHorizontal = "FILL"   // or "HUG" / "FIXED"
frame.layoutSizingVertical   = "HUG"

// If resize() is unavoidable, restore the intended modes right after:
frame.resize(width, frame.height)
frame.primaryAxisSizingMode  = "AUTO"   // your intended mode
frame.counterAxisSizingMode  = "AUTO"
```

Read back `primaryAxisSizingMode` / `counterAxisSizingMode` (or
`layoutSizing*`) in the post-build audit — a collapsed axis is otherwise invisible
until handoff.

## Pass an explicit `timeout` for batch / multi-node writes

`figma_execute`'s default timeout (~5000ms) is too low for scripts that touch
**many nodes in sequence** — especially anything that `await`s `loadFontAsync`
per node (text edits, doc-card status write-backs). The call **times out mid-run
with no partial-success signal**, leaving a half-applied write. For any batch
operation, pass an explicit `timeout` sized to the work — a good rule is
**`node_count * 3000` ms** (e.g. a 9-card status write-back → `timeout: 30000`).
Load fonts once and reuse where possible rather than re-loading per node.

## Large wrapped auto-layout (`layoutWrap = "WRAP"`) is expensive — chunk it

Building a large grid as a **single `layoutWrap = "WRAP"` frame in one
`figma_execute` call** can exceed the execute budget (~30s) and roll back the
*entire* call. WRAP relayout cost grows disproportionately with cell count. For
large grids (e.g. a 30+ cell color or variant grid), build **manual rows** —
nested horizontal auto-layout frames inside a vertical parent — instead of one
WRAP frame, or split the build across **multiple `figma_execute` calls**. The
identical content that times out as one WRAP frame builds fine as manual rows.
