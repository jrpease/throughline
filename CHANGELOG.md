# Changelog

All notable changes to ThroughLine are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org).

## [Unreleased]

### Fixed

- **The hoist-collision error names the path you actually wrote.** The hoist
  recurses depth-first, so an outer frame already held names an inner frame had
  synthesised, and a nested dual node's collision reported `x.y.zW` — a path
  appearing nowhere in the source. It now reports `x.y.z.w`. The `onto` path was
  always genuine; only the path being complained about was invented.
- **An array-valued sibling is no longer called "a group" in that error.** An
  array carries no `$value`, so the group predicate claimed it. It is neither a
  token nor a group, and an array in that position is not valid DTCG — the
  message now says so instead of sending you to look for a group.

- **`unitless-dimension` now sees the hoist's `$type` carry.** A unitless,
  untyped child of a dimension-typed dual node was a `dimension` to the build and
  a nothing to the gate, so it emitted a bare `1.5` — a `Double` where Compose
  wants a `Dp` — and passed every rule clean. That is the silent case this rule
  most exists to catch. The gate still reads the **raw source**, which is the
  property that made this hard to fix: it models the carry rather than running
  against a preprocessed tree, so it continues to check emitted output against
  what the author actually wrote.
- **A unitless base token behind a typed alias is reported again.** Skipping any
  whole-value reference stopped the advisory double-firing, which is right when
  the base carries its own `$type`. Where it does not, the base never fired
  (untyped) and the alias was skipped (a reference), so a genuine unitless
  dimension was reported **nowhere**. The skip is now conditional on the referent
  being dimension-typed in its own right, and the advisory names the referent —
  the token whose `$type` or unit you actually have to change — rather than the
  alias, whose value is a reference with no unit to add.
- **A line height typed only by the hoist's `$type` carry now emits `sp`.** A
  dual node is a token, not a group, so DTCG gives an untyped child of one no
  type at all; the hoist stamps the dual node's type onto it as a repair for the
  relationship the hoist itself destroys. That repair ran *after* classification,
  which has to come first because the hoist consumes the leaf name classification
  matches on — so `text.sm.lineHeight` emitted `20.00.dp`. It compiled, it
  rendered at a fixed size that ignores the user's font-scale setting, and no
  rule reported it. The carry is now computed ahead of the hoist from the raw
  source, so classification reads the type the pipeline is going to apply rather
  than the type the tree happens to hold at that moment. The ordering is
  unchanged; only the visibility is. Output against a real system is
  byte-identical — every dual-node child there carries its own `$type`.

### Breaking

- **The dual-node hoist no longer carries a `$type` onto a hoisted group.** The
  carry exists to repair what the hoist costs a *token* child: the dual node was
  that child's closest `$type`-bearing ancestor as authored, and the hoist makes
  it a sibling. A **group** child was never in that position — DTCG 5.2.2
  inherits from the closest parent *group*, and a dual node is a token (6.1) — so
  nothing was taken away and there is nothing to repair. Carrying there invented
  a type for every token beneath that group.

  **This can turn a green build red**, and that is the intended direction. Where
  the invented type was usable, `text.sm.heights.line` emitted `20.00.dp` and now
  emits a bare `20px`, which does not compile. That follows the same rule a
  unitless dimension already follows: a value whose type the source never stated
  is declined rather than guessed at, and `no-bare-units` plus
  `unverifiable-dimension` name the exact symbol. The repair is to type the token
  in source, which DTCG 8.2.1 requires of a dimension anyway. Output against a
  real system is byte-identical — the shape needs a dual node with a group child,
  and Figma-derived dual nodes have token children only.


- **`tokens:validate-output` fails on two source paths that reduce to one symbol
  name.** `color.bg.canvas` and `colorBg.canvas` both normalize to
  `colorbgcanvas`, and the second silently overwrote the first — so the loser was
  never checked, and every emitted symbol on that key was compared against
  whichever path happened to sort last. Both directions measured: with only the
  winner's symbol in the output the run was **green with a token unverified**;
  with both symbols present it reported a **`unit-fidelity` failure naming a
  token that was correct**, which is worse, because a confident wrong diagnosis
  sends you to the wrong file.

  This gates rather than advises because it is not only a matching problem.
  Style Dictionary does not dedupe the two paths: the build emits
  `val colorBgCanvas` **twice**, and `kotlinc` rejects the file with "conflicting
  declarations". The source is ambiguous for native output and the generated file
  is broken. Rename either side in source.

  A build with no such collision is unaffected, which is every build we can
  measure — the real system this is validated against (318 source tokens, 211
  under the mode pin the build uses) has none, an assumption the original spec
  accepted on fixture evidence and that is now checked on every run.

### Fixed

- **The "naming convention does not line up" diagnosis no longer fires when a
  collision is the real cause.** Excluded tokens can drop the match count to
  zero, and the old message confidently blamed the adapter. It now names the
  collisions instead.

## [0.18.0] — 2026-08-31

### Breaking

- **A `$type` declared on the group now reaches the text-role pipeline.** DTCG
  5.2.2 says a token's own `$type` wins, otherwise the nearest ancestor group's.
  Both stamping passes and the advisory that reports their gaps read the token's
  own literal `$type` instead, so a source that declares `$type` once per group —
  entirely legal DTCG — was invisible to all three at once. All three now resolve
  the type properly.

  **Whether this changes your build depends on how you wire the preprocessor,
  and most builds will not change.** Style Dictionary runs global preprocessors,
  then its own `typeDtcgDelegate` — which is 5.2.2, pushing each group's `$type`
  onto its descendants — then platform preprocessors. `nativePlatform` registers
  ours at platform level, downstream of that delegation, so **a build wired only
  through `nativePlatform` never had this defect and is byte-identical.** The
  build affected is the one that *also* declares `dtcg/resolve-dual-node` at top
  level, which is the wiring our own usage snippet shows: there the first pass
  runs before any delegation, and the group's `$type` is not yet visible.

  On that wiring, measured against a real system re-encoded so `$type` sits on
  the group — the same tokens said a second legal way, which a correct pipeline
  must emit identically: **it now does, byte for byte, and before this it did
  not.** Twelve Kotlin symbols move. Nine font sizes go from `dp` back to `sp`,
  so a use site like `Modifier.padding(Tokens.textBase)` stops compiling — the
  same breakage 0.17.0 described, now reaching sources 0.17.0 could not see.
  Three `em` letterSpacing symbols reappear that were being dropped from Compose
  output entirely, taking the file from 205 declarations to 208. Swift is
  unchanged, byte for byte. The per-token opt-out is unchanged: stamp
  `$extensions["com.radicool.throughline"].nativeUnit` to `"device"`.

  Not a total no-op even on the affected wiring, though it was reported as one:
  the member-name pass keeps working wherever the typographic members carry
  their own `$type`, so that build still emitted 39 `sp`. What was completely
  undone is the reference-graph inference — everything 0.17.0 added.

  A source that types every token node — which is what Figma-derived extracts
  emit — is byte-identical on either wiring.

## [0.17.0] — 2026-08-31

### Breaking

- **A scale primitive referenced only by typographic members now emits `sp`, not
  `dp`.** `text.base: "16px"` was a font size only to a human; its role is now
  taken from the reference graph. On Android the symbol's type changes from `Dp`
  to `TextUnit`, so a use site like `Modifier.padding(Tokens.textBase)` stops
  compiling — verified with `kotlinc`, which accepts that line against the old
  output and rejects it against the new one. That is the point: those symbols
  were always font sizes. **Nine Kotlin symbols changed on a real 322-token
  system**, and *which* nine depends on the mode set the build includes — the
  inference reads the reference graph of the files in that build, so a primitive
  referenced only from a desktop typography file is typographic in a desktop
  build and not in a mobile one, and the reverse holds too: on the same source,
  `text.lg` is referenced only from the mobile file and `text.6xl` only from the
  desktop one, a straight swap rather than one stray token, and the count of
  nine is identical on both pins even though the set is not. Swift is unchanged,
  byte for byte; the sp/dp distinction is Compose-only. To decline the
  inference for a specific token, stamp
  `$extensions["com.radicool.throughline"].nativeUnit` to `"device"` (or any
  value other than `"text"`) on it in source.

### Fixed

- **An `em` letter-spacing primitive reaches Compose instead of being dropped.**
  #64 made `em` emit as a real `.em` TextUnit but only where the role was
  stamped, which reached the `typography.textStyle.*` members and not the
  primitives they reference. The graph now reaches those too — three new Kotlin
  declarations, and Android unmatched source tokens fall from 6 to 3 on the same
  system.

### Added

- **`tokens:validate-output` names the primitives the graph could not reach.**
  A dimension nothing references has no structural signal, so no role is
  inferred — `unreferenced-text-sibling` names it and points at the
  `$extensions` stamp that settles it. `ambiguous-text-role` names a token
  referenced by both a typographic and a non-typographic member, which is
  declined rather than guessed. Both are advisories: reported, never gating.

## [0.16.0] — 2026-08-27

### Breaking

Regenerated token files change shape in ways that can stop a consumer build.
Read this before upgrading; the full technical detail for each is below.

- **A unitless `dimension` no longer emits a unit.** `leading.normal: "1.5"`
  emitted `1.50.dp` / `CGFloat(1.50)` and now emits bare `1.5`. In Kotlin the
  symbol's type changes from `Dp` to `Double`, so a use site like
  `Modifier.padding(Tokens.leadingNormal)` stops compiling. *These values were
  always ratios* — a line height is not a length — so use them where a ratio
  belongs, and if a token really is a measurement, add the unit in source.
- **A `dimension` whose unit was omitted by mistake now fails to compile.**
  `spacing.gutter: "16"` emitted `16.00.dp`, correct only because px and dp map
  1:1 by convention, and now emits bare `16`. Add the unit (`"16px"`), or type
  the token `number` if it is genuinely a ratio.
- **A unitless value authored in leading-dot form (`".5"`) emits `.5`, which
  Swift rejects.** `tokens:validate-output` now fails the build on it instead of
  vouching for it. Write `"0.5"`.
- **`hoistDualNodes` throws on a name collision** where it previously discarded
  one of the two tokens silently, so a build that succeeded may now stop. That
  is the point — it names a token the build was already losing. Rename either
  colliding path.
- **`no-foreign-syntax` now fails an unrescued `calc()`, `var()` or
  `color-mix()`** that the output filter used to remove before the gate could
  see it. Resolve the value in source, or open an issue for a rescue.
- **Android font sizes and line heights now emit `sp` rather than `dp`.** No
  build breaks, but text renders at a different size for anyone who has changed
  their system font-size setting — which is the accessibility behaviour that was
  missing. 39 declarations changed on a real 322-token system. Re-check any
  layout that assumed fixed text metrics.
- **The `nativeUnit` override no longer applies to a unitless value.** A source
  stamping `nativeUnit: "text"` on a unitless token got `1.50.sp` and now gets
  the bare value, narrowing the "a source that states the role itself wins"
  contract introduced in 0.15.0.

### Added
- **Style Dictionary's stock transform groups are now accounted for rather than
  transcribed.** `PLATFORMS` claimed to mirror the stock lists, but nothing
  checked it and the four rem-assuming transforms it declines existed only as
  an absence from an array — indistinguishable from an oversight. Each platform
  now records the stock group it mirrors, the exclusions are a declared list
  with reasons, and `auditStockGroups` reports at registration any transform in
  the live stock group that is neither run nor declined. It warns via
  `console.warn` and never throws, and never changes an exit code: a new stock
  transform is usually harmless, while the fatal direction — a transform we run
  being removed — already makes Style Dictionary throw on an unknown name. The
  check runs in your build because ThroughLine declares no dependency on Style
  Dictionary, so that is the only place the installed version is knowable.
  Verified silent against Style Dictionary 4.4.0 and 5.5.2, whose `ios-swift`
  and `compose` groups are byte-identical.

### Fixed
- **An `em` letter spacing now reaches Compose instead of being dropped.**
  All 13 `typography.textStyle.*.letterSpacing` tokens on a real source resolve
  to `em`, and `nativeFilter` removed them from both platforms — they were the
  bulk of the 19 source tokens `tokens:validate-output` reported as having no
  emitted symbol. Compose has a real `.em` `TextUnit`, so unlike `%` this is a
  filter gap rather than a value with no native form. The classifier's unit gate
  now admits `em` alongside `px` and `rem`, so the role is stamped;
  `size/unit-aware/compose-em` emits it; and `nativeFilter` keeps it only where
  the platform is Compose *and* the token carries the text role, so an `em`
  *spacing* still drops. Emitted parenthesised — `(-0.03).em` — because
  `-0.03.em` parses as `-(0.03.em)`, which `kotlinc` 2.4.10 rejects with
  "unresolved reference 'unaryMinus'"; the parenthesised form compiles either
  way, and a tight letter spacing is negative, so this is the common case rather
  than an edge one. **iOS is excluded deliberately, not pending:** letter spacing
  there is an `NSAttributedString` kern in points, which needs the font size a
  token does not carry, so no constant Swift could emit would be right at every
  font size. Measured: Kotlin goes from 195 to 208 declarations and compiles to
  bytecode; Swift output is byte-identical. The four
  `typography.letterSpacing.{tight,normal,wide,widest}` primitives still do not
  emit — their leaf names state no role, the same documented limit as a bare
  scale primitive — leaving Android with 6 unmatched source tokens, of which a
  `linear-gradient()` and a `100%` have no native form at all.
- **The native literal grammar no longer vouches for output that does not
  compile.** `invalid-literal` accepted `.5` and `0100`, so
  `tokens:validate-output` exited 0 on values neither platform can build. The
  two platforms disagree in opposite directions, measured rather than assumed:
  `swiftc -parse` rejects `.5` ("it must be written '0.5'") but compiles `0100`,
  while Kotlin's lexical grammar makes `0100` unparseable — `IntegerLiteral`
  requires a non-zero leading digit — and permits `.5`. A single shared rule
  would therefore over-reject on one platform or under-reject on the other, so
  the number rule is now per-platform, alongside the suffixes, units and escapes
  already held per platform. Hex stays: it compiles on both. This changes the
  gate only; `hasNativeForm` never drops a plain scalar for failing the literal
  check, so no token is newly filtered out of output. Both platforms are
  compile-measured, and the emitted output for this project's 322-token
  reference source now compiles on both: `Tokens.kt` builds to bytecode against
  Compose stubs, and `Tokens.swift` parses clean across all 195 declarations.
- **Compose font sizes and line heights emit as `sp` rather than `dp`.**
  `size/unit-aware/compose-sp` gated on `$type === "fontSize"`, which DTCG
  does not define — it types font sizes as `dimension` — so on a
  spec-compliant source the branch never fired and every dimension emitted as
  `dp`. Measured on a real 322-token source: zero `.sp` in the Kotlin output.
  The role now comes from the member names DTCG §9.8 fixes for the typography
  composite: a token whose own `$type` is `dimension`, named `fontSize`,
  `letterSpacing` or `lineHeight`, and whose resolved value carries a `px` or
  `rem` unit, is stamped
  `$extensions["com.radicool.throughline"].nativeUnit = "text"` during
  preprocessing, and the Compose transforms partition on that stamp. Style
  Dictionary's own `$type: "fontSize"` convention still works, so the change
  is additive. A source can set the extension itself to override the rule, or
  set it to `"device"` to opt a token out. The `$type` check reads the token's
  own key, so a dual-node child that carries no `$type` of its own — and would
  inherit `dimension` from its parent during hoisting — is not stamped and
  still emits `dp`. Two limits remain and are documented: a bare scale
  primitive (`text.base`) carries no role and stays
  `dp`, and an `em` letterSpacing is still filtered out of native output.
- **`preprocess` throws on a dual-node hoist collision instead of silently
  discarding a token.** `hoistDualNodes` renames a dual node's child to a
  camel-joined sibling (`text.sm.lineHeight` becomes `text.smLineHeight`).
  When that name is already taken — by an authored sibling, or by another
  dual node's child hoisted earlier in the same pass — `preprocess` now
  throws, naming both colliding paths, instead of silently overwriting one
  and dropping the other. A build that previously succeeded may now throw
  here; in almost every case that is the point rather than a regression — it
  surfaces a token your build was already losing without telling you. The one
  exception: when the two colliding nodes are deeply identical, the overwrite
  was lossless, and such a build now throws having lost nothing. Renaming
  either path resolves it.
- **A hoisted dual-node child now inherits the dual node's `$type`** when it
  has none of its own — the dual node is the child's closest `$type`-bearing
  ancestor as authored, and that ancestry is lost once the hoist makes the
  child a sibling instead. A child whose authored value was a whole-value
  reference is excluded and keeps its referent's resolved type per DTCG
  5.2.2. Two consequences are knowingly accepted and a third was not, and none
  is subtle enough to leave implicit:
  - An untyped `fontSize` child under a `dimension`-typed parent now emits
    through the `dimension` transform — `.dp` on Android rather than `.sp`,
    which **defeats the user's font-scale accessibility setting**. It
    previously emitted a bare literal that `tokens:validate-output` caught
    loudly; that gate no longer fires on it.
  - An untyped unitless child now emits as a `dimension` — a ratio. It emitted
    in density-independent pixels until the unitless-dimension fix below made
    it emit bare instead. Also previously caught loudly.
  - Where an enclosing *group* carries a `$type` that correctly describes the
    child, the dual node's type shadowed it, so a token that resolved
    correctly before resolved wrongly. **Fixed below**; it is listed here
    because the two above are accepted and this one was not.

  The two accepted consequences are covered by tests. This does not make
  native output compile-verified or validate DTCG conformance on its own.
- **An enclosing group's `$type` is no longer shadowed by a dual node's.**
  The hoist carries a dual node's `$type` onto an untyped child to replace the
  ancestry the hoist costs it. Where an enclosing *group* already supplies a
  type, nothing was lost — DTCG §5.2.2 inherits from the closest parent
  *group*, and §6.1 makes a node carrying a `$value` a token — so the carry
  shadowed a type that was already correct. It is now suppressed there, so the
  hoist never *changes* a type DTCG inheritance already determines — including
  where that type suits the child badly. Where inheritance determines none,
  the carry still supplies the dual node's, which is a repair rather than a
  reading of the source. Measured through Compose, the shape emitted
  `val textSmLineHeight = 20px` (does not compile, and
  `tokens:validate-output` caught it) for a `px` child, and
  `val textSmLineHeight = 1.5` — a `Double` where a `Dp` belongs, compiling
  and passing the gate clean — for a unitless one. The `px` child now emits
  `.dp`; the unitless one now emits bare instead, per the unitless-dimension
  fix below. Output against a real 322-token source is byte-identical: the
  shape requires a dual node typed differently from both its enclosing group
  and its own child.
- **`no-foreign-syntax` reconciled with the native output filter.** An
  unrescued `calc(...)`, `var(...)`, or `color-mix(...)` variant was
  previously dropped from native output by `sd-native.mjs`'s filter before
  `tokens:validate-output` ever saw it, so the gate exited `0` on a value it
  exists to catch. The filter now keeps those named CSS constructs — they are
  unimplemented rescues, not values with no native form — so
  `no-foreign-syntax` now correctly fails a build that emits a bare,
  unrescued `calc(...)`/`var(...)`/`color-mix(...)`, where it previously
  passed. Conversely, `no-foreign-syntax` no longer fails a well-formed,
  quoted `$type: string` value whose *text* happens to contain `calc(` or
  `var(` (e.g. `"width: calc(100% - 2rem)"`) — a value the grammar accepts as
  a literal is not foreign syntax, whatever text it contains, and this
  previously false-failed a build that compiles.
- **A unitless value no longer emits with an invented unit.** `leading.normal:
  "1.5"` typed `dimension` emitted `1.50.dp` on Compose and `CGFloat(1.50)` on
  Swift — the magnitude faithful, the unit meaningless. DTCG §8.2.1 requires a
  dimension to carry a unit and §8.7's `number` is the type for a ratio, so this
  is malformed input rather than a shape to interpret. No size transform now
  claims a unitless value; it emits bare, which is byte-for-byte what a
  correctly typed `number` already produced on both platforms, so correcting a
  source's `$type` changes no output. `tokens:validate-output` reports it as a
  `unitless-dimension` advisory, which does not gate.

### Changed
- **A dimension whose unit was omitted by mistake now fails loudly instead of
  working by accident.** `spacing.gutter: "16"` meant as `16px` previously
  emitted `16.00.dp`, correct only because px and dp map 1:1 by convention. It
  now emits bare `16`, which does not compile at a Compose `Dp` use site and
  infers `Int` in Swift, where it will not convert at a `CGFloat` use site. A
  unitless `0` is affected identically — DTCG §8.2.1 requires the unit "even if
  `$value.value` is `0`". Add the unit, or type the token `number` if it really
  is a ratio.
- **The `nativeUnit` override no longer applies to a unitless value.** It
  chooses between `dp` and `sp` for a value that has a unit; it does not
  manufacture one. A source that stamped `nativeUnit: "text"` onto a unitless
  token previously got `1.50.sp` — which compiles and renders 1.5sp text — and
  now gets the bare value. This narrows the "a source that states the role
  itself wins" contract introduced in 0.15.0.
- **A unitless dimension authored in leading-dot form (`".5"`) now emits a
  bare `.5`, which Swift rejects.** Previously it emitted `0.50.dp` and
  compiled. `tokens:validate-output` now catches it — see the literal-grammar
  fix under Fixed. Kotlin's grammar does permit `.5`, so the gate fails the
  Swift build and passes the Kotlin one.

## [0.15.0] — 2026-08-12

### Added
- **Doc-writing standard and lint.** `references/doc-writing-standard.md` sets
  the plain reference register for all doc-record prose — per-block rules for
  `description`, `whenToUse`/`whenNotToUse`, `variants`/`states`,
  `dos`/`donts`, and `accessibility.notes`, plus the banned machinery
  vocabulary (tokens, variables, bindings, fingerprints, provenance, projections,
  surfaces). `scripts/docs-lint.mjs` checks the mechanically reliable subset
  of the standard — warnings only, always exits 0 on a parseable record — and
  installs as `docs:lint` alongside `docs:digest`/`docs:check`. The
  `component-doc-archetypes.md` seed content was brought into compliance with
  the standard. The `component-builder` authoring pipeline and
  `/document-component` now run the lint after the record is written and
  before the user-approval gate, fixing what it can and carrying any
  `imported`/`user`-provenance warning as a proposed before/after rewrite into
  the single record-approval gate; a block the user clears there is stamped
  `imported+user` so a later run neither re-asks about it nor rewrites it.

- **Deterministic doc-card builder (layout phase).** The doc card's `Usage` band
  is now rendered by a canonical, generated `figma_execute` snippet
  (`references/doc-card-builder.md`) built from a pure, unit-tested layout
  planner (`scripts/lib/doc-card-plan.mjs`) — a column-unit grid (three
  wrapping rows, four closed block types) whose width grows with the variant
  matrix instead of stretching text. Cards stamp a `renderer` version into the
  manifest; `docs:check` reports old-layout cards as the informational
  `layout-upgrade-available`, never as drift. CI gates the generated snippet
  with `build-doc-card-builder.mjs --check`.

### Changed
- **Provenance protection is now tier-based.** Every `provenance` value on a
  doc-record block is assigned to exactly one of two tiers: generated
  (`ai-inferred`, `framework`, `best-practice`, `w3c-apg`) is re-inferred on
  regeneration; human input (`user`) and pre-existing external content
  (`imported`) are protected from being silently overwritten. On a
  `+`-joined combination, protection wins — `best-practice+user` is
  protected. A protected block can still be rewritten when the user approves
  the rewrite at the record-approval gate, and the result is stamped
  `imported+user`, staying protected from then on.

### Fixed
- **Doc-card post-dogfood fixes.** Column count is now decided by content
  alone — `cardColumns` takes no specimen input at all, so a wide specimen
  with sparse Usage content no longer mints dead columns, and the render can
  no longer feed its own next run a measurement it moved;
  `DOC_CARD_RENDERER_VERSION` bumps to `'4'` and old-layout cards re-flag
  `layout-upgrade-available`. The builder now refuses to render a card that
  already carries a foreign `Usage — *` band (documents more than one
  component) instead of silently accumulating one. The `Usage` frame sets
  `clipsContent = false`. The specimen lookup is the card's `COMPONENT_SET`
  only — the never-executed named-`"Specimen"`-band path is removed.
  `/document-component`'s drift-reconcile step now checks that the repo's
  copied doc scripts are current before trusting `docs:check`, and offers to
  refresh them from the plugin when they've fallen behind.
- **Doc-card header now accepts both documented header shapes.** The header
  guard previously required legacy nodes (`Status Pill`, and a "Last updated"
  label/value frame) and rejected a card built exactly to the written
  standard (`Status`/`Status Label`, a `Last Updated` text node) — throwing
  after the `Usage` band had already been rebuilt, with an error that pointed
  at the description rather than the real mismatch. The guard now accepts
  either shape, runs before any mutation so a shape mismatch leaves the card
  untouched, and names which anchor (status, description, or date) it
  couldn't find. The header date now has a single source, the doc record's
  `updatedAt` field — the status-promotion write-back no longer hand-stamps a
  second date onto a guessed node; it refreshes the record and re-renders the
  card instead.

## [0.14.0] - 2026-07-14

### Added
- **Component documentation layer ("ThroughLine Docs").** Every component gets a
  structured, AI-first canonical doc record (`design-system/docs/components/<Name>.doc.json`)
  authored from four sources (ingest existing → infer from the built artifact →
  enrich from a best-practice archetype knowledge base → specialize to the target
  framework → user interview, with per-block `provenance`). It is projected to the
  Figma component `description` field, the enriched doc card, Storybook
  autodocs/MDX + JSDoc, and an AI digest (`index.json` + `llms.txt`). A `docs:check`
  gate fingerprints every surface and reports drift for per-item reviewable
  reconciliation — including a failing `missing-surface` class when a rendered
  code surface is deleted (distinct from an unreadable Figma surface). New
  `docs:digest`/`docs:check` scripts, `component-doc-schema.md`
  + `component-doc-archetypes.md` references, a `/document-component` command, and
  manifest schemaVersion 5 (`components.meta[name].doc`, `audit.docSurface`, `docs`
  retrofit phase). Covers greenfield and brownfield (adopt-first, never clobbers
  existing docs).

## [0.13.0] - 2026-07-05

### Added
- **Subagent-driven model-tier routing — "plan deep, build cheap."** Skills now
  split work by cognition: an `architect` plans a stage on the strongest tier and
  emits a transcription-grade spec in stable identifiers, cheap executors carry it
  out, and a `reviewer` gates the result. A new `references/agent-routing.md`
  defines a portable `fast < balanced < deep` tier ladder (recommended mapping
  Haiku → Sonnet → Opus) with an installer-overridable resolution table — **no
  concrete model name is hardcoded anywhere**, so the routing travels to any
  install, and a missing tier collapses to the nearest lower one. Four
  Claude-native role agents (`architect`, `figma-executor`, `code-executor`,
  `reviewer`), each `model: inherit`.
- **Bridge-locked, verify-then-replace Figma authoring.** `figma-executor`
  resolves names → nodeIds at run time, builds into a named `WIP:` frame, and
  finalizes only after a **programmatic read-back** (`COMPONENT_SET`/variable
  existence + count + bound-variable spot-check — a screenshot is not proof). The
  entire Figma surface is concurrency-1 through the single Console bridge.
- **CI guards for the routing model.** `ci/validate-skills.mjs` now asserts every
  `agents/*.md` frontmatter is `model: inherit` (fails on a hardcoded model name)
  and that `agent-routing.md` names all three tiers.

### Changed
- **Routing rolled across every subagent-driven skill.** `token-sync-layer`
  (per-adapter → `code-executor` fast + `reviewer`), `component-builder` and
  `icon-system-builder` (Figma authoring → sequential `architect` →
  `figma-executor`), `storybook-chromatic-builder` (per-component story-gen →
  `code-executor` fast + `reviewer`), and `token-builder` / `token-sheet-builder`
  (reframed from "no subagents" to sequential architect → figma-executor).
  `component-pipeline` keeps its human gates *between* stages while subagents run
  continuously *within* one. On hosts without subagent dispatch, every site
  degrades cleanly to inline single-model execution.
- **Figma preflight now asserts active-file identity.** Because `figma_execute`
  targets whichever file is active in Figma Desktop, a connected bridge is not
  enough — `references/figma-scripting.md` now requires confirming the active
  `fileKey` matches the target (and re-confirming after any step that could switch
  it) before writing.

## [0.12.1] - 2026-07-03

### Fixed
- **`npx @radicool/throughline init` silently did nothing.** npm invokes the bin
  through a `node_modules/.bin` symlink, which defeated the CLI's
  direct-invocation guard (`pathToFileURL(process.argv[1])` never matched the
  real module path), so the installer exited 0 without installing. The guard
  now realpath-resolves `argv[1]` first, with a symlink-invocation regression
  test.

## [0.12.0] - 2026-07-03

### Added
- **Published to npm as [`@radicool/throughline`](https://www.npmjs.com/package/@radicool/throughline).**
  The multi-agent installer is now installable everywhere: `npx @radicool/throughline init`.
  (The unscoped `throughline` npm name belongs to an unrelated package.)
- **Tag-driven release automation.** Pushing a `vX.Y.Z` tag now runs the full CI
  validation, publishes to npm with provenance via trusted publishing, and creates
  a GitHub Release with notes extracted from this changelog
  (`.github/workflows/release.yml` + `ci/extract-changelog.mjs`).

### Changed
- **Install command for Cursor/Codex/AGENTS.md targets is now `npx @radicool/throughline init`**
  (previously documented as `npx throughline init`, which was never published).
- README version badge now reads live from the npm registry.

## [0.11.0] - 2026-07-02

### Added
- **Library-derived focus states.** Focus is now built to match `project.uiFramework`'s
  real `:focus-visible` idiom (shadcn/default `0 0 0 3px` spread-shadow ring, `vanilla-css`
  outline stroke, MUI per-component, ios-swift skip, tier-2 researched) instead of one
  house-style stroke — see the per-library recipe in `figma-component-standards.md`
  "State handling". The ring's *mechanism* is chosen by control fill: a drop-shadow effect
  for filled controls, an absolutely-positioned ring **child** for transparent ones
  (a Figma drop-shadow only casts from opaque pixels).
- **Tabler and Phosphor promoted to first-class icon libraries** in `icon-system-builder`,
  built by the same official-SVG-fetch mechanism as Lucide; `icons.library` enum extended
  (`manifest-schema.md`).

### Changed
- **Focus rings no longer use a padded wrapper or a house-style offset stroke by default.**
  Wrapping the control to make room for the ring is now forbidden (it inflated component
  bounds); `offset/focus` is used only by the outline-style (`vanilla-css`) recipe.
- **Large variant matrices use deterministic grid coordinates**, not `minWidth`/fixed
  widths (which leak to instances) or `layoutMode="GRID"` (unreliable through the bridge);
  the auto-layout audit item exempts coordinate-laid component sets.
- **Self-publish detection reframed** (`figma-publishing.md`): neither REST nor bridge
  reads can confirm a file's own publish, so the flow trusts the user's confirmation and
  treats an `INSTANCE_SWAP` key rejection as the authoritative "not published" signal.

### Fixed
- **Figma scripting gotchas documented** in `references/figma-scripting.md`:
  `setBoundVariableForEffect` silently resets `spread`/`radius`/`offset` (re-assert after
  binding); drop-shadows cast only from opaque pixels; text style must be applied before
  `.characters` (Inter font-load order); `resize()` axis mapping is inverted on VERTICAL
  frames; `refreshCache: true` is required on read-after-write; seed bound paints with a
  sensible placeholder and read the bind back; `figma_execute` is capped ~30s regardless
  of the `timeout` arg, so large builds must be chunked.
- **Doc-card component area must contrast every variant fill** (a shared surface token hid
  same-fill variants); container/component-set fills get a bind read-back in the audit.
- **Architectural rebuilds of a published/consumed component set** now warn that
  delete-and-recreate detaches downstream instances, requiring re-instancing.

## [0.10.0] - 2026-06-28

### Added
- **Brownfield retrofit foundation (Plan 1 of 3).** Groundwork for retrofitting a
  design system onto a mature codebase *and* an already-populated Figma file,
  drawn from a production Next.js retrofit case study. Design spec and plan live
  under `docs/superpowers/`.
- **`references/brownfield-retrofit.md`** — canonical reference for the
  retrofit read-discipline principle, the 7 "DON'T" guardrails, the safe retrofit
  sequence, and the verification triad.
- **Manifest schemaVersion 4** — adds three new sections (`audit`,
  `tokenCrosswalk`, `retrofit`) consumed by the forthcoming brownfield skills, a
  `"retrofit"` value for `tokens.intakeMode`, and clarified publish-state field
  docs (`figma.libraryPublished` default `false` now means *unverified*, not
  "definitely not published"). Additive only; existing manifests migrate forward.
- **`scripts/` directory** — the plugin's first executable code: canonical,
  zero-dependency Node (ESM) scripts for brownfield retrofits, tested with
  `node --test`.
  - `validate-crosswalk.mjs` — the `tokens:validate` CI gate (resolved value ==
    new value, N/N).
  - `build-reverse-index.mjs` — code symbol → new token map for semi-automated
    SCSS/Tailwind swaps.
  - `guard-token-removal.mjs` — repo-wide zero-reference grep that blocks cleanup
    while any reference to an about-to-be-deleted symbol remains.
  - `lib/crosswalk.mjs` — shared loader + structural validation.
- **`crosswalk.json` schema** — finalized contract: `references/crosswalk-schema.md`
  (prose) + `scripts/crosswalk.schema.json` (JSON Schema).
- **`token-crosswalk-builder` skill** — builds the new-token ↔ old-Figma ↔ old-code
  crosswalk, installs the vetted scripts into `packages/tokens/`, wires
  `tokens:validate`, and owns the `tokenCrosswalk` manifest section.
- **Brownfield retrofit skills (Plan 3 of 3).** Completes the brownfield path end to end.
  - **`design-system-audit` skill** — the brownfield front door: sizes the code-side
    color surface (via the new color-usage grep), inventories the Figma file with verified
    per-class reads, computes `percentSemantic`, and owns the `audit` manifest section
    (sets `tokens.intakeMode: "retrofit"`).
  - **`retrofit-planner` skill** — the orchestrator: sequences the safe 7-phase retrofit
    (audit → refine → rebind → sync → baseline → code → cleanup) with a human gate per
    phase, offers a decision journal default-on, and owns the `retrofit` manifest section.
  - **`scripts/grep-color-usage.mjs`** — the repo-shaped color-usage grep scaffold
    (ships default patterns, logs assumed-vs-detected coverage).
- **Brownfield branches in existing skills.** `figma-environment-setup` gains brownfield
  detection + routing to the audit, retrofit resume, and a pre-mutation rollback baseline;
  `token-builder` gains refine-in-place (rename preserving IDs, binding-survival audit);
  `token-sync-layer` gains the brownfield transforms (channel alpha, float32 rounding at
  the export boundary, `/opacity`→`color-mix`); `storybook-chromatic-builder` gains
  baseline-before-retrofit + the verification triad. The binding-survival audit snippet is
  added to `references/figma-scripting.md`.
- **`/design-system-status` + `/start`** now surface the `audit`, `tokenCrosswalk`, and
  `retrofit` state and route brownfield/in-progress systems to the right next step.
- **Plugin CI (first GitHub Actions workflow).** `.github/workflows/ci.yml` runs
  on every pull request and on pushes to `main`: the full `node --test` suite
  plus two zero-dependency structural validators in `ci/` — `validate-plugin.mjs`
  (plugin.json / marketplace.json: valid JSON, required fields, semver, name
  match) and `validate-skills.mjs` (every SKILL.md `name` matches its directory
  and has a ≤1024-char description; every command has a description; the
  manifest-doc example JSON parses with an integer `schemaVersion`). Closes the
  "no plugin CI" carry-forward from the brownfield retrofit effort.

### Fixed
- **Read discipline: never report "empty" without a verified read (bugs B1/B2).**
  `figma-environment-setup`'s Step 6 liveness check now proves *connectivity only*
  and never reports an inventory ("0 variables" / "no text styles") off a cheap or
  early read that can be falsely empty before pages load. `references/figma-scripting.md`
  gains a read-discipline section directing per-class reads
  (`figma_get_variables` / `figma_get_text_styles` / `figma_get_styles`) after
  `loadAllPagesAsync`. *(Behavioral fixes in the consuming brownfield skills land
  in later plans.)*
- **Bridge-instance preflight no longer hard-blocks on phantom/stale ports (bug
  B4).** `references/figma-scripting.md` now distinguishes *live* from *stale*
  Desktop Bridge instances, blocks only on two or more confirmed-live instances,
  and gives actionable remediation instead of a bare "close the other instance."
- **Publish-state detection is now behavioral, not assumed (bug B3).** `component-builder`
  and `references/figma-publishing.md` treat a default/`false` `figma.libraryPublished` as
  *unverified*: they detect first (`figma_get_library_components` /
  `figma_get_library_variables`), ask once only if inconclusive, persist the answer, and
  frame the unpublished path as a graceful choice. No new manifest field.

## [0.9.0] - 2026-06-10

### Added
- **`/throughline:start` command — the deterministic entry point.** A slash
  command that routes straight into `figma-environment-setup`, bypassing
  natural-language skill competition. The README now leads with it. This fixes
  cases where another installed plugin (e.g. superpowers' `brainstorming`) would
  intercept "let's build my design system"–style phrases and run ahead of
  environment setup.

### Changed
- **Lucide icons now fetched directly from the official source repo
  (`icon-system-builder`).** The skill previously defaulted to duplicating a
  community Figma file — "cheapest" in Claude tokens but it pushed manual work
  onto the user (find file, duplicate, copy components). For Lucide, which
  publishes every icon as a uniform 24px SVG at a deterministic repo path, the new
  default is to batch-fetch the curated subset from
  `raw.githubusercontent.com/lucide-icons/lucide/<tag>/icons/<name>.svg` and
  componentize via `figma.createNodeFromSvg` in one scripted pass — fully
  automated, official source-of-truth, deterministic naming, and a 404 doubles as
  the name-validation check. Community file / importer plugin are now fallbacks.
  Material (variant axes, no clean per-icon file) and custom SVGs are unchanged.

### Fixed
- **Cover page no longer built before tokens/styles exist (`figma-environment-setup`,
  `token-sheet-builder`, `manifest-schema.md`).** Setup used to build the branded
  Cover page during environment setup — before any tokens or styles existed — so
  it could never be on-brand. Setup now does a throwaway write test only; the
  real, fully token-bound Cover page is built by `token-sheet-builder` alongside
  the Foundations page, where it can consume the system and survive mode switches.
  `figma.coverPageBuilt` is now owned by `token-sheet-builder`.
- **Elevations are now dark-mode-aware (`token-builder`).** Elevation effect
  styles baked in a literal shadow color, so toggling Light/Dark never recolored
  shadows. Shadow color now lives in mode-aware `shadow/*` semantic color
  variables, and the effect styles **bind** their shadow color to those variables
  (only the offset/blur/spread composition stays in the style). Toggling modes now
  recolors every elevation automatically.

## [0.8.0] - 2026-06-10

### Added
- **Header/component division on doc cards (`component-builder`,
  `figma-component-standards.md`).** Every component doc card must now segment its
  header from the component area with a division element — a `Border/Semantic`-bound
  divider line or a header container on a distinct surface fill. Enforced by a new
  post-build audit gate.
- **Two roadmap items (README).** Built-in accessibility checks at token/component
  creation time, and one Figma token library syncing to multiple platforms (React,
  Android, iOS) with a per-platform-flexible component lifecycle.

### Changed
- **Component organization is now a fixed law (`figma-component-standards.md`,
  `component-builder`).** Variants are always rows, states are always columns; each
  size variation is its own variant row (never a state or a column); and every
  component must include its full relevant state set (default/hover/focus/active/
  disabled plus applicable loading/selected/success/error) rather than trimming to
  `default`. Added a per-component state checklist and two post-build audit gates.
- **Semantic colors grouped by category in the Foundations sheet
  (`token-sheet-builder`).** Semantic colors are now organized by role family
  (surface, text, border, alert/feedback, action…), mirroring how primitive ramps
  are organized — never a single flat list.

## [0.7.0] - 2026-06-08

Hardening pass from real build-session testing (token → foundations → icons →
components → Storybook on a pnpm + Turborepo + Next.js 16 + Tailwind v4 monorepo).

### Added
- **New `references/figma-scripting.md` — one home for every `figma_execute`
  gotcha.** A shared reference, wired into `token-builder`, `component-builder`,
  `icon-system-builder`, `token-sheet-builder`, and the status write-back routine.
  Covers: the single-bridge-instance preflight (concurrent writes corrupt the
  file), the `dynamic-page` async APIs (reads, setters, and `getNodeByIdAsync`),
  the `resize()` axis-lock trap, the explicit-`timeout` rule for batch writes
  (`node_count * 3000`), and why large `layoutWrap = "WRAP"` builds time out.
- **Opacity token category (`token-builder`).** First-class `_Opacity/Primitive` +
  `Opacity/Semantic` (disabled, muted, overlay/scrim, hover) on the **0–100 scale**.
- **`text/onEmphasis` color role.** The label/icon color that contrasts a
  `bg/emphasis` fill in every mode — emitted by `token-builder`, consumed by
  `component-builder` for primary/filled controls (distinct from `text/inverse`).
- **"Clip content — off by default" standard.** New section in
  `figma-component-standards.md` and a post-build audit gate: component/layout
  frames set `clipsContent = false` so outer strokes, focus rings, and shadows
  aren't sliced; clipping is reserved for deliberate cutoffs (scroll/crop frames).

### Changed
- **Figma write-back now confirms once, up front.** The status-promotion routine
  and `storybook-chromatic-builder` Step 6 surface a single batched confirmation
  before writing to Figma ("update N doc cards…"), matching the user's mental model
  and pre-empting the safety classifier instead of eating a forced round-trip.
- **Figma scripts default to the async APIs** (`getNodeByIdAsync`,
  `setCurrentPageAsync`, `setTextStyleIdAsync`, …) — the synchronous forms throw
  under the Console MCP's `dynamic-page` document mode.

### Fixed
- **Opacity rendered everything invisible.** Opacity tokens stored `0.1–0.9` were
  divided again by Figma's 0–100 `opacity` binding (→ ~0.004), blanking every
  disabled/overlay state. Primitives are now authored 0–100; `token-sync-layer`
  normalizes ÷100 on extraction so CSS/native get correct 0–1 values. The two
  skills are documented as a matched pair.
- **`resize()` silently collapsed auto-layout frames.** Calling `resize()` on an
  auto-layout frame pinned the opposite axis to `FIXED` (frames stuck at ~10px).
  Documented the re-assert pattern; the post-build audit now reads sizing modes back.
- **Storybook Controls panel was dead.** Generated stories used
  `render: () => …`, so control changes never re-rendered. Step 3 now mandates
  `render: (args) => <Component {...args} />`, and `ReactElement` slot props get
  `control: false` plus a boolean helper arg (e.g. `showAvatar`) instead of a
  broken `[object Object]` control.
- **Typography `@utility` rules were duplicated into Storybook and drifted.**
  Step 1 now checks the app's global stylesheet first and wires a single shared
  `@import` (extracted to the UI package), keeping Storybook-only concerns in a
  separate layer.
- **Storybook wouldn't start on fresh pnpm installs.** Documented adding `esbuild`
  to the root `onlyBuiltDependencies` allowlist when installing
  `@storybook/react-vite` in a pnpm workspace.
- **Icon subset names weren't validated against the package version.** Names
  removed between versions (e.g. `lucide-react` 1.x dropping brand icons) would
  build Figma components with no code counterpart. `icon-system-builder` now
  resolves every subset name against the installed/published library before
  building and reports unavailable ones.
- **Large `WRAP` grids timed out.** Skills now chunk big swatch/variant/icon grids
  into manual rows instead of one wrapped-auto-layout `figma_execute` call.

## [0.6.0] - 2026-06-06

### Added
- **Component sets are laid out as an auto-layout grid.** New "Component set
  arrangement" standard in `figma-component-standards.md`: the `ComponentSet` is a
  real auto-layout frame — one row per variant (type) stepping through its states
  across the columns, with size groups stacked vertically — instead of variants
  scattered at arbitrary coordinates. Wired into `component-builder` Step 3.
- **Focus rings get an accessibility offset.** New `Border/Semantic` `offset/focus`
  token (the `outline-offset` equivalent, aliasing the `2` width primitive). The
  component standards now require focus rings to sit 2px clear of the control edge,
  bound to that token rather than drawn flush, per WCAG focus-visibility guidance.

### Fixed
- **No more Section wrapper around artboards (regression from v0.1).** The skills
  removed the "Section may only wrap the Frame for grouping" escape hatch that was
  letting the agent re-wrap component/icon/token artboards in a `SectionNode`. The
  auto-layout Frame now sits **directly on the page**, and the skills explicitly
  override the Figma Console MCP server's "create a Section first" instruction.
  Applied across `figma-component-standards.md`, `component-builder`,
  `icon-system-builder`, and `token-sheet-builder`; the post-build audit now walks
  the parent chain to the page to catch any stray Section.

## [0.5.0] - 2026-06-04

### Added
- **Import mode runs a completeness pass.** `token-builder` import no longer does
  a 1:1 transcription of a partial source (e.g. a marketing site + brand guide).
  After preserving and organizing the user's values, it diffs them against a
  reference model of a full, flexible system and proactively proposes the missing
  pieces — derived from their existing values — as a preserve-first, opt-in menu
  (tonal ramps, neutral ramp, state colors, dark mode, elevation/radius scales,
  semantic role layer). Adds an explicit full-system checklist.
- **Post-build audit gate for all Figma-writing skills.** A single canonical
  "Post-build audit (REQUIRED before handoff)" checklist in
  `figma-component-standards.md` that reads back the actual node tree (container
  type, auto layout, bound variables, deterministic names, scope/status, visual)
  rather than trusting a screenshot. Wired into `component-builder`,
  `icon-system-builder`, and `token-sheet-builder`.
- **Scope-recognition handoff.** New `references/scaling-up-handoff.md`: when a
  step outgrows a single skill (retrofits, migrations, multi-package refactors),
  skills now surface risks and major parts, confirm scope, and brainstorm/plan
  before building — handing off to Superpowers when available, else planning
  natively. Never a hard dependency. Wired into `component-builder` (retrofit) and
  `repository-builder` (existing app).

### Fixed
- **Setup routes before brainstorming.** `figma-environment-setup` is now labelled
  a setup/process skill that runs before generic brainstorming, with explicit
  trigger phrases, so prompts like "let's set up my design system" no longer get
  hijacked by `superpowers:brainstorming`.
- **Per-category collection segmentation enforced.** `token-builder` description
  and body now lead with the one-collection-per-category-per-tier rule, so it
  stops defaulting to a two-collection (Primitives + Semantic) approach.
- **Deterministic icon acquisition.** `icon-system-builder` now treats the
  cheapest-first mechanism order as a hard gate: a known library (Lucide, Material)
  always uses a community file (#1) or importer plugin (#2), never website-SVG
  fetching (#3, the last resort). Provides named default resources so the choice is
  consistent across runs instead of improvised.
- **Layout container must be an auto-layout Frame, never a Section.** Corrected the
  self-contradictory "Section or Frame with auto layout" rule (Sections have no
  `layoutMode`), across `figma-component-standards.md` and the three skills that
  restate it. Adds a verify step.
- **Doc-card token binding enforced.** The "dogfood the design system" rule now
  includes the binding mechanics (fetch variable IDs, bind don't hardcode), a map
  of card chrome → semantic tokens, and a required read-back gate — since a
  hardcoded hex and a bound variable render identically in a screenshot.

### Changed
- **README** documents the Superpowers partner handoff for big, ambiguous work,
  framed as graceful degradation (plans natively when Superpowers isn't installed).
- **`plugin.json` version** corrected to track the release (was left at `0.3.0`
  through the `0.4.0` tag).

## [0.4.0] - 2026-06-04

### Added
- **Skill 0 intake step (Locate → Scan → Brief).** `figma-environment-setup` now
  opens by asking where to work — use the current directory, point to an existing
  project, or create a new folder — then scans for existing tooling (monorepo,
  Storybook, token pipeline, sync layer) and gives a plain-language situational
  briefing before taking any action. This replaces the old assumption that the user
  is always starting from scratch in the current directory.
- **`workspace.origin` manifest field.** Records how the user's project was
  configured at intake: `"greenfield"`, `"existing-repo"`,
  `"existing-monorepo"`, or `"unknown"`. Set once, immutable after intake.
  Downstream skills will read this to adapt behavior in future brownfield modes.
- **`workspace.detectedLayers` manifest field.** Snapshot of tooling found at
  intake time (`monorepo`, `storybook`, `tokens`, `syncLayer`) with three-state
  semantics (`null` = not yet scanned, `false` = scanned/not found, `true` =
  found). Distinct from the canonical per-skill flags — records what existed
  *before* any skill ran.
- **Manifest schemaVersion 3** — adds the two new workspace fields above and a
  new immutability rule (rule 6: `workspace.origin` must not be overwritten after
  intake).

### Fixed
- **`token-builder` read-backs now use the dynamic-page-safe APIs.** The Console
  MCP bridge runs in Figma's `dynamic-page` document mode, where the synchronous
  document-wide variable getters throw. The verification read-back now prefers the
  `figma_get_variables` tool (with `resolveAliases`), and a Prerequisites note
  directs any hand-written `figma_execute` reads to the async APIs
  (`getLocalVariableCollectionsAsync`, `getVariableByIdAsync`,
  `getVariablesByCollectionAsync`). Avoids a fail-then-retry round trip; creation
  paths were never affected.

## [0.3.0] - 2026-06-04

### Changed
- **Token systems now use per-category variable collections instead of one
  `Primitives` + one `Semantic` collection.** In Figma a mode axis (Light/Dark,
  Desktop/Mobile, Brand) belongs to the *collection*, so the old two-collection
  layout forced every category to share one mode set — dragging spacing, radius,
  and type into color's Light/Dark, where modes are meaningless. `token-builder`
  now creates one collection per category per tier (`_Color/Primitive`,
  `Color/Semantic`, `Spacing/Primitive`, `Spacing/Semantic`, `_Radius/Primitive`,
  `Radius/Semantic`, `_Typography/Primitive`, `Typography/Semantic`,
  `_Border/Primitive`, `Border/Semantic`), so each category owns its own mode
  axis and spacing can take Desktop/Mobile later without disturbing color.
- **Anti-redundancy rule replaced with a structural-consistency doctrine.** Every
  concern now gets both a primitive and a semantic collection; passthrough
  dimensional semantics are kept (they exist to carry a future mode axis) rather
  than collapsed. The one guardrail: semantic names must be real usage roles
  (`inset/md`, `width/focus`), never renamed primitive steps (`space/12`). Applied
  in both `token-builder` and the `brainstorm-before-build` import-mode guidance.
- **Naming model clarified.** In Figma, variables are `/`-grouped and omit the
  category prefix (`gray/50`, `text/primary`); the dotted form (`color.gray.50`)
  is the logical/code identity the sync layer derives by prefixing the
  collection's category.
- **`token-sync-layer` now handles the multi-collection structure** — it iterates
  N collections, treats single-mode collections as non-themed (no phantom
  `default` theme), emits brand themes from multi-mode primitive collections, and
  applies a collection→token-name mapping rule. Adapters gain a `[data-brand]`
  selector for the brand axis.

### Added
- **Border-width tokens.** Primitive `width/{0,1,2,4}` (`_Border/Primitive`) and
  semantic `width/{default,focus,emphasis}` (`Border/Semantic`). `component-builder`
  now binds component borders to them, and `token-sheet-builder` renders a
  border-width section on the Foundations page. Previously borders only had color.
- **Multi-brand model.** Brand lives as a mode axis on `_Color/Primitive` (raw
  palettes) and Theme on `Color/Semantic` (Light/Dark) — two independent axes in
  two collections, keeping each under the Figma Professional 4-modes-per-collection
  cap instead of multiplying brand × theme into one collection.

### Fixed
- **Non-color categories no longer inherit color's Light/Dark modes.** Grouping
  `space` in the same collection as `color` forced spacing to carry Light/Dark,
  which made no sense and left no room for spacing's own Desktop/Mobile axis. The
  per-category split resolves this. Verified end to end against a live Figma file.

## [0.2.3] - 2026-06-03

### Fixed
- **Finalizing a component now updates its Figma doc card.** When a component
  reached the end of the pipeline (code + stories built and approved), its Figma
  artboard kept showing the `draft` pill forever — nothing promoted it. Components
  now have an explicit lifecycle: `component-builder` creates them at `draft`, and
  `storybook-chromatic-builder` promotes them to `stable` on finalize, writing the
  new chip color (→ success) and last-updated date back into the doc card (a new
  Step 6). The status chip, its label, and the date node are now built with
  deterministic names (`Status`, `Status Label`, `Last Updated`) so the write-back
  can find them, and a canonical "Promoting a component's status" routine in
  `references/figma-component-standards.md` keeps the manifest and the artboard in
  sync. Falls back gracefully (manifest-only) when Figma isn't connected.

## [0.2.2] - 2026-06-03

### Fixed
- **`token-sheet-builder` now fully binds the Foundations page chrome to the
  system, not just the swatches.** Previously section titles, labels, and
  hex/value text kept raw fonts and hardcoded colors, and section/background
  fills were unbound — so switching the file from Dark to Light left titles and
  panels stranded (e.g. black text on a black surface) and the showcase looked
  broken. The skill now requires every text node to use a text style and every
  fill (text *and* chrome/background) to bind to a semantic color variable, and
  adds a both-modes validation step (set the non-default mode, screenshot,
  confirm legibility, restore) to catch any unbound fill before the checkpoint.

## [0.2.1] - 2026-06-03

### Fixed
- Visual-validation loop now prefers the plugin-side **`figma_capture_screenshot`**
  (bridge `exportAsync`) over the REST-based `figma_take_screenshot`, which
  frequently fails with a token/auth error. Applies to all screenshot steps
  (component cards, icon grid, Foundations page, cover page).

### Changed
- **README marketing refresh** — lead with proof badges (live Storybook, public
  Figma file) and a pipeline diagram, add a "See a real system built with it"
  showcase embedding screenshots from the
  [sample repo](https://github.com/jrpease/throughline-sample), and a "Show it off"
  badge for users. The full skill walkthrough and docs are preserved below.

## [0.2.0] - 2026-06-02

### Added
- **Cover page** — `figma-environment-setup` now builds a branded **Cover** page
  (name, author, last-updated, a clean graphic) as the file's first page, with a
  prompt to manually "Set as thumbnail" (the API can't set it).
- **`references/figma-publishing.md`** — when/how the user publishes their Figma
  file as a team library, the plan/automation constraints, and how it gates typed
  `INSTANCE_SWAP` dropdowns.
- **Manifest schemaVersion 2** — added `figma.coverPageBuilt`, `figma.canPublish`,
  `figma.libraryPublished`, `figma.publishedAt`, `components.meta` (per-component
  status + last-updated), and `components.instanceSwapUpgradePending`.
- **Documentation artboards & canvas layout** standards in
  `references/figma-component-standards.md` — token-styled doc cards, orderly
  in-Section arrangement, and a required visual-validation loop.
- **Model recommendations** documented in the README.

### Changed
- `component-builder` — soft-gates icons first (recommend, not block); wraps each
  component in a token-styled documentation card; publish-aware instance swap
  (typed dropdown when published, toggle + manual-swap fallback otherwise, with a
  tracked upgrade pass); records component status/last-updated.
- `icon-system-builder` — lays the icon set on a single documentation card and
  adds an (optional, plan-aware) library **publish checkpoint** after icons.
- `token-sheet-builder` — applies the layout discipline + visual-validation loop
  to the Foundations page.
- `repository-builder` — when `gh` is absent, **actively recommends and guides**
  installing the GitHub CLI before falling back to the manual browser path.
- `storybook-chromatic-builder` — Code Connect step notes publish state and
  pending instance-swap upgrades (without blocking the code side). **Chromatic
  defaults to full snapshots (TurboSnap off):** TurboSnap's incremental model is
  fragile for token-driven systems — token changes are global, and it misses them
  both by not tracing linked-workspace token packages and by diffing only against
  the previous branch build. Guidance now recommends snapshotting every story
  (cheap at typical counts, never misses a global token change); TurboSnap only at
  large story counts. `token-sync-layer` cross-references this on the sync PR.
- `figma-environment-setup` — now pinned to **Haiku** (lightweight scripted
  setup); also retains the launch-vs-connection troubleshooting split from before
  (npm cache `EACCES` remedy, network, missing Node).

### Deferred
- Improvement-capture → auto-PR self-improvement feature (its own future session).

## [0.1.0] - 2026-06-02

### Added
- Initial release.
- Nine skills covering the full design-to-code line: `figma-environment-setup`,
  `token-builder`, `token-sheet-builder`, `icon-system-builder`,
  `component-builder`, `repository-builder`, `token-sync-layer`,
  `storybook-chromatic-builder`, and `component-pipeline`.
- Three slash commands: `/design-system-status`, `/sync-figma-tokens`, and
  `/new-component`.
- Bundled Figma Console MCP server config (`.mcp.json`).
- Reference docs for coding level, manifest schema, sync adapters, Figma
  component standards, and brainstorm-before-build.

[Unreleased]: https://github.com/jrpease/throughline/compare/v0.18.0...HEAD
[0.18.0]: https://github.com/jrpease/throughline/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/jrpease/throughline/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/jrpease/throughline/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/jrpease/throughline/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/jrpease/throughline/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/jrpease/throughline/compare/v0.12.1...v0.13.0
[0.12.1]: https://github.com/jrpease/throughline/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/jrpease/throughline/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/jrpease/throughline/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/jrpease/throughline/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/jrpease/throughline/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/jrpease/throughline/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/jrpease/throughline/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/jrpease/throughline/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/jrpease/throughline/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/jrpease/throughline/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jrpease/throughline/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/jrpease/throughline/compare/v0.2.1...v0.2.3
[0.2.1]: https://github.com/jrpease/throughline/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jrpease/throughline/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jrpease/throughline/releases/tag/v0.1.0
