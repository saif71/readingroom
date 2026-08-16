import { useState } from 'react';
import { openInSystemApp } from '../api';

/**
 * PDFs render in an <iframe> using the browser's built-in viewer. Browsers
 * that opt out of inline PDF rendering (navigator.pdfViewerEnabled === false)
 * get a fallback panel instead — iframes fire no reliable error event, so
 * the open-externally actions are always available as the escape hatch.
 * When viewing a historical version, the system opener is hidden: it can
 * only open the current file on disk, not the requested version.
 */
export default function PdfView({ path, src, isVersion, reloadKey = 0 }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(null);

  const openExternally = async () => {
    setOpening(true);
    setError(null);
    try {
      await openInSystemApp(path);
    } catch (e) {
      setError(e.message);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!isVersion && (
          <button
            onClick={openExternally}
            disabled={opening}
            className="rounded-md border border-sky-500/60 bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-500/25 disabled:opacity-50 dark:text-sky-300"
          >
            {opening ? 'Opening…' : 'Open in system viewer'}
          </button>
        )}
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
        >
          Open in new tab
        </a>
        {error && <span className="text-xs text-red-500 dark:text-red-400">{error}</span>}
      </div>
      {navigator.pdfViewerEnabled !== false ? (
        <iframe
          key={`${src}:${reloadKey}`}
          src={src}
          title={path.split('/').pop()}
          className="h-[calc(100vh-12rem)] min-h-[32rem] w-full rounded-lg border border-neutral-200 dark:border-neutral-800"
        />
      ) : (
        <div className="flex h-[calc(100vh-12rem)] min-h-[32rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 text-center text-sm text-neutral-400 dark:border-neutral-700">
          <p className="font-medium text-neutral-500 dark:text-neutral-300">This browser can’t display PDFs inline.</p>
          <p>Use the button above to open it in a new tab.</p>
        </div>
      )}
    </div>
  );
}
