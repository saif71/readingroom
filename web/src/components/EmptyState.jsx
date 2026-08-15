export function Welcome() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-neutral-400">
      <p className="text-lg">Select a document from the sidebar</p>
      <p className="text-sm">
        Press <kbd className="rounded border border-neutral-300 px-1.5 py-0.5 font-mono text-xs dark:border-neutral-700">/</kbd> to
        filter files by name
      </p>
    </div>
  );
}

export function EmptyState({ rootName }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-lg text-neutral-500 dark:text-neutral-300">No viewable files found</p>
      <p className="max-w-md text-sm text-neutral-400">
        readingroom looked through <span className="font-mono">{rootName}</span> for markdown, text, and image files,
        respecting .gitignore and skipping dependency and build directories. Nothing to show.
      </p>
    </div>
  );
}
