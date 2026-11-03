import type { DiffLine } from '../../../shared/ipc';

/** A run of text within a line, marked if it differs from the paired line. */
export interface WordSegment {
  text: string;
  changed: boolean;
}

/** Lines with more tokens than this are highlighted as a whole. */
const MAX_TOKENS = 400;

function tokenize(text: string): string[] {
  return text.match(/\s+|\w+|[^\w\s]/g) ?? [];
}

/**
 * Splits `before` and `after` into segments, marking the tokens that are not
 * part of their longest common subsequence.
 */
export function wordDiff(
  before: string,
  after: string,
): { before: WordSegment[]; after: WordSegment[] } {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return {
      before: [{ text: before, changed: true }],
      after: [{ text: after, changed: true }],
    };
  }

  // lengths[i][j] = LCS length of a[i..] and b[j..].
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = lengths[i] as number[];
      const below = lengths[i + 1] as number[];
      row[j] = a[i] === b[j] ? (below[j + 1] ?? 0) + 1 : Math.max(below[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const left: WordSegment[] = [];
  const right: WordSegment[] = [];
  const push = (segments: WordSegment[], text: string, changed: boolean) => {
    const last = segments.at(-1);
    if (last && last.changed === changed) {
      last.text += text;
    } else {
      segments.push({ text, changed });
    }
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(left, a[i] ?? '', false);
      push(right, b[j] ?? '', false);
      i += 1;
      j += 1;
    } else if ((lengths[i + 1]?.[j] ?? 0) >= (lengths[i]?.[j + 1] ?? 0)) {
      push(left, a[i] ?? '', true);
      i += 1;
    } else {
      push(right, b[j] ?? '', true);
      j += 1;
    }
  }
  for (; i < a.length; i += 1) push(left, a[i] ?? '', true);
  for (; j < b.length; j += 1) push(right, b[j] ?? '', true);
  return { before: left, after: right };
}

/**
 * Pairs each removed line with the added line at the same position in its
 * change block, so edits can be highlighted word by word. Returns a map from
 * line index to its partner's index.
 */
export function pairChangedLines(lines: readonly DiffLine[]): Map<number, number> {
  const partners = new Map<number, number>();
  let index = 0;
  while (index < lines.length) {
    const removed: number[] = [];
    while (lines[index]?.kind === 'removed') removed.push(index++);
    const added: number[] = [];
    while (lines[index]?.kind === 'added') added.push(index++);
    removed.forEach((removedIndex, position) => {
      const addedIndex = added[position];
      if (addedIndex !== undefined) {
        partners.set(removedIndex, addedIndex);
        partners.set(addedIndex, removedIndex);
      }
    });
    if (removed.length === 0 && added.length === 0) index += 1;
  }
  return partners;
}

/** One row of the side-by-side view: the old line left, the new line right. */
export interface SplitRow {
  left: { line: DiffLine; index: number } | null;
  right: { line: DiffLine; index: number } | null;
}

/** Lays a hunk out side by side: context on both sides, edits paired up. */
export function splitRows(lines: readonly DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line?.kind === 'context') {
      rows.push({ left: { line, index }, right: { line, index } });
      index += 1;
      continue;
    }
    const removed: { line: DiffLine; index: number }[] = [];
    while (lines[index]?.kind === 'removed') {
      removed.push({ line: lines[index] as DiffLine, index });
      index += 1;
    }
    const added: { line: DiffLine; index: number }[] = [];
    while (lines[index]?.kind === 'added') {
      added.push({ line: lines[index] as DiffLine, index });
      index += 1;
    }
    for (let row = 0; row < Math.max(removed.length, added.length); row += 1) {
      rows.push({ left: removed[row] ?? null, right: added[row] ?? null });
    }
  }
  return rows;
}
