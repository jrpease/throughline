# hoistDualNodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `hoistDualNodes` silently discarding a token on a name collision, and stop it dropping the `$type` a hoisted child should keep.

**Architecture:** Both fixes live in one module-private function in `scripts/lib/sd-native.mjs`. Collision detection threads an accumulator through the recursion and throws once from `preprocess`, after the whole tree is walked. `$type` inheritance carries the dual node's type onto an untyped child, except where the child's authored value was a whole-value reference — those are tagged by `resolveInPlace` with a module-private `Symbol` while the reference is still visible.

**Tech Stack:** Node ≥20, ES modules, `node:test` + `node:assert/strict`. Zero runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-23-hoist-dual-nodes-design.md` (revision 2)

## Global Constraints

- **Zero dependencies.** `scripts/lib/sd-native.mjs` imports only `node:*` builtins and local modules. Style Dictionary is a parameter, never an import.
- **Node ≥20**, ESM.
- **Every line of code added to `sd-native.mjs` must sit inside the `preprocess` `@doc-section` pair** (currently lines 56–124). Only blank lines and `//` comments may sit outside a pair; `node scripts/build-native-adapter-config.mjs --check` fails loudly otherwise. Regenerate the doc in the same commit.
- **Do not fix, mask, or work around #51, #52, #54.** Task 2 deliberately *widens* #52 and must prove it by test rather than hide it.
- **`scripts/lib/dtcg.mjs` is NOT touched.** Spec revision 1 listed it in error; it makes no legality claim.
- **Test style:** `import { test } from 'node:test'; import assert from 'node:assert/strict';` — flat `test(...)` calls, no suites.
- Baseline: `node --test` = **312 pass / 0 fail**; all six gates green; `main` is at `698a236`.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/lib/sd-native.mjs` | modify | `hoistDualNodes` (collision + `$type`), `resolveInPlace` (reference tag), `preprocess` (throw). |
| `scripts/lib/sd-native.test.mjs` | modify | Fixtures for both defects, the third collision variant, the exclusion, idempotency. |
| `scripts/build-native-adapter-config.mjs` | modify | Correct the "legal DTCG" narrative prose at line 102. |
| `references/native-adapter-config.md` | **generated** | Regenerate; never hand-edit. |

Task 1 and Task 2 both edit `hoistDualNodes` and must run in order. Task 3 depends on both.

---

### Task 1: Collision detection

**Files:**
- Modify: `scripts/lib/sd-native.mjs` — `hoistDualNodes` (line 106), `preprocess` (line 121)
- Test: `scripts/lib/sd-native.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `hoistDualNodes(node, collisions, prefix)` — module-private, signature changed. `preprocess(dict)` unchanged externally, but now throws on collision.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/sd-native.test.mjs`:

```js
// A dual node's child is renamed to a camel-joined sibling. If that name is
// already taken, the pre-fix code overwrote it and a token vanished with no
// diagnostic — the same class as the mode collision nativeSources guards.
test('preprocess throws when a hoisted name collides with an authored token', () => {
  assert.throws(
    () =>
      preprocess({
        text: {
          sm: { $value: '14px', lineHeight: { $value: '20px' } },
          smLineHeight: { $value: '28px' },
        },
      }),
    (err) => {
      assert.match(err.message, /collide/i);
      assert.match(err.message, /text\.sm\.lineHeight/);
      assert.match(err.message, /text\.smLineHeight/);
      return true;
    },
  );
});

// A group, not a token — hoisting onto it would destroy a whole subtree.
test('preprocess throws when a hoisted name collides with an authored group', () => {
  assert.throws(
    () =>
      preprocess({
        text: {
          sm: { $value: '14px', lineHeight: { $value: '20px' } },
          smLineHeight: { bold: { $value: '28px' } },
        },
      }),
    /collide/i,
  );
});

// Neither name is authored: t.a.bC and t.aB.c both camel-join to t.aBC.
// The issue does not name this variant; it was found by probing.
test('preprocess throws when two hoists collide with each other', () => {
  assert.throws(
    () =>
      preprocess({
        t: {
          a: { $value: '1px', bC: { $value: '2px' } },
          aB: { $value: '3px', c: { $value: '4px' } },
        },
      }),
    /collide/i,
  );
});

// findModeCollisions exempts identical values because it is deduping across
// files. This is not a dedupe — two distinct authored tokens land on one name,
// and they may differ in $type or $description even with equal $value.
test('preprocess throws on collision even when the values are identical', () => {
  assert.throws(
    () =>
      preprocess({
        text: {
          sm: { $value: '14px', lineHeight: { $value: '20px' } },
          smLineHeight: { $value: '20px' },
        },
      }),
    /collide/i,
  );
});

// The recursion is depth-first, so the deepest frame finishes first. An
// implementation that throws per-frame reports one subtree and stops.
test('preprocess reports every collision, across depths, in one error', () => {
  assert.throws(
    () =>
      preprocess({
        outer: {
          a: { $value: '1px', b: { $value: '2px' } },
          aB: { $value: '3px' },
          nested: {
            c: { $value: '4px', d: { $value: '5px' } },
            cD: { $value: '6px' },
          },
        },
      }),
    (err) => {
      assert.match(err.message, /outer\.a\.b/);
      assert.match(err.message, /outer\.nested\.c\.d/);
      assert.match(err.message, /^2 hoisted token name/m);
      return true;
    },
  );
});

// sd-native.mjs states in prose that preprocess is idempotent, and real builds
// rely on it (a project may declare the preprocessor at top level as well as on
// the platform). No test asserted it before this one.
test('preprocess is idempotent', () => {
  const input = {
    text: {
      sm: { $value: '14px', $type: 'dimension', lineHeight: { $value: '20px', $type: 'dimension' } },
    },
  };
  const once = preprocess(input);
  const twice = preprocess(once);
  assert.deepEqual(twice, once);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: the five collision tests FAIL (no throw). The idempotency test should already PASS — it documents existing behaviour; if it fails, stop and report, because that is a pre-existing bug outside this task.

- [ ] **Step 3: Thread the accumulator and detect**

In `scripts/lib/sd-native.mjs`, replace `hoistDualNodes` (line 106) entirely:

```js
// text.sm.lineHeight becomes text.smLineHeight, which name/camel renders as
// textSmLineHeight — the identical symbol the un-hoisted path would produce.
//
// Collisions are COLLECTED, not thrown here: the walk has to continue to report
// every one, and the recursion is depth-first, so throwing from a frame would
// report one subtree. preprocess throws once, after the whole tree is walked.
//
// On collision the assignment is SKIPPED. Continuing to overwrite while
// collecting means later detections are computed against a tree already
// corrupted — the enclosing loop's Object.entries snapshot still holds the
// detached node, and its own children then hoist out of a subtree no longer
// reachable.
function hoistDualNodes(node, collisions, prefix = []) {
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$') || !val || typeof val !== 'object') continue;
    hoistDualNodes(val, collisions, [...prefix, key]);
    if ('$value' in val) {
      for (const [childKey, childVal] of Object.entries(val)) {
        if (childKey.startsWith('$') || !childVal || typeof childVal !== 'object') continue;
        const hoisted = key + childKey[0].toUpperCase() + childKey.slice(1);
        if (hoisted in node) {
          collisions.push({
            from: [...prefix, key, childKey].join('.'),
            onto: [...prefix, hoisted].join('.'),
            existing: node[hoisted].$value,
          });
          continue;
        }
        node[hoisted] = childVal;
        delete val[childKey];
      }
    }
  }
  return node;
}
```

- [ ] **Step 4: Throw once, from `preprocess`**

Replace `preprocess` (line 121):

```js
export function preprocess(dict) {
  const collisions = [];
  const out = hoistDualNodes(
    resolveInPlace(structuredClone(dict), flattenDtcg(dict)),
    collisions,
  );
  if (collisions.length) {
    const shown = collisions
      .slice(0, 5)
      .map((c) => `  ${c.from} -> ${c.onto}` + (c.existing === undefined ? ' (a group)' : ` (would overwrite ${JSON.stringify(c.existing)})`))
      .join('\n');
    const more = collisions.length > 5 ? `\n  ...and ${collisions.length - 5} more` : '';
    throw new Error(
      `${collisions.length} hoisted token name(s) collide with an existing sibling.\n` +
        "A dual node's child is renamed to a camel-joined sibling, and that name is taken.\n" +
        'Hoisting would silently discard one of the two. Rename the child or the sibling.\n' +
        `${shown}${more}`,
    );
  }
  return out;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: PASS. The pre-existing hoist tests and "does not mutate its input" must still pass untouched.

- [ ] **Step 6: Full suite**

Run: `node --test`
Expected: 318 pass, 0 fail (312 + 6 new).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/lib/sd-native.test.mjs
git commit -m "fix: throw when a hoisted dual-node name collides instead of discarding a token (#55)"
```

---

### Task 2: `$type` inheritance, with the reference exclusion

**Files:**
- Modify: `scripts/lib/sd-native.mjs` — `resolveInPlace` (line ~83), `hoistDualNodes`
- Test: `scripts/lib/sd-native.test.mjs`

**Interfaces:**
- Consumes: `hoistDualNodes(node, collisions, prefix)` from Task 1.
- Produces: a module-private `Symbol` tag on nodes whose authored `$value` was a whole-value reference.

- [ ] **Step 1: Write the failing tests**

```js
test('a hoisted child inherits the dual node $type when it has none', () => {
  const out = preprocess({
    text: { sm: { $value: '14px', $type: 'dimension', lineHeight: { $value: '20px' } } },
  });
  assert.equal(out.text.smLineHeight.$type, 'dimension');
});

test('a hoisted child keeps its own $type', () => {
  const out = preprocess({
    text: {
      sm: { $value: '14px', $type: 'dimension', family: { $value: 'Inter', $type: 'fontFamily' } },
    },
  });
  assert.equal(out.text.smFamily.$type, 'fontFamily');
});

test('nothing is invented when the dual node has no $type', () => {
  const out = preprocess({
    text: { sm: { $value: '14px', lineHeight: { $value: '20px' } } },
  });
  assert.equal('$type' in out.text.smLineHeight, false);
});

// Depth-first recursion means the inner hoist completes first, so lineHeightTight
// is a direct child of sm by the time sm hoists. This is the test that catches a
// $type carry running in the wrong recursion frame — every single-level test
// passes regardless.
test('$type inheritance reaches a child hoisted through two levels', () => {
  const out = preprocess({
    text: {
      sm: {
        $value: '14px',
        $type: 'dimension',
        lineHeight: { $value: '20px', tight: { $value: '18px' } },
      },
    },
  });
  assert.equal(out.text.smLineHeight.$type, 'dimension');
  assert.equal(out.text.smLineHeightTight.$type, 'dimension');
});

// DTCG 5.2.2 orders its rules: a reference-valued token takes the RESOLVED type
// of its referent, and that outranks group inheritance. resolveInPlace flattens
// the reference before the hoist runs, so without a tag the hoist cannot tell
// and would stamp the parent's $type over the referent's.
test('a child whose authored value was a reference does not inherit $type', () => {
  const out = preprocess({
    ratio: { normal: { $value: '1.5', $type: 'number' } },
    text: {
      sm: { $value: '14px', $type: 'dimension', lineHeight: { $value: '{ratio.normal}' } },
    },
  });
  assert.equal(out.text.smLineHeight.$value, '1.5');
  assert.equal('$type' in out.text.smLineHeight, false);
});

// The Symbol tag must not reach Style Dictionary or any serialized output.
test('the reference tag does not leak into output', () => {
  const out = preprocess({
    ratio: { normal: { $value: '1.5', $type: 'number' } },
    text: { sm: { $value: '14px', lineHeight: { $value: '{ratio.normal}' } } },
  });
  assert.deepEqual(Object.keys(out.text.smLineHeight), ['$value']);
  assert.equal(JSON.stringify(out).includes('was-reference'), false);
});

// #55's fix widens #52 rather than masking it: an untyped unitless literal child
// under a dimension-typed dual node now becomes dimension, which is exactly
// #52's shape. Asserted so the widening is recorded, not discovered later.
test('the $type rule widens #52 — recorded, not masked', () => {
  const out = preprocess({
    leading: { base: { $value: '16px', $type: 'dimension', normal: { $value: '1.5' } } },
  });
  assert.equal(out.leading.baseNormal.$type, 'dimension', '#52 shape, knowingly produced');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: the inheritance tests FAIL. "nothing is invented" and the leak test may already pass — that is fine.

- [ ] **Step 3: Tag whole-value references in `resolveInPlace`**

In `scripts/lib/sd-native.mjs`, inside the `preprocess` `@doc-section`, add above `const WHOLE_REF` (line 71):

```js
// Marks a node whose AUTHORED $value was a whole-value reference, so the hoist
// can decline to override the type DTCG 5.2.2 rule 1 already determined from the
// referent. A Symbol key is invisible to Object.entries, to JSON.stringify, and
// to Style Dictionary, so it cannot leak into output.
const WAS_REF = Symbol('dtcg/was-reference');
```

Then in `resolveInPlace`, replace the `WHOLE_REF` branch:

```js
      if (WHOLE_REF.test(val.$value)) {
        val[WAS_REF] = true;
        try {
          val.$value = resolveValue(path.join('.'), flat);
        } catch {
          /* leave an unresolvable reference in place for SD to report */
        }
      } else {
```

The tag is set before the `try` deliberately: an unresolvable reference is still a reference and still must not inherit.

- [ ] **Step 4: Carry `$type` on hoist**

In `hoistDualNodes`, immediately before `node[hoisted] = childVal;`:

```js
        // The dual node is the child's closest $type-bearing ancestor as
        // authored; after the hoist it is a sibling, so the type is lost unless
        // it travels. Excluded for a reference-valued child — DTCG 5.2.2 gives
        // it the referent's type, which outranks inheritance.
        if (!('$type' in childVal) && '$type' in val && !childVal[WAS_REF]) {
          childVal.$type = val.$type;
        }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: PASS.

- [ ] **Step 6: Full suite**

Run: `node --test`
Expected: 325 pass, 0 fail (318 + 7 new).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/lib/sd-native.test.mjs
git commit -m "fix: carry \$type onto a hoisted dual-node child, except reference-valued ones (#55)"
```

---

### Task 3: Correct the DTCG claim, regenerate, and prove nothing moved

**Files:**
- Modify: `scripts/lib/sd-native.mjs:61`
- Modify: `scripts/build-native-adapter-config.mjs:102`
- Regenerate: `references/native-adapter-config.md`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces: no code.

- [ ] **Step 1: Correct the module comment**

`scripts/lib/sd-native.mjs:61` currently reads:

```
// children — legal DTCG, and common in Figma-derived sources, where text.sm
```

It is false. Replace that line and its neighbour so the sentence reads: the dual-node pattern is **invalid DTCG** — Design Tokens Format Module, 30 July 2026, §6.1, requires tools to report an object carrying both `$value` and children as an error, and §6.2's `$root` is the sanctioned way to express it — but Figma-derived sources emit it regardless, so this module handles it rather than rejecting it. Keep the existing `text.sm` example. Stay inside the `preprocess` `@doc-section` pair.

- [ ] **Step 2: Correct the generator's narrative prose**

`scripts/build-native-adapter-config.mjs:102` currently reads:

```
is legal DTCG and common in Figma-derived sources: \`text.sm\` holds
```

Make the same correction in the same terms. This string becomes `references/native-adapter-config.md:117`.

- [ ] **Step 3: Regenerate and gate**

```bash
node scripts/build-native-adapter-config.mjs
node scripts/build-native-adapter-config.mjs --check
grep -c "legal DTCG" references/native-adapter-config.md
```
Expected: `--check` exits 0; the grep returns **0**.

- [ ] **Step 4: Rebuild the e2e harness**

No token source is vendored in this repo. Rebuild in the scratchpad:

```bash
E=<scratchpad>/e2e && mkdir -p $E/scripts && cd $E
npm init -y >/dev/null && npm install style-dictionary@4.4.0 >/dev/null
ln -sfn /Users/jordansstudio/Dev/throughline/scripts/lib $E/scripts/lib
mkdir -p tokens && for f in color-primitives color-semantic.dark color-semantic.light \
  leading-primitives radius-primitives radius-semantic spacing-primitives \
  spacing-semantic.desktop spacing-semantic.mobile stroke-primitives stroke-semantic \
  text-primitives typography-primitives typography-semantic.desktop typography-semantic.mobile; do
  git -C ~/Dev/zygarden-frontend show \
    feature/apply-brandguide-styles:libs/shared/util-tokens/src/tokens/$f.json > tokens/$f.json
done
```

Symlinking `scripts/lib` to the repo means the build exercises shipping code, not a snapshot. Do **not** check out or modify the zygarden repo.

Write `build.mjs` importing `registerNativeTransforms`, `nativePlatform`, `nativeSources` from `./scripts/lib/sd-native.mjs`, building `ios-swift` and `android-kotlin` × light/dark, with the mobile viewport axis and `packageName: 'com.zygarden.tokens'` for Kotlin.

- [ ] **Step 5: Assert nothing moved**

```bash
cd $E && node build.mjs
for f in out/*/ios/Tokens.swift out/*/android/Tokens.kt; do
  printf "%-30s decls=%s broken=%s\n" "$f" \
    "$(grep -cE '(static let|val) [A-Za-z_]' $f)" \
    "$(grep -cE '= (Nunito Sans|linear-gradient)' $f)"
done
```

Expected, all four: `decls=195 broken=0` — **identical to before this branch**.

This is the whole assertion. Zygarden's `text.*` children each carry `$type: dimension` explicitly and no name collides, so neither defect is reachable there. **The e2e run does not validate either fix** — synthetic fixtures do. If any number differs, stop and report: it means the change altered output it should not have touched.

- [ ] **Step 6: Full gate run**

```bash
cd /Users/jordansstudio/Dev/throughline
node --test && node ci/validate-plugin.mjs && node ci/validate-skills.mjs \
  && node scripts/adapters/generate.mjs --check \
  && node scripts/build-doc-card-builder.mjs --check \
  && node scripts/build-native-adapter-config.mjs --check && echo ALL GREEN
```

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/build-native-adapter-config.mjs references/native-adapter-config.md
git commit -m "docs: the dual-node pattern is invalid DTCG, not legal (#55)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Defect 2 — collision throws | 1 |
| Collision: authored token / group / hoist-vs-hoist | 1, steps 1 & 3 |
| Collision: identical values still throw | 1, step 1 |
| Collision: detect, do not assign | 1, step 3 |
| Collision: top frame throws | 1, step 4 |
| Error shape mirrors `nativeSources` | 1, step 4 |
| Idempotency test (missing, must be written) | 1, step 1 |
| Defect 1 — carry `$type` | 2 |
| Exclusion — reference-valued child | 2, steps 3 & 4 |
| Symbol tag does not leak | 2, step 1 |
| Two-level inheritance | 2, step 1 |
| #52 widening recorded by test | 2, step 1 |
| Two "legal DTCG" corrections | 3, steps 1 & 2 |
| `dtcg.mjs` NOT touched | Global Constraints |
| Doc regeneration, `@doc-section` | 3, step 3 |
| E2E proves no change (195/0) | 3, step 5 |
| Repo gates | 3, step 6 |

No gaps.

**Placeholder scan:** none. `<scratchpad>` in Task 3 step 4 is a path the executor substitutes, named as such.

**Type consistency:** `hoistDualNodes(node, collisions, prefix)` is defined in Task 1 step 3 and extended in Task 2 step 4 with the same signature. `WAS_REF` is defined in Task 2 step 3 and used in step 4. `preprocess(dict)`'s external signature is unchanged throughout. Collision object keys (`from`, `onto`, `existing`) match between step 3 and step 4 of Task 1.
