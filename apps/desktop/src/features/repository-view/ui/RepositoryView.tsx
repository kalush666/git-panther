import * as ContextMenu from '@radix-ui/react-context-menu';
import { ChevronRight, GitBranch, TriangleAlert } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { GraphEntryDto } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { useRepository } from '../api/useRepository';
import { useWorkingTreeStatus, type DiffSource } from '../api/useWorkingTree';
import { describeHead } from '../model/describeHead';
import { BranchSidebar } from './BranchSidebar';
import { CommitDetailsPanel } from './CommitDetailsPanel';
import { CommitGraph } from './CommitGraph';
import { DiffViewer } from './DiffViewer';
import { StagingPanel } from './StagingPanel';
import { StashActions } from './StashActions';
import { SyncToolbar } from './SyncToolbar';
import { WorkingCopyRow } from './WorkingCopyRow';
import menu from './menu.module.css';
import styles from './RepositoryView.module.css';
import { useBranchActions, type BranchActions } from './useBranchActions';

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
  const branchActions = useBranchActions(path);
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
        <StashActions path={path} />
        <SyncToolbar path={path} />
      </header>
      <div className={styles.body}>
        <BranchSidebar path={path} actions={branchActions} />
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
              rowMenu={(entry) => <CommitMenu entry={entry} actions={branchActions} />}
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
      {branchActions.dialogs}
    </section>
  );
}

/** Right-click actions for a commit in the graph. */
function CommitMenu({ entry, actions }: { entry: GraphEntryDto; actions: BranchActions }) {
  const switchable = entry.refs.filter((ref) => ref.kind !== 'tag' && !ref.isHead);
  return (
    <>
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          actions.openCreate(entry.id, `commit ${entry.shortId}`);
        }}
      >
        Create branch here…
      </ContextMenu.Item>
      {switchable.map((ref) => (
        <ContextMenu.Item
          key={ref.name}
          className={menu.item}
          onSelect={() => {
            actions.checkout(ref.name);
          }}
        >
          Check out {ref.name}
        </ContextMenu.Item>
      ))}
      <ContextMenu.Separator className={menu.separator} />
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          void navigator.clipboard.writeText(entry.id);
        }}
      >
        Copy commit SHA
      </ContextMenu.Item>
    </>
  );
}
