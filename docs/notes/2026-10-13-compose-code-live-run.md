# Composing a screen in code, run against the sample

Date: 2026-10-13
Spec: `docs/specs/2026-10-13-compose-code-screen.md`, Step 4
Repo: a scratch copy of `~/Dev/throughline-sample` (the real repo wasn't written), with a Vite React app added at `apps/web` as the Plan describes

The short version: **a fresh agent composed "Sign in" from the command's
instructions alone, and it passed the gate on its second attempt. It rendered with
the system's own styles and a clean console, and its structure matches the Figma
"Sign in". The run found one real hole in the gate, and it's now closed.**

## What ran

A general-purpose agent with none of this session's context followed
`commands/compose-code.md`, with the plugin root at this repo. It was given the
package specifier (`@ds/ui`) and the three token files
(`packages/tokens/dtcg/primitives.json`, `semantic.light.json`,
`semantic.dark.json`). It confirmed that no `adherence:check` is registered.

| Step | Result |
|---|---|
| `inventory` | 14 components, the same 14 as `components.built`, all documented |
| `check`, "Sign in" (Card, Input, Checkbox, Button) | ok |
| `gate`, attempt 1 | FAIL: `[raw-value] max-w-[calc(var(--space-24)*4+var(--space-4))]` (it tried to make 400px out of space tokens) |
| `gate`, attempt 2 | pass: 5 component references, 0 colour and 0 dimension literals, 4 components, unnamed-control 1 checked |
| `tsc --noEmit`, `vite build` in `apps/web` | both exit 0 |
| `check`, "Book a demo" with a DatePicker | `missing-component`, nearest Spinner, Textarea, Avatar. Nothing written. |

## The hole it found, now closed

**Attempt 1 imported `ArrowRight` from `lucide-react`, and the gate passed it.**
`off-plan` read only package components and lowercase controls, so an import
from any other package was invisible. A composed file now imports only from the
system's package (and its subpaths) and React. Anything else, relative imports
included, is `off-plan`, reported as a gap. Tested in
`scripts/compose-code.test.mjs`. The agent's final file still passes.

Icons are a real gap on the sample, not a composer quirk. Button's
`trailingIcon` takes a Lucide icon, `@ds/ui` doesn't re-export any, and
`lucide-react` doesn't resolve from `apps/web`. So the arrow on the Figma
"Sign in" button has no code equivalent the app can import.

## Prose fixes from the run

- Step 8 wrote `--tokens <file>...`, which reads as one flag followed by several
  files. The script wants `--tokens` repeated. The step and the usage line now say so.
- Nothing said where token variable names and preset utilities live. The agent
  read `packages/tokens/build/css/tokens.css` and the preset. Step 4 now points at both.
- `nearest` is matched on spelling (DatePicker → Spinner). Step 5 now says to
  suggest by `whenToUse` when something fits. The agent's own suggestion,
  `Input type="date"`, was the right one. #174 is the script-side fix.
- "How to mount it in the router" didn't fit an app with no router. Step 9 now
  says "where the app picks its screens".
- A size no token holds can't be bound. Step 7 now says to use a fraction or a
  keyword and report it.

## The render

`http://localhost:5199/?screen=SignIn` at 1280 × 900, `<html class="light">`.
The card, inputs, checkbox, green button and link colours all come from the
tokens, and the console shows no errors or warnings. Side by side with the Figma
"Sign in" (`442:1568`), the structure matches: heading, helper text, two labelled
inputs, the Remember me and Forgot password row, a full-width primary button, and
the Sign up line. Where they differ:

- **No arrow on the button.** That's the icon gap above.
- **The heading is Inter, not Poppins.** `font-heading` resolves to Poppins, but
  the scratch app loads no web font. That's the app's font loading, not the
  composer.
- **The heading is smaller** (`--font-size-500`, 24px). The agent picked the size;
  the Figma screen uses the Heading/L style.
- **It sits in a card about a third of the window wide**, as the request asked.
  400px can't be expressed: the system has no sizing token, so it's
  `sm:w-1/2 lg:w-1/3`.

## Friction worth knowing

- **Width.** The space scale stops at 96px and there's no sizing token, so a
  fixed-width card can only be approximated with fractions. That's the system's
  gap, and the composer reports it rather than hiding a raw value.
- **Type.** The preset maps no font sizes or weights, so they're written as
  `style={{ fontSize: 'var(--font-size-…)' }}`. That's legal but verbose.
- **Advisories.** The gate printed 12 `unmodelled-prop` advisories for `id`,
  `type`, `autoComplete` and `className`. They're the gate's, and they're noise
  on a composed screen.
- **State.** The checkbox is `checked={false}` with a stub handler, so it doesn't
  toggle. Data and state are the app's (a non-goal).
- **Card's sub-parts.** They render `div`s, and `CardHeader` is a row, so the
  agent wrote `h1` and `p` in a column instead.

## What wasn't measured

- A full re-run by the agent. `check` was run by hand against the live copy
  instead: the "Sign in" plan at the composed `SignIn.tsx` → ok (it would
  replace it); the same plan pointed at the app's own `main.tsx` → `name-taken`;
  a "Sign up" plan at `SignIn.tsx` → `name-taken`, `marked: "Sign in"`.
- A Next app with `'use client'`. The marker rule is tested, but not run live.
- Any system other than the sample. None of the other real repos has both a docs
  index and an app.
