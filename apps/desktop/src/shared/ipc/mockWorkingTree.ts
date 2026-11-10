import type {
  ChangedFile,
  DiffHunk,
  DiffSide,
  FileDiff,
  HunkAction,
  HunkTarget,
  Operation,
  Result,
  WorkingTreeStatus,
} from './backend';
import type { AppErrorKind } from './bindings';

type Kind = ChangedFile['kind'];

export interface MockFile {
  path: string;
  kind: Kind;
  staged: DiffHunk[];
  unstaged: DiffHunk[];
}

function hunk(start: number, removed: string, added: string): DiffHunk {
  return {
    header: `@@ -${start},3 +${start},3 @@`,
    oldStart: start,
    oldLines: 3,
    newStart: start,
    newLines: 3,
    lines: [
      { kind: 'context', oldNumber: start, newNumber: start, content: 'const panther = true;' },
      { kind: 'removed', oldNumber: start + 1, newNumber: null, content: removed },
      { kind: 'added', oldNumber: null, newNumber: start + 1, content: added },
      {
        kind: 'context',
        oldNumber: start + 2,
        newNumber: start + 2,
        content: 'export default panther;',
      },
    ],
  };
}

function initialFiles(): MockFile[] {
  return [
    {
      path: 'README.md',
      kind: 'modified',
      staged: [],
      unstaged: [hunk(1, '# Demo', '# Demo repository')],
    },
    {
      path: 'src/app.ts',
      kind: 'modified',
      staged: [],
      unstaged: [
        hunk(4, 'const speed = 1;', 'const speed = 2;'),
        hunk(40, 'log("old");', 'log("new message");'),
      ],
    },
    {
      path: 'notes/todo.md',
      kind: 'untracked',
      staged: [],
      unstaged: [
        {
          header: '@@ -0,0 +1,2 @@',
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: 2,
          lines: [
            { kind: 'added', oldNumber: null, newNumber: 1, content: '- write tests' },
            { kind: 'added', oldNumber: null, newNumber: 2, content: '- ship it' },
          ],
        },
      ],
    },
  ];
}

const ok = <T>(data: T): Result<T> => ({ status: 'ok', data });
const failure = (kind: AppErrorKind, message: string): Result<never> => ({
  status: 'error',
  error: { kind, message },
});

/** `?mockConflict=merge` (or `rebase`) starts in the middle of that operation. */
function initialOperation(): Operation | null {
  const value = new URLSearchParams(window.location.search).get('mockConflict');
  return value === 'merge' || value === 'rebase' ? value : null;
}

const CONFLICTED_FILES = ['src/panther.ts', 'docs/guide.md'];

/**
 * In-memory working tree for the browser mock: three changed files that can
 * be staged, unstaged, discarded and committed file by file or hunk by hunk.
 */
export function createMockWorkingTree() {
  let files = initialFiles();
  let headMessage = 'Merge topic 0';
  let operation = initialOperation();
  let conflicted = operation ? [...CONFLICTED_FILES] : [];

  const sideOf = (file: MockFile, side: DiffSide) =>
    side === 'staged' ? file.staged : file.unstaged;

  const entries = (side: DiffSide): ChangedFile[] =>
    files
      .filter((file) => sideOf(file, side).length > 0)
      .map((file) => ({
        path: file.path,
        kind: side === 'staged' && file.kind === 'untracked' ? 'added' : file.kind,
        from: null,
      }));

  const move = (paths: readonly string[], from: DiffSide) => {
    for (const file of files.filter((candidate) => paths.includes(candidate.path))) {
      const to: DiffSide = from === 'staged' ? 'unstaged' : 'staged';
      sideOf(file, to).push(...sideOf(file, from).splice(0));
    }
  };

  return {
    status: (): Result<WorkingTreeStatus> =>
      ok({ staged: entries('staged'), unstaged: entries('unstaged'), conflicted }),

    diff: (path: string, side: DiffSide): Result<FileDiff> => {
      const file = files.find((candidate) => candidate.path === path);
      return ok({
        path,
        oldPath: null,
        isBinary: false,
        isTruncated: false,
        hunks: file ? [...sideOf(file, side)] : [],
      });
    },

    stage: (paths: readonly string[]) => {
      move(paths, 'unstaged');
      return ok(null);
    },

    unstage: (paths: readonly string[]) => {
      move(paths, 'staged');
      return ok(null);
    },

    /** Hides untracked files that a `/path` or `*.ext` pattern matches. */
    ignore: (pattern: string) => {
      const matches = (path: string) =>
        pattern.startsWith('*.') ? path.endsWith(pattern.slice(1)) : `/${path}` === pattern;
      files = files.filter((file) => file.kind !== 'untracked' || !matches(file.path));
      return ok(null);
    },

    discard: (paths: readonly string[]) => {
      for (const file of files.filter((candidate) => paths.includes(candidate.path))) {
        file.unstaged = [];
      }
      return ok(null);
    },

    applyHunk: ({ file: path, index, header }: HunkTarget, action: HunkAction) => {
      const file = files.find((candidate) => candidate.path === path);
      const from = action === 'unstage' ? file?.staged : file?.unstaged;
      if (!file || !from || from[index]?.header !== header) {
        return failure('hunkOutdated', `${path} changed since it was shown.`);
      }
      const [moved] = from.splice(index, 1);
      if (moved && action !== 'discard') {
        (action === 'stage' ? file.staged : file.unstaged).push(moved);
      }
      return ok(null);
    },

    commit: (message: string, amend: boolean): Result<string> => {
      const hasStaged = files.some((file) => file.staged.length > 0);
      if (!hasStaged && !amend) {
        return failure('nothingToCommit', 'There is nothing staged to commit.');
      }
      files = files.map((file) => ({ ...file, staged: [] }));
      headMessage = message.trim();
      return ok('f'.repeat(40));
    },

    headMessage: (): Result<string | null> => ok(`${headMessage}\n`),

    /** Removes and returns the changes a stash would take, or `null` if there are none. */
    takeChanges: (includeUntracked: boolean, only?: readonly string[]): MockFile[] | null => {
      const taken = files.filter(
        (file) =>
          (includeUntracked || file.kind !== 'untracked') &&
          (only === undefined || only.length === 0 || only.includes(file.path)) &&
          (file.staged.length > 0 || file.unstaged.length > 0),
      );
      if (taken.length === 0) return null;
      files = files.filter((file) => !taken.includes(file));
      return taken;
    },

    restoreChanges: (restored: readonly MockFile[]): Result<null> => {
      if (restored.some((file) => files.some((existing) => existing.path === file.path))) {
        return failure(
          'checkoutConflict',
          'Your uncommitted changes would be overwritten. Commit or stash them first.',
        );
      }
      files.push(...structuredClone(restored));
      return ok(null);
    },

    operation: (): Result<Operation | null> => ok(operation),

    resolve: (paths: readonly string[]): Result<null> => {
      conflicted = conflicted.filter((path) => !paths.includes(path));
      return ok(null);
    },

    continueOperation: (): Result<null> => {
      if (!operation) {
        return failure(
          'noOperationInProgress',
          'No merge, rebase, cherry-pick or revert is in progress.',
        );
      }
      if (conflicted.length > 0) {
        return failure(
          'unresolvedConflicts',
          'Some files still have conflicts. Resolve every file before continuing.',
        );
      }
      operation = null;
      return ok(null);
    },

    /** Stops `next` part-way with the usual conflicted files, like a real conflicting merge. */
    startConflict: (next: Operation) => {
      operation = next;
      conflicted = [...CONFLICTED_FILES];
    },

    abortOperation: (): Result<null> => {
      if (!operation) {
        return failure(
          'noOperationInProgress',
          'No merge, rebase, cherry-pick or revert is in progress.',
        );
      }
      operation = null;
      conflicted = [];
      return ok(null);
    },
  };
}
