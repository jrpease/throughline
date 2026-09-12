# The verification proof bundle (`design-system/proof/`)

Each stage of the system leaves a durable record of what it changed, which checks
ran, what each one found, and why it was allowed to advance. That record is the
proof bundle. It exists because "run it twice, get the same structure" proves
idempotency, not quality — and because the checks that do prove quality (the
Figma read-back, a reviewer verdict, a build result) are prose today, and prose
evaporates when the run ends.

The bundle is **the record, not the enforcement mechanism**. Gates enforce:
`docs:check` owns documentation drift, the `figma-executor` read-back owns
structure, `adherence:check` owns code adherence. The bundle persists what each
gate found. The `verify:check` gate reads it, recomputes what it can off disk,
and fails when a stored result and a fresh run disagree.

## Where it lives

`design-system/proof/<stage>.json` — one file per stage, in the user's working
folder, from the first component built. It is folder-resident exactly like
`design-system/docs/` (see
`${CLAUDE_PLUGIN_ROOT}/references/component-doc-schema.md`), so a stage can
record an entry during the Figma-only *folder* stage, before any repo exists.
The path is stable across folder→repo; files never move.

## The file shape

`{ "stage": "<name>", "subjects": { "<subject>": <entry> } }`

A **subject** is the thing the entry is about: a component name for a
per-component stage, or the literal `"system"` for a stage that is not
per-component. One entry per stage-and-subject, latest wins — the store models
current state, not history, the same way the manifest does.

## The entry shape

`{ at, changed, checks, screenshot?, advancedBecause }`

- `at` — ISO timestamp, **supplied by the caller**. `Date.now()` is not available
  in every execution context a skill runs in, so the recorder never invents it.
- `changed` — array of one-line strings saying what this stage changed. May be
  empty.
- `checks` — non-empty array of `{ name, method, result, evidence }`, where
  `method` is `"derived"` or `"attested"`, `result` is `"pass"` or `"fail"`, and
  `evidence` is a string.
- `screenshot` — optional pointer: a Figma node id, or a repo-relative path.
- `advancedBecause` — one line saying why the stage was allowed to advance.

**Pointers, never content.** `evidence` and `screenshot` point at things; they do
not carry them. This is the same rule `components.meta[name].doc` follows, for
the same reason: the store is committed to the repo and read by humans. A diff
of a stage file should be legible, and a design system's history should not carry
inlined screenshots or file contents.

## `derived` vs. `attested`

This is the load-bearing distinction in the whole store, and the two are not
equal.

- **`derived`** — `verify:check` recomputes the check off disk on every run. The
  stored result is a **cache**. When the rerun disagrees with it, the run fails as
  `proof-contradicted`. A derived result is trustworthy because it is not
  trusted.
- **`attested`** — an agent observed it live, somewhere the CLI cannot look:
  Figma, a build it ran, a review it received. It is printed on the report's
  informational line and is **never the reason a run passes**.

The house precedent for the honest half is `edit-unverified` in
`${CLAUDE_PLUGIN_ROOT}/references/component-doc-schema.md` — `docs:check` records
what it cannot read without pretending it verified it. Attested checks are the
same posture: recorded, visible, never load-bearing.

## The manifest pointer

`design-system.json` carries a top-level `verification` key — `null` until the
first stage records an entry. Content on disk, pointers and hashes in the
manifest, exactly as `components.meta[name].doc` does it. See
`${CLAUDE_PLUGIN_ROOT}/references/manifest-schema.md`.

```json
{
  "verification": {
    "path": "design-system/proof",
    "stages": {
      "component-builder": {
        "at": "2026-09-12T18:04:00.000Z",
        "adoptedAt": "2026-09-12T17:41:00.000Z",
        "exempt": ["Card"],
        "fingerprint": "3f9c1a7b2d4e6058"
      },
      "token-sync-layer": {
        "at": "2026-09-12T18:20:00.000Z",
        "adoptedAt": "2026-09-12T18:20:00.000Z",
        "fingerprint": "8ab240df1c9e5567"
      }
    }
  }
}
```

- `path` — the store directory.
- `fingerprint` — computed over the **whole stage file**, so a hand-edited entry
  is caught (`proof-stale`), the same way `docs:check` catches a hand-edited
  surface.
- `at` — the timestamp of the latest entry recorded for that stage. It moves with
  every record.
- `adoptedAt` — **write-once**. Set on a stage's first recorded entry and never
  rewritten: the human-readable "when did this system opt in". No gate reads it.
- `exempt` — the names this stage has not yet proven. Present only on the
  per-component stages; a system-wide stage omits the key entirely.

**Skills write all of this only through `verify-check.mjs --record`.** No skill
hand-writes a stage file, and none computes a fingerprint by hand — that is how
the pointer and the file are kept from drifting apart.

### `exempt` is capture-once-then-shrink

Both halves of the rule are load-bearing, and a reader who implements only the
first grandfathers the whole adoption batch:

1. On a stage's **first** record, `exempt` captures **every** name then in
   `components.built`, sorted.
2. On **every** record, the first included, the record's own subject is removed
   from `exempt`.

The list never gains a name. It can only narrow. It is what scopes the
per-component `proof-missing` rule to components the stage has not yet proven:
an existing system that adopts the bundle does not light up with a failure for
every component built before the bundle existed, and a name leaves the list the
moment the stage actually proves that component.

Capture has to read the whole of `components.built` rather than "everything but
this subject", because a run's entire batch is already in `built` before the
record loop reaches the first component. A capture that excluded only its own
subject would permanently exempt its batch-mates — build four components on the
upgrade run and three of them are never owed proof again.

A stage listed in `verification.stages` with **no** `exempt` key at all exempts
**nothing**, not everything. A missing list makes the gate louder, not quieter.

### No gate compares `updatedAt` against `adoptedAt`

However natural it looks, nothing in the verification gate compares
`components.meta[name].updatedAt` against `adoptedAt`. That field has more than
one writer: `storybook-chromatic-builder` refreshes it when it promotes a
component to `"stable"`, which is a different stage from the one that owes the
entry. So a single storying run drags every pre-existing component's timestamp
past `component-builder`'s adoption moment, and a date gate would fail a system
where nothing went wrong. A captured list of names cannot be moved by another
stage's write, and it is readable in the manifest: the exemption is stated
rather than inferred.

For the same reason, neither `adoptedAt` nor `exempt` is derived from the stage
file. Entries are latest-wins, so "the earliest `at` in the file" slides forward
every time the earliest subject is rebuilt.

## The stage vocabulary (v1)

| Stage | Subject |
|---|---|
| `component-builder` | component name |
| `storybook-chromatic-builder` | component name |
| `token-sync-layer` | `"system"` |

The machine-readable copy of that split is `PER_COMPONENT_STAGES` in
`scripts/lib/proof.mjs`, and the full list is `STAGES` beside it. **A change here
must change those constants** — they are what `verify:check` asks "is this stage
keyed by component?"

`/document-component` and the retrofit phases do not emit entries in v1.

## The check names (v1)

| Check | Method | Recorded by |
|---|---|---|
| `structural-read-back` | attested | `component-builder` |
| `state-baseline` | attested | `component-builder` |
| `figma-name` | attested | `component-builder` |
| `review` | attested | the dispatching skill |
| `build` | attested | `storybook-chromatic-builder` |
| `orphan-token` | derived | `storybook-chromatic-builder` |
| `state-incomplete` | derived | `storybook-chromatic-builder` |
| `name-drift` | derived | `storybook-chromatic-builder` |

**`storybook-chromatic-builder` is the only stage that records derived results**,
and it can do that only because it is the one stage that runs `verify:check`
before it records — so it has the results in hand rather than asserting them.
`component-builder` runs at folder stage with no repo to scan, and
`token-sync-layer`'s subject is the system; both record attested checks only.

A derived result sitting in a stage file is a cache the next run recomputes. A
disagreement is `proof-contradicted`.

## A worked example

One stage file with two subjects — `Button`, freshly built and reviewed, and
`Card`, rebuilt without a review:

```json
{
  "stage": "component-builder",
  "subjects": {
    "Button": {
      "at": "2026-09-12T17:41:00.000Z",
      "changed": [
        "Built Button as a COMPONENT_SET with 18 variants",
        "Bound fills, strokes and radius to semantic variables"
      ],
      "checks": [
        {
          "name": "structural-read-back",
          "method": "attested",
          "result": "pass",
          "evidence": "COMPONENT_SET 41:207, 18 children, axes type/size/state"
        },
        {
          "name": "state-baseline",
          "method": "attested",
          "result": "pass",
          "evidence": "state axis: default, hover, focus, active, disabled"
        },
        {
          "name": "figma-name",
          "method": "attested",
          "result": "pass",
          "evidence": "Figma node named Button"
        },
        {
          "name": "review",
          "method": "attested",
          "result": "pass",
          "evidence": "approved"
        }
      ],
      "screenshot": "41:207",
      "advancedBecause": "Read-back and review both passed; every variant resolves to bound variables."
    },
    "Card": {
      "at": "2026-09-12T18:04:00.000Z",
      "changed": ["Rebuilt Card with the elevation variant axis"],
      "checks": [
        {
          "name": "structural-read-back",
          "method": "attested",
          "result": "pass",
          "evidence": "COMPONENT_SET 41:418, 6 children, axes elevation/padding"
        }
      ],
      "advancedBecause": "Structure verified; no review requested for a variant-axis rebuild."
    }
  }
}
```
