# Figma scripting via `figma_execute`

Shared gotchas for **any** skill that writes to Figma through the Console MCP's
`figma_execute` (component-builder, icon-system-builder, token-builder,
token-sheet-builder). The bridge runs in Figma's **`dynamic-page`** document mode
and executes batched JS. Several behaviors below have caused silent, hard-to-
screenshot corruption — read this before authoring `figma_execute` scripts, and
keep the read-backs in your post-build audit.

## Preflight: one bridge instance per file (concurrent-write corruption)

Before any write, call **`figma_get_status`** and inspect `otherInstances`. If
more than one Desktop Bridge plugin instance is connected to the same `fileKey`
(e.g. ports 9223 **and** 9224), **stop and warn the user — do not write.**
Concurrent writes from two instances collide and produce **truncated parent
frames and orphaned node fragments** scattered at negative coordinates — damage a
screenshot won't reveal. Ask the user to close the extra plugin instance, confirm
a single connection via `figma_get_status`, then proceed.

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
