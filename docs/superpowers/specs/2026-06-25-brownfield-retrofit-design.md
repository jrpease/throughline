# Brownfield Design-System Retrofit — Design Spec

> **Status:** Approved design, pre-implementation.
> **Source:** `docs/brownfield-retrofit-learnings.md` (the Sweet app PR #443 case
> study) plus bugs B1–B4 in `BACKLOG.md`.
> **Goal:** Equip the ThroughLine plugin to handle large-scale retrofits — a mature
> codebase **and** an already-populated Figma file reconciled onto a two-tier token
> system — as elegantly as it handles greenfield builds today.

---

## 1. Problem

Every current skill assumes **greenfield** (build from scratch):

- `token-builder` — "starting the foundation of a design system"
- `repository-builder` — "graduate the local folder into a real monorepo"
- `design-system-status` / `figma-environment-setup` — read/scan local state, never
  assess a mature *external* system
- `component-builder`, `storybook-chromatic-builder` — build *new* artifacts

Nothing handles **"both artifacts already exist and have drifted — reconcile and
retrofit them onto tokens"** without breaking a live app or unbinding existing
Figma components. A brownfield retrofit runs almost backwards from greenfield: it
starts from two mature, drifted artifacts and converges them.

Separately, four bugs surfaced in testing that share one root cause — **the plugin
asserts state without performing a verified read**:

- **B1** — existing-file variable read reported "0 variables" on first pass
  (stale/cache/early read) until the user said it was wrong.
- **B2** — assumed "no text styles" because it found no text *variables* — never
  actually read the styles.
- **B3** — can't reliably detect library publish state, so silently assumes "not
  published."
- **B4** — phantom stale bridge ports hard-block progress; the user never opened
  extra instances.

This spec addresses the brownfield gap **and** all four bugs, because the
"never assert absence without a verified read" principle is the same fix surface
the audit/detection work touches.

---

## 2. Approach (decided)

- **Scope:** Full brownfield capability in one coordinated effort.
- **Front door:** No new command. `/start` (via `figma-environment-setup`)
  **auto-detects** a brownfield situation and routes into the audit.
- **Scripts:** **Hybrid** — canonical vetted scripts in a new `scripts/` dir for the
  generalizable tools; a skill-adapted scaffold for the inherently repo-shaped grep;
  Figma-side snippets stay in `references/`.
- **Decision journal:** `retrofit-planner` **offers, default-on** for retrofits.
- **Bugs:** **Fold in all four (B1–B4)** under one unified principle.

---

## 3. Unified principle (fixes B1–B4)

Add a hard rule, stated once in `references/brownfield-retrofit.md` and referenced
wherever state is detected:

> **Never assert that something is absent, empty, unpublished, or stale without an
> explicit, completed read that returned that result.** "I didn't find X" must mean
> "I queried for X and the result was empty (after the file/pages fully loaded),"
> never "I assumed X from Y." When a result is genuinely undetectable, **ask the
> user once and persist the answer in the manifest** — never guess.

Concrete applications:

- **B1:** Before counting variables, `await figma.loadAllPagesAsync()`. Treat a `0`
  count on first read as suspect — retry / re-read before reporting. An
  unexpectedly-empty result is a possible read error, not ground truth.
- **B2:** Variables and styles are **different surfaces**. Query each independently:
  variables (`figma_get_variables`), text styles (`figma_get_text_styles`),
  effect/paint styles (`figma_get_styles`). Only report "none" for the specific
  class whose read returned empty.
- **B3:** Try to detect publish state first (`figma_get_library_components` /
  `figma_get_library_variables`, library component keys). If detection is
  unreliable, **ask once** ("Is this library published to a team library?") and
  persist in the manifest. Frame the unpublished path as a graceful choice, not a
  failure. (Ties to existing feature #6 — the publishing checkpoint.)
- **B4:** Distinguish **live** concurrent bridge instances from **dead/stale**
  entries. Only hard-block on genuinely live ones; auto-reap or offer one-click
  cleanup for stale ones. If a real block is needed, name the exact ports and give a
  concrete clear path (`figma_reconnect`, reload plugin) — never just "shut down the
  others." Investigate the root cause (plugin reload / MCP reconnect spawning a port
  without reaping the old one / same session double-counted).

---

## 4. New skills

### 4.1 `design-system-audit` — the front door (PROCESS skill)

Runs after `figma-environment-setup` detects brownfield, before any building.
Mirrors what `design-system-status` would be if it assessed an *external* system
instead of a local JSON.

**Steps:**

1. **Size the code surface** — run the color-usage grep scaffold (adapted to the
   detected repo) to count: SCSS color vars, Tailwind color classes, JS `Colors.*`
   usages, raw hex + `rgba()` literals, SVG hardcoded fills. Produce a worklist with
   counts (the Sweet table shape).
2. **Inventory the Figma file** — explicit per-class reads (honoring §3): variable
   count, **binding count**, text styles, effect/paint styles, modes.
3. **Compute "% semantic"** — report e.g. "you're ~90% semantic," which decides
   whether this is a rename+cleanup or a rewrite. Surface early so the user
   right-sizes effort.
4. **Write `audit` manifest section** and recommend the next step (`retrofit-planner`
   or `token-crosswalk-builder`).

**Frontmatter:** `name: design-system-audit`; description marks it PROCESS, triggers
on brownfield detection. Default model per house style.

**Owns manifest:** `audit.*`, sets `tokens.intakeMode: "retrofit"`.

### 4.2 `token-crosswalk-builder` — the backbone artifact

Builds the persistent three-way map: **new token ↔ old Figma token ↔ code
identifier**, as `tokens/crosswalk.json`.

- **Columns:** `newToken`, `newValue`, `tier`, `figmaOld`, `codeTokens[]`,
  `status`, `recommendedSemantic`.
- **`status` enum:** `aligned | renamed | drift-fix | added | mapped-nearest`.
- **Reverse index:** code symbol → new token, emitted to semi-automate SCSS/Tailwind
  swaps.
- **Validator gate:** `tokens:validate` must pass N/N (resolved value == new value).
  Ships as a canonical script (see §6).

**Owns manifest:** `tokenCrosswalk` (pointer to the file + status counts).

### 4.3 `retrofit-planner` — the orchestrator

Mirrors `component-pipeline`: invokes sub-skills via the **Skill tool**, with a
**human confirmation gate between every stage**, and only updates the manifest
fields it owns (`retrofit.phase`, `completedSkills`).

**Encoded safe sequence (with gates):**

1. **Audit** → `design-system-audit`
2. **Refine in place** → `token-builder` (brownfield branch; never delete/recreate)
3. **Rebind components** (preserve Figma IDs / bindings)
4. **Sync layer** → `token-sync-layer` (brownfield transforms)
5. **Capture Chromatic baseline** → `storybook-chromatic-builder` — *before* code
   retrofit, so intended drift-fixes are distinguishable from regressions
6. **Retrofit code** (dual-output: new + old tokens coexist)
7. **Remove old outputs** — *only* after a zero-reference grep passes (the
   token-removal guard, §6)

**Non-obvious ordering rules baked in as gates:**
- Refine-in-place, never delete-and-recreate variables (preserves IDs → bindings).
- Chromatic baseline before the code retrofit.
- Dual-output transition; delete old only after zero-reference grep.
- Verify with the actual app, not just the build (verification triad, §7).

**Decision-journal offer (default-on):** at the start of a retrofit, offer to
scaffold `docs/design-system/` (`specs/ plans/ spikes/ findings/ decisions/
handoffs/`). Recommend yes (retrofits are multi-session); allow decline. This is the
human decision trail, complementary to the manifest's machine state.

**Owns manifest:** `retrofit.*`, appends to `completedSkills`.

---

## 5. Brownfield branches in existing skills

| Skill | Added branch |
| --- | --- |
| `figma-environment-setup` | **Detection + routing:** extend Step 0 scan to fingerprint existing code tokens and (once Figma is connected) the Figma variable structure; route a mature codebase and/or populated Figma file to `design-system-audit`. **Baseline before mutation:** capture a Figma version checkpoint / token export for rollback before any write. Apply §3 to all reads here (B1/B2). Harden the bridge-port preflight per B4. |
| `token-builder` | **Refine-in-place path:** detect existing variables; rename **preserving IDs**; run a **binding-survival audit** (count bindings before/after a rename — see §6 / figma-scripting). Never delete-and-recreate. |
| `token-sync-layer` | **Transforms learned the hard way:** emit alpha as `rgb(… / <alpha-value>)` **channels** (so Tailwind `/opacity` modifiers survive), normalize opacity **0–100 → 0–1**, round **float32 noise at the export boundary** (`Math.round(v*100)/100`). Also: convert `/opacity` on var-based tokens to `color-mix(in srgb, var(--…) NN%, transparent)` / channel alpha. |
| `storybook-chromatic-builder` | **Baseline-before-retrofit** guidance + the **verification triad** (§7) + explicit warnings: `build-storybook` only compiles **story-reachable** SCSS; **Chromatic — not `tsc`/build — is the source of truth** for color-utility removal. |

---

## 6. Scripts (hybrid)

New `scripts/` directory — the executable analog of `references/`.

**Canonical, vetted, shipped as-is (generalizable / schema-driven):**

- **Crosswalk validator** — resolved value == new value; the N/N CI gate.
- **Reverse-index generator** — code symbol → new token, from `crosswalk.json`.
- **Repo-wide token-removal guard** — grep all `.tsx/.ts` (minus generated + tests)
  for references to about-to-be-deleted utilities; deleted Tailwind utilities become
  silent no-ops, so `tsc`/build won't catch them.

**Skill-adapted scaffold (inherently repo-shaped):**

- **Color-usage grep** — ships the categories + structure; `design-system-audit`
  tunes the patterns (`$primary-*`, `bg-primary-red`, `Colors.*`, hex/rgba, SVG
  fills) to the detected codebase.

**Stays in `references/` (runs in Figma, not the repo):**

- **Binding-survival audit** — `figma_execute` snippet that counts bindings
  before/after a rename. Documented in `references/figma-scripting.md` in the
  existing gotcha/snippet format. Feeds `audit` manifest results.

---

## 7. References & guardrails

**New `references/brownfield-retrofit.md`** — canonical home for:

- The **unified principle** (§3).
- The **7 DON'T guardrails** (each a hard rule):
  1. Don't bind line-height/letter-spacing variables to text styles (Figma stores
     PERCENT; a unitless `1.6` rebinds as `1.6px`). **Font-size binding only.**
  2. Don't normalize float32 in Figma (no-op — it re-quantizes). Normalize at the
     export boundary.
  3. Don't delete-and-recreate variables to rename — it unbinds everything. Rename
     in place to preserve IDs.
  4. Don't trust `tsc`/build to catch Tailwind color-utility removal — guard
     repo-wide; let Chromatic be the net.
  5. Don't assume `build-storybook` exercises all SCSS — run the app, spot-check
     5–7 routes before declaring an SCSS change done.
  6. Don't carry `/opacity` modifiers onto var-based tokens — convert to
     `color-mix` or channel-based alpha.
  7. Don't hand-edit generated files — change the source, re-run `tokens:sync`.
- The **safe sequence** (§4.3).
- The **verification triad**: (1) `check-types` (TypeScript), (2) `build-storybook` +
  Chromatic snapshots, (3) **run the actual app** + spot-check real routes. `tsc` is
  blind to Tailwind silent no-ops; Storybook is blind to story-unreachable code;
  neither catches the other's gaps — all three are necessary.

The sync-specific guardrails (1, 2, 6) are **also** surfaced in
`references/sync-adapters.md` / `token-sync-layer` where they're applied.

---

## 8. Manifest changes (`design-system.json`)

Bump `schemaVersion` 3 → 4. **New sections only — no existing field changes.**

```jsonc
"audit": {
  "codeSurface": { "scssColorVars": 692, "tailwindColorClasses": 230, "jsColorsUsages": 74, "rawHexRgba": 143, "svgFills": 430 },
  "figmaInventory": { "variables": 0, "bindings": 0, "textStyles": 0, "effectStyles": 0, "modes": [] },
  "percentSemantic": null,
  "ranAt": "<ISO>"
},
"tokenCrosswalk": {
  "path": "tokens/crosswalk.json",
  "statusCounts": { "aligned": 0, "renamed": 0, "driftFix": 0, "added": 0, "mappedNearest": 0 },
  "validatorPassing": null
},
"retrofit": {
  "phase": "audit",            // audit | refine | rebind | sync | baseline | code | cleanup | done
  "startedAt": "<ISO>",
  "completedAt": null,
  "journalScaffolded": false
},
"figma": {
  "libraryPublished": null     // B3: null = unknown/ask; true/false once detected or answered
}
```

Extend `tokens.intakeMode` enum with `"retrofit"`. Honor immutables: `workspace.origin`
set once; `completedSkills` append-only; no skill writes another skill's fields.

---

## 9. Out of scope

- Automating Figma library publishing (not exposed by the API; user-only, plan-gated
  — see feature #6). We only *detect or ask*, never publish.
- Non-color token retrofits beyond what the case study covered (type/spacing/radius
  follow the same crosswalk pattern but aren't separately specced here).
- Rewriting greenfield skills — brownfield is added as **branches**, greenfield paths
  are untouched.

---

## 10. Bug → fix traceability

| Bug | Fixed by |
| --- | --- |
| B1 (0-variables false read) | §3 + `design-system-audit` step 2 + `figma-environment-setup` reads |
| B2 (assumed no text styles) | §3 (per-class independent reads) |
| B3 (publish-state assumption) | §3 + `figma.libraryPublished` manifest field + detect-or-ask |
| B4 (phantom bridge ports) | §3 + `figma-environment-setup` bridge-port preflight hardening |
