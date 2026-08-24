// Generates references/native-adapter-config.md from scripts/lib/sd-native.mjs.
// The prose lives here, keyed by section id; the code is sliced out of the
// module's real source between @doc-section markers and interleaved beneath its
// prose. Mirrors build-doc-card-builder.mjs: run bare to write, --check to gate
// CI. Zero dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = join(REPO_ROOT, 'scripts', 'lib', 'sd-native.mjs');
export const OUT = join(REPO_ROOT, 'references', 'native-adapter-config.md');

const OPEN = /^\s*\/\/\s*@doc-section\s+(\S+)\s*$/;
const CLOSE = /^\s*\/\/\s*@doc-section-end\s+(\S+)\s*$/;

export function sliceSections(source) {
  const sections = new Map();
  let open = null;
  let buffer = [];
  for (const line of source.split('\n')) {
    const closeMatch = line.match(CLOSE);
    if (closeMatch) {
      if (!open) throw new Error(`@doc-section-end ${closeMatch[1]} with no open section`);
      if (closeMatch[1] !== open) {
        throw new Error(`@doc-section-end ${closeMatch[1]} does not close ${open}`);
      }
      sections.set(open, buffer.join('\n').trim());
      open = null;
      buffer = [];
      continue;
    }
    const openMatch = line.match(OPEN);
    if (openMatch) {
      if (open) throw new Error(`unclosed @doc-section ${open}`);
      if (sections.has(openMatch[1])) throw new Error(`duplicate @doc-section ${openMatch[1]}`);
      open = openMatch[1];
      continue;
    }
    if (open) buffer.push(line);
  }
  if (open) throw new Error(`unclosed @doc-section ${open}`);
  return sections;
}

// Every line of module source must live inside some @doc-section pair, so that
// adding a piece to the module without documenting it breaks CI rather than
// silently shipping a doc whose code does not run. Legitimately outside: blank
// lines, `//` comment lines (the file's leading banner), and the markers
// themselves. Anything else — any line with executable code on it — is a gap.
export function assertCovered(source) {
  const uncovered = [];
  let open = false;
  source.split('\n').forEach((line, i) => {
    if (CLOSE.test(line)) {
      open = false;
      return;
    }
    if (OPEN.test(line)) {
      open = true;
      return;
    }
    if (open) return;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('//')) return;
    uncovered.push(`  ${i + 1}: ${line}`);
  });
  if (uncovered.length === 0) return;
  throw new Error(
    `${uncovered.length} line(s) of ${SOURCE} fall outside every @doc-section pair.\n` +
      'Only blank lines and // comments may sit outside a section; code must be\n' +
      'inside one, or the generated doc shows code that cannot run.\n' +
      uncovered.join('\n'),
  );
}

// Section id -> the prose that introduces it. Order here is the doc's order.
const PROSE = [
  ['imports', `## Imports

\`node:fs\` plus the siblings \`lib/dtcg.mjs\` and \`lib/native-literal.mjs\` this
plugin already installs — nothing else. Style Dictionary is passed in as a
parameter, never imported, which is what keeps this module installable into a
consumer's repo.`],
  ['unit-aware', `## 1. Read the authored unit

**This replaces \`size/swift/remToCGFloat\` and the \`size/compose/*\` transforms,
and it is the single most important piece.** Those assume every dimension is
authored in \`rem\` and multiply by 16. Against a \`px\`-authored source that
silently produces output at sixteen times scale which compiles and ships.`],
  ['color-mix', `## 2. Compute \`color-mix()\` to a literal

A CSS expression has no native equivalent, and Style Dictionary does no colour
math. Native adapters resolve to literals; for a \`color-mix\` that means
actually computing the blend. Register this **before** the platform's colour
transform, so the colour transform receives a valid hex8 rather than a CSS
function.`],
  ['preprocess', `## 3. Resolve aliases and hoist dual-node children

Style Dictionary's resolver will not traverse into a node that carries both a
\`$value\` and children, and its collector stops there too. The dual-node pattern
is invalid DTCG — the Design Tokens Format Module's 30 July 2026 draft, §6.1,
requires tools to report it as an error, and §6.2's \`$root\` is the sanctioned
way to pair a value with children. Figma-derived sources emit it anyway:
\`text.sm\` holds \`$value: "14px"\` *and* a \`text.sm.lineHeight\` child. So every
alias to such a child fails to resolve, and the child is never emitted at all.

Both are fixed before Style Dictionary sees the tree.`],
  ['platform', `## 4. Assemble the platform from the stock list

Build the transform list from Style Dictionary's **stock group**, replacing only
the rem-assuming size transforms. A hand-picked list silently drops whatever it
forgets — three real defects arose exactly that way.

**Two Android-only unit limitations remain, and are not fixed here.** Style
Dictionary's Compose transforms select on \`$type\`, and DTCG's type set does not
line up with what they expect:

- **Font sizes emit as \`dp\`, not \`sp\`.** DTCG has no \`fontSize\` type — it types
  font sizes as \`dimension\` — while \`size/unit-aware/compose-sp\` filters on
  \`$type === "fontSize"\`. On spec-compliant input it never fires and every font
  size falls through to \`dp\`, which does not respect the user's font-scale
  accessibility setting. Measured on a real 322-token source: zero \`.sp\` in the
  Kotlin output.
- **A unitless ratio emits as \`dp\`.** \`leading.normal: "1.5"\`, typed
  \`dimension\`, emits \`1.50.dp\`. The magnitude is faithful; the unit is
  semantically wrong.

Both are Android-only. \`size/unit-aware/swift\` filters \`dimension || fontSize\`,
so iOS handles dimension-typed font sizes correctly, and \`CGFloat(1.50)\` carries
no unit to be wrong about. \`tokens:validate-output\` passes in both cases: it
checks magnitude, not unit.`],
  ['sources', `## 5. Guard the per-mode source list

Style Dictionary deduplicates by dot-path, so one build over both a light and a
dark definition of the same token keeps whichever file sorts last and drops the
other mode with no diagnostic. Pass every build's sources through
\`nativeSources\`, which returns them, so the check cannot be skipped by
forgetting it.`],
  ['register', `## 6. Register with Style Dictionary

One call. Style Dictionary is a parameter, never an import, which is what lets
this module install into a consumer's \`packages/tokens/scripts/lib/\`.`],
];

const HEADER = `# Native adapter configuration (GENERATED)

> **GENERATED FILE — do not edit by hand.** Source: \`scripts/lib/sd-native.mjs\`,
> which is unit-tested in Node and installed into the consumer's repo.
> Regenerate with \`node scripts/build-native-adapter-config.mjs\`; CI gates
> freshness with \`--check\`.

The Style Dictionary configuration a native adapter (\`ios-swift\`,
\`android-kotlin\`, or any generated native target) needs in order to emit
**correct** output from a real DTCG token source.

**Why this exists.** The stock \`ios-swift\` and \`compose\` transform groups
produce output that compiles and is wrong. Run against a real source, the stock
configuration emitted every \`px\`-authored dimension at ×16 its authored value,
leaked \`color-mix()\` expressions into Swift, and left dual-node aliases as bare
\`px\` literals — all at exit \`0\`. None of that is a Style Dictionary limitation.
All of it is configuration.

**You do not need to copy any of this.** It ships as
\`\${CLAUDE_PLUGIN_ROOT}/scripts/lib/sd-native.mjs\`. Install it beside
\`lib/dtcg.mjs\` and \`lib/native-literal.mjs\` and call it:

\`\`\`js
import StyleDictionary from 'style-dictionary';
import { registerNativeTransforms, nativePlatform, nativeSources }
  from './scripts/lib/sd-native.mjs';

registerNativeTransforms(StyleDictionary);

for (const mode of ['light', 'dark']) {
  const sd = new StyleDictionary({
    source: nativeSources(sourcesFor(mode)),
    preprocessors: ['dtcg/resolve-dual-node'],
    platforms: {
      ios: nativePlatform({ platform: 'ios-swift', buildPath: \`out/\${mode}/\` }),
    },
  });
  await sd.buildAllPlatforms();
}
\`\`\`

The sections below are the module's own source, inlined so the configuration
stays reviewable. Pair this with \`\${CLAUDE_PLUGIN_ROOT}/references/sync-adapters.md\`,
which covers the adapter contract itself.
`;

const FOOTER = `## Verify, always

Configuration this specific is exactly what regresses unnoticed, because every
failure mode above produces output that compiles. Run \`tokens:validate-output\`
against each generated file with the same source list that file's build used,
and treat it as a gate rather than a spot check:

\`\`\`
node scripts/validate-token-output.mjs \\
  --source tokens/color-primitives.json --source tokens/text-primitives.json \\
  --output out/light/Tokens.swift --platform ios-swift --min-match 1
\`\`\`

A clean run reports 100% of emitted symbols matched with zero rule failures.
Anything less means the configuration drifted — so **pass \`--min-match 1\`**.
The flag's default is \`0.5\`, which is a floor against wholly unparseable output
rather than the gate this doc describes; without it a 60% match rate exits \`0\`.
See \`\${CLAUDE_PLUGIN_ROOT}/scripts/README.md\`.

"Matched" means an emitted symbol's name resolved to a source token. Numeric
magnitudes are additionally compared; colour and string values are matched by
name only, and no rule checks that the output compiles.
`;

export function render(sections) {
  const declared = PROSE.map(([id]) => id);
  for (const id of declared) {
    if (!sections.has(id)) throw new Error(`@doc-section ${id} is declared in PROSE but missing from ${SOURCE}`);
  }
  for (const id of sections.keys()) {
    if (!declared.includes(id)) throw new Error(`@doc-section ${id} exists in ${SOURCE} but has no prose entry`);
  }
  const body = PROSE.map(([id, prose]) => `${prose}\n\n\`\`\`js\n${sections.get(id)}\n\`\`\`\n`).join('\n');
  return `${HEADER}\n${body}\n${FOOTER}`;
}

function main() {
  const check = process.argv.includes('--check');
  const source = readFileSync(SOURCE, 'utf8');
  assertCovered(source);
  const rendered = render(sliceSections(source));
  if (!check) {
    writeFileSync(OUT, rendered);
    console.log(`wrote ${OUT}`);
    return;
  }
  const current = readFileSync(OUT, 'utf8');
  if (current === rendered) {
    console.log('references/native-adapter-config.md is up to date');
    return;
  }
  console.error(
    'references/native-adapter-config.md is stale.\n' +
      'Run: node scripts/build-native-adapter-config.mjs',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
