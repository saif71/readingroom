import { useEffect, useState } from 'react';
import { fetchFile, isImagePath, isPdfPath } from '../api';
import MarkdownView from './MarkdownView';
import TextView from './TextView';
import ImageView from './ImageView';
import PdfView from './PdfView';

/**
 * Split a leading YAML frontmatter block off a markdown document.
 * Naive line-based parse — display only, not a YAML implementation.
 */
function splitFrontmatter(content) {
  if (!/^---\r?\n/.test(content)) return [null, content];
  const lines = content.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---' || lines[i] === '...') {
      const meta = {};
      for (const line of lines.slice(1, i)) {
        const m = line.match(/^([^\s#][^:]*):\s*(.*)$/);
        if (m) meta[m[1].trim()] = m[2].trim();
      }
      return [meta, lines.slice(i + 1).join('\n')];
    }
  }
  return [null, content];
}

function Frontmatter({ meta }) {
  return (
    <details className="not-prose mb-6 rounded-lg border border-neutral-200 text-sm dark:border-neutral-800">
      <summary className="cursor-pointer select-none px-3 py-2 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200">
        Metadata ({Object.keys(meta).length})
      </summary>
      <dl className="border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
        {Object.entries(meta).map(([key, value]) => (
          <div key={key} className="flex gap-3 py-0.5">
            <dt className="w-40 shrink-0 font-mono text-xs text-neutral-500 dark:text-neutral-400">{key}</dt>
            <dd className="min-w-0 break-words font-mono text-xs">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Centered({ children }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-neutral-400">
      <div>{children}</div>
    </div>
  );
}

function Header({ name, path }) {
  return (
    <header className="mb-6 border-b border-neutral-200 pb-4 dark:border-neutral-800">
      <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
      <p className="mt-1 font-mono text-xs text-neutral-400">{path.split('/').join(' / ')}</p>
    </header>
  );
}

export default function Viewer({ path, refreshKey, onNavigate }) {
  const [state, setState] = useState({ status: 'loading' });
  const isImage = isImagePath(path);
  const isPdf = isPdfPath(path);

  useEffect(() => {
    if (isImage || isPdf) return; // binary kinds render straight from /api/raw, no fetch needed
    setState({ status: 'loading' });
    let alive = true;
    fetchFile(path)
      .then((file) => alive && setState({ status: 'ok', file }))
      .catch((e) => alive && setState({ status: 'error', message: e.message }));
    return () => {
      alive = false;
    };
  }, [path, refreshKey, isImage, isPdf]);

  if (isImage) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 sm:px-10">
        <Header name={path.split('/').pop()} path={path} />
        <ImageView path={path} refreshKey={refreshKey} />
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-10">
        <Header name={path.split('/').pop()} path={path} />
        <PdfView path={path} refreshKey={refreshKey} />
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <Centered>
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-sky-500" />
      </Centered>
    );
  }

  if (state.status === 'error') {
    return (
      <Centered>
        <p className="font-medium text-neutral-500 dark:text-neutral-300">{path}</p>
        <p className="mt-1">{state.message}</p>
      </Centered>
    );
  }

  const { file } = state;
  const [meta, body] = file.kind === 'md' ? splitFrontmatter(file.content) : [null, file.content];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:px-10">
      <Header name={file.name} path={file.path} />
      {meta && Object.keys(meta).length > 0 && <Frontmatter meta={meta} />}
      {file.kind === 'md' ? (
        <MarkdownView path={file.path} content={body} onNavigate={onNavigate} />
      ) : (
        <TextView content={body} />
      )}
    </div>
  );
}
