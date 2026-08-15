import { useEffect, useRef } from 'react';

function Chevron({ open, className }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={`${className} transition-transform ${open ? 'rotate-90' : ''}`}
      aria-hidden="true"
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path d="M1.75 3.25A.75.75 0 0 1 2.5 2.5h3.19c.2 0 .39.08.53.22l1.06 1.06h4.22a.75.75 0 0 1 .75.75v8.22a.75.75 0 0 1-.75.75H2.5a.75.75 0 0 1-.75-.75V3.25Z" />
    </svg>
  );
}

function FileIcon({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 1.75A.75.75 0 0 1 4.75 1h5L13 4.25v10a.75.75 0 0 1-.75.75h-7.5A.75.75 0 0 1 4 14.25v-12.5Z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path d="M9.5 1v3.5H13" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function TreeNode({ node, expanded, onToggle, selected, onSelect, depth }) {
  const rowRef = useRef(null);
  const isSelected = node.path === selected;

  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isSelected]);

  const padding = { paddingLeft: depth * 14 + 6 };

  if (node.type === 'dir') {
    const open = expanded.has(node.path);
    return (
      <li>
        <button
          style={padding}
          onClick={() => onToggle(node.path)}
          aria-expanded={open}
          className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm font-medium hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60"
        >
          <Chevron open={open} className="h-3 w-3 shrink-0 text-neutral-400" />
          <FolderIcon className="h-4 w-4 shrink-0 text-sky-500/80 dark:text-sky-400/60" />
          <span className="truncate">{node.name}</span>
          <span className="ml-auto shrink-0 rounded-full bg-neutral-200/80 px-1.5 text-[10px] tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            {node.count}
          </span>
        </button>
        {open && node.children.length > 0 && (
          <ul>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                expanded={expanded}
                onToggle={onToggle}
                selected={selected}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li>
      <button
        ref={rowRef}
        style={padding}
        onClick={() => onSelect(node.path)}
        className={`flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm ${
          isSelected
            ? 'bg-sky-500/15 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300'
            : 'hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60'
        }`}
      >
        <FileIcon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-sky-500' : 'text-neutral-400'}`} />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}

export default function Tree({ node, expanded, onToggle, selected, onSelect }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {node.children.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          expanded={expanded}
          onToggle={onToggle}
          selected={selected}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </ul>
  );
}
