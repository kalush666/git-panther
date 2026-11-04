import type { Result, Stash } from './backend';
import type { AppErrorKind } from './bindings';
import type { createMockWorkingTree, MockFile } from './mockWorkingTree';

interface MockStash {
  message: string;
  files: MockFile[];
}

const failure = (kind: AppErrorKind, message: string): Result<never> => ({
  status: 'error',
  error: { kind, message },
});

/** In-memory stash for the browser mock, moving changes out of and back into the working tree. */
export function createMockStashes(workingTree: ReturnType<typeof createMockWorkingTree>) {
  // Newest first, like `git stash list`.
  let entries: MockStash[] = [];

  const find = (index: number) => entries.at(index);
  const notFound = (index: number) =>
    failure(
      'stashNotFound',
      `Stash entry ${index} does not exist. The stash may have changed; refresh and try again.`,
    );

  return {
    list: (): Result<Stash[]> => ({
      status: 'ok',
      data: entries.map((entry, index) => ({
        index,
        message: entry.message,
        id: index.toString(16).padStart(40, 'c'),
      })),
    }),

    save: (message: string | null, includeUntracked: boolean, branch: string): Result<null> => {
      const files = workingTree.takeChanges(includeUntracked);
      if (!files) return failure('nothingToStash', 'There are no local changes to stash.');
      const text = message?.trim() ? message.trim() : 'WIP';
      entries = [{ message: `On ${branch}: ${text}`, files }, ...entries];
      return { status: 'ok', data: null };
    },

    apply: (index: number, pop: boolean): Result<null> => {
      const entry = find(index);
      if (!entry) return notFound(index);
      const restored = workingTree.restoreChanges(entry.files);
      if (restored.status === 'ok' && pop) {
        entries = entries.filter((candidate) => candidate !== entry);
      }
      return restored;
    },

    /** Drops entry `index`; `onDropped` receives a way to put it back, for Undo. */
    drop: (
      index: number,
      onDropped: (message: string, restore: () => void) => void,
    ): Result<null> => {
      const entry = find(index);
      if (!entry) return notFound(index);
      entries = entries.filter((candidate) => candidate !== entry);
      onDropped(entry.message, () => {
        entries = [entry, ...entries];
      });
      return { status: 'ok', data: null };
    },
  };
}
