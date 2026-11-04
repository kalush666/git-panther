import { useQuery } from '@tanstack/react-query';

import { ipc, unwrap } from '../../../shared/ipc';
import { repositoryQueryKey } from './useRepository';

export function useRemotes(path: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'remotes'],
    queryFn: async () => unwrap(await ipc.listRemotes(path)),
  });
}
