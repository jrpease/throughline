# Doc-card builder (GENERATED)

> **GENERATED FILE — do not edit by hand.** Sources: `scripts/lib/doc-card-plan.mjs`
> (the pure planner, unit-tested in Node) + `scripts/lib/doc-card-render.figma.js`
> (the Figma renderer). Regenerate with `node scripts/build-doc-card-builder.mjs`;
> CI gates freshness with `--check`.

The canonical `figma_execute` snippet that renders a component doc card from
its `.doc.json` record: a `_Doc/Header` kit instance, a `Band: Specimen` band
around the live component set, then one band per section (`Band: Usage` in
renderer 5). Every card is identical by construction — never hand-build a
band. The builder owns the bands and the header's title, summary and date; it
moves the specimen into its band but never rebuilds it. The header's `Status`
variant has its own owner, finalize, through `--status` below; the builder sets
it only when it first creates a header.

## How to call it

Render one card:

```sh
node scripts/doc-card-payload.mjs design-system/docs/components/<Name>.doc.json --out <scratch>/payload.js
```

It writes the complete `figma_execute` body (record, fingerprint, the fourteen
role lookups and four text-style lookups by recorded name, the snippet and the
call) and prints `expectedRecordHash` to stderr. Pass the file's contents as
the `code` unchanged. It opens with the two slots the snippet reads,
`const RECORD = <the parsed .doc.json>;` and
`const CANONICAL_FP = '<canonicalFingerprint(RECORD)>';`, then the snippet,
the lookups and the call. The card is found by its tag (shared plugin data
`throughline` / `docCard` = the component name). A card no v5 render has
touched yet (every v4 card) has no tag: add `--node-id <card frame id>` once,
and the render tags it.

Set a card's status (finalize):

```sh
node scripts/doc-card-payload.mjs design-system/docs/components/<Name>.doc.json --status stable --out <scratch>/payload.js
```

That payload only sets the header's `Status` variant (`draft` / `beta` /
`stable` / `deprecated`) on the tagged card.

What the render needs, and what to do when it isn't recorded yet:

1. **`figma.fileKey`** in `design-system.json`.
2. **`figma.docCardVariables`**, fourteen roles, each resolved **by the
   recorded name** — never re-derived or substituted. A name that doesn't
   resolve to exactly one variable throws: the token was renamed or removed.
   - `textDefault`, `textMuted` (text), `tonePositive`, `toneNegative`,
     `toneCaution` (Do / Don't / caution tones, also the Unreviewed
     chip), `border`, `spacePadding`, `spaceRowGap`, `spaceBlockGap`,
     `spaceItemGap` (band padding, gaps between blocks, columns and items),
     `surfaceBand`, `surfaceHeader`, `textOnHeader`, `radiusBand`.
   - A project with the v4 nine recorded fills in only the last five: pick
     each once and write it back. The header is where the card carries the
     brand, and it must stand apart from the card frame it sits on. Before
     suggesting `surfaceHeader` and `textOnHeader`, look at how the file's
     existing artboards set their headers off from the artboard fill (a brand
     surface with its paired text, e.g. `surface/brand-primary-default` with
     `text/on-brand-primary`, or a raised neutral with brand text) and suggest
     a pairing in that pattern whose surface differs from the card's fill.
     Check the pair reads and confirm both with the user; never default to an
     inverse or neutral surface without asking. The render refuses a header
     whose fill matches the card's. `textOnHeader` also colours the status chip.
   - A project with nothing recorded and a card **not yet migrated to v5** can
     recover the nine v4 roles from that card, by resolving each bound variable
     id back to its name (`figma.variables.getVariableByIdAsync(id)`):
     `spacePadding` ← the `Usage` frame's `paddingLeft`; `spaceRowGap` ← its
     `itemSpacing`; `spaceBlockGap` ← a `Usage Row *` frame's `itemSpacing`;
     `spaceItemGap` ← a `Block: *` frame's `itemSpacing`; `border` ← a
     `Row Divider` frame's `fills[0].boundVariables.color`; `tonePositive` /
     `toneNegative` ← the first TEXT child of `Block: Do` / `Block: Don't`,
     same property; `textMuted` ← the first TEXT child of any other block;
     `textDefault` ← the second child of `Block: Overview`. Migrated cards
     have none of these nodes. With no card to read, choose by judgement —
     that establishes the project's rhythm.
3. **`figma.docCardTextStyles`**: `title`, `bandTitle`, `body`, `caption`,
   resolved by recorded name the same way. Pick once and write back;
   `Body/Default` is the suggested `body`.
4. **`components.meta[<Name>].status`**: the header's first `Status`. A value
   outside the four options stops the render and names it.
5. **`figma.docKit`**: `null` until the first render draws the kit
   (`_Doc/Header`, `_Doc/Band header`) on a `Documentation Kit` page. When the
   summary says `kitDrawn: true`, write `figma.docKit = { fileKey }` back.
   After that the kit belongs to designers: the builder only sets its
   properties by name and never redraws it. To get a deleted kit back, set
   `figma.docKit` to `null`.

Then:

- Pass an explicit `timeout` (30000 suits one card; the first render also
  draws the kit, so start with a small card). Render cards one call at a time,
  never batched.
- Keep Figma open and visible beside the terminal for the whole write run. A
  hidden or covered window stalls async calls such as `loadFontAsync`; the
  render finishes once Figma is visible again.
- After a timeout, do not re-run blind. Ask the user to bring Figma forward,
  then read the card's state with a read-only `figma_execute`:
  `await figma.loadAllPagesAsync(); return figma.root.findAllWithCriteria({
  sharedPluginData: { namespace: 'throughline', keys: ['docCard'] } })
  .filter((n) => n.getSharedPluginData('throughline', 'docCard') === '<Name>')
  .map((n) => ({ id: n.id, children: n.children.map((c) => c.name) }));`
  If the header and bands are all there, the render finished: re-run once to
  get its summary. If not, re-run.
- If `summary.headerContrast.verdict` is `warn`, the header and card are under
  3:1 apart: tell the user and suggest restyling `_Doc/Header` in the kit.
- Check `summary.recordHash` equals the `expectedRecordHash` the script printed.
  A mismatch means the payload changed on the way in.
- Stamp the manifest from the summary, never from a re-read:
  `surfaces.docCard = { src: summary.fingerprint, recordHash:
  summary.recordHash, render: summary.render, renderer:
  summary.rendererVersion }`.

## The snippet

```js
// Pure layout planner for the component doc card (v5: the documentation pilot
// layout — a kit header, a Specimen band, then one band per section).
// ZERO imports, `export const`/`export function` only — this module is inlined
// verbatim into the generated Figma snippet (references/doc-card-builder.md) by
// build-doc-card-builder.mjs, so it must run in both Node and the Figma plugin
// sandbox. build-doc-card-builder.mjs enforces the no-imports rule.
//
// Layout contract: docs/specs/2026-10-15-doc-card-v5.md

// Single source of truth for the doc-card layout version. Imported by
// docs-check.mjs and embedded (via inlining) into the generated builder snippet.
const DOC_CARD_RENDERER_VERSION = '5';

// The card's floor: v4's three 480px columns, carried over (decision 16).
const CARD_MIN_WIDTH = 1440;

// Card width = the floor, or the specimen set plus its band's padding, whichever
// is bigger — plus the card's own padding outside it. specimenWidth is the set's
// own width and nothing else: never the card's or a band's, which this render
// sets, so a measurement of them would ratchet on every render.
function cardWidth({ specimenWidth, bandPad, cardPad }) {
  return Math.max(CARD_MIN_WIDTH, specimenWidth + 2 * bandPad) + 2 * cardPad;
}

const STATUS_OPTIONS = ['draft', 'beta', 'stable', 'deprecated'];

// The header's Status variant for a manifest status. Case is folded; anything
// outside the four options throws rather than guessing (e.g. a legacy `final`).
function statusVariant(value) {
  const v = typeof value === 'string' ? value.toLowerCase() : '';
  if (!STATUS_OPTIONS.includes(v)) {
    throw new Error('status "' + value + '" is not one of ' + STATUS_OPTIONS.join(' / ')
      + ' — fix components.meta[name].status in design-system.json, then re-run');
  }
  return v;
}

// The header against the card it sits on (decision 4). An exact match is
// refused; under 3:1 (WCAG's non-text bar) is a warning, since a light brand
// header on a white card is a real choice. Same math as lib/contrast.mjs,
// repeated because the planner must stay import-free.
const HEADER_MIN_CONTRAST = 3;

function headerContrast(headerHex, cardHex) {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(headerHex), lum(cardHex)];
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const verdict = headerHex.toLowerCase() === cardHex.toLowerCase() ? 'refuse'
    : ratio < HEADER_MIN_CONTRAST ? 'warn' : 'ok';
  return { ratio: Math.round(ratio * 100) / 100, verdict };
}

// A provenance value with no `user` or `imported` marker is unprotected: it was
// generated, not written or approved by a person (component-doc-schema.md's two
// tiers). A block with no provenance at all counts as unprotected.
function isUnprotected(provenanceValue) {
  if (typeof provenanceValue !== 'string' || provenanceValue === '') return true;
  const parts = provenanceValue.split('+');
  return !parts.includes('user') && !parts.includes('imported');
}

function hasContent(value) {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return false;
}

// A band is Unreviewed when every record block it shows is unprotected.
function bandUnreviewed(record, keys) {
  const provenance = record.provenance || {};
  return keys.filter((k) => hasContent(record[k])).every((k) => isUnprotected(provenance[k]));
}

function listBlock(eyebrow, items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return { type: 'list', name: `Block: ${eyebrow}`, eyebrow, items };
}

function definitionBlock(eyebrow, meanings) {
  const terms = Object.keys(meanings || {}).map((k) => ({ term: k, meaning: meanings[k] }));
  if (terms.length === 0) return null;
  return { type: 'definition', name: `Block: ${eyebrow}`, eyebrow, terms };
}

const USAGE_KEYS = ['description', 'whenToUse', 'whenNotToUse', 'dos', 'donts', 'variants', 'states', 'accessibility'];

// The record-derived layout, as data. Everything here comes from the record, so
// fnv1a(JSON.stringify(plan)) is the recordHash Node predicts (decision 18).
// Axes, options and states keep record order: record order is display order.
function planDocCard(record) {
  const str = (v) => (typeof v === 'string' ? v : '');

  const blocks = [];
  const whenTo = listBlock('When to use', record.whenToUse);
  if (whenTo) blocks.push(whenTo);
  const whenNot = listBlock('Use something else', record.whenNotToUse);
  if (whenNot) blocks.push(whenNot);
  const dos = Array.isArray(record.dos) ? record.dos : [];
  const donts = Array.isArray(record.donts) ? record.donts : [];
  if (dos.length || donts.length) {
    blocks.push({
      type: 'dosDonts', name: 'Block: Do and Don\'t',
      do: { eyebrow: '✓ Do', items: dos },
      dont: { eyebrow: '✕ Don\'t', items: donts },
    });
  }
  // Step 1 carry-over (decision 22): v4's meanings and accessibility stay on the
  // card as text until their own bands ship.
  for (const axis of Object.keys(record.variants || {})) {
    const block = definitionBlock(`What each ${axis} means`, record.variants[axis]);
    if (block) blocks.push(block);
  }
  const stateBlock = definitionBlock('What each state means', record.states);
  if (stateBlock) blocks.push(stateBlock);
  const a11y = record.accessibility || {};
  // role is not rendered on the card — it lives in the description field / MDX.
  const a11yBlock = listBlock('Accessibility', [...(a11y.keyboard || []), ...(a11y.notes || [])]);
  if (a11yBlock) blocks.push(a11yBlock);

  const lede = str(record.description);
  const bands = [];
  if (lede.trim() !== '' || blocks.length) {
    bands.push({
      name: 'Band: Usage', title: 'Usage', lede,
      unreviewed: bandUnreviewed(record, USAGE_KEYS), blocks,
    });
  }

  return {
    rendererVersion: DOC_CARD_RENDERER_VERSION,
    // Always strings: an undefined would drop the key from JSON.stringify and
    // move the hash.
    header: { title: str(record.name), summary: str(record.summary), updatedAt: str(record.updatedAt) },
    bands,
  };
}

// 32-bit FNV-1a — the record hash: fnv1a(JSON.stringify(plan)). Only ever
// compared against itself (the manifest's surfaces.docCard.recordHash), so it
// does not need to match the sha256-based canonical fingerprint, which cannot
// run in the Figma sandbox. Lives here, not in the renderer, so Node can compute
// the hash a render should return (doc-card-payload.mjs) with the same code.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Figma plugin-API renderer for the doc card (v5). This file is NOT a Node
// module — build-doc-card-builder.mjs concatenates it after the inlined planner
// (doc-card-plan.mjs) into references/doc-card-builder.md, and the result runs
// inside figma_execute (dynamic-page mode). Constraints honored here (see
// references/figma-scripting.md): async APIs only, style set BEFORE
// .characters, fonts loaded up front, layoutSizing setters over resize(),
// bound paints seeded light-gray (never pure black).
//
// In-scope globals when assembled: planDocCard, cardWidth, statusVariant,
// STATUS_OPTIONS, CARD_MIN_WIDTH, DOC_CARD_RENDERER_VERSION, fnv1a (inlined
// planner) and the caller-filled slot CANONICAL_FP.
//
// Contract: docs/specs/2026-10-15-doc-card-v5.md (Plan, Step 1.3).

const REQUIRED_VARS = [
  'textDefault', 'textMuted', 'tonePositive', 'toneNegative', 'border',
  'spacePadding', 'spaceRowGap', 'spaceBlockGap', 'spaceItemGap',
  'surfaceBand', 'surfaceHeader', 'textOnHeader', 'radiusBand', 'toneCaution',
];
const REQUIRED_TEXT_STYLES = ['title', 'bandTitle', 'body', 'caption'];

const NS = 'throughline';
const KIT_PAGE = 'Documentation Kit';

// Bound paint, seeded with a light-gray approximation — a failed/late bind must
// never render pure black (reads as accidental dark mode).
function boundPaint(variable) {
  return figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.87 } }, 'color', variable,
  );
}

function bindPadding(node, variable) {
  for (const side of ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']) node.setBoundVariable(side, variable);
}

function bindRadius(node, variable) {
  for (const corner of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) node.setBoundVariable(corner, variable);
}

// A kit property is matched by the part of its key before '#' (variant keys
// have none). Zero or several matches throws, naming it (decision 21).
function propKey(defs, name, owner) {
  const keys = Object.keys(defs).filter((k) => k.split('#')[0] === name);
  if (keys.length !== 1) {
    throw new Error('renderDocCard: kit component "' + owner + '" has ' + keys.length + ' properties named "' + name
      + '" — the renderer sets kit properties by name and never edits the kit; restore exactly one "' + name + '" property');
  }
  return keys[0];
}

async function loadNodeFonts(root) {
  const texts = root.type === 'TEXT' ? [root] : root.findAll((n) => n.type === 'TEXT');
  for (const t of texts) {
    if (t.characters.length === 0) await figma.loadFontAsync(t.fontName);
    else for (const f of t.getRangeAllFontNames(0, t.characters.length)) await figma.loadFontAsync(f);
  }
}

function hexOf(c) {
  return '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

// A node's first visible solid fill as hex, a bound variable resolved in
// `consumer`'s mode; null when it has none.
async function solidHex(node, consumer) {
  const p = Array.isArray(node.fills) ? node.fills.find((f) => f.type === 'SOLID' && f.visible !== false) : null;
  if (!p) return null;
  const id = p.boundVariables && p.boundVariables.color && p.boundVariables.color.id;
  const v = id ? await figma.variables.getVariableByIdAsync(id) : null;
  return hexOf(v ? v.resolveForConsumer(consumer).value : p.color);
}

async function findTagged(key) {
  return figma.root.findAllWithCriteria({ sharedPluginData: { namespace: NS, keys: [key] } });
}

async function headerInstanceOf(card, kitHeader) {
  for (const child of card.children) {
    if (child.type !== 'INSTANCE') continue;
    const main = await child.getMainComponentAsync();  // .mainComponent throws in dynamic-page mode
    const set = main && main.parent;
    if (set && set.type === 'COMPONENT_SET'
      && (kitHeader ? set.id === kitHeader.id : set.getSharedPluginData(NS, 'docKit') === 'header')) {
      return child;
    }
  }
  return null;
}

async function renderDocCard({ componentName, nodeId, record, vars, textStyles, fileKey, docKitFileKey, status }) {
  // Bind-or-throw: a missing variable or style is a gap in the token set —
  // never fall back to a hex/px.
  for (const key of REQUIRED_VARS) {
    if (!vars || !vars[key]) throw new Error('renderDocCard: missing required variable "' + key + '" — record it in figma.docCardVariables');
  }
  for (const key of REQUIRED_TEXT_STYLES) {
    if (!textStyles || !textStyles[key]) throw new Error('renderDocCard: missing required text style "' + key + '" — record it in figma.docCardTextStyles');
  }
  if (!fileKey) throw new Error('renderDocCard: fileKey is required (design-system.json figma.fileKey)');

  // ── 1. Card ────────────────────────────────────────────────────────────────
  await figma.loadAllPagesAsync();
  const tagged = (await findTagged('docCard')).filter((n) => n.getSharedPluginData(NS, 'docCard') === componentName);
  if (tagged.length > 1) {
    throw new Error('renderDocCard: ' + tagged.length + ' cards are tagged "' + componentName + '" ('
      + tagged.map((n) => n.id).join(', ') + ') — remove the tag from all but one');
  }
  let card = tagged[0] || null;
  const wasTagged = !!card;
  if (!card) {
    if (!nodeId) {
      throw new Error('renderDocCard: no doc card is tagged "' + componentName
        + '" — pass --node-id <card frame id> once; the render tags it for next time');
    }
    card = await figma.getNodeByIdAsync(nodeId);
    if (!card) throw new Error('renderDocCard: no node ' + nodeId + ' in this file');
  }
  if (card.type !== 'FRAME' || card.layoutMode !== 'VERTICAL') {
    throw new Error('renderDocCard: the doc card must be a VERTICAL auto-layout frame; got ' + card.type + ' layoutMode=' + card.layoutMode);
  }
  // One component per doc card (decision 19).
  const sets = card.findAll((n) => n.type === 'COMPONENT_SET');
  const foreign = card.findChild((n) => n.name !== 'Usage' && n.name.startsWith('Usage'));
  if (sets.length > 1 || foreign) {
    throw new Error('renderDocCard: card ' + card.id + ' holds '
      + (foreign ? 'band "' + foreign.name + '"' : sets.length + ' component sets')
      + ' — one component per doc card; split this card so each component owns its own card before re-rendering');
  }
  if (sets.length === 0) throw new Error('renderDocCard: no COMPONENT_SET found inside card ' + card.id);
  const specimen = sets[0];
  if (specimen.name !== componentName) {
    throw new Error('renderDocCard: card ' + card.id + ' holds set "' + specimen.name + '", not "' + componentName + '"');
  }

  // ── 2. Shape ───────────────────────────────────────────────────────────────
  const taggedKit = await findTagged('docKit');
  let kitHeader = taggedKit.find((n) => n.type === 'COMPONENT_SET' && n.getSharedPluginData(NS, 'docKit') === 'header') || null;
  let kitBandHeader = taggedKit.find((n) => n.type === 'COMPONENT' && n.getSharedPluginData(NS, 'docKit') === 'bandHeader') || null;

  const headerInstance = await headerInstanceOf(card, kitHeader);
  let specimenHolder = null;
  let specimenBand = null;
  let legacyUsage = null;
  let legacyHeader = null;
  const legacyDividers = [];
  const ownedBands = [];
  const fingerprints = [];
  for (const child of card.children) {
    if (child === headerInstance) continue;
    if (child.id === specimen.id || (child.findOne && child.findOne((d) => d.id === specimen.id))) {
      specimenHolder = child;
      if (child.type === 'FRAME' && child.name === 'Band: Specimen') specimenBand = child;
    } else if (child.type === 'FRAME' && child.name.startsWith('Band: ')) ownedBands.push(child);
    else if (child.type === 'FRAME' && child.name === 'Usage') legacyUsage = child;
    else if (child.type === 'TEXT' && child.name === 'Doc Fingerprint') fingerprints.push(child);
    else if (child.name === 'Header Divider') legacyDividers.push(child);
    else if (child.type === 'FRAME' && !headerInstance && !legacyHeader) legacyHeader = child;
    else {
      throw new Error('renderDocCard: card ' + card.id + ' has an unexpected child "' + child.name + '" (' + child.type + ', '
        + child.id + ') — move it off the card or delete it, then re-run');
    }
  }

  // ── 3. Kit, found ──────────────────────────────────────────────────────────
  if (docKitFileKey) {
    const rootKey = figma.root.getSharedPluginData(NS, 'docKitFile');
    if (rootKey !== docKitFileKey) {
      throw new Error('renderDocCard: figma.docKit was drawn in file ' + docKitFileKey + ' but this file is tagged "'
        + (rootKey || '(untagged)') + '" — open the right file, or set figma.docKit to null to draw a kit here');
    }
    if (!kitHeader || !kitBandHeader) {
      throw new Error('renderDocCard: figma.docKit is recorded but the kit\'s '
        + [!kitHeader && '_Doc/Header', !kitBandHeader && '_Doc/Band header'].filter(Boolean).join(' and ')
        + ' is not in this file — set figma.docKit to null to have the next render draw a fresh kit');
    }
  } else if (kitHeader || kitBandHeader) {
    throw new Error('renderDocCard: a doc kit already exists in this file ('
      + [kitHeader, kitBandHeader].filter(Boolean).map((n) => n.id).join(', ')
      + ') but figma.docKit is null — record figma.docKit = { fileKey } to use it, or delete it to draw a fresh one');
  }
  if (kitHeader) {
    const defs = kitHeader.componentPropertyDefinitions;
    for (const name of ['Status', 'Title', 'Summary', 'Updated']) propKey(defs, name, '_Doc/Header');
    for (const name of ['Title', 'Lede', 'Unreviewed']) propKey(kitBandHeader.componentPropertyDefinitions, name, '_Doc/Band header');
  }
  // The header must stand apart from the card it sits on (decision 4), checked
  // in the card's own mode before anything is written.
  const cardFill = await solidHex(card, card);
  let contrast = null;
  if (cardFill) {
    const headerFill = kitHeader
      ? await solidHex(kitHeader.defaultVariant, card)
      : hexOf(vars.surfaceHeader.resolveForConsumer(card).value);
    if (headerFill) contrast = Object.assign({ header: headerFill, card: cardFill }, headerContrast(headerFill, cardFill));
    if (contrast && contrast.verdict === 'refuse') {
      throw new Error('renderDocCard: the header fill ' + headerFill + ' matches the fill of card ' + card.id
        + ' — the header must stand apart from the card (decision 4); '
        + (kitHeader ? 'restyle _Doc/Header in the kit' : 'pick a docCardVariables.surfaceHeader that differs from the card'));
    }
  }

  // ── 4. Status ──────────────────────────────────────────────────────────────
  const newStatus = headerInstance ? null : statusVariant(status);

  // ── 5. Plan ────────────────────────────────────────────────────────────────
  const plan = planDocCard(record);

  // Fonts, up front — before any text node exists.
  for (const key of REQUIRED_TEXT_STYLES) await figma.loadFontAsync(textStyles[key].fontName);

  const text = async (styleKey, chars, colorVar, name) => {
    const t = figma.createText();
    await t.setTextStyleIdAsync(textStyles[styleKey].id);  // style BEFORE characters
    t.characters = chars;
    t.fills = [boundPaint(colorVar)];
    if (name) t.name = name;
    return t;
  };
  const fillWidth = (parent, node) => {
    parent.appendChild(node);
    if (node.type === 'TEXT') node.textAutoResize = 'HEIGHT';
    node.layoutSizingHorizontal = 'FILL';
  };
  const autoFrame = (name, direction) => {
    const f = figma.createFrame();
    f.name = name;
    f.layoutMode = direction;
    f.fills = [];
    f.clipsContent = false;
    return f;
  };
  // An outline chip: no fill; outline and label in the tone (decisions 27, 28).
  const chip = async (name, label, toneVar) => {
    const c = autoFrame(name, 'HORIZONTAL');
    c.strokes = [boundPaint(toneVar)];
    c.strokeWeight = 1;
    bindRadius(c, vars.radiusBand);
    bindPadding(c, vars.spaceItemGap);
    c.layoutSizingHorizontal = 'HUG';
    c.layoutSizingVertical = 'HUG';
    c.appendChild(await text('caption', label, toneVar, 'Chip Label'));
    return c;
  };

  // ── 6. Kit, drawn (first render only) ──────────────────────────────────────
  let kitDrawn = false;
  if (!docKitFileKey) {
    let page = figma.root.children.find((p) => p.name === KIT_PAGE);
    if (!page) { page = figma.createPage(); page.name = KIT_PAGE; }

    const variants = [];
    for (const option of STATUS_OPTIONS) {
      const c = figma.createComponent();
      page.appendChild(c);
      c.name = 'Status=' + option;
      c.layoutMode = 'VERTICAL';
      c.fills = [boundPaint(vars.surfaceHeader)];
      bindRadius(c, vars.radiusBand);
      bindPadding(c, vars.spacePadding);
      c.setBoundVariable('itemSpacing', vars.spaceItemGap);
      c.resize(CARD_MIN_WIDTH, c.height);
      c.layoutSizingHorizontal = 'FIXED';
      c.layoutSizingVertical = 'HUG';
      const row = autoFrame('Title Row', 'HORIZONTAL');
      row.counterAxisAlignItems = 'CENTER';
      row.setBoundVariable('itemSpacing', vars.spaceItemGap);
      fillWidth(c, row);
      row.layoutSizingVertical = 'HUG';
      row.appendChild(await text('title', 'Component', vars.textOnHeader, 'Title'));
      row.appendChild(await chip('Status', option, vars.textOnHeader));  // tones vanish on a brand header (decision 27)
      fillWidth(c, await text('body', 'Summary', vars.textOnHeader, 'Summary'));
      c.appendChild(await text('caption', 'YYYY-MM-DD', vars.textOnHeader, 'Updated'));
      variants.push(c);
    }
    kitHeader = figma.combineAsVariants(variants, page);
    kitHeader.name = '_Doc/Header';
    kitHeader.layoutMode = 'VERTICAL';
    kitHeader.setBoundVariable('itemSpacing', vars.spaceRowGap);
    kitHeader.layoutSizingHorizontal = 'HUG';
    kitHeader.layoutSizingVertical = 'HUG';
    for (const [name, sample] of [['Title', 'Component'], ['Summary', 'Summary'], ['Updated', 'YYYY-MM-DD']]) {
      const key = kitHeader.addComponentProperty(name, 'TEXT', sample);
      for (const v of kitHeader.children) {
        const node = v.findOne((n) => n.type === 'TEXT' && n.name === name);
        node.componentPropertyReferences = { characters: key };
      }
    }

    const bh = figma.createComponent();
    page.appendChild(bh);
    bh.name = '_Doc/Band header';
    bh.layoutMode = 'VERTICAL';
    bh.fills = [];
    bh.setBoundVariable('itemSpacing', vars.spaceItemGap);
    bh.resize(CARD_MIN_WIDTH, bh.height);
    bh.layoutSizingHorizontal = 'FIXED';
    bh.layoutSizingVertical = 'HUG';
    const bhRow = autoFrame('Title Row', 'HORIZONTAL');
    bhRow.counterAxisAlignItems = 'CENTER';
    bhRow.setBoundVariable('itemSpacing', vars.spaceItemGap);
    fillWidth(bh, bhRow);
    bhRow.layoutSizingVertical = 'HUG';
    const bhTitle = await text('bandTitle', 'Band', vars.textDefault, 'Title');
    bhRow.appendChild(bhTitle);
    const unreviewedChip = await chip('Unreviewed', 'Unreviewed', vars.toneCaution);
    bhRow.appendChild(unreviewedChip);
    const bhLede = await text('body', 'Lede', vars.textMuted, 'Lede');
    fillWidth(bh, bhLede);
    bhTitle.componentPropertyReferences = { characters: bh.addComponentProperty('Title', 'TEXT', 'Band') };
    bhLede.componentPropertyReferences = { characters: bh.addComponentProperty('Lede', 'TEXT', 'Lede') };
    unreviewedChip.componentPropertyReferences = { visible: bh.addComponentProperty('Unreviewed', 'BOOLEAN', false) };
    bh.y = kitHeader.y + kitHeader.height + 64;
    kitBandHeader = bh;

    kitHeader.setSharedPluginData(NS, 'docKit', 'header');
    kitBandHeader.setSharedPluginData(NS, 'docKit', 'bandHeader');
    figma.root.setSharedPluginData(NS, 'docKitFile', fileKey);
    kitDrawn = true;
  }

  const headerDefs = kitHeader.componentPropertyDefinitions;
  const bandDefs = kitBandHeader.componentPropertyDefinitions;
  const H = {
    status: propKey(headerDefs, 'Status', '_Doc/Header'),
    title: propKey(headerDefs, 'Title', '_Doc/Header'),
    summary: propKey(headerDefs, 'Summary', '_Doc/Header'),
    updated: propKey(headerDefs, 'Updated', '_Doc/Header'),
  };
  const B = {
    title: propKey(bandDefs, 'Title', '_Doc/Band header'),
    lede: propKey(bandDefs, 'Lede', '_Doc/Band header'),
    unreviewed: propKey(bandDefs, 'Unreviewed', '_Doc/Band header'),
  };

  // ── 7. Mutate ──────────────────────────────────────────────────────────────
  if (!wasTagged) card.setSharedPluginData(NS, 'docCard', componentName);
  for (const fp of fingerprints) fp.remove();

  let header = headerInstance;
  const migrated = !headerInstance;
  if (!header) {
    header = kitHeader.defaultVariant.createInstance();
    card.insertChild(0, header);
    header.layoutSizingHorizontal = 'FILL';
    await loadNodeFonts(header);
    header.setProperties({ [H.status]: newStatus });
    if (legacyHeader) legacyHeader.remove();
    for (const d of legacyDividers) d.remove();
  }

  const padPx = vars.spacePadding.resolveForConsumer(card).value;

  // A band: the one shape every band shares (decision 14).
  const makeBand = async (name, title, lede, unreviewed) => {
    const band = autoFrame(name, 'VERTICAL');
    band.fills = [boundPaint(vars.surfaceBand)];
    bindRadius(band, vars.radiusBand);
    bindPadding(band, vars.spacePadding);
    band.setBoundVariable('itemSpacing', vars.spaceRowGap);
    card.appendChild(band);
    band.layoutSizingHorizontal = 'FILL';
    band.layoutSizingVertical = 'HUG';
    const bandHeader = kitBandHeader.createInstance();
    band.appendChild(bandHeader);
    bandHeader.layoutSizingHorizontal = 'FILL';
    await loadNodeFonts(bandHeader);
    bandHeader.setProperties({ [B.title]: title, [B.lede]: lede, [B.unreviewed]: unreviewed });
    if (!lede) {
      // An instance override, not a kit edit: hide the empty lede line.
      const ledeNode = bandHeader.findOne((n) => n.type === 'TEXT'
        && n.componentPropertyReferences && n.componentPropertyReferences.characters === B.lede);
      if (ledeNode) ledeNode.visible = false;
    }
    return band;
  };

  if (!specimenBand) {
    specimenBand = await makeBand('Band: Specimen', 'Specimen', '', false);
    card.insertChild(card.children.indexOf(header) + 1, specimenBand);
    specimenBand.appendChild(specimenHolder);  // moves it: the set keeps its id, instances stay attached
  }

  if (legacyUsage) legacyUsage.remove();
  for (const band of ownedBands) band.remove();

  // Width (decision 16): from the set's own width and the paddings only.
  const cardPad = (card.paddingLeft + card.paddingRight) / 2;
  const width = cardWidth({ specimenWidth: specimen.width, bandPad: padPx, cardPad });
  card.resize(width, card.height);
  card.counterAxisSizingMode = 'FIXED';  // VERTICAL frame: counter = width
  card.primaryAxisSizingMode = 'AUTO';   // height hugs — re-asserted after resize()
  const termWidth = Math.round((width - 2 * cardPad - 2 * padPx) / 3);

  const eyebrow = (parent, chars, colorVar) => text('caption', chars, colorVar).then((t) => fillWidth(parent, t));
  const bullets = async (parent, items) => {
    for (const item of items) fillWidth(parent, await text('body', '• ' + item, vars.textDefault));
  };

  const bandsRendered = [];
  for (const planned of plan.bands) {
    const band = await makeBand(planned.name, planned.title, planned.lede, planned.unreviewed);
    for (const block of planned.blocks) {
      const bf = autoFrame(block.name, block.type === 'dosDonts' ? 'HORIZONTAL' : 'VERTICAL');
      fillWidth(band, bf);
      bf.layoutSizingVertical = 'HUG';
      if (block.type === 'dosDonts') {
        bf.setBoundVariable('itemSpacing', vars.spaceBlockGap);
        for (const [side, toneVar] of [[block.do, vars.tonePositive], [block.dont, vars.toneNegative]]) {
          const col = autoFrame('Column: ' + side.eyebrow, 'VERTICAL');
          col.setBoundVariable('itemSpacing', vars.spaceItemGap);
          bf.appendChild(col);
          col.layoutSizingHorizontal = 'FILL';
          col.layoutSizingVertical = 'HUG';
          const rule = figma.createFrame();
          rule.name = 'Rule';
          rule.fills = [boundPaint(toneVar)];
          col.appendChild(rule);
          rule.resize(rule.width, 2);  // rule thickness: the one audit-3 exception (decision 28)
          rule.layoutSizingHorizontal = 'FILL';
          await eyebrow(col, side.eyebrow, toneVar);
          await bullets(col, side.items);
        }
        continue;
      }
      bf.setBoundVariable('itemSpacing', vars.spaceItemGap);
      await eyebrow(bf, block.eyebrow, vars.textMuted);
      if (block.type === 'list') await bullets(bf, block.items);
      else if (block.type === 'definition') {
        for (const pair of block.terms) {
          const row = autoFrame('Definition: ' + pair.term, 'HORIZONTAL');
          row.setBoundVariable('itemSpacing', vars.spaceItemGap);
          fillWidth(bf, row);
          row.layoutSizingVertical = 'HUG';
          const term = await text('body', pair.term, vars.textDefault);
          row.appendChild(term);
          term.textAutoResize = 'HEIGHT';
          term.resize(termWidth, term.height);
          term.layoutSizingHorizontal = 'FIXED';
          fillWidth(row, await text('body', pair.meaning, vars.textMuted));
        }
      }
    }
    bandsRendered.push(planned.name);
  }

  // Header content from the record; Status is never written here except at
  // creation above (finalize owns it, decision 15).
  await loadNodeFonts(header);
  header.setProperties({ [H.title]: plan.header.title, [H.summary]: plan.header.summary, [H.updated]: plan.header.updatedAt });

  // Metadata node — hidden, on the card frame (never inside an instance).
  const fp = await text('caption', CANONICAL_FP, vars.textMuted, 'Doc Fingerprint');
  fp.visible = false;
  card.appendChild(fp);

  return {
    rendererVersion: DOC_CARD_RENDERER_VERSION,
    recordHash: fnv1a(JSON.stringify(plan)),
    render: fnv1a(JSON.stringify({ plan, cardWidth: width, specimenWidth: specimen.width })),
    fingerprint: CANONICAL_FP,
    cardWidth: width,
    bandsRendered,
    kitDrawn,
    tagged: !wasTagged,
    migrated,
    headerContrast: contrast,
  };
}

// Finalize's status write (decision 24): find the card by its tag and set the
// header's Status variant. Changes nothing else.
async function setDocCardStatus({ componentName, status }) {
  const value = statusVariant(status);
  await figma.loadAllPagesAsync();
  const tagged = (await findTagged('docCard')).filter((n) => n.getSharedPluginData(NS, 'docCard') === componentName);
  if (tagged.length !== 1) {
    throw new Error('setDocCardStatus: ' + tagged.length + ' cards are tagged "' + componentName
      + '" — render the card once (with --node-id if it is untagged) before setting its status');
  }
  const header = await headerInstanceOf(tagged[0], null);
  if (!header) throw new Error('setDocCardStatus: card ' + tagged[0].id + ' has no _Doc/Header instance — render it first');
  const main = await header.getMainComponentAsync();
  const key = propKey(main.parent.componentPropertyDefinitions, 'Status', '_Doc/Header');
  header.setProperties({ [key]: value });
  return { componentName, status: value, card: tagged[0].id };
}
```

Layout contract and rationale:
`docs/specs/2026-10-15-doc-card-v5.md`.
