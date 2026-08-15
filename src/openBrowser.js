import { spawn } from 'node:child_process';

function commandFor(target) {
  if (process.platform === 'darwin') return { cmd: 'open', args: [target] };
  if (process.platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', target] };
  return { cmd: 'xdg-open', args: [target] };
}

/**
 * Open a URL or file with the system default handler.
 * Resolves false when the platform opener is missing (e.g. headless Linux
 * without xdg-open) or cannot be spawned.
 */
export function openExternal(target) {
  return new Promise((resolve) => {
    const { cmd, args } = commandFor(target);
    try {
      const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
      // 'spawn' fires once the process launches; a missing binary surfaces
      // as an 'error' event instead. Exactly one of the two settles this.
      child.on('spawn', () => resolve(true));
      child.on('error', () => resolve(false));
      child.unref();
    } catch {
      resolve(false);
    }
  });
}

export function openBrowser(url) {
  // Opening the browser is best-effort; the URL is printed regardless.
  openExternal(url);
}
