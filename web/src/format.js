/** Shared display formatting for the inspector and viewer banner. */

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatDate(iso) {
  if (!iso) return 'unknown date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown date';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return 'unknown date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown date';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => [...p][0]?.toUpperCase() || '').join('') || '?';
}

const AVATAR_COLORS = [
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
];

/** Stable avatar color per author name. */
export function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
