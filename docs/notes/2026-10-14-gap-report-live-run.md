# The gap report, run against the sample

Date: 2026-10-14
Spec: `docs/specs/2026-10-14-gap-report.md`, Step 5
Repo: the scratch copy of `~/Dev/throughline-sample` with `apps/web` (the recipe in
the `no-repo-has-a-consuming-app` memory). The real repo wasn't written.

The short version: **the code half ran live end to end and recorded its gap. The
Figma half didn't run live: the bridge wasn't attached to this session. Its
records were written with the same command the Figma composer runs. A fresh
agent then triaged from the report, and both choices stuck. The run found one
ordering bug in the commands, and it's fixed.**

## What ran

| Part | Who | Result |
|---|---|---|
| `/throughline:compose-code`, "Book a demo" with a date picker | fresh agent, the command only | `check` → `missing-component` DatePicker, `nearest: []`. User: "leave it out". `record` exit 0. Re-check ok, file written, gate passed first try (0 colour, 0 dimension literals). |
| `/throughline:compose-figma`, "Schedule a call" with a date picker | fresh agent | Blocked at step 2: `figma_list_open_files` → "No files connected". The session's server had fallen back to port 9225 and the plugin was on another session's 9223. Stopped, nothing written. |
| Figma-side hits | by hand, the command's own `record` line | DatePicker as "Date Picker" (`used:Input`), a `Calendar` icon (`--kind icon`, `left-out`), plus a code-side `AvatarGroup` (`used:Avatar`) to give the report a docs gap. "Date Picker" joined the DatePicker gap: 2 screens. |
| `/throughline:gap-report` | fresh agent, the command only | Report ranked DatePicker (2 screens) above AvatarGroup and Calendar, and flagged AvatarGroup as a likely docs gap. Triage: DatePicker `build`, AvatarGroup `exists` with note `Avatar`, then stop. Both exit 0; a diff against a backup shows exactly those two changes. Re-run report: 1 open, 2 triaged. |

The final `design-system/gaps.json` (arrays collapsed):

```json
{
  "gaps": {
    "avatargroup": {
      "hits": { "code:Team": { "at": "2026-10-14", "from": ["Avatar"], "resolution": "used:Avatar", "screen": "Team", "side": "code", "target": "apps/web/src/screens/Team.tsx" } },
      "kind": "component", "name": "AvatarGroup", "nearest": ["Avatar"], "note": "Avatar", "status": "exists"
    },
    "calendar": {
      "hits": { "figma:Schedule a call": { "at": "2026-10-14", "need": "A calendar icon on the date field.", "resolution": "left-out", "screen": "Schedule a call", "side": "figma", "target": "Screens" } },
      "kind": "icon", "name": "Calendar", "nearest": [], "status": "open"
    },
    "datepicker": {
      "hits": {
        "code:Book a demo": { "at": "2026-10-14", "from": ["Input", "Button"], "need": "Lets the visitor pick the date for their demo.", "resolution": "left-out", "screen": "Book a demo", "side": "code", "target": "apps/web/src/screens/BookDemo.tsx" },
        "figma:Schedule a call": { "at": "2026-10-14", "from": ["Input", "Button"], "need": "Pick the date for the call.", "resolution": "used:Input", "screen": "Schedule a call", "side": "figma", "target": "Screens" }
      },
      "kind": "component", "name": "DatePicker", "nearest": [], "status": "build"
    }
  }
}
```

That file predates the screen-key fold below, so its hit keys aren't folded.

## What it found, now fixed

- **The commands asked for nearest names before anything had produced them.**
  Step 5 of compose-code said to record `--nearest` "with the names `check`
  offered", but `check` is step 6. The agent had to run `check` early to follow it.
  Both commands now keep a missing component in the plan or description, ask on
  the `check` or build error, and record there. Empty `--nearest` is left off.
- **`--from` was vague.** It now says "the existing components or parts it would
  have been made of, comma-separated".
- **"Most screens used Avatar" with one screen.** The flag now says what it
  counted: "Avatar was used instead in 1 of 1 ask".
- **An icon marked `build` had nowhere to go.** The command now offers the
  `icon-system-builder` skill for icons and `new-component` for components.
- **The note's shape.** The command now says `exists` takes just the component's
  name, and that a triage replaces the old note.

The whole-branch review added two more: an icon on the code side never produces a
`check` error, so compose-code now says to ask and record it at the plan step.
And the hit key folds the screen name, so "Book a demo" from code and "Book a
Demo" from Figma count as one screen. Re-checked on the sample: one screen, two
hits.

## What wasn't measured

- **The Figma half, live.** The build returning `missing-component` with nothing
  written was measured live for #42 (`docs/notes/2026-10-13-compose-figma-live-run.md`),
  and the resolver tests cover it. What's unmeasured is a Figma agent following
  the new recording step. Re-run when the bridge is attached to the session.
- **A `Calendar` component and a `Calendar` icon.** They'd share one gap: the key
  is the folded name, not the kind. Nothing hit it.
