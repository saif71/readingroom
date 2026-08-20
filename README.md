# Zero-config doc browser for your codebase.

![cover](https://raw.githubusercontent.com/saif71/readingroom/main/cover.png)

One command, and every `.md`, `.txt`, image, and PDF file in your project is browsable in a clean UI - no files touched, nothing installed into your repo.

```bash
npx readingroom
```

Codebases are drowning in documentation: READMEs, design docs, agent instructions, plans, notes, changelogs. Editors are great at code, but docs get buried in nested folders and drowned out by source files. `readingroom` shows _only_ the files you care about - a folder tree on the left, preview on the right.

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
- **Read on your phone** - a QR code in the sidebar pairs your phone over Wi-Fi, or through a private tunnel when you're on a different network

## What it shows (and skips)

readingroom surfaces `.md` and `.txt` files plus images (`png`, `jpg`, `jpeg`, `webp`, `gif`, `avif`, `svg`) and PDFs (`pdf`), including hidden directories like `.github/` or `.claude/` where agent docs and workflow docs live.

It stays out of your way:

- Your `.gitignore` is respected (including nested `.gitignore` files)
- `node_modules`, `.git`, `dist`, `build`, `out`, `.next`, `target`, `coverage`, and friends are always skipped
- Symlinks are not followed; there is no file size limit - if your browser can handle it, it gets listed
- It is strictly **read-only** - readingroom never writes to your project

## Demo

<iframe width="800" height="450" src="https://www.youtube.com/embed/mOOgsZkM8pA?si=fvcFuyWEqlCaquZD" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

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

## Read on your phone

Click the phone icon in the sidebar for a QR code:

- **On this Wi-Fi** - scan and you're reading. Nothing leaves your network.
- **From anywhere** - "Start tunnel" creates a private `trycloudflare.com` URL that works from any network. The cloudflared helper (~30 MB) downloads once on first use and is cached; there is nothing to install or sign up for.

Both ways are guarded by a per-run access code (part of the QR URL) - anyone without it gets refused. Sharing stops when you stop it in the dialog or close readingroom, and the code changes on every run. Tunnels are routed through Cloudflare's free quick-tunnel service, so they need internet access and are best-effort, not guaranteed uptime.

## Global Install (optional)

```bash
npm install -g readingroom
```

`npx readingroom` works with no install at all. Requires Node 20+. If you install globally you can run just `readingroom` from any directory.

## License

[MIT](LICENSE)
