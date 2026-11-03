import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc, unwrap, type RepositorySummaryDto } from '../../../shared/ipc';

export const recentRepositoriesQueryKey = ['recent-repositories'] as const;

export type OnRepositoryOpened = (repository: RepositorySummaryDto) => void;

export function useRecentRepositories() {
  return useQuery({
    queryKey: recentRepositoriesQueryKey,
    queryFn: async () => unwrap(await ipc.listRecentRepositories()),
  });
}

/** Invalidates the recent list, then hands the repository to the caller. */
export function useOpenedHandler(onOpened: OnRepositoryOpened) {
  const queryClient = useQueryClient();
  return (repository: RepositorySummaryDto) => {
    void queryClient.invalidateQueries({ queryKey: recentRepositoriesQueryKey });
    onOpened(repository);
  };
}

export function useOpenRepository(onOpened: OnRepositoryOpened) {
  return useMutation({
    mutationFn: async (path: string) => unwrap(await ipc.openRepository(path)),
    onSuccess: useOpenedHandler(onOpened),
  });
}

export function useInitRepository(onOpened: OnRepositoryOpened) {
  return useMutation({
    mutationFn: async (path: string) => unwrap(await ipc.initRepository(path)),
    onSuccess: useOpenedHandler(onOpened),
  });
}

export function useRemoveRecentRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => unwrap(await ipc.removeRecentRepository(path)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recentRepositoriesQueryKey }),
  });
}
