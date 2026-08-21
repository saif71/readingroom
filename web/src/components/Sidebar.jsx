import { useEffect, useMemo, useRef, useState } from "react";
import Tree from "./Tree";
import Segmented from "./Segmented";
import { fuzzyMatch } from "../fuzzy";
import { useTheme } from "../theme";
import folderIcon from "../icons/folder.svg";

function flattenFiles(node, out = []) {
  for (const child of node.children || []) {
    if (child.type === "file") out.push(child);
    else flattenFiles(child, out);
  }
  return out;
}

/** Prune a tree to files of one category, recounting folder badges along the way. */
function pruneByCategory(node, category) {
  const children = [];
  let count = 0;
  for (const child of node.children) {
    if (child.type === "file") {
      if (child.category === category) {
        children.push(child);
        count += 1;
      }
    } else {
      const pruned = pruneByCategory(child, category);
      if (pruned) {
        children.push(pruned);
        count += pruned.count;
      }
    }
  }
  if (children.length === 0) return null;
  return { ...node, children, count };
}

/** Collect the paths of every folder in a tree, for expand-all. */
function collectDirs(node, out = []) {
  for (const child of node.children || []) {
    if (child.type === "dir") {
      out.push(child.path);
      collectDirs(child, out);
    }
  }
  return out;
}

const CATEGORY_LABELS = {
  markdown: "Markdown",
  images: "Images",
  pdfs: "PDFs",
  text: "Text",
  json: "JSON",
  code: "Code",
  other: "Other",
};
const CATEGORY_ORDER = [
  "markdown",
  "images",
  "pdfs",
  "text",
  "json",
  "code",
  "other",
];

const THEMES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export default function Sidebar({
  tree,
  selected,
  onSelect,
  open,
  onToggleOpen,
  mobile,
  onOpenQr,
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set());
  const [theme, setTheme] = useTheme();
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        if (e.key === "Escape") {
          setQuery("");
          e.target.blur();
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Expand ancestors of the selected file so it stays visible in the tree.
  useEffect(() => {
    if (!selected) return;
    setExpanded((prev) => {
      const parts = selected.split("/");
      let changed = false;
      const next = new Set(prev);
      for (let i = 1; i < parts.length; i++) {
        const prefix = parts.slice(0, i).join("/");
        if (!next.has(prefix)) {
          next.add(prefix);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selected]);

  const files = useMemo(() => (tree ? flattenFiles(tree) : []), [tree]);
  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(
      CATEGORY_ORDER.map((category) => [category, 0]),
    );
    for (const file of files) counts[file.category || "other"] += 1;
    return counts;
  }, [files]);

  const visibleFiles = useMemo(
    () =>
      kind === "all"
        ? files
        : files.filter((f) => (f.category || "other") === kind),
    [files, kind],
  );
  const visibleTree = useMemo(
    () => (tree && kind !== "all" ? pruneByCategory(tree, kind) : tree),
    [tree, kind],
  );
  const dirPaths = useMemo(
    () => (visibleTree ? collectDirs(visibleTree) : []),
    [visibleTree],
  );

  // Which segment (if any) reflects the tree: fully expanded, fully collapsed, or mixed.
  const treeState =
    dirPaths.length > 0 && dirPaths.every((p) => expanded.has(p))
      ? "expand"
      : expanded.size === 0
        ? "collapse"
        : null;

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    return visibleFiles
      .map((file) => ({ file, score: fuzzyMatch(q, file.path) }))
      .filter((m) => m.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 200);
  }, [query, visibleFiles]);

  const toggle = (path) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const chips = [{ id: "all", label: "All", count: files.length }].concat(
    CATEGORY_ORDER.map((category) => ({
      id: category,
      label: CATEGORY_LABELS[category],
      count: categoryCounts[category],
    })),
  );

  // On mobile a closed sidebar is fully hidden; it is reopened from the top bar.
  if (!open && mobile) return null;

  if (!open) {
    return (
      <aside className="flex h-full w-10 shrink-0 flex-col items-center border-r border-neutral-200 bg-zinc-100 py-3 dark:border-neutral-800 dark:bg-neutral-800">
        <button
          onClick={() => (window.location.href = "/")}
          title="home"
          aria-label="home"
          className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200 cursor-pointer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
            <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        </button>
        <button
          onClick={() => onToggleOpen(true)}
          title="Show file tree"
          aria-label="Show file tree"
          className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200"
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
            <path d="M9 3v18" />
            <path d="m13 9 3 3-3 3" />
          </svg>
        </button>
        {onOpenQr && (
          <button
            onClick={onOpenQr}
            title="Open on your phone"
            aria-label="Open on your phone"
            className="mt-1 rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200"
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
              <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
              <path d="M12 18h.01" />
            </svg>
          </button>
        )}
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
            ? "fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] shadow-xl"
            : "w-72 shrink-0  sm:w-80"
        } flex h-full flex-col bg-zinc-100 dark:border-neutral-800 dark:bg-neutral-800`}
      >
        <div className="px-3 pb-2 pt-3">
          <div className="flex items-center gap-2 px-1 pb-2">
            <span className="font-semibold tracking-tight flex items-center">
              <img
                src={folderIcon}
                alt="Folder icon"
                className="inline-block w-4 h-4 mr-2"
              />
              readingroom
            </span>
            {/* <span className="truncate text-xs text-neutral-400">
              {tree ? `${tree.count} files` : "…"}
            </span> */}
            <button
              onClick={() => (window.location.href = "/")}
              title="home"
              aria-label="home"
              className="ml-auto rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200 cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
                <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            </button>
            {onOpenQr && (
              <button
                onClick={onOpenQr}
                title="Open on your phone"
                aria-label="Open on your phone"
                className="shrink-0 rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200  cursor-pointer"
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
                  <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
                  <path d="M12 18h.01" />
                </svg>
              </button>
            )}
            <button
              onClick={() => onToggleOpen(false)}
              title="Hide file tree"
              aria-label="Hide file tree"
              className="shrink-0 rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200  cursor-pointer"
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
                <path d="M9 3v18" />
                <path d="m16 9-3 3 3 3" />
              </svg>
            </button>
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter files…  /"
            spellCheck={false}
            className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm outline-none placeholder:text-neutral-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <div className="flex flex-wrap gap-1 pt-2">
            {chips.map((chip) => (
              <button
                key={chip.id}
                onClick={() => setKind(chip.id)}
                className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  kind === chip.id
                    ? "border-sky-500/60 bg-sky-500/15 text-sky-700 dark:text-sky-300"
                    : "border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
                }`}
              >
                {chip.label}{" "}
                <span className="tabular-nums opacity-70">{chip.count}</span>
              </button>
            ))}
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {!tree ? (
            <p className="px-2 py-4 text-sm text-neutral-400">Scanning…</p>
          ) : matches ? (
            matches.length === 0 ? (
              <p className="px-2 py-4 text-sm text-neutral-400">
                No files match “{query.trim()}”.
              </p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {matches.map(({ file }) => {
                  const dir = file.path.includes("/")
                    ? file.path.slice(0, file.path.lastIndexOf("/"))
                    : "";
                  return (
                    <li key={file.path}>
                      <button
                        onClick={() => onSelect(file.path)}
                        className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm ${
                          file.path === selected
                            ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                            : "hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60"
                        }`}
                      >
                        <span className="truncate font-medium">
                          {file.name}
                        </span>
                        {dir && (
                          <span className="truncate text-xs text-neutral-400">
                            {dir}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : visibleTree ? (
            <Tree
              node={visibleTree}
              expanded={expanded}
              onToggle={toggle}
              selected={selected}
              onSelect={onSelect}
            />
          ) : (
            <p className="px-2 py-4 text-sm text-neutral-400">
              No files of this type.
            </p>
          )}
        </nav>
        <div className="space-y-2 border-t border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
          <Segmented
            label="File tree"
            value={treeState}
            onSelect={(id) =>
              setExpanded(id === "expand" ? new Set(dirPaths) : new Set())
            }
            options={[
              { id: "expand", label: "Expand all" },
              { id: "collapse", label: "Collapse all" },
            ]}
          />
          <Segmented
            label="Theme"
            value={theme}
            onSelect={setTheme}
            options={THEMES}
          />
        </div>
      </aside>
    </>
  );
}
