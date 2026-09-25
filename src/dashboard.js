import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { aiCommitShare, latestCommitDates } from './git.js';

const CATEGORIES = ['markdown', 'images', 'pdfs', 'text', 'json', 'code', 'other'];
const RANK_LIMIT = 10;
const VISUAL_ASSET_LIMIT = 20;

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

// A custom slash command is a top-level .md file in a commands directory;
// .github/prompts is GitHub Copilot's prompt location.
const COMMAND_FILE_RE = /^\.(claude|agents|cursor)\/commands\/([^/]+)\.md$/;
const PROMPT_FILE_RE = /^\.github\/prompts\/([^/]+)\.md$/;

function isAgentInstructionFile(rel) {
  if (AGENT_INSTRUCTION_NAMES.has(rel.split('/').pop())) return true;
  return AGENT_INSTRUCTION_PATH_RES.some((re) => re.test(rel));
}

function commandMeta(rel) {
  const match = COMMAND_FILE_RE.exec(rel);
  if (match) return { name: match[2], sourceDir: `.${match[1]}` };
  const prompt = PROMPT_FILE_RE.exec(rel);
  if (prompt) return { name: prompt[1], sourceDir: '.github' };
  return null;
}

// Extract `description:` from YAML frontmatter (SKILL.md, command files).
// Single-line and block-scalar (>, |) forms are supported; anything else
// degrades to null.
function parseFrontmatterDescription(text) {
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

function frontmatterDescription(rootAbs, rel) {
  try {
    return parseFrontmatterDescription(readFileSync(path.join(rootAbs, rel), 'utf8').slice(0, 4096));
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

function isImageFile(file) {
  return file.kind === 'img' || file.category === 'images';
}

function visualAssetRow(file, updatedAt, updatedSource) {
  const slash = file.path.lastIndexOf('/');
  return {
    path: file.path,
    name: file.name,
    ext: path.extname(file.name).toLowerCase(),
    folder: slash === -1 ? '' : file.path.slice(0, slash),
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

  let aiCommits = null;
  try {
    aiCommits = await aiCommitShare(rootAbs);
  } catch {
    /* The AI share widget needs Git; it hides quietly without it. */
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

  const images = files.filter(isImageFile);
  const visualAssets = {
    total: images.length,
    recent: images
      .map((file) => {
        const filesystemDate = isoFromMtime(file.mtime);
        const gitDate = gitDates?.get(file.path) || null;
        return filesystemDate
          ? visualAssetRow(file, gitDate || filesystemDate, gitDate ? 'git' : 'filesystem')
          : null;
      })
      .filter(Boolean)
      .sort(byDate(-1))
      .slice(0, VISUAL_ASSET_LIMIT),
  };

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
        description: frontmatterDescription(rootAbs, file.path),
        path: file.path,
        size: file.size,
        updatedAt: isoFromMtime(file.mtime),
      }];
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

function stripComments(jsonc) {
  // Strip single-line /* */ and // comments, respecting strings.
  const result = [];
  let i = 0;
  let inString = null; // '', ", or null
  while (i < jsonc.length) {
    const ch = jsonc[i];
    if (inString) {
      if (ch === '\\' && i + 1 < jsonc.length) {
        result.push(ch, jsonc[i + 1]);
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      result.push(ch);
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      result.push(ch);
      i++;
      continue;
    }
    if (ch === '/' && i + 1 < jsonc.length && jsonc[i + 1] === '*') {
      i += 2;
      while (i + 1 < jsonc.length) {
        if (jsonc[i] === '*' && jsonc[i + 1] === '/') { i += 2; break; }
        result.push(jsonc[i]);
        i++;
      }
      if (i < jsonc.length) i++; // skip /
      continue;
    }
    if (ch === '/' && i + 1 < jsonc.length && jsonc[i + 1] === '/') {
      while (i < jsonc.length && jsonc[i] !== '\n') i++;
      continue;
    }
    result.push(ch);
    i++;
  }
  return result.join('');
}

function parseMcpConfigFile(absPath, source) {
  try {
    const raw = String(readFileSync(absPath, 'utf8'));
    const clean = stripComments(raw);
    const cfg = JSON.parse(clean);
    if (!cfg || typeof cfg.mcpServers !== 'object') return [];
    const servers = [];
    for (const [name, config] of Object.entries(cfg.mcpServers)) {
      if (!config) continue;
      const server = { name, source };
      // Redact env values — never emit raw env into the dashboard payload.
      if (config.env && typeof config.env === 'object') {
        server.env = Object.keys(config.env).map((k) => ({ key: k, value: undefined }));
      } else {
        server.env = [];
      }
      // Transport
      if (config.type) server.type = config.type;
      if (config.command) server.command = config.command;
      if (config.url) server.url = config.url;
      if (config.disabled !== undefined) server.disabled = config.disabled;
      servers.push(server);
    }
    return servers;
  } catch {
    return [];
  }
}

function mcpConfigPaths(rootAbs) {
  const candidates = [
    path.join(rootAbs, '.mcp.json'),
    path.join(rootAbs, '.claude', 'settings.json'),
    path.join(rootAbs, '.cursor', 'mcp.json'),
    path.join(rootAbs, '.vscode', 'mcp.json'),
    path.join(rootAbs, '.gemini', 'settings.json'),
  ];
  return candidates.filter((p) => existsSync(p));
}

  const commands = files
    .flatMap((file) => {
      const meta = commandMeta(file.path);
      if (!meta) return [];
      return [{
        ...meta,
        description: frontmatterDescription(rootAbs, file.path),
        path: file.path,
        size: file.size,
        updatedAt: isoFromMtime(file.mtime),
      }];
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

  // MCP server inventory (read-only, never writes) — parses common config files.
  const mcpServers = mcpConfigPaths(rootAbs)
    .map((abs) => parseMcpConfigFile(abs, abs.replace(rootAbs + path.sep, '').replace(/\\/g, '/')))
    .flat()
    .filter((s) => !s.disabled)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    fileCount: files.length,
    directoryCount: directories.length,
    totalBytes,
    byCategory,
    gitAvailable: gitDates !== null,
    recent,
    oldest,
    visualAssets,
    agentInstructions,
    skills,
    commands,
    aiCommits,
    mcpServers,
  };
}
