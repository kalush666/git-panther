import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ipc, unwrap } from '../../../shared/ipc';

export const repositoryQueryKey = (path: string) => ['repository', path] as const;

/** Reads the repository and keeps it fresh while changes happen on disk. */
export function useRepository(path: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let disposed = false;
    void ipc.watchRepository(path);
    void ipc
      .onRepositoryChanged((changedPath) => {
        if (changedPath === path) {
          void queryClient.invalidateQueries({ queryKey: repositoryQueryKey(path) });
        }
      })
      .then((stop) => {
        if (disposed) {
          stop();
        } else {
          unsubscribe = stop;
        }
      });
    return () => {
      disposed = true;
      unsubscribe?.();
      void ipc.unwatchRepository(path);
    };
  }, [path, queryClient]);

  return useQuery({
    queryKey: repositoryQueryKey(path),
    queryFn: async () => unwrap(await ipc.refreshRepository(path)),
    retry: false,
  });
}
