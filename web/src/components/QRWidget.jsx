import { useEffect, useMemo, useState } from "react";
import { fetchMobileStatus, setMobileLan, setMobileTunnel } from "../api";
import { formatBytes } from "../format";
import { qrMatrix } from "../vendor/qr";

const PRIMARY_BTN =
  "rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors  disabled:cursor-default disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 hover:bg-neutral-800 flex gap-2 items-center cursor-pointer";
const SUBTLE_BTN =
  "text-sm text-neutral-500 transition-colors hover:text-neutral-800 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-200";

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
      className="shrink-0 text-sm text-sky-600 transition-colors hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function UrlRow({ url }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 dark:border-neutral-700 dark:bg-neutral-900">
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-neutral-600 dark:text-neutral-300">
        {url}
      </span>
      <CopyButton text={url} />
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-1.5 text-base font-medium uppercase text-neutral-400">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function WifiIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <path d="M12 20h.01" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      className="mt-0.5 h-3.5 w-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
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
    <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 hidden">
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

export default function QRWidget({ onClose }) {
  const [state, setState] = useState({ status: "loading" });
  const [busy, setBusy] = useState(null); // 'lan' | 'tunnel' while a toggle is in flight

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const data = await fetchMobileStatus();
        if (alive) setState({ status: "ok", data });
      } catch (e) {
        if (alive)
          setState((prev) =>
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
    tunnel?.state === "downloading" ||
    tunnel?.state === "starting" ||
    busy === "tunnel";

  return (
    <section>
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40">
        <div className="flex items-start justify-between pb-3">
          <div>
            <h2 className="font-medium text-neutral-900 dark:text-neutral-100">
              Open on your phone
            </h2>
            <p className="mt-1 text-xs text-neutral-400">
              Choose how your phone will connect.
            </p>
          </div>
        </div>

        {state.status === "loading" && (
          <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>
        )}

        {state.status === "error" && (
          <div className="space-y-1 py-8 text-center">
            <p className="text-sm text-rose-500">{state.message}</p>
            <p className="text-sm text-neutral-400">
              This needs the readingroom server that came with this UI.
            </p>
          </div>
        )}

        {data && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-col-1 lg:grid-cols-2">
              <Section title="Same Wi-Fi" icon={<WifiIcon />}>
                {!data.lan.enabled ? (
                  <div className="space-y-2.5">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Fastest option when both devices are on the same network /
                      same Wi-Fi.
                    </p>
                    <button
                      className={PRIMARY_BTN + " bg-cyan-800 text-white"}
                      disabled={busy === "lan"}
                      onClick={() => run("lan", () => setMobileLan(true))}
                    >
                      <WifiIcon />
                      <span className="ml-1">Open on this Wi-Fi</span>
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
                    <p className="text-center text-sm text-neutral-400">
                      Works only on this Wi-Fi
                    </p>
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

              <Section title="Any network" icon={<GlobeIcon />}>
                {!tunnel || tunnel.state === "off" ? (
                  <div className="space-y-2.5">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Using mobile data, another Wi-Fi, or connect remotely.
                    </p>
                    <button
                      className={PRIMARY_BTN + " bg-purple-800 text-white"}
                      disabled={tunnelBusy}
                      onClick={() => run("tunnel", () => setMobileTunnel(true))}
                    >
                      <GlobeIcon />
                      <span className="ml-1">Open from anywhere</span>
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
                    <p className="text-center text-sm text-neutral-400">
                      Works from any network
                    </p>
                    <UrlRow url={tunnel.url} />
                    <TokenRow token={data.token} />
                    <button
                      className={SUBTLE_BTN}
                      disabled={tunnelBusy}
                      onClick={() =>
                        run("tunnel", () => setMobileTunnel(false))
                      }
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
                        onClick={() =>
                          run("tunnel", () => setMobileTunnel(true))
                        }
                      >
                        Retry
                      </button>
                      <button
                        className={`${SUBTLE_BTN} self-center`}
                        disabled={tunnelBusy}
                        onClick={() =>
                          run("tunnel", () => setMobileTunnel(false))
                        }
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </Section>
            </div>

            <div className="border-t border-neutral-200 my-4 dark:border-neutral-700" />

            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-neutral-400">
              <LockIcon />
              <span>
                Uses a secure internet tunnel service from Cloudflare.{" "}
                <a
                  href="https://developers.cloudflare.com/tunnel/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-600 underline-offset-2 hover:text-sky-500 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
                >
                  Learn more
                </a>
              </span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
