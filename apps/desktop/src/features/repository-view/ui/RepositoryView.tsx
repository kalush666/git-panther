import { ChevronRight, GitBranch, TriangleAlert } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '../../../shared/ui/Button/Button';
import { useRepository } from '../api/useRepository';
import { describeHead } from '../model/describeHead';
import { CommitDetailsPanel } from './CommitDetailsPanel';
import { CommitGraph } from './CommitGraph';
import styles from './RepositoryView.module.css';

interface RepositoryViewProps {
  path: string;
  onClose: () => void;
}

export function RepositoryView({ path, onClose }: RepositoryViewProps) {
  const repository = useRepository(path);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const keepSelectedCommit = useCallback((commitId: string | null) => {
    setSelectedCommitId(commitId);
  }, []);

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
        <div className={styles.crumb}>
          <span className={styles.crumbLabel}>Repository</span>
          <h1 id="repository-title" className={styles.title} title={repository.data.path}>
            {name}
          </h1>
        </div>
        <ChevronRight className={styles.crumbSeparator} size={16} aria-hidden />
        <div className={styles.crumb}>
          <span className={styles.crumbLabel}>Branch</span>
          <p className={styles.head}>
            <GitBranch size={14} strokeWidth={1.75} aria-hidden />
            {describeHead(head)}
          </p>
        </div>
      </header>
      <div className={styles.body}>
        <div className={styles.graph}>
          <CommitGraph
            path={path}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            onSelectedCommitChange={keepSelectedCommit}
          />
        </div>
        <CommitDetailsPanel path={path} commitId={selectedCommitId} />
      </div>
    </section>
  );
}
