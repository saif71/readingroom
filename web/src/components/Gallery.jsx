import { useEffect, useMemo, useState } from "react";
import { rawUrl } from "../api";
import useMediaQuery from "../useMediaQuery";
import GalleryLightbox from "./GalleryLightbox";

// Below md (768px) side panels become overlay drawers, closed by default —
// same breakpoint and open-flag persistence as the app sidebars/inspector.
const MOBILE_QUERY = "(max-width: 767px)";
const STORAGE_KEY = "readingroom-gallery-filters-open";

function loadOpenFlag() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === null ? true : saved === "true";
}

function storeOpenFlag(open) {
  try {
    localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    /* storage unavailable — toggle is session-only */
  }
}

function imageRows(tree) {
  const rows = [];
  function walk(node) {
    for (const child of node.children || []) {
      if (child.type === "file") {
        if (child.kind === "img" || child.category === "images") {
          const slash = child.path.lastIndexOf("/");
          const ext = (child.name.match(/(\.[^.]+)$/)?.[1] || "").toLowerCase();
          rows.push({
            path: child.path,
            name: child.name,
            ext,
            folder: slash === -1 ? "" : child.path.slice(0, slash),
            size: child.size,
            updatedAt: child.mtime ? new Date(child.mtime).toISOString() : null,
          });
        }
      } else {
        walk(child);
      }
    }
  }
  if (tree) walk(tree);
  return rows;
}

function folderLabel(folder) {
  return folder === "" ? "Root" : folder;
}

function chipClass(active) {
  return `rounded-full px-2.5 py-1 text-xs transition-colors ${
    active
      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
  }`;
}

/**
 * Right-hand gallery filters: name search, folder, file type. Same collapsible
 * aside chrome as Inspector — thin rail when closed, drawer on mobile.
 */
function FiltersAside({
  open,
  onToggleOpen,
  mobile,
  query,
  onQueryChange,
  folder,
  onFolderChange,
  ext,
  onExtChange,
  folders,
  extensions,
  totalCount,
  onClear,
}) {
  // On mobile a closed panel is fully hidden; it is reopened from the gallery header.
  if (!open && mobile) return null;

  if (!open) {
    return (
      <aside className="flex h-full w-10 shrink-0 flex-col items-center border-l border-neutral-200 bg-zinc-100 py-3 dark:border-neutral-800 dark:bg-zinc-800">
        <button
          onClick={() => onToggleOpen(true)}
          title="Show filters"
          aria-label="Show filters"
          className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M15 3v18" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <>
      {mobile && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => onToggleOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`${
          mobile
            ? "fixed inset-y-0 right-0 z-40 w-72 max-w-[85vw] border-l shadow-xl"
            : "w-72 shrink-0 border-l sm:w-80"
        } flex h-full flex-col border-neutral-200 bg-zinc-100 dark:border-neutral-800 dark:bg-zinc-800`}
      >
        <div className="space-y-2 border-b border-neutral-200 px-3 pb-2.5 pt-3 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-1.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Filters
            </h2>
            <button
              onClick={() => onToggleOpen(false)}
              title="Hide filters"
              aria-label="Hide filters"
              className="shrink-0 rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  d="M19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M15 3V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7 9L10 12L7 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-3">
          <div>
            <label
              htmlFor="gallery-search"
              className="text-xs font-medium text-neutral-500 dark:text-neutral-400"
            >
              Name
            </label>
            <input
              id="gallery-search"
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search filenames…"
              className="mt-1.5 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-sky-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Folder
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onFolderChange(null)}
                className={chipClass(folder === null)}
              >
                All ({totalCount})
              </button>
              {folders.map(([name, count]) => (
                <button
                  key={name || "(root)"}
                  type="button"
                  onClick={() => onFolderChange(name)}
                  title={folderLabel(name)}
                  className={`max-w-full truncate ${chipClass(folder === name)}`}
                >
                  {folderLabel(name)} ({count})
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              File type
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onExtChange(null)}
                className={chipClass(ext === null)}
              >
                All
              </button>
              {extensions.map(([name, count]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onExtChange(name)}
                  className={chipClass(ext === name)}
                >
                  {name.replace(".", "").toUpperCase()} ({count})
                </button>
              ))}
            </div>
          </div>

          {(folder !== null || ext !== null || query.trim()) && (
            <button
              type="button"
              onClick={onClear}
              className="text-sm font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
            >
              Clear filters
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * Full visual-asset library: Apple-Photos-like square grid with a collapsible
 * right-side filter aside (folder, file type, name search).
 */
export default function Gallery({ tree, onOpenViewer }) {
  const [folder, setFolder] = useState(null); // null = all
  const [ext, setExt] = useState(null); // null = all
  const [query, setQuery] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [filtersOpen, setFiltersOpen] = useState(
    () => !window.matchMedia(MOBILE_QUERY).matches && loadOpenFlag(),
  );

  const toggleFilters = (open) => {
    setFiltersOpen(open);
    storeOpenFlag(open);
  };

  // Shrinking into a mobile viewport closes the drawer.
  useEffect(() => {
    if (isMobile) setFiltersOpen(false);
  }, [isMobile]);

  const all = useMemo(() => imageRows(tree), [tree]);

  const folders = useMemo(() => {
    const counts = new Map();
    for (const image of all) {
      counts.set(image.folder, (counts.get(image.folder) || 0) + 1);
    }
    return [...counts.entries()].sort(
      (a, b) => a[0].localeCompare(b[0]) || b[1] - a[1],
    );
  }, [all]);

  const extensions = useMemo(() => {
    const counts = new Map();
    for (const image of all) {
      const key = image.ext || "(none)";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((image) => {
      if (folder !== null && image.folder !== folder) return false;
      if (ext !== null && (image.ext || "(none)") !== ext) return false;
      if (q && !image.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, folder, ext, query]);

  const clearFilters = () => {
    setFolder(null);
    setExt(null);
    setQuery("");
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              Visual assets
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {filtered.length === all.length
                ? `${all.length.toLocaleString()} image${all.length === 1 ? "" : "s"}`
                : `${filtered.length.toLocaleString()} of ${all.length.toLocaleString()} images`}
            </p>
          </div>
          {isMobile && !filtersOpen && (
            <button
              type="button"
              onClick={() => toggleFilters(true)}
              title="Show filters"
              aria-label="Show filters"
              className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M15 3v18" />
              </svg>
            </button>
          )}
        </header>

        {all.length === 0 ? (
          <p className="py-16 text-center text-sm text-neutral-400">
            No images in this project yet.
          </p>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No images match the current filters.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-sm font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filtered.map((image, index) => (
              <button
                key={image.path}
                type="button"
                onClick={() => setLightboxIndex(index)}
                title={image.path}
                className="group relative aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-900"
              >
                <img
                  src={rawUrl(image.path)}
                  alt={image.name}
                  loading="lazy"
                  className="h-full w-full cursor-pointer object-cover transition-transform duration-200 group-hover:scale-[1.03] group-hover:opacity-100"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/50 to-transparent px-2 pb-1.5 pt-6 text-left text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {image.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <FiltersAside
        open={filtersOpen}
        onToggleOpen={toggleFilters}
        mobile={isMobile}
        query={query}
        onQueryChange={setQuery}
        folder={folder}
        onFolderChange={setFolder}
        ext={ext}
        onExtChange={setExt}
        folders={folders}
        extensions={extensions}
        totalCount={all.length}
        onClear={clearFilters}
      />

      {lightboxIndex !== null && filtered.length > 0 && (
        <GalleryLightbox
          items={filtered}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onOpenViewer={onOpenViewer}
        />
      )}
    </div>
  );
}
