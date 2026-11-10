import { useQuery } from '@tanstack/react-query';

import { ipc, unwrap } from '../../../shared/ipc';
import { repositoryQueryKey } from './useRepository';
import { useRepositoryMutation } from './useRepositoryMutation';

export function useBranches(path: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'branches'],
    queryFn: async () => unwrap(await ipc.listBranches(path)),
  });
}

export function useCreateBranch(path: string) {
  return useRepositoryMutation(
    path,
    ({ name, start, checkout }: { name: string; start: string; checkout: boolean }) =>
      ipc.createBranch(path, name, start, checkout),
  );
}

export function useCheckoutBranch(path: string) {
  return useRepositoryMutation(path, (name: string) => ipc.checkoutBranch(path, name));
}

export function useSetUpstream(path: string) {
  return useRepositoryMutation(
    path,
    ({ branch, upstream }: { branch: string; upstream: string | null }) =>
      ipc.setUpstream(path, branch, upstream),
  );
}

export function useRenameBranch(path: string) {
  return useRepositoryMutation(path, ({ from, to }: { from: string; to: string }) =>
    ipc.renameBranch(path, from, to),
  );
}

export function useDeleteBranch(path: string) {
  return useRepositoryMutation(path, ({ name, force }: { name: string; force: boolean }) =>
    ipc.deleteBranch(path, name, force),
  );
}
