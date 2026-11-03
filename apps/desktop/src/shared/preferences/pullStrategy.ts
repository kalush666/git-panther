import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { PullStrategy } from '../ipc';

export const PULL_STRATEGIES: ReadonlyArray<{ id: PullStrategy; label: string; hint: string }> = [
  {
    id: 'fastForwardOnly',
    label: 'Fast-forward only',
    hint: 'Refuses to pull when local and remote work have diverged',
  },
  { id: 'merge', label: 'Merge', hint: 'Joins diverged work with a merge commit' },
  { id: 'rebase', label: 'Rebase', hint: 'Replays local commits on top of the remote ones' },
];

interface PullStrategyState {
  strategy: PullStrategy;
  setStrategy: (strategy: PullStrategy) => void;
}

/** How Pull combines remote work with local commits; remembered across sessions. */
export const usePullStrategyStore = create<PullStrategyState>()(
  persist(
    (set) => ({
      strategy: 'fastForwardOnly',
      setStrategy: (strategy) => {
        set({ strategy });
      },
    }),
    { name: 'git-panther.pull-strategy' },
  ),
);
