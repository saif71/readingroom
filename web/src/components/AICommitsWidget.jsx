import { timeAgo } from "../format";
import aiIcon from "../icons/ai.svg";

// Bar/dot colors per assistant, mirroring the detection table in src/git.js.
const TOOL_STYLES = [
  { id: "claude", label: "Claude", color: "bg-orange-500" },
  { id: "copilot", label: "Copilot", color: "bg-sky-500" },
  { id: "cursor", label: "Cursor", color: "bg-neutral-500" },
  { id: "gemini", label: "Gemini", color: "bg-blue-500" },
  { id: "codex", label: "Codex", color: "bg-emerald-500" },
];

function shareLabel(share) {
  const pct = share * 100;
  if (pct > 0 && pct < 10 && !Number.isInteger(pct)) return pct.toFixed(1);
  return String(Math.round(pct));
}

export default function AICommitsWidget({ aiCommits }) {
  if (!aiCommits || aiCommits.scanned === 0 || aiCommits.aiCount === 0) return null;

  const { scanned, aiCount, share, byTool, topFiles, latestAiAt } = aiCommits;
  const styleById = Object.fromEntries(TOOL_STYLES.map((tool) => [tool.id, tool]));

  return (
    <section
      className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40"
      aria-labelledby="ai-commits-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="ai-commits-heading"
            className="flex items-center gap-1.5 font-medium text-neutral-900 dark:text-neutral-100"
          >
            <img src={aiIcon} alt="" className="h-4 w-4" />
            AI-authored commits
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Recent commits carrying an AI co-author or “Generated with”
            trailer
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {aiCount.toLocaleString()} of {scanned.toLocaleString()}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <span className="text-4xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">
          {shareLabel(share)}%
        </span>
        <span className="text-sm text-neutral-400">
          of the last {scanned.toLocaleString()} commits were AI-assisted
        </span>
      </div>

      <div
        className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
        role="img"
        aria-label={`${aiCount} of ${scanned} recent commits were AI-assisted`}
      >
        {byTool.map((tool) => (
          <div
            key={tool.id}
            title={`${tool.label}: ${tool.count}`}
            className={styleById[tool.id]?.color || "bg-neutral-400"}
            style={{ width: `${(tool.count / scanned) * 100}%` }}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {byTool.map((tool) => (
          <span
            key={tool.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${styleById[tool.id]?.color || "bg-neutral-400"}`}
            />
            {tool.label} · {tool.count}
          </span>
        ))}
        {latestAiAt && (
          <span className="px-1 text-xs text-neutral-400" title={latestAiAt}>
            last AI commit {timeAgo(latestAiAt)}
          </span>
        )}
      </div>

      {topFiles.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Touched most by AI commits
          </p>
          <ul className="mt-1.5 space-y-1">
            {topFiles.map((file) => (
              <li
                key={file.path}
                className="flex items-baseline justify-between gap-3"
              >
                <span
                  className="min-w-0 truncate font-mono text-xs text-neutral-600 dark:text-neutral-300"
                  title={file.path}
                >
                  {file.path}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                  {file.count.toLocaleString()}×
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
