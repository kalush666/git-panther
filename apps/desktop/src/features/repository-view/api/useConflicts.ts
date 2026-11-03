import { useQuery } from '@tanstack/react-query';

import { ipc, unwrap, type ConflictSide } from '../../../shared/ipc';
import { repositoryQueryKey } from './useRepository';
import { useRepositoryMutation } from './useRepositoryMutation';

/** The merge, rebase, cherry-pick or revert waiting on the user, if any. */
export function useOperation(path: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'operation'],
    queryFn: async () => unwrap(await ipc.repositoryOperation(path)),
  });
}

export function useResolveConflict(path: string) {
  return useRepositoryMutation(path, ({ file, side }: { file: string; side: ConflictSide }) =>
    ipc.resolveConflict(path, file, side),
  );
}

export function useMarkResolved(path: string) {
  return useRepositoryMutation(path, (files: string[]) => ipc.markResolved(path, files));
}

export function useContinueOperation(path: string) {
  return useRepositoryMutation(path, () => ipc.continueOperation(path));
}

export function useAbortOperation(path: string) {
  return useRepositoryMutation(path, () => ipc.abortOperation(path));
}
