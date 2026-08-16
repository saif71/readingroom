const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg']);
const PDF_EXTS = new Set(['.pdf']);

export function isImagePath(p) {
  const dot = p.lastIndexOf('.');
  return dot !== -1 && IMAGE_EXTS.has(p.slice(dot).toLowerCase());
}

export function isPdfPath(p) {
  const dot = p.lastIndexOf('.');
  return dot !== -1 && PDF_EXTS.has(p.slice(dot).toLowerCase());
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
