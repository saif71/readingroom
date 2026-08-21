import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * Git integration for the inspector (file info + history).
 *
 * Everything shells out to the `git` CLI via execFile — argv only, never a
 * shell — so paths and refs are never interpreted as options or commands.
 * Callers degrade gracefully when git is missing or the served folder is not
 * a repository: repo detection returns null and endpoints report git:false.
 */

const GIT_TIMEOUT_MS = 5000;
const MAX_BUFFER = 10 * 1024 * 1024; // biggest blob we will hand out
const HISTORY_LIMIT = 500;
const FIELD = '\x1f';
const RECORD = '\x1e';
const PRETTY = `%H${FIELD}%h${FIELD}%an${FIELD}%ae${FIELD}%aI${FIELD}%s${RECORD}`;
const DASHBOARD_PRETTY = `%aI${RECORD}`;
const DASHBOARD_PATH_BATCH = 250;
const AI_COMMIT_LIMIT = 500;
const AI_TOP_FILES = 6;
const AI_BODY_PRETTY = `%H${FIELD}%aI${FIELD}%b${RECORD}`;

// AI assistants leave machine-readable traces in commit messages: co-author
// trailers ("Co-Authored-By: Claude <noreply@anthropic.com>") and footer lines
// ("🤖 Generated with [Claude Code](https://claude.com/claude-code)"). Bodies
// are matched, not subjects, so a commit merely *about* Claude doesn't count.
const AI_TOOLS = [
  { id: 'claude', label: 'Claude', match: [/co-authored-by:[^\n<]*claude/i, /generated with \[?claude code\]?/i] },
  { id: 'copilot', label: 'Copilot', match: [/co-authored-by:[^\n<]*copilot/i, /generated with \[?(github )?copilot\]?/i] },
  { id: 'cursor', label: 'Cursor', match: [/co-authored-by:[^\n<]*cursor/i, /generated with \[?cursor( agent)?\]?/i] },
  { id: 'gemini', label: 'Gemini', match: [/co-authored-by:[^\n<]*gemini/i, /generated with \[?gemini( cli)?\]?/i] },
  { id: 'codex', label: 'Codex', match: [/co-authored-by:[^\n<]*codex/i, /generated with \[?codex\]?/i] },
];

export class VersionNotFound extends Error {
  constructor() {
    super('version not found');
  }
}

function runGit(cwd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true, ...opts },
      (err, stdout, stderr) => {
        if (err) {
          err.gitStderr = String(stderr ?? '');
          reject(err);
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

// Positive detections are cached for the life of the process; misses re-probe
// (one cheap exec) so `git init` mid-session starts working without a restart.
const repoCache = new Map();

/** Detect the repository containing rootAbs: { repoRoot, subDir } | null. */
export async function findRepo(rootAbs) {
  if (repoCache.has(rootAbs)) return repoCache.get(rootAbs);
  let repo = null;
  try {
    // --show-toplevel reports the real path, so compare against the real
    // served root or symlinked roots (macOS /var -> /private/var) never match.
    const realRoot = realpathSync(rootAbs);
    const top = path.resolve(String(await runGit(realRoot, ['rev-parse', '--show-toplevel'])).trim());
    if (top === realRoot || realRoot.startsWith(top + path.sep)) {
      repo = { repoRoot: top, subDir: path.relative(top, realRoot).split(path.sep).join('/') };
    }
  } catch {
    /* git missing, not a repository, or blocked (e.g. dubious ownership) */
  }
  if (repo) repoCache.set(rootAbs, repo);
  return repo;
}

/** The served root may sit below the repo root; git wants repo-relative paths. */
function repoRelative(repo, rel) {
  const p = String(rel).replace(/\\/g, '/');
  return repo.subDir ? `${repo.subDir}/${p}` : p;
}

/** `git log --name-status` quotes exotic paths C-style; undo the common cases. */
function unquotePath(p) {
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) {
    try {
      return JSON.parse(p);
    } catch {
      return p.slice(1, -1);
    }
  }
  return p;
}

function parseLatestDates(out, wanted) {
  const dates = new Map();
  let date = null;
  for (const line of String(out).split(/\r?\n/)) {
    if (line.includes(RECORD)) {
      date = line.slice(0, line.indexOf(RECORD)).trim() || null;
      continue;
    }
    if (!date || !line.trim()) continue;
    const rel = unquotePath(line.trim()).replace(/\\/g, '/');
    if (wanted.has(rel) && !dates.has(rel)) dates.set(rel, date);
  }
  return dates;
}

function parseCommits(out) {
  const commits = [];
  let current = null;
  for (const line of String(out).split(/\r?\n/)) {
    if (line.includes(RECORD)) {
      const fields = line.slice(0, line.indexOf(RECORD)).split(FIELD);
      current = {
        sha: fields[0] || '',
        abbrev: fields[1] || '',
        author: fields[2] || '',
        email: fields[3] || '',
        date: fields[4] || '',
        subject: fields.slice(5).join(FIELD),
        status: null,
        moves: [],
      };
      if (current.sha) commits.push(current);
    } else if (current && line.includes('\t')) {
      const cols = line.split('\t');
      current.status = current.status || cols[0].replace(/\d+$/, ''); // R100 -> R
      current.moves.push(cols.slice(1).map(unquotePath));
    }
  }
  return commits;
}

/**
 * `--follow` reports every commit against the file's current name. Annotate
 * each commit with the path the file had at that point (newest -> oldest walk
 * flips the path at each rename) so snapshots resolve across renames.
 */
function withPathAtCommit(commits, startPath) {
  let pathNow = startPath;
  return commits.map((commit) => {
    const entry = {
      sha: commit.sha,
      abbrev: commit.abbrev,
      author: commit.author,
      email: commit.email,
      date: commit.date,
      subject: commit.subject,
      status: commit.status || 'M',
      path: pathNow,
    };
    const move = commit.moves.find((m) => m.length === 2 && m[1] === pathNow);
    if (move) pathNow = move[0];
    return entry;
  });
}

function isUnborn(err) {
  return /does not have any commits yet/i.test(err.gitStderr || '');
}

/** { git, branch } for the repo containing rootAbs (branch null if unknown). */
export async function repoStatus(rootAbs) {
  const repo = await findRepo(rootAbs);
  if (!repo) return { git: false, branch: null };
  try {
    const branch = String(await runGit(repo.repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    return { git: true, branch: branch && branch !== 'HEAD' ? branch : null };
  } catch {
    return { git: true, branch: null }; // unborn branch or detached HEAD
  }
}

/** Latest commit that touched rel (served-root relative), or null. */
export async function lastCommitFor(rootAbs, rel) {
  const repo = await findRepo(rootAbs);
  if (!repo) return null;
  try {
    const out = await runGit(repo.repoRoot, ['log', '-n', '1', `--format=${PRETTY}`, '--', repoRelative(repo, rel)]);
    const commit = parseCommits(out)[0];
    return commit ? { sha: commit.sha, abbrev: commit.abbrev, author: commit.author, email: commit.email, date: commit.date, subject: commit.subject } : null;
  } catch {
    return null; // untracked, unborn repo, or a git hiccup — info degrades quietly
  }
}

/**
 * Latest author date for each requested served-root path in one repository-wide
 * history query per bounded batch. Returns null outside Git or when Git cannot
 * answer; an empty map is a valid Git repository with no matching history.
 */
export async function latestCommitDates(rootAbs, rels) {
  const repo = await findRepo(rootAbs);
  if (!repo) return null;
  const requested = [...new Set(rels.map((rel) => repoRelative(repo, rel)))];
  if (requested.length === 0) return new Map();

  const dates = new Map();
  try {
    for (let i = 0; i < requested.length; i += DASHBOARD_PATH_BATCH) {
      const batch = requested.slice(i, i + DASHBOARD_PATH_BATCH);
      const out = await runGit(repo.repoRoot, [
        'log', '--name-only', `--format=${DASHBOARD_PRETTY}`, '--', ...batch,
      ]);
      const batchDates = parseLatestDates(out, new Set(batch));
      for (const [repoRel, date] of batchDates) {
        const servedRel = repo.subDir && repoRel.startsWith(`${repo.subDir}/`)
          ? repoRel.slice(repo.subDir.length + 1)
          : repoRel;
        dates.set(servedRel, date);
      }
    }
  } catch (err) {
    if (isUnborn(err)) return new Map();
    return null;
  }
  return dates;
}

/** Parse `AI_BODY_PRETTY` output into { sha, date, body } records. */
function parseAiBodies(out) {
  const commits = [];
  for (const chunk of String(out).split(RECORD)) {
    // Records after the first start with the newline git appends to each entry.
    const fields = chunk.trim().split(FIELD);
    if (!/^[0-9a-f]{40}$/i.test(fields[0])) continue;
    commits.push({ sha: fields[0], date: fields[1] || '', body: fields.slice(2).join(FIELD) });
  }
  return commits;
}

/** Group `git show --name-only` output by commit sha. */
function parseAiCommitFiles(out) {
  const filesBySha = new Map();
  let sha = null;
  for (const line of String(out).split(/\r?\n/)) {
    if (line.includes(RECORD)) {
      sha = line.slice(0, line.indexOf(RECORD)).trim() || null;
      if (sha) filesBySha.set(sha, []);
      continue;
    }
    if (!sha || !line.trim()) continue;
    filesBySha.get(sha).push(unquotePath(line.trim()).replace(/\\/g, '/'));
  }
  return filesBySha;
}

/**
 * Share of recent commits authored with an AI assistant, judged by co-author
 * and "generated with" trailers in the message body. Scoped to the served
 * root (repo-wide when the root is the repository itself). Returns
 * { scanned, aiCount, share, byTool, topFiles, latestAiAt }, zeroed stats for
 * a repository with no commits, or null outside Git / when Git fails.
 */
export async function aiCommitShare(rootAbs) {
  const repo = await findRepo(rootAbs);
  if (!repo) return null;
  let out;
  try {
    const scope = repo.subDir ? ['--', repo.subDir] : [];
    out = await runGit(repo.repoRoot, ['log', '-n', String(AI_COMMIT_LIMIT), `--format=${AI_BODY_PRETTY}`, ...scope]);
  } catch (err) {
    if (isUnborn(err)) return { scanned: 0, aiCount: 0, share: 0, byTool: [], topFiles: [], latestAiAt: null };
    return null;
  }

  const commits = parseAiBodies(out);
  const toolCounts = new Map();
  const aiShas = [];
  let latestAiAt = null;
  for (const commit of commits) {
    const hits = AI_TOOLS.filter((tool) => tool.match.some((re) => re.test(commit.body)));
    if (hits.length === 0) continue;
    aiShas.push(commit.sha);
    if (!latestAiAt) latestAiAt = commit.date || null; // log walks newest-first
    for (const tool of hits) toolCounts.set(tool.id, (toolCounts.get(tool.id) || 0) + 1);
  }
  const byTool = AI_TOOLS
    .filter((tool) => toolCounts.has(tool.id))
    .map((tool) => ({ id: tool.id, label: tool.label, count: toolCounts.get(tool.id) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  let topFiles = [];
  if (aiShas.length > 0) {
    try {
      const filesBySha = parseAiCommitFiles(
        await runGit(repo.repoRoot, ['show', '--name-only', `--format=%H${RECORD}`, ...aiShas]),
      );
      const counts = new Map();
      for (const files of filesBySha.values()) {
        for (const repoRel of files) {
          let servedRel = repoRel;
          if (repo.subDir) servedRel = repoRel.startsWith(`${repo.subDir}/`) ? repoRel.slice(repo.subDir.length + 1) : null;
          if (servedRel) counts.set(servedRel, (counts.get(servedRel) || 0) + 1);
        }
      }
      topFiles = [...counts]
        .map(([p, count]) => ({ path: p, count }))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
        .slice(0, AI_TOP_FILES);
    } catch {
      /* the file ranking is best-effort; the headline share still stands */
    }
  }

  return {
    scanned: commits.length,
    aiCount: aiShas.length,
    share: commits.length > 0 ? aiShas.length / commits.length : 0,
    byTool,
    topFiles,
    latestAiAt,
  };
}

/** Commit timeline for rel: { repo, commits, truncated } | null when not a repo. */
export async function fileHistory(rootAbs, rel) {
  const repo = await findRepo(rootAbs);
  if (!repo) return null;
  let out;
  try {
    out = await runGit(repo.repoRoot, [
      'log', '--follow', '--name-status', `--format=${PRETTY}`,
      '-n', String(HISTORY_LIMIT), '--', repoRelative(repo, rel),
    ]);
  } catch (err) {
    if (isUnborn(err)) return { repo, commits: [], truncated: false };
    throw err;
  }
  const commits = withPathAtCommit(parseCommits(out), repoRelative(repo, rel));
  return { repo, commits, truncated: commits.length >= HISTORY_LIMIT };
}

/**
 * Blob for rel at ref (a commit sha). Rename-aware via the history walk;
 * commits that deleted the file resolve to the parent (last live version).
 * Returns { repo, buffer, entry } | null (not a repo); throws VersionNotFound.
 */
export async function fileVersion(rootAbs, rel, ref) {
  const repo = await findRepo(rootAbs);
  if (!repo) return null;
  const repoRel = repoRelative(repo, rel);

  let entry = null;
  try {
    const history = await fileHistory(rootAbs, rel);
    entry = history?.commits.find((c) => c.sha === ref || c.sha.startsWith(ref)) || null;
  } catch {
    /* fall through to the direct lookup below */
  }

  const attempts = [];
  if (entry) {
    attempts.push([entry.status === 'D' ? `${entry.sha}^` : entry.sha, entry.path]);
  }
  attempts.push([ref, repoRel]); // refs outside the walked history, or walk failures

  for (const [showRef, showPath] of attempts) {
    try {
      const out = await runGit(repo.repoRoot, ['show', `${showRef}:${showPath}`], { encoding: 'buffer' });
      return { repo, buffer: out == null ? Buffer.alloc(0) : Buffer.from(out), entry };
    } catch {
      /* try the next candidate */
    }
  }
  throw new VersionNotFound();
}
