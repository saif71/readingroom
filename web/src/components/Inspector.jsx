import { useEffect, useState } from "react";
import { fetchRepo, fetchMeta, fetchHistory } from "../api";
import Segmented from "./Segmented";
import {
  formatBytes,
  formatDate,
  formatDateTime,
  timeAgo,
  initials,
  avatarColor,
} from "../format";

const STORAGE_KEY = "readingroom-inspector";
const REF_RE = /^[0-9a-f]{7,40}$/i;

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

const KIND_LABELS = { md: "Markdown", txt: "Text", img: "Image", pdf: "PDF" };
const STATUS_LABELS = { A: "added", M: "modified", R: "renamed", D: "deleted" };
const STATUS_STYLES = {
  A: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  M: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  R: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  D: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

function Avatar({ name, className = "h-5 w-5 text-[9px]" }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${avatarColor(name || "?")} ${className}`}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-5">
      <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        {title}
      </h3>
      <dl className="rounded-lg border border-neutral-200 dark:border-neutral-700">
        {children}
      </dl>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex gap-3 border-b border-neutral-100 px-3 py-1.5 last:border-b-0 dark:border-neutral-700/60">
      <dt className="w-20 shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-words text-xs">{children}</dd>
    </div>
  );
}

function InfoTab({ meta }) {
  if (meta.status === "loading") {
    return <p className="px-1 py-4 text-sm text-neutral-400">Loading…</p>;
  }
  if (meta.status === "error") {
    return <p className="px-1 py-4 text-sm text-neutral-400">{meta.message}</p>;
  }
  const file = meta.file;
  const last = file.lastCommit;

  return (
    <div className="pt-2">
      {last && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
          <Avatar name={last.author} className="h-8 w-8 text-xs" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-neutral-400">
              Last edited by
            </p>
            <p className="truncate text-sm font-medium">{last.author}</p>
            <p
              className="mt-0.5 text-xs text-neutral-400"
              title={formatDateTime(last.date)}
            >
              {timeAgo(last.date)} · {formatDate(last.date)}
            </p>
            <p
              className="mt-1 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400"
              title={last.subject}
            >
              {last.subject}
            </p>
          </div>
        </div>
      )}

      <Section title="File">
        <Row label="Name">{file.name}</Row>
        <Row label="Path">
          <span className="font-mono">{file.path}</span>
        </Row>
        {file.kind && (
          <Row label="Type">{KIND_LABELS[file.kind] || file.kind}</Row>
        )}
        <Row label="Size">{formatBytes(file.size)}</Row>
        <Row
          label="Modified"
          title={formatDateTime(new Date(file.mtime).toISOString())}
        >
          {formatDateTime(new Date(file.mtime).toISOString())}
        </Row>
      </Section>

      {file.words != null && (
        <Section title="Reading">
          <Row label="Words">{file.words.toLocaleString()}</Row>
          <Row label="Characters">{(file.chars ?? 0).toLocaleString()}</Row>
          <Row label="Time">
            ~{Math.max(1, Math.round(file.words / 200))} min read
          </Row>
        </Section>
      )}

      {!last && <p className="px-1 text-xs text-neutral-400">-</p>}
    </div>
  );
}

function HistoryTab({ path, refSha, refreshKey, onNavigateVersion }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetchHistory(path)
      .then((h) => alive && setState({ status: "ok", ...h }))
      .catch((e) => alive && setState({ status: "error", message: e.message }));
    return () => {
      alive = false;
    };
  }, [path, refreshKey]);

  if (state.status === "loading") {
    return (
      <p className="px-1 py-4 text-sm text-neutral-400">Loading history…</p>
    );
  }
  if (state.status === "error") {
    return (
      <p className="px-1 py-4 text-sm text-neutral-400">{state.message}</p>
    );
  }
  if (state.git === false) {
    return (
      <p className="px-1 py-4 text-sm text-neutral-400">
        This folder is not a git repository, so there is no history to show.
      </p>
    );
  }
  if (state.commits.length === 0) {
    return (
      <p className="px-1 py-4 text-sm text-neutral-400">
        Not committed yet — this file is not tracked by git.
      </p>
    );
  }

  return (
    <div className="pt-2">
      <ol className="border-l border-neutral-200 dark:border-neutral-800">
        {state.commits.map((commit) => {
          const selected =
            refSha && (commit.sha === refSha || commit.sha.startsWith(refSha));
          return (
            <li key={commit.sha} className="relative">
              <span
                className={`absolute left-[-4.5px] top-[19px] z-10 h-2 w-2 rounded-full ${
                  selected
                    ? "bg-sky-500 ring-4 ring-sky-500/20"
                    : "bg-neutral-300 dark:bg-neutral-600"
                }`}
              />
              <button
                onClick={() => onNavigateVersion(path, commit.sha)}
                className={`mb-2 ml-3 w-full rounded-md px-2.5 py-2 text-left transition-colors ${
                  selected
                    ? "bg-sky-500/15"
                    : "hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Avatar name={commit.author} />
                  <span className="truncate text-xs font-medium">
                    {commit.author}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1 py-px font-mono text-[10px] ${STATUS_STYLES[commit.status] || STATUS_STYLES.M}`}
                    title={STATUS_LABELS[commit.status] || commit.status}
                  >
                    {STATUS_LABELS[commit.status] || commit.status}
                  </span>
                  <span
                    className="ml-auto shrink-0 text-[11px] text-neutral-400"
                    title={formatDateTime(commit.date)}
                  >
                    {timeAgo(commit.date)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-300">
                  {commit.subject}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-neutral-400">
                    {commit.abbrev}
                  </span>
                  {commit.path !== path && (
                    <span
                      className="truncate font-mono text-[10px] text-neutral-400"
                      title={`file was ${commit.path} at this commit`}
                    >
                      {commit.path}
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
      {state.truncated && (
        <p className="px-1 pb-2 pt-1 text-[11px] text-neutral-400">
          Showing the latest {state.commits.length} commits.
        </p>
      )}
    </div>
  );
}

/**
 * Right-hand inspector for the open file: Info (metadata) and History (git
 * timeline). Collapses to a thin rail; open/tab state persists in
 * localStorage. `refSha` highlights the commit being viewed in the Viewer.
 */
export default function Inspector({
  path,
  refSha,
  refreshKey,
  onNavigateVersion,
}) {
  const [prefs, setPrefs] = useState(loadPrefs); // { open?: bool, tab?: 'info'|'history' }
  const [repo, setRepo] = useState({ status: "loading" });
  const [meta, setMeta] = useState({ status: "loading" });

  const open = prefs.open !== false;
  const tab = prefs.tab === "history" ? "history" : "info";

  const setPref = (patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — prefs stay session-only */
      }
      return next;
    });
  };

  useEffect(() => {
    let alive = true;
    fetchRepo()
      .then((r) => alive && setRepo({ status: "ok", ...r }))
      .catch(
        () => alive && setRepo({ status: "ok", git: false, branch: null }),
      );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setMeta({ status: "loading" });
    fetchMeta(path)
      .then((file) => alive && setMeta({ status: "ok", file }))
      .catch((e) => alive && setMeta({ status: "error", message: e.message }));
    return () => {
      alive = false;
    };
  }, [path, refreshKey]);

  if (!open) {
    return (
      <aside className="flex h-full w-10 shrink-0 flex-col items-center border-l border-neutral-200 bg-zinc-100 py-3 dark:border-neutral-800 dark:bg-zinc-800">
        <button
          onClick={() => setPref({ open: true })}
          title="Show inspector"
          aria-label="Show inspector"
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
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-neutral-200 bg-zinc-100 dark:border-neutral-800 dark:bg-zinc-800 sm:w-80">
      <div className="space-y-2 border-b border-neutral-200 px-3 pb-2.5 pt-3 dark:border-neutral-800">
        <div className="flex items-center gap-1.5 justify-between">
          <Segmented
            value={tab}
            onSelect={(id) => setPref({ tab: id })}
            options={[
              { id: "info", label: "Info" },
              { id: "history", label: "History" },
            ]}
          />
          <button
            onClick={() => setPref({ open: false })}
            title="Hide inspector"
            aria-label="Hide inspector"
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
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M15 3V21"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M7 9L10 12L7 15"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
        {repo.status === "ok" && repo.git && (
          <div className="flex items-center gap-1.5 px-1 text-xs text-neutral-500 dark:text-neutral-400">
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="6" x2="6" y1="3" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <span
              className="truncate font-mono"
              title={repo.branch || "detached HEAD"}
            >
              {repo.branch || "detached"}
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {tab === "info" ? (
          <InfoTab meta={meta} />
        ) : (
          <HistoryTab
            path={path}
            refSha={refSha}
            refreshKey={refreshKey}
            onNavigateVersion={onNavigateVersion}
          />
        )}
      </div>
    </aside>
  );
}
