// Walking a consumer's source tree, shared by every gate that scans one.
//
// grep-color-usage.mjs and guard-token-removal.mjs each carried their own copy
// of this — identical excludes, and a walk that differed only in which file
// extensions it yielded. The duplication was the shape #57 was filed for: two
// definitions of one rule, agreeing today, with nothing keeping them in step.
//
// The file filter is the caller's, not a built-in: a colour scan wants
// stylesheets and a symbol guard does not, and neither should have to fork the
// walker to say so.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_EXCLUDES = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)generated(\/|$)/,
  /\.generated\./,
  /\.test\./,
  /\.spec\./,
  /(^|\/)__tests__(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)\.next(\/|$)/,
];

// Every text file a design system's values can hide in.
export const SOURCE_EXT = /\.(scss|sass|css|tsx?|jsx?|mjs|cjs|vue|svelte|html|svg)$/;

export function* walk(root, { excludes = DEFAULT_EXCLUDES, fileFilter = SOURCE_EXT } = {}) {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (excludes.some((re) => re.test(full))) continue;
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full, { excludes, fileFilter });
    else if (fileFilter.test(full)) yield full;
  }
}

// A design system records a component's DISPLAY name — a real manifest holds
// "Select Menu" — while the code exports <SelectMenu>. Nothing in the schema
// says `name` is a code identifier, and nothing should be changed to make it
// one: a display name is right for a doc surface. So the comparison normalises,
// the same way validate-token-output.mjs already folds adapter naming
// conventions onto each other.
export const normalizeName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
