import { useCallback, useEffect, useState } from "react";
import { fetchTree, subscribeTree, viewUrl, versionUrl, pathFromViewUrl } from "./api";
import Sidebar from "./components/Sidebar";
import Viewer from "./components/Viewer";
import Inspector from "./components/Inspector";
import { EmptyState, Welcome } from "./components/EmptyState";
import useMediaQuery from "./useMediaQuery";

const REF_RE = /^[0-9a-f]{7,40}$/i;

// Below md (768px) sidebars become overlay drawers, closed by default.
const MOBILE_QUERY = "(max-width: 767px)";

function loadOpenFlag(key) {
  const saved = localStorage.getItem(key);
  return saved === null ? true : saved === "true";
}

function storeOpenFlag(key, open) {
  try {
    localStorage.setItem(key, String(open));
  } catch {
    /* storage unavailable — toggle is session-only */
  }
}

function refFromLocation() {
  const ref = new URLSearchParams(window.location.search).get("ref");
  return ref && REF_RE.test(ref) ? ref : null;
}

export default function App() {
  const [tree, setTree] = useState(null);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(() =>
    pathFromViewUrl(window.location.pathname),
  );
  // Commit sha when a historical version is open (deep-linkable via ?ref=).
  const [refSha, setRefSha] = useState(refFromLocation);
  const [refreshKey, setRefreshKey] = useState(0);

  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !window.matchMedia(MOBILE_QUERY).matches && loadOpenFlag("readingroom-sidebar-open"),
  );
  const [inspectorOpen, setInspectorOpen] = useState(
    () => !window.matchMedia(MOBILE_QUERY).matches && loadOpenFlag("readingroom-inspector-open"),
  );

  const toggleSidebar = useCallback((open) => {
    setSidebarOpen(open);
    storeOpenFlag("readingroom-sidebar-open", open);
  }, []);
  const toggleInspector = useCallback((open) => {
    setInspectorOpen(open);
    storeOpenFlag("readingroom-inspector-open", open);
  }, []);

  // Shrinking into a mobile viewport closes the drawers.
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
      setInspectorOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    let alive = true;
    fetchTree()
      .then((t) => alive && setTree(t))
      .catch((e) => alive && setError(e.message));
    const unsubscribe = subscribeTree((t) => {
      setTree(t);
      setRefreshKey((k) => k + 1);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onPop = () => {
      setCurrent(pathFromViewUrl(window.location.pathname));
      setRefSha(refFromLocation());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((path) => {
    if (path === null) {
      history.pushState({}, "", "/");
      setCurrent(null);
    } else {
      history.pushState({}, "", viewUrl(path));
      setCurrent(path);
      if (window.matchMedia(MOBILE_QUERY).matches) setSidebarOpen(false);
    }
    setRefSha(null);
  }, []);

  const navigateVersion = useCallback((path, sha) => {
    history.pushState({}, "", versionUrl(path, sha));
    setCurrent(path);
    setRefSha(sha);
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-white p-8 text-center text-neutral-600 dark:bg-neutral-950 dark:text-neutral-300">
        <div>
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1 text-sm text-neutral-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-100 text-neutral-900 dark:bg-zinc-800 dark:text-neutral-100">
      {isMobile && (
        <header className="flex shrink-0 items-center justify-between px-3 py-2">
          <button
            onClick={() => toggleSidebar(!sidebarOpen)}
            title={sidebarOpen ? "Hide file tree" : "Show file tree"}
            aria-label={sidebarOpen ? "Hide file tree" : "Show file tree"}
            className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200"
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
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
            </svg>
          </button>
          <span className="text-sm font-semibold tracking-tight">
            readingroom
          </span>
          {current ? (
            <button
              onClick={() => toggleInspector(!inspectorOpen)}
              title={inspectorOpen ? "Hide inspector" : "Show inspector"}
              aria-label={inspectorOpen ? "Hide inspector" : "Show inspector"}
              className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200"
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
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M15 3v18" />
              </svg>
            </button>
          ) : (
            <span className="w-8" />
          )}
        </header>
      )}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          tree={tree}
          selected={current}
          onSelect={navigate}
          open={sidebarOpen}
          onToggleOpen={toggleSidebar}
          mobile={isMobile}
        />
        <main className="min-w-0 flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-900 m-2 rounded-3xl sm:m-4">
          {tree && tree.count === 0 ? (
            <EmptyState rootName={tree.name} />
          ) : current ? (
            <Viewer
              path={current}
              refSha={refSha}
              refreshKey={refreshKey}
              onNavigate={navigate}
            />
          ) : (
            <Welcome />
          )}
        </main>
        {current && (
          <Inspector
            path={current}
            refSha={refSha}
            refreshKey={refreshKey}
            onNavigateVersion={navigateVersion}
            open={inspectorOpen}
            onToggleOpen={toggleInspector}
            mobile={isMobile}
          />
        )}
      </div>
    </div>
  );
}
