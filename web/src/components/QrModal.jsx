import { useEffect, useMemo, useState } from "react";
import { fetchMobileStatus, setMobileLan, setMobileTunnel } from "../api";
import { formatBytes } from "../format";
import { qrMatrix } from "../vendor/qr";

const PRIMARY_BTN =
  "rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-default disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800";
const SUBTLE_BTN =
  "text-xs text-neutral-500 transition-colors hover:text-neutral-800 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-200";

function QrSvg({ value }) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  const quiet = 4;
  const total = matrix.length + quiet * 2;
  let path = "";
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    });
  });
  // Always on a white plate: scanners need the contrast, even in dark mode.
  return (
    <div className="mx-auto w-fit rounded-lg bg-white p-3 shadow-sm">
      <svg
        viewBox={`0 0 ${total} ${total}`}
        className="h-44 w-44"
        role="img"
        aria-label="QR code for this readingroom"
      >
        <rect width={total} height={total} fill="#ffffff" />
        <path d={path} fill="#0a0a0a" />
      </svg>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  };
  return (
    <button
      onClick={copy}
      className="shrink-0 text-xs text-sky-600 transition-colors hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function UrlRow({ url }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 dark:border-neutral-700 dark:bg-neutral-900">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-600 dark:text-neutral-300">
        {url}
      </span>
      <CopyButton text={url} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DownloadProgress({ bytes, total }) {
  const pct = total ? Math.min(100, (bytes / total) * 100) : null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Downloading tunnel helper…{" "}
        <span className="tabular-nums">
          {formatBytes(bytes)}
          {total ? ` / ${formatBytes(total)}` : ""}
        </span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        {pct === null ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-500" />
        ) : (
          <div
            className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

function TokenRow({ token }) {
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
      <span>
        Access code:{" "}
        <code className="font-mono text-neutral-700 dark:text-neutral-200">
          {token}
        </code>
      </span>
      <CopyButton text={token} />
    </div>
  );
}

export default function QrModal({ onClose }) {
  const [state, setState] = useState({ status: "loading" });
  const [busy, setBusy] = useState(null); // 'lan' | 'tunnel' while a toggle is in flight

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const data = await fetchMobileStatus();
        if (alive) setState({ status: "ok", data });
      } catch (e) {
        if (alive) setState((prev) =>
          prev.status === "ok"
            ? prev // transient hiccup — keep the last known status
            : { status: "error", message: e.message },
        );
      }
    };
    refresh();
    const id = setInterval(refresh, 1000);
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const run = async (kind, action) => {
    setBusy(kind);
    try {
      const data = await action();
      setState({ status: "ok", data });
    } catch {
      // Errors persist in the reported status (e.g. tunnel download failed);
      // refresh so the UI picks them up.
      try {
        setState({ status: "ok", data: await fetchMobileStatus() });
      } catch {
        /* ignore — the 1s poll will retry */
      }
    } finally {
      setBusy(null);
    }
  };

  const data = state.status === "ok" ? state.data : null;
  const tunnel = data?.tunnel;
  const tunnelBusy =
    tunnel?.state === "downloading" || tunnel?.state === "starting" || busy === "tunnel";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Open on your phone"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-neutral-200 bg-zinc-100 p-4 shadow-xl dark:border-neutral-800 dark:bg-neutral-800">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Open on your phone
          </h2>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200"
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
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {state.status === "loading" && (
          <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>
        )}

        {state.status === "error" && (
          <div className="space-y-1 py-8 text-center">
            <p className="text-sm text-rose-500">{state.message}</p>
            <p className="text-xs text-neutral-400">
              This needs the readingroom server that came with this UI.
            </p>
          </div>
        )}

        {data && (
          <div className="space-y-4">
            <Section title="On this Wi-Fi">
              {!data.lan.enabled ? (
                <div className="space-y-2.5">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Share with devices on the same network. A per-run access
                    code keeps it private.
                  </p>
                  <button
                    className={PRIMARY_BTN}
                    disabled={busy === "lan"}
                    onClick={() => run("lan", () => setMobileLan(true))}
                  >
                    Start sharing
                  </button>
                </div>
              ) : data.lan.urls.length === 0 ? (
                <div className="space-y-2.5">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    No network address found on this machine — use the tunnel
                    below instead.
                  </p>
                  <button
                    className={SUBTLE_BTN}
                    disabled={busy === "lan"}
                    onClick={() => run("lan", () => setMobileLan(false))}
                  >
                    Stop sharing
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <QrSvg value={data.lan.urls[0]} />
                  {data.lan.urls.slice(1).map((url) => (
                    <UrlRow key={url} url={url} />
                  ))}
                  <TokenRow token={data.token} />
                  <button
                    className={SUBTLE_BTN}
                    disabled={busy === "lan"}
                    onClick={() => run("lan", () => setMobileLan(false))}
                  >
                    Stop sharing
                  </button>
                </div>
              )}
            </Section>

            <div className="border-t border-neutral-200 pt-4 dark:border-neutral-700" />

            <Section title="From anywhere">
              {!tunnel || tunnel.state === "off" ? (
                <div className="space-y-2.5">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Not on the same network? A private tunnel gives your phone
                    secure access from anywhere.
                  </p>
                  <button
                    className={PRIMARY_BTN}
                    disabled={tunnelBusy}
                    onClick={() => run("tunnel", () => setMobileTunnel(true))}
                  >
                    Start tunnel
                  </button>
                </div>
              ) : tunnel.state === "downloading" ? (
                <DownloadProgress bytes={tunnel.bytes} total={tunnel.total} />
              ) : tunnel.state === "starting" ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Connecting tunnel…
                </p>
              ) : tunnel.state === "on" ? (
                <div className="space-y-2.5">
                  <QrSvg value={tunnel.url} />
                  <UrlRow url={tunnel.url} />
                  <TokenRow token={data.token} />
                  <button
                    className={SUBTLE_BTN}
                    disabled={tunnelBusy}
                    onClick={() => run("tunnel", () => setMobileTunnel(false))}
                  >
                    Stop tunnel
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-sm text-rose-500">{tunnel.error}</p>
                  <div className="flex gap-3">
                    <button
                      className={PRIMARY_BTN}
                      disabled={tunnelBusy}
                      onClick={() => run("tunnel", () => setMobileTunnel(true))}
                    >
                      Retry
                    </button>
                    <button
                      className={`${SUBTLE_BTN} self-center`}
                      disabled={tunnelBusy}
                      onClick={() => run("tunnel", () => setMobileTunnel(false))}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
              <p className="text-xs leading-relaxed text-neutral-400">
                Routed through Cloudflare's free quick-tunnel service (needs
                internet). The helper (~30&nbsp;MB) downloads once and is
                cached.
              </p>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
