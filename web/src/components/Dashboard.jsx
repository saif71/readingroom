import { useMemo } from "react";
import FileTypesWidget from "./FileTypesWidget";
import OverviewWidget from "./OverviewWidget";
import RankedFilesWidget from "./RankedFilesWidget";
import QRWidget from "./QRWidget";

const CATEGORIES = [
  "markdown",
  "images",
  "pdfs",
  "text",
  "json",
  "code",
  "other",
];

function fallbackDashboard(tree) {
  const files = [];
  let directoryCount = 0;
  function walk(node) {
    for (const child of node.children || []) {
      if (child.type === "file") files.push(child);
      else {
        directoryCount += 1;
        walk(child);
      }
    }
  }
  walk(tree);

  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category, 0]),
  );
  let totalBytes = 0;
  const rows = files.map((file) => {
    const category = file.category || "other";
    byCategory[category] = (byCategory[category] || 0) + 1;
    totalBytes += file.size;
    const updatedAt = new Date(file.mtime).toISOString();
    return {
      path: file.path,
      name: file.name,
      kind: file.kind,
      category,
      size: file.size,
      updatedAt,
      updatedSource: "filesystem",
    };
  });

  return {
    fileCount: files.length,
    directoryCount,
    totalBytes,
    byCategory,
    gitAvailable: false,
    recent: [...rows]
      .sort(
        (a, b) =>
          new Date(b.updatedAt) - new Date(a.updatedAt) ||
          a.path.localeCompare(b.path),
      )
      .slice(0, 10),
    oldest: [...rows]
      .sort(
        (a, b) =>
          new Date(a.updatedAt) - new Date(b.updatedAt) ||
          a.path.localeCompare(b.path),
      )
      .slice(0, 10),
  };
}

function timestampSummary(data) {
  const gitCount = data.recent.filter(
    (file) => file.updatedSource === "git",
  ).length;
  if (gitCount === 0) return "";
  return "";
}

export default function Dashboard({ tree, data, error, loading, onOpen }) {
  const fallback = useMemo(() => fallbackDashboard(tree), [tree]);
  const model = data || fallback;
  const errorMessage = error
    ? "Full inventory unavailable; showing previewable-file fallback."
    : timestampSummary(model);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            {tree.name} overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
            All non-ignored files — .gitignore rules and dependency/build
            folders are excluded.
          </p>
        </div>
        <p
          className="text-xs text-neutral-400"
          title={loading ? "Refreshing dashboard data" : undefined}
        >
          {loading ? "Updating…" : errorMessage}
        </p>
      </header>

      {!data && loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-neutral-200/80 bg-white p-8 text-sm text-neutral-400 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40">
          Loading full project inventory…
        </div>
      ) : (
        <div className="space-y-4">
          <OverviewWidget
            fileCount={model.fileCount}
            directoryCount={model.directoryCount}
            totalBytes={model.totalBytes}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="grid-1 space-y-4">
              <FileTypesWidget byCategory={model.byCategory} />
              <RankedFilesWidget
                title="Oldest updated"
                description="Non-ignored files with the oldest filesystem modification time"
                files={model.oldest}
                emptyMessage="No non-ignored files yet."
                onOpen={onOpen}
              />
            </div>
            <div className="grid-2 space-y-4">
              <QRWidget />
              <RankedFilesWidget
                title="Recently updated"
                description="Latest Git commit, or filesystem time when Git is unavailable"
                files={model.recent}
                emptyMessage="No files have a usable update timestamp."
                onOpen={onOpen}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
