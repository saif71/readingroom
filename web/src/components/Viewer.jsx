import { useEffect, useState } from 'react';
import { fetchFile, fetchVersion, isImagePath, isPdfPath, rawUrl, versionRawUrl } from '../api';
import { formatDate } from '../format';
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

/** Sticky-context banner shown whenever a historical version is displayed. */
function VersionBanner({ version, onBack }) {
  const when = version.date ? formatDate(version.date) : 'an earlier commit';
  return (
    <div className="not-prose mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
      <svg className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-amber-800 dark:text-amber-200">
          Viewing version from {when}
          {version.author ? <> by {version.author}</> : null}
          {version.deleted && ' — the file was deleted in this commit, showing the last version'}
        </p>
        {version.subject && (
          <p className="truncate text-xs text-amber-700/80 dark:text-amber-300/80" title={version.subject}>
            {version.subject}
          </p>
        )}
      </div>
      <button
        onClick={onBack}
        className="shrink-0 rounded-full border border-amber-400/60 bg-white/70 px-3 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-white dark:border-amber-500/40 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-500/10"
      >
        Back to latest
      </button>
    </div>
  );
}

export default function Viewer({ path, refSha, refreshKey, onNavigate }) {
  const [state, setState] = useState({ status: 'loading' });
  const isImage = isImagePath(path);
  const isPdf = isPdfPath(path);
  const isVersion = refSha != null;

  useEffect(() => {
    // Binary kinds render straight from a URL — but a historical version
    // still fetches the JSON form so the banner has author/date/subject.
    if ((isImage || isPdf) && !isVersion) return;
    setState({ status: 'loading' });
    let alive = true;
    const load = isVersion ? fetchVersion(path, refSha) : fetchFile(path);
    load
      .then((file) => alive && setState({ status: 'ok', file }))
      .catch((e) => alive && setState({ status: 'error', message: e.message }));
    return () => {
      alive = false;
    };
  }, [path, refreshKey, isImage, isPdf, isVersion, refSha]);

  const sourceUrl = isVersion ? versionRawUrl(path, refSha) : rawUrl(path);

  if (isImage || isPdf) {
    if (isVersion && state.status === 'loading') {
      return (
        <Centered>
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-sky-500" />
        </Centered>
      );
    }
    if (isVersion && state.status === 'error') {
      return (
        <Centered>
          <p className="font-medium text-neutral-500 dark:text-neutral-300">{path}</p>
          <p className="mt-1">{state.message}</p>
        </Centered>
      );
    }
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 sm:px-10">
        {isVersion && <VersionBanner version={state.file} onBack={() => onNavigate(path)} />}
        <Header name={path.split('/').pop()} path={path} />
        {isImage ? (
          <ImageView src={sourceUrl} alt={path.split('/').pop()} reloadKey={isVersion ? 0 : refreshKey} />
        ) : (
          <PdfView path={path} src={sourceUrl} isVersion={isVersion} reloadKey={isVersion ? 0 : refreshKey} />
        )}
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
  const [meta, body] = file.kind === 'md' ? splitFrontmatter(file.content ?? '') : [null, file.content ?? ''];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:px-10">
      {isVersion && <VersionBanner version={file} onBack={() => onNavigate(path)} />}
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
