import { Download, FolderOpen, FolderPlus, type LucideIcon } from 'lucide-react';

import styles from './WelcomeScreen.module.css';

interface StartAction {
  label: string;
  description: string;
  icon: LucideIcon;
}

// Wired to real use cases in M1 (Repositories).
const START_ACTIONS: readonly StartAction[] = [
  { label: 'Open repository', description: 'Browse to a folder on disk', icon: FolderOpen },
  { label: 'Clone', description: 'Copy a remote repository', icon: Download },
  { label: 'Init', description: 'Start a new repository', icon: FolderPlus },
];

export function WelcomeScreen() {
  return (
    <section className={styles.screen} aria-labelledby="welcome-title">
      <h1 id="welcome-title" className={styles.title}>
        Welcome to Git Panther
      </h1>
      <p className={styles.subtitle}>Open a repository to get started.</p>
      <ul className={styles.actions}>
        {START_ACTIONS.map(({ label, description, icon: Icon }) => (
          <li key={label}>
            <button type="button" className={styles.action} disabled title="Coming in M1">
              <Icon size={20} strokeWidth={1.75} aria-hidden />
              <span className={styles.actionLabel}>{label}</span>
              <span className={styles.actionDescription}>{description}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
