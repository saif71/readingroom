import { timeAgo } from "../format";
import commandsIcon from "../icons/commands.svg";

export default function CommandsWidget({ commands, onOpen }) {
  if (commands.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40"
      aria-labelledby="commands-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="commands-heading"
            className="font-medium text-neutral-900 dark:text-neutral-100"
          >
            Custom commands
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Slash commands and reusable prompts from .claude/commands,
            .cursor/commands, .agents/commands and .github/prompts
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {commands.length}
        </span>
      </div>
      <ol className="mt-4 space-y-0.5">
        {commands.map((command) => (
          <li key={command.path}>
            <button
              type="button"
              onClick={() => onOpen(command.path)}
              title={command.path}
              aria-label={`Open command ${command.name} (${command.path})`}
              className="group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 dark:hover:bg-neutral-800/70"
            >
              <img
                src={commandsIcon}
                alt={command.sourceDir}
                className="w-4 h-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-800 group-hover:text-sky-700 dark:text-neutral-200 dark:group-hover:text-sky-300">
                  /{command.name}
                </span>
                <span className="block truncate text-xs text-neutral-400">
                  {command.description || command.path}
                </span>
              </span>
              <span
                className="shrink-0 text-right text-xs text-neutral-400"
                title={command.updatedAt || undefined}
              >
                {timeAgo(command.updatedAt) || ""}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
