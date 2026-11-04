/**
 * Scores how well `query` matches `text` as an in-order subsequence,
 * ignoring case: consecutive letters and word starts score higher. `null`
 * means no match; an empty query matches everything equally.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const needle = query.trim().toLowerCase();
  if (needle === '') return 0;
  const haystack = text.toLowerCase();
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of needle) {
    const at = haystack.indexOf(char, from);
    if (at === -1) return null;
    const wordStart = at === 0 || /[\s/._-]/.test(haystack[at - 1] ?? '');
    score += (at === previous + 1 ? 3 : 1) + (wordStart ? 2 : 0);
    previous = at;
    from = at + 1;
  }
  return score;
}
