# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.3] - 2026-09-20

### Added

- Markdown table of contents and heading anchors: every rendered heading now gets a stable, GitHub-style id, so deep links like `/view/docs/plan.md#decisions` work — including links copied from GitHub.
- Hover anchor button on headings that copies a link to that section to the clipboard.
- New "Outline" tab in the Inspector showing the document's heading tree, with click-to-scroll and scroll-spy highlighting of the section currently in view.

## [0.6.2] - 2026-09-20

### Added

- Copy button on code blocks in the file viewer, with insecure-context (non-HTTPS) clipboard fallback so copying still works over plain HTTP LAN access.
- Copy-file action to copy an entire file's contents to the clipboard.

### Changed

- Improved the viewer components to integrate the new clipboard and copy-file actions.

## [0.6.1] - 2026-09-20

### Fixed

- Sidebar tree expansion state and category filter are now persisted across page reloads.
