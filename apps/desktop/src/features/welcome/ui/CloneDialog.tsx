import * as Dialog from '@radix-ui/react-dialog';
import { FolderOpen } from 'lucide-react';
import { useId, useState, type SyntheticEvent } from 'react';

import { serverOf, SignInDialog } from '../../../shared/accounts';
import { ipc, isIpcError } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { useClone } from '../api/useClone';
import type { OnRepositoryOpened } from '../api/useRepositoryActions';
import { joinPath, repositoryNameFromUrl } from '../model/clonePaths';
import styles from './CloneDialog.module.css';

interface CloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloned: OnRepositoryOpened;
}

export function CloneDialog({ open, onOpenChange, onCloned }: CloneDialogProps) {
  const ids = useId();
  const [url, setUrl] = useState('');
  const [parentFolder, setParentFolder] = useState('');
  const [customName, setCustomName] = useState<string | null>(null);
  const clone = useClone((repository) => {
    onOpenChange(false);
    onCloned(repository);
  });

  const folderName = customName ?? repositoryNameFromUrl(url);
  const canClone = url.trim() !== '' && parentFolder !== '' && folderName !== '';

  const browse = async () => {
    const folder = await ipc.pickFolder('Clone into folder');
    if (folder) {
      setParentFolder(folder);
    }
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canClone && !clone.isCloning) {
      clone.start({ url, destination: joinPath(parentFolder, folderName) });
    }
  };

  const changeOpen = (next: boolean) => {
    if (clone.isCloning) {
      return;
    }
    clone.reset();
    onOpenChange(next);
  };

  const wasCancelled = isIpcError(clone.error, 'cancelled');
  const needsSignIn = isIpcError(clone.error, 'authenticationFailed');
  const [signingIn, setSigningIn] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>Clone a repository</Dialog.Title>
          <Dialog.Description className={styles.description}>
            Git Panther uses your installed git, so your saved credentials and SSH keys apply.
          </Dialog.Description>

          <form className={styles.form} onSubmit={submit}>
            <label className={styles.label} htmlFor={`${ids}-url`}>
              Repository URL
            </label>
            <input
              id={`${ids}-url`}
              className={styles.input}
              value={url}
              placeholder="git@your-git-server:team/repo.git"
              autoFocus
              spellCheck={false}
              disabled={clone.isCloning}
              onChange={(event) => {
                setUrl(event.target.value);
              }}
            />

            <label className={styles.label} htmlFor={`${ids}-parent`}>
              Parent folder
            </label>
            <div className={styles.row}>
              <input
                id={`${ids}-parent`}
                className={styles.input}
                value={parentFolder}
                placeholder="Choose where to put the clone"
                readOnly
              />
              <Button
                disabled={clone.isCloning}
                onClick={() => {
                  void browse();
                }}
              >
                <FolderOpen size={14} strokeWidth={1.75} aria-hidden />
                Browse…
              </Button>
            </div>

            <label className={styles.label} htmlFor={`${ids}-name`}>
              Folder name
            </label>
            <input
              id={`${ids}-name`}
              className={styles.input}
              value={folderName}
              spellCheck={false}
              disabled={clone.isCloning}
              onChange={(event) => {
                setCustomName(event.target.value);
              }}
            />

            {clone.isCloning && <CloneProgressBar progress={clone.progress} />}
            {clone.error && (
              <p className={styles.error} role="alert">
                {wasCancelled ? 'Clone cancelled.' : clone.error.message}
              </p>
            )}
            {needsSignIn && (
              <Button
                onClick={() => {
                  setSigningIn(true);
                }}
              >
                Sign in…
              </Button>
            )}
            {signingIn && (
              <SignInDialog
                initialServer={serverOf(url) ?? ''}
                onCancel={() => {
                  setSigningIn(false);
                }}
                onSignedIn={() => {
                  setSigningIn(false);
                  clone.start({ url, destination: joinPath(parentFolder, folderName) });
                }}
              />
            )}

            <div className={styles.actions}>
              <Button
                onClick={() => {
                  if (clone.isCloning) {
                    clone.cancel();
                  } else {
                    changeOpen(false);
                  }
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!canClone || clone.isCloning}>
                {clone.isCloning ? 'Cloning…' : 'Clone'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CloneProgressBar({ progress }: { progress: ReturnType<typeof useClone>['progress'] }) {
  const percent = progress?.percent ?? null;
  return (
    <div className={styles.progress}>
      <div
        className={styles.track}
        role="progressbar"
        aria-label="Clone progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
      >
        <div
          className={styles.fill}
          data-indeterminate={percent === null}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      <span className={styles.phase}>
        {progress ? `${progress.phase}${percent === null ? '' : ` · ${percent}%`}` : 'Starting…'}
      </span>
    </div>
  );
}
