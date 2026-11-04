import { Archive, ArchiveRestore } from 'lucide-react';
import { useCommands } from '../../../shared/commands';
import { Button } from '../../../shared/ui/Button/Button';
import { useApplyStash, useSaveStash, useStashes } from '../api/useStashes';
import styles from './StashActions.module.css';

const ICON_SIZE = 14;

/** Header buttons to stash uncommitted work and pop the newest stash. */
export function StashActions({ path }: { path: string }) {
  const stashes = useStashes(path);
  const save = useSaveStash(path);
  const apply = useApplyStash(path);
  const newest = stashes.data?.[0];
  useCommands(`stash:${path}`, [
    {
      id: 'repository.stash',
      title: 'Stash all changes',
      group: 'Repository',
      enabled: !save.isPending,
      run: () => {
        save.mutate({ message: null, includeUntracked: true });
      },
    },
    {
      id: 'repository.pop',
      title: newest ? `Pop "${newest.message}"` : 'Pop the newest stash',
      group: 'Repository',
      enabled: newest !== undefined,
      run: () => {
        if (newest) apply.mutate({ index: newest.index, pop: true });
      },
    },
  ]);

  return (
    <div className={styles.actions} role="group" aria-label="Stash">
      <Button
        size="sm"
        variant="ghost"
        disabled={save.isPending}
        title="Stash all changes, new files included"
        onClick={() => {
          save.mutate({ message: null, includeUntracked: true });
        }}
      >
        <Archive size={ICON_SIZE} aria-hidden />
        Stash
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!newest || apply.isPending}
        title={newest ? `Pop "${newest.message}"` : 'No stashes'}
        onClick={() => {
          if (newest) apply.mutate({ index: newest.index, pop: true });
        }}
      >
        <ArchiveRestore size={ICON_SIZE} aria-hidden />
        Pop
      </Button>
      {(save.error ?? apply.error) && (
        <p className={styles.error} role="alert" title={(save.error ?? apply.error)?.message}>
          {(save.error ?? apply.error)?.message}
        </p>
      )}
    </div>
  );
}
