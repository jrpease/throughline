# Component documentation record

The canonical, folder-resident source of truth for a component's usage
documentation. One JSON file per component at
`design-system/docs/components/<ComponentName>.doc.json`. Every other
documentation surface (Figma component description, the doc card, Storybook
autodocs/MDX, the AI digest) is a **projection** rendered from this file — never
authored independently.

It lives in the working folder from the moment a component is built (exactly like
`design-system.json`), so it exists during the Figma-only *folder* stage, before
any repo. The path stays `design-system/docs/` across folder→repo; files never
move.

## Why JSON (not YAML)

The plugin's scripts are zero-dependency and there is no YAML parser available, so
the record is JSON to keep `docs:check` and `docs:digest` able to parse it
deterministically. JSON is equally machine-legible for AI consumers.

## Schema

```json
{
  "name": "Button",
  "summary": "Triggers an action or event.",
  "description": "A clickable control that initiates an action…",
  "whenToUse": ["Submitting a form", "Confirming a decision"],
  "whenNotToUse": ["Navigating to a new page — use a Link"],
  "variants": {
    "type": { "primary": "Highest-emphasis action…", "secondary": "…", "ghost": "…" },
    "size": { "sm": "…", "md": "…", "lg": "…" }
  },
  "states": { "hover": "…", "focus": "…", "disabled": "…", "loading": "…" },
  "dos": ["Lead with a verb", "One primary button per view"],
  "donts": ["Don't use for navigation", "Don't stack >2 primaries"],
  "accessibility": {
    "role": "button",
    "keyboard": ["Enter / Space activates"],
    "notes": ["Icon-only buttons need an aria-label"]
  },
  "tokensUsed": ["color.bg.primary", "spacing.sm", "radius.md"],
  "status": "stable",
  "updatedAt": "2026-07-14",
  "provenance": {
    "description": "ai-inferred",
    "dos": "best-practice+user",
    "accessibility": "w3c-apg"
  }
}
```

### Fields (v1 core)

- **Required:** `name`, `summary`, `description`.
- **Optional content:** `whenToUse`, `whenNotToUse`, `variants`, `states`, `dos`,
  `donts`, `accessibility`, `tokensUsed`.
- **Lifecycle:** `status` (`draft`|`beta`|`stable`|`deprecated`), `updatedAt` (ISO date).
- **`provenance`** — per-block author source, one of `imported`, `ai-inferred`,
  `best-practice`, `w3c-apg`, `framework`, `user`, or a `+`-joined combination
  (e.g. `best-practice+user`). Regeneration **re-infers** a block whose
  provenance includes `ai-inferred`, `framework`, `best-practice`, or `w3c-apg`,
  and **never overwrites** one whose provenance includes `user` or `imported`.
  Every value is assigned to exactly one of those two tiers: generated content is
  re-inferred, human input (`user`) and pre-existing external content
  (`imported`) are protected. Protection takes precedence: a combination that
  contains both — `best-practice+user`, say — is protected. A block is
  re-inferred only when it carries no `user` or `imported` marker at all. A
  protected block may still be rewritten when the user approves the rewrite at
  the record-approval gate; the result is stamped `imported+user`, which is
  protected from then on and never re-proposed.

Deferred to a later version (do not emit in v1): `anatomy`, `content` (writing
guidelines), `examples`.

## Fingerprint algorithm

`fingerprint = sha256(stableStringify(record_without_provenance)).slice(0, 16)`

- `provenance` is **excluded** — it is authoring metadata, not projected content.
- `stableStringify` sorts object keys recursively so formatting/key-order never
  affects the hash.
- The 16-hex-char result is the stamp recorded per surface and per canonical file.

Implemented once in `scripts/lib/doc-record.mjs` (`canonicalFingerprint`) and
reused by `docs:check`, `docs:digest`, and — for the Figma surfaces — by the
Figma-connected skill computing the identical hash over the description content.

## Projection mapping

| Block(s) | Figma component description | Doc card | Storybook autodocs (MDX) + JSDoc | AI digest |
|---|---|---|---|---|
| summary, description | ✔ | ✔ | ✔ | ✔ |
| whenToUse / whenNotToUse | ✔ | ✔ | ✔ | ✔ |
| variants, states (meanings) | — | ✔ legend | ✔ argTypes | ✔ |
| dos / donts | ✔ | ✔ | ✔ | ✔ |
| accessibility | ✔ | ✔ | ✔ | ✔ |
| tokensUsed | — | — | ✔ | ✔ |

Each surface carries a fingerprint stamp of the record it was rendered from:
- **Figma component description** — a trailing marker line `<!-- tl:doc <fp> -->`.
- **Doc card** — a named metadata node `Doc Fingerprint` holding `<fp>`.
- **Storybook MDX** — a frontmatter field `docFingerprint: <fp>`.

## Manifest pointer (`components.meta[name].doc`)

The manifest stores pointers + per-surface fingerprints, never content:

```json
{
  "doc": {
    "path": "design-system/docs/components/Button.doc.json",
    "fingerprint": "<canonical fingerprint at last render>",
    "surfaces": {
      "figmaDescription": { "src": "<fp>", "render": "<hash of description text>" },
      "docCard":          { "src": "<fp>", "render": "<hash of card content>", "renderer": "4" },
      "storybookMdx":     { "src": "<fp>", "render": "<hash of mdx file>", "file": "packages/ui/src/Button/Button.mdx" }
    }
  }
}
```

- `src` — the canonical fingerprint the surface was rendered from (detects **stale**).
- `render` — a hash of the surface's rendered content at render time (detects
  **edited**, for surfaces the tooling can re-read).
- `file` — repo-relative path for code surfaces so `docs:check` can re-read them.
- `renderer` — (docCard only) the layout version of the builder that last
  rendered the card: `DOC_CARD_RENDERER_VERSION` in `scripts/lib/doc-card-plan.mjs`,
  currently `"4"`. Additive and optional — absence means the card predates the
  versioned builder. Stamped from the builder's returned summary, never by
  re-reading the card.

## Drift + reconciliation contract

`docs:check` classifies each surface:
- **canonical-changed** — the `.doc.json` fingerprint ≠ `doc.fingerprint`.
- **stale** — `surface.src` ≠ current canonical fingerprint.
- **edited** — a re-readable surface's current content hash ≠ `surface.render`.
- **layout-upgrade-available** — informational, never failing, docCard only:
  `surfaces.docCard.renderer` is missing or lower than the current
  `DOC_CARD_RENDERER_VERSION`. The card's content is not in drift — its layout
  predates the current builder. Re-render on next touch (no unprompted Figma
  writes; untouched brownfield cards must not generate a standing warning wall).
- **missing-surface** — a repo surface that declares a `file` which is now gone.
  Failing, and distinct from `edit-unverified`: the surface *was* re-readable and
  its rendered output has been deleted, not merely unreadable this run.
- **edit-unverified** — a surface the CLI can't read (Figma); checked live by the
  Figma-connected skill instead.

Reconciliation is **per item, reviewable**: for each drift the user chooses
**re-render** (canonical wins) or **pull-back** (fold the surface edit into the
record), landed as a PR. **Brownfield first run is an adoption**, not a re-render:
existing surface content is claimed into the record as `provenance: imported` and
fingerprints are stamped, rather than treated as `edited` drift.
