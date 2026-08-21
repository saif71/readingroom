import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../src/server.js';
import { scanAllTree } from '../src/scanner.js';
import { qrEncode, rsSyndromes, MAX_INPUT_BYTES } from '../web/src/vendor/qr.js';
import { parseTunnelUrl, untarSingleFile } from '../src/tunnel.js';

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
write('notas-日本語.md', 'notas en japonés\n');
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
write('script.js', 'console.log("hello");\n');
write('config.json', '{"name":"readingroom"}\n');
write('blob.bin', Buffer.from([0x00, 0x01, 0x02, 0xff, 0xd8]));
mkdirSync(path.join(fixture, 'empty'));
symlinkSync(path.join(fixture, 'README.md'), path.join(fixture, 'link.md'));

const EXPECTED = [
  '.github/workflows/ci.md',
  '.gitignore',
  'NOTES.MD',
  'README.md',
  'big.md',
  'blob.bin',
  'config.json',
  'doc.pdf',
  'docs/api.txt',
  'docs/guide.md',
  'img.png',
  'logo.svg',
  'nested/keep.md',
  'nested/.gitignore',
  'notas-日本語.md',
  'photo.JPG',
  'pic.webp',
  'script.js',
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
    // 1. Tree contains every non-ignored file, including source/config/binary files.
    const paths = flattenTree(app.tree()).map((node) => node.path).sort();
    check('tree lists exactly the expected files', JSON.stringify(paths) === JSON.stringify([...EXPECTED].sort()), JSON.stringify(paths));

    // 2. /api/tree endpoint matches, with per-file kinds and categories.
    const treeRes = await fetch(`${base}/api/tree`);
    const tree = await treeRes.json();
    const kindByPath = Object.fromEntries(flattenTree(tree).map((node) => [node.path, node.kind]));
    const categoryByPath = Object.fromEntries(flattenTree(tree).map((node) => [node.path, node.category]));
    check(
      '/api/tree responds with the tree',
      treeRes.ok &&
        tree.count === EXPECTED.length &&
        kindByPath['README.md'] === 'md' &&
        kindByPath['docs/api.txt'] === 'txt' &&
        kindByPath['img.png'] === 'img' &&
        kindByPath['logo.svg'] === 'img' &&
        kindByPath['doc.pdf'] === 'pdf' &&
        categoryByPath['config.json'] === 'json' &&
        categoryByPath['script.js'] === 'code' &&
        categoryByPath['blob.bin'] === 'other',
      `count=${tree.count}`
    );
    const codeFiles = flattenTree(tree).filter((node) => node.category === 'code');
    const jsonFiles = flattenTree(tree).filter((node) => node.category === 'json');
    check(
      'file categories filter the complete tree for chips',
      codeFiles.some((node) => node.path === 'script.js') &&
        codeFiles.every((node) => node.category === 'code') &&
        jsonFiles.some((node) => node.path === 'config.json') &&
        jsonFiles.every((node) => node.category === 'json'),
      JSON.stringify({ code: codeFiles.map((node) => node.path), json: jsonFiles.map((node) => node.path) })
    );

    // 2b. Dashboard aggregates the full non-ignored inventory and degrades outside Git.
    const dashboardRes = await fetch(`${base}/api/dashboard`);
    const dashboard = await dashboardRes.json();
    const inventory = scanAllTree(fixture);
    const inventoryFiles = flattenTree(inventory);
    const inventorySize = inventoryFiles.reduce((sum, node) => sum + node.size, 0);
    const surfacedSize = flattenTree(tree).reduce((sum, node) => sum + node.size, 0);
    check(
      '/api/dashboard returns all non-ignored counts and size',
      dashboardRes.ok &&
        dashboard.fileCount === inventoryFiles.length &&
        dashboard.directoryCount === 4 &&
        dashboard.totalBytes === inventorySize &&
        dashboard.byCategory.markdown === 7 &&
        dashboard.byCategory.text === 3 &&
        dashboard.byCategory.images === 4 &&
        dashboard.byCategory.pdfs === 1 &&
        dashboard.byCategory.json === 1 &&
        dashboard.byCategory.code === 1 &&
        dashboard.byCategory.other === 1 &&
        dashboard.totalBytes === surfacedSize,
      JSON.stringify(dashboard)
    );
    check(
      '/api/dashboard uses filesystem dates outside Git and caps rankings',
      dashboard.gitAvailable === false &&
        dashboard.recent.length === 10 &&
        dashboard.oldest.length === 10 &&
        dashboard.recent.every((file) => file.updatedSource === 'filesystem') &&
        dashboard.oldest.every((file) => file.updatedSource === 'filesystem'),
      JSON.stringify({ recent: dashboard.recent.length, oldest: dashboard.oldest.length })
    );

    // 3. File content.
    const fileRes = await fetch(`${base}/api/file?p=${encodeURIComponent('README.md')}`);
    const file = await fileRes.json();
    check('/api/file returns md content', fileRes.ok && file.content === '# Hello\n\nworld\n' && file.kind === 'md');

    const txtRes = await fetch(`${base}/api/file?p=${encodeURIComponent('docs/api.txt')}`);
    const txt = await txtRes.json();
    check('/api/file returns txt kind', txtRes.ok && txt.kind === 'txt');

    // 4. Large text files are listed but previews are capped server-side.
    const bigRes = await fetch(`${base}/api/file?p=big.md`);
    const big = await bigRes.json();
    check('large text preview is capped and marked truncated', bigRes.ok && big.truncated === true && big.content.length === 2 * 1024 * 1024, `length=${big.content?.length}`);

    // 5. Non-text files remain visible but return download-only metadata.
    const pngMetaRes = await fetch(`${base}/api/file?p=img.png`);
    const pdfMetaRes = await fetch(`${base}/api/file?p=doc.pdf`);
    const binaryMetaRes = await fetch(`${base}/api/file?p=blob.bin`);
    const pngMeta = await pngMetaRes.json();
    const pdfMeta = await pdfMetaRes.json();
    const binaryMeta = await binaryMetaRes.json();
    check('binary and media files return download-only metadata', pngMetaRes.ok && pdfMetaRes.ok && binaryMetaRes.ok && pngMeta.previewable === false && pdfMeta.previewable === false && binaryMeta.previewable === false && binaryMeta.category === 'other');

    const jsonRes = await fetch(`${base}/api/file?p=config.json`);
    const jsonFile = await jsonRes.json();
    check('JSON files return previewable text content', jsonRes.ok && jsonFile.previewable === true && jsonFile.category === 'json' && jsonFile.content.includes('readingroom'));

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
        rawRes.headers.get('x-content-type-options') === 'nosniff' &&
        rawRes.headers.get('content-disposition') === null,
      `ct=${rawRes.headers.get('content-type')}`
    );

    // 7b. download=1 switches the raw response to an attachment download.
    const dlRes = await fetch(`${base}/api/raw?p=${encodeURIComponent('README.md')}&download=1`);
    check(
      'download=1 sets attachment content-disposition',
      dlRes.ok &&
        dlRes.headers.get('content-disposition') === `attachment; filename="README.md"; filename*=UTF-8''README.md`,
      `cd=${dlRes.headers.get('content-disposition')}`
    );

    const uniDlRes = await fetch(`${base}/api/raw?p=${encodeURIComponent('notas-日本語.md')}&download=1`);
    const uniCd = uniDlRes.headers.get('content-disposition') || '';
    check(
      'unicode filenames keep their name via RFC 5987',
      uniDlRes.ok && uniCd.includes('filename="notas-___.md"') && uniCd.includes(`filename*=UTF-8''notas-`),
      `cd=${uniCd}`
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
    const refreshedDashboard = await (await fetch(`${base}/api/dashboard`)).json();
    check(
      'dashboard cache refreshes with the live tree',
      refreshedDashboard.fileCount === inventoryFiles.length + 1 && refreshedDashboard.recent.some((file) => file.path === 'docs/new.md'),
      JSON.stringify(refreshedDashboard.recent)
    );
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

      const guideCommitDate = git(['log', '-n', '1', '--format=%aI', '--', 'guide.md']).trim();
      const gdash = await (await fetch(`${gbase}/api/dashboard`)).json();
      const guideRecent = gdash.recent.find((file) => file.path === 'guide.md');
      const untrackedRecent = gdash.recent.find((file) => file.path === 'untracked.md');
      check(
        '/api/dashboard uses Git dates for tracked files and filesystem fallback for untracked files',
        gdash.gitAvailable === true &&
          gdash.fileCount === 4 &&
          gdash.directoryCount === 2 &&
          gdash.byCategory.markdown === 3 &&
          gdash.byCategory.images === 1 &&
          guideRecent?.updatedSource === 'git' &&
          guideRecent.updatedAt === guideCommitDate &&
          untrackedRecent?.updatedSource === 'filesystem',
        JSON.stringify({ guideRecent, untrackedRecent, gdash })
      );

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

      const vdlRes = await fetch(`${gbase}/api/version?p=${encodeURIComponent('guide.md')}&ref=${shaBySubject['add doc']}&raw=1&download=1`);
      check(
        'version download uses the rename-aware historical filename',
        vdlRes.ok && (vdlRes.headers.get('content-disposition') || '').includes('filename="doc.md"'),
        `cd=${vdlRes.headers.get('content-disposition')}`
      );
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
      const sdash = await (await fetch(`${sbase}/api/dashboard`)).json();
      check(
        'repo subdirectory: dashboard maps Git paths correctly',
        sdash.fileCount === 1 && sdash.directoryCount === 0 && sdash.recent[0]?.path === 'sub.md' && sdash.recent[0]?.updatedSource === 'git',
        JSON.stringify(sdash)
      );
    } finally {
      await subApp.close();
    }
  } catch (err) {
    check('git fixture tests run', false, err.message);
  } finally {
    rmSync(gitFixture, { recursive: true, force: true });
  }
}

// --- AI agent instructions + skills on the dashboard ------------------------

try {
  const aiFixture = mkdtempSync(path.join(tmpdir(), 'readingroom-ai-'));
  writeIn(aiFixture, 'CLAUDE.md', '# Claude rules\n');
  writeIn(aiFixture, 'AGENTS.md', '# Agent rules\n');
  writeIn(aiFixture, 'GEMINI.md', '# Gemini rules\n');
  writeIn(aiFixture, '.cursorrules', 'cursor legacy rules\n');
  writeIn(aiFixture, '.cursor/rules/testing.mdc', 'cursor modern rule\n');
  writeIn(aiFixture, '.github/copilot-instructions.md', 'copilot rules\n');
  writeIn(aiFixture, 'packages/app/AGENTS.md', '# Nested agent rules\n');
  writeIn(aiFixture, 'docs/random.md', 'just a regular doc\n');
  writeIn(aiFixture, 'docs/SKILL.md', 'skill-like file outside skills dirs\n');
  writeIn(aiFixture, '.claude/skills/pdf-report/SKILL.md', '---\nname: pdf-report\ndescription: Generate polished PDF reports\n---\n\n# PDF report skill\n');
  writeIn(aiFixture, '.agents/skills/expo-tailwind-setup/SKILL.md', '---\nname: expo-tailwind-setup\ndescription: >\n  Set up Tailwind CSS v4 in Expo\n  with NativeWind.\n---\n\n# Expo setup\n');
  writeIn(aiFixture, '.agents/skills/no-frontmatter/SKILL.md', '# Skill without frontmatter\n');
  writeIn(aiFixture, '.claude/skills/broken/SKILL.md', 'unreadable is fine too\n');

  const aapp = await startServer({ root: aiFixture, port: 0, distDir: path.resolve('dist'), openFile: async () => true });
  try {
    const abase = aapp.url;
    const dash = await (await fetch(`${abase}/api/dashboard`)).json();

    const instrPaths = dash.agentInstructions.map((file) => file.path);
    check(
      '/api/dashboard lists agent instruction files root-first',
      JSON.stringify(instrPaths) ===
        JSON.stringify([
          '.cursorrules',
          'AGENTS.md',
          'CLAUDE.md',
          'GEMINI.md',
          '.github/copilot-instructions.md',
          '.cursor/rules/testing.mdc',
          'packages/app/AGENTS.md',
        ]) &&
        dash.agentInstructions.every((file) => file.updatedSource === 'filesystem' && file.updatedAt),
      JSON.stringify(instrPaths),
    );

    const bySkillName = Object.fromEntries(dash.skills.map((skill) => [skill.name, skill]));
    check(
      '/api/dashboard lists skills with parsed frontmatter descriptions',
      Object.keys(bySkillName).sort().join(',') === 'broken,expo-tailwind-setup,no-frontmatter,pdf-report' &&
        bySkillName['pdf-report'].sourceDir === '.claude' &&
        bySkillName['pdf-report'].description === 'Generate polished PDF reports' &&
        bySkillName['pdf-report'].path === '.claude/skills/pdf-report/SKILL.md' &&
        bySkillName['expo-tailwind-setup'].sourceDir === '.agents' &&
        bySkillName['expo-tailwind-setup'].description === 'Set up Tailwind CSS v4 in Expo with NativeWind.' &&
        bySkillName['no-frontmatter'].description === null &&
        bySkillName['broken'].description === null,
      JSON.stringify(dash.skills),
    );

    check(
      'skill-like files outside skills directories are not skills',
      !dash.skills.some((skill) => skill.path === 'docs/SKILL.md') && !dash.agentInstructions.some((file) => file.path === 'docs/random.md'),
      JSON.stringify({ skills: dash.skills.map((s) => s.path), instr: instrPaths }),
    );
  } finally {
    await aapp.close();
  }
  rmSync(aiFixture, { recursive: true, force: true });
} catch (err) {
  check('ai dashboard tests run', false, err.message);
}

// --- QR encoder ------------------------------------------------------------

try {
  const sample = 'http://192.168.1.42:9346/pair?t=A3fK9xQ2mB7wE5rT1yU8i';
  const qr = qrEncode(sample);
  check('qr picks the expected version for a LAN pair URL', qr.version === 4 && qr.size === 33, `v${qr.version} ${qr.size}x${qr.size}`);

  const tiny = qrEncode('hello world');
  check('qr picks v1 for a short input', tiny.version === 1 && tiny.size === 21, `v${tiny.version}`);

  const maxPrefix = 'https://x.trycloudflare.com/pair?t=';
  const maxText = maxPrefix + 'a'.repeat(MAX_INPUT_BYTES - maxPrefix.length);
  check('qr max-capacity input is accepted at v7', qrEncode(maxText).version === 7);
  let overflows = false;
  try {
    qrEncode(maxText + 'x');
  } catch {
    overflows = true;
  }
  check('qr rejects input beyond capacity', overflows && MAX_INPUT_BYTES === 122);

  // Finder pattern: dark 3x3 core, light ring, dark border (dist ≤ 3).
  const finderOk = (m, cx, cy) => {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (m[cy + dy][cx + dx] !== (dist !== 2)) return false;
      }
    }
    return true;
  };
  check(
    'qr matrix has the three finder patterns',
    finderOk(qr.matrix, 3, 3) && finderOk(qr.matrix, qr.size - 4, 3) && finderOk(qr.matrix, 3, qr.size - 4),
  );

  // Every data+ecc block must be a valid Reed–Solomon codeword (zero syndromes).
  const syndromesOk = ['a', 'http://192.168.1.5:9346/pair?t=abc', sample, maxText].every((text) => {
    const { blocks } = qrEncode(text);
    return blocks.every(({ data, ecc }) => rsSyndromes([...data, ...ecc], ecc.length).every((s) => s === 0));
  });
  check('qr blocks satisfy Reed–Solomon (zero syndromes)', syndromesOk);

  // Deterministic output for identical input.
  check('qr is deterministic', JSON.stringify(qrEncode(sample).matrix) === JSON.stringify(qr.matrix));
} catch (err) {
  check('qr encoder tests run', false, err.message);
}

// --- Tunnel helpers ----------------------------------------------------------

try {
  check(
    'parseTunnelUrl extracts the quick-tunnel URL from log noise',
    parseTunnelUrl('2026/08/20 INF |  https://few-random-words.trycloudflare.com  |\nmore noise') === 'https://few-random-words.trycloudflare.com',
  );
  check('parseTunnelUrl ignores unrelated URLs', parseTunnelUrl('see https://example.com for details') === null);

  // Minimal tar with one regular file "cloudflared" containing 4 bytes.
  const header = Buffer.alloc(512);
  header.write('cloudflared', 0, 'utf8');
  header.write('00000000004', 124, 'utf8'); // octal size
  header[156] = 0x30; // type '0' regular file
  const content = Buffer.concat([header, Buffer.from('abcd'), Buffer.alloc(512 - 4), Buffer.alloc(1024)]);
  check('untarSingleFile extracts the regular file', untarSingleFile(content).toString('utf8') === 'abcd');
} catch (err) {
  check('tunnel helper tests run', false, err.message);
}

// --- Phone access (LAN listener + pairing) -----------------------------------

try {
  const mobileFixture = mkdtempSync(path.join(tmpdir(), 'readingroom-mobile-'));
  writeIn(mobileFixture, 'secret.md', '# Private\n');
  const mapp = await startServer({
    root: mobileFixture,
    port: 0,
    mobilePort: 0,
    distDir: path.resolve('dist'),
    openFile: async () => true,
  });
  try {
    const mbase = mapp.url;

    // Loopback control API: initial status.
    const st0 = await (await fetch(`${mbase}/api/mobile`)).json();
    check(
      'mobile status starts disabled with a token',
      st0.lan.enabled === false && typeof st0.token === 'string' && st0.token.length >= 20 && st0.tunnel.state === 'off',
      JSON.stringify(st0).slice(0, 120),
    );

    await mapp.mobile.enableLan();
    const st1 = mapp.mobile.status();
    const mport = st1.lan.port;
    check(
      'enabling lan reports pair urls for each local address',
      st1.lan.enabled === true && st1.lan.urls.length >= 1 && st1.lan.urls.every((u) => u.endsWith(`/pair?t=${st1.token}`)),
      JSON.stringify(st1.lan),
    );

    const mobileBase = `http://127.0.0.1:${mport}`;

    // Unauthenticated access is refused — including from loopback, because
    // cloudflared also connects from loopback.
    const noCookie = await fetch(`${mobileBase}/api/tree`);
    check('mobile listener rejects requests without pairing', noCookie.status === 401, `status=${noCookie.status}`);

    const badCookie = await fetch(`${mobileBase}/api/tree`, { headers: { Cookie: 'rr_pair=guess' } });
    check('mobile listener rejects a wrong cookie', badCookie.status === 401, `status=${badCookie.status}`);

    const wrongToken = await fetch(`${mobileBase}/pair?t=wrong-token`);
    check('pairing rejects a wrong token', wrongToken.status === 403, `status=${wrongToken.status}`);

    // Correct token: redirect + session cookie, then full access.
    const pair = await fetch(`${mobileBase}/pair?t=${st1.token}`, { redirect: 'manual' });
    const setCookie = pair.headers.get('set-cookie') || '';
    const cookieValue = setCookie.split(';')[0];
    check(
      'pairing with the right token redirects and sets the cookie',
      pair.status === 302 &&
        pair.headers.get('location') === '/' &&
        cookieValue.startsWith('rr_pair=') &&
        setCookie.includes('HttpOnly') &&
        setCookie.includes('SameSite=Lax'),
      `status=${pair.status} cookie=${setCookie}`,
    );

    const paired = await fetch(`${mobileBase}/api/tree`, { headers: { Cookie: cookieValue } });
    const pairedTree = await paired.json();
    check('paired device can read the tree', paired.ok && pairedTree.count === 1, `status=${paired.status}`);

    const pairedFile = await fetch(`${mobileBase}/api/file?p=${encodeURIComponent('secret.md')}`, { headers: { Cookie: cookieValue } });
    check('paired device can read file content', pairedFile.ok && (await pairedFile.json()).content === '# Private\n');

    // Desktop-only surface: system-app opener and control API.
    const openRes = await fetch(`${mobileBase}/api/open?p=doc.pdf`, { method: 'POST', headers: { Cookie: cookieValue } });
    check('/api/open is refused on the mobile listener', openRes.status === 403, `status=${openRes.status}`);

    const ctrlRes = await fetch(`${mobileBase}/api/mobile`, { headers: { Cookie: cookieValue } });
    check('control API is loopback-only', ctrlRes.status === 403, `status=${ctrlRes.status}`);

    // Host allowlist still applies on the mobile listener.
    await new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port: mport, path: '/api/tree', headers: { Host: 'evil.com', Cookie: cookieValue } }, (res) => {
        check('forged Host header rejected on mobile listener', res.statusCode === 403, `status=${res.statusCode}`);
        res.resume();
        resolve();
      });
      req.on('error', () => {
        check('forged Host header rejected on mobile listener', false, 'request error');
        resolve();
      });
    });

    // Toggle off via the loopback API, then the listener stops answering.
    const offRes = await fetch(`${mbase}/api/mobile/lan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    const offStatus = await offRes.json();
    check('disabling lan via API reports it off', offRes.ok && offStatus.lan.enabled === false, JSON.stringify(offStatus.lan));

    let refused = false;
    try {
      await fetch(`${mobileBase}/api/tree`, { headers: { Cookie: cookieValue } });
    } catch {
      refused = true;
    }
    check('mobile listener is down after disabling', refused);
  } finally {
    await mapp.close();
  }
  rmSync(mobileFixture, { recursive: true, force: true });
} catch (err) {
  check('mobile access tests run', false, err.message);
}

// --- Phone access: tunnel and Wi-Fi sharing are independent user actions ----
//
// Starting a tunnel must NOT report Wi-Fi sharing (no surprise QR while the
// helper downloads), and stopping it must not tear down explicitly-started
// sharing. Uses a fake tunnel so no network is involved.

try {
  const FAKE_HOST = 'fake-tunnel.example.trycloudflare.com';
  const fakeTunnel = async ({ onProgress }) => {
    onProgress?.({ phase: 'downloading', bytes: 10, total: 10 });
    onProgress?.({ phase: 'starting' });
    return { url: `https://${FAKE_HOST}`, host: FAKE_HOST, stop: async () => {} };
  };
  const fixture2 = mkdtempSync(path.join(tmpdir(), 'readingroom-split-'));
  writeIn(fixture2, 'doc.md', 'split state\n');
  const app2 = await startServer({
    root: fixture2,
    port: 0,
    mobilePort: 0,
    distDir: path.resolve('dist'),
    openFile: async () => true,
    startTunnelImpl: fakeTunnel,
  });
  const waitTunnel = async (pred, label) => {
    for (let i = 0; i < 20; i++) {
      const st = app2.mobile.status();
      if (pred(st)) return st;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('timed out waiting for ' + label);
  };
  try {
    // Tunnel alone: listener runs silently, Wi-Fi sharing is NOT advertised.
    await app2.mobile.startTunnel();
    const on1 = await waitTunnel((st) => st.tunnel.state === 'on', 'tunnel on');
    check(
      'tunnel start does not advertise Wi-Fi sharing',
      on1.lan.enabled === false && on1.lan.urls.length === 0 && on1.lan.port !== null && on1.tunnel.url === `https://${FAKE_HOST}/pair?t=${on1.token}`,
      JSON.stringify({ lan: on1.lan, tunnel: on1.tunnel }),
    );

    // The tunnel hostname is allowed through and requires pairing as usual.
    const viaTunnel = await fetch(`http://127.0.0.1:${on1.lan.port}/api/tree`, { headers: { Host: FAKE_HOST } });
    check('tunnel host passes the allowlist but needs pairing', viaTunnel.status === 401, `status=${viaTunnel.status}`);
    const paired = await fetch(`http://127.0.0.1:${on1.lan.port}/pair?t=${on1.token}`, { headers: { Host: FAKE_HOST }, redirect: 'manual' });
    const cookie2 = (paired.headers.get('set-cookie') || '').split(';')[0];
    const okTree = await fetch(`http://127.0.0.1:${on1.lan.port}/api/tree`, { headers: { Host: FAKE_HOST, Cookie: cookie2 } });
    check('tunnel-host request works once paired', okTree.ok, `status=${okTree.status}`);

    // Stopping the tunnel with sharing never started: everything goes down.
    await app2.mobile.stopTunnel();
    const off1 = await waitTunnel((st) => st.tunnel.state === 'off', 'tunnel off');
    check('stopping an unshared tunnel tears the listener down', off1.tunnel.state === 'off' && off1.lan.enabled === false && off1.lan.port === null, JSON.stringify(off1.lan));

    // Both explicitly started: stopping the tunnel keeps sharing alive.
    await app2.mobile.enableLan();
    await app2.mobile.startTunnel();
    await waitTunnel((st) => st.tunnel.state === 'on', 'tunnel on again');
    await app2.mobile.stopTunnel();
    const off2 = await waitTunnel((st) => st.tunnel.state === 'off', 'tunnel off again');
    check(
      'stopping the tunnel keeps explicitly-started sharing alive',
      off2.lan.enabled === true && off2.lan.port !== null && off2.lan.urls.length >= 1,
      JSON.stringify(off2.lan),
    );

    // Stopping sharing takes the whole listener down (tunnel already off).
    await app2.mobile.disableLan();
    const off3 = app2.mobile.status();
    check('stopping sharing tears everything down', off3.lan.enabled === false && off3.lan.port === null, JSON.stringify(off3.lan));
  } finally {
    await app2.close();
  }
  rmSync(fixture2, { recursive: true, force: true });
} catch (err) {
  check('split-state tests run', false, err.message);
}

failures = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
