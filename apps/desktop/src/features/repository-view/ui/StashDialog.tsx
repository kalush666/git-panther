import * as Dialog from '@radix-ui/react-dialog';
import { useId, useState } from 'react';

import { Button } from '../../../shared/ui/Button/Button';
import styles from './BranchNameDialog.module.css';

interface StashDialogProps {
  error: string | null;
  isPending: boolean;
  onSubmit: (message: string | null, includeUntracked: boolean) => void;
  onCancel: () => void;
}

/** Asks for an optional stash message and whether to include new files. */
export function StashDialog({ error, isPending, onSubmit, onCancel }: StashDialogProps) {
  const id = useId();
  const [message, setMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(true);

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>Stash changes</Dialog.Title>
          <Dialog.Description className={styles.description}>
            Sets your uncommitted changes aside and leaves a clean working copy. Bring them back
            from the Stashes list.
          </Dialog.Description>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (!isPending) onSubmit(message.trim() || null, includeUntracked);
            }}
          >
            <label className={styles.label} htmlFor={id}>
              Message (optional)
            </label>
            <input
              id={id}
              className={styles.input}
              value={message}
              autoFocus
              placeholder="What were you working on?"
              onChange={(event) => {
                setMessage(event.target.value);
              }}
            />
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={includeUntracked}
                onChange={(event) => {
                  setIncludeUntracked(event.target.checked);
                }}
              />
              Include new (untracked) files
            </label>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <div className={styles.actions}>
              <Button onClick={onCancel}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={isPending}>
                Stash
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
