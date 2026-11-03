import { describe, expect, it } from 'vitest';

import type { DiffLine } from '../../../shared/ipc';
import { pairChangedLines, splitRows, wordDiff } from './wordDiff';

const line = (kind: DiffLine['kind'], content: string): DiffLine => ({
  kind,
  oldNumber: kind === 'added' ? null : 1,
  newNumber: kind === 'removed' ? null : 1,
  content,
});

describe('wordDiff', () => {
  it('marks only the words that changed', () => {
    const { before, after } = wordDiff('const speed = 1;', 'const speed = 2;');
    expect(before).toEqual([
      { text: 'const speed = ', changed: false },
      { text: '1', changed: true },
      { text: ';', changed: false },
    ]);
    expect(after.filter((segment) => segment.changed)).toEqual([{ text: '2', changed: true }]);
  });

  it('handles insertions and identical lines', () => {
    expect(wordDiff('a b', 'a x b').after).toContainEqual({ text: 'x ', changed: true });
    expect(wordDiff('same', 'same').before).toEqual([{ text: 'same', changed: false }]);
  });
});

describe('pairChangedLines', () => {
  it('pairs removed and added lines position by position', () => {
    const lines = [
      line('context', 'a'),
      line('removed', 'b'),
      line('removed', 'c'),
      line('added', 'B'),
      line('context', 'd'),
    ];
    const partners = pairChangedLines(lines);
    expect([...partners.entries()]).toEqual([
      [1, 3],
      [3, 1],
    ]);
  });
});

describe('splitRows', () => {
  it('puts context on both sides and edits side by side', () => {
    const rows = splitRows([
      line('context', 'a'),
      line('removed', 'b'),
      line('added', 'B'),
      line('added', 'C'),
    ]);
    expect(
      rows.map((row) => [row.left?.line.content ?? null, row.right?.line.content ?? null]),
    ).toEqual([
      ['a', 'a'],
      ['b', 'B'],
      [null, 'C'],
    ]);
  });
});
