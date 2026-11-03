import { useQuery } from '@tanstack/react-query';

import { ipc, unwrap, type DiffSide, type HunkAction, type HunkTarget } from '../../../shared/ipc';
import { repositoryQueryKey } from './useRepository';
import { useRepositoryMutation } from './useRepositoryMutation';

/** What a diff shows: uncommitted work on one side of the index, or a commit. */
export type DiffSource =
  | { kind: 'workingTree'; file: string; side: DiffSide }
  | { kind: 'commit'; file: string; commitId: string };

const statusKey = (path: string) => [...repositoryQueryKey(path), 'status'] as const;

const diffKey = (path: string, source: DiffSource) =>
  [
    ...repositoryQueryKey(path),
    'diff',
    source.kind,
    source.file,
    source.kind === 'commit' ? source.commitId : source.side,
  ] as const;

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
      return unwrap(
        await (source.kind === 'commit'
          ? ipc.commitFileDiff(path, source.commitId, source.file)
          : ipc.fileDiff(path, source.file, source.side)),
      );
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
