import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc, unwrap } from '../../../shared/ipc';

const settingsKey = ['settings'] as const;

export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: async () => unwrap(await ipc.getSettings()),
  });
}

/** Checks a candidate git without switching to it. */
export function useCheckGitExecutable() {
  return useMutation({
    mutationFn: async (executable: string | null) =>
      unwrap(await ipc.checkGitExecutable(executable)),
  });
}

export function useSetGitExecutable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (executable: string | null) => unwrap(await ipc.setGitExecutable(executable)),
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKey, settings);
    },
  });
}
