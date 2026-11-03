import { describe, expect, it } from 'vitest';

import { groupRefs, initialsOf } from './refPills';

describe('groupRefs', () => {
  it('folds a remote branch into the local branch of the same name', () => {
    const pills = groupRefs([
      { name: 'origin/main', kind: 'remoteBranch', isHead: false },
      { name: 'main', kind: 'localBranch', isHead: true },
    ]);
    expect(pills).toEqual([
      { name: 'main', kind: 'branch', isLocal: true, remotes: ['origin'], isHead: true },
    ]);
  });

  it('keeps remote-only branches and nested branch names', () => {
    const pills = groupRefs([
      { name: 'origin/feature/login', kind: 'remoteBranch', isHead: false },
    ]);
    expect(pills).toEqual([
      { name: 'feature/login', kind: 'branch', isLocal: false, remotes: ['origin'], isHead: false },
    ]);
  });

  it('orders the checked-out branch first and tags last', () => {
    const pills = groupRefs([
      { name: 'v1.0', kind: 'tag', isHead: false },
      { name: 'origin/topic', kind: 'remoteBranch', isHead: false },
      { name: 'develop', kind: 'localBranch', isHead: false },
      { name: 'main', kind: 'localBranch', isHead: true },
    ]);
    expect(pills.map((pill) => pill.name)).toEqual(['main', 'develop', 'topic', 'v1.0']);
  });
});

describe('initialsOf', () => {
  it.each([
    ['Ada Byron', 'AB'],
    ['jonathan kalush', 'JK'],
    ['Grace Brewster Hopper', 'GH'],
    ['linus', 'L'],
    ['  ', ''],
  ])('%s → %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});
