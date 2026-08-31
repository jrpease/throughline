# normalizeKey collisions (#36) — measured through the real pipeline

**Date:** 2026-08-31
**Gate for:** the #36 fix — detecting source paths that reduce to one symbol name.
**Verdict:** PASS, and the defect is worse than the issue recorded: the emitted
Kotlin **does not compile**, which no one had checked.

## Why this run exists

#36 describes a validator blind spot: two source paths normalizing to one key,
the later silently overwriting the earlier. It was accepted as a deferred minor
on fixture evidence. Nobody had put the colliding source through Style
Dictionary to see what the build actually emits.

## Harness

Same rebuilt harness as the #85 run — Style Dictionary 4.4.0,
`build.mjs` (top-level + platform wiring), module installed by copy as
`lib/{dtcg,native-literal,sd-native}.mjs`. Fixture is the issue's own pair:

```json
{ "color":   { "bg": { "canvas": { "$value": "4px", "$type": "dimension" } } },
  "colorBg": {        "canvas": { "$value": "9px", "$type": "dimension" } } }
```

## Finding 1 — the build emits the same name twice

```
$ node build.mjs tok-36 out-36
$ grep 'val ' out-36/Tokens.kt
  val colorBgCanvas = 4.00.dp
  val colorBgCanvas = 9.00.dp
```

Style Dictionary does not dedupe these: the two paths are distinct, and both
camel-join to `colorBgCanvas`.

## Finding 2 — it does not compile, and the issue never said so

```
$ node ci/compile-native-output.mjs out-36 --allow-missing
  [FAIL] kotlin: out-36/Tokens.kt:13:7: error: conflicting declarations:
                 out-36/Tokens.kt:14:7: error: conflicting declarations:
  [PASS] swift: parsed only
```

This is what settles the design question. #36 reads as a matching problem, which
would argue for an advisory. It is not: the source is genuinely ambiguous for
native output and the generated file is broken. So the fix **gates**.

## Finding 3 — both failure directions, measured on `a349453`

| output contains | main (0.17.0/0.18.0) | with the fix |
|---|---|---|
| both symbols | `ok: false` — but a **`unit-fidelity` failure naming `colorBgCanvas`**, comparing it against `colorBg.canvas` (9px) when `4.00.dp` is correct for `color.bg.canvas`. `matched: 2` | `ok: false`, collision named, `matched: 0`, no false failure |
| only the winner's symbol | **`ok: true`, `matched: 1`, zero failures** — a green run with `color.bg.canvas` never checked | `ok: false`, collision named |

The second row is the silent one the issue was filed for. The first is worse in
a way the issue did not record: a **confident wrong diagnosis**, sending the
author to a token that is correct.

## Design decision, and what it cost

Collided keys are left **out of `byKey`** entirely. A symbol on an ambiguous key
then matches nothing, falls through before any source comparison, and is not
counted in `matched` — which is the truth, since it did not match a determinate
token. That removes the false `unit-fidelity` failure with no special case in
the matching loop. The literal, foreign-syntax and bare-unit rules still run on
it, because none of them reads the source.

One report-quality consequence, fixed: with the collided tokens excluded, a small
source can drop to `matched: 0`, which used to print *"the adapter's naming
convention does not line up"*. That is a confident wrong cause. The message is
now collision-aware and points at the collisions instead.

## Regression control

Real zygarden source, light+mobile pin, against the #85 build output:

```
tokens:validate-output — 208/208 emitted symbols matched a source token (100%)
10 advisory note(s)
3 source token(s) had no matching emitted symbol
```

Unchanged, and **zero collisions** — which is what Spec Decision 4 assumed and
is now checked rather than assumed.

## Reproduce

```
$ cd <harness>
$ node build.mjs tok-36 out-36
$ node ci/compile-native-output.mjs out-36 --allow-missing        # kotlin FAIL
$ node <repo>/scripts/validate-token-output.mjs \
    --source tok-36/collide.json --output out-36/Tokens.kt \
    --platform android-kotlin --min-match 1
```
