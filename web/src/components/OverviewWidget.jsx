import { formatBytes } from '../format';

function StatCard({ label, value, detail }) {
  return (
    <article className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40">
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">{value}</p>
      <p className="mt-1 text-xs text-neutral-400">{detail}</p>
    </article>
  );
}

export default function OverviewWidget({ fileCount, directoryCount, totalBytes }) {
  return (
    <section aria-labelledby="dashboard-overview-heading">
      <h2 id="dashboard-overview-heading" className="sr-only">Overview</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Files" value={fileCount.toLocaleString()} detail="All non-ignored files" />
        <StatCard label="Directories" value={directoryCount.toLocaleString()} detail="Folders containing non-ignored files" />
        <StatCard label="Total size" value={formatBytes(totalBytes)} detail="Combined size of non-ignored files" />
      </div>
    </section>
  );
}
