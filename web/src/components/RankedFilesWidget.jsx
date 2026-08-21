import DashboardFileRow from './DashboardFileRow';

export default function RankedFilesWidget({ title, description, files, emptyMessage, onOpen }) {
  return (
    <section className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40" aria-labelledby={`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`} className="font-medium text-neutral-900 dark:text-neutral-100">{title}</h2>
          <p className="mt-1 text-xs text-neutral-400">{description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">Top 10</span>
      </div>
      {files.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-400">{emptyMessage}</p>
      ) : (
        <ol className="mt-4 space-y-0.5">
          {files.map((file) => <DashboardFileRow key={file.path} file={file} onOpen={onOpen} />)}
        </ol>
      )}
    </section>
  );
}
