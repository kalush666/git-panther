import { useMutation, useQueryClient } from '@tanstack/react-query';

import { unwrap, type Result } from '../../../shared/ipc';
import { repositoryQueryKey } from './useRepository';

/**
 * A change to the repository that refreshes everything about it afterwards:
 * status, diffs, branches and the graph.
 */
export function useRepositoryMutation<Input, Output>(
  path: string,
  run: (input: Input) => Promise<Result<Output>>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Input) => unwrap(await run(input)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repositoryQueryKey(path) }),
  });
}
