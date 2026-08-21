import { timeAgo } from "../format";
import gemini from "../icons/gemini.md.svg";
import claude from "../icons/claude.md.svg";
import agents from "../icons/agents.md.svg";

const TOOL_BY_NAME = {
  "CLAUDE.md": "Claude",
  "AGENTS.md": "Agents",
  "GEMINI.md": "Gemini",
  "QWEN.md": "Qwen",
  "copilot-instructions.md": "Copilot",
  ".cursorrules": "Cursor",
  ".windsurfrules": "Windsurf",
  ".clinerules": "Cline",
};

function toolLabel(filePath) {
  const name = TOOL_BY_NAME[filePath.split("/").pop()];
  if (name) return name;
  if (filePath.startsWith(".cursor/rules/")) return "Cursor";
  if (filePath.startsWith(".github/instructions/")) return "Copilot";
  return "AI";
}

const ICON_BY_TOOL = {
  Gemini: gemini,
  Claude: claude,
};

function toolIcon(filePath) {
  return ICON_BY_TOOL[toolLabel(filePath)] ?? agents;
}

export default function AgentInstructionsWidget({ files, onOpen }) {
  if (files.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40"
      aria-labelledby="agent-instructions-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="agent-instructions-heading"
            className="font-medium text-neutral-900 dark:text-neutral-100"
          >
            Agent instructions
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Instruction files that configure AI coding agents, anywhere in the
            project
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {files.length}
        </span>
      </div>
      <ol className="mt-4 space-y-0.5">
        {files.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              onClick={() => onOpen(file.path)}
              title={file.path}
              aria-label={`Open ${file.path}`}
              className="group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 dark:hover:bg-neutral-800/70"
            >
              <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400 hidden">
                {toolLabel(file.path)}
              </span>
              <img
                src={toolIcon(file.path)}
                alt={toolLabel(file.path)}
                className="w-4 h-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-800 group-hover:text-sky-700 dark:text-neutral-200 dark:group-hover:text-sky-300">
                  {file.name}
                </span>
                <span className="block truncate text-xs text-neutral-400">
                  {file.path}
                </span>
              </span>
              <span
                className="shrink-0 text-right text-xs text-neutral-400"
                title={file.updatedAt || undefined}
              >
                {timeAgo(file.updatedAt) || ""}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
