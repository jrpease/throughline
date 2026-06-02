# Coding level — calibrating how much to explain

The user has a `user.codingLevel` recorded in the manifest. It governs **how
much code/git/terminal concepts are explained** in the code-touching skills
(repository-builder, token-sync-layer, storybook-chromatic-builder, and the
orchestrator). It is set once in `figma-environment-setup` (skill 0) and can be
changed anytime the user asks.

## Critical principle: level changes EXPLANATION, never CAPABILITY

A `new` user and a `comfortable` user get the **exact same repo, the exact same
secrets setup, the exact same outputs.** The only thing that changes is how much
the skill narrates concepts along the way. Never give a beginner a lesser
system; never withhold a step. Same destination, different amount of teaching.

The **hard safety rules never scale** with level. Regardless of level:
- A secret value (token, key, password) never passes through the chat.
- Secrets never get committed to code; env files holding them are gitignored.
- Claude never enters credentials into web forms or creates secrets on the
  user's behalf — it tells the user exactly where to put them.

Only the *explanation* of these rules scales, not the rules themselves.

## The three levels

- **`new`** — has never set up a GitHub repo, made an env file, or used a
  terminal much. **Default if unsure.** Explain every concept the first time it
  appears, in one plain sentence: what a repo is, what an env file is, why
  secrets are gitignored, what a "secrets vault" / GitHub Actions secret is.
  Give exact click paths for anything outside the chat. Verify each step worked
  before moving on (e.g. confirm CI went green after they add a secret). Be warm
  and patient; assume zero terminal fluency beyond what you walk them through.

- **`some`** — has used git/GitHub and run commands, but isn't an expert. Brief
  reminders, not full lessons. Skip "what is a token" but still confirm the
  specific click path or command, and still verify the important steps. Assume
  they can run a command you give them without hand-holding, but don't assume
  they remember exactly where GitHub's secrets settings live.

- **`comfortable`** — fluent with git, env files, CI, and secrets. Terse and
  direct. Name the action and move on: "Scaffold pnpm+Turborepo, add
  `.env.example`, gitignore `.env`. Put `CHROMATIC_PROJECT_TOKEN` in `.env` and
  as a repo Actions secret." No concept-teaching, no click paths unless asked.
  Assume terminal fluency.

## How to determine the level (skill 0)

Don't ask "are you technical?" — self-assessment is unreliable and people
over- or under-claim. Anchor to **concrete, recognizable experiences** and infer
the level from the answers:

- "Have you set up a GitHub repository before?"
- "Have you used a command line / terminal before?"
- "Have you worked with environment variables or `.env` files?"

Map roughly: no to most → `new`; yes to some, hesitant on others → `some`; yes
and casual about all → `comfortable`. Confirm the inferred level in plain terms
("Sounds like you're comfortable with the code side — I'll keep things brief and
skip the basics. Tell me if you want more detail anytime.") and record it.

When in doubt, choose the **lower** level — over-explaining is recoverable
(the user says "you can skip that"), under-explaining can strand a beginner.

## Applying it

Every code-touching skill reads `user.codingLevel` at the start and calibrates
its prose accordingly. The skill's *actions* are identical across levels; only
the surrounding explanation differs. If the user seems mismatched to their
recorded level mid-task (a `comfortable` user asking what an env file is, or a
`new` user breezing ahead), gently offer to adjust it.
