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

- **Read-after-write: pass `refreshCache: true` on the verifying read.** A specific
  trigger of the false-empty class — immediately after a write in the same session,
  `figma_get_variables` (and similar reads) can return a **stale cached empty** with an
  old timestamp. Creating 25 semantic variables and reading them straight back returned
  `variables: []`; the same read with `refreshCache: true` returned all 25. After **any**
  variable/style write, pass `refreshCache: true` on the read that confirms it.

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

## Set the text style *before* writing `.characters` (font-load order)

`figma.createText()` starts every node as **Inter Regular** — so writing
`.characters` first throws `Cannot write to node with unloaded font "Inter Regular"`
even when you only loaded your brand fonts (e.g. Bricolage Grotesque + DM Mono).
Applying the text style switches the node to a loaded family, so it must come **first**.
This is the same call surface as the `setTextStyleIdAsync` (dynamic-page) note above —
both bite in the same place.

```js
const t = figma.createText();
await t.setTextStyleIdAsync(style.id);  // switches font to the loaded family FIRST
t.characters = str;                     // now safe — no Inter load needed
```

## Binding an effect resets its geometry — re-assert `spread`/`radius`/`offset` after

`figma.variables.setBoundVariableForEffect(effect, 'color', v)` returns a **new**
effect object that drops every non-color field back to defaults — `spread → 0`,
`radius → 0`, `offset → {0,0}`. A focus ring built as a drop-shadow (offset 0, blur 0,
**spread 3**) therefore renders **invisible** after you bind its color: a read-back
shows `spread: 0` even though the literal set `spread: 3`. Re-assert the geometry
fields **after** binding, then assign:

```js
let eff = {type:'DROP_SHADOW', color:{r:0,g:0,b:0,a:1}, offset:{x:0,y:0}, radius:0, spread:3, visible:true, blendMode:'NORMAL'};
eff = figma.variables.setBoundVariableForEffect(eff, 'color', ringVar);
eff = {...eff, spread:3, radius:0, offset:{x:0,y:0}}; // REQUIRED — bind wiped these
node.effects = [eff];
```

## A drop-shadow casts only from **opaque pixels** — transparent frames get no ring

Unlike CSS `box-shadow` (which draws from the border-box), a Figma `DROP_SHADOW` is
computed from the node's rendered **alpha**. A no-fill frame has nothing to cast, so a
shadow-based focus ring (`0 0 0 3px`) shows on filled controls but is **completely
absent** on transparent variants (outline / ghost / link). **`clipsContent` does NOT
fix this** — it changes child clipping, not casting geometry (the commonly-cited
"clip to make the shadow follow the radius" trick does nothing here). Verify by
temporarily setting the ring to solid red: only filled frames will show it.

**Pattern for a universal ring:**
- **Filled control** → a drop-shadow effect (clean, no extra node).
- **Transparent control** → an **absolutely-positioned ring child**: a `RECTANGLE`
  with `layoutPositioning = "ABSOLUTE"`, `strokeAlign = "OUTSIDE"`, stroke weight = ring
  width, sized to the parent with `STRETCH` constraints, parent `clipsContent = false`.
  A **child, not a wrapper** — it doesn't inflate layout and coexists with an existing
  border.

Both map to the same `box-shadow: 0 0 0 3px var(--ring)` in code. See the build-side
rules in `${CLAUDE_PLUGIN_ROOT}/references/figma-component-standards.md` ("State
handling").

## Give a bound paint a sensible placeholder color, and read the bind back

A paint whose color you intend to bind can briefly render its **literal** color if the
bind is late or doesn't stick — and a pure-black `{0,0,0}` placeholder then reads as an
accidental **dark-mode** panel (seen once on a component-set background bound to
`bg/default`; re-running the identical bind fixed it). Two safeguards:

- Seed the paint with the token's **approximate value**, not pure black, so a
  failed/late bind degrades gracefully.
- **Read back `fills[0].boundVariables.color`** on container / component-set fills in
  the post-build audit — a screenshot can't tell a stuck bind from a placeholder.

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

**The axis mapping is inverted for VERTICAL frames — this is the part that bites.**
For a **VERTICAL** auto-layout frame, `primaryAxisSizingMode` controls **height** and
`counterAxisSizingMode` controls **width** (the *opposite* of a HORIZONTAL frame, where
primary = width). It's very easy to think "fixed width, hug height" and set the axes
backwards, after which `resize()` pins the wrong dimension — the real symptoms were an
Input variant collapsing to 10px tall (placeholders overlapping), a Card's *height*
locking to 10px, and a parent layout frame's height pinned to a stale value.

This is exactly why the **`layoutSizingHorizontal` / `layoutSizingVertical`** setters
are safer: they name the dimension directly, so there's no primary/counter axis to get
backwards.

```js
// VERTICAL frame, want fixed width + hug height:
frame.layoutMode = "VERTICAL";
frame.layoutSizingHorizontal = "FIXED";  // width  — unambiguous
frame.layoutSizingVertical   = "HUG";    // height — unambiguous
// Equivalent via axis modes (easy to invert): counter = width, primary = height
// frame.counterAxisSizingMode = "FIXED"; frame.primaryAxisSizingMode = "AUTO";
```

## Pass an explicit `timeout` for batch / multi-node writes

`figma_execute`'s default timeout (~5000ms) is too low for scripts that touch
**many nodes in sequence** — especially anything that `await`s `loadFontAsync`
per node (text edits, doc-card status write-backs). The call **times out mid-run
with no partial-success signal**, leaving a half-applied write. For any batch
operation, pass an explicit `timeout` sized to the work — a good rule is
**`node_count * 3000` ms** (e.g. a 9-card status write-back → `timeout: 30000`).
Load fonts once and reuse where possible rather than re-loading per node.

**But `figma_execute` is effectively capped at ~30s regardless of the `timeout` you
pass** — a bigger number is not honored past that ceiling. So `node_count * 3000` is
only a guide *up to* the cap; a build that genuinely needs more than ~30s must be
**chunked into multiple `figma_execute` calls**, not handed a larger timeout. Design
large builds for the cap from the start — the 108-variant Button was built as **3× 36-
variant passes**. (This is the same ceiling behind the WRAP-chunking rule below.)

## Large wrapped auto-layout (`layoutWrap = "WRAP"`) is expensive — chunk it

Building a large grid as a **single `layoutWrap = "WRAP"` frame in one
`figma_execute` call** can exceed the execute budget (~30s) and roll back the
*entire* call. WRAP relayout cost grows disproportionately with cell count. For
large grids (e.g. a 30+ cell color or variant grid), build **manual rows** —
nested horizontal auto-layout frames inside a vertical parent — instead of one
WRAP frame, or split the build across **multiple `figma_execute` calls**. The
identical content that times out as one WRAP frame builds fine as manual rows.

## Binding-survival audit: count variable bindings before and after a rename

A brownfield retrofit renames variables **in place** to preserve their Figma IDs
(guardrail 3 in `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md` — a
delete-and-recreate unbinds every consumer). The only way to *prove* a rename kept
its bindings is to count consuming bindings before and after. Run this read with
the dedicated tooling where possible (`figma_get_variables`), or via `figma_execute`
when you need the raw consumer count.

A variable's bindings are not enumerable directly, so count **consumers**: nodes and
styles whose bound properties reference each variable id. The robust, `dynamic-page`-safe
approach is to snapshot the total consumer count across the file before the rename,
rename in place, then re-snapshot and assert equality.

```js
// dynamic-page safe: load everything, then walk consumers counting variable refs.
await figma.loadAllPagesAsync();

function countBoundVariableRefs(node, tally) {
  const bv = node.boundVariables;
  if (bv) {
    for (const key of Object.keys(bv)) {
      const entry = bv[key];
      const refs = Array.isArray(entry) ? entry : [entry];
      for (const r of refs) {
        if (r && r.id) tally[r.id] = (tally[r.id] || 0) + 1;
      }
    }
  }
  if ('children' in node) {
    for (const child of node.children) countBoundVariableRefs(child, tally);
  }
  return tally;
}

const tally = {};
for (const page of figma.root.children) countBoundVariableRefs(page, tally);
const totalBindings = Object.values(tally).reduce((a, b) => a + b, 0);
// Report totalBindings (and tally per id) BEFORE the rename; re-run AFTER and
// assert the total is unchanged. A drop means a binding was severed — STOP and
// investigate (almost always a delete-and-recreate slipped in).
```

- **Pass an explicit `timeout`** (this walks every node — size it per the batch-timeout
  rule above; a large file needs tens of seconds).
- **Style bindings count too.** Text/effect/paint styles can bind variables; include a
  pass over `getLocalTextStylesAsync()` / `getLocalPaintStylesAsync()` /
  `getLocalEffectStylesAsync()` and their `boundVariables` if the file uses style-level
  bindings.
- **This is the number `design-system-audit` records** as
  `audit.figmaInventory.bindings`, and the before/after gate the `token-builder`
  brownfield branch runs around every rename.
