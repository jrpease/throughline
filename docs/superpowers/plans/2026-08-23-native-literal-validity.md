# Native Literal Validity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the native token adapters emitting 15 symbols per file that are not valid Swift or Kotlin, and add a general gate that catches the next such case without anyone anticipating it.

**Architecture:** One new zero-dependency module, `scripts/lib/native-literal.mjs`, holds a recursive-descent grammar for "is this a well-formed Swift/Kotlin literal." Three consumers use it: two quoting transforms in `sd-native.mjs` that fix the `fontFamily` case, a new `emitsNativeLiteral` filter predicate in the same file that drops values no transform could render natively (the gradient), and a new `invalid-literal` rule in `validate-token-output.mjs` that backstops both.

**Tech Stack:** Node ≥20, ES modules, `node:test` + `node:assert/strict`. Zero runtime dependencies. Style Dictionary 4.4.0 is a *parameter* passed into `sd-native.mjs`, never an import.

**Spec:** `docs/superpowers/specs/2026-08-23-native-literal-validity-design.md`

## Global Constraints

- **Zero dependencies.** `scripts/lib/*.mjs` must import only `node:*` builtins and each other. `native-literal.mjs` imports nothing at all.
- **Node ≥20**, ESM (`"type": "module"`).
- **`scripts/lib/sd-native.mjs` is the source of `references/native-adapter-config.md`.** Every line of code you add to it must sit **inside** an existing `@doc-section <id>` / `@doc-section-end <id>` pair. Only blank lines and `//` comments may sit outside one; the generator throws otherwise. Regenerate with `node scripts/build-native-adapter-config.mjs` and CI gates it with `--check`.
- **Do not fix, mask, or work around #51, #52, #54, or #55.** Specifically: the grammar must **accept** `1.50.dp` (#52's symptom) and **accept** `16.00.sp` (#51's fix output).
- **Test style:** `import { test } from 'node:test'; import assert from 'node:assert/strict';` — flat `test(...)` calls, no suites. Match the surrounding file.
- **Existing tests must keep passing unchanged** except the two named explicitly in Task 3 (the transform-list `deepEqual` and the filter-identity assertion), which change because the thing they assert genuinely changed.
- Baseline before you start: `node --test` reports **278 pass, 0 fail**.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/lib/native-literal.mjs` | **create** | The grammar. `parseLiteral`, `isValidLiteral`, `GRAMMAR`. No other job. |
| `scripts/lib/native-literal.test.mjs` | **create** | Grammar unit tests. |
| `scripts/validate-token-output.mjs` | modify | Add the `invalid-literal` rule and its report line. |
| `scripts/validate-token-output.test.mjs` | modify | Rule + interaction + #52 non-regression tests. |
| `scripts/lib/sd-native.mjs` | modify | Two quoting transforms, `emitsNativeLiteral`, composed filter, `PLATFORMS` entries. |
| `scripts/lib/sd-native.test.mjs` | modify | Transform, escaping and predicate tests; update two existing assertions. |
| `scripts/build-native-adapter-config.mjs` | modify | Two prose strings that name the installed sibling modules. |
| `references/native-adapter-config.md` | **generated** | Regenerate; never hand-edit. |
| `references/sync-adapters.md` | modify | Retire the "does not compile" caveat at lines 63–71. |
| `scripts/install.test.mjs` | modify | One line asserting the new lib module ships. |

Task 1 is standalone. Tasks 2 and 3 both depend on Task 1 and are independent of each other. Task 4 depends on all three.

---

### Task 1: The literal grammar

**Files:**
- Create: `scripts/lib/native-literal.mjs`
- Test: `scripts/lib/native-literal.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseLiteral(value: string, grammar: object) -> { ok: true } | { ok: false, offset: number, rest: string }`
  - `isValidLiteral(value: string, grammar: object) -> boolean`
  - `GRAMMAR: { 'ios-swift': object, 'android-kotlin': object }`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/native-literal.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLiteral, isValidLiteral, GRAMMAR } from './native-literal.mjs';

const SWIFT = GRAMMAR['ios-swift'];
const KOTLIN = GRAMMAR['android-kotlin'];

// Every distinct right-hand-side shape the current build emits, enumerated from
// four real generated files. These are the regression floor: if the grammar
// stops accepting one of these, real output starts failing the gate.
test('accepts every shape the current build emits', () => {
  assert.ok(isValidLiteral('CGFloat(14.00)', SWIFT));
  assert.ok(isValidLiteral('UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)', SWIFT));
  assert.ok(isValidLiteral('400', SWIFT));
  assert.ok(isValidLiteral('Color(0xffffffff)', KOTLIN));
  assert.ok(isValidLiteral('16.00.dp', KOTLIN));
  assert.ok(isValidLiteral('400', KOTLIN));
});

test('rejects the two shapes that are not valid native literals', () => {
  assert.equal(isValidLiteral('Nunito Sans', SWIFT), false);
  assert.equal(isValidLiteral('Nunito Sans', KOTLIN), false);
  assert.equal(isValidLiteral('linear-gradient(90deg, #77AE17 0%, #AFEF21 100%)', SWIFT), false);
  assert.equal(isValidLiteral('linear-gradient(90deg, #77AE17 0%, #AFEF21 100%)', KOTLIN), false);
});

// calc and var ARE valid identifiers, so a callee-name check alone would pass
// them. Their arguments are not literals, which is what rejects them.
test('rejects CSS functions whose callee is a valid identifier', () => {
  assert.equal(isValidLiteral('calc(1rem + 2px)', SWIFT), false);
  assert.equal(isValidLiteral('var(--x)', SWIFT), false);
  assert.equal(isValidLiteral('color-mix(in srgb, #fff 10%, transparent)', SWIFT), false);
});

test('rejects a bare dimension and trailing input', () => {
  assert.equal(isValidLiteral('14px', SWIFT), false);
  assert.equal(isValidLiteral('400 garbage', SWIFT), false);
  assert.equal(isValidLiteral('', SWIFT), false);
});

test('accepts strings, booleans, nested and zero-argument calls', () => {
  assert.ok(isValidLiteral('"Nunito Sans"', SWIFT));
  assert.ok(isValidLiteral('"with \\"escaped\\" quotes"', SWIFT));
  assert.ok(isValidLiteral('true', SWIFT));
  assert.ok(isValidLiteral('false', SWIFT));
  assert.ok(isValidLiteral('Outer(Inner(1), b: "x")', SWIFT));
  assert.ok(isValidLiteral('Empty()', SWIFT));
});

test('rejects an unterminated string and a raw newline inside one', () => {
  assert.equal(isValidLiteral('"unterminated', SWIFT), false);
  assert.equal(isValidLiteral('"two\nlines"', SWIFT), false);
});

// The grammar discriminates by platform rather than accepting a union.
test('units and numeric suffixes are android-kotlin only', () => {
  assert.equal(isValidLiteral('16.00.dp', SWIFT), false);
  assert.equal(isValidLiteral('1.50f', SWIFT), false);
  assert.ok(isValidLiteral('1.50f', KOTLIN));
  assert.ok(isValidLiteral('10L', KOTLIN));
});

// \$ escapes Kotlin's template interpolation and is not a valid Swift escape.
test('escape sets differ by platform', () => {
  assert.ok(isValidLiteral('"a\\$b"', KOTLIN));
  assert.equal(isValidLiteral('"a\\$b"', SWIFT), false);
});

// #51 will make .sp appear and #52 may make a bare ratio appear. A grammar that
// rejected them would turn those fixes into false failures.
test('accepts output the open issues will produce', () => {
  assert.ok(isValidLiteral('16.00.sp', KOTLIN), '#51');
  assert.ok(isValidLiteral('1.50.dp', KOTLIN), '#52 symptom must still pass');
  assert.ok(isValidLiteral('1.50.em', KOTLIN), '#52 candidate fix');
});

test('parseLiteral reports where parsing stopped', () => {
  const r = parseLiteral('linear-gradient(90deg)', SWIFT);
  assert.equal(r.ok, false);
  assert.equal(r.offset, 6);
  assert.match(r.rest, /^-gradient/);

  const s = parseLiteral('Nunito Sans', SWIFT);
  assert.equal(s.ok, false);
  assert.match(s.rest, /^Sans/);

  assert.deepEqual(parseLiteral('CGFloat(1)', SWIFT), { ok: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/native-literal.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/native-literal.mjs'`

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/native-literal.mjs`:

```js
// Is an emitted value a well-formed Swift or Kotlin literal?
//
// A CSS function and a native call expression look alike until you check the
// callee. `linear-gradient` is not a valid identifier — the hyphen disqualifies
// it — while `UIColor` is. `calc` IS a valid identifier, but `1rem + 2px` is
// not a literal. Parsing rather than pattern-matching rejects all of them
// without naming any of them, which is the point: the next unanticipated case
// is caught by the same rule.
//
// Three consumers — sd-native.mjs's quoting transforms and output filter, and
// validate-token-output.mjs's invalid-literal rule. Its own module for the same
// reason lib/dtcg.mjs is one: shared by both token gates.
//
// This asserts LITERAL well-formedness, not that the file compiles. A call to
// an undefined function still parses.

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const NUMBER = /^-?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?|\.\d+)/;

// `escapes` are the characters legal after a backslash inside a string.
// \$ escapes Kotlin's template interpolation; it is not a valid Swift escape,
// so a shared set would over-accept on iOS.
export const GRAMMAR = {
  'ios-swift': {
    suffixes: [],
    units: [],
    escapes: ['0', '\\', 't', 'n', 'r', '"', "'", 'u'],
  },
  'android-kotlin': {
    suffixes: ['f', 'F', 'L'],
    units: ['dp', 'sp', 'em'],
    escapes: ['\\', 't', 'n', 'r', '"', "'", '$', 'u'],
  },
};

export function parseLiteral(value, grammar = {}) {
  const s = String(value);
  const suffixes = grammar.suffixes ?? [];
  const units = grammar.units ?? [];
  const escapes = new Set(grammar.escapes ?? []);
  let i = 0;

  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i += 1;
  };

  // Longest match wins, so a short unit cannot shadow a longer one.
  const take = (words) => {
    let best = null;
    for (const w of words) {
      if (s.startsWith(w, i) && (best === null || w.length > best.length)) best = w;
    }
    if (best !== null) i += best.length;
    return best !== null;
  };

  const string = () => {
    i += 1; // opening quote
    while (i < s.length) {
      if (s[i] === '\\') {
        if (!escapes.has(s[i + 1])) return false;
        i += 2;
        continue;
      }
      if (s[i] === '"') {
        i += 1;
        return true;
      }
      if (s[i] === '\n') return false;
      i += 1;
    }
    return false; // unterminated
  };

  const number = () => {
    const m = s.slice(i).match(NUMBER);
    if (!m) return false;
    i += m[0].length;
    if (take(units.map((u) => `.${u}`))) return true;
    take(suffixes);
    return true;
  };

  const literal = () => {
    ws();
    if (i >= s.length) return false;
    if (s[i] === '"') return string();

    const rest = s.slice(i);
    const bool = rest.match(/^(?:true|false)(?![A-Za-z0-9_])/);
    if (bool) {
      i += bool[0].length;
      return true;
    }
    if (NUMBER.test(rest)) return number();

    const id = rest.match(IDENT);
    if (!id) return false;
    i += id[0].length;
    ws();
    if (s[i] !== '(') return false; // a bare identifier is not a literal
    i += 1;
    ws();
    if (s[i] === ')') {
      i += 1;
      return true;
    }
    for (;;) {
      ws();
      const save = i;
      const label = s.slice(i).match(IDENT);
      if (label) {
        i += label[0].length;
        ws();
        if (s[i] === ':') i += 1;
        else i = save; // not a label after all; re-read as a literal
      }
      if (!literal()) return false;
      ws();
      if (s[i] === ',') {
        i += 1;
        continue;
      }
      if (s[i] === ')') {
        i += 1;
        return true;
      }
      return false;
    }
  };

  if (!literal()) return { ok: false, offset: i, rest: s.slice(i) };
  ws();
  // Trailing input after a complete literal is a failure: `400 garbage`.
  if (i !== s.length) return { ok: false, offset: i, rest: s.slice(i) };
  return { ok: true };
}

export const isValidLiteral = (value, grammar) => parseLiteral(value, grammar).ok;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/native-literal.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 5: Confirm nothing else broke**

Run: `node --test`
Expected: 288 pass, 0 fail (278 baseline + 10 new).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/native-literal.mjs scripts/lib/native-literal.test.mjs
git commit -m "feat: a native literal grammar shared by the build and the gate (#53)"
```

---

### Task 2: The `invalid-literal` validator rule

**Files:**
- Modify: `scripts/validate-token-output.mjs`
- Test: `scripts/validate-token-output.test.mjs`

**Interfaces:**
- Consumes: `parseLiteral`, `GRAMMAR` from Task 1.
- Produces: a failure object `{ rule: 'invalid-literal', symbol, emitted, platform, offset, rest }` in `validate()`'s `failures` array, and a matching line from `formatReport`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/validate-token-output.test.mjs`:

```js
import { validate, formatReport } from './validate-token-output.mjs';

const srcOf = (dtcg) => [{ file: 'a.json', dtcg }];
const rules = (r) => r.failures.map((f) => f.rule);

test('invalid-literal catches an unquoted string value', () => {
  const r = validate({
    sources: srcOf({ typography: { fontFamily: { Web: { $value: 'Nunito Sans', $type: 'fontFamily' } } } }),
    output: 'public static let typographyFontFamilyWeb = Nunito Sans',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(rules(r), ['invalid-literal']);
  assert.equal(r.ok, false);
});

test('invalid-literal catches a raw CSS function', () => {
  const r = validate({
    sources: srcOf({ gradient: { brand: { $value: 'linear-gradient(90deg, #fff 0%)', $type: 'string' } } }),
    output: 'public static let gradientBrand = linear-gradient(90deg, #fff 0%)',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(rules(r), ['invalid-literal']);
});

// Reporting one symbol under three rules is noise. The specific rules win.
test('invalid-literal is suppressed when a more specific rule fired', () => {
  const bare = validate({
    sources: srcOf({ text: { sm: { $value: '14px', $type: 'dimension' } } }),
    output: 'public static let textSm = 14px',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(rules(bare), ['no-bare-units']);

  const foreign = validate({
    sources: srcOf({ c: { a: { $value: '#fff', $type: 'color' } } }),
    output: 'public static let ca = calc(1rem + 2px)',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(rules(foreign), ['no-foreign-syntax']);
});

// Placement: the rule runs before the name-match `continue`, so a symbol that
// resolves to no source token cannot escape a validity check by being unnamed.
test('invalid-literal fires on a symbol that matches no source token', () => {
  const r = validate({
    sources: srcOf({ unrelated: { $value: '1px', $type: 'dimension' } }),
    output: 'public static let mysterySymbol = Nunito Sans',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(rules(r), ['invalid-literal']);
});

test('valid native output produces no invalid-literal failure', () => {
  const r = validate({
    sources: srcOf({ text: { sm: { $value: '14px', $type: 'dimension' } } }),
    output: 'public static let textSm = CGFloat(14.00)',
    platform: 'ios-swift',
    minMatch: 0,
  });
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

// #52 is open and must stay reachable: this change must not mask it.
test('a unitless ratio emitted as .dp still passes — #52 is not masked', () => {
  const r = validate({
    sources: srcOf({ leading: { normal: { $value: '1.5', $type: 'dimension' } } }),
    output: 'val leadingNormal = 1.50.dp',
    platform: 'android-kotlin',
    minMatch: 0,
  });
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

test('formatReport renders an invalid-literal failure with the stop position', () => {
  const lines = formatReport({
    total: 1, matched: 1, matchRate: 1, minMatch: 0.5, collisions: [], ok: false,
    failures: [{
      rule: 'invalid-literal', symbol: 'fontFamilyBase', emitted: 'Nunito Sans',
      platform: 'ios-swift', offset: 7, rest: 'Sans',
    }],
  }).join('\n');
  assert.match(lines, /invalid-literal/);
  assert.match(lines, /fontFamilyBase/);
  assert.match(lines, /ios-swift/);
  assert.match(lines, /offset 7/);
  assert.match(lines, /quoted/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/validate-token-output.test.mjs`
Expected: FAIL — the `invalid-literal` assertions fail because `rules(r)` is `[]`.

- [ ] **Step 3: Import the grammar**

In `scripts/validate-token-output.mjs`, after the existing `lib/dtcg.mjs` import:

```js
import { parseLiteral, GRAMMAR } from './lib/native-literal.mjs';
```

- [ ] **Step 4: Add the rule**

In `validate()`, replace the first two lines of the `for (const { symbol, value } of decls)` loop body:

```js
    if (FOREIGN.test(value)) failures.push({ rule: 'no-foreign-syntax', symbol, emitted: value });
    if (BARE_UNIT.test(value)) failures.push({ rule: 'no-bare-units', symbol, emitted: value });
```

with:

```js
    // The two specific rules diagnose better than "not a valid literal", so
    // they win; invalid-literal is the general net underneath them. Reporting
    // one symbol under all three would be noise.
    const foreign = FOREIGN.test(value);
    const bare = BARE_UNIT.test(value);
    if (foreign) failures.push({ rule: 'no-foreign-syntax', symbol, emitted: value });
    if (bare) failures.push({ rule: 'no-bare-units', symbol, emitted: value });
    if (!foreign && !bare) {
      // Before the name-match `continue` below: a symbol that resolves to no
      // source token must not escape a validity check by being unnamed.
      const parsed = parseLiteral(value, GRAMMAR[platform]);
      if (!parsed.ok) {
        failures.push({
          rule: 'invalid-literal',
          symbol,
          emitted: value,
          platform,
          offset: parsed.offset,
          rest: parsed.rest,
        });
      }
    }
```

- [ ] **Step 5: Add the report line**

In `formatReport`, the failure loop is a nested ternary on `f.rule`. Add `invalid-literal` as the first branch so the chain stays readable:

```js
      lines.push(
        f.rule === 'invalid-literal'
          ? `  - [${f.rule}] ${f.symbol}: emitted \`${f.emitted}\` is not a valid ${f.platform} literal — parsing stopped at offset ${f.offset} (${JSON.stringify(f.rest.slice(0, 30))})`
          : f.rule === 'unit-fidelity'
            ? `  - [${f.rule}] ${f.symbol}: source ${f.source} expects ${f.expected}, emitted ${f.emitted} (${f.actual})`
            : f.rule === 'unverifiable-dimension'
              ? `  - [${f.rule}] ${f.symbol}: source ${f.source} has a dimension magnitude but emitted ${f.emitted} could not be read — the token was never actually compared`
              : `  - [${f.rule}] ${f.symbol}: ${f.emitted}`,
      );
```

Then, immediately after that `for` loop closes and still inside `if (r.failures.length)`, append the shared explanation once rather than repeating it per failure:

```js
    if (r.failures.some((f) => f.rule === 'invalid-literal')) {
      lines.push(
        `\nAn invalid-literal value will not compile. A string value must be quoted — add its $type to the quoting transform in lib/sd-native.mjs. A CSS construct such as linear-gradient() has no native form and should be filtered out of native builds instead.`,
      );
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test scripts/validate-token-output.test.mjs`
Expected: PASS. All pre-existing tests in this file still pass — the suppression only removes failures that would be duplicates, and the existing tests assert on specific rules rather than on exact array equality.

- [ ] **Step 7: Confirm the whole suite**

Run: `node --test`
Expected: 295 pass, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add scripts/validate-token-output.mjs scripts/validate-token-output.test.mjs
git commit -m "feat: invalid-literal rule — reject emitted values that are not valid native literals (#53)"
```

---

### Task 3: Quoting transforms and the composed filter

**Files:**
- Modify: `scripts/lib/sd-native.mjs`
- Modify: `scripts/lib/sd-native.test.mjs`
- Modify: `scripts/build-native-adapter-config.mjs` (two prose strings)
- Modify: `scripts/install.test.mjs` (one line)
- Regenerate: `references/native-adapter-config.md`

**Interfaces:**
- Consumes: `isValidLiteral`, `GRAMMAR` from Task 1.
- Produces: `emitsNativeLiteral(token, platform) -> boolean`; transforms named `value/swift-string-literal` and `value/kotlin-string-literal`; `nativePlatform().files[0].filter` becomes a composed arrow function rather than the `nativeFilter` reference.

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/sd-native.test.mjs`, and add `emitsNativeLiteral` to the existing import list at the top of that file:

```js
// Collect the transforms registerNativeTransforms registers, without needing
// a real Style Dictionary. Mirrors the fake used elsewhere in this file.
function collectTransforms() {
  const registered = new Map();
  registerNativeTransforms({
    registerPreprocessor() {},
    registerTransform(t) {
      registered.set(t.name, t);
    },
  });
  return registered;
}

test('the quoting transform quotes fontFamily and string types', () => {
  const t = collectTransforms().get('value/swift-string-literal');
  assert.ok(t.filter({ $type: 'fontFamily', $value: 'Nunito Sans' }));
  assert.ok(t.filter({ $type: 'string', $value: 'italic' }));
  assert.equal(t.transform({ $type: 'fontFamily', $value: 'Nunito Sans' }), '"Nunito Sans"');
});

test('the quoting transform leaves typed non-strings alone', () => {
  const t = collectTransforms().get('value/swift-string-literal');
  assert.equal(t.filter({ $type: 'dimension', $value: '14px' }), false);
  assert.equal(t.filter({ $type: 'color', $value: '#ffffff' }), false);
});

// DTCG permits a fontWeight keyword as well as a number. "400" already emits
// as a valid native integer and must stay untouched.
test('fontWeight is quoted only when it is a keyword', () => {
  const t = collectTransforms().get('value/swift-string-literal');
  assert.ok(t.filter({ $type: 'fontWeight', $value: 'bold' }));
  assert.equal(t.filter({ $type: 'fontWeight', $value: '400' }), false);
  assert.equal(t.filter({ $type: 'fontWeight', $value: 400 }), false);
});

test('a fontFamily list is joined into one native string', () => {
  const t = collectTransforms().get('value/swift-string-literal');
  const token = { $type: 'fontFamily', $value: ['Nunito Sans', 'sans-serif'] };
  assert.ok(t.filter(token));
  assert.equal(t.transform(token), '"Nunito Sans, sans-serif"');
});

// "$foo" is template interpolation in Kotlin, so a literal $ must be escaped
// there — and must NOT be in Swift, where \$ is not a valid escape.
test('Kotlin escapes the dollar sign and Swift does not', () => {
  const ts = collectTransforms();
  const token = { $type: 'string', $value: 'cost: $5' };
  assert.equal(ts.get('value/kotlin-string-literal').transform(token), '"cost: \\$5"');
  assert.equal(ts.get('value/swift-string-literal').transform(token), '"cost: $5"');
});

test('both quoting transforms escape backslashes, quotes and newlines', () => {
  const ts = collectTransforms();
  for (const name of ['value/swift-string-literal', 'value/kotlin-string-literal']) {
    const t = ts.get(name);
    assert.equal(t.transform({ $type: 'string', $value: 'a"b' }), '"a\\"b"', name);
    assert.equal(t.transform({ $type: 'string', $value: 'a\\b' }), '"a\\\\b"', name);
    assert.equal(t.transform({ $type: 'string', $value: 'a\nb' }), '"a\\nb"', name);
  }
});

// Distinct from nativeFilter: this reads the TRANSFORMED $value and asks
// whether any transform rendered it into something the language can parse.
test('emitsNativeLiteral keeps transformed output and drops what nothing rescued', () => {
  assert.ok(emitsNativeLiteral({ $value: 'CGFloat(14.00)' }, 'ios-swift'));
  assert.ok(emitsNativeLiteral({ $value: '"Nunito Sans"' }, 'ios-swift'));
  assert.ok(emitsNativeLiteral({ $value: 'Color(0xffffffff)' }, 'android-kotlin'));
  assert.ok(emitsNativeLiteral({ $value: '16.00.dp' }, 'android-kotlin'));
  assert.equal(emitsNativeLiteral({ $value: 'linear-gradient(90deg, #fff 0%)' }, 'ios-swift'), false);
  assert.equal(emitsNativeLiteral({ $value: 'Nunito Sans' }, 'ios-swift'), false);
});

// A color-mix value is rescued by value/color-mix-to-hex8 and then by the
// colour transform, so by filter time it is a valid literal and survives.
// This is why the filter asks about the transformed value and needs no
// per-transform exemption list.
test('emitsNativeLiteral does not drop a rescued color-mix token', () => {
  assert.ok(emitsNativeLiteral({ $value: 'UIColor(red: 0.1, green: 0.2, blue: 0.3, alpha: 0.5)' }, 'ios-swift'));
});

test('nativePlatform composes the authored-unit filter with the literal filter', () => {
  const p = nativePlatform({ platform: 'ios-swift', buildPath: 'out/' });
  const f = p.files[0].filter;
  // dropped by nativeFilter — a web-only authored unit
  assert.equal(f({ original: { $value: '1.5em' }, $value: '1.5em' }), false);
  // dropped by emitsNativeLiteral — nothing rescued it into a literal
  assert.equal(
    f({ original: { $value: 'linear-gradient(90deg, #fff 0%)' }, $value: 'linear-gradient(90deg, #fff 0%)' }),
    false,
  );
  // kept — transformed into a valid literal
  assert.equal(f({ original: { $value: '14px' }, $value: 'CGFloat(14.00)' }), true);
});
```

- [ ] **Step 2: Update the three existing assertions that genuinely changed**

These three fail because the thing they assert really did change. Nothing else in the file should need touching.

1. `test('nativePlatform emits the stock ios-swift list with the size transform replaced', ...)` (~line 160) — add `'value/swift-string-literal'` as the final element of the expected `deepEqual` array. Do the same with `'value/kotlin-string-literal'` in the android-kotlin equivalent test if it asserts the list.

2. `test('nativePlatform flattens references and wires the format and filter', ...)` (~line 170) — replace the identity assertion, because the filter is now a composition rather than the `nativeFilter` reference:

```js
  assert.equal(p.files[0].filter, nativeFilter);
```

with a behavioural one:

```js
  assert.equal(typeof p.files[0].filter, 'function');
  assert.equal(p.files[0].filter({ original: { $value: '1.5em' }, $value: '1.5em' }), false);
```

3. `test('registerNativeTransforms registers the preprocessor and four transforms', ...)` (line 248) — this asserts an exact sorted list of exactly four transform names, so it fails on the two new ones. Rename it to `...and six transforms` and extend the expected array, keeping it sorted:

```js
  assert.deepEqual(transforms.map((t) => t.name).sort(), [
    'size/unit-aware/compose-dp',
    'size/unit-aware/compose-sp',
    'size/unit-aware/swift',
    'value/color-mix-to-hex8',
    'value/kotlin-string-literal',
    'value/swift-string-literal',
  ]);
```

The trailing `for (const t of transforms) assert.equal(t.type, 'value');` in that test still holds — both new transforms are `type: 'value'`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: FAIL — `emitsNativeLiteral` is not exported; `collectTransforms().get('value/swift-string-literal')` is `undefined`.

- [ ] **Step 4: Add the import**

Inside the **`imports`** `@doc-section` in `scripts/lib/sd-native.mjs` (between `// @doc-section imports` and `// @doc-section-end imports`), after the `dtcg.mjs` import:

```js
import { isValidLiteral, GRAMMAR } from './native-literal.mjs';
```

- [ ] **Step 5: Add `emitsNativeLiteral`**

Inside the **`platform`** `@doc-section`, immediately after the existing `nativeFilter` function:

```js
// Did the transforms actually produce a valid native literal?
//
// A different question from nativeFilter's, which is about the AUTHORED value.
// This reads the TRANSFORMED $value and asks whether anything rendered it into
// something the target language can parse. A value nothing rescued — a CSS
// linear-gradient, say — has no native form and must not be emitted.
//
// Asking it this way needs no exemption list. A filter that asked "is this a
// CSS function" would need one entry per transform that rescues one
// (value/color-mix-to-hex8 first, whatever comes next after) — exactly the
// hand-picked list this module indicts above. A rescued value passes on its own
// merits, and a consumer's added transforms are respected rather than
// second-guessed.
export function emitsNativeLiteral(token, platform) {
  return isValidLiteral(String(token.$value).trim(), GRAMMAR[platform]);
}
```

- [ ] **Step 6: Compose the filter**

Still in the `platform` section, in `nativePlatform`'s returned `files` array, replace:

```js
        filter: nativeFilter,
```

with:

```js
        filter: (token) => nativeFilter(token) && emitsNativeLiteral(token, platform),
```

- [ ] **Step 7: Register the two quoting transforms**

Inside the **`register`** `@doc-section`, add above `export function registerNativeTransforms`:

```js
// Quote string-valued tokens no stock transform covers.
//
// Style Dictionary quotes by $type: content/swift/literal and
// asset/swift/literal handle $type content and asset. A $type: fontFamily token
// matches neither and emits bare — `public static let f = Nunito Sans`, which
// is not Swift. There is no stock transform for it.
const QUOTED_TYPES = new Set(['fontFamily', 'string']);

// A DTCG fontFamily may be a list; join it into one native string.
function stringValue(token) {
  const v = Array.isArray(token.$value) ? token.$value.join(', ') : token.$value;
  return typeof v === 'string' ? v : null;
}

// DTCG permits fontWeight as a keyword ("bold") as well as a number. The
// keyword form emits as a bare identifier and hits the identical failure;
// "400" already emits as a valid native integer and must stay untouched.
function isQuotable(token) {
  const v = stringValue(token);
  if (v === null) return false;
  if (QUOTED_TYPES.has(token.$type)) return true;
  return token.$type === 'fontWeight' && Number.isNaN(Number(v.trim()));
}

const escapeCommon = (s) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
```

Then inside `registerNativeTransforms`, after the existing transform registrations:

```js
  // Two transforms rather than one platform-sniffing transform, because the
  // escaping genuinely differs: "$foo" is template interpolation in Kotlin, so
  // a literal $ must be escaped there and must NOT be in Swift, where \$ is not
  // a valid escape at all.
  StyleDictionary.registerTransform({
    name: 'value/swift-string-literal',
    type: 'value',
    transitive: true,
    filter: isQuotable,
    transform: (token) => `"${escapeCommon(stringValue(token))}"`,
  });

  StyleDictionary.registerTransform({
    name: 'value/kotlin-string-literal',
    type: 'value',
    transitive: true,
    filter: isQuotable,
    transform: (token) => `"${escapeCommon(stringValue(token)).replace(/\$/g, '\\$')}"`,
  });
```

- [ ] **Step 8: Add the transforms to `PLATFORMS`**

In the `platform` section's `PLATFORMS` literal, append `'value/swift-string-literal'` to the `ios-swift` `transforms` array and `'value/kotlin-string-literal'` to the `android-kotlin` one.

- [ ] **Step 9: Run tests to verify they pass**

Run: `node --test scripts/lib/sd-native.test.mjs`
Expected: PASS.

- [ ] **Step 10: Update the two prose strings that name installed siblings**

In `scripts/build-native-adapter-config.mjs`:

- In the `imports` prose entry (~line 81), change `` the sibling \`lib/dtcg.mjs\` this plugin already installs `` to `` the siblings \`lib/dtcg.mjs\` and \`lib/native-literal.mjs\` this plugin already installs ``.
- In the header prose (~line 163), change `` Install it beside \`lib/dtcg.mjs\` and call it: `` to `` Install it beside \`lib/dtcg.mjs\` and \`lib/native-literal.mjs\` and call it: ``.

- [ ] **Step 11: Regenerate the reference doc**

Run: `node scripts/build-native-adapter-config.mjs`
Then: `node scripts/build-native-adapter-config.mjs --check`
Expected: `--check` exits 0. If the generator throws `N line(s) … fall outside every @doc-section pair`, a snippet from steps 4–8 landed outside a marker pair — move it inside.

- [ ] **Step 12: Assert the new module ships to consumers**

`skipScript` already installs everything under `scripts/` except tests and `PLUGIN_INTERNAL`, so no code change is needed — but pin it. In `scripts/install.test.mjs`, in the `skipScript keeps every script a consuming repo runs` list, add:

```js
    'lib/native-literal.mjs',
```

- [ ] **Step 13: Run the full suite and gates**

```bash
node --test
node ci/validate-plugin.mjs
node ci/validate-skills.mjs
node scripts/adapters/generate.mjs --check
node scripts/build-doc-card-builder.mjs --check
node scripts/build-native-adapter-config.mjs --check
```
Expected: all green, 0 failures.

- [ ] **Step 14: Commit**

```bash
git add scripts/lib/sd-native.mjs scripts/lib/sd-native.test.mjs \
        scripts/build-native-adapter-config.mjs references/native-adapter-config.md \
        scripts/install.test.mjs
git commit -m "feat: quote string-valued native tokens, drop what has no native form (#53)"
```

---

### Task 4: End-to-end proof and the tier caveat

This is the task that matters. Tasks 1–3 prove the code does what it says; only this one proves it does it to the artifact the issue is about.

**Files:**
- Modify: `references/sync-adapters.md:63-71`
- Create: `docs/superpowers/notes/2026-08-23-native-literal-validity-e2e.md`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: no code.

- [ ] **Step 1: Rebuild all four combinations against live repo code**

The harness is at `<scratchpad>/e2e`, its `scripts/lib` symlinked to the repo's, with style-dictionary 4.4.0 installed and a pre-fix snapshot in `out-prefix/`.

```bash
cd <scratchpad>/e2e && node build.mjs
```
Expected: four `built …` lines, exit 0.

- [ ] **Step 2: Assert the broken symbols are gone**

```bash
cd <scratchpad>/e2e
for f in out/*/ios/Tokens.swift out/*/android/Tokens.kt; do
  printf "%-32s broken=%s decls=%s\n" "$f" \
    "$(grep -cE '= (Nunito Sans|linear-gradient)' "$f")" \
    "$(grep -cE '(static let|val) [A-Za-z_]' "$f")"
done
```
Expected, all four files: `broken=0 decls=195`.

If `decls` is 181 rather than 195, the 14 `fontFamily` tokens were dropped instead of quoted — `$type` did not survive the hoist preprocessor. That is the prediction the spec flags as unconfirmed (#55 defect 1). Fix by carrying `$type` onto the quoted value, and record it in the note.

- [ ] **Step 3: Run the validator over pre-fix and post-fix output**

```bash
cd <scratchpad>/e2e
T=/Users/jordansstudio/Dev/throughline/scripts/validate-token-output.mjs
S="--source tokens/color-primitives.json --source tokens/leading-primitives.json \
   --source tokens/radius-primitives.json --source tokens/radius-semantic.json \
   --source tokens/spacing-primitives.json --source tokens/stroke-primitives.json \
   --source tokens/stroke-semantic.json --source tokens/text-primitives.json \
   --source tokens/typography-primitives.json --source tokens/spacing-semantic.mobile.json \
   --source tokens/typography-semantic.mobile.json --source tokens/color-semantic.light.json"

echo "### PRE-FIX (expect 15 invalid-literal, exit 1)"
node $T $S --output out-prefix/light/ios/Tokens.swift --platform ios-swift --min-match 1; echo "exit=$?"

echo "### POST-FIX (expect 0 failures, exit 0)"
node $T $S --output out/light/ios/Tokens.swift --platform ios-swift --min-match 1; echo "exit=$?"
```

Expected:
- Pre-fix: 15 `invalid-literal` failures, `exit=1` — **the rule catches the real defect**.
- Post-fix: no rule failures, `195/195` matched, `unemittedTokens` one higher than the pre-fix run, `exit=0`.

Repeat for `android-kotlin` against `Tokens.kt`, and for the dark sources (swap `color-semantic.light.json` for `color-semantic.dark.json`).

- [ ] **Step 4: Confirm no other measurement moved**

```bash
cd <scratchpad>/e2e && node measure.mjs
```
Expected: `value-verified=107` unchanged for every combination. `total` and `matched` fall 196 → 195; `name-only` falls 89 → 88 (the gradient), with `color=74 fontFamily=14` intact. If `value-verified` moved, a dimension or colour token was affected and something is wrong.

- [ ] **Step 5: Write the evidence note**

Create `docs/superpowers/notes/2026-08-23-native-literal-validity-e2e.md` recording, with the actual command output pasted rather than summarised: the four-file pre-fix `invalid-literal` counts, the four-file post-fix counts, the 196 → 195 declaration change, the `measure.mjs` before/after, and — explicitly — what this run does **not** establish (nothing was compiled; no `swiftc`/`kotlinc` ran; colour values are still matched by name only). Follow the structure of `docs/superpowers/notes/2026-08-21-native-config-e2e-results.md`.

- [ ] **Step 6: Retire the tier caveat**

Replace `references/sync-adapters.md` lines 63–71 — the paragraph beginning **"What the badge does not cover: the generated file does not compile as-is."** — with wording that states what is now true and does not overclaim. It must **not** imply a compiler ran:

```markdown
**What the badge does not cover: nothing is compiled.** Every emitted value is
checked to be a well-formed Swift or Kotlin *literal* — `tokens:validate-output`'s
`invalid-literal` rule parses each one and fails on anything that is not
(#53) — but no `swiftc` or `kotlinc` runs, so a type mismatch or a call to an
undefined symbol would still pass. String-valued tokens (`fontFamily`, `string`,
keyword `fontWeight`) are quoted by the module's own transforms, and a value with
no native form at all — a CSS `linear-gradient(...)` — is filtered out of native
output rather than emitted broken. That drop is reported as an unemitted token,
not hidden.
```

- [ ] **Step 7: Full gate run**

```bash
cd /Users/jordansstudio/Dev/throughline
node --test && node ci/validate-plugin.mjs && node ci/validate-skills.mjs \
  && node scripts/adapters/generate.mjs --check \
  && node scripts/build-doc-card-builder.mjs --check \
  && node scripts/build-native-adapter-config.mjs --check && echo ALL GREEN
```
Expected: `ALL GREEN`.

- [ ] **Step 8: Commit**

```bash
git add references/sync-adapters.md docs/superpowers/notes/2026-08-23-native-literal-validity-e2e.md
git commit -m "docs: e2e evidence for native literal validity, retire the compile caveat (#53)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Grammar, per-platform suffixes/units/escapes, whole-input anchoring | 1 |
| Verified against real output (7 shapes) | 1 step 1, 4 step 2 |
| `lib/native-literal.mjs` as a shared module | 1 |
| `invalid-literal` rule | 2 |
| Rule interaction / suppression | 2 steps 1, 4 |
| Placement before the name-match `continue` | 2 steps 1, 4 |
| Message with derived stop position | 2 steps 1, 5 |
| Two quoting transforms, `$` escaping split | 3 steps 1, 7 |
| `$type` set incl. `fontWeight` numeric predicate | 3 steps 1, 7 |
| fontFamily array join | 3 steps 1, 7 |
| `emitsNativeLiteral` + composed filter | 3 steps 1, 5, 6 |
| Doc regeneration, `@doc-section` constraint | 3 steps 10, 11 |
| `sync-adapters.md` caveat retirement | 4 step 6 |
| Testing steps 1–6 | 1–4 |
| Measured-vs-predicted split (the 195 figure) | 4 step 2, incl. the failure branch |
| Out of scope: #51/#52 non-regression | 1 step 1, 2 step 1 |

No gaps.

**Placeholder scan:** none — every code step carries real code, every command is runnable, and the one branch that depends on an unconfirmed prediction (Task 4 step 2) states its own remedy.

**Type consistency:** `parseLiteral`/`isValidLiteral`/`GRAMMAR` are defined in Task 1 and consumed under those exact names in Tasks 2 and 3. `emitsNativeLiteral(token, platform)` is defined in Task 3 step 5 and used in step 6 and in the tests in step 1. `stringValue`/`isQuotable`/`escapeCommon` are module-private to `sd-native.mjs` and referenced only within Task 3. The failure object keys (`rule`, `symbol`, `emitted`, `platform`, `offset`, `rest`) match between Task 2 step 4 and step 5.
