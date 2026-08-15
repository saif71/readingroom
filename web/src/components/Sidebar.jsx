import { useEffect, useMemo, useRef, useState } from 'react';
import Tree from './Tree';
import { fuzzyMatch } from '../fuzzy';

function flattenFiles(node, out = []) {
  for (const child of node.children || []) {
    if (child.type === 'file') out.push(child);
    else flattenFiles(child, out);
  }
  return out;
}

/** Prune a tree to files of one kind, recounting folder badges along the way. */
function pruneByKind(node, kind) {
  const children = [];
  let count = 0;
  for (const child of node.children) {
    if (child.type === 'file') {
      if (child.kind === kind) {
        children.push(child);
        count += 1;
      }
    } else {
      const pruned = pruneByKind(child, kind);
      if (pruned) {
        children.push(pruned);
        count += pruned.count;
      }
    }
  }
  if (children.length === 0) return null;
  return { ...node, children, count };
}

const KIND_LABELS = { md: 'Markdown', txt: 'Text', img: 'Images' };

export default function Sidebar({ tree, selected, onSelect }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [expanded, setExpanded] = useState(() => new Set());
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          setQuery('');
          e.target.blur();
        }
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Expand ancestors of the selected file so it stays visible in the tree.
  useEffect(() => {
    if (!selected) return;
    setExpanded((prev) => {
      const parts = selected.split('/');
      let changed = false;
      const next = new Set(prev);
      for (let i = 1; i < parts.length; i++) {
        const prefix = parts.slice(0, i).join('/');
        if (!next.has(prefix)) {
          next.add(prefix);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selected]);

  const files = useMemo(() => (tree ? flattenFiles(tree) : []), [tree]);
  const kindCounts = useMemo(() => {
    const counts = { md: 0, txt: 0, img: 0 };
    for (const file of files) counts[file.kind] += 1;
    return counts;
  }, [files]);

  const visibleFiles = useMemo(
    () => (kind === 'all' ? files : files.filter((f) => f.kind === kind)),
    [files, kind]
  );
  const visibleTree = useMemo(() => (tree && kind !== 'all' ? pruneByKind(tree, kind) : tree), [tree, kind]);

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

  const chips = [{ id: 'all', label: 'All', count: files.length }].concat(
    ['md', 'txt', 'img']
      .filter((k) => kindCounts[k] > 0)
      .map((k) => ({ id: k, label: KIND_LABELS[k], count: kindCounts[k] }))
  );

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/30 sm:w-80">
      <div className="px-3 pb-2 pt-3">
        <div className="flex items-baseline gap-2 px-1 pb-2">
          <span className="font-semibold tracking-tight">readingroom</span>
          <span className="text-xs text-neutral-400">{tree ? `${tree.count} files` : '…'}</span>
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
                  ? 'border-sky-500/60 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                  : 'border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-neutral-200'
              }`}
            >
              {chip.label} <span className="tabular-nums opacity-70">{chip.count}</span>
            </button>
          ))}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {!tree ? (
          <p className="px-2 py-4 text-sm text-neutral-400">Scanning…</p>
        ) : matches ? (
          matches.length === 0 ? (
            <p className="px-2 py-4 text-sm text-neutral-400">No files match “{query.trim()}”.</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {matches.map(({ file }) => {
                const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
                return (
                  <li key={file.path}>
                    <button
                      onClick={() => onSelect(file.path)}
                      className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm ${
                        file.path === selected
                          ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                          : 'hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60'
                      }`}
                    >
                      <span className="truncate font-medium">{file.name}</span>
                      {dir && <span className="truncate text-xs text-neutral-400">{dir}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : visibleTree ? (
          <Tree node={visibleTree} expanded={expanded} onToggle={toggle} selected={selected} onSelect={onSelect} />
        ) : (
          <p className="px-2 py-4 text-sm text-neutral-400">No files of this type.</p>
        )}
      </nav>
    </aside>
  );
}
