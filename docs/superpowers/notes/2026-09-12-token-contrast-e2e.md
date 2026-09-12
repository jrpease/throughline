# Colour contrast as a stop condition — end-to-end run (#45)

Date: 2026-09-12
Subject: `scripts/verify-check.mjs`, `scripts/lib/contrast.mjs`, Plan Step 13 of
`docs/specs/2026-09-12-token-contrast-validation.md`

Unit tests prove the maths and the pair table. Only a real install proves that a
consumer who follows `scripts/README.md` ends up with a contrast rule that runs,
in every mode, and stops a build. This is that run, with every control the spec
asks for — including the one that matters most, a system that passes in Light and
fails in Dark.

## The harness

A fixture design system in the session scratchpad, built by a script so it can be
rebuilt, with a `reset.sh` that restores it between controls:

```
design-system.json                              schemaVersion 7, no verification key
apps/web/app.css                                binds all 14 semantic tokens
packages/tokens/package.json                    the owner package
packages/tokens/dtcg/primitives.json            19 colour primitives (the ramps)
packages/tokens/dtcg/semantic.light.json        the 8 roles, aliasing the ramps
packages/tokens/dtcg/semantic.dark.json         the same 8 roles, own values
packages/tokens/scripts/                        the docs install set, 12 files
```

`components.built` is empty, so `state-incomplete` and `name-drift` have nothing
to examine and the contrast rule is the one under test.

**Run the strong way, not the convenient one.** The twelve files of the
documentation install set were copied into `packages/tokens/scripts/`, and every
run below is `npm run verify:check` from `packages/tokens` — not
`node scripts/verify-check.mjs` from the plugin checkout. That is what proves the
install set still closes under its imports now that `lib/contrast.mjs` has joined
it, and that the registered form is substitutable.

The registered command, with one `--tokens` per mode file:

```json
"verify:check": "node scripts/verify-check.mjs --root ../.. --tokens dtcg/primitives.json --tokens dtcg/semantic.light.json --tokens dtcg/semantic.dark.json"
```

## 1. The clean run

```
verify:check — 0 component(s), 0 doc record(s), 14 token candidate(s), 3 token mode(s), 1 file(s) scanned, 0 stage file(s) read
  excluded:     12 file(s) in ../../packages/tokens, the package that owns --tokens
  contrast:     16 pair(s) compared across 2 mode(s), 0 skipped as unresolvable, 0 skipped as non-hex, 0 skipped for a translucent background
1 informational note(s) — reported, not gating:
  ~ [proof-unadopted] design-system.json has no "verification" key, so this system has not adopted the proof bundle and the proof-integrity checks are skipped. The first verify-check.mjs --record adopts it.
exit=0
```

Sixteen pairs — the eight the table names, in each of the two modes. **The
`contrast:` line names 2 modes, not 3**: three `--tokens` files were passed, and
the primitives file holds no semantic role, so it abstains and contributes
nothing. The headline's "3 token mode(s)" counts sources; the `contrast:` line
counts the modes a pair was actually compared in. A run reporting 1 mode there
would mean the mode files were not both passed, and the whole rule would be
untested.

## 2. The discriminating control — Dark only

`color.text.onEmphasis` re-pointed at a low-contrast primitive **in
`semantic.dark.json` only**, Light untouched. One value in one mode is the only
difference from the clean run above:

```
  contrast:     16 pair(s) compared across 2 mode(s), 0 skipped as unresolvable, 0 skipped as non-hex, 0 skipped for a translucent background

1 failure(s):
  - [color-contrast] color.text.onEmphasis on color.bg.emphasis is 2.61:1 in semantic.dark (#94a3b8 on #1d4ed8) — WCAG AA needs 4.5:1 for normal text. Re-point one side of the pair at a primitive with more separation in that mode; the pair has to clear in every mode, not on average.
exit=1
```

Exactly one `color-contrast` failure, naming `semantic.dark`. This is the rule's
central claim, and the case a merged-modes implementation would silently get
wrong: the same pair still clears in Light, and the system still fails.

## 3. The remaining controls

Each run immediately after a clean run, and reverted before the next.

### 3a. A source with no role the table knows → `contrast-rule-inert`

Only `dtcg/primitives.json` passed:

```
  contrast:     0 pair(s) compared across 0 mode(s), 0 skipped as unresolvable, 0 skipped as non-hex, 0 skipped for a translucent background

3 failure(s):
  - [nothing-verified] the enabled rules examined nothing: no alias token candidate, no doc record, no component in components.built, no colour pair compared. Check --root points at the design system, and that --tokens names a real token source.
  - [orphan-rule-inert] no token source yielded an alias, so orphan-token checked nothing. Pass the --tokens file that holds the semantic tier, or --skip orphan-token if this system has none.
  - [contrast-rule-inert] no token source held both sides of any checked colour pair, so color-contrast compared nothing. Pass the --tokens file that holds the semantic colour tier, or --skip color-contrast if this system names its roles differently.
exit=1
```

A rule that recognised nothing goes red rather than reporting a clean sweep.

### 3b. `--skip color-contrast`, with the Dark failure still in place

```
  excluded:     12 file(s) in ../../packages/tokens, the package that owns --tokens
  skipped:      color-contrast
exit=0
```

The failure and the whole `contrast:` line are gone, and the rule is named on the
`skipped:` line rather than disappearing quietly. This is the escape hatch a
consumer registers when their roles are spelled differently, and what
`storybook-chromatic-builder` registers when its own live run shows every failure
is an accepted role pair. It is **not** `token-sync-layer`'s accepted-pair path,
which runs the gate and subtracts from the result (3e).

### 3c. The token-sync invocation does not trip `nothing-verified`

`--skip orphan-token --skip state-incomplete --skip name-drift` on a healthy
fixture — the shape `token-sync-layer` actually invokes:

```
verify:check — 0 component(s), 0 doc record(s), 0 token candidate(s), 3 token mode(s), 1 file(s) scanned, 0 stage file(s) read
  contrast:     16 pair(s) compared across 2 mode(s), 0 skipped as unresolvable, 0 skipped as non-hex, 0 skipped for a translucent background
  skipped:      orphan-token, state-incomplete, name-drift
exit=0
```

`nothing-verified` absent (grep count `0`). All three of the counter's old
subjects are zeroed here, so without Step 4's change to `examined` this healthy
system would have failed — and the regression would only ever have surfaced in a
user's sync.

### 3d. A recorded `pass` contradicted by the rerun

`token-sync-layer` records `color-contrast` as `pass` while the Dark failure
stands:

```
2 failure(s):
  - [color-contrast] color.text.onEmphasis on color.bg.emphasis is 2.61:1 in semantic.dark (#94a3b8 on #1d4ed8) — WCAG AA needs 4.5:1 for normal text. …
  - [proof-contradicted] token-sync-layer recorded color-contrast as "pass" for system, but this run derives "fail". A derived result is a cache, not a claim — fix what it found, or re-record it.
exit=1
```

The `derived` label is real: the stored result is a cache the next run recomputes.

### 3e. The accepted-pair subtraction, both ways

The entry is recorded the way `token-builder` would record it — **with the Figma
mode name**, not the fixture's file name:

```json
"accepted": [{ "fg": "color.text.onEmphasis", "bg": "color.bg.emphasis", "mode": "Dark" }]
```

The subtraction reads the gate's formatted failure lines
(`<fg> on <bg> is <ratio>:1 in <mode> …`) — machine-formatted output with the
three fields in fixed positions, not the `advancedBecause` prose — and translates
`Dark` → `semantic.dark` before matching.

**(i) The accepted pair alone — the sync proceeds:**

```
gate exit=1
  - [color-contrast] color.text.onEmphasis on color.bg.emphasis is 2.61:1 in semantic.dark (#94a3b8 on #1d4ed8) — …
gate reported 1 color-contrast failure(s)
accepted: [{"fg":"color.text.onEmphasis","bg":"color.bg.emphasis","mode":"Dark"}]
after subtraction: 0 remaining
VERDICT: sync proceeds
```

**(ii) A second, unaccepted pair breaks too — the sync stops.**
`color.text.primary` over `color.bg.default`, same mode:

```
gate exit=1
  - [color-contrast] color.text.primary on color.bg.default is 2.50:1 in semantic.dark (#4b5563 on #111111) — …
  - [color-contrast] color.text.onEmphasis on color.bg.emphasis is 2.61:1 in semantic.dark (#94a3b8 on #1d4ed8) — …
gate reported 2 color-contrast failure(s)
accepted: [{"fg":"color.text.onEmphasis","bg":"color.bg.emphasis","mode":"Dark"}]
after subtraction: 1 remaining
  STILL STANDING: color.text.primary on color.bg.default is 2.50:1 in semantic.dark
VERDICT: sync stops
```

One acceptance does not carry an unrelated pair through. Without (ii), a green
run could not be told from a broken subtraction rule.

**What this proves and what it does not.** The tester performed the Figma-mode
translation by hand, so what is demonstrated is that a value `token-builder` can
actually produce is matchable once translated — not that the sync's mapping rule
works, which only a real sync exercises. Recording the Figma name rather than the
fixture's filename is still the point: a hand-authored file label would have
proved the matching rule while hiding that no skill can produce that value.

## 4. Alpha, both ways

**Translucent foreground** (`status/danger/text` at `#991b1bf2` over an opaque
`status/danger/bg`) — composited and compared, and it still clears:

```
  contrast:     16 pair(s) compared across 2 mode(s), 0 skipped as unresolvable, 0 skipped as non-hex, 0 skipped for a translucent background
exit=0
```

**Translucent background** (`status/danger/bg` at `#fef2f280`) — skipped and
counted:

```
  contrast:     15 pair(s) compared across 2 mode(s), 0 skipped as unresolvable, 0 skipped as non-hex, 1 skipped for a translucent background
exit=0
```

Sixteen pairs to fifteen, and the missing one shows up as a translucent-background
skip rather than vanishing. The skip is only trustworthy next to a case that was
not skipped, which is why both run in the same session.

## 5. Record mode for the new stage

```
✓ verify:check — recorded token-builder · system (626692d8b7cb5026)
```

The stage file lands at `design-system/proof/token-builder.json` under subject
`system`, carrying the attested `contrast-baseline` and its `accepted` array. The
manifest pointer:

```json
"token-builder": {
  "at": "2026-09-12T13:00:00.000Z",
  "adoptedAt": "2026-09-12T13:00:00.000Z",
  "fingerprint": "626692d8b7cb5026"
}
```

`token-builder has exempt: false` — a system-wide stage omits the key, as the
contract says. Recording a second stage (`token-sync-layer`) afterwards left this
pointer byte-identical (`UNCHANGED ✓`).

## 6. Restore

```
  contrast:     16 pair(s) compared across 2 mode(s), 0 skipped as unresolvable, 0 skipped as non-hex, 0 skipped for a translucent background
exit=0
```

Back to the clean run it started from.

## A harness bug this run caught

The first pass at control 3e **came back clean both ways** — "sync proceeds" for
the accepted pair and "sync proceeds" again when a second, unaccepted pair was
broken. Per `ci/README.md:69-99` that is the harness being broken, not the code
being clean, so the run was not recorded.

The cause was in the harness, not the gate: the sync invocation's flags were held
in a shell variable (`$SYNC`), and zsh does not word-split an unquoted variable
the way bash does. The gate received one malformed argument and exited `2` — bad
CLI arguments — writing no report. The subtraction script then parsed zero
failure lines out of an empty report and concluded, correctly for its input, that
nothing remained.

Both runs were repeated with the flags written out literally, which is where the
discriminating result in 3e(ii) came from. Worth recording because a control that
silently measures nothing is exactly the failure the rule exists to catch, and
here it produced the reassuring answer twice.

## Verdict

PASS. The clean run counts only because the controls in the same session failed
the way the spec says they must: Dark-only failure while Light clears,
`contrast-rule-inert` on an unrecognised source, `proof-contradicted` on a stale
`pass`, a surviving unaccepted pair after subtraction, and a counted skip beside
an uncounted comparison.
