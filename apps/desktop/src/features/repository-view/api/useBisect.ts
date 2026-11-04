import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc, unwrap, type BisectVerdict } from '../../../shared/ipc';
import { repositoryQueryKey } from './useRepository';

type BisectStep =
  | { kind: 'start'; bad: string; good: string }
  | { kind: 'mark'; verdict: BisectVerdict }
  | { kind: 'reset' };

/** The running bisect, and the steps that move it on. */
export function useBisect(path: string) {
  const queryClient = useQueryClient();
  const statusKey = [...repositoryQueryKey(path), 'bisect'];
  const status = useQuery({
    queryKey: statusKey,
    queryFn: async () => unwrap(await ipc.bisectStatus(path)),
  });
  const step = useMutation({
    mutationFn: async (request: BisectStep) => {
      switch (request.kind) {
        case 'start':
          return unwrap(await ipc.bisectStart(path, request.bad, request.good));
        case 'mark':
          return unwrap(await ipc.bisectMark(path, request.verdict));
        case 'reset':
          unwrap(await ipc.bisectReset(path));
          return null;
      }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(statusKey, next ?? undefined);
    },
    // Each step checks out another commit.
    onSettled: () => queryClient.invalidateQueries({ queryKey: repositoryQueryKey(path) }),
  });
  return { status: status.data, step };
}
