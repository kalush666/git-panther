import { describe, expect, it } from 'vitest';

import { mergeTarget } from './mergeTarget';

describe('mergeTarget', () => {
  const branches = ['main', 'develop', 'feature/login', 'fix-typo'];

  it('sends feature work to develop and everything else to main', () => {
    expect(mergeTarget('feature/login', branches)).toBe('develop');
    expect(mergeTarget('fix-typo', branches)).toBe('main');
    expect(mergeTarget('develop', branches)).toBe('main');
  });

  it('has no target for main itself or without a main branch', () => {
    expect(mergeTarget('main', branches)).toBeNull();
    expect(mergeTarget('topic', ['topic'])).toBeNull();
  });

  it('uses master when there is no main', () => {
    expect(mergeTarget('feature/x', ['master', 'feature/x'])).toBe('master');
  });
});
