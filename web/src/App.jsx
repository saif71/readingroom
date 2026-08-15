import { useCallback, useEffect, useState } from "react";
import { fetchTree, subscribeTree, viewUrl, pathFromViewUrl } from "./api";
import Sidebar from "./components/Sidebar";
import Viewer from "./components/Viewer";
import { EmptyState, Welcome } from "./components/EmptyState";

export default function App() {
  const [tree, setTree] = useState(null);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(() =>
    pathFromViewUrl(window.location.pathname),
  );
  const [refreshKey, setRefreshKey] = useState(0);

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
    const onPop = () => setCurrent(pathFromViewUrl(window.location.pathname));
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
    }
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
    <div className="flex h-screen bg-zinc-100 text-neutral-900 dark:bg-zinc-800 dark:text-neutral-100">
      <Sidebar tree={tree} selected={current} onSelect={navigate} />
      <main className="min-w-0 flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-900 m-4 rounded-3xl">
        {tree && tree.count === 0 ? (
          <EmptyState rootName={tree.name} />
        ) : current ? (
          <Viewer
            path={current}
            refreshKey={refreshKey}
            onNavigate={navigate}
          />
        ) : (
          <Welcome />
        )}
      </main>
    </div>
  );
}
