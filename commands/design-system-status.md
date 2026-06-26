---
description: Show a plain-language summary of the current design system state — what's set up, what's not, and sensible next steps — read from design-system.json.
---

Read `design-system.json` and present a clear, plain-language summary of where
the user's design system stands. This is the "where am I?" command — especially
valuable for users who don't want to read raw JSON.

Report, in friendly prose (not a JSON dump), scaled to `user.codingLevel`:

- **Figma:** connected? which mechanism? which file?
- **Tokens:** primitives / semantic / styles built? how many collections? intake
  mode? two- or three-tier?
- **Foundations page, Icons:** built? icon library + version + whether the code
  package is installed?
- **Components:** which have been built in Figma?
- **Repo:** what stage (folder / local-git / github)? remote?
- **Sync:** which platforms/adapters? any custom adapters? when last run?
- **Storybook:** initialized? Chromatic? Code Connect?
- **Coding level + UI framework** on record.
- **Retrofit** (brownfield only — skip the whole block if `tokens.intakeMode` isn't
  `"retrofit"` and `audit.ranAt` is null):
  - Audit: has it run (`audit.ranAt`)? If so, the code-surface counts
    (`audit.codeSurface`), the Figma inventory (`audit.figmaInventory` — variables,
    bindings, text/effect styles, modes), and how semantic the system is
    (`audit.percentSemantic`).
  - Crosswalk: is it built (`tokenCrosswalk.path`)? The status counts
    (`tokenCrosswalk.statusCounts`) and whether the validator is passing
    (`tokenCrosswalk.validatorPassing`).
  - Retrofit progress: which phase (`retrofit.phase`), and whether the decision journal
    was scaffolded (`retrofit.journalScaffolded`).

Then suggest **sensible next steps** based on what's missing — e.g. "You've got
tokens and a repo but haven't synced yet — want to run `/sync-figma-tokens`?" or
"No components yet — want to build your foundational set?" Offer, don't force.

For a brownfield system, suggest the next retrofit step from the state: no audit yet
→ "want to run `design-system-audit` to size the retrofit?"; audited but no crosswalk
→ "want to build the crosswalk with `token-crosswalk-builder`?"; mid-retrofit
(`retrofit.phase` set, not `"done"`) → "want to resume the retrofit at the `<phase>`
phase with `retrofit-planner`?".

If `design-system.json` doesn't exist, explain that no design system has been
set up in this folder yet and offer to run `figma-environment-setup` to start.
