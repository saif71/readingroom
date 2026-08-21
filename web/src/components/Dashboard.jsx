import { useMemo } from "react";
import AgentInstructionsWidget from "./AgentInstructionsWidget";
import CommandsWidget from "./CommandsWidget";
import FileTypesWidget from "./FileTypesWidget";
import OverviewWidget from "./OverviewWidget";
import RankedFilesWidget from "./RankedFilesWidget";
import QRWidget from "./QRWidget";
import SkillsWidget from "./SkillsWidget";
import folderIcon from "../icons/folder.svg";

const CATEGORIES = [
  "markdown",
  "images",
  "pdfs",
  "text",
  "json",
  "code",
  "other",
];

// Mirrors the detection in src/dashboard.js so the fallback (used when
// /api/dashboard is unreachable) still surfaces these widgets.
const AGENT_INSTRUCTION_NAMES = new Set([
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  "QWEN.md",
  "copilot-instructions.md",
  ".cursorrules",
  ".windsurfrules",
  ".clinerules",
]);
const AGENT_INSTRUCTION_PATH_RES = [
  /^\.cursor\/rules\/[^/]+\.(md|mdc)$/,
  /^\.github\/instructions\/[^/]+\.instructions\.md$/,
];
const SKILL_FILE_RE = /^\.(claude|agents|cursor)\/skills\/([^/]+)\/SKILL\.md$/;
const COMMAND_FILE_RE = /^\.(claude|agents|cursor)\/commands\/([^/]+)\.md$/;
const PROMPT_FILE_RE = /^\.github\/prompts\/([^/]+)\.md$/;

function commandMeta(filePath) {
  const match = COMMAND_FILE_RE.exec(filePath);
  if (match) return { name: match[2], sourceDir: `.${match[1]}` };
  const prompt = PROMPT_FILE_RE.exec(filePath);
  if (prompt) return { name: prompt[1], sourceDir: ".github" };
  return null;
}

function isAgentInstructionFile(filePath) {
  if (AGENT_INSTRUCTION_NAMES.has(filePath.split("/").pop())) return true;
  return AGENT_INSTRUCTION_PATH_RES.some((re) => re.test(filePath));
}

function fallbackDashboard(tree) {
  const files = [];
  let directoryCount = 0;
  function walk(node) {
    for (const child of node.children || []) {
      if (child.type === "file") files.push(child);
      else {
        directoryCount += 1;
        walk(child);
      }
    }
  }
  walk(tree);

  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category, 0]),
  );
  let totalBytes = 0;
  const rows = files.map((file) => {
    const category = file.category || "other";
    byCategory[category] = (byCategory[category] || 0) + 1;
    totalBytes += file.size;
    const updatedAt = new Date(file.mtime).toISOString();
    return {
      path: file.path,
      name: file.name,
      kind: file.kind,
      category,
      size: file.size,
      updatedAt,
      updatedSource: "filesystem",
    };
  });

  const depth = (file) => (file.path.match(/\//g) || []).length;
  const agentInstructions = rows
    .filter((file) => isAgentInstructionFile(file.path))
    .sort((a, b) => depth(a) - depth(b) || a.path.localeCompare(b.path));
  const skills = rows
    .flatMap((file) => {
      const match = SKILL_FILE_RE.exec(file.path);
      return match
        ? [
            {
              name: match[2],
              sourceDir: `.${match[1]}`,
              description: null,
              path: file.path,
              size: file.size,
              updatedAt: file.updatedAt,
            },
          ]
        : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  const commands = rows
    .flatMap((file) => {
      const meta = commandMeta(file.path);
      return meta
        ? [
            {
              ...meta,
              description: null,
              path: file.path,
              size: file.size,
              updatedAt: file.updatedAt,
            },
          ]
        : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

  return {
    fileCount: files.length,
    directoryCount,
    totalBytes,
    byCategory,
    gitAvailable: false,
    recent: [...rows]
      .sort(
        (a, b) =>
          new Date(b.updatedAt) - new Date(a.updatedAt) ||
          a.path.localeCompare(b.path),
      )
      .slice(0, 10),
    oldest: [...rows]
      .sort(
        (a, b) =>
          new Date(a.updatedAt) - new Date(b.updatedAt) ||
          a.path.localeCompare(b.path),
      )
      .slice(0, 10),
    agentInstructions,
    skills,
    commands,
  };
}

function timestampSummary(data) {
  const gitCount = data.recent.filter(
    (file) => file.updatedSource === "git",
  ).length;
  if (gitCount === 0) return "";
  return "";
}

export default function Dashboard({ tree, data, error, loading, onOpen }) {
  const fallback = useMemo(() => fallbackDashboard(tree), [tree]);
  const model = data || fallback;
  const errorMessage = error
    ? "Full inventory unavailable; showing previewable-file fallback."
    : timestampSummary(model);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            <img
              src={folderIcon}
              alt="Folder icon"
              className="inline-block w-8 h-8 mr-2"
            />
            {tree.name} overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
            All non-ignored files — .gitignore rules and dependency/build
            folders are excluded.
          </p>
        </div>
        <p
          className="text-xs text-neutral-400"
          title={loading ? "Refreshing dashboard data" : undefined}
        >
          {loading ? "Updating…" : errorMessage}
        </p>
      </header>

      {!data && loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-neutral-200/80 bg-white p-8 text-sm text-neutral-400 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40">
          Loading full project inventory…
        </div>
      ) : (
        <div className="space-y-4">
          <OverviewWidget
            fileCount={model.fileCount}
            directoryCount={model.directoryCount}
            totalBytes={model.totalBytes}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="grid-1 space-y-4">
              <AgentInstructionsWidget
                files={model.agentInstructions || []}
                onOpen={onOpen}
              />
              <FileTypesWidget byCategory={model.byCategory} />
              <RankedFilesWidget
                title="Oldest updated"
                description="Non-ignored files with the oldest filesystem modification time"
                files={model.oldest}
                emptyMessage="No non-ignored files yet."
                onOpen={onOpen}
              />
            </div>
            <div className="grid-2 space-y-4">
              <SkillsWidget skills={model.skills || []} onOpen={onOpen} />
              <CommandsWidget commands={model.commands || []} onOpen={onOpen} />
              <QRWidget />
              <RankedFilesWidget
                title="Recently updated"
                description="Latest Git commit, or filesystem time when Git is unavailable"
                files={model.recent}
                emptyMessage="No files have a usable update timestamp."
                onOpen={onOpen}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
