# Publishing ThroughLine — Design

**Date:** 2026-07-03
**Status:** Approved

## Goal

Make ThroughLine actually installable by the world: publish the installer package
to npm, automate future releases, and get the plugin listed in Anthropic's
marketplaces. Four surfaces are in scope: the npm package, release automation,
plugin-marketplace submission, and the launch polish around them.

## Context and constraints

- The npm name `throughline` is **taken** by an unrelated, actively maintained
  package (kitepon-rgb/Throughline, 42 published versions). The README's
  documented `npx throughline init` would install the wrong package today.
- The `@radicool` scope has no published packages (registry search returns
  zero), so it is very likely free; definitive confirmation happens when the
  org is created on npmjs.com. Fallback if claimed: `@radicoolstudio`.
- The GitHub repo `jrpease/throughline` is already public. Git tags exist through
  `v0.9.0`; releases 0.10.0 and 0.11.0 were never tagged.
- The CHANGELOG's compare-link footer was not updated for 0.11.0: `[Unreleased]`
  still compares from `v0.10.0`, and there is no `[0.11.0]` link.
- Existing CI (`.github/workflows/ci.yml`) runs: `node --test`,
  `ci/validate-plugin.mjs`, `ci/validate-skills.mjs`, and
  `scripts/adapters/generate.mjs --check`.
- npm **trusted publishing** (OIDC from GitHub Actions) can only be configured on
  a package that already exists on the registry, so the first publish must be
  manual.
- The user is not logged into npm on this machine. The `radicool` scope is
  claimed by creating an npm **organization** (free for public packages),
  keeping the studio identity separate from the personal login and allowing
  collaborators later. The GitHub repo stays under `jrpease` — npm scope and
  GitHub owner need not match; trusted publishing links them explicitly.

## Decisions (made during brainstorming)

1. **npm name:** `@radicoolstudio/throughline` — published under the studio brand
   (radicool.studio) via an npm org. Bin name stays `throughline`. Fallback
   scope if `radicool` is claimed: `@radicoolstudio`.
2. **Scope:** all four surfaces (npm, release automation, marketplace, polish).
3. **First published version:** `0.12.0` — continue the semver line; 1.0 is a
   later marketing moment.
4. **Release mechanics:** tag-driven GitHub Actions publish (approach A), with
   trusted publishing after a one-time manual first publish.

## 1. Package identity

`package.json` changes:

- `name`: `throughline` → `@radicoolstudio/throughline`
- `version`: `0.11.0` → `0.12.0`
- add `"publishConfig": { "access": "public" }` — scoped packages default to
  restricted and the publish would otherwise fail.
- `bin` stays `{ "throughline": "scripts/install.mjs" }`. `npx
  @radicoolstudio/throughline init` works because npx runs a package's single bin
  regardless of its name, and global installs still expose a `throughline`
  command.

The version bump rides along in `.claude-plugin/plugin.json` (the only other
file carrying a version; `marketplace.json` has none), keeping
`ci/validate-plugin.mjs` green.

The Claude plugin name stays plain `throughline` — plugin marketplaces
namespace independently of npm.

Command references: update `npx throughline init` → `npx @radicoolstudio/throughline
init` in **README.md** and **scripts/README.md** (the latter ships in the npm
payload). Historical specs and plans under `docs/superpowers/` are records of
past work and are left unchanged. Re-run the adapter generator if any generated
target embeds the command.

## 2. Release workflow

New `.github/workflows/release.yml`, triggered on tags matching `v*`:

1. **Guard:** fail if the tag (minus `v`) ≠ `package.json` version.
2. **Validate:** run the same four checks as `ci.yml` (`node --test`,
   validate-plugin, validate-skills, adapter drift check).
3. **Publish:** `npm publish` with `--provenance` using OIDC trusted publishing.
   No `NPM_TOKEN` secret is stored. The job needs `permissions: id-token: write`.
4. **GitHub Release:** create a release for the tag with notes extracted from
   that version's CHANGELOG section by a new dependency-free script
   `ci/extract-changelog.mjs` (with a `node --test` test file alongside,
   matching existing `ci/` conventions). The job needs
   `permissions: contents: write`.

### First-release bootstrap (one-time, manual)

Because trusted publishing can't be configured until the package exists:

1. `npm login` locally, then create the `radicool` organization on npmjs.com
   (falling back to `radicoolstudio` if taken — the spec's scope references
   update to match).
2. `npm publish` v0.12.0 from the tagged commit.
3. On npmjs.com → package settings → configure trusted publisher: repo
   `jrpease/throughline`, workflow `release.yml`.
4. From v0.13.0 on, releases are: update CHANGELOG → `npm version minor` →
   `git push --follow-tags`. CI does the rest.

The v0.12.0 GitHub Release is created manually (or by re-running the workflow's
release step) since the tag may predate the workflow landing on main.

## 3. Versioning and tag catch-up

- Retroactively tag the existing release commits: `v0.10.0` on `f71a8f7`
  (`release: v0.10.0`) and `v0.11.0` on `d51f10c` (`release: v0.11.0`); push both.
  This makes the CHANGELOG compare links resolve.
- Fix the CHANGELOG link footer: add `[0.11.0]` and `[0.12.0]` compare links and
  point `[Unreleased]` at `v0.12.0...HEAD`.
- Add a `0.12.0` CHANGELOG entry covering: published to npm as
  `@radicoolstudio/throughline`, install command change, release automation.

## 4. Plugin marketplace submission

- **Primary:** submit to Anthropic's community marketplace via the form at
  clau.de/plugin-directory-submission. It runs automated security scanning and
  approval is routine for legitimate plugins.
- **Stretch:** also submit to the official directory
  (anthropics/claude-plugins-official); inclusion is curated at Anthropic's
  discretion, so nothing downstream depends on it.
- Both submissions happen in the browser and are the user's action; the repo
  already meets the visible prerequisites (valid `plugin.json`, public repo,
  MIT LICENSE).
- The self-hosted `.claude-plugin/marketplace.json` remains the always-works
  install path and is unaffected.

## 5. Launch polish

- **README:** scoped npm command everywhere; replace the hand-maintained version
  badge with the npm registry badge
  (`https://img.shields.io/npm/v/%40radicoolstudio%2Fthroughline`), which auto-updates;
  once a marketplace accepts the plugin, add its `/plugin install` one-liner
  (deferred until acceptance — not part of this release).
- **GitHub Release** for v0.12.0 with the CHANGELOG notes.
- No announcement/social copy in scope.

## Testing

- `ci/extract-changelog.mjs` gets a `node --test` suite: extracts the right
  section for a mid-file version, the newest version, and errors clearly on a
  missing version.
- The release workflow's guard and publish steps are exercised by the real
  v0.12.0 release (bootstrap) and first automated release (v0.13.0); no
  workflow-simulation harness is added.
- Existing `node --test` + plugin/skill validators + adapter drift check must
  stay green after the rename — the installer test suite covers the payload
  staging, which is the part the rename touches.

## Out of scope

- 1.0.0 and any breaking-change policy work.
- Announcement copy, blog posts, social posts.
- Changes to the installer's behavior beyond the name/command strings.
- Automated marketplace submission (it's a web form).

## Execution order

1. Package identity changes + command-reference updates + CHANGELOG (PR).
2. Release workflow + extract-changelog script (same or second PR).
3. Retroactive tags pushed; then tag v0.12.0.
4. Manual first publish + trusted-publisher configuration (user, guided).
5. Marketplace submissions (user, guided).
6. GitHub Release v0.12.0.
