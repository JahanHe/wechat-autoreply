# Changelog

All notable changes to this project are documented here.

This project follows a practical Keep a Changelog style and uses semantic version tags where possible.

## [0.4.2] - 2026-06-12

### Changed

- Renamed the user-facing judgment-library module to external knowledge base across the workbench, docs, release checks, and runtime messages.
- Clarified that the external knowledge base can use network calls or local imports, with access credentials treated as local-only sensitive data.
- Updated release metadata, download links, packaged resource checks, and installer smoke tests for `0.4.2`.

### Fixed

- Removed stale Runyu/judgment-library wording from current project rules and user-facing guidance.
- Aligned GitHub documentation links with the canonical `JahanHe/Shop-ai-reply` repository.

## [0.4.1] - 2026-06-12

### Added

- Added the implemented workbench shell with Sidebar, Top Bar, Context Bar, Main Workspace, and Detail Panel.
- Added the read-only workbench snapshot IPC for status, settings health, reply summaries, judgment library status, notification outbox, health issues, and last Trace.
- Added right-side details for rule cards and reply logs.

### Changed

- Shifted WeChat shop BrowserView below the main Top Bar so global controls remain visible during customer-service page mapping.
- Updated the workbench optimization document from a proposal into implementation guidance.
- Updated release readiness and packaged resource checks for `0.4.1`.

### Fixed

- Reduced the chance that the mapped customer-service page hides global controls.
- Kept floating-window mini controls unchanged while aligning main control status order with the workbench layout.

## [0.4.0] - 2026-06-12

### Added

- Added open-source project materials: `README.md`, `CHANGELOG.md`, `LICENSE`, and `CONTRIBUTING.md`.
- Added `docs/release-notes/v0.4.0.md` as the release entry for the current stable baseline.
- Added release readiness checks for packaged resource integrity and installer smoke tests.

### Changed

- Rewrote README as the main project entry with quick download, initialization, capability overview, risk notes, and documentation routes.
- Updated package, extension, installer test, and release readiness versions to `0.4.0`.
- Updated release documentation to treat `v0.4.0` as the recommended version.

### Fixed

- Fixed live chat rule matching so it shares the same normalization and matching path as manual rule tests.
- Restored floating window mini mode controls: open console, expand, and hide.
- Made Windows installer smoke tests compatible with PowerShell runner behavior.

### Security

- Documented that API Key, Webhook, Cookie, control Token, personal cache, and private judgment-library data must not be committed.
- Clarified that WeChat shop page automation and Runyu judgment library access require the user's own permissions.

## [0.3.9] - 2026-06-12

### Added

- Rebuilt the desktop app around a v0.3.7 behavior baseline after deprecating v0.3.8 UI direction.
- Added backend modularization, status center, IPC contracts, config validation, lifecycle checks, and release gates.
- Added fixed floating window layout and synchronized runtime status display.

### Fixed

- Preserved text, image, file, product card, order invitation, rule library, AI, judgment library, and async reply behavior.
- Fixed packaged resource coverage for macOS and Windows builds.

## [0.3.8] - 2026-06-12

### Deprecated

- Deprecated the v0.3.8 UI direction. Useful security and lifecycle fixes were manually carried forward into later versions.

## Older Versions

See [docs/project-journey.md](docs/project-journey.md) and [docs/release-notes](docs/release-notes) for the full project history from `v0.1.0` to `v0.3.7`.
