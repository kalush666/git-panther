import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const AUTO_FETCH_CHOICES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'Off' },
  { value: 5, label: 'Every 5 min' },
  { value: 10, label: 'Every 10 min' },
  { value: 30, label: 'Every 30 min' },
];

interface AutoFetchState {
  /** Minutes between quiet fetches; 0 turns it off. */
  minutes: number;
  setMinutes: (minutes: number) => void;
}

export const useAutoFetchStore = create<AutoFetchState>()(
  persist(
    (set) => ({
      minutes: 10,
      setMinutes: (minutes) => {
        set({ minutes });
      },
    }),
    { name: 'git-panther.auto-fetch' },
  ),
);
