import { useQuery } from '@tanstack/react-query';

import { ipc, unwrap, type DiffSide, type HunkAction, type HunkTarget } from '../../../shared/ipc';
import { repositoryQueryKey } from './useRepository';
import { useRepositoryMutation } from './useRepositoryMutation';

/** What a diff shows: uncommitted work on one side of the index, or a commit. */
export type DiffSource =
  | { kind: 'workingTree'; file: string; side: DiffSide }
  | { kind: 'commit'; file: string; commitId: string }
  /** Between two commits, e.g. a merge request's fork point and its head. */
  | { kind: 'compare'; file: string; from: string; to: string };

/** What tells two diffs of the same file apart. */
function diffVersion(source: DiffSource): string {
  switch (source.kind) {
    case 'workingTree':
      return source.side;
    case 'commit':
      return source.commitId;
    case 'compare':
      return `${source.from}..${source.to}`;
  }
}

function loadDiff(path: string, source: DiffSource) {
  switch (source.kind) {
    case 'workingTree':
      return ipc.fileDiff(path, source.file, source.side);
    case 'commit':
      return ipc.commitFileDiff(path, source.commitId, source.file);
    case 'compare':
      return ipc.compareFileDiff(path, source.from, source.to, source.file);
  }
}

const statusKey = (path: string) => [...repositoryQueryKey(path), 'status'] as const;

const diffKey = (path: string, source: DiffSource) =>
  [...repositoryQueryKey(path), 'diff', source.kind, source.file, diffVersion(source)] as const;

export function useWorkingTreeStatus(path: string) {
  return useQuery({
    queryKey: statusKey(path),
    queryFn: async () => unwrap(await ipc.workingTreeStatus(path)),
  });
}

export function useFileDiff(path: string, source: DiffSource | null) {
  return useQuery({
    queryKey: source ? diffKey(path, source) : [...repositoryQueryKey(path), 'diff', 'none'],
    queryFn: async () => {
      if (!source) {
        throw new Error('useFileDiff runs only with a source');
      }
      return unwrap(await loadDiff(path, source));
    },
    enabled: source !== null,
  });
}

export function useStageFiles(path: string) {
  return useRepositoryMutation(path, (files: string[]) => ipc.stageFiles(path, files));
}

export function useUnstageFiles(path: string) {
  return useRepositoryMutation(path, (files: string[]) => ipc.unstageFiles(path, files));
}

/** Adds a `.gitignore` line, so matching untracked files stop showing. */
export function useIgnorePath(path: string) {
  return useRepositoryMutation(path, (pattern: string) => ipc.ignorePath(path, pattern));
}

export function useDiscardFiles(path: string) {
  return useRepositoryMutation(path, (files: string[]) => ipc.discardFiles(path, files));
}

export function useApplyHunk(path: string) {
  return useRepositoryMutation(path, ({ hunk, action }: { hunk: HunkTarget; action: HunkAction }) =>
    ipc.applyHunk(path, hunk, action),
  );
}

export function useCommitChanges(path: string) {
  return useRepositoryMutation(path, ({ message, amend }: { message: string; amend: boolean }) =>
    ipc.commitChanges(path, message, amend),
  );
}

export async function loadHeadMessage(path: string): Promise<string> {
  return unwrap(await ipc.headMessage(path)) ?? '';
}
