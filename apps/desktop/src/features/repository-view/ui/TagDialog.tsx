import * as Dialog from '@radix-ui/react-dialog';
import { useId, useState } from 'react';

import { Button } from '../../../shared/ui/Button/Button';
import styles from './BranchNameDialog.module.css';

interface TagDialogProps {
  targetLabel: string;
  error: string | null;
  isPending: boolean;
  onSubmit: (name: string, message: string | null) => void;
  onCancel: () => void;
}

/** Asks for a tag name and an optional message (which makes it annotated). */
export function TagDialog({ targetLabel, error, isPending, onSubmit, onCancel }: TagDialogProps) {
  const id = useId();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

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
          <Dialog.Title className={styles.title}>Create tag</Dialog.Title>
          <Dialog.Description className={styles.description}>
            Tags {targetLabel}. With a message, the tag is annotated.
          </Dialog.Description>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() && !isPending) onSubmit(name.trim(), message.trim() || null);
            }}
          >
            <label className={styles.label} htmlFor={`${id}-name`}>
              Tag name
            </label>
            <input
              id={`${id}-name`}
              className={styles.input}
              value={name}
              autoFocus
              spellCheck={false}
              placeholder="v1.2.0"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <label className={styles.label} htmlFor={`${id}-message`}>
              Message (optional)
            </label>
            <input
              id={`${id}-message`}
              className={styles.input}
              value={message}
              placeholder="Release 1.2.0"
              onChange={(event) => {
                setMessage(event.target.value);
              }}
            />
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <div className={styles.actions}>
              <Button onClick={onCancel}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={!name.trim() || isPending}>
                Create tag
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
