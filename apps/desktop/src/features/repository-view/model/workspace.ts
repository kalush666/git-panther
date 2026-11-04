import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** An unfinished commit message. */
export interface CommitDraft {
  summary: string;
  description: string;
}

const EMPTY_DRAFT: CommitDraft = { summary: '', description: '' };

interface DraftState {
  /** Per repository path, so switching tabs or restarting keeps the message. */
  drafts: Record<string, CommitDraft>;
  update: (path: string, change: Partial<CommitDraft>) => void;
  clear: (path: string) => void;
}

export const useCommitDrafts = create<DraftState>()(
  persist(
    (set) => ({
      drafts: {},
      update: (path, change) => {
        set((state) => ({
          drafts: {
            ...state.drafts,
            [path]: { ...(state.drafts[path] ?? EMPTY_DRAFT), ...change },
          },
        }));
      },
      clear: (path) => {
        set((state) => ({
          drafts: Object.fromEntries(Object.entries(state.drafts).filter(([key]) => key !== path)),
        }));
      },
    }),
    { name: 'git-panther.commit-drafts' },
  ),
);

export function useCommitDraft(path: string): CommitDraft {
  return useCommitDrafts((state) => state.drafts[path] ?? EMPTY_DRAFT);
}

/** Panel widths in CSS pixels; `null` keeps the design default. */
interface PanelState {
  sidebar: number | null;
  details: number | null;
  setWidth: (panel: Panel, width: number | null) => void;
}

export type Panel = 'sidebar' | 'details';

/** How narrow and wide each panel may be dragged. */
export const PANEL_LIMITS: Record<Panel, { min: number; max: number }> = {
  sidebar: { min: 160, max: 480 },
  details: { min: 260, max: 720 },
};

export const usePanelWidths = create<PanelState>()(
  persist(
    (set) => ({
      sidebar: null,
      details: null,
      setWidth: (panel, width) => {
        const { min, max } = PANEL_LIMITS[panel];
        set({ [panel]: width === null ? null : Math.round(Math.min(max, Math.max(min, width))) });
      },
    }),
    { name: 'git-panther.panel-widths' },
  ),
);
