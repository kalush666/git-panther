import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** VS Code's command; any editor that takes a folder works. */
export const DEFAULT_EDITOR = 'code';

interface EditorState {
  /** A command on PATH (e.g. `code`) or the full path to an editor. */
  command: string;
  setCommand: (command: string) => void;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      command: DEFAULT_EDITOR,
      setCommand: (command) => {
        set({ command });
      },
    }),
    { name: 'git-panther.editor' },
  ),
);
