import { GitBranch, TriangleAlert } from 'lucide-react';

import { Button } from '../../../shared/ui/Button/Button';
import { useRepository } from '../api/useRepository';
import { describeHead } from '../model/describeHead';
import styles from './RepositoryView.module.css';

interface RepositoryViewProps {
  path: string;
  onClose: () => void;
}

export function RepositoryView({ path, onClose }: RepositoryViewProps) {
  const repository = useRepository(path);

  if (repository.isPending) {
    return null;
  }

  if (repository.isError) {
    return (
      <section className={styles.problem} role="alert">
        <TriangleAlert className={styles.warningIcon} size={28} strokeWidth={1.75} aria-hidden />
        <p className={styles.problemText}>{repository.error.message}</p>
        <div className={styles.problemActions}>
          <Button
            onClick={() => {
              void repository.refetch();
            }}
          >
            Retry
          </Button>
          <Button variant="primary" onClick={onClose}>
            Close tab
          </Button>
        </div>
      </section>
    );
  }

  const { name, head } = repository.data;
  return (
    <section className={styles.view} aria-labelledby="repository-title">
      <header className={styles.header}>
        <h1 id="repository-title" className={styles.title}>
          {name}
        </h1>
        <p className={styles.path}>{repository.data.path}</p>
        <p className={styles.head}>
          <GitBranch size={14} strokeWidth={1.75} aria-hidden />
          {describeHead(head)}
        </p>
      </header>
      <p className={styles.placeholder}>The commit graph arrives in the next milestone.</p>
    </section>
  );
}
