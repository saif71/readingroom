import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync, watch } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { scanTree, fileKind, DEFAULT_IGNORED_DIRS } from './scanner.js';
import { openExternal } from './openBrowser.js';
import { repoStatus, lastCommitFor, fileHistory, fileVersion, VersionNotFound } from './git.js';
import { startQuickTunnel } from './tunnel.js';

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

function loopbackHost(header) {
  if (!header) return false;
  try {
    const hostname = new URL('http://' + header).hostname.replace(/^\[|\]$/g, '');
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function listen(server, port, limit, host = '127.0.0.1') {
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
      server.listen(p, host, () => resolve(server.address().port));
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

const PAIR_COOKIE = 'rr_pair';

// Served to unauthenticated visitors on the mobile listener. Deliberately
// does not echo the token — only the paired desktop and QR URL know it.
const PAIR_REQUIRED_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>readingroom</title></head>
<body style="font-family: ui-monospace, monospace; background:#0a0a0a; color:#e5e5e5; padding:3rem; line-height:1.6">
<h1 style="font-size:1.2rem">Pairing required</h1>
<p>This readingroom is private. Scan the QR code in the desktop sidebar again,</p>
<p>or open <code>/pair?t=YOUR_ACCESS_CODE</code> with the code shown on the desktop.</p>
</body></html>`;

/** Read a small JSON body from a POST request. */
function readJsonBody(req, limit = 2048) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function lanIpv4Addresses() {
  const out = new Set();
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) out.add(addr.address);
    }
  }
  return [...out];
}

/**
 * Start the readingroom server.
 *
 * Returns { server, port, url, root, tree(), liveReload, mobile, close() }.
 * `mobile` exposes the phone-access feature: { status(), enableLan(),
 * disableLan(), startTunnel(), stopTunnel() }. `startTunnelImpl` is
 * injectable for tests.
 */
export async function startServer({
  root,
  port = 9345,
  mobilePort = 9346,
  distDir,
  autoIncrementLimit = 100,
  openFile = openExternal,
  startTunnelImpl = startQuickTunnel,
}) {
  const rootAbs = path.resolve(root);

  // Per-run pairing token. Anything arriving on the mobile listener must
  // present it (as ?t= on /pair, or as the cookie /pair sets) to get in.
  const token = randomBytes(18).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest();
  const tokenEquals = (candidate) => {
    if (typeof candidate !== 'string') return false;
    const digest = createHash('sha256').update(candidate).digest();
    return timingSafeEqual(digest, tokenHash);
  };
  const hasPairCookie = (req) => {
    const cookies = req.headers.cookie;
    if (!cookies) return false;
    for (const part of cookies.split(';')) {
      const eq = part.indexOf('=');
      if (eq !== -1 && part.slice(0, eq).trim() === PAIR_COOKIE) {
        return tokenEquals(part.slice(eq + 1).trim());
      }
    }
    return false;
  };
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

  const handle = async (req, res, channel) => {
    try {
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
        if (channel === 'mobile') {
          // Launching a system app is a desktop-only action.
          sendJson(res, 403, { error: 'not available from a paired device' });
          return;
        }
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

      if (pathname === '/api/mobile' || pathname === '/api/mobile/lan' || pathname === '/api/mobile/tunnel') {
        // The phone-access controls manage the host machine; loopback only.
        if (channel !== 'local') {
          sendJson(res, 403, { error: 'desktop only' });
          return;
        }
        if (pathname === '/api/mobile') {
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' });
            return;
          }
          sendJson(res, 200, mobileStatus());
          return;
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' });
          return;
        }
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          sendJson(res, 400, { error: err.message });
          return;
        }
        const enable = body.enabled === true;
        try {
          if (pathname === '/api/mobile/lan') {
            if (enable) await enableLan();
            else await disableLan();
          } else {
            if (enable) await startTunnel();
            else await stopTunnel();
          }
        } catch (err) {
          sendJson(res, 500, { error: err.message });
          return;
        }
        sendJson(res, 200, mobileStatus());
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
  };

  // ---- phone access --------------------------------------------------------
  //
  // A second listener (0.0.0.0, default port 9346) serves phones. Every
  // request on it needs the pairing token; there is deliberately no loopback
  // exemption because cloudflared's proxy also connects from 127.0.0.1.
  let lanServer = null;
  let lanHosts = new Set();
  // The mobile listener may run for the tunnel alone. `lanAdvertised` tracks
  // what the user actually asked for: Wi-Fi sharing (and its QR) is only
  // reported when started explicitly, never as a side effect of the tunnel.
  let lanAdvertised = false;
  let listener = { running: false, port: null, urls: [] };
  let tunnelState = { state: 'off', url: null, bytes: 0, total: null, error: null };
  let tunnelStop = null;
  let tunnelHost = null;
  let tunnelGen = 0;

  function mobileAllowedHost(header) {
    if (!header) return false;
    try {
      const hostname = new URL('http://' + header).hostname.replace(/^\[|\]$/g, '').toLowerCase();
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
      if (tunnelHost && hostname === tunnelHost) return true;
      return lanHosts.has(hostname);
    } catch {
      return false;
    }
  }

  function handlePair(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }
    if (!tokenEquals(url.searchParams.get('t'))) {
      sendJson(res, 403, { error: 'invalid access code' });
      return;
    }
    res.writeHead(302, {
      Location: '/',
      'Set-Cookie': `${PAIR_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`,
      'Cache-Control': 'no-store',
    });
    res.end();
  }

  function unauthenticated(res, pathname) {
    if (pathname.startsWith('/api/')) {
      sendJson(res, 401, { error: 'pairing required' });
    } else {
      res.writeHead(401, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(PAIR_REQUIRED_PAGE);
    }
  }

  const mobileGuard = (req, res) => {
    if (!mobileAllowedHost(req.headers.host)) {
      sendJson(res, 403, { error: 'forbidden host' });
      return;
    }
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch {
      sendJson(res, 400, { error: 'bad request' });
      return;
    }
    if (url.pathname === '/pair') {
      handlePair(req, res, url);
      return;
    }
    if (!hasPairCookie(req)) {
      unauthenticated(res, url.pathname);
      return;
    }
    handle(req, res, 'mobile').catch(() => {
      if (!res.headersSent) res.destroy();
    });
  };

  function mobileStatus() {
    const pair = (u) => `${u}/pair?t=${token}`;
    return {
      token,
      lan: {
        enabled: lanAdvertised,
        port: listener.running ? listener.port : null,
        urls: lanAdvertised ? listener.urls.map(pair) : [],
      },
      tunnel: {
        state: tunnelState.state,
        url: tunnelState.url ? pair(tunnelState.url) : null,
        bytes: tunnelState.bytes,
        total: tunnelState.total,
        error: tunnelState.error,
      },
    };
  }

  // Bring the mobile listener up (idempotent). Silent by design: it is an
  // implementation detail shared by Wi-Fi sharing and the tunnel.
  async function startListener() {
    if (listener.running) return;
    const server = http.createServer(mobileGuard);
    const actualPort = await listen(server, mobilePort, autoIncrementLimit, '0.0.0.0');
    const addresses = lanIpv4Addresses();
    lanServer = server;
    lanHosts = new Set(addresses);
    listener = {
      running: true,
      port: actualPort,
      urls: addresses.map((ip) => `http://${ip}:${actualPort}`),
    };
  }

  async function stopListener() {
    listener = { running: false, port: null, urls: [] };
    lanHosts = new Set();
    const server = lanServer;
    lanServer = null;
    if (server) {
      // Mobile clients may hold SSE streams open; end them so close() returns.
      // Desktop clients transparently reconnect.
      for (const res of sseClients) res.end();
      server.close();
      server.closeAllConnections?.();
    }
  }

  async function enableLan() {
    if (lanAdvertised) return;
    await startListener();
    lanAdvertised = true;
    if (listener.urls.length === 0) {
      console.warn('readingroom: no network address found — phones must use the tunnel');
    } else {
      console.log(`readingroom: phone access on — ${listener.urls[0]}/pair?t=${token}`);
    }
  }

  async function disableLan() {
    const wasAdvertised = lanAdvertised;
    lanAdvertised = false;
    // stopTunnel tears the listener down too when nothing else needs it.
    await stopTunnel();
    if (listener.running) await stopListener();
    if (wasAdvertised) console.log('readingroom: phone access off');
  }

  function setTunnel(patch) {
    tunnelState = { ...tunnelState, ...patch };
  }

  // Kicks the work off and returns; progress and errors land in the tunnel
  // state that GET /api/mobile reports. The listener it needs comes up
  // silently — Wi-Fi sharing is only reported when started explicitly.
  async function startTunnel() {
    await startListener();
    if (tunnelState.state === 'on' || tunnelState.state === 'downloading' || tunnelState.state === 'starting') {
      return;
    }
    const gen = ++tunnelGen;
    setTunnel({ state: 'downloading', url: null, bytes: 0, total: null, error: null });
    startTunnelImpl({
      targetPort: listener.port,
      onProgress: (p) => {
        if (gen !== tunnelGen) return;
        if (p.phase === 'downloading') setTunnel({ state: 'downloading', bytes: p.bytes, total: p.total });
        else if (p.phase === 'starting') setTunnel({ state: 'starting' });
      },
      onUnexpectedExit: (message) => {
        if (gen !== tunnelGen) return;
        setTunnel({ state: 'error', url: null, error: message });
      },
    }).then(
      ({ url, host, stop }) => {
        if (gen !== tunnelGen) {
          stop();
          return;
        }
        tunnelStop = stop;
        tunnelHost = host;
        setTunnel({ state: 'on', url, error: null });
        console.log(`readingroom: tunnel ready — ${url}/pair?t=${token}`);
      },
      (err) => {
        if (gen !== tunnelGen) return;
        setTunnel({ state: 'error', error: err.message });
      },
    );
  }

  async function stopTunnel() {
    tunnelGen += 1; // invalidate any in-flight start
    tunnelHost = null;
    const stop = tunnelStop;
    tunnelStop = null;
    setTunnel({ state: 'off', url: null, error: null, bytes: 0, total: null });
    if (stop) await stop();
    // If the listener only existed for the tunnel, bring the whole thing down.
    if (!lanAdvertised && listener.running) await stopListener();
  }

  const server = http.createServer((req, res) => {
    if (!loopbackHost(req.headers.host)) {
      sendJson(res, 403, { error: 'forbidden host' });
      return;
    }
    handle(req, res, 'local').catch(() => {
      if (!res.headersSent) res.destroy();
    });
  });

  const actualPort = await listen(server, port, autoIncrementLimit);

  return {
    server,
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    root: rootAbs,
    tree: () => cachedTree,
    liveReload: watcher !== null,
    mobile: {
      status: mobileStatus,
      enableLan,
      disableLan,
      startTunnel,
      stopTunnel,
    },
    close() {
      clearTimeout(rescanTimer);
      clearInterval(heartbeat);
      watcher?.close();
      for (const res of sseClients) res.end();
      if (lanServer) {
        lanServer.close();
        lanServer.closeAllConnections?.();
      }
      // stop() dispatches SIGTERM synchronously, so the child dies even if
      // the process exits immediately after close().
      tunnelStop?.();
      server.close();
    },
  };
}
