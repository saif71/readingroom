const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg', '.ico']);
const PDF_EXTS = new Set(['.pdf']);
const MARKDOWN_EXTS = new Set(['.md', '.markdown']);
const TEXT_EXTS = new Set(['.txt', '.text', '.log']);
const JSON_EXTS = new Set(['.json', '.jsonc']);
const CODE_EXTS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.css', '.go', '.h', '.hpp', '.html', '.htm',
  '.java', '.js', '.jsx', '.mjs', '.cjs', '.kt', '.kts', '.lua', '.php',
  '.py', '.rb', '.rs', '.sh', '.sql', '.swift', '.ts', '.tsx', '.vue',
  '.xml', '.xhtml', '.yaml', '.yml', '.toml', '.ini', '.conf', '.env',
]);
const CODE_NAMES = new Set(['dockerfile', 'makefile', 'justfile']);

function extensionOf(p) {
  const dot = p.lastIndexOf('.');
  return dot === -1 ? '' : p.slice(dot).toLowerCase();
}

export function isImagePath(p) {
  return IMAGE_EXTS.has(extensionOf(p));
}

export function isPdfPath(p) {
  return PDF_EXTS.has(extensionOf(p));
}

export function isTextPath(p) {
  const category = fileCategoryForPath(p);
  return category === 'markdown' || category === 'text';
}

export function fileCategoryForPath(p) {
  const ext = extensionOf(p);
  const name = p.split('/').pop().toLowerCase();
  if (MARKDOWN_EXTS.has(ext)) return 'markdown';
  if (IMAGE_EXTS.has(ext)) return 'images';
  if (PDF_EXTS.has(ext)) return 'pdfs';
  if (TEXT_EXTS.has(ext)) return 'text';
  if (JSON_EXTS.has(ext)) return 'json';
  if (CODE_EXTS.has(ext) || CODE_NAMES.has(name)) return 'code';
  return 'unknown';
}

export async function openInSystemApp(path) {
  const res = await fetch(`/api/open?p=${encodeURIComponent(path)}`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `failed to open ${path}`);
  return body;
}

export async function fetchTree() {
  const res = await fetch('/api/tree');
  if (!res.ok) throw new Error('failed to load file tree');
  return res.json();
}

export async function fetchDashboard() {
  const res = await fetch('/api/dashboard');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'failed to load dashboard');
  return body;
}

export async function fetchFile(path) {
  const res = await fetch(`/api/file?p=${encodeURIComponent(path)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `failed to load ${path}`);
  return body;
}

export async function fetchRepo() {
  const res = await fetch('/api/repo');
  if (!res.ok) throw new Error('failed to load repository info');
  return res.json();
}

export async function fetchMeta(path) {
  const res = await fetch(`/api/meta?p=${encodeURIComponent(path)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `failed to load metadata for ${path}`);
  return body;
}

export async function fetchHistory(path) {
  const res = await fetch(`/api/history?p=${encodeURIComponent(path)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `failed to load history for ${path}`);
  return body;
}

export async function fetchVersion(path, ref) {
  const res = await fetch(`/api/version?p=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `failed to load a version of ${path}`);
  return body;
}

export function versionRawUrl(path, ref) {
  return `/api/version?p=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}&raw=1`;
}

export function rawUrl(path) {
  return `/api/raw?p=${encodeURIComponent(path)}`;
}

export function downloadUrl(path) {
  return `${rawUrl(path)}&download=1`;
}

export function versionDownloadUrl(path, ref) {
  return `${versionRawUrl(path, ref)}&download=1`;
}

export function viewUrl(path) {
  return '/view/' + path.split('/').map(encodeURIComponent).join('/');
}

export function versionUrl(path, ref) {
  return viewUrl(path) + `?ref=${encodeURIComponent(ref)}`;
}

export function pathFromViewUrl(pathname) {
  const m = pathname.match(/^\/view\/(.+?)\/?$/);
  if (!m) return null;
  try {
    return m[1].split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}

export async function fetchMobileStatus() {
  const res = await fetch('/api/mobile');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'failed to load phone-access status');
  return body;
}

export async function setMobileLan(enabled) {
  const res = await fetch('/api/mobile/lan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'failed to toggle phone access');
  return body;
}

export async function setMobileTunnel(enabled) {
  const res = await fetch('/api/mobile/tunnel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'failed to toggle the tunnel');
  return body;
}

export function subscribeTree(onTree) {
  const es = new EventSource('/api/events');
  es.addEventListener('tree', (e) => {
    try {
      onTree(JSON.parse(e.data));
    } catch {
      /* malformed event — ignore */
    }
  });
  return () => es.close();
}
