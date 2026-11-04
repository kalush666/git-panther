import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc, unwrap } from '../ipc';

const accountsKey = ['accounts'] as const;

export interface SignInInput {
  server: string;
  username: string;
  password: string;
  /** Tries the credentials against this repository's remote first. */
  repository: string | null;
}

export function useAccounts() {
  return useQuery({
    queryKey: accountsKey,
    queryFn: async () => unwrap(await ipc.listAccounts()),
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ server, username, password, repository }: SignInInput) =>
      unwrap(await ipc.signIn(server, username, password, repository)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: accountsKey }),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ server, username }: { server: string; username: string }) =>
      unwrap(await ipc.signOut(server, username)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: accountsKey }),
  });
}

/** The HTTPS server of a remote URL, e.g. `https://gitlab.example.internal`. */
export function serverOf(url: string): string | null {
  const match = /^(https?):\/\/(?:[^@/]+@)?([^/?#]+)/i.exec(url.trim());
  return match ? `${match[1]?.toLowerCase() ?? 'https'}://${match[2]?.toLowerCase() ?? ''}` : null;
}
