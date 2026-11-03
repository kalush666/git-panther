import { FolderGit2, X } from 'lucide-react';

import type { RecentRepositoryDto } from '../../../shared/ipc';
import { useRecentRepositories, useRemoveRecentRepository } from '../api/useRepositoryActions';
import styles from './RecentRepositories.module.css';

interface RecentRepositoriesProps {
  onSelect: (repository: RecentRepositoryDto) => void;
}

export function RecentRepositories({ onSelect }: RecentRepositoriesProps) {
  const recent = useRecentRepositories();
  const remove = useRemoveRecentRepository();

  if (!recent.data || recent.data.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-labelledby="recent-title">
      <h2 id="recent-title" className={styles.heading}>
        Recent
      </h2>
      <ul className={styles.list}>
        {recent.data.map((repository) => (
          <li key={repository.path} className={styles.item}>
            <button
              type="button"
              className={styles.open}
              title={repository.path}
              onClick={() => {
                onSelect(repository);
              }}
            >
              <FolderGit2 size={16} strokeWidth={1.75} aria-hidden />
              <span className={styles.name}>{repository.name}</span>
              <span className={styles.path}>{repository.path}</span>
            </button>
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove ${repository.name} from recent`}
              onClick={() => {
                remove.mutate(repository.path);
              }}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
