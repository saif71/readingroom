/**
 * Heading slugs and outline extraction for markdown documents.
 *
 * Slugs follow the GitHub convention (lowercase, punctuation stripped,
 * spaces → `-`, duplicates suffixed `-1`, `-2`, …) so deep links copied
 * from GitHub land on the right section and vice versa.
 */

export function slugifyHeading(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

/**
 * A slug factory that dedupes in document order. The same instance must be
 * used for the rendered headings and for the outline so both agree on ids.
 * Slugs are cached per heading text so re-renders (e.g. React StrictMode's
 * double render pass) are idempotent and never consume extra dedupe slots.
 */
export function createSlugger() {
  const assigned = new Map();
  const counts = new Map();
  return function slug(text) {
    const known = assigned.get(text);
    if (known !== undefined) return known;
    const base = slugifyHeading(text) || 'section';
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen}`;
    assigned.set(text, id);
    return id;
  };
}

/**
 * Flatten inline markdown to plain text so raw-source slugs match what the
 * rendered heading displays (strip code spans, emphasis, links, images).
 */
export function plainHeadingText(raw) {
  return raw
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]+([^*_~]*)[*_~]+/g, '$1')
    .trim();
}

/**
 * Extract the h1–h6 outline of a markdown document, skipping fenced code
 * blocks. Returns [{ level, text, id }] in document order; ids are computed
 * with the same GitHub-style dedupe rules as the rendered headings.
 */
export function extractHeadings(markdown) {
  const slug = createSlugger();
  const out = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const text = plainHeadingText(m[2]);
    out.push({ level: m[1].length, text, id: slug(text) });
  }
  return out;
}
