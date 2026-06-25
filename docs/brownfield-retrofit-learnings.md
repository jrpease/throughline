# Brownfield Design-System Retrofit — Learnings & Plugin Recommendations

> **Source case study:** the Sweet app token-system redesign (PR #443). A mature
> Next.js codebase **and** an already-populated Figma file were reconciled and
> refactored onto a two-tier (primitive + semantic) token system across phases 0–4.
> This is the *brownfield* scenario — the opposite of the greenfield assembly line
> the plugin is built around today. This doc captures what we learned and what the
> plugin should add to support these retrofits smoothly.

## The core gap

Every current skill assumes **greenfield**:

- `token-builder` — "starting the foundation of a design system"
- `repository-builder` — "graduate the local folder into a real monorepo"
- `design-system-status` — only reads a local `design-system.json`
- `component-builder`, `storybook-chromatic-builder`, etc. — build *new* artifacts

Nothing handles: **"a mature codebase AND a populated Figma file already exist —
reconcile and retrofit them onto tokens."** A brownfield retrofit runs almost
backwards from greenfield: you start from two mature, *drifted* artifacts and
converge them, without breaking a live app or unbinding existing Figma components.

It needs its own front door and its own methodology.

---

## Recommended new skills

### 1. `design-system-audit` — the missing front door

Before touching anything, measure both sides. This is what `design-system-status`
would be if it assessed an *external* system instead of a local JSON.

- **Grep the codebase to size the retrofit surface** (this drove every scheduling
  decision). On Sweet:

  | Surface | Count |
  | --- | --- |
  | SCSS color vars (`$primary-*`, `$grey-*`) | 692 |
  | Tailwind color classes (`bg-primary-red`…) | 230 (44 files) |
  | `Colors.*` JS usages | 74 |
  | Raw hex + `rgba()` literals | ~143 |
  | SVG hardcoded fills | 430 |
  | **Total color decisions** | **≈1,100** (+430 SVG) |

- **Inventory the existing Figma file**: variable count, **binding count** (Sweet
  had 1,674), text styles, modes.
- **Report "you're already N% semantic."** Sweet was ~90% — that single finding is
  what made this a *rename + cleanup* rather than a rewrite. Surface it early so
  users right-size the effort.

### 2. `token-crosswalk-builder` — the backbone artifact

The single most important methodology innovation, and it has no skill today.
A persistent **three-way map: new token ↔ old Figma token ↔ code identifier.**

- Columns: `newToken`, `newValue`, `tier`, `figmaOld`, `codeTokens[]`,
  `status`, `recommendedSemantic`.
- `status` ∈ `aligned | renamed | drift-fix | added | mapped-nearest`
  (Sweet: 151 renamed, 42 added, 12 aligned, 3 mapped-nearest, 2 drift-fix).
- Ship a **reverse index** (code symbol → new token) that semi-automates the
  SCSS/Tailwind swaps.
- It's machine-readable because it *drives* the code retrofit and a validation
  gate: `tokens:validate` must pass 210/210 (resolved value == new value).

### 3. `retrofit-planner` — the safe sequence

Encode the phase structure that worked:
**audit → refine-in-place → rebind components → sync layer → capture baseline →
retrofit code → remove old outputs.** Non-obvious ordering rules:

- **Refine in place, never delete-and-recreate** variables — preserve Figma IDs or
  every binding (1,674 of them) breaks.
- **Capture a Chromatic baseline *before* the code retrofit** — the only way to
  distinguish intended drift-fixes from regressions.
- **Dual-output transition**: new + old tokens coexist; delete old outputs *only*
  after a zero-reference grep passes.
- **Verify with the actual app, not just the build** (see guardrails).

---

## Existing skills — add brownfield-aware branches

| Skill | Add |
| --- | --- |
| `token-builder` | A "refine-in-place" path: detect existing variables, rename preserving IDs, run a **binding-survival audit** (count bindings before/after). Plus the Figma gotchas below. |
| `token-sync-layer` | Bake in the transforms we discovered the hard way: emit alpha as `rgb(… / <alpha-value>)` **channels, not raw CSS vars** (so Tailwind `/opacity` modifiers survive); normalize opacity **0–100 (Figma) → 0–1 (CSS)**; round **float32 noise at the export boundary** (`Math.round(v*100)/100`). |
| `storybook-chromatic-builder` | "Baseline before retrofit" guidance + the verification triad; explicit warning that **`build-storybook` only compiles story-reachable SCSS** and **Chromatic — not `tsc`/build — is the source of truth** for color-utility removal. |
| `figma-environment-setup` | A path for connecting to an **existing populated file**: capture a version checkpoint / baseline export for rollback *before* any mutation. |

---

## Guardrails to encode as explicit "DON'T" rules

Each cost real debugging time. Make each a hard rule in the relevant skill.

1. **Don't bind line-height/letter-spacing variables to text styles.** Figma stores
   them as PERCENT; a unitless ratio var (`1.6`) rebinds as `1.6px` — catastrophic.
   **Font-size binding only** (px→px is safe). On Sweet: 55/55 font-size bound,
   0/58 line-height bound, by design.
2. **Don't normalize float32 in Figma** — it's a no-op (Figma re-quantizes to
   float32 on store). Normalize at the export boundary instead.
3. **Don't delete-and-recreate variables** to rename — it unbinds everything.
   Rename in place to preserve IDs.
4. **Don't trust `tsc`/build to catch Tailwind color-utility removal** — deleted
   utilities become *silent no-ops*. Guard repo-wide (all `.tsx/.ts` minus
   generated + tests), and let Chromatic be the net.
5. **Don't assume `build-storybook` exercises all SCSS** — story-unreachable modules
   (and a dead `@import` of a deleted partial) only fail when the real app renders.
   **Run the app, spot-check 5–7 routes** before declaring an SCSS change done.
6. **Don't carry `/opacity` modifiers onto var-based tokens** — convert to
   `color-mix(in_srgb, var(--…) NN%, transparent)` or channel-based alpha.
7. **Don't hand-edit generated files** — change the source, re-run `tokens:sync`.

---

## Reusable tooling the plugin should ship

Generalizable scripts the retrofit leaned on — worth shipping, not just describing:

- **Color-usage grep** — the surface-measurement worklist generator.
- **Crosswalk builder + reverse index + validator** — the backbone + its CI gate.
- **Binding-survival audit** — count Figma bindings before/after a rename.
- **Repo-wide token-removal guard** — grep all `.tsx/.ts` (minus generated/tests)
  for references to about-to-be-deleted utilities.

---

## Meta-practice: the decision journal

This project kept a `docs/design-system/` journal across many sessions:
`specs/ → plans/ → spikes/ → findings/ → decisions/ → handoffs/`. That discipline is
*why* all of the above could be reconstructed after the fact. The plugin could
scaffold this journal for any long, multi-session retrofit — it's the difference
between learnings that survive and learnings that evaporate at the end of a session.

---

## Verification triad (carry into every retrofit)

`tsc` is blind to Tailwind silent no-ops. Storybook is blind to story-unreachable
code. Neither catches the other's gaps. All three are necessary:

1. `check-types` (TypeScript)
2. `build-storybook` (+ Chromatic snapshots) — visual regression net
3. **run the actual app** + spot-check real routes
