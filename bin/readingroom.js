#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';
import { openBrowser } from '../src/openBrowser.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `readingroom v${pkg.version} — zero-config doc browser for your codebase

Usage:
  readingroom [options]

Options:
  -p, --port <number>   Port to listen on (default: 9345; bumps to the next
                        free port if taken)
  -d, --dir <path>      Directory to serve (default: current directory)
      --no-open         Do not open the browser automatically
  -h, --help            Show this help
  -v, --version         Show version

It scans the directory for .md, .txt, image, and PDF files (respecting
.gitignore and skipping node_modules and friends) and serves a read-only
browser UI.
`;

function parseArgs(argv) {
  const opts = { port: undefined, dir: undefined, noOpen: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (arg === '-v' || arg === '--version') {
      process.stdout.write(pkg.version + '\n');
      process.exit(0);
    } else if (arg === '--no-open') {
      opts.noOpen = true;
    } else if (arg === '-p' || arg === '--port') {
      const value = argv[++i];
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        console.error(`readingroom: invalid port "${value}"`);
        process.exit(1);
      }
      opts.port = port;
    } else if (arg === '-d' || arg === '--dir') {
      opts.dir = argv[++i];
      if (!opts.dir) {
        console.error('readingroom: --dir requires a path');
        process.exit(1);
      }
    } else {
      console.error(`readingroom: unknown option "${arg}"\n`);
      process.stdout.write(HELP);
      process.exit(1);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const root = path.resolve(opts.dir || process.cwd());
const distDir = fileURLToPath(new URL('../dist', import.meta.url));

let app;
try {
  app = await startServer({ root, port: opts.port ?? 9345, distDir });
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    console.error('readingroom: could not find a free port');
  } else {
    console.error(`readingroom: ${err.message}`);
  }
  process.exit(1);
}

console.log(`readingroom v${pkg.version} — doc browser
  root:  ${app.root}
  files: ${app.tree().count}
  url:   ${app.url}
  live reload ${app.liveReload ? 'on' : 'off'}. Press Ctrl+C to stop.`);

if (!opts.noOpen) openBrowser(app.url);

process.on('SIGINT', () => {
  app.close();
  console.log('\nreadingroom stopped.');
  process.exit(0);
});
