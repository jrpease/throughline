# Crosswalk schema — `crosswalk.json`

The crosswalk is the backbone artifact of a brownfield retrofit: a persistent,
machine-readable **three-way map** between the new token, the old Figma variable,
and the old code identifier(s). It drives the code retrofit and the
`tokens:validate` CI gate. Built by the `token-crosswalk-builder` skill; consumed
by the validator and reverse-index scripts (`scripts/`). The machine contract is
`${CLAUDE_PLUGIN_ROOT}/scripts/crosswalk.schema.json`; this doc is its prose home.

## Where it lives

`packages/tokens/crosswalk.json`, beside the DTCG intermediate
`packages/tokens/dtcg/tokens.json` that `token-sync-layer` emits. The manifest's
`tokenCrosswalk.path` records the actual path. (Spec §8 shows `tokens/crosswalk.json`
illustratively; the standard monorepo path is `packages/tokens/crosswalk.json`.)

## Top-level shape

```jsonc
{
  "$schema": "./crosswalk.schema.json",
  "version": 1,
  "tokens": [ /* rows */ ]
}
```

`$schema` is optional but recommended — editors use it to validate the file against `crosswalk.schema.json` inline.

## Row columns

| Field | Type | Meaning |
| --- | --- | --- |
| `newToken` | string | DTCG dot-path, exactly as `token-sync-layer` emits it (`color.text.primary`). This is the key the validator resolves against the DTCG tokens. |
| `newValue` | string | The **resolved leaf value** — aliases followed to a literal. For a semantic token whose `$value` is `{color.gray.900}`, this is the primitive literal (`#111827`), never the `{…}` reference. |
| `tier` | `"primitive"` \| `"semantic"` | Which tier the new token belongs to. |
| `figmaOld` | string \| null | The old Figma variable name/path being reconciled, or `null` for an `added` token with no prior Figma variable. |
| `codeTokens` | string[] | Old code identifiers this token replaces (`$primary-red`, `bg-primary-red`, `Colors.primaryRed`, `--primary-red`). May be `[]`. Drives the reverse index. |
| `status` | enum | The reconciliation status — see below. |
| `recommendedSemantic` | string \| null | An optional suggested semantic token to migrate a raw/primitive usage toward. |

## `status` enum

Kebab-case, from the Sweet case study (151 renamed, 42 added, 12 aligned,
3 mapped-nearest, 2 drift-fix):

| `status` | Meaning |
| --- | --- |
| `aligned` | New token already matches the old one in name and value — no change needed. |
| `renamed` | Same value, new name. The bulk of a ~90%-semantic retrofit. |
| `drift-fix` | The old value was wrong/inconsistent; the new value intentionally differs (a deliberate fix, distinguishable from a regression via the Chromatic baseline). |
| `added` | A new token with no prior Figma variable (`figmaOld: null`). |
| `mapped-nearest` | No exact old equivalent; mapped to the nearest new token (a judgment call worth review). |

## Status-count rollup (kebab → camelCase)

The manifest's `tokenCrosswalk.statusCounts` uses camelCase keys. The validator
emits the rollup in this shape so the skill can copy it straight into the manifest:

| Row `status` | `statusCounts` key |
| --- | --- |
| `aligned` | `aligned` |
| `renamed` | `renamed` |
| `drift-fix` | `driftFix` |
| `added` | `added` |
| `mapped-nearest` | `mappedNearest` |

## The validation gate

`tokens:validate` resolves every `newToken` against `packages/tokens/dtcg/tokens.json`
(following `{…}` alias chains to a leaf) and asserts the resolved value equals the
row's `newValue`, for **every** row (the N/N gate — Sweet passed 210/210). Value
comparison is case-insensitive and trimmed, so `#EF4444` and `#ef4444` are equal. A
token present in the crosswalk but absent from the DTCG source is a failure
(reported as *missing*), never silently skipped — this honors the read-discipline
principle in `${CLAUDE_PLUGIN_ROOT}/references/brownfield-retrofit.md`.

## Worked example

```jsonc
{
  "$schema": "./crosswalk.schema.json",
  "version": 1,
  "tokens": [
    {
      "newToken": "color.gray.900",
      "newValue": "#111827",
      "tier": "primitive",
      "figmaOld": "grey/900",
      "codeTokens": ["$grey-900"],
      "status": "renamed",
      "recommendedSemantic": "color.text.primary"
    },
    {
      "newToken": "color.text.primary",
      "newValue": "#111827",
      "tier": "semantic",
      "figmaOld": "Text/Default",
      "codeTokens": ["$text-default", "text-grey-900"],
      "status": "renamed",
      "recommendedSemantic": null
    },
    {
      "newToken": "color.surface.raised",
      "newValue": "#ffffff",
      "tier": "semantic",
      "figmaOld": null,
      "codeTokens": [],
      "status": "added",
      "recommendedSemantic": null
    }
  ]
}
```
