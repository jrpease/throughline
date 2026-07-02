Run the `component-pipeline` orchestrator skill to take one new component from
Figma all the way to a tested, storied code component.

Ask the user which component they want to add (e.g. "Tooltip"), confirm the goal,
then sequence the stages per the `component-pipeline` rule: build in Figma
(component-builder) → sync any new tokens (token-sync-layer) → build code +
stories (storybook-chromatic-builder), pausing for confirmation between each.

Use the existing settings in `design-system.json` (`project.uiFramework`,
`sync.platforms`, `figma.mechanism`, etc.) rather than re-asking configuration.
Scale explanation to `user.codingLevel`. If foundations are missing, note that
the individual setup skills are the better starting point.

