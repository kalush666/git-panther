import type { ChangedFile } from '../../../shared/ipc';

/** One-letter status badges, as in `git status --short`. */
export const CHANGE_LETTERS: Record<ChangedFile['kind'], { letter: string; label: string }> = {
  added: { letter: 'A', label: 'Added' },
  modified: { letter: 'M', label: 'Modified' },
  deleted: { letter: 'D', label: 'Deleted' },
  renamed: { letter: 'R', label: 'Renamed' },
  typeChanged: { letter: 'T', label: 'Type changed' },
  untracked: { letter: 'U', label: 'Untracked' },
};
