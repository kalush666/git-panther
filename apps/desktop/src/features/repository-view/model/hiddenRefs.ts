import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const NONE: readonly string[] = [];

interface HiddenRefsState {
  /** Branch names left out of the graph, per repository path. */
  hidden: Record<string, string[]>;
  toggle: (path: string, name: string) => void;
  /** Hides every name in `all` except `name`. */
  solo: (path: string, name: string, all: readonly string[]) => void;
  showAll: (path: string) => void;
}

/** Branches hidden from the graph, remembered per repository. */
export const useHiddenRefsStore = create<HiddenRefsState>()(
  persist(
    (set) => ({
      hidden: {},
      toggle: (path, name) => {
        set((state) => {
          const current = state.hidden[path] ?? [];
          const next = current.includes(name)
            ? current.filter((hidden) => hidden !== name)
            : [...current, name];
          return { hidden: { ...state.hidden, [path]: next } };
        });
      },
      solo: (path, name, all) => {
        set((state) => ({
          hidden: { ...state.hidden, [path]: all.filter((other) => other !== name) },
        }));
      },
      showAll: (path) => {
        set((state) => ({ hidden: { ...state.hidden, [path]: [] } }));
      },
    }),
    { name: 'git-panther.hidden-refs' },
  ),
);

/** The branches hidden in `path`'s graph, sorted so query keys stay stable. */
export function useHiddenRefs(path: string): readonly string[] {
  const hidden = useHiddenRefsStore((state) => state.hidden[path] ?? NONE);
  return hidden.length === 0 ? NONE : [...hidden].sort();
}
