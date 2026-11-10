import { useQuery } from '@tanstack/react-query';

import { ipc, unwrap } from '../../../shared/ipc';
import { repositoryQueryKey } from './useRepository';
import { useRepositoryMutation } from './useRepositoryMutation';

export function useStashes(path: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'stashes'],
    queryFn: async () => unwrap(await ipc.listStashes(path)),
  });
}

export function useSaveStash(path: string) {
  return useRepositoryMutation(
    path,
    ({
      message,
      includeUntracked,
      files,
    }: {
      message: string | null;
      includeUntracked: boolean;
      /** Only these files; every change when left out. */
      files?: string[];
    }) => ipc.saveStash(path, message, includeUntracked, files),
  );
}

export function useStashFiles(path: string, index: number | null) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'stashFiles', index],
    queryFn: async () => unwrap(await ipc.stashFiles(path, index ?? 0)),
    enabled: index !== null,
  });
}

export function useApplyStashFile(path: string) {
  return useRepositoryMutation(path, ({ index, file }: { index: number; file: string }) =>
    ipc.applyStashFile(path, index, file),
  );
}

export function useRenameStash(path: string) {
  return useRepositoryMutation(path, ({ index, message }: { index: number; message: string }) =>
    ipc.renameStash(path, index, message),
  );
}

export function useApplyStash(path: string) {
  return useRepositoryMutation(path, ({ index, pop }: { index: number; pop: boolean }) =>
    ipc.applyStash(path, index, pop),
  );
}

export function useDropStash(path: string) {
  return useRepositoryMutation(path, (index: number) => ipc.dropStash(path, index));
}
