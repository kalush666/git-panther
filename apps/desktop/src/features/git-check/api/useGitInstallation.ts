import { useQuery } from '@tanstack/react-query';

import { ipc, unwrap } from '../../../shared/ipc';

export const gitInstallationQueryKey = ['git-installation'] as const;

export function useGitInstallation() {
  return useQuery({
    queryKey: gitInstallationQueryKey,
    queryFn: async () => unwrap(await ipc.checkGitInstallation()),
    staleTime: Infinity,
    retry: false,
  });
}
