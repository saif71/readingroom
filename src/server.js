import http from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync, watch } from 'node:fs';
import path from 'node:path';
import { scanTree, fileKind, DEFAULT_IGNORED_DIRS } from './scanner.js';
import { openExternal } from './openBrowser.js';
import { repoStatus, lastCommitFor, fileHistory, fileVersion, VersionNotFound } from './git.js';

const MIME = {
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function mimeType(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function hostAllowed(header) {
  if (!header) return false;
  try {
    const hostname = new URL('http://' + header).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function listen(server, port, limit) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = (p) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && port !== 0 && tries < limit) {
          tries++;
          attempt(p + 1);
        } else {
          reject(err);
        }
      });
      server.listen(p, '127.0.0.1', () => resolve(server.address().port));
    };
    attempt(port);
  });
}

const NOT_BUILT_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>readingroom</title></head>
<body style="font-family: ui-monospace, monospace; background:#0a0a0a; color:#e5e5e5; padding:3rem; line-height:1.6">
<h1 style="font-size:1.2rem">readingroom: frontend is not built</h1>
<p>The API is running, but <code>dist/</code> is missing from the package.</p>
<p>If you are hacking on readingroom itself, run <code>npm run build</code> (or use <code>npm run dev:web</code>) and reload.</p>
</body></html>`;

/**
 * Start the readingroom server.
 *
 * Returns { server, port, url, root, tree(), close() }.
 */
export async function startServer({ root, port = 9345, distDir, autoIncrementLimit = 100, openFile = openExternal }) {
  const rootAbs = path.resolve(root);
  let cachedTree = scanTree(rootAbs);
  let lastTreeJson = JSON.stringify(cachedTree);
  const sseClients = new Set();

  // Only serve files that resolve inside the scanned root.
  function safeResolve(rel) {
    if (typeof rel !== 'string' || rel.includes('\0')) return null;
    const abs = path.resolve(rootAbs, rel.replace(/\\/g, '/'));
    if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return null;
    return abs;
  }

  function broadcastTree() {
    const payload = `event: tree\ndata: ${lastTreeJson}\n\n`;
    for (const res of sseClients) res.write(payload);
  }

  let rescanTimer = null;
  function scheduleRescan() {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => {
      try {
        const next = scanTree(rootAbs);
        const json = JSON.stringify(next);
        if (json !== lastTreeJson) {
          cachedTree = next;
          lastTreeJson = json;
          broadcastTree();
        }
      } catch {
        /* transient scan failure — keep serving the previous tree */
      }
    }, 250);
  }

  let watcher = null;
  try {
    watcher = watch(rootAbs, { recursive: true }, (_event, filename) => {
      const f = filename ? String(filename).replace(/\\/g, '/') : '';
      // Skip churn inside ignored dirs (npm installs etc.) to avoid rescanning.
      if (f && DEFAULT_IGNORED_DIRS.has(f.split('/')[0])) return;
      scheduleRescan();
    });
  } catch (err) {
    console.warn(`readingroom: live reload disabled (${err.message})`);
  }

  const heartbeat = setInterval(() => {
    for (const res of sseClients) res.write(': ping\n\n');
  }, 25000);

  function serveStatic(req, res, pathname) {
    if (!distDir || !existsSync(path.join(distDir, 'index.html'))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(NOT_BUILT_PAGE);
      return;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      sendJson(res, 400, { error: 'bad path' });
      return;
    }
    const rel = decoded.replace(/^\/+/, '');
    const abs = path.resolve(distDir, rel);
    if (abs.startsWith(distDir + path.sep) && rel !== '' && existsSync(abs) && statSync(abs).isFile()) {
      const immutable = rel.startsWith('assets/');
      res.writeHead(200, {
        'Content-Type': mimeType(abs),
        'Content-Length': statSync(abs).size,
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
      });
      createReadStream(abs).pipe(res);
      return;
    }
    // SPA fallback: /view/<path> and any unknown route get the app shell.
    const indexPath = path.join(distDir, 'index.html');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': statSync(indexPath).size,
    });
    createReadStream(indexPath).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (!hostAllowed(req.headers.host)) {
        sendJson(res, 403, { error: 'forbidden host' });
        return;
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      const pathname = url.pathname;

      if (pathname === '/api/tree') {
        sendJson(res, 200, cachedTree);
        return;
      }

      if (pathname === '/api/file') {
        const rel = url.searchParams.get('p');
        const abs = safeResolve(rel);
        if (!abs) {
          sendJson(res, 403, { error: 'path outside root' });
          return;
        }
        const kind = fileKind(path.basename(abs));
        if (kind !== 'md' && kind !== 'txt') {
          sendJson(res, 400, { error: 'only .md and .txt files can be opened as text' });
          return;
        }
        let st;
        try {
          st = statSync(abs);
        } catch {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        if (!st.isFile()) {
          sendJson(res, 400, { error: 'not a file' });
          return;
        }
        const content = readFileSync(abs, 'utf8');
        sendJson(res, 200, {
          path: rel.replace(/\\/g, '/'),
          name: path.basename(abs),
          ext: path.extname(abs).toLowerCase(),
          size: st.size,
          mtime: st.mtimeMs,
          kind,
          content,
        });
        return;
      }

      if (pathname === '/api/repo') {
        sendJson(res, 200, await repoStatus(rootAbs));
        return;
      }

      if (pathname === '/api/meta') {
        const rel = url.searchParams.get('p');
        const abs = safeResolve(rel);
        if (!abs) {
          sendJson(res, 403, { error: 'path outside root' });
          return;
        }
        let st;
        try {
          st = statSync(abs);
        } catch {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        if (!st.isFile()) {
          sendJson(res, 400, { error: 'not a file' });
          return;
        }
        const cleanRel = rel.replace(/\\/g, '/');
        const name = path.basename(abs);
        const kind = fileKind(name);
        let words = null;
        let chars = null;
        if (kind === 'md' || kind === 'txt') {
          try {
            const content = readFileSync(abs, 'utf8');
            words = (content.match(/\S+/g) || []).length;
            chars = content.length;
          } catch {
            /* unreadable right now — reading stats stay null */
          }
        }
        const lastCommit = await lastCommitFor(rootAbs, cleanRel);
        sendJson(res, 200, {
          path: cleanRel,
          name,
          ext: path.extname(abs).toLowerCase(),
          kind,
          size: st.size,
          mtime: st.mtimeMs,
          words,
          chars,
          lastCommit,
        });
        return;
      }

      if (pathname === '/api/history') {
        const rel = url.searchParams.get('p');
        const abs = safeResolve(rel);
        if (!abs) {
          sendJson(res, 403, { error: 'path outside root' });
          return;
        }
        let history;
        try {
          history = await fileHistory(rootAbs, rel.replace(/\\/g, '/'));
        } catch {
          sendJson(res, 500, { error: 'git failed' });
          return;
        }
        if (!history) {
          sendJson(res, 200, { git: false, commits: [], truncated: false });
          return;
        }
        sendJson(res, 200, { git: true, commits: history.commits, truncated: history.truncated });
        return;
      }

      if (pathname === '/api/version') {
        const rel = url.searchParams.get('p');
        const abs = safeResolve(rel);
        if (!abs) {
          sendJson(res, 403, { error: 'path outside root' });
          return;
        }
        const ref = url.searchParams.get('ref');
        if (!ref || !/^[0-9a-f]{7,40}$/i.test(ref)) {
          sendJson(res, 400, { error: 'bad ref' });
          return;
        }
        let version;
        try {
          version = await fileVersion(rootAbs, rel.replace(/\\/g, '/'), ref);
        } catch (err) {
          if (err instanceof VersionNotFound) {
            sendJson(res, 404, { error: 'version not found' });
          } else {
            sendJson(res, 500, { error: 'git failed' });
          }
          return;
        }
        if (!version) {
          sendJson(res, 404, { error: 'not a git repository' });
          return;
        }
        const name = path.basename(abs);
        const kind = fileKind(name);
        if (url.searchParams.get('raw') === '1') {
          const type = mimeType(abs);
          res.writeHead(200, {
            'Content-Type': type,
            'Content-Length': version.buffer.length,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...(type === 'application/pdf' ? {} : { 'Content-Security-Policy': 'sandbox' }),
          });
          res.end(version.buffer);
          return;
        }
        const isText = kind === 'md' || kind === 'txt';
        const entry = version.entry;
        sendJson(res, 200, {
          path: rel.replace(/\\/g, '/'),
          name,
          ext: path.extname(abs).toLowerCase(),
          kind,
          size: version.buffer.length,
          binary: !isText,
          content: isText ? version.buffer.toString('utf8') : null,
          ref: entry ? entry.sha : ref,
          author: entry ? entry.author : null,
          date: entry ? entry.date : null,
          subject: entry ? entry.subject : null,
          deleted: entry ? entry.status === 'D' : false,
        });
        return;
      }

      if (pathname === '/api/raw') {
        const abs = safeResolve(url.searchParams.get('p'));
        if (!abs) {
          sendJson(res, 403, { error: 'path outside root' });
          return;
        }
        let st;
        try {
          st = statSync(abs);
        } catch {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        if (!st.isFile()) {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        const type = mimeType(abs);
        res.writeHead(200, {
          'Content-Type': type,
          'Content-Length': st.size,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          // Repo files are data, not trusted same-origin documents. PDFs are
          // exempt: some browsers refuse to run their built-in PDF viewer on
          // a response delivered under CSP sandbox.
          ...(type === 'application/pdf' ? {} : { 'Content-Security-Policy': 'sandbox' }),
        });
        createReadStream(abs).pipe(res);
        return;
      }

      if (pathname === '/api/open') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' });
          return;
        }
        const rel = url.searchParams.get('p');
        const abs = safeResolve(rel);
        if (!abs) {
          sendJson(res, 403, { error: 'path outside root' });
          return;
        }
        const kind = fileKind(path.basename(abs));
        if (kind !== 'pdf') {
          sendJson(res, 400, { error: 'only PDF files can be opened in a system app' });
          return;
        }
        let st;
        try {
          st = statSync(abs);
        } catch {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        if (!st.isFile()) {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        if (!(await openFile(abs))) {
          sendJson(res, 500, { error: 'could not open the file with the system default app' });
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        });
        res.write(': connected\n\n');
        sseClients.add(res);
        res.on('close', () => sseClients.delete(res));
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'unknown endpoint' });
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { error: 'method not allowed' });
        return;
      }

      serveStatic(req, res, pathname);
    } catch (err) {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
      else res.end();
    }
  });

  const actualPort = await listen(server, port, autoIncrementLimit);

  return {
    server,
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    root: rootAbs,
    tree: () => cachedTree,
    liveReload: watcher !== null,
    close() {
      clearTimeout(rescanTimer);
      clearInterval(heartbeat);
      watcher?.close();
      for (const res of sseClients) res.end();
      server.close();
    },
  };
}
