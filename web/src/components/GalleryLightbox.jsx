import { useCallback, useEffect, useState } from "react";
import { rawUrl } from "../api";
import { formatBytes, formatDateTime } from "../format";

const PRIMARY_BTN =
  "rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-800 hover:text-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-100 dark:hover:text-neutral-900";

/**
 * Full-viewport image lightbox over a caller-provided item list.
 * Prev/next follows that list (so gallery filters apply to navigation).
 */
export default function GalleryLightbox({
  items,
  index,
  onIndexChange,
  onClose,
  onOpenViewer,
}) {
  const [failed, setFailed] = useState(false);
  // Live tree refreshes can shrink/reorder the list; keep index in range.
  const safeIndex = items.length
    ? Math.min(Math.max(index, 0), items.length - 1)
    : 0;
  const item = items[safeIndex];

  useEffect(() => {
    if (items.length && index !== safeIndex) onIndexChange(safeIndex);
  }, [items.length, index, safeIndex, onIndexChange]);

  const go = useCallback(
    (delta) => {
      if (!items.length) return;
      const next = (safeIndex + delta + items.length) % items.length;
      onIndexChange(next);
    },
    [safeIndex, items.length, onIndexChange],
  );

  useEffect(() => {
    setFailed(false);
  }, [item?.path]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`Image preview: ${item.name}`}
    >
      <div
        className="absolute inset-0 dark:bg-black/70 bg-white/70 backdrop-blur-3xl"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative flex min-h-0 flex-1 flex-col p-3 sm:p-6">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {item.name}
            </p>
            <p className="mt-0.5 truncate text-xs text-neutral-300">
              {item.folder ? `${item.folder}/` : ""}
              {item.name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onOpenViewer && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenViewer(item.path);
                }}
                className={PRIMARY_BTN}
              >
                Open in viewer
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close"
              className="rounded-md p-1.5 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
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
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="relative mt-3 flex min-h-0 flex-1 items-center justify-center">
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => go(-1)}
              title="Previous image"
              aria-label="Previous image"
              className="absolute left-0 z-10 rounded-full bg-black/40 p-2 text-white transition-colors hover:bg-black/70"
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
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}

          <div className="flex h-full w-full items-center justify-center px-10">
            {failed ? (
              <p className="text-sm text-neutral-300">Could not load image.</p>
            ) : (
              <img
                key={item.path}
                src={rawUrl(item.path)}
                alt={item.name}
                onError={() => setFailed(true)}
                className="max-h-full max-w-full rounded-md object-contain "
              />
            )}
          </div>

          {items.length > 1 && (
            <button
              type="button"
              onClick={() => go(1)}
              title="Next image"
              aria-label="Next image"
              className="absolute right-0 z-10 rounded-full bg-black/40 p-2 text-white transition-colors hover:bg-black/70"
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
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          )}
        </div>

        <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-neutral-300">
          <p className="truncate">
            {(item.ext || "").replace(".", "").toUpperCase() || "IMAGE"}
            {item.size != null ? ` · ${formatBytes(item.size)}` : ""}
            {item.updatedAt ? ` · ${formatDateTime(item.updatedAt)}` : ""}
          </p>
          {items.length > 1 && (
            <p className="tabular-nums">
              {safeIndex + 1} / {items.length}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
