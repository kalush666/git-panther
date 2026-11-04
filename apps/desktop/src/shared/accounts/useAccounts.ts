import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

/** The personal number last signed in with, offered on the next sign-in. */
const useLastUsernameStore = create<{ username: string }>()(
  persist(() => ({ username: '' }), { name: 'git-panther.last-username' }),
);

export function useLastUsername(): string {
  return useLastUsernameStore((state) => state.username);
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ server, username, password, repository }: SignInInput) =>
      unwrap(await ipc.signIn(server, username, password, repository)),
    onSuccess: (account) => {
      useLastUsernameStore.setState({ username: account.username });
    },
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

/** `https://gitlab.example.internal` → `gitlab.example.internal`. */
export function hostOf(server: string): string {
  return server.replace(/^\w+:\/\//, '');
}
