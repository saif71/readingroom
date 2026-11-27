// node-pty@1.1.0 ships its macOS prebuilt `spawn-helper` without the
// executable bit, and its own install script only repairs `build/Release`.
// Without this, the terminal fails to start with "posix_spawnp failed".
// Best effort: only touch a file that exists, and never fail the install.
import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform === "darwin") {
  const require = createRequire(import.meta.url);
  let nodePtyDir = null;
  try {
    nodePtyDir = dirname(require.resolve("node-pty/package.json"));
  } catch {
    // node-pty may not be installed (e.g. installs with --omit=optional).
  }
  const dir =
    nodePtyDir ||
    fileURLToPath(new URL("../node_modules/node-pty", import.meta.url));
  const helper = join(dir, "prebuilds", `darwin-${process.arch}`, "spawn-helper");
  try {
    if (existsSync(helper)) chmodSync(helper, 0o755);
  } catch {
    // Read-only or unconventional install — leave it alone.
  }
}