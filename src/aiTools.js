import { constants, accessSync, statSync } from "node:fs";
import path from "node:path";
import { userInfo } from "node:os";
import pty from "node-pty";

export const AI_TOOLS = [
  {
    id: "codex",
    name: "Codex",
    command: "codex",
    url: "https://developers.openai.com/codex/cli",
  },
  {
    id: "claude",
    name: "Claude Code",
    command: "claude",
    url: "https://code.claude.com/docs/en/overview",
  },
  {
    id: "opencode",
    name: "OpenCode",
    command: "opencode",
    url: "https://opencode.ai/",
  },
  {
    id: "pi",
    name: "Pi",
    command: "pi",
    url: "https://github.com/badlogic/pi-mono",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    command: "copilot",
    url: "https://github.com/features/copilot/cli",
  },
  {
    id: "hermes",
    name: "Hermes",
    command: "hermes",
    url: "https://hermes-agent.nousresearch.com/",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    command: "gemini",
    url: "https://github.com/google-gemini/gemini-cli",
  },
];

function executable(command) {
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";")
      : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.resolve(dir, command + ext.toLowerCase());
      try {
        if (statSync(candidate).isFile()) {
          accessSync(
            candidate,
            process.platform === "win32" ? constants.F_OK : constants.X_OK,
          );
          return candidate;
        }
      } catch {
        /* try the next PATH entry */
      }
    }
  }
  return null;
}

export function installedAiTools() {
  return [
    {
      id: "terminal",
      name: "Terminal",
      description: "Run any tools available in your CLI.",
      installed: true,
    },
    ...AI_TOOLS.map(({ id, name, url, command }) => ({
      id,
      name,
      url,
      installed: Boolean(executable(command)),
    })),
  ];
}

export function startAiPty(id, cwd) {
  let binary;
  if (id === "terminal") {
    binary =
      process.platform === "win32"
        ? process.env.COMSPEC || "cmd.exe"
        : process.env.SHELL || userInfo().shell || "/bin/sh";
  } else {
    const tool = AI_TOOLS.find((item) => item.id === id);
    if (!tool) throw new Error("unknown tool");
    binary = executable(tool.command);
    if (!binary) throw new Error(`${tool.name} is not installed`);
  }
  return pty.spawn(binary, [], {
    cwd,
    cols: 80,
    rows: 24,
    name: "xterm-256color",
    env: { ...process.env, TERM: "xterm-256color" },
  });
}
