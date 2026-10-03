import { lazy, Suspense, useEffect, useState } from "react";
import { fetchAiTools } from "../api";
import CommandsIcon from "../icons/commands.svg";
import CopilotIcon from "../icons/copilot.png";
import CodexIcon from "../icons/codex.png";
import claudeIcon from "../icons/claude.png";
import piIcon from "../icons/pi.png";
import antigravityIcon from "../icons/antigravity.png";
import hermesIcon from "../icons/hermes.png";

const AiTerminal = lazy(() => import("./AiTerminal"));

const marks = {
  codex: CodexIcon,
  claude: claudeIcon,
  opencode: CommandsIcon,
  pi: piIcon,
  copilot: CopilotIcon,
  gemini: antigravityIcon,
  hermes: hermesIcon,
};

export default function AiSidebar() {
  const [tools, setTools] = useState(null);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(null);

  async function refresh() {
    setError(null);
    try {
      setTools(await fetchAiTools());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const terminal = tools?.find((tool) => tool.id === "terminal");
  const installed =
    tools?.filter((tool) => tool.installed && tool.id !== "terminal") || [];
  const available = tools?.filter((tool) => !tool.installed) || [];

  if (active)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <button
          type="button"
          onClick={() => setActive(null)}
          className="self-start text-xs text-sky-700 hover:underline dark:text-sky-400"
        >
          ← Close session
        </button>
        <Suspense
          fallback={
            <p className="text-sm text-neutral-500">Opening terminal…</p>
          }
        >
          <AiTerminal tool={active} />
        </Suspense>
      </div>
    );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 text-sm">
      <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
        Open a terminal or AI tool here, working in this project.
      </p>
      {terminal && (
        <button
          type="button"
          onClick={() => setActive(terminal)}
          className="mb-4 flex w-full items-center gap-3 rounded-lg px-4 py-4 text-left bg-white dark:bg-neutral-900 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60 cursor-pointer hover:pl-6 transition-all"
        >
          <img
            src={CommandsIcon}
            alt="Terminal icon"
            className="inline-block w-8 h-8 fill-white dark:fill-neutral-900"
          />
          <span className="flex-1">
            <span className="block">Terminal</span>
            <span className="block text-xs text-neutral-500 dark:text-neutral-400">
              {terminal.description}
            </span>
          </span>
          <span className="text-xs text-neutral-400">Open →</span>
        </button>
      )}
      {!tools && !error && (
        <p className="text-neutral-500">Looking for AI tools…</p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {tools && installed.length === 0 && (
        <p className="mb-4 text-neutral-500 dark:text-neutral-400">
          No AI CLI found. Install any tool you like or already have access to.
        </p>
      )}
      {installed.length > 0 && (
        <p className="my-5 text-xs font-medium text-neutral-500">
          Installed AI tools
        </p>
      )}
      <div className="space-y-1 grid grid-cols-3 gap-2">
        {installed.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => setActive(tool)}
            className="flex flex-col w-full items-center gap-1 rounded-lg px-4 py-2 text-left hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60  dark:bg-neutral-700/60 bg-white cursor-pointer hover:pl-6 transition-all"
          >
            <img
              src={marks[tool.id]}
              alt="Terminal icon"
              className="inline-block w-8 h-8 fill-white dark:fill-neutral-900"
            />

            <span>{tool.name}</span>
            <span className="text-xs text-neutral-400">Open →</span>
          </button>
        ))}
      </div>
      {available.length > 0 && (
        <>
          <p className="my-5 text-xs font-medium text-neutral-500">
            Other tools
          </p>
          <div className="space-y-1">
            {available.map((tool) => (
              <a
                key={tool.id}
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-neutral-500 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60"
              >
                <span>{tool.name}</span>
                <span className="ml-auto text-xs">Install ↗</span>
              </a>
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={refresh}
        className="mt-5 text-xs text-sky-700 hover:underline dark:text-sky-400"
      >
        Check again
      </button>
    </div>
  );
}
