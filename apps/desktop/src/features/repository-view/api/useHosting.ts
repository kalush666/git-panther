import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc, unwrap, type HostingKind } from '../../../shared/ipc';

/** Hosting answers come from the network; refresh them now and then, not on every file change. */
const HOSTING_STALE_MS = 60_000;

export function useHostingStatus(path: string) {
  return useQuery({
    queryKey: ['hosting', path, 'status'],
    queryFn: async () => unwrap(await ipc.hostingStatus(path)),
  });
}

export function usePullRequests(path: string, enabled: boolean) {
  return useQuery({
    queryKey: ['hosting', path, 'pullRequests'],
    queryFn: async () => unwrap(await ipc.listPullRequests(path)),
    enabled,
    staleTime: HOSTING_STALE_MS,
  });
}

export function useIssues(path: string, enabled: boolean) {
  return useQuery({
    queryKey: ['hosting', path, 'issues'],
    queryFn: async () => unwrap(await ipc.listIssues(path)),
    enabled,
    staleTime: HOSTING_STALE_MS,
  });
}

/** Connects a server and refreshes everything that depends on it. */
export function useConnectHosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      server,
      kind,
      token,
    }: {
      server: string;
      kind: HostingKind;
      token: string;
    }) => unwrap(await ipc.connectHosting(server, kind, token)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['hosting'] }),
  });
}

/** Connects a GitLab server with the git sign-in, so no access token is needed. */
export function useConnectHostingWithLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (server: string) => unwrap(await ipc.connectHostingWithLogin(server)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['hosting'] }),
  });
}

export function useDisconnectHosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (server: string) => unwrap(await ipc.disconnectHosting(server)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['hosting'] }),
  });
}

export function useHostingConnections() {
  return useQuery({
    queryKey: ['hosting', 'connections'],
    queryFn: async () => unwrap(await ipc.listHosting()),
  });
}

export function useCreatePullRequest(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      source,
      target,
      title,
    }: {
      source: string;
      target: string;
      title: string;
    }) => unwrap(await ipc.createPullRequest(path, source, target, title)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['hosting', path] }),
  });
}
