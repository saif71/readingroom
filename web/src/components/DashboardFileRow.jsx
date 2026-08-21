import { formatDateTime, timeAgo } from '../format';

const CATEGORY_LABELS = { markdown: 'Markdown', text: 'Text', images: 'Image', pdfs: 'PDF', json: 'JSON', code: 'Code', other: 'Other' };
const CATEGORY_BADGES = { markdown: 'md', text: 'txt', images: 'img', pdfs: 'pdf', json: '{}', code: '</>', other: '?' };

export default function DashboardFileRow({ file, onOpen }) {
  const exactTime = formatDateTime(file.updatedAt);
  const source = file.updatedSource === 'git' ? 'Git' : 'filesystem';
  const label = `${file.path}. Updated ${exactTime} from ${source}.`;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(file.path)}
        title={`${file.path} — ${exactTime} (${source})`}
        aria-label={`Open ${label}`}
        className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 dark:hover:bg-neutral-800/70"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[9px] font-semibold uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {CATEGORY_BADGES[file.category] || file.kind}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-800 group-hover:text-sky-700 dark:text-neutral-200 dark:group-hover:text-sky-300">
            {file.name}
          </span>
          <span className="block truncate text-xs text-neutral-400">{file.path}</span>
        </span>
        <span className="shrink-0 text-right text-xs text-neutral-400" title={exactTime}>
          <span className="block">{timeAgo(file.updatedAt) || 'unknown'}</span>
          <span className="block text-[10px]">{CATEGORY_LABELS[file.category] || file.category || 'Other'}</span>
        </span>
      </button>
    </li>
  );
}
