import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const TEXT_EXTENSIONS = ['.md', '.txt'];
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg'];
export const PDF_EXTENSIONS = ['.pdf'];

const KIND_BY_EXT = new Map([
  ...TEXT_EXTENSIONS.map((ext) => [ext, ext === '.txt' ? 'txt' : 'md']),
  ...IMAGE_EXTENSIONS.map((ext) => [ext, 'img']),
  ...PDF_EXTENSIONS.map((ext) => [ext, 'pdf']),
]);

// Always ignored regardless of .gitignore. Dependency/build/cache directories
// would bury the docs this tool exists to surface.
export const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  '.cache',
  '.turbo',
  '.parcel-cache',
  'target',
  'vendor',
  'coverage',
  '.yarn',
  '.pnpm-store',
  '.venv',
  '__pycache__',
  '.idea',
  '.vscode',
]);

const MAX_DEPTH = 40;

export function fileKind(name) {
  return KIND_BY_EXT.get(path.extname(name).toLowerCase()) ?? null;
}

function escapeRe(ch) {
  return ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

// Translate a gitignore glob (subset: *, ?, **) into a regex source string.
function globToReSource(glob) {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i += 2;
        if (glob[i] === '/') i++;
      } else {
        re += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      re += '[^/]';
      i++;
    } else {
      re += escapeRe(c);
      i++;
    }
  }
  return re;
}

function parseGitignore(text) {
  const rules = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    let negate = false;
    if (line.startsWith('!')) {
      negate = true;
      line = line.slice(1);
    }
    if (!line) continue;
    const dirOnly = line.endsWith('/');
    if (dirOnly) line = line.slice(0, -1);
    const anchored = line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    if (!line) continue;
    const src = globToReSource(line);
    rules.push({
      negate,
      dirOnly,
      anchored,
      reFull: new RegExp('^' + src + '$'),
      reAny: new RegExp('(?:^|/)' + src + '$'),
    });
  }
  return rules;
}

function ruleMatches(rule, rel, isDir) {
  if (rule.dirOnly && !isDir) return false;
  // dirOnly rules match the directory itself; unanchored rules match at any depth.
  return rule.dirOnly || !rule.anchored ? rule.reFull.test(rel) || rule.reAny.test(rel) : rule.reFull.test(rel);
}

function isIgnored(rel, isDir, stack) {
  let ignored = false;
  for (const { baseRel, rules } of stack) {
    const relFromBase = baseRel ? rel.slice(baseRel.length + 1) : rel;
    if (relFromBase === '') continue;
    for (const rule of rules) {
      if (ruleMatches(rule, relFromBase, isDir)) ignored = !rule.negate;
    }
  }
  return ignored;
}

function countFiles(nodes) {
  let n = 0;
  for (const node of nodes) n += node.type === 'file' ? 1 : node.count;
  return n;
}

/**
 * Scan a directory tree. By default this returns only the documentation files
 * readingroom can preview; includeAll also keeps every non-ignored file for
 * inventory-style views such as the home dashboard.
 */
function scan(rootDir, includeAll) {
  const rootAbs = path.resolve(rootDir);
  const rootName = path.basename(rootAbs) || rootAbs;
  const stack = [];

  function walk(dirAbs, dirRel, depth) {
    let entries;
    try {
      entries = readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return [];
    }

    const hasGitignore = entries.some((e) => e.name === '.gitignore' && e.isFile());
    let pushedRule = false;
    if (hasGitignore) {
      try {
        stack.push({ baseRel: dirRel, rules: parseGitignore(readFileSync(path.join(dirAbs, '.gitignore'), 'utf8')) });
        pushedRule = true;
      } catch {
        /* unreadable .gitignore — treat as absent */
      }
    }

    const dirNodes = [];
    const fileNodes = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue; // loop safety
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
        if (isIgnored(rel, true, stack)) continue;
        if (depth >= MAX_DEPTH) continue;
        const children = walk(path.join(dirAbs, entry.name), rel, depth + 1);
        if (children.length > 0) {
          dirNodes.push({ type: 'dir', name: entry.name, path: rel, count: countFiles(children), children });
        }
      } else if (entry.isFile()) {
        const kind = fileKind(entry.name);
        if (!includeAll && !kind) continue;
        if (isIgnored(rel, false, stack)) continue;
        let st;
        try {
          st = statSync(path.join(dirAbs, entry.name));
        } catch {
          continue;
        }
        fileNodes.push({ type: 'file', name: entry.name, path: rel, kind: kind || 'other', size: st.size, mtime: st.mtimeMs });
      }
    }

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const byName = (a, b) => collator.compare(a.name, b.name);
    dirNodes.sort(byName);
    fileNodes.sort(byName);

    if (pushedRule) stack.pop();
    return [...dirNodes, ...fileNodes];
  }

  const children = walk(rootAbs, '', 0);
  return { type: 'dir', name: rootName, path: '', count: countFiles(children), children };
}

export function scanTree(rootDir) {
  return scan(rootDir, false);
}

export function scanAllTree(rootDir) {
  return scan(rootDir, true);
}
