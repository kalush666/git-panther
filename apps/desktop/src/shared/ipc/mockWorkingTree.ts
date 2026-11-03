import type {
  ChangedFile,
  DiffHunk,
  DiffSide,
  FileDiff,
  HunkAction,
  HunkTarget,
  Result,
  WorkingTreeStatus,
} from './backend';

type Kind = ChangedFile['kind'];

interface MockFile {
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
const failure = (kind: 'nothingToCommit' | 'hunkOutdated', message: string): Result<never> => ({
  status: 'error',
  error: { kind, message },
});

/**
 * In-memory working tree for the browser mock: three changed files that can
 * be staged, unstaged, discarded and committed file by file or hunk by hunk.
 */
export function createMockWorkingTree() {
  let files = initialFiles();
  let headMessage = 'Merge topic 0';

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
      ok({ staged: entries('staged'), unstaged: entries('unstaged'), conflicted: [] }),

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
  };
}
