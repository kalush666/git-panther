import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Columns the user may hide. Graph and commit message are always shown. */
export type OptionalColumn = 'refs' | 'author' | 'date' | 'sha';

export type ColumnVisibility = Record<OptionalColumn, boolean>;

/** A lean default: labels, graph and message, like a focused history view. */
export const DEFAULT_COLUMNS: Readonly<ColumnVisibility> = {
  refs: true,
  author: false,
  date: false,
  sha: false,
};

export const OPTIONAL_COLUMNS: ReadonlyArray<{ id: OptionalColumn; label: string }> = [
  { id: 'refs', label: 'Branch / Tag' },
  { id: 'author', label: 'Author' },
  { id: 'date', label: 'Date / Time' },
  { id: 'sha', label: 'SHA' },
];

const COLUMN_WIDTHS: Record<OptionalColumn, string> = {
  refs: 'var(--gp-refs-col-width)',
  author: 'var(--gp-col-author)',
  date: 'var(--gp-col-date)',
  sha: 'var(--gp-col-sha)',
};

/** CSS grid columns in display order: labels, graph, message, then details. */
export function columnTemplate(visible: ColumnVisibility, graphWidth: number): string {
  return [
    visible.refs ? COLUMN_WIDTHS.refs : null,
    `${graphWidth}px`,
    'minmax(0, 1fr)',
    visible.author ? COLUMN_WIDTHS.author : null,
    visible.date ? COLUMN_WIDTHS.date : null,
    visible.sha ? COLUMN_WIDTHS.sha : null,
  ]
    .filter(Boolean)
    .join(' ');
}

interface ColumnsState {
  visible: ColumnVisibility;
  toggle: (column: OptionalColumn) => void;
  reset: () => void;
}

export const useColumnsStore = create<ColumnsState>()(
  persist(
    (set) => ({
      visible: { ...DEFAULT_COLUMNS },
      toggle: (column) => {
        set((state) => ({ visible: { ...state.visible, [column]: !state.visible[column] } }));
      },
      reset: () => {
        set({ visible: { ...DEFAULT_COLUMNS } });
      },
    }),
    { name: 'git-panther.graph-columns' },
  ),
);
