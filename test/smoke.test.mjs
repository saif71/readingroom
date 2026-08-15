import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../src/server.js';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
}

function flattenTree(node, out = []) {
  for (const child of node.children || []) {
    if (child.type === 'file') out.push(child);
    else flattenTree(child, out);
  }
  return out;
}

const fixture = mkdtempSync(path.join(tmpdir(), 'readingroom-test-'));
const write = (rel, content) => {
  const abs = path.join(fixture, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
};

write('README.md', '# Hello\n\nworld\n');
write('NOTES.MD', 'uppercase extension\n');
write('docs/guide.md', '# Guide\n');
write('docs/api.txt', 'plain text notes\n');
write('.github/workflows/ci.md', '# CI\n');
write('nested/keep.md', 'kept\n');
write('nested/.gitignore', 'local.md\n');
write('nested/local.md', 'ignored by nested gitignore\n');
write('.gitignore', 'ignored/\n*.gen.md\n');
write('ignored/secret.md', 'ignored dir\n');
write('notes.gen.md', 'ignored glob\n');
write('node_modules/dep/README.md', 'dep readme\n');
write('dist/generated.md', 'build output\n');
write('big.md', 'x'.repeat(3 * 1024 * 1024));
write('img.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
write('photo.JPG', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
write('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
write('pic.webp', Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00]));
write('big-photo.png', Buffer.alloc(3 * 1024 * 1024, 1)); // images get a larger size cap than text
mkdirSync(path.join(fixture, 'empty'));
symlinkSync(path.join(fixture, 'README.md'), path.join(fixture, 'link.md'));

const EXPECTED = [
  '.github/workflows/ci.md',
  'NOTES.MD',
  'README.md',
  'big-photo.png',
  'docs/api.txt',
  'docs/guide.md',
  'img.png',
  'logo.svg',
  'nested/keep.md',
  'photo.JPG',
  'pic.webp',
];

let failures = 0;
try {
  const app = await startServer({ root: fixture, port: 0, distDir: path.resolve('dist') });
  const base = app.url;

  try {
    // 1. Tree contains exactly the expected documents.
    const paths = flattenTree(app.tree()).map((node) => node.path).sort();
    check('tree lists exactly the expected files', JSON.stringify(paths) === JSON.stringify([...EXPECTED].sort()), JSON.stringify(paths));

    // 2. /api/tree endpoint matches, with per-file kinds.
    const treeRes = await fetch(`${base}/api/tree`);
    const tree = await treeRes.json();
    const kindByPath = Object.fromEntries(flattenTree(tree).map((node) => [node.path, node.kind]));
    check(
      '/api/tree responds with the tree',
      treeRes.ok && tree.count === EXPECTED.length && kindByPath['README.md'] === 'md' && kindByPath['docs/api.txt'] === 'txt' && kindByPath['img.png'] === 'img' && kindByPath['logo.svg'] === 'img',
      `count=${tree.count}`
    );

    // 3. File content.
    const fileRes = await fetch(`${base}/api/file?p=${encodeURIComponent('README.md')}`);
    const file = await fileRes.json();
    check('/api/file returns md content', fileRes.ok && file.content === '# Hello\n\nworld\n' && file.kind === 'md');

    const txtRes = await fetch(`${base}/api/file?p=${encodeURIComponent('docs/api.txt')}`);
    const txt = await txtRes.json();
    check('/api/file returns txt kind', txtRes.ok && txt.kind === 'txt');

    // 4. Oversized file refused.
    const bigRes = await fetch(`${base}/api/file?p=big.md`);
    check('oversized file rejected with 413', bigRes.status === 413);

    // 5. Non-doc extensions rejected.
    const pngMetaRes = await fetch(`${base}/api/file?p=img.png`);
    check('non-md/txt rejected from /api/file', pngMetaRes.status === 400);

    // 6. Path traversal blocked.
    for (const p of ['../../etc/passwd', '%2e%2e%2f%2e%2e%2fetc%2fpasswd', '/etc/passwd', 'docs/../../link.md']) {
      const res = await fetch(`${base}/api/raw?p=${p}`);
      check(`traversal blocked (${p})`, res.status === 403, `status=${res.status}`);
    }

    // 7. Raw file serving with MIME + hardening headers.
    const rawRes = await fetch(`${base}/api/raw?p=img.png`);
    check(
      'raw file served with png MIME + CSP sandbox',
      rawRes.ok &&
        rawRes.headers.get('content-type') === 'image/png' &&
        rawRes.headers.get('content-security-policy') === 'sandbox' &&
        rawRes.headers.get('x-content-type-options') === 'nosniff',
      `ct=${rawRes.headers.get('content-type')}`
    );

    // 8. Forged Host header rejected.
    await new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port: app.port, path: '/api/tree', headers: { Host: 'evil.com' } }, (res) => {
        check('forged Host header rejected', res.statusCode === 403, `status=${res.statusCode}`);
        res.resume();
        resolve();
      });
      req.on('error', () => {
        check('forged Host header rejected', false, 'request error');
        resolve();
      });
    });

    // 9. SPA shell served for / and /view/... when dist exists.
    for (const route of ['/', '/view/README.md']) {
      const res = await fetch(base + route);
      const body = await res.text();
      check(`SPA shell at ${route}`, res.ok && body.includes('<div id="root">'));
    }

    // 10. SSE live reload: adding a file pushes a new tree.
    const sse = await fetch(`${base}/api/events`);
    const reader = sse.body.getReader();
    const decoder = new TextDecoder();
    const gotTree = (async () => {
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) return null;
        buffer += decoder.decode(value, { stream: true });
        const m = buffer.match(/event: tree\ndata: (.+)\n\n/);
        if (m) return JSON.parse(m[1]);
      }
    })();
    await new Promise((r) => setTimeout(r, 300)); // let the subscription settle
    appendFileSync(path.join(fixture, 'docs', 'new.md'), '# Fresh\n');
    const nextTree = await Promise.race([gotTree, new Promise((r) => setTimeout(() => r('timeout'), 8000))]);
    check('SSE pushes updated tree on file add', nextTree !== 'timeout' && nextTree !== null && flattenTree(nextTree).some((node) => node.path === 'docs/new.md'), String(nextTree).slice(0, 80));
    await reader.cancel();
  } finally {
    await app.close();
  }
} catch (err) {
  check('server starts and tests run', false, err.message);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

failures = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
