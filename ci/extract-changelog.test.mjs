import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractChangelog } from './extract-changelog.mjs';

const SAMPLE = `# Changelog

Intro prose.

## [Unreleased]

## [0.12.0] - 2026-07-03

### Added
- npm publishing.

### Changed
- Install command.

## [0.11.0] - 2026-07-02

### Fixed
- A bug.

[Unreleased]: https://example.com/compare/v0.12.0...HEAD
[0.12.0]: https://example.com/compare/v0.11.0...v0.12.0
[0.11.0]: https://example.com/compare/v0.10.0...v0.11.0
`;

test('extracts a mid-file version section', () => {
  const body = extractChangelog(SAMPLE, '0.12.0');
  assert.ok(body.includes('npm publishing.'));
  assert.ok(body.includes('Install command.'));
  assert.ok(!body.includes('A bug.'), 'must stop before the next section');
  assert.ok(!body.startsWith('## ['), 'must not include its own heading');
});

test('extracts the last section without swallowing the link footer', () => {
  const body = extractChangelog(SAMPLE, '0.11.0');
  assert.ok(body.includes('A bug.'));
  assert.ok(!body.includes('https://example.com'), 'link definitions are not notes');
});

test('throws a clear error for a missing version', () => {
  assert.throws(() => extractChangelog(SAMPLE, '9.9.9'), /no section for version 9\.9\.9/);
});

test('returns trimmed output with no leading/trailing blank lines', () => {
  const body = extractChangelog(SAMPLE, '0.12.0');
  assert.equal(body, body.trim());
});
