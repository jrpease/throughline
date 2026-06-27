// Minimal, zero-dependency parser for the simple single-line `key: value`
// frontmatter used by the plugin's SKILL.md and command files. Values may be
// wrapped in matching single or double quotes. Splits each line on the FIRST
// colon, so colons inside a value are preserved.
//
// This is intentionally NOT a full YAML parser: no nested maps, lists, or
// multi-line scalars. The current corpus has none; if a future file needs
// richer frontmatter, this throws (a missing/malformed fence) rather than
// silently mis-parsing.

export function parseFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') {
    throw new Error('missing opening --- frontmatter fence');
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new Error('missing closing --- frontmatter fence');
  }
  const data = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const colon = line.indexOf(':');
    if (colon === -1) {
      throw new Error(`malformed frontmatter line (no colon): ${line}`);
    }
    const key = line.slice(0, colon).trim();
    const value = stripQuotes(line.slice(colon + 1).trim());
    data[key] = value;
  }
  const body = lines.slice(end + 1).join('\n');
  return { data, body };
}

function stripQuotes(s) {
  if (
    s.length >= 2 &&
    ((s[0] === '"' && s[s.length - 1] === '"') ||
      (s[0] === "'" && s[s.length - 1] === "'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}
