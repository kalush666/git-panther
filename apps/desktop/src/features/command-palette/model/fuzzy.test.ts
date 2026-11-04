import { describe, expect, it } from 'vitest';

import { fuzzyScore } from './fuzzy';

describe('fuzzyScore', () => {
  it('matches letters in order, ignoring case', () => {
    expect(fuzzyScore('psh', 'Push')).not.toBeNull();
    expect(fuzzyScore('hsup', 'Push')).toBeNull();
  });

  it('ranks word starts and runs above scattered letters', () => {
    const start = fuzzyScore('nb', 'New branch here');
    const scattered = fuzzyScore('nb', 'Open settings bar');
    expect(start).toBeGreaterThan(scattered ?? -1);
  });

  it('lets an empty query match everything', () => {
    expect(fuzzyScore('  ', 'Anything')).toBe(0);
  });
});
