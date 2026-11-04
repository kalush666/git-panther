import * as Dialog from '@radix-ui/react-dialog';
import { useId, useState } from 'react';

import { Button } from '../ui/Button/Button';
import dialog from '../ui/Dialog/Dialog.module.css';
import styles from './SignInDialog.module.css';
import { useSignIn } from './useAccounts';

interface SignInDialogProps {
  /** Prefills the server, e.g. from the remote that refused the credentials. */
  initialServer?: string;
  /** Tries the credentials against this repository's remote before keeping them. */
  repository?: string;
  onSignedIn: () => void;
  onCancel: () => void;
}

/** Asks for a server, personal number and password, and hands them to git. */
export function SignInDialog({
  initialServer = '',
  repository,
  onSignedIn,
  onCancel,
}: SignInDialogProps) {
  const id = useId();
  const signIn = useSignIn();
  const [server, setServer] = useState(initialServer);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const canSubmit = server.trim() !== '' && username.trim() !== '' && password !== '';

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !signIn.isPending) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={dialog.overlay} />
        <Dialog.Content className={dialog.content}>
          <Dialog.Title className={dialog.title}>Sign in to your git server</Dialog.Title>
          <Dialog.Description className={dialog.description}>
            Your password goes to your git credential manager (Windows Credential Manager), not to
            Git Panther. Git then uses it for every HTTPS operation on this server.
          </Dialog.Description>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit || signIn.isPending) return;
              signIn.mutate(
                { server, username, password, repository: repository ?? null },
                { onSuccess: onSignedIn },
              );
            }}
          >
            <label className={styles.label} htmlFor={`${id}-server`}>
              Server
            </label>
            <input
              id={`${id}-server`}
              className={styles.input}
              value={server}
              placeholder="gitlab.example.internal"
              spellCheck={false}
              autoFocus={initialServer === ''}
              onChange={(event) => {
                setServer(event.target.value);
              }}
            />
            <label className={styles.label} htmlFor={`${id}-username`}>
              Personal number or user name
            </label>
            <input
              id={`${id}-username`}
              className={styles.input}
              value={username}
              placeholder="p1234567"
              autoComplete="username"
              spellCheck={false}
              autoFocus={initialServer !== ''}
              onChange={(event) => {
                setUsername(event.target.value);
              }}
            />
            <label className={styles.label} htmlFor={`${id}-password`}>
              Password
            </label>
            <input
              id={`${id}-password`}
              className={styles.input}
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
            {signIn.error && (
              <p className={styles.error} role="alert">
                {signIn.error.message}
              </p>
            )}
            <div className={dialog.actions}>
              <Button disabled={signIn.isPending} onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!canSubmit || signIn.isPending}>
                {signIn.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
