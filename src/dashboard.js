import { latestCommitDates } from './git.js';

const CATEGORIES = ['markdown', 'images', 'pdfs', 'text', 'json', 'code', 'other'];
const RANK_LIMIT = 10;

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

  return {
    fileCount: files.length,
    directoryCount: directories.length,
    totalBytes,
    byCategory,
    gitAvailable: gitDates !== null,
    recent,
    oldest,
  };
}
