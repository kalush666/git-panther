import * as Dialog from '@radix-ui/react-dialog';
import { useId, useState, type ReactNode } from 'react';

import { Button } from '../../../shared/ui/Button/Button';
import styles from './BranchNameDialog.module.css';

interface BranchNameDialogProps {
  title: string;
  description: ReactNode;
  initialName: string;
  confirmLabel: string;
  /** Shows a "Switch to it" option when set. */
  offerCheckout: boolean;
  error: string | null;
  isPending: boolean;
  onSubmit: (name: string, checkout: boolean) => void;
  onCancel: () => void;
}

/** Asks for a branch name, e.g. to create or rename a branch. */
export function BranchNameDialog({
  title,
  description,
  initialName,
  confirmLabel,
  offerCheckout,
  error,
  isPending,
  onSubmit,
  onCancel,
}: BranchNameDialogProps) {
  const id = useId();
  const [name, setName] = useState(initialName);
  const [checkout, setCheckout] = useState(true);

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
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          <Dialog.Description className={styles.description}>{description}</Dialog.Description>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() && !isPending) onSubmit(name.trim(), offerCheckout && checkout);
            }}
          >
            <label className={styles.label} htmlFor={id}>
              Branch name
            </label>
            <input
              id={id}
              className={styles.input}
              value={name}
              autoFocus
              spellCheck={false}
              placeholder="feature/my-change"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            {offerCheckout && (
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={checkout}
                  onChange={(event) => {
                    setCheckout(event.target.checked);
                  }}
                />
                Switch to it
              </label>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <div className={styles.actions}>
              <Button onClick={onCancel}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={!name.trim() || isPending}>
                {confirmLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
