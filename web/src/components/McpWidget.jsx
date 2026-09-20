import { timeAgo } from "../format";

export default function McpWidget({ servers, onOpen }) {
  if (servers.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40"
      aria-labelledby="mcp-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="mcp-heading"
            className="font-medium text-neutral-900 dark:text-neutral-100"
          >
            MCP Servers
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Model Context Protocol servers configured for AI agents
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {servers.length}
        </span>
      </div>
      <ol className="mt-4 space-y-0.5">
        {servers.map((server) => (
          <li key={server.name}>
            <button
              type="button"
              onClick={() => {
                // For config files, open the source file
                if (server.source) {
                  onOpen(server.source);
                }
              }}
              title={server.name}
              aria-label={`Open MCP server ${server.name}`}
              className="group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 dark:hover:bg-neutral-800/70"
            >
              <div className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 text-[9px] font-semibold uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                {/* Determine transport type for icon */}
                {server.type === "http" || server.type === "sse" ? (
                  <span className="text-blue-500">🌐</span>
                ) : (
                  <span className="text-green-500">⌨️</span>
                )}
              </div>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-800 group-hover:text-sky-700 dark:text-neutral-200 dark:group-hover:text-sky-300">
                  {server.name}
                </span>
                {server.source && (
                  <span className="block truncate text-xs text-neutral-400">
                    {server.source}
                  </span>
                )}
                {server.env && server.env.length > 0 && (
                  <span className="block flex-1 text-xs text-neutral-400">
                    {server.env.length} env var{server.env.length > 1 ? "s" : ""}
                  </span>
                )}
              </span>
              <span
                className="shrink-0 text-right text-xs text-neutral-400"
                title={server.updatedAt || undefined}
              >
                {/* We don't have updatedAt for MCP servers in v1 */}
                –
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}