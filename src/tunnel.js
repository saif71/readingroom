import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

// Pinning matters: a downloaded binary's `--version` output must match this
// string, otherwise the tunnel refuses to start.
const CLOUDFLARED_VERSION = "2026.8.2";
const RELEASE_BASE =
  "https://github.com/cloudflare/cloudflared/releases/download";

const PLATFORM_ASSETS = {
  "darwin-arm64": { file: "cloudflared-darwin-arm64.tgz", archive: "tgz" },
  "darwin-x64": { file: "cloudflared-darwin-amd64.tgz", archive: "tgz" },
  "linux-x64": { file: "cloudflared-linux-amd64", archive: null },
  "linux-arm64": { file: "cloudflared-linux-arm64", archive: null },
  "win32-x64": { file: "cloudflared-windows-amd64.exe", archive: null },
};

const URL_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

export function currentPlatformKey() {
  return `${process.platform}-${process.arch}`;
}

export function assetInfo(platformKey = currentPlatformKey()) {
  return PLATFORM_ASSETS[platformKey] || null;
}

export function downloadUrl(platformKey = currentPlatformKey()) {
  const asset = assetInfo(platformKey);
  if (!asset) return null;
  return `${RELEASE_BASE}/${CLOUDFLARED_VERSION}/${asset.file}`;
}

export function cacheDir() {
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA ||
        path.join(process.env.USERPROFILE || tmpdir(), "AppData", "Local"),
      "readingroom",
      "cache",
    );
  }
  if (process.platform === "darwin") {
    return path.join(
      process.env.HOME || tmpdir(),
      "Library",
      "Caches",
      "readingroom",
    );
  }
  return path.join(
    process.env.XDG_CACHE_HOME || process.env.HOME || tmpdir(),
    process.env.XDG_CACHE_HOME ? "readingroom" : ".cache/readingroom",
  );
}

/** Extract the first regular file from an uncompressed tar buffer. */
export function untarSingleFile(tar) {
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeField = header
      .subarray(124, 136)
      .toString("utf8")
      .replace(/\0.*$/, "")
      .trim();
    const size = parseInt(sizeField, 8) || 0;
    const type = header[156];
    const dataStart = offset + 512;
    // Type '0' or NUL is a regular file; skip directories ('5') and the rest.
    if ((type === 0x30 || type === 0x00) && name) {
      return tar.subarray(dataStart, dataStart + size);
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error("no regular file found in tar archive");
}

function spawnCapture(bin, args, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    let done = false;
    let out = "";
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        child.kill("SIGKILL");
        resolve(null);
      }
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
    child.on("close", () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(out);
      }
    });
  });
}

export async function binaryVersion(binPath) {
  const out = await spawnCapture(binPath, ["--version"]);
  if (!out) return null;
  const m = out.match(/cloudflared version ([0-9][^\s)]*)/i);
  return m ? m[1] : null;
}

/**
 * Make sure a working cloudflared binary exists in the cache dir, downloading
 * it on first use (one time). Returns its path. `onProgress({ phase,
 * bytes, total })` reports download progress; total is null when the response
 * has no content-length.
 */
export async function ensureCloudflared({ onProgress } = {}) {
  const asset = assetInfo();
  if (!asset) {
    throw new Error(`no cloudflared build for ${currentPlatformKey()}`);
  }
  const dir = cacheDir();
  const binPath = path.join(
    dir,
    `cloudflared-${CLOUDFLARED_VERSION}-${currentPlatformKey()}`,
  );

  if (existsSync(binPath) && statSync(binPath).size > 0) {
    const version = await binaryVersion(binPath);
    if (version === CLOUDFLARED_VERSION) return binPath;
    // Corrupt or wrong-version cache entry: drop it and redownload.
    rmSync(binPath, { force: true });
  }

  mkdirSync(dir, { recursive: true });
  const res = await fetch(downloadUrl(), {
    redirect: "follow",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`could not download cloudflared (HTTP ${res.status})`);
  }
  const total = Number(res.headers.get("content-length")) || null;
  let received = 0;
  const chunks = [];
  for await (const chunk of res.body) {
    chunks.push(chunk);
    received += chunk.length;
    onProgress?.({ phase: "downloading", bytes: received, total });
  }
  let buffer = Buffer.concat(chunks);
  if (asset.archive === "tgz") {
    buffer = untarSingleFile(gunzipSync(buffer));
  }

  // Write to a temp dir and rename into place so a killed download never
  // leaves a half-written binary that looks cached.
  const tmp = mkdtempSync(path.join(dir, ".download-"));
  try {
    const tmpPath = path.join(tmp, "cloudflared");
    writeFileSync(tmpPath, buffer);
    if (process.platform !== "win32") chmodSync(tmpPath, 0o755);
    renameSync(tmpPath, binPath);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const version = await binaryVersion(binPath);
  if (version !== CLOUDFLARED_VERSION) {
    rmSync(binPath, { force: true });
    throw new Error(
      version
        ? `downloaded cloudflared reports version ${version}, expected ${CLOUDFLARED_VERSION}`
        : "downloaded cloudflared binary failed to run",
    );
  }
  return binPath;
}

const TUNNEL_URL_RE = /https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/i;

/** Pull the public quick-tunnel URL out of cloudflared's log output. */
export function parseTunnelUrl(text) {
  const m = String(text).match(TUNNEL_URL_RE);
  return m ? m[0] : null;
}

/**
 * Start a Cloudflare quick tunnel (trycloudflare.com, no account needed)
 * pointing at a local HTTP server. Resolves as soon as the public URL is
 * known. Returns { url, host, stop() }.
 *
 * `onProgress` mirrors ensureCloudflared. `onUnexpectedExit(message)` fires if
 * the child dies on its own after a successful start (network drop etc.).
 */
export async function startQuickTunnel({
  targetPort,
  onProgress,
  onUnexpectedExit,
}) {
  const binPath = await ensureCloudflared({ onProgress });
  onProgress?.({ phase: "starting" });

  const child = spawn(
    binPath,
    ["tunnel", "--url", `http://127.0.0.1:${targetPort}`, "--no-autoupdate"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  let stopped = false;
  let urlFound = false;
  let stderr = "";

  const stop = () =>
    new Promise((resolve) => {
      if (stopped) return resolve();
      stopped = true;
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
      child.once("exit", () => {
        clearTimeout(killTimer);
        resolve();
      });
      child.kill("SIGTERM");
    });

  return await new Promise((resolve, reject) => {
    const urlTimer = setTimeout(() => {
      reject(new Error("tunnel did not come up in time"));
      stop();
    }, URL_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(urlTimer);
      reject(new Error(`could not run cloudflared: ${err.message}`));
    });

    const describeExit = (code, signal) =>
      `${signal || `code ${code}`}${stderr.trim() ? ` — ${stderr.slice(-400).trim()}` : ""}`;

    child.stderr.on("data", (chunk) => {
      if (stderr.length < 8_000) stderr += chunk.toString("utf8");
      if (urlFound) return;
      const url = parseTunnelUrl(stderr);
      if (url) {
        urlFound = true;
        clearTimeout(urlTimer);
        resolve({
          url,
          host: new URL(url).hostname,
          stop: async () => {
            await stop();
          },
        });
      }
    });

    child.on("exit", (code, signal) => {
      clearTimeout(urlTimer);
      if (stopped) return;
      if (urlFound) {
        onUnexpectedExit?.(
          `cloudflared stopped (${describeExit(code, signal)})`,
        );
      } else {
        reject(
          new Error(
            `cloudflared exited before the tunnel was ready (${describeExit(code, signal)})`,
          ),
        );
      }
    });
  });
}
