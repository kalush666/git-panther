import { Archive, ArchiveRestore } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../../shared/ui/Button/Button';
import { useApplyStash, useSaveStash, useStashes } from '../api/useStashes';
import { StashDialog } from './StashDialog';
import styles from './StashActions.module.css';

const ICON_SIZE = 14;

/** Header buttons to stash uncommitted work and pop the newest stash. */
export function StashActions({ path }: { path: string }) {
  const stashes = useStashes(path);
  const save = useSaveStash(path);
  const apply = useApplyStash(path);
  const [dialogOpen, setDialogOpen] = useState(false);
  const newest = stashes.data?.[0];

  return (
    <div className={styles.actions} role="group" aria-label="Stash">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          save.reset();
          setDialogOpen(true);
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
      {apply.error && (
        <p className={styles.error} role="alert" title={apply.error.message}>
          {apply.error.message}
        </p>
      )}
      {dialogOpen && (
        <StashDialog
          error={save.error?.message ?? null}
          isPending={save.isPending}
          onCancel={() => {
            setDialogOpen(false);
          }}
          onSubmit={(message, includeUntracked) => {
            save.mutate(
              { message, includeUntracked },
              {
                onSuccess: () => {
                  setDialogOpen(false);
                },
              },
            );
          }}
        />
      )}
    </div>
  );
}
