export function rewritePluginRoot(text, baseDir) {
  return text.split('${CLAUDE_PLUGIN_ROOT}').join(baseDir);
}

// Small, reviewable substitution table. Only NAMED cross-skill references and a
// few Claude-specific phrasings are rewritten; bare prose ("this skill") reads
// fine on every target and is deliberately left alone.
export const PHRASING_RULES = [
  {
    // "the `component-builder` skill" -> per-target noun
    pattern: /the `([a-z][a-z-]*)` skill\b/g,
    cursor: 'the `$1` rule',
    codex: 'the `$1` prompt',
    generic: 'the `$1` skill',
  },
  {
    pattern: /\bthe plugin README\b/g,
    cursor: 'the ThroughLine README',
    codex: 'the ThroughLine README',
    generic: 'the ThroughLine README',
  },
  {
    pattern: /\bClaude Code\b/g,
    cursor: 'Cursor',
    codex: 'Codex',
    generic: 'your coding agent',
  },
];

export function applyPhrasing(text, target) {
  let out = text;
  for (const rule of PHRASING_RULES) {
    out = out.replace(rule.pattern, rule[target]);
  }
  return out;
}

export function translateBody(text, { baseDir, target }) {
  return applyPhrasing(rewritePluginRoot(text, baseDir), target);
}

export function firstSentence(text) {
  const m = /^(.*?\.)(\s|$)/.exec(text.trim());
  return (m ? m[1] : text).trim();
}
