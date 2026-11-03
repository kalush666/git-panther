import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RepositoryTab {
  path: string;
  name: string;
}

interface TabsState {
  tabs: RepositoryTab[];
  /** Path of the active tab, or `null` for the start page. */
  activePath: string | null;
  openTab: (tab: RepositoryTab) => void;
  closeTab: (path: string) => void;
  activate: (path: string | null) => void;
}

/** After closing the active tab, focus its left neighbour, else its right one. */
function neighbourOf(tabs: RepositoryTab[], closedIndex: number): string | null {
  return (tabs[closedIndex - 1] ?? tabs[closedIndex + 1])?.path ?? null;
}

export const useTabsStore = create<TabsState>()(
  persist(
    (set) => ({
      tabs: [],
      activePath: null,
      openTab: (tab) => {
        set((state) => ({
          tabs: state.tabs.some((existing) => existing.path === tab.path)
            ? state.tabs
            : [...state.tabs, tab],
          activePath: tab.path,
        }));
      },
      closeTab: (path) => {
        set((state) => {
          const index = state.tabs.findIndex((tab) => tab.path === path);
          if (index === -1) {
            return state;
          }
          return {
            tabs: state.tabs.filter((tab) => tab.path !== path),
            activePath:
              state.activePath === path ? neighbourOf(state.tabs, index) : state.activePath,
          };
        });
      },
      activate: (path) => {
        set({ activePath: path });
      },
    }),
    { name: 'git-panther.tabs' },
  ),
);
