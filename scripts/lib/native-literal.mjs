// Is an emitted value a well-formed Swift or Kotlin literal?
//
// A CSS function and a native call expression look alike until you check the
// callee. `linear-gradient` is not a valid identifier — the hyphen disqualifies
// it — while `UIColor` is. `calc` IS a valid identifier, but `1rem + 2px` is
// not a literal. Parsing rather than pattern-matching rejects all of them
// without naming any of them, which is the point: the next unanticipated case
// is caught by the same rule.
//
// Two consumers — sd-native.mjs's output filter, and
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
