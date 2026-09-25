# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.4] - 2026-09-25

### Added

- Visual assets gallery: a new `/gallery` page listing every image in the codebase, with name search plus folder and file-type filters, and a lightbox viewer for full-size preview.
- "Recent images" dashboard widget surfacing the 20 most recently modified images, newest first (by git date when available).
- MCP server inventory widget on the dashboard: read-only listing of servers configured in `.mcp.json`, `.claude/settings.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, and `.gemini/settings.json` — showing each server's command or URL, env var names (values never exposed), and disabled state. Malformed configs just hide the widget instead of erroring.

### Changed

- The browser tab title now shows the root folder name — and the open file's path while one is being viewed — so multiple readingroom tabs are distinguishable.

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
