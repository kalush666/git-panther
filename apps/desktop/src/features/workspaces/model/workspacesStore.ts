import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** A named group of repositories, seen together on one page. */
export interface Workspace {
  id: string;
  name: string;
  /** Repository paths, in the order they were added. */
  paths: string[];
}

interface WorkspacesState {
  workspaces: Workspace[];
  /** The workspace the page shows. */
  selectedId: string | null;
  create: (name: string, paths: string[]) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  select: (id: string) => void;
  addPaths: (id: string, paths: string[]) => void;
  removePath: (id: string, path: string) => void;
}

const update = (workspaces: Workspace[], id: string, change: (workspace: Workspace) => Workspace) =>
  workspaces.map((workspace) => (workspace.id === id ? change(workspace) : workspace));

export const useWorkspacesStore = create<WorkspacesState>()(
  persist(
    (set) => ({
      workspaces: [],
      selectedId: null,
      create: (name, paths) => {
        const workspace = {
          id: crypto.randomUUID(),
          name: name.trim(),
          paths: [...new Set(paths)],
        };
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
          selectedId: workspace.id,
        }));
      },
      rename: (id, name) => {
        set((state) => ({
          workspaces: update(state.workspaces, id, (workspace) => ({
            ...workspace,
            name: name.trim(),
          })),
        }));
      },
      remove: (id) => {
        set((state) => {
          const workspaces = state.workspaces.filter((workspace) => workspace.id !== id);
          return { workspaces, selectedId: workspaces[0]?.id ?? null };
        });
      },
      select: (id) => {
        set({ selectedId: id });
      },
      addPaths: (id, paths) => {
        set((state) => ({
          workspaces: update(state.workspaces, id, (workspace) => ({
            ...workspace,
            paths: [...new Set([...workspace.paths, ...paths])],
          })),
        }));
      },
      removePath: (id, path) => {
        set((state) => ({
          workspaces: update(state.workspaces, id, (workspace) => ({
            ...workspace,
            paths: workspace.paths.filter((existing) => existing !== path),
          })),
        }));
      },
    }),
    { name: 'git-panther.workspaces' },
  ),
);
