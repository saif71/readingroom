import { useState } from "react";
import { rawUrl } from "../api";
import GalleryLightbox from "./GalleryLightbox";

/**
 * Dashboard preview of the newest image assets — Google-Photos-like thumbnail
 * grid with a View all jump into the full /gallery page.
 */
export default function VisualAssetsWidget({
  visualAssets,
  onOpenViewer,
  onOpenGallery,
}) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const total = visualAssets?.total ?? 0;
  const recent = visualAssets?.recent ?? [];

  if (total === 0) return null;

  return (
    <section
      className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40"
      aria-labelledby="dashboard-visual-assets-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="dashboard-visual-assets-heading"
            className="font-medium text-neutral-900 dark:text-neutral-100"
          >
            Visual assets
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            {total.toLocaleString()} image{total === 1 ? "" : "s"}
            {recent.length < total
              ? ` · showing ${recent.length} most recent`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenGallery}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-800 hover:text-white dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-100 dark:hover:text-neutral-900 cursor-pointer"
        >
          View all
        </button>
      </div>

      {recent.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-400">
          No images have a usable timestamp.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
          {recent.map((image, index) => (
            <button
              key={image.path}
              type="button"
              onClick={() => setLightboxIndex(index)}
              title={image.path}
              className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900"
            >
              <img
                src={rawUrl(image.path)}
                alt={image.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04] cursor-pointer group-hover:opacity-100"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/55 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {image.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {lightboxIndex !== null && recent.length > 0 && (
        <GalleryLightbox
          items={recent}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onOpenViewer={onOpenViewer}
        />
      )}
    </section>
  );
}
