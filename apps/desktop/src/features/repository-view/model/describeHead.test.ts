import { describe, expect, it } from 'vitest';

import { describeHead } from './describeHead';

describe('describeHead', () => {
  it('describes each kind of HEAD', () => {
    expect(describeHead({ kind: 'branch', name: 'main' })).toBe('On branch main');
    expect(describeHead({ kind: 'detached', commit: 'a1b2c3d' })).toBe('Detached at a1b2c3d');
    expect(describeHead({ kind: 'unborn', name: 'main' })).toBe('On branch main, no commits yet');
  });
});
