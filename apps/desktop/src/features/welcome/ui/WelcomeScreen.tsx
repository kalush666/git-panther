import { Download, FolderOpen, FolderPlus, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import { ipc } from '../../../shared/ipc';
import {
  useInitRepository,
  useOpenRepository,
  type OnRepositoryOpened,
} from '../api/useRepositoryActions';
import { CloneDialog } from './CloneDialog';
import { RecentRepositories } from './RecentRepositories';
import styles from './WelcomeScreen.module.css';

interface StartActionProps {
  label: string;
  description: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}

function StartAction({ label, description, icon: Icon, disabled, onClick }: StartActionProps) {
  return (
    <li>
      <button type="button" className={styles.action} disabled={disabled} onClick={onClick}>
        <Icon size={20} strokeWidth={1.75} aria-hidden />
        <span className={styles.actionLabel}>{label}</span>
        <span className={styles.actionDescription}>{description}</span>
      </button>
    </li>
  );
}

interface WelcomeScreenProps {
  onOpened: OnRepositoryOpened;
}

export function WelcomeScreen({ onOpened }: WelcomeScreenProps) {
  const openRepository = useOpenRepository(onOpened);
  const initRepository = useInitRepository(onOpened);
  const [isCloneOpen, setCloneOpen] = useState(false);
  const isBusy = openRepository.isPending || initRepository.isPending;
  const error = openRepository.error ?? initRepository.error;

  const pickAndRun = async (title: string, run: (path: string) => void) => {
    openRepository.reset();
    initRepository.reset();
    const folder = await ipc.pickFolder(title);
    if (folder) {
      run(folder);
    }
  };

  return (
    <section className={styles.screen} aria-labelledby="welcome-title">
      <h1 id="welcome-title" className={styles.title}>
        Welcome to Git Panther
      </h1>
      <p className={styles.subtitle}>Open a repository to get started.</p>
      <ul className={styles.actions}>
        <StartAction
          label="Open repository"
          description="Browse to a folder on disk"
          icon={FolderOpen}
          disabled={isBusy}
          onClick={() => {
            void pickAndRun('Open repository', openRepository.mutate);
          }}
        />
        <StartAction
          label="Clone"
          description="Copy a remote repository"
          icon={Download}
          disabled={isBusy}
          onClick={() => {
            setCloneOpen(true);
          }}
        />
        <StartAction
          label="Init"
          description="Start a new repository"
          icon={FolderPlus}
          disabled={isBusy}
          onClick={() => {
            void pickAndRun('Choose a folder for the new repository', initRepository.mutate);
          }}
        />
      </ul>
      {error && (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      )}
      <RecentRepositories
        onSelect={(repository) => {
          openRepository.reset();
          openRepository.mutate(repository.path);
        }}
      />
      <CloneDialog open={isCloneOpen} onOpenChange={setCloneOpen} onCloned={onOpened} />
    </section>
  );
}
