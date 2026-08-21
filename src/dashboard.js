import { readFileSync } from 'node:fs';
import path from 'node:path';
import { latestCommitDates } from './git.js';

const CATEGORIES = ['markdown', 'images', 'pdfs', 'text', 'json', 'code', 'other'];
const RANK_LIMIT = 10;

// Instruction files AI coding agents read, matched by basename anywhere in
// the tree (AGENTS.md is often nested per-package in monorepos).
const AGENT_INSTRUCTION_NAMES = new Set([
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  'QWEN.md',
  'copilot-instructions.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
]);

// Instruction files identified by location rather than basename.
const AGENT_INSTRUCTION_PATH_RES = [
  /^\.cursor\/rules\/[^/]+\.(md|mdc)$/,
  /^\.github\/instructions\/[^/]+\.instructions\.md$/,
];

// A skill is a folder directly under a skills directory containing SKILL.md.
const SKILL_FILE_RE = /^\.(claude|agents|cursor)\/skills\/([^/]+)\/SKILL\.md$/;

function isAgentInstructionFile(rel) {
  if (AGENT_INSTRUCTION_NAMES.has(rel.split('/').pop())) return true;
  return AGENT_INSTRUCTION_PATH_RES.some((re) => re.test(rel));
}

// Extract `description:` from SKILL.md YAML frontmatter. Single-line and
// block-scalar (>, |) forms are supported; anything else degrades to null.
function parseSkillDescription(text) {
  const lines = text.split(/\r?\n/);
  let inFrontmatter = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFrontmatter) {
      if (line.trim() === '---') inFrontmatter = true;
      continue;
    }
    if (line === '---' || line === '...') return null;
    const match = line.match(/^description:[ \t]*(.*)$/);
    if (!match) continue;
    const value = match[1].trim();
    if (value && !/^[|>][+-]?$/.test(value)) {
      return value.replace(/^["']|["']$/g, '').slice(0, 300);
    }
    const parts = [];
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) {
      parts.push(lines[j].trim());
    }
    return parts.join(' ').slice(0, 300) || null;
  }
  return null;
}

function skillDescription(rootAbs, rel) {
  try {
    return parseSkillDescription(readFileSync(path.join(rootAbs, rel), 'utf8').slice(0, 4096));
  } catch {
    return null;
  }
}

function collectFiles(node, files = [], directories = []) {
  for (const child of node.children || []) {
    if (child.type === 'file') files.push(child);
    else {
      directories.push(child);
      collectFiles(child, files, directories);
    }
  }
  return { files, directories };
}

function isoFromMtime(mtime) {
  const date = new Date(mtime);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dashboardFile(file, updatedAt, updatedSource) {
  return {
    path: file.path,
    name: file.name,
    kind: file.kind,
    category: file.category || 'other',
    size: file.size,
    updatedAt,
    updatedSource,
  };
}

function byDate(direction) {
  return (a, b) => {
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();
    return direction * (aTime - bTime) || a.path.localeCompare(b.path);
  };
}

/** Build the root dashboard from the full non-ignored inventory tree. */
export async function buildDashboard(tree, rootAbs) {
  const { files, directories } = collectFiles(tree);
  const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  let totalBytes = 0;
  for (const file of files) {
    const category = file.category || 'other';
    byCategory[category] = (byCategory[category] || 0) + 1;
    totalBytes += file.size;
  }

  let gitDates = null;
  try {
    gitDates = await latestCommitDates(rootAbs, files.map((file) => file.path));
  } catch {
    /* Dashboard ranking always has a filesystem fallback. */
  }

  const filesystemRows = files
    .map((file) => dashboardFile(file, isoFromMtime(file.mtime), 'filesystem'))
    .filter((file) => file.updatedAt);
  const recent = files
    .map((file) => {
      const filesystemDate = isoFromMtime(file.mtime);
      const gitDate = gitDates?.get(file.path) || null;
      return filesystemDate
        ? dashboardFile(file, gitDate || filesystemDate, gitDate ? 'git' : 'filesystem')
        : null;
    })
    .filter(Boolean)
    .sort(byDate(-1))
    .slice(0, RANK_LIMIT);

  const oldest = [...filesystemRows]
    .sort(byDate(1))
    .slice(0, RANK_LIMIT);

  const depth = (file) => (file.path.match(/\//g) || []).length;
  const agentInstructions = files
    .filter((file) => isAgentInstructionFile(file.path))
    .map((file) => dashboardFile(file, isoFromMtime(file.mtime), 'filesystem'))
    .filter((file) => file.updatedAt)
    .sort((a, b) => depth(a) - depth(b) || a.path.localeCompare(b.path));

  const skills = files
    .flatMap((file) => {
      const match = SKILL_FILE_RE.exec(file.path);
      if (!match) return [];
      return [{
        name: match[2],
        sourceDir: `.${match[1]}`,
        description: skillDescription(rootAbs, file.path),
        path: file.path,
        size: file.size,
        updatedAt: isoFromMtime(file.mtime),
      }];
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

  return {
    fileCount: files.length,
    directoryCount: directories.length,
    totalBytes,
    byCategory,
    gitAvailable: gitDates !== null,
    recent,
    oldest,
    agentInstructions,
    skills,
  };
}
