const TYPES = [
  { id: 'md', label: 'Markdown', color: 'bg-sky-500' },
  { id: 'txt', label: 'Text', color: 'bg-emerald-500' },
  { id: 'img', label: 'Images', color: 'bg-amber-500' },
  { id: 'pdf', label: 'PDF', color: 'bg-rose-500' },
  { id: 'other', label: 'Other', color: 'bg-violet-500' },
];

export default function FileTypesWidget({ byKind }) {
  const total = TYPES.reduce((sum, type) => sum + (byKind[type.id] || 0), 0);

  return (
    <section className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40" aria-labelledby="dashboard-types-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="dashboard-types-heading" className="font-medium text-neutral-900 dark:text-neutral-100">File types</h2>
          <p className="mt-1 text-xs text-neutral-400">What the non-ignored collection contains</p>
        </div>
        <span className="text-sm tabular-nums text-neutral-400">{total.toLocaleString()}</span>
      </div>
      {total === 0 ? (
        <p className="mt-6 text-sm text-neutral-400">No non-ignored files yet.</p>
      ) : (
        <div className="mt-5 space-y-4">
          {TYPES.map((type) => {
            const count = byKind[type.id] || 0;
            const percentage = (count / total) * 100;
            return (
              <div key={type.id} aria-label={`${type.label}: ${count} files`}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-neutral-600 dark:text-neutral-300">{type.label}</span>
                  <span className="tabular-nums text-neutral-400">{count.toLocaleString()}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div className={`h-full rounded-full ${type.color}`} style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
