# Ranked backlog session — handoff

**Date:** 2026-08-23
**Branches:** `fix/53-native-literal-validity` (PR [#56](https://github.com/jrpease/throughline/pull/56), open) → `fix/55-hoist-dual-nodes` (stacked, local only)

## The agreed order

Working the open-issue backlog in this order, one item at a time, full
brainstorm → spec → `/review-spec` → plan → subagent execution → PR:

**#53 ✅ → #55 (in progress) → #51 → #52 → #36 → #54**

Chosen over starting with #39 (the consumption-layer keystone) because #53 and
#55 are correctness debt on code that just shipped, and the epic should start on
a clean base. Checkpoint agreed: pause after each PR, not at each stage.

## What shipped — #53

[PR #56](https://github.com/jrpease/throughline/pull/56), 12 commits, **open and
awaiting review**. Native token output that did not compile is fixed and gated.

| | before | after |
|---|---|---|
| declarations | 196 | 195 |
| broken symbols | 15 | 0 |
| `value-verified` | 107 | 107 (unchanged) |

312 tests, six gates green. Residual review findings filed as
[#57](https://github.com/jrpease/throughline/issues/57).

New surface worth knowing about: `scripts/lib/native-literal.mjs` — a
zero-dependency literal grammar with two consumers, `sd-native.mjs`'s output
filter and `validate-token-output.mjs`'s `invalid-literal` rule.

**The one thing to understand before touching this area:** three separate
definitions of "CSS-function-like" now exist — `CSS_CONSTRUCT` and
`CSS_FUNCTION` in `native-literal.mjs`/`sd-native.mjs`, and `FOREIGN` in
`validate-token-output.mjs`. They agree today and nothing enforces that. Adding
a name to `FOREIGN` alone re-creates a bug where the build silently drops the
very value the gate was just taught to catch. That is #57 item 1.

## In progress — #55

Branch `fix/55-hoist-dual-nodes`, **two commits, spec only, no code written.**
Stacked on the #53 branch deliberately: both touch `scripts/lib/sd-native.mjs`,
and `references/native-adapter-config.md` is generated from that whole module,
so branching off `main` guarantees a conflict. **It must merge after #56.**

Spec: `docs/superpowers/specs/2026-08-23-hoist-dual-nodes-design.md`, at
revision 2 after `/review-spec` returned "needs revision".

### The finding that reframes the issue

**DTCG forbids dual nodes.** #55's premise — "DTCG permits a node carrying both
a `$value` and children" — is false against the current draft (30 July 2026,
§6.1, MUST-level), and §6.2's `$root` is the sanctioned alternative, so the
prohibition is deliberate. Two repo comments repeat the falsehood and are
corrected as part of this work: `sd-native.mjs:61` and
`build-native-adapter-config.mjs:102`.

This does **not** change what throughline does — Figma emits dual nodes and
`hoistDualNodes` stays. It removes the open question #55 was blocked on: there
is no conforming reading to discover, so the behaviour is a judgment about
malformed input and must be argued that way, not as a spec interpretation.

### Three things measured, not assumed

1. Both defects reproduce against the shipped function.
2. **A third collision variant the issue does not name:** two *hoists* can
   collide with each other with no authored sibling involved — `t.a.bC` and
   `t.aB.c` both camel-join to `t.aBC`, and one token vanishes.
3. **The naive `$type`-carry rule manufactures a new #52.** DTCG §5.2.2 orders
   its rules: a reference-valued token takes its *referent's* type, outranking
   group inheritance. But `preprocess` runs `resolveInPlace` before
   `hoistDualNodes`, so every whole-value reference is already a literal by hoist
   time and the parent's `$type` gets stamped over the referent's. The spec's
   exclusion handles this with a module-private `Symbol` set where the reference
   is still visible.

### Next step

Write the implementation plan from the spec, then execute. The spec's Testing
section is already decomposed into 12 numbered items with the depth each
exercises named — the plan can lean on it directly.

Two things the plan must not lose:

- **The idempotency test does not exist.** `sd-native.mjs:246` asserts
  idempotency in prose and real builds rely on it, but there is no test. It has
  to be written, not preserved.
- **Neither defect is reachable from the real source.** Zygarden's `text.*`
  children each carry `$type: dimension` and no name collides. Coverage is
  synthetic fixtures; the e2e run's only job is to prove *nothing moved*
  (195 / 0 / 107). Do not let the e2e run be described as validating the fix.

## Open questions

- **Merge order.** #55 is stacked on #53. If #56 gets substantive review changes,
  #55 needs a rebase. Alternatively merge #56 first and rebase #55 onto `main`.
- **Should dual nodes be reported as invalid DTCG?** Now that the shape is known
  non-conforming, detecting and warning on it is a real option — but it belongs
  in a validator, not in a preprocessor whose job is to make the build work.
  Deliberately out of scope for #55; not yet filed as an issue.

## Working notes

- **The e2e harness is a scratchpad artifact and will not survive.** It lived at
  `<session-scratchpad>/e2e` with style-dictionary 4.4.0 installed and
  `scripts/lib` symlinked to the repo's live code, so builds tested shipping
  code rather than a snapshot. No token source is vendored in this repo —
  zygarden is external, at `~/Dev/zygarden-frontend`, branch
  `feature/apply-brandguide-styles`, read with `git show <branch>:<path>`; do not
  check it out or modify it. Rebuilding the harness is the first step of any
  future e2e run.
- Reviews on the escalated tier earned their cost twice this session, both times
  on defects that were invisible to a green test suite: the gradient shipping
  *quoted* rather than dropped, and the filter silently swallowing the
  `calc`/`var`/`color-mix` set. Both were spec defects of mine, not
  implementation errors.
