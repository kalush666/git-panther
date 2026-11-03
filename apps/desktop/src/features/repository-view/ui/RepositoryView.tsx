import { ChevronRight, GitBranch, TriangleAlert } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '../../../shared/ui/Button/Button';
import { useRepository } from '../api/useRepository';
import { useWorkingTreeStatus, type DiffSource } from '../api/useWorkingTree';
import { describeHead } from '../model/describeHead';
import { CommitDetailsPanel } from './CommitDetailsPanel';
import { CommitGraph } from './CommitGraph';
import { DiffViewer } from './DiffViewer';
import { StagingPanel } from './StagingPanel';
import { WorkingCopyRow } from './WorkingCopyRow';
import styles from './RepositoryView.module.css';

interface RepositoryViewProps {
  path: string;
  onClose: () => void;
}

/** What the right-hand panel shows. */
type Selection = { kind: 'workingCopy' } | { kind: 'commit'; index: number };

export function RepositoryView({ path, onClose }: RepositoryViewProps) {
  const repository = useRepository(path);
  const status = useWorkingTreeStatus(path);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffSource | null>(null);
  const keepSelectedCommit = useCallback((commitId: string | null) => {
    setSelectedCommitId(commitId);
  }, []);

  const changeCount = status.data
    ? status.data.staged.length + status.data.unstaged.length + status.data.conflicted.length
    : 0;

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
  // Until the user picks something, open on uncommitted work when there is some.
  const current: Selection | null = selection ?? (changeCount > 0 ? { kind: 'workingCopy' } : null);
  const isWorkingCopy = current?.kind === 'workingCopy';
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
          {diff ? (
            <DiffViewer
              path={path}
              source={diff}
              onClose={() => {
                setDiff(null);
              }}
            />
          ) : (
            <CommitGraph
              path={path}
              selectedIndex={current?.kind === 'commit' ? current.index : null}
              onSelectIndex={(index) => {
                setSelection({ kind: 'commit', index });
              }}
              onSelectedCommitChange={keepSelectedCommit}
              leadingRow={
                changeCount > 0 ? (
                  <WorkingCopyRow
                    changeCount={changeCount}
                    isSelected={isWorkingCopy}
                    onSelect={() => {
                      setSelection({ kind: 'workingCopy' });
                    }}
                  />
                ) : null
              }
            />
          )}
        </div>
        {isWorkingCopy ? (
          <StagingPanel
            path={path}
            openFile={diff?.kind === 'workingTree' ? { file: diff.file, side: diff.side } : null}
            onOpenFile={(file, side) => {
              setDiff({ kind: 'workingTree', file, side });
            }}
          />
        ) : (
          <CommitDetailsPanel
            path={path}
            commitId={current?.kind === 'commit' ? selectedCommitId : null}
            onOpenFile={(file) => {
              if (selectedCommitId) {
                setDiff({ kind: 'commit', file, commitId: selectedCommitId });
              }
            }}
          />
        )}
      </div>
    </section>
  );
}
