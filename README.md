# Zero-config doc browser for your codebase.

![cover](https://raw.githubusercontent.com/saif71/readingroom/main/cover.png)

One command, and every `.md`, `.txt`, image, and PDF file in your project is browsable in a clean UI - no files touched, nothing installed into your repo.

```bash
npx readingroom
```

Codebases are drowning in documentation: READMEs, design docs, agent instructions, plans, notes, changelogs. Editors are great at code, but docs get buried in nested folders and drowned out by source files. `readingroom` shows _only_ the files you care about - a folder tree  on the left, preview on the right.

## What you get

- **Sidebar tree** of every `.md`, `.txt`, image, and PDF file, with document counts per folder.
- **File-type filter** under the search box - All / Markdown / Text / Images / PDF with live counts.
- **Rendered markdown** - GitHub-flavored (tables, task lists), syntax-highlighted code blocks, collapsed YAML frontmatter; `.txt` files shown as plain text
- **Images** - `png`, `jpg`, `jpeg`, `webp`, `gif`, `avif`, and `svg` render right in the viewer
- **PDFs** - rendered by your browser's built-in viewer, with an "Open in system viewer" fallback for browsers that can't display PDFs inline
- **Search** - press `/` and type
- **Live reload** - files created, edited, or deleted by you (or your AI agents) appear instantly
- **Deep-linkable URLs** - `/view/docs/plan.md` works on reload.
- **Relative links work** - links between markdown files open in the viewer; images referenced by docs are served
- **Dark + light mode** following your or OS preference

## What it shows (and skips)

readingroom surfaces `.md` and `.txt` files plus images (`png`, `jpg`, `jpeg`, `webp`, `gif`, `avif`, `svg`) and PDFs (`pdf`), including hidden directories like `.github/` or `.claude/` where agent docs and workflow docs live.

It stays out of your way:

- Your `.gitignore` is respected (including nested `.gitignore` files)
- `node_modules`, `.git`, `dist`, `build`, `out`, `.next`, `target`, `coverage`, and friends are always skipped
- Symlinks are not followed; there is no file size limit - if your browser can handle it, it gets listed
- It is strictly **read-only** - readingroom never writes to your project

## CLI

```
readingroom [options]

  -p, --port <number>   Port to listen on (default: 9345; bumps to the next
                        free port if taken)
  -d, --dir <path>      Directory to serve (default: current directory)
      --no-open         Do not open the browser automatically
  -h, --help            Show help
  -v, --version         Show version
```

The server binds to `127.0.0.1` only - your files are never exposed to the network. It validates the `Host` header (blocking DNS-rebinding attacks) and refuses any path that resolves outside the served directory.

## Global Install (optional)

```bash
npm install -g readingroom
```

`npx readingroom` works with no install at all. Requires Node 20+. If you install globally you can run just `readingroom` from any directory.

## License

[MIT](LICENSE)
