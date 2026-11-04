import { useQuery } from '@tanstack/react-query';

import { ipc, unwrap } from '../../../shared/ipc';
import { repositoryQueryKey } from './useRepository';
import { useRepositoryMutation } from './useRepositoryMutation';

export function useSubmodules(path: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'submodules'],
    queryFn: async () => unwrap(await ipc.listSubmodules(path)),
  });
}

export function useUpdateSubmodules(path: string) {
  return useRepositoryMutation(path, () =>
    ipc.updateSubmodules(path, crypto.randomUUID(), () => undefined),
  );
}

export function useWorktrees(path: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'worktrees'],
    queryFn: async () => unwrap(await ipc.listWorktrees(path)),
  });
}

export function useAddWorktree(path: string) {
  return useRepositoryMutation(path, (branch: string) => ipc.addWorktree(path, branch));
}

export function useRemoveWorktree(path: string) {
  return useRepositoryMutation(path, (worktree: string) => ipc.removeWorktree(path, worktree));
}

export function useLfsStatus(path: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'lfs'],
    queryFn: async () => unwrap(await ipc.lfsStatus(path)),
    staleTime: Infinity,
  });
}

/** Adds, re-points or removes a remote, or deletes a branch on one. */
export type RemoteRequest =
  | { action: 'add'; name: string; url: string }
  | { action: 'setUrl'; name: string; url: string }
  | { action: 'remove'; name: string }
  | { action: 'deleteBranch'; branch: string };

export function useRemoteChange(path: string) {
  return useRepositoryMutation(path, (request: RemoteRequest) => {
    switch (request.action) {
      case 'add':
        return ipc.addRemote(path, request.name, request.url);
      case 'setUrl':
        return ipc.setRemoteUrl(path, request.name, request.url);
      case 'remove':
        return ipc.removeRemote(path, request.name);
      case 'deleteBranch':
        return ipc.deleteRemoteBranch(path, request.branch);
    }
  });
}
