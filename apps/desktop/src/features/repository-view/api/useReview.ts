import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc, unwrap } from '../../../shared/ipc';
import { repositoryQueryKey } from './useRepository';

const reviewKey = (path: string, number: number) => ['hosting', path, 'review', number] as const;

/** Description, approvals and comments of a request. */
export function usePullRequestReview(path: string, number: number | null) {
  return useQuery({
    queryKey: reviewKey(path, number ?? -1),
    queryFn: async () => unwrap(await ipc.pullRequestReview(path, number ?? -1)),
    enabled: number !== null,
  });
}

/** What `head` changes since it forked from `base`. */
export function useComparison(path: string, base: string, head: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'compare', base, head],
    queryFn: async () => unwrap(await ipc.compareRefs(path, base, head)),
    retry: false,
  });
}

/** Comment, approve or merge request `number`, then refresh what shows it. */
export function useReviewAction(path: string, number: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      action: { kind: 'comment'; body: string } | { kind: 'approve' } | { kind: 'merge' },
    ) => {
      switch (action.kind) {
        case 'comment':
          return unwrap(await ipc.commentPullRequest(path, number, action.body));
        case 'approve':
          return unwrap(await ipc.approvePullRequest(path, number));
        case 'merge':
          return unwrap(await ipc.mergePullRequest(path, number));
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['hosting', path] }),
  });
}
