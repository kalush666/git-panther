import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Identity } from '../ipc';

/** A saved identity to switch repositories to in one click. */
export interface IdentityProfile extends Identity {
  id: string;
}

interface IdentityProfilesState {
  profiles: IdentityProfile[];
  save: (identity: Identity) => void;
  remove: (id: string) => void;
}

const same = (a: Identity, b: Identity) =>
  a.name === b.name && a.email === b.email && a.signing?.key === b.signing?.key;

/** Identities the user commits as, e.g. work and personal; remembered across sessions. */
export const useIdentityProfiles = create<IdentityProfilesState>()(
  persist(
    (set) => ({
      profiles: [],
      save: (identity) => {
        set((state) =>
          state.profiles.some((profile) => same(profile, identity))
            ? state
            : { profiles: [...state.profiles, { ...identity, id: crypto.randomUUID() }] },
        );
      },
      remove: (id) => {
        set((state) => ({ profiles: state.profiles.filter((profile) => profile.id !== id) }));
      },
    }),
    { name: 'git-panther.identities' },
  ),
);

/** Guesses the signing format from the key: SSH keys are paths or `ssh-…` lines. */
export function signingFor(key: string): Identity['signing'] {
  const trimmed = key.trim();
  if (trimmed === '') return null;
  const ssh = trimmed.endsWith('.pub') || trimmed.startsWith('ssh-') || trimmed.startsWith('key::');
  return { format: ssh ? 'ssh' : 'openPgp', key: trimmed };
}
