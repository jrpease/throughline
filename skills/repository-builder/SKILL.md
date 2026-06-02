---
name: repository-builder
description: Graduate the local design-system folder into a real monorepo — a pnpm + Turborepo workspace with packages for tokens and UI components and room for apps — and walk the user from a plain folder to local git to a GitHub remote with PRs and CI. Use this when the user wants to set up a repo, create a GitHub repository, add version control, turn their folder into a real project, or prepare to sync tokens to code. Also trigger when the user mentions monorepo, Turborepo, pnpm workspace, GitHub, version control, or when the token-sync or Storybook skills report that a repo isn't set up yet. Make sure to use this skill when someone is moving from the Figma/design phase into the code phase, even if they just say "I want to turn this into code" — it's the bridge between the two halves.
---

# Repository builder

Turns the user's working folder into a scalable monorepo and advances their
version-control stage. Defaults: **pnpm + Turborepo**, with a layout ready to
grow into a full app:

```
my-design-system/
├── design-system.json        (the manifest, already here)
├── package.json              (workspace root)
├── pnpm-workspace.yaml
├── turbo.json
├── .gitignore
├── .env.example
├── packages/
│   ├── tokens/               (synced token output lands here — skill 6)
│   └── ui/                   (components / Storybook live here — skill 7)
└── apps/                     (empty, ready for a Next.js app later)
```

## Calibrate first

Read `user.codingLevel` from the manifest and `${CLAUDE_PLUGIN_ROOT}/references/coding-level.md`.
Everything below describes the *actions*, which are identical for every user.
**How much you explain** each concept scales with the level — `new` gets plain-
language teaching of repos, env files, and secrets; `comfortable` gets terse
action statements. The hard secret-safety rules never scale.

## The folder → local-git → github progression

The user is at one of three `workspace.stage` values. This skill advances them
one step at a time, introducing each concept only when its payoff is concrete.
Read the current stage from the manifest and pick up where they are.

### Stage A → scaffold the monorepo (still just a folder)

Create the workspace files (root `package.json`, `pnpm-workspace.yaml`,
`turbo.json`, `packages/tokens`, `packages/ui`, `apps/`, a sensible
`.gitignore`, and a `.env.example`). Record `repo.packageManager` = `pnpm`,
`repo.monorepo` = `turborepo`.

For `new` users, explain in one line what this is: "A monorepo is just one folder
that holds several related projects together — here, your tokens and your
components, with room to add an app later." For `comfortable` users, just state
what you scaffolded.

Checkpoint: show the structure, let the user look before committing anything.

### Stage B → add local version history (`git init`)

This is the soft-nudge seam from the design: the moment code exists, version
history earns its keep. If `workspace.stage` is still `folder`, offer it:

- `new`: "Right now your folder has no 'history' — if something breaks there's no
  undo. Git gives your folder a memory: every change is saved as a checkpoint you
  can see and roll back. Want me to turn that on? It's one step and stays entirely
  on your computer — nothing goes online yet."
- `comfortable`: "Want me to `git init` and make the first commit?"

If yes: `git init`, ensure `.gitignore` covers `node_modules`, `.env`, build
output; make an initial commit. Set `workspace.stage` and `repo.stage` to
`local-git`. Confirm the user can see they now have version history.

**Do not force git.** A user can stay in `folder` if they insist, but most will
want it once there's code. The token-sync skill needs at least `local-git`, so
it will re-offer this if skipped.

### Stage C → connect to GitHub (remote, PRs, CI)

Only when the user wants what GitHub provides — backup, PRs for token-sync
review, CI for Storybook/Chromatic. Frame it as "push what you already have
somewhere safe and shareable," not "make an empty repo and figure out what goes
in it" — they already have a working local repo.

**Detect `gh` (the GitHub CLI):**

- If `gh` is present and authenticated: offer to run `gh repo create` — but
  **show the exact command and what it will do first**, and get approval before
  running. A `new` user may not know what that command does to their account, so
  explain: "This creates a repository on your GitHub account and connects your
  local folder to it." Never create the repo, set branch protection, or change
  settings silently.
- If `gh` is absent: **first recommend installing it.** It's the single thing
  that turns repo creation from a fiddly multi-step browser chore into one
  automated command — exactly the friction this plugin exists to remove. Say so
  plainly and offer to guide a quick one-time setup:
  - **Install:** macOS `brew install gh`; Windows `winget install GitHub.CLI`;
    Linux via the system package manager (or cli.github.com). Then authenticate
    with `gh auth login` — walk `new` users through the browser prompts.
  - Never install software silently — show the command, explain what it does, get
    a yes first. Once installed and authenticated, proceed with the `gh` path
    above (show the `gh repo create` command, get approval, then run it).
  - **If they decline or can't install:** fall back to the manual browser path
    with the exact click path. For `new` users be maximally explicit: go to
    github.com, click New repository, name it, leave it empty (don't initialize
    with a README), Create, then copy the commands GitHub shows for "push an
    existing repository" and run them. Verify the push succeeded.

On success, set `workspace.stage` and `repo.stage` to `github` and record
`repo.remote`. Append `repository-builder` to `completedSkills`.

## Secrets: the part most people have never done

This is where users with low coding experience get stuck — many have never made
an env file or added a secret to a "vault." Handle it with care, scaled to
`codingLevel`, but with the hard rules constant. There are **two distinct
homes** for a secret, and conflating them is a common mistake — make the
distinction explicit for `new`/`some` users:

1. **Local development → a `.env` file.** A plain text file in the repo root
   holding `KEY=value` lines, used when running things on your own computer.
   **It must be gitignored** so it never gets committed. The repo ships a
   `.env.example` (no real values, just the key names) as a template — explain
   that `new` users copy it to `.env` and fill in real values.
2. **Production / CI → the host's secrets store.** GitHub Actions has its own
   encrypted **secrets vault** (Settings → Secrets and variables → Actions). CI
   can't read your local `.env`, so any secret CI needs (e.g.
   `CHROMATIC_PROJECT_TOKEN`) must be added there separately.

The hard rules, regardless of level:
- The secret **value never passes through this chat.** Don't ask the user to
  paste it to you. Tell them the key name and exactly where the value goes; they
  place it themselves.
- Secrets **never get committed.** `.env` is gitignored; only `.env.example`
  (key names, no values) is committed.
- Claude **never** types a secret into a web form or creates a GitHub secret on
  the user's behalf — it gives the click path and the key name.

For `new` users, teach the *why* once ("a secret key is like a password for a
service; if it's committed to code, anyone who sees your repo can use it — that's
why it lives in a gitignored file locally and an encrypted vault in
production"). Then give the literal steps. **Verify**: after they add a secret,
have them confirm it's set (e.g. re-run the workflow and check CI goes green),
because a beginner who pastes it wrong has no other signal.

This skill itself usually only sets up `.env.example` and the `.gitignore`. The
actual secret *values* (Chromatic, etc.) get added when the skill that needs
them runs (Storybook/Chromatic in skill 7) — but explain the env-file concept
here so it's familiar by then.

## Hand off

Tell the user what's unlocked at their new stage. If they came here heading
toward token sync, point them to it ("now we can turn your Figma tokens into real
code files in `packages/tokens`"). Don't auto-run the next skill.

## What this skill must NOT do

- Never commit a `.env` or any secret value.
- Never create a GitHub repo, branch protection, or secret silently — always
  show the command/path and get approval.
- Never enter a secret into a web form or accept a secret value in chat.
- Never force git on a user who declines (but explain what they're deferring).
- Never give a beginner a lesser setup — only less explanation is fine, never
  fewer capabilities.
