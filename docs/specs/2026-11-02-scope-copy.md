# Scope copy: tell the new story everywhere

Status: planned
Reviewed: 2026-11-03 — ready to build; one design finding to settle first (Q15 vs the detector's "Mode b:" line), five minor fixes
Date: 2026-11-02
Builds on: `docs/specs/2026-10-30-design-modes.md` (Q22: copy describes only what is
built; the rest goes on the roadmap)

## Goal

ThroughLine now designs screens: in its own system's file, in a product file built on
that system (0.33.0), and on a Figma library a team already uses (0.32.0). The README,
the website, the npm description, the adapters and the plugin's own entry points still
tell parts of the older story, a design-system builder first. Some lines are wrong as
of 0.33.0. After this ships, every outward surface tells one story: scaffold an
agent-friendly design system in Figma and code, then design high-quality screens with
it. Designing on an existing library is the second way in. Only what's built is
claimed.

## Non-goals

- New commands or features. Q5's routing change points to commands that exist.
- The listing descriptions in `.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json` while the formal listing is in review (Q10).
- The radicool.studio portfolio specimen card and the `throughline-sample` README
  (Q13).
- Claims about unbuilt phases (1c, 2, 3, 4) anywhere but the roadmap.
- Redesigning the website's visual system or its existing acts' content, beyond the
  framing lines Q3 names.

## Decisions

All answered by the owner on 2026-11-02, in one grilling session. Q1, Q4 and Q6–Q7
were answered directly. Q3 and Q5 were "agreed"/"yes" to the recommendation. Q8–Q13
were "yes on all recs". The scope list in Q2 was confirmed in the closing summary.
Q14–Q15 came out of the review the same day: the owner said "revise please" to the
recommendations put to them, and Q5 was amended to match.

| # | Decision | Chose | Why | Rules out |
|---|---|---|---|---|
| Q1 | The framing | "Scaffold agent-friendly design systems in Figma and code, then design high-quality screens with them: your all-around agentic design team." System first, screens made with it. The headline "Your agentic design team" (0.32.1) stays. This is the framing; Q9 is the line surfaces copy. | The owner's own words. | A screens-only pitch; the old builder-only pitch |
| Q2 | Surfaces in scope | The README; the npm description and the Codex and generic adapter descriptions; the website (radicool.studio/throughline); the `start` and `design-system-status` commands; the opening of `references/guide-voice.md`. | These are the surfaces that tell the story or send a user somewhere. | See Non-goals |
| Q3 | Website depth | Keep the headline. Rewrite the hero subtitle. Add a new act straight after the hero, "Design with what you have": your system, your team's library, and "not yet" for nothing at all. The existing system acts stay, framed as the core. Claims mirror the README's modes section. | The site is entirely builder framing today; a framing pass plus one act fixes it without a redesign. | A full site rewrite |
| Q4 | "Plugin application" | The formal Anthropic plugin directory listing, which is in review now. It reads `plugin.json`'s description. | Owner confirmed. | — |
| Q5 | In-plugin entry points | Wording and routing only. `start`'s description stops assuming the goal is a system. `start` asks the way in before setup writes anything (Q14). `design-system-status` recognises a library-only folder (`design/workspace.json`, no `design-system.json`), says its mode in the README's terms (Q15), and points to compose-figma rather than system setup. | A library user is sent into system setup today. | New commands |
| Q14 | When `start` asks which way in | First, before `figma-environment-setup` runs, because that skill writes `design-system.json` (its Step 2) before it connects Figma (its Step 4), and a manifest makes a product file read as a system (design-modes Q36). A library user follows only the setup skill's "Step 4 — Connect to Figma" and is sent to `/throughline:compose-figma`; nothing writes `design-system.json`. A system user gets today's flow unchanged. | The setup skill stays as it is, so this stays wording and routing (Q5). | Asking after setup; a library branch inside the setup skill |
| Q15 | Mode names users see | The README's numbers: mode 1 (your ThroughLine system), mode 2 (a library your team uses), mode 3 (nothing yet). The letters a/b/c stay in the specs and in the commands' own instructions to the agent. | A user who read "mode 2" in the README shouldn't be told "mode b". | Letters on user-facing surfaces |
| Q6 | The voice guide | Replace `guide-voice.md`'s opening ("building a design system… is the whole product") with the Q1 framing. The rest of the file stays. | It governs later copy, so it has to carry the new story. | — |
| Q7 | Shipping | The throughline changes go out as a copy-only 0.33.1 patch, like 0.32.1 (#200). The website deploys on its own. Each later design-modes phase carries its own copy step. | The npm page and the README need a release to update; the site doesn't. | Waiting for more phases |
| Q8 | Where designing on a team library fits | The secondary way in, not a second headline: "Already have a team library? Design on it today, and build your own system when you're ready." | Keeps Q1's story clean without hiding something that works. | Two equal stories |
| Q9 | The source line | **Your agentic design team.** Scaffold an agent-friendly design system in Figma and code, then design high-quality screens with it, or on the library your team already uses. Every surface takes its copy from this line. | One line keeps the surfaces from drifting apart. | Per-surface pitches |
| Q10 | Listing metadata during review | `plugin.json` and `marketplace.json` descriptions and keywords stay as they are until the listing is approved (only `plugin.json`'s version moves). A small follow-up updates them after. The npm description and adapters change now. | Changing what's under review could confuse reviewers or restart the review. The current text is accurate, just older in framing. | Editing the listing mid-review |
| Q11 | Website workflow | Work in `~/Dev/throughline-ds` on a branch, PR, check a Vercel preview, deploy after merge with the Vercel CLI. The project isn't Git-linked. | Matches how the site was first deployed (its 2026-07-03 plan, Task 14). | — |
| Q12 | Where the plan lives | This one spec, in throughline, with the website steps pointing at `throughline-ds`. | One decision record for one change. | A second spec in `throughline-ds` |
| Q13 | Portfolio card and sample README | Left as they are. | Each is accurate for what it describes. | — |

## Open questions

- **The site's share image.** `public/og-image.png` reads "One unbroken line from
  design to code." over a terminal showing "let's set up my design system / Token
  system built / 14 components synced". That's system-builder flavour, not wrong.
  (`docs/assets/hero.png` has no text, so nothing to decide there.) Recommendation:
  keep it in this change and redo it, if at all, alongside the new act's visuals
  later. Unresolved.
- **npm keywords.** `package.json` has no `keywords` field at all, so the question is
  which set to add, not which terms to append. Q10 holds the listing keywords; npm's
  weren't discussed. Recommendation: add the field in 0.33.1 with `design-system`,
  `figma`, `design-tokens`, `claude-code`, `figma-library` and `screen-design`, since
  npm isn't under review. Unresolved.
- **Q7's standing rule.** Q7 says each later design-modes phase carries its own copy
  step, a commitment about future work. Recommendation: if it's meant as standing,
  also record it in `docs/specs/2026-10-30-design-modes.md` when its next phase is
  planned. Unresolved.
- **Q15 vs the mode line the product prints (settle before Step 4).** The second
  review found the letters aren't only in instructions: `scripts/lib/design-mode.mjs:30-32,74`
  builds the `reason` string as "Mode a: …" / "Mode b: …" / "Mode c: …" (and "lowered
  from mode a"), and `commands/compose-figma.md:43` tells the agent to pass it to the
  user as is; README `:27` promises that line. So after this change the README and
  `design-system-status` say "mode 2" while every compose run says "Mode b:". A
  one-line instruction in `compose-figma` doesn't reach the script. Recommendation:
  change those strings to mode 1/2/3 and update the two regexes in
  `scripts/lib/design-mode.test.mjs:51,127` (`/lowered from mode a/`). It's still
  user-facing text, so it fits a copy patch. The alternative is recording that the
  mode line keeps letters, and why. This replaces the earlier question about
  `compose-figma` saying "mode b". Unresolved.
- **Second review's minor corrections (2026-11-03), not yet applied.**
  - Step 4's `start` description ("Runs environment setup first; from there…")
    contradicts Q14, where the question comes first; reword it to match.
  - Step 4's library branch skips the setup skill's Step 6 liveness check (which
    writes `figma.connected` into a manifest that won't exist). The backstop is
    `compose-figma` step 0's `figma_get_status` check (`commands/compose-figma.md:12-13`);
    say so in the step so nobody adds a manifest-writing check.
  - Step 4's Verify `mode b` grep passes today too; add
    `grep -n 'mode 2' commands/design-system-status.md` prints a line.
  - Q14 and Facts checked: for "Here" and "Somewhere else", the setup skill writes
    `design-system.json` earlier, in Step 0 Phase 2 (`SKILL.md:90-91`), not only at
    Step 2. The conclusion stands.
  - Step 7 and Facts checked: `app/page.tsx` mounts twelve sections, not fourteen.
  - Q10 and Step 9: `.claude-plugin/marketplace.json` has no `keywords` field; only
    `plugin.json:14` does.

  Recommendation: apply all six with the Q15 call above. Unresolved.
- **Whose voice the README and site speak in.** No brand voice guide exists:
  `guide-voice.md` covers how flows close, not marketing copy. Under the owner's
  standing rule, product copy with no voice source falls back to Jordan's voice, using
  the `write-like-jordan` skill, and this should be said in the PR. Recommendation:
  follow that rule. Unresolved only in that nobody has said otherwise.

## Facts checked

2026-11-02:
- The website is `jrpease/throughline-ds` (private), cloned at `~/Dev/throughline-ds`,
  app in `apps/site`. It's Next.js 15 with `basePath: '/throughline'` and Vitest
  section tests in `components/sections/__tests__`. The local `main` was two commits
  behind `origin/main` (a `.gitignore` change).
- It's served by the Vercel project `throughline-site` (team `radicool-studio`).
  radicool.studio rewrites `/throughline` to it. The project has no Git link, and no
  local `.vercel` link exists on this Mac.
- Builder-only copy lives in `components/sections/hero.tsx:30`,
  `components/sections/what-it-builds.tsx:72`, and `app/layout.tsx:13-19` (title and
  meta description).
- README lines wrong as of 0.33.0: `:29` (a product file on your system called "mode 2
  for now"), `:256` (that case still on the roadmap), `:257` (library text styles
  called unavailable).
- The adapter descriptions come from `scripts/adapters/emit-codex.mjs:39` and
  `emit-generic.mjs:19`. The generated `AGENTS.md` files are their outputs.
- README `:159` tells library users to skip `start` and follow only "Connect to
  Figma" (Step 4) in `figma-environment-setup`. `commands/start.md` invokes that skill
  straight away, and the skill writes `design-system.json` at its Step 2.
- Site section titles go through `SectionHeading` (`components/section.tsx`), which
  wraps each word in its own `<span>`, so a title never appears contiguously in the
  served HTML. Six of the fourteen sections have a `*-scene.tsx`. No site test asserts
  the hero subtitle or the meta description.
- `ci/validate-skills.mjs` checks frontmatter in `skills/`, `commands/` and `agents/`
  only; it doesn't read `references/`.

Review, 2026-11-02 (critic): needs revision, narrowly. Fixed here: `start` routing
(Q14), mode labels (Q15), README `:9` and `:159`, the Step 8 live check, Step 1's
check, a guard for `:256`, a pinned subtitle test, the scene-file assumption, the
keywords fact, Step 10's status line.

## Plan

Steps 1–5 are in `~/Dev/throughline` on a branch `docs/scope-copy`. Steps 6–8 are in
`~/Dev/throughline-ds` on a branch `feat/scope-copy`. Write the README and site copy
with the `write-like-jordan` skill (see Open questions).

### Step 1 — The voice guide and the source line

Files: `references/guide-voice.md`
Change: replace the opening's first two sentences ("ThroughLine walks someone through
building a design system. That framing is the whole product.") with the Q1 framing:
ThroughLine scaffolds agent-friendly design systems in Figma and code, then designs
high-quality screens with them. Keep "Every skill should sound like a guide…" onward
unchanged.
Verify: `git diff references/guide-voice.md` shows only the opening changed.

### Step 2 — README

Files: `README.md`
Change:
- The bold line under the headline (`:9`) becomes Q9's source line without its first
  sentence (the `###` headline at `:7` already says it), keeping "Built for Claude
  Code, and installable into Cursor, Codex, or any AGENTS.md agent."
- The install note (`:159`) says `start` is the entry point for both ways in: it asks
  first, and a library user is only connected to Figma and sent to
  `/throughline:compose-figma` (Q14). Drop the "Skip the rest of `start`" advice.
- "Design with what you have" (`:25-35`):
  - mode 1 covers both the system's own file and a product file built on it (new in
    0.33), held to the system's rules, with gaps in the system's gap file and drift
    tracked in the system's file only;
  - mode 2 keeps its text, framed per Q8 as the way in for a team that already has a
    library, and notes that library text styles now work;
  - mode 3 stays *Planned*.
- Roadmap: `:256` lists what's left in order (drift for product files, `/throughline:design`, no system at all, the same modes in code), and `:257` (library text styles) is removed.
- Read the rest for anything Q1 contradicts ("Who it's for", "Why I built it"), and
  bring it in line only where it does.
Verify: `grep -n 'mode 2 for now\|only the file.s own text styles\|uses your own ThroughLine system as a library\|Skip the rest of .start.' README.md`
prints nothing. The modes section and the roadmap are reviewed by eye against
`docs/specs/2026-10-30-design-modes.md`'s built phases.

### Step 3 — npm description and adapters

Files: `package.json` (`description`, and a new `keywords` field only if the open
question is settled), `scripts/adapters/emit-codex.mjs:39`, `scripts/adapters/emit-generic.mjs:19`,
then regenerated `adapters/**`
Change: rewrite each description from Q9's line, keeping each one's ending ("Usable
from…", "Load the matching prompt…", "Read the matching skill file…"). Then run
`node scripts/adapters/generate.mjs`. Leave `.claude-plugin/plugin.json`'s and
`marketplace.json`'s descriptions and keywords alone (Q10).
Verify: `node scripts/adapters/generate.mjs --check` exits 0, and
`git diff --stat .claude-plugin` is empty at this step.

### Step 4 — `start` and `design-system-status`

Files: `commands/start.md`, `commands/design-system-status.md`, regenerated `adapters/**`
Change:
- `start`'s description: "Start with ThroughLine — the deterministic entry point.
  Runs environment setup first; from there, build a design system, or design screens
  on a Figma library you already use."
- `start`'s body, before it invokes `figma-environment-setup`, asks one question:
  "Are you building a design system, or designing screens on a Figma library your
  team already uses?" Skip the question when `design-system.json` already exists
  (today's routing applies). On "a system", the rest of the body runs as now. On "a
  library": follow only the setup skill's "Step 4 — Connect to Figma", write nothing
  else (no `design-system.json`), then tell the user to open the product file and run
  `/throughline:compose-figma`. Reword the body's opening ("the first step for
  building a design system") to cover both.
- `design-system-status`: when `design-system.json` is missing but
  `design/workspace.json` exists, say this folder designs on a library ("mode 2", per
  Q15), name
  its `fileKey` and libraries, and point to `/throughline:compose-figma` and
  `/throughline:gap-report`. Only when neither file exists does the current "no
  design system yet" offer of `figma-environment-setup` stand.

Then `node scripts/adapters/generate.mjs`.
Verify: `node ci/validate-skills.mjs` and `node scripts/adapters/generate.mjs --check`
exit 0. `grep -n 'mode b' commands/start.md commands/design-system-status.md` prints nothing. The routing is reviewed by
eye against Q14: the question comes before the skill is invoked, and the library
branch names no step that writes `design-system.json`.

### Step 5 — Release 0.33.1

Files: `package.json`, `.claude-plugin/plugin.json` (version only), `README.md` and
`scripts/README.md` pins, `CHANGELOG.md`
Change: bump to 0.33.1 as 0.32.1 did. The CHANGELOG gets a `## [0.33.1] — <date>`
entry, with an empty `[Unreleased]` above it, saying what the copy now says and that
the directory listing text waits for review.
Verify: `node --test` passes, and every gate in `.github/workflows/ci.yml` exits 0.
`node ci/extract-changelog.mjs 0.33.1` exits 0. Open a PR titled
`release: 0.33.1 — <phrase>`, then follow finish-branch: squash-merge, tag `v0.33.1`
on the merge commit, and confirm the release workflow succeeds.

### Step 6 — Site: hero, meta and the builds act's framing

Files (in `~/Dev/throughline-ds/apps/site`): `components/sections/hero.tsx`,
`components/sections/what-it-builds.tsx`, `app/layout.tsx`, the matching
`__tests__/*.test.tsx`
Change: `git pull` first. Then:
- the hero subtitle (`hero.tsx:30`) becomes Q9's line, keeping "You make the design
  calls. It does the rest." if it still fits;
- `what-it-builds.tsx:72`'s sub reframes the system as the foundation the screens are
  built from;
- the meta description in `layout.tsx` matches the hero.

No existing test asserts the old subtitle or meta, so add one assertion to
`__tests__/hero.test.tsx` that the new subtitle renders, pinning the copy.
Verify: `pnpm --filter @throughline-ds/site test`, `check-types` and `build` pass.

### Step 7 — Site: the "Design with what you have" act

Files: `apps/site/components/sections/design-with-what-you-have.tsx` (new, with a
test), `apps/site/app/page.tsx`
Change: a new section placed straight after `<Hero />` and before `WhatItBuilds`, with
its own `Throughline` and `Build` wrapper like its neighbours. It shows three modes,
mirroring the README (Step 2):
- your ThroughLine system, in its file or a product file on it;
- the library your team already uses;
- nothing at all, marked "not yet".

It ends with Q8's line. It's built with the `studio-design` skill and the site's
existing motion conventions, so it reads as part of the narrative. Six of fourteen
sections have a `*-scene.tsx`; whether this one gets a scene is a design call made in
`studio-design`, and recorded in Where it diverged. Mode names follow Q15.
Verify: `test`, `check-types` and `build` pass. Run `next dev`, open
`/throughline`, screenshot at 1440 and 375, scroll through the new act and its
neighbours, and confirm the console has no new errors.

### Step 8 — Site: preview, merge, deploy

Files: none new
Change: push the branch, open a PR, and deploy a preview (`npx vercel deploy` from
the repo root after `npx vercel link` to the existing `throughline-site` project with
root directory `apps/site`). Check the preview, then merge. Deploy to production with
`npx vercel deploy --prod`.
Verify: `curl -s https://radicool.studio/throughline | sed 's/<[^>]*>//g' | grep -c 'Design with what you have'`
prints at least 1 (tags stripped, because `SectionHeading` splits titles into one span
per word), and the same pipeline finds Q8's line and the new hero subtitle. Open the live page in a browser
at 1440 and 375 and confirm the console has no new errors.

### Step 9 — The listing follow-up (after approval)

Files: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
Change: once the directory listing is approved, rewrite both descriptions from Q9 and
add `figma-library` and `screen-design` keywords, in the next release.
Verify: `node ci/validate-plugin.mjs` exits 0. Not run in this change; it waits on the
review.

### Step 10 — Close out

Files: this spec
Change: Status line becomes `built (Steps 1–8); Step 9 waits on the listing review`,
with What shipped and Where it diverged.
Verify: reviewed by eye.
