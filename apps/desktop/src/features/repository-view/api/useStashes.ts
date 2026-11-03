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
    ({ message, includeUntracked }: { message: string | null; includeUntracked: boolean }) =>
      ipc.saveStash(path, message, includeUntracked),
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
