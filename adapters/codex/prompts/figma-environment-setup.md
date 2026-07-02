# Figma environment setup

This skill does three foundational jobs, in order:

1. **Discover where you're working** — find or create the project directory,
   scan what's already there, and set expectations.
2. **Create the local working folder** and write the `design-system.json`
   manifest into it (if not already present from step 1).
3. **Connect Claude to Figma** so later skills can read and write the file,
   then verify the connection works.

It is the required first step. Every other Figma skill does a cheap liveness
check and, if it fails, points the user back here.

## Who you're talking to

Assume the user is design-fluent but may have **never set up a developer tool,
created an API token, or used a terminal before**. Explain every concept the
first time it appears, in one plain sentence. Never assume they know what a
"token", "MCP server", "config file", or "package manager" is. Be warm and
concrete. When you ask them to do something outside the chat (in Figma, on a
website), give the exact click path, not a vague instruction.

Read `.throughline/references/manifest-schema.md` before writing the manifest so you use the
correct field names and defaults.

## Step 0 — Intake (Locate → Scan → Brief)

This step runs before everything else. Establish where you're working, read
what's already there, and set the user's expectations before taking any action.
It has three phases in sequence.

### Phase 1: Locate

Open by surfacing the user's current working directory and presenting three
explicit options — no assumptions made about where they want to work or whether
they have started anything already:

> "Before we get started, I want to make sure we're working in the right place.
> You're currently in: `[current working directory path]`
>
> Where should we set up?
> - **Here** — this directory is where the design system should live
> - **Somewhere else** — I have a project at a different path
> - **A new folder** — create a fresh folder somewhere"

**"Here":** Proceed to the existing manifest check below.

**"Somewhere else":** Ask for the path. Expand it to an absolute path (resolve
`~`, relative segments like `../`, etc.) and verify it exists on disk as a
directory. If it doesn't exist, ask them to double-check the spelling. Once
confirmed, proceed to the existing manifest check.

**"A new folder":** Ask what they'd like to name it and where it should live
(suggest the current directory as the default). Create it. Confirm where it was
created: "I've created `[name]` at `[full path]`." Proceed to the existing
manifest check.

**Existing manifest check:** Before scanning, check whether `design-system.json`
already exists in the confirmed directory.

- **If it exists:** Read it. If `schemaVersion` is out of date, migrate forward
  (add missing fields with defaults, bump `schemaVersion` — do not delete
  unrecognised fields). Tell the user:
  > "Looks like we've worked here before — I'll pick up where we left off."
  Skip Phases 2 and 3. Continue into Step 2 with the existing manifest loaded.

- **If it does not exist:** Proceed to Phase 2.

### Phase 2: Scan

Scan the confirmed directory for the following signals. Check in priority order
— monorepo status is the most consequential and is checked first.

| Signal | What it means |
|---|---|
| `turbo.json` **and** `pnpm-workspace.yaml` both present | Already a monorepo |
| `package.json` present, no `turbo.json` or `pnpm-workspace.yaml` | Repo exists, not yet a monorepo |
| `.storybook/` directory present | Storybook already installed |
| `tokens.json` or `tokens/` directory present | Existing token pipeline |
| `style-dictionary.config.js` or `*.style-dictionary.js` files present | Existing sync layer |

After scanning, write a full `design-system.json` using all schema defaults
from `.throughline/references/manifest-schema.md`, then populate the
`workspace.origin` and `workspace.detectedLayers` fields with the scan results:

```json
"workspace": {
  "origin": "<greenfield|existing-repo|existing-monorepo|unknown>",
  "detectedLayers": {
    "monorepo": <true|false>,
    "storybook": <true|false>,
    "tokens": <true|false>,
    "syncLayer": <true|false>
  }
}
```

**Setting `origin`:**
- No `package.json` found → `"greenfield"`
- `package.json` found, no `turbo.json`/`pnpm-workspace.yaml` → `"existing-repo"`
- Both `turbo.json` and `pnpm-workspace.yaml` found → `"existing-monorepo"`
- Signals present but contradictory or incomplete → `"unknown"`

**Setting `detectedLayers`:** set each boolean independently from the table
above. A directory can have `origin: "existing-monorepo"` and
`detectedLayers.storybook: false` — they are independent fields.

**Do not overwrite `workspace.origin` on subsequent runs.** If it is already
set to a non-null value, skip the scan and proceed to Phase 3.

### Phase 3: Brief

Produce a short, warm, plain-language situational summary. The goal is to set
expectations so nothing downstream feels like a surprise. No jargon. No alarm.
If something requires action before a later skill can run, say so as a
heads-up, not a warning.

**Format:**

> "Here's what I found in `[path]`:
> [plain-language bullet list of detected signals and what they mean]
>
> Here's what that means for us:
> [brief tailored roadmap: what works the same, what will be different, what
> to know before we hit it]
>
> Ready to continue?"

**By scenario:**

*Greenfield (no signals detected) — condensed, no need for the full format:*
> "Clean slate — we're building everything fresh. Ready to continue?"

*Existing single repo (`origin: "existing-repo"`):*
> "Here's what I found in `[path]`:
> - You have an existing repo, but it's not yet set up as a monorepo
> [any additional detected layers, one bullet each]
>
> Here's what that means for us: everything in the Figma phase — tokens,
> components, variables — works exactly the same. When we get to the code
> phase, you'll need to convert this repo to a monorepo first. I'll walk you
> through that step-by-step when we get there — it's a one-time setup.
> Because you already have a system here, we'll start by **auditing** what exists — measuring your current colors in code and what's in your Figma file — so we right-size the work before changing anything. That's the `design-system-audit` step.
> [one line per additional detected layer, e.g.: 'Storybook is already installed
> — we'll build on top of what you have rather than starting fresh.']
>
> Ready to continue?"

*Existing monorepo (`origin: "existing-monorepo"`):*
> "Here's what I found in `[path]`:
> - Your repo is already set up as a monorepo ✓
> [any additional detected layers, one bullet each]
>
> Here's what that means for us: you're already in great shape for the code
> phase. We'll build the Figma side first, then work inside your existing
> monorepo structure when we get to code.
> Because you already have a system here, we'll start by **auditing** what exists — measuring your current colors in code and what's in your Figma file — so we right-size the work before changing anything. That's the `design-system-audit` step.
> [one line per additional detected layer]
>
> Ready to continue?"

*Unknown:*
> "Here's what I found in `[path]`:
> - I can see some project files but I'm not sure of the full setup
>
> Before we continue: do you have an existing git repo here? And is it already
> set up as a monorepo (does it have a `turbo.json` or `pnpm-workspace.yaml`)?"
>
> Wait for the user to clarify, then update `workspace.origin` manually based
> on their answer before proceeding.

Once the user confirms they're ready, proceed to Step 2.

## Step 2 — Create the working folder and manifest

**When Step 0 already set the directory:** if the user chose "Here" or
"Somewhere else" in Step 0, or an existing `design-system.json` was loaded,
the directory already exists and the manifest has been created or loaded. In
that case, skip folder creation below. The only thing to confirm is that
`workspace.name` is set — if it is `null` or `"my-design-system"` (the
placeholder default), ask the user what they'd like to name their design system
and update the field. Then proceed directly to Step 2.5.

---

Ask the user what they'd like to name their design system (suggest something
like `my-design-system` if they're unsure). Then:

- Create a folder with that name in a sensible location (their current directory
  is fine; confirm where it'll live so they can find it later).
- Write `design-system.json` into it using the schema defaults from
  `.throughline/references/manifest-schema.md`, with:
  - `workspace.name` = their chosen name
  - `workspace.stage` = `"folder"`
  - everything else at defaults

Tell them, in plain language, what just happened: "I've made a folder called
`my-design-system` on your computer, and put a small file called
`design-system.json` inside it. That file is a checklist of what we've set up —
you can open it anytime, and later I can read it back to remember where we are.
Right now everything in it says 'not done yet', which is exactly right."

**Do not** set up git or GitHub here. The whole Figma phase works with just this
folder. Git arrives later, only when there's code to version (the
repository-builder skill handles that).

## Step 2.5 — Calibrate the coding level

Establish how much to explain code/git/terminal concepts in the later
code-touching skills. Read `.throughline/references/coding-level.md` and follow its
determination method: ask the **concrete anchoring questions** (have you set up
a GitHub repo before? used a terminal? worked with `.env` files?) rather than
"are you technical?" — self-assessment is unreliable.

Infer `new` / `some` / `comfortable` from the answers, confirm it in plain terms,
and record it in `user.codingLevel`. When in doubt, choose the lower level.

Frame this warmly and without judgment: "A couple quick questions so I explain
things at the right level for you — no wrong answers, and I can adjust anytime."
Make clear it changes only how much detail they get, never what they can build.

This is set now because it colors every later interaction. The Figma phase
itself doesn't lean on it much, but the code phase (repo, sync, Storybook) does.

## Step 3 — Choose the Figma write mechanism

Explain there are two ways to connect Claude to Figma, and recommend the first:

- **Figma Console MCP (recommended).** More capable — it can create many
  variables at once efficiently (which saves time and usage), and it can read
  your variables on any Figma plan, including free and Pro. Slightly more setup:
  you'll create one access token and run a small helper plugin inside Figma.
- **Official Figma plugin (simpler fallback).** Less setup, but more limited —
  some bulk operations are slower, and reading variables through it can be
  restricted on non-Enterprise plans. Fine if the user wants the lightest path.

Let the user choose. Record their choice in `figma.mechanism`
(`"console-mcp"` or `"official-plugin"`). Default to `console-mcp` if they have
no preference.

The MCP server configuration ships **bundled with this plugin** (in the plugin's
`.mcp.json`), so the user does not hand-edit any config files. The one thing the
bundle can't contain is their personal access token — that's a per-user secret,
handled in the next step.

## Step 4 — Connect to Figma (Console MCP path)

Walk through these one at a time, confirming each before moving on. Never rush
the user past a step.

### 4a. The golden rule: use the Figma **desktop app**, not the browser

State this up front and clearly: **the Figma desktop app must be installed,
open, and signed in, with the file you want to work in open in it.** The
browser version of Figma causes connection and token errors that are painful to
debug. If they don't have the desktop app, point them to figma.com/downloads to
install it first. Desktop app, every time.

### 4b. Create a Figma access token

A token is like a password that lets Claude talk to Figma on your behalf. Walk
them through it:

1. In a browser, go to figma.com and sign in (same account as the desktop app).
2. Click your account menu, then Settings.
3. Open the **Security** tab.
4. Find **Personal access tokens** and click **Generate new token**.
5. Give it a name they'll recognize, like `claude-design-system`.
6. Copy the token immediately — Figma only shows it once. It starts with
   `figd_`.

**Secret-handling rule (non-negotiable):** the token value must never pass
through the chat. Do not ask the user to paste it to you. Instead, tell them
exactly where it goes (the plugin's MCP configuration expects it in an
environment variable named `FIGMA_ACCESS_TOKEN`) and have them place it there
themselves, following the plugin's setup notes. If they're unsure where that is,
walk them to it, but you never see or handle the token. Reassure them this is
normal and good — their password-like token stays theirs.

### 4c. Run the desktop bridge plugin and pair

The Console MCP talks to Figma through a small "bridge" plugin running inside
the desktop app.

1. Import/run the Figma Console MCP **Desktop Bridge** plugin in their open
   Figma file (one-time import; the setup docs for the MCP cover the exact
   import step).
2. The plugin shows a **pairing code**.
3. Tell the user to keep the plugin panel open. When they ask you (in chat) to
   connect, you'll initiate the connection and they'll enter/confirm the pairing
   code in the plugin panel to authorize it.

Explain the shape of it plainly: "Figma needs to know it's really you allowing
this. The little plugin window shows a short code; you'll confirm it, and then
Claude and Figma are linked for this session."

### 4d. Restart the MCP client if needed

If the config was just added (token placed for the first time), the MCP client
may need a restart to load it. Tell them how, simply, and confirm they're back.

## Step 4 (alt) — Connect to Figma (official plugin path)

If the user chose the official plugin, the flow is lighter: install the official
Figma plugin for Codex per its setup, ensure the desktop app is open with
the file, and authenticate through the desktop app (again: desktop, not
browser). The same secret-handling rule applies — any token goes into config by
the user, never through the chat.

## Step 5 — Capture the file key

Ask the user for the URL of the Figma file they want to build the design system
in. Extract the file key from it (the segment after `/file/` or `/design/`) and
store it in `figma.fileKey`. Explain: "This just tells Claude which of your
Figma files to work in, so I don't have to ask every time."

## Step 6 — Liveness check (prove it actually works)

Don't declare success on faith. Run one trivial **read** against Figma to prove
the connection is live — for example, a low-cost call such as reading the file
name or a single variable collection. This probe proves *connectivity only*.

**Do not report an inventory from this probe (the false-empty read bugs B1/B2).** A cheap or early read
can come back empty on a fully-populated file (pages not yet loaded, cache/read
error), and reporting "0 variables" or "no text styles" off the back of it is a
confidence-destroying first impression. Proving the connection is live is a
separate concern from inventorying what's in the file — the full per-class
inventory (with `loadAllPagesAsync` and independent reads for variables, text
styles, and effect styles) belongs to the `design-system-audit` prompt, which
applies the read discipline in
`.throughline/references/brownfield-retrofit.md`. Here, only confirm the
call succeeded — never announce counts.

If the liveness probe succeeds:

- Set `figma.connected` = `true` and `figma.lastVerified` to the current
  timestamp.
- Append `figma-environment-setup` to `completedSkills`.
- Tell the user warmly that the connection works and what they just unlocked:
  "Claude can now see and edit your Figma file. You're ready to build your first
  tokens whenever you are."

If it fails, first figure out **which kind** of failure it is, because the fixes
are completely different:

**A. The MCP server never started.** The Console MCP is downloaded and launched
on demand by `npx`. If the error text mentions `npx`, `npm`, `EACCES`,
`permission denied`, `ENOENT`, a cache path like `~/.npm/_cacache`, or a network
/ registry timeout, the *server process itself* failed to come up — this is an
environment problem, not a Figma or token problem. Walking the user through
tokens or pairing here is useless. Diagnose in order:

- **npm cache permission error (`EACCES` writing to `~/.npm`).** This is the
  common one. It means some files in the user's npm cache are owned by `root`,
  usually because `npm` was run with `sudo` at some point, so `npx` can't write
  there. Confirm by checking ownership of `~/.npm` (look for files owned by
  `root` rather than the user). The fix is for the **user** to run, in their own
  terminal, the standard npm-recommended command to give the cache back to
  themselves:

  ```
  sudo chown -R $(whoami) ~/.npm
  ```

  Explain it plainly: "A past install left a few files in npm's download folder
  locked to the system account, so the Figma helper can't download. This one
  command hands that folder back to you. It'll ask for your Mac password." Never
  run `sudo` for them — surface the command and let them run it. Then retry the
  liveness check.
- **Network / registry timeout.** Have them check their connection (and any
  VPN/proxy/corporate registry), then retry.
- **`node`/`npm` not installed.** `npx` needs Node.js. If it's missing entirely,
  point them to install Node (nodejs.org LTS) and retry.

**B. The server started but the connection failed.** If there's no launch error
and the server is clearly running, diagnose gently and in order: Is the desktop
app open with the file? Was the token placed correctly (have them re-check,
without showing you the value)? Is the bridge plugin running and paired? Did the
client need a restart? Walk them back through the relevant sub-step.

Do not move on until the liveness check passes.

## Step 6.5 — Prove writes work (throwaway)

The liveness check above is a *read*. Before handing off, confirm Claude can also
**write** to the file — but do **not** leave a permanent artifact behind. The
file's branded **Cover** page is built later, by `token-sheet-builder`, once
tokens and styles actually exist, so it can be genuinely on-brand instead of a
neutral placeholder built against nothing.

- Create one trivial throwaway node (e.g. a small frame or text node named
  `__throughline write test`) on any page.
- Confirm it landed with a quick read or `figma_capture_screenshot`.
- **Delete it.** If both the write and the delete succeed, writes are proven.

Leave `figma.coverPageBuilt` = `false` here — that flag is set later, when the
real Cover page is built. Keep this step quick; it's plumbing, not design.

## Step 7 — Hand off

Once live, tell the user what comes next without forcing it: "The natural next
step is building your color, spacing, and type tokens — just say something like
'let's build my tokens' and I'll take it from there. Or if you'd rather explore
first, that's fine too." Update the manifest and stop. Don't auto-run the next
skill.

## Step 8 — Brownfield routing + rollback baseline (existing systems)

After the liveness check passes, decide where to send the user. Most greenfield runs
continue to token building. A **brownfield** run — a mature codebase and/or an
already-populated Figma file — routes into the audit first, and an **in-progress
retrofit** resumes where it left off. This is the front-door routing the spec calls
for; apply the read discipline in
`.throughline/references/brownfield-retrofit.md` to every read here.

**Read the manifest and route:**

1. **Resume an in-progress retrofit.** If `retrofit.phase` is set and not `"done"`,
   a retrofit is already underway — hand back to **`retrofit-planner`** to resume at
   that phase, rather than starting anything new. Say plainly where it left off
   (e.g. "Looks like we're mid-retrofit at the `sync` phase — want to pick up there?").
2. **Route a mature system to the audit.** If `workspace.origin` is `"existing-repo"`
   or `"existing-monorepo"` (a mature codebase), recommend **`design-system-audit`**
   as the next step instead of `token-builder`: "You've got an existing system — let's
   audit it first so we right-size the retrofit." The audit also covers a populated
   Figma file via its verified per-class reads.
3. **Greenfield stays greenfield.** If `workspace.origin` is `"greenfield"`, continue
   the normal path (brainstorm → token-builder). Don't push greenfield users through
   the audit.

**Capture a rollback baseline before any mutation (brownfield only).** A retrofit
changes a file that already has value in it, so before *any* write lands, capture a
restore point:
- **Figma version checkpoint** — note the current version (e.g. via
  `figma_get_file_versions`) or have the user name a Figma version so there's a known-good
  point to restore to. The plugin can read versions; it does not auto-create named
  versions, so if none exists, ask the user to add one ("File → Save to version
  history") and record that you did.
- **Token export** — if the repo already emits tokens, snapshot the current generated
  output (git is the natural baseline once `workspace.stage` is `local-git`+).

Do this **before** routing into any skill that writes (the audit only reads, so the
baseline must be in place before `token-builder`'s refine phase runs). Frame it as
cheap insurance, not alarm.

## What this skill must NOT do

- Never set up git or GitHub (wrong phase — that's repository-builder).
- Never ask for, accept, store, or echo the Figma access token or any secret.
- Never hand-edit MCP config on the user's behalf in a way that embeds a secret.
- Never skip the liveness check.
- Never assume the browser version of Figma will work — always require desktop.
- Never overwrite `workspace.origin` once it has been set — it is immutable
  after intake.

