/**
 * Subsequence fuzzy match. Returns a score (higher = better) or -1 when the
 * query does not match. Bonus points for consecutive characters and for
 * matches at word/segment boundaries; tiny penalty for longer targets.
 */
export function fuzzyMatch(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;
  let score = 0;
  let qi = 0;
  let last = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] !== q[qi]) continue;
    score += i === last + 1 ? 8 : 4;
    const prev = t[i - 1];
    if (i === 0 || prev === '/' || prev === ' ' || prev === '-' || prev === '_' || prev === '.') score += 6;
    last = i;
    qi++;
  }
  return qi === q.length ? score - t.length * 0.01 : -1;
}
