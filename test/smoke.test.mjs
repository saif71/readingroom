import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
const writeIn = (base, rel, content) => {
  const abs = path.join(base, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
};
const write = (rel, content) => writeIn(fixture, rel, content);

let gitAvailable = false;
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' });
  gitAvailable = true;
} catch {
  /* git not installed — history tests are skipped below */
}

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
write('big.md', 'x'.repeat(3 * 1024 * 1024)); // no size cap: large files are listed too
write('doc.pdf', Buffer.from('%PDF-1.4\n%\xc7\xec\x8f\xa2\n1 0 obj\n<< /Type /Catalog >>\nendobj\n'));
write('img.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
write('photo.JPG', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
write('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
write('pic.webp', Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00]));
mkdirSync(path.join(fixture, 'empty'));
symlinkSync(path.join(fixture, 'README.md'), path.join(fixture, 'link.md'));

const EXPECTED = [
  '.github/workflows/ci.md',
  'NOTES.MD',
  'README.md',
  'big.md',
  'doc.pdf',
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
  const openedWith = []; // records what the system-opener stub was asked to open
  const app = await startServer({
    root: fixture,
    port: 0,
    distDir: path.resolve('dist'),
    openFile: async (abs) => {
      openedWith.push(abs);
      return true;
    },
  });
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
      treeRes.ok &&
        tree.count === EXPECTED.length &&
        kindByPath['README.md'] === 'md' &&
        kindByPath['docs/api.txt'] === 'txt' &&
        kindByPath['img.png'] === 'img' &&
        kindByPath['logo.svg'] === 'img' &&
        kindByPath['doc.pdf'] === 'pdf',
      `count=${tree.count}`
    );

    // 3. File content.
    const fileRes = await fetch(`${base}/api/file?p=${encodeURIComponent('README.md')}`);
    const file = await fileRes.json();
    check('/api/file returns md content', fileRes.ok && file.content === '# Hello\n\nworld\n' && file.kind === 'md');

    const txtRes = await fetch(`${base}/api/file?p=${encodeURIComponent('docs/api.txt')}`);
    const txt = await txtRes.json();
    check('/api/file returns txt kind', txtRes.ok && txt.kind === 'txt');

    // 4. Large files are served — there is no size cap.
    const bigRes = await fetch(`${base}/api/file?p=big.md`);
    const big = await bigRes.json();
    check('large file served in full (no size cap)', bigRes.ok && big.content.length === 3 * 1024 * 1024, `length=${big.content?.length}`);

    // 5. Non-doc extensions rejected.
    const pngMetaRes = await fetch(`${base}/api/file?p=img.png`);
    const pdfMetaRes = await fetch(`${base}/api/file?p=doc.pdf`);
    check('non-md/txt rejected from /api/file', pngMetaRes.status === 400 && pdfMetaRes.status === 400);

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

    // 8. Raw PDF: correct MIME, exempt from CSP sandbox (built-in viewers).
    const rawPdfRes = await fetch(`${base}/api/raw?p=doc.pdf`);
    check(
      'raw pdf served with pdf MIME, exempt from CSP sandbox',
      rawPdfRes.ok &&
        rawPdfRes.headers.get('content-type') === 'application/pdf' &&
        rawPdfRes.headers.get('content-security-policy') === null,
      `ct=${rawPdfRes.headers.get('content-type')} csp=${rawPdfRes.headers.get('content-security-policy')}`
    );

    // 9. /api/open hands PDFs to the system opener (stubbed here).
    const openRes = await fetch(`${base}/api/open?p=${encodeURIComponent('doc.pdf')}`, { method: 'POST' });
    check(
      '/api/open opens a pdf with the system default app',
      openRes.ok && (await openRes.json()).ok === true && openedWith.at(-1) === path.join(fixture, 'doc.pdf'),
      JSON.stringify(openedWith)
    );

    const openGetRes = await fetch(`${base}/api/open?p=doc.pdf`);
    check('/api/open rejects GET', openGetRes.status === 405, `status=${openGetRes.status}`);

    const openTraversalRes = await fetch(`${base}/api/open?p=../../etc/passwd`, { method: 'POST' });
    check('/api/open rejects traversal', openTraversalRes.status === 403, `status=${openTraversalRes.status}`);

    const openPngRes = await fetch(`${base}/api/open?p=img.png`, { method: 'POST' });
    check('/api/open rejects non-pdf files', openPngRes.status === 400, `status=${openPngRes.status}`);

    // 10. Forged Host header rejected.
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

    // 11. SPA shell served for / and /view/... when dist exists.
    for (const route of ['/', '/view/README.md']) {
      const res = await fetch(base + route);
      const body = await res.text();
      check(`SPA shell at ${route}`, res.ok && body.includes('<div id="root">'));
    }

    // 12. SSE live reload: adding a file pushes a new tree.
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

    // 13. Non-git folder: inspector endpoints degrade gracefully.
    const repoRes = await fetch(`${base}/api/repo`);
    const repo = await repoRes.json();
    check('/api/repo reports no git outside a repository', repoRes.ok && repo.git === false && repo.branch === null, JSON.stringify(repo));

    const histRes = await fetch(`${base}/api/history?p=${encodeURIComponent('README.md')}`);
    const hist = await histRes.json();
    check('/api/history reports git:false outside a repository', histRes.ok && hist.git === false && hist.commits.length === 0, JSON.stringify(hist));

    const metaRes = await fetch(`${base}/api/meta?p=${encodeURIComponent('README.md')}`);
    const meta = await metaRes.json();
    check(
      '/api/meta returns fs facts with no lastCommit outside a repository',
      metaRes.ok && meta.lastCommit === null && meta.kind === 'md' && meta.words === 3 && meta.size > 0,
      JSON.stringify(meta).slice(0, 120)
    );
  } finally {
    await app.close();
  }
} catch (err) {
  check('server starts and tests run', false, err.message);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

// --- Git history / inspector endpoints -------------------------------------
//
// Builds a real repository with two authors, a rename, a delete, a binary
// file, and an untracked file — then serves it (and a subdirectory of it).

if (!gitAvailable) {
  console.log('  - git not found — skipping history tests');
} else {
  const gitFixture = mkdtempSync(path.join(tmpdir(), 'readingroom-git-'));
  const git = (args) => execFileSync('git', args, { cwd: gitFixture, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  try {
    git(['init']);
    git(['config', 'user.name', 'Alice Author']);
    git(['config', 'user.email', 'alice@example.com']);
    const commit = (message, author) => {
      const authorArgs = author
        ? ['-c', `user.name=${author}`, '-c', `user.email=${author.toLowerCase().replace(/\s+/g, '.')}@example.com`]
        : [];
      git([...authorArgs, '-c', 'commit.gpgsign=false', 'commit', '-m', message]);
    };

    writeIn(gitFixture, 'doc.md', 'original content\n');
    git(['add', 'doc.md']);
    commit('add doc');
    writeIn(gitFixture, 'doc.md', 'second draft\n');
    git(['add', 'doc.md']);
    commit('edit doc');
    git(['mv', 'doc.md', 'guide.md']);
    commit('rename doc');
    writeIn(gitFixture, 'guide.md', 'final draft\n');
    git(['add', 'guide.md']);
    commit('polish guide', 'Bob Beta');
    writeIn(gitFixture, 'temp.md', 'temporary\n');
    git(['add', 'temp.md']);
    commit('add temp');
    git(['rm', '-q', 'temp.md']);
    commit('remove temp');
    writeIn(gitFixture, 'pic.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    git(['add', 'pic.png']);
    commit('add pic');
    writeIn(gitFixture, 'untracked.md', 'never committed\n');
    writeIn(gitFixture, 'packages/docs/sub.md', '# Sub\n');
    git(['add', 'packages/docs/sub.md']);
    commit('add sub');

    const shaBySubject = Object.fromEntries(
      git(['log', '--all', '--format=%H %s'])
        .trim()
        .split('\n')
        .map((line) => [line.slice(41), line.slice(0, 40)]),
    );

    const gapp = await startServer({ root: gitFixture, port: 0, distDir: path.resolve('dist'), openFile: async () => true });
    try {
      const gbase = gapp.url;

      const grepoRes = await fetch(`${gbase}/api/repo`);
      const grepo = await grepoRes.json();
      check('/api/repo detects the repository and branch', grepoRes.ok && grepo.git === true && typeof grepo.branch === 'string' && grepo.branch.length > 0, JSON.stringify(grepo));

      const ghistRes = await fetch(`${gbase}/api/history?p=${encodeURIComponent('guide.md')}`);
      const ghist = await ghistRes.json();
      const subjects = ghist.commits.map((c) => c.subject);
      check(
        'history lists the file commits newest-first, following the rename',
        ghistRes.ok && ghist.git === true && JSON.stringify(subjects) === JSON.stringify(['polish guide', 'rename doc', 'edit doc', 'add doc']),
        JSON.stringify(subjects)
      );
      check(
        'history entries carry the file path at each commit',
        ghist.commits[0].path === 'guide.md' && ghist.commits[1].path === 'guide.md' && ghist.commits[2].path === 'doc.md' && ghist.commits[3].path === 'doc.md',
        JSON.stringify(ghist.commits.map((c) => c.path))
      );
      check('rename commit is marked R', ghist.commits[1].status === 'R' && ghist.commits[2].status === 'M', `${ghist.commits[1].status}/${ghist.commits[2].status}`);
      check('history reports per-commit authors', ghist.commits[0].author === 'Bob Beta' && ghist.commits[2].author === 'Alice Author', `${ghist.commits[0].author}/${ghist.commits[2].author}`);

      const v1 = await (await fetch(`${gbase}/api/version?p=${encodeURIComponent('guide.md')}&ref=${shaBySubject['add doc']}`)).json();
      check('version resolves content across a rename', v1.content === 'original content\n' && v1.author === 'Alice Author' && v1.binary === false && v1.deleted === false, JSON.stringify(v1).slice(0, 120));
      const v2 = await (await fetch(`${gbase}/api/version?p=${encodeURIComponent('guide.md')}&ref=${shaBySubject['edit doc']}`)).json();
      check('version resolves an intermediate commit', v2.content === 'second draft\n');

      const thist = await (await fetch(`${gbase}/api/history?p=${encodeURIComponent('temp.md')}`)).json();
      check('deletion commit appears with status D', thist.commits.length === 2 && thist.commits[0].status === 'D' && thist.commits[0].subject === 'remove temp', JSON.stringify(thist.commits.map((c) => c.subject)));
      const vdel = await (await fetch(`${gbase}/api/version?p=${encodeURIComponent('temp.md')}&ref=${shaBySubject['remove temp']}`)).json();
      check('deleted commit shows the parent version', vdel.content === 'temporary\n' && vdel.deleted === true);

      const badRef = await fetch(`${gbase}/api/version?p=guide.md&ref=HEAD`);
      check('version rejects non-sha refs', badRef.status === 400, `status=${badRef.status}`);
      const travRef = await fetch(`${gbase}/api/version?p=../../etc/passwd&ref=0123456`);
      check('version rejects traversal paths', travRef.status === 403, `status=${travRef.status}`);
      const missingRef = await fetch(`${gbase}/api/version?p=guide.md&ref=${'0'.repeat(40)}`);
      check('version 404s for unknown refs', missingRef.status === 404, `status=${missingRef.status}`);

      const gmeta = await (await fetch(`${gbase}/api/meta?p=${encodeURIComponent('guide.md')}`)).json();
      check(
        '/api/meta reports last commit + reading stats',
        gmeta.lastCommit && gmeta.lastCommit.subject === 'polish guide' && gmeta.lastCommit.author === 'Bob Beta' && gmeta.lastCommit.abbrev && gmeta.words === 2 && gmeta.kind === 'md',
        JSON.stringify(gmeta).slice(0, 160)
      );
      const umeta = await (await fetch(`${gbase}/api/meta?p=${encodeURIComponent('untracked.md')}`)).json();
      check('/api/meta reports untracked files without lastCommit', umeta.lastCommit === null && umeta.words === 2);
      const uhist = await (await fetch(`${gbase}/api/history?p=${encodeURIComponent('untracked.md')}`)).json();
      check('/api/history is empty for untracked files', uhist.commits.length === 0);

      const prawRes = await fetch(`${gbase}/api/version?p=pic.png&ref=${shaBySubject['add pic']}&raw=1`);
      const prawBuf = Buffer.from(await prawRes.arrayBuffer());
      check(
        'raw version serves blob bytes with image MIME + CSP sandbox',
        prawRes.ok && prawRes.headers.get('content-type') === 'image/png' && prawRes.headers.get('content-security-policy') === 'sandbox' && prawBuf.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
        `ct=${prawRes.headers.get('content-type')}`
      );
      const pjson = await (await fetch(`${gbase}/api/version?p=pic.png&ref=${shaBySubject['add pic']}`)).json();
      check('json version of a binary has null content but keeps meta', pjson.binary === true && pjson.content === null && pjson.subject === 'add pic');
    } finally {
      await gapp.close();
    }

    // Serving a subdirectory inside the repo: paths must translate to
    // repo-relative before hitting git.
    const subApp = await startServer({ root: path.join(gitFixture, 'packages/docs'), port: 0, distDir: path.resolve('dist'), openFile: async () => true });
    try {
      const sbase = subApp.url;
      const srepo = await (await fetch(`${sbase}/api/repo`)).json();
      const shist = await (await fetch(`${sbase}/api/history?p=sub.md`)).json();
      check(
        'repo subdirectory: history resolves via repo-relative paths',
        srepo.git === true && shist.commits.length === 1 && shist.commits[0].subject === 'add sub',
        JSON.stringify(shist.commits.map((c) => c.subject))
      );
      const smeta = await (await fetch(`${sbase}/api/meta?p=sub.md`)).json();
      check('repo subdirectory: meta finds last commit', smeta.lastCommit && smeta.lastCommit.subject === 'add sub');
    } finally {
      await subApp.close();
    }
  } catch (err) {
    check('git fixture tests run', false, err.message);
  } finally {
    rmSync(gitFixture, { recursive: true, force: true });
  }
}

failures = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
