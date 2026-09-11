# Narrow the colour rule

Status: planned
Date: 2026-09-11
Issue: #123 (refs #39)
Evidence: `docs/superpowers/notes/2026-09-11-colour-rule-measurement.md` (#122)
Parent design: `docs/superpowers/specs/2026-08-31-code-adherence-gate-design.md`

## Goal

`token-exists-for-literal` was wrong 51 times out of 73 against two real apps.
That's a 70% false rate, and a gate that noisy gets switched off. The parent
spec's §11 is clear about what comes next: narrow the rule, never downgrade it
to an advisory.

Three narrowings, taken in order of evidence:

1. **The token package stops being read as its own consumer.** 41 false
   positives in zygarden's `libs/`, 34 more in throughline-ds's `packages/`.
2. **Comments stop counting as code.** `var(--signal-500); /* #5B7FFF */` fails
   code that already uses the token. Only 2 flags, but the worst 2.
3. **A mask's colour stops counting as a colour.** In
   `linear-gradient(#fff 0 0)` only alpha matters. 4 flags.

After this ships, the same runs against the same commits flag 26 literals
instead of 73: the 21 true positives, the 4 a regex can't tell apart from drift,
and the 1 unclear. The false rate goes from 70% to 15%, and no true positive is
lost.

## Non-goals

- **Narrowing by value.** Leaving out `#fff` would clear the logo and the QR
  code, and also hide a toast, a badge and a scrollbar that are real drift.
- **Downgrading the rule to an advisory.** §11 rules it out.
- **The 4-flag floor.** Hex inside string content (`daily-cycle-state.ts:32,34`),
  a third-party logo's white (`node-logos.tsx:111`) and a QR data-URI background
  (`qr-code.helper.ts:21`). Regex can't separate these from drift, and this
  build doesn't try.
- **`unknown-component` noise** (#120) and **the skipped-token count and
  cross-file aliases** (#121).
- **The shared walker.** `scripts/lib/source-scan.mjs` and its
  `DEFAULT_EXCLUDES` stay as they are. See the storybook-static open question.
- **Comments and component extraction.** Comments are blanked for hex only. A
  commented-out `<Button>` or import still reads as a usage, which is #120's
  territory.
- **Angular templates.** The gate scans no `.html`, per the parent spec's §4.
- **An opt-out flag** for any of the three narrowings.

## Decisions

| Decision | Chose | Why | Rules out |
|---|---|---|---|
| Narrow, or make the rule advisory | Narrow. The rule keeps its `failure` verdict. | Parent spec §11, restated in #123. 21 true positives across two unrelated apps say the rule earns its gate. | Any verdict change for `token-exists-for-literal`. |
| Narrow by value (e.g. skip `#fff`) | No | #123 and the measurement. A value filter clears class 5 and also hides the toast, the badge and the scrollbar. | Any allow- or deny-list of hex values. |
| Which narrowings ship | All three: token package, comments, masks | Recommended; accepted under Jordan's standing instruction (2026-09-11). The mask narrowing is 4 flags for a small, specific rule, so it passes #123's "take it only if it stays small". | A two-narrowing build, unless the mask step grows past the rule below. |
| How the token package is found | For each `--tokens` file, the nearest directory at or above it that holds a `package.json`. If no ancestor has one, that file excludes nothing. | Recommended; accepted under Jordan's standing instruction (2026-09-11). It's the rule the measurement's prototype used, and it lands on `packages/tokens` and `libs/shared/util-tokens` in both apps. | Guessing the package from a directory name (`tokens`, `util-tokens`), or a new flag naming it. |
| When the token package is excluded | Only when it sits strictly beneath `--root`. A package that is `--root`, or contains it, excludes nothing. | Recommended; accepted under Jordan's standing instruction (2026-09-11). A single-package app with `tokens.json` beside its root `package.json` would otherwise exclude the whole app, and the colour rule would check nothing while the run stays green on component matches. In the documented install (`--root ../../apps`, tokens in `packages/tokens`) the two never overlap, so the exclusion is a no-op there. | Excluding an owning package that contains the scanned app. |
| What the exclusion removes | Every file under that package, for every rule. | Recommended; accepted under Jordan's standing instruction (2026-09-11). The design system isn't its own consumer. One exclusion is also easier to report and reason about than a colour-only one. | Checking hex drift inside a package that both owns the tokens and ships components. A layout like that, scanned from above, is not checked, and the report says so. |
| Where the exclusion happens | In the CLI, after the walk and before `extract`. The walker is unchanged. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Partitioning walked files lets the report count what it set aside. Passing an extra exclude into `walk` would skip the directory without counting it, and changing `DEFAULT_EXCLUDES` would change `grep-color-usage.mjs` and `guard-token-removal.mjs` too. | Any change to `scripts/lib/source-scan.mjs`. |
| How the exclusion is reported | One headline line per excluded package: `excluded:     N file(s) in <dir>, the package that owns --tokens`. Printed only when something was excluded. | #123: "Say what was skipped in the report so the exclusion stays visible." The count and wording are recommended; accepted under Jordan's standing instruction (2026-09-11). | A silent exclusion. |
| What the headline's file count means | Files scanned, which is files walked minus files excluded. `nothing-scanned` reports the same number. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Q5 chose files walked over files yielding so a wrong `--root` shows up. That still holds: a run that excluded everything reads `0 files` with the `excluded:` line right under it. Counting excluded files would make `nothing-scanned` claim it read files it never opened. | Reporting excluded files in the headline count. |
| Which comments are blanked, and where | `/* */` in every scanned file type. `//` to end of line in every type except `.css`, unless the character right before it is `:`. | #123 and the measurement's prototype, which measured exactly this split (`//` everywhere but `.css`) and lost 0 true positives. `.vue` and `.svelte` hold JS, and `.sass` uses `//`. The `:` exception keeps `https://` alive. | Blanking `//` in `.css`, where it isn't a comment. HTML comments (`<!-- -->`) in `.vue` / `.svelte` templates. |
| How comments are blanked | One left-to-right regex pass where whichever opener comes first wins. Every non-newline character in a match becomes a space. An unterminated `/*` is left alone. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Two sequential passes, as in the prototype, let a `/*` sitting inside a `//` comment pair with a real `*/` lines later and blank the code between. Keeping newlines keeps line numbers exact. Leaving an unterminated `/*` alone errs toward flagging, never toward losing a true positive. | Tracking string literals, which would be a parser (parent spec, Decision 5). A `//` or `/*` inside a string can still blank the rest of a line or span, and the re-run is the check that it costs no true positive in either app. |
| What blanked text feeds | Hex extraction only. Import and element extraction read the original text. | Recommended; accepted under Jordan's standing instruction (2026-09-11). Keeps the change inside the colour rule. | Any change to what `unknown-component`, `unknown-variant-value` or the advisories see. |
| Which mask declarations are skipped | A declaration whose property is exactly `mask` or `-webkit-mask`. The value runs from the `:` to the next `;`, `{` or `}`, across lines. Only in `.css` and `.scss`. | Recommended; accepted under Jordan's standing instruction (2026-09-11). That's the measured shape (`account-settings.component.scss:23-28`). `.sass` has no `;` to end a value. In JS, TS, `.vue` and `.svelte`, a value ending at `}` could swallow a sibling property's real hex. | `mask-image`, `mask-border` and other `mask-*` properties, custom properties like `--mask`, SCSS variables like `$mask`, and masks in `.sass`, SFC style blocks or CSS-in-JS. All of those still flag. |
| Do the narrowings report counts | No. Hex in comments and masks simply isn't extracted. | Recommended; accepted under Jordan's standing instruction (2026-09-11). A comment isn't code, and a mask's colour carries no meaning. Only the package exclusion drops real files, so only it is reported. | A `comments:` or `masks:` line in the report. |
| Where the before-and-after numbers live | A new section appended to the measurement note, plus a line in this spec's "What shipped". | #123 asks for "numbers from the real change, not the prototype". The note holds the before, so the after belongs beside it. Placement recommended; accepted under Jordan's standing instruction (2026-09-11). | A separate note. |
| CHANGELOG | Fold the change into the existing, unreleased gate entry under `[Unreleased]` → Added. Don't write a separate Fixed entry. | Recommended; accepted under Jordan's standing instruction (2026-09-11). No user has run the gate. #109's pre-release fix was folded into the same entry, which is the precedent. | A Fixed entry describing a bug nobody could have hit. |

## Open questions

- **storybook-static in a local checkout** — a gitignored
  `packages/ui/storybook-static` in the local throughline-ds adds 105 flags from
  minified bundles. A fresh clone and a CI checkout never see it. Options: add
  `storybook-static` to `DEFAULT_EXCLUDES` in `lib/source-scan.mjs`, or leave it.
  **I'd recommend a follow-up issue, not this build.** It changes the walker
  that `grep-color-usage.mjs` and `guard-token-removal.mjs` share, and it's a
  build-output class, not a colour-rule class. Unresolved.
- **`mask-image` and friends** — `mask-image: linear-gradient(#000, transparent)`
  is a common fade idiom and would flag the same way. Neither app has a hex
  inside one. The only `mask-image` gradient in zygarden uses `rgba()`, so hex
  extraction never sees it. **I'd recommend waiting for a real flag before
  widening.** Under `mask-mode: luminance`, colour does matter. Unresolved.
- **Masks outside `.css` / `.scss`** — SFC style blocks, `.sass`, CSS-in-JS.
  **Same recommendation: wait for evidence.** Unresolved.

## Plan

The measurement clones and the as-shipped run outputs are in this session's
scratchpad. Every command below uses
`M=/private/tmp/claude-501/-Users-jordanpease-Dev-throughline/34e9781c-566c-40de-b615-11bc1fb97988/scratchpad/measure`.
If that directory is gone, rebuild it from the note's Reproduce block. Get the
as-shipped outputs by running the same commands from a
`git worktree add <dir> 6ea9a5c` of the gate before this change.

All code changes go in `scripts/validate-adherence.mjs`, and every new test goes
in `scripts/validate-adherence.test.mjs` in the house style: `node:test`, inline
fixtures, tmp dirs for CLI tests.

### Step 1 — Blank comments before hex extraction

Files: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`

Change:
- Export `blankComments(text, path)`. Build one global regex: for a `path`
  ending `.css`, `/\/\*[\s\S]*?\*\//g`; otherwise
  `/\/\*[\s\S]*?\*\/|(?<!:)\/\/[^\n]*/g`. Replace each match with the same
  string where every character except `\n` is a space.
- `extract(text, pkg, path = '')` gains a third parameter. `IMPORT` and
  `ELEMENT` still run over `text`. `HEX` runs over the blanked text.
- `main()` passes `path` to `extract`.
- The file header comment gains a pointer to this spec.

Tests:
- `--x: var(--signal-500); /* #5B7FFF */` in `a.css` yields no literal.
- A hex on the line after a three-line `/* */` block still reports that line's
  number. Count it by hand in the fixture, not off the implementation.
- `// #3b82f6` yields no literal in `a.scss`, in `a.ts` and with no path.
- In `a.css`, a hex after `//` is still extracted.
- `const u = 'https://x.test'; const c = '#3b82f6';` in `a.ts` still yields
  `#3b82f6`.
- `// see /*` on line 1, then `color: #3b82f6;` on line 2, then `/* note */` on
  line 3, in `a.scss`, still yields `#3b82f6` at line 2.
- The existing `extract` tests still pass with no path given.

Verify: `node --test scripts/validate-adherence.test.mjs` → all pass,
including the new ones.

### Step 2 — Skip hex inside `mask` and `-webkit-mask` declarations

Files: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`

Change:
- Export `blankMasks(text, path)`. For a `path` not ending `.css` or `.scss`,
  return `text` unchanged.
- Otherwise replace the value of every match of
  `/(?<![\w$@.#-])(?:-webkit-)?mask\s*:([^;{}]*)/g`, meaning the capture only,
  with spaces, keeping `\n`. The lookbehind stops `--mask`, `$mask`, `.mask`
  and `x-mask` from matching. `mask-composite:` doesn't match because `-`
  follows `mask`.
- In `extract`, `HEX` runs over `blankMasks(blankComments(text, path), path)`.

Tests:
- The zygarden shape in `a.scss` yields no literal: a `-webkit-mask:` and a
  `mask:` declaration, each spanning three lines of
  `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);`.
- In the same fixture, a `color: #fff;` on the line after the mask still yields
  `#ffffff` at its own line number.
- `mask-composite: exclude;`, `--mask: #fff;` and `$mask: #fff;` do not
  suppress anything, so the latter two still yield `#ffffff`.
- The identical mask text in `a.tsx` still yields its literals, which pins the
  file-type scope.

Verify: `node --test scripts/validate-adherence.test.mjs` → all pass.

### Step 3 — Exclude the package that owns each `--tokens` file

Files: `scripts/validate-adherence.mjs`, `scripts/validate-adherence.test.mjs`

Change:
- Export `tokenPackageDirs(tokenFiles, root)`. Resolve `root` with
  `realpathSync`. For each tokens file, start at `dirname(realpathSync(file))`
  and walk up until a directory holds `package.json`, or the filesystem root is
  reached, in which case that file contributes nothing. Keep a directory only if
  it starts with `realRoot + sep`. It must not be equal to `realRoot`, and it
  must not contain `realRoot`. Return the de-duplicated list.
- In `main()`, compute the dirs once. Resolve `realRoot`, and for each walked
  path take its real form as `join(realRoot, relative(root, path))`. A path
  under a dir (`startsWith(dir + sep)`) is excluded and counted against that
  dir. Every other path is scanned as today.
- Call `validate` with `walked: scanned.length` and
  `excluded: [{ dir, files }]`. Print `dir` in the same spelling as finding
  paths: `join(root, relative(realRoot, dir))`.
- `validate` accepts `excluded = []` and returns it on the result unchanged.
- `formatReport`, after the `not read:` line, pushes one line per entry:
  `` `  excluded:     ${files} file(s) in ${dir}, the package that owns --tokens` ``.

Tests:
- `tokenPackageDirs` with a tmp tree `root/app/`, `root/tokens/package.json`
  and `root/tokens/dtcg/tokens.json` returns the real path of `root/tokens`.
- `tokenPackageDirs` with `repo/package.json`, `repo/tokens.json` and
  `root = repo/src` returns `[]`, because the owner contains the root. With
  `root = repo` it also returns `[]`.
- A CLI test on a tmp tree:
  - `app/page.css` holds `color: #3b82f6;`.
  - `tokens/package.json` sits beside `tokens/tokens.json`, which declares
    `#3B82F6`.
  - `tokens/css/tokens.css` holds `--c: #3b82f6;`.
  - A minimal `design-system.json` and `design-system/docs/index.json` sit in
    `--system`, and the run uses `--skip unknown-variant-value`.
  - The CLI exits 1 with exactly one `token-exists-for-literal` failure, at
    `app/page.css`.
  - The report contains `1 files` in the headline, and
    `excluded:     1 file(s) in` followed by the tokens dir.
- A CLI test on a single-package tmp tree:
  - `repo/package.json` and `repo/tokens.json` sit at the top, with
    `repo/src/a.css` holding the hex.
  - The run uses `--root repo/src`.
  - The hex is flagged, and no `excluded:` line appears.
- `formatReport` on `validate({ files: [], walked: 0, excluded: [{ dir: 'x/tokens', files: 3 }] })`
  contains both `nothing-scanned` and `excluded:     3 file(s) in x/tokens`.
- The existing "every rule renders without undefined" test passes an `excluded`
  entry too.

Verify: `node --test scripts/validate-adherence.test.mjs` → all pass.

### Step 4 — Document it

Files: `CHANGELOG.md`, `scripts/README.md`

Change:
- `CHANGELOG.md`: in the existing `scripts/validate-adherence.mjs` entry under
  `[Unreleased]` → Added, add one bullet to the "worth knowing" list. It should
  say the colour rule leaves three things alone: files inside the package that
  owns a `--tokens` file, which the report names; hex in comments; and hex
  inside `mask` / `-webkit-mask` in CSS and SCSS. It should also say it never
  skips a value because of what the value is. Change "Three things worth knowing"
  to match the new count. Write it with the `write-like-jordan` skill.
- `scripts/README.md`: in the `validate-adherence.mjs` paragraph under the usage
  block, add one sentence. Files inside the package that owns a `--tokens` file
  are not scanned when that package sits beneath `--root`, and the report prints
  an `excluded:` line naming it.

Verify: reviewed by eye against the house style of the neighbouring entries.

### Step 5 — CI

Files: none

Change: none. Run each as its own command:
`node --test`; `node ci/validate-plugin.mjs`; `node ci/validate-skills.mjs`;
`node scripts/adapters/generate.mjs --check`;
`node scripts/build-doc-card-builder.mjs --check`;
`node scripts/build-native-adapter-config.mjs --check`.

Verify: all six exit 0. `ci/validate-install-sets.test.mjs` runs under
`node --test`, and it is the check that no new local import broke an install
set. This change adds only `node:` built-ins.

### Step 6 — Re-run the measurement against the same commits and record it

Files: `docs/superpowers/notes/2026-09-11-colour-rule-measurement.md`, this spec

Change: from the repo root, with `$M` as above, confirm the clones are still at
`2a9d370` (`git -C $M/throughline-brand log -1 --format=%h`) and `ca61ca9a6`
(`git -C $M/zygarden-frontend ...`). Then run:

```sh
B=$M/throughline-brand
node scripts/validate-adherence.mjs --root $B/apps --system $B \
  --package @throughline-ds/ui --tokens $B/packages/tokens/dtcg/tokens.json > $M/after-brand-apps.txt
node scripts/validate-adherence.mjs --root $B/packages --system $B \
  --package @throughline-ds/ui --tokens $B/packages/tokens/dtcg/tokens.json > $M/after-brand-packages.txt
Z=$M/zygarden-frontend; T=$Z/libs/shared/util-tokens/src/tokens
for R in apps libs; do
  node scripts/validate-adherence.mjs --root $Z/$R --system $Z --package @zygarden/none \
    --tokens $T/color-primitives.json --tokens $T/color-semantic.dark.json \
    --tokens $T/color-semantic.light.json \
    --skip unknown-component --skip unknown-variant-value > $M/after-zyg-$R.txt
done
```

Then diff the flag sets, keeping multiplicity:

```sh
flags() { grep -o '\[token-exists-for-literal\] #[0-9a-f]* at [^ ]*' "$1" | sort; }
diff <(flags $M/brand-run1.txt)   <(flags $M/after-brand-apps.txt)
diff <(flags $M/zyg-apps-run.txt) <(flags $M/after-zyg-apps.txt)
diff <(flags $M/zyg-libs-run.txt) <(flags $M/after-zyg-libs.txt)
flags $M/after-brand-packages.txt | wc -l
```

Append an "After narrowing (#123)" section to the measurement note. It holds the
as-shipped vs narrowed table per run: flagged, true, false, unclear, false rate,
and the headline file count. It also holds the `excluded:` lines, and a sentence
confirming all 21 true positives still fail. Fill this spec's "What shipped" and
"Where it diverged", and set `Status: built`.

Verify: every diff shows **only removals, and exactly these**:
- **brand apps:** `lab.css:44` and `lab.css:48`. 14 → 12.
- **zygarden apps:** no difference. 11 → 11.
- **zygarden libs:** the 41 `libs/shared/util-tokens/css/tokens.css` lines, and
  `account-settings.component.scss` at `:24`, `:25`, `:27` and `:28`. 48 → 3,
  leaving `qr-code.helper.ts:21`, `global-error-handler.service.ts:85` and
  `meta-statistics.component.ts:46`.
- **brand packages:** 0 flags, down from 34, and an `excluded:` line naming
  `packages/tokens`.

The total is 26: 21 true, 4 false, 1 unclear, a 15% false rate. Any added line,
or any removal outside that list, is a lost true positive or a new false
positive. Stop and investigate before recording numbers.
