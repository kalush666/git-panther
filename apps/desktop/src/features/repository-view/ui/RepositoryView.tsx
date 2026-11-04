import * as ContextMenu from '@radix-ui/react-context-menu';
import { ChevronRight, GitBranch, TriangleAlert, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { GraphEntryDto } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { useRepository } from '../api/useRepository';
import { useWorkingTreeStatus, type DiffSource } from '../api/useWorkingTree';
import { describeHead } from '../model/describeHead';
import { BranchSidebar } from './BranchSidebar';
import { CommitDetailsPanel } from './CommitDetailsPanel';
import { CommitGraph } from './CommitGraph';
import { ConflictEditor } from './ConflictEditor';
import { DiffViewer } from './DiffViewer';
import { FileHistoryView, type FileView } from './FileHistoryView';
import { StagingPanel } from './StagingPanel';
import { StashActions } from './StashActions';
import { SyncToolbar } from './SyncToolbar';
import { WorkingCopyRow } from './WorkingCopyRow';
import menu from './menu.module.css';
import styles from './RepositoryView.module.css';
import { useBranchActions, type BranchActions } from './useBranchActions';
import { useHistoryActions, type HistoryActions } from './useHistoryActions';

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
  const [fileView, setFileView] = useState<FileView | null>(null);
  const [conflictFile, setConflictFile] = useState<string | null>(null);
  const branchActions = useBranchActions(path);
  const history = useHistoryActions(path);
  useUndoShortcut(history);
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
        <Button
          size="sm"
          variant="ghost"
          className={styles.undo}
          disabled={!history.undoLabel}
          title={history.undoLabel ? `Undo: ${history.undoLabel} (Ctrl+Z)` : 'Nothing to undo'}
          onClick={history.undo}
        >
          <Undo2 size={14} aria-hidden />
          Undo
        </Button>
        <StashActions path={path} />
        <SyncToolbar path={path} />
      </header>
      {history.outcome && (
        <div
          className={styles.outcome}
          data-tone={history.outcome.tone}
          role={history.outcome.tone === 'error' ? 'alert' : 'status'}
        >
          <span className={styles.outcomeText}>{history.outcome.message}</span>
          <button
            type="button"
            className={styles.dismiss}
            aria-label="Dismiss"
            onClick={history.dismiss}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
      <div className={styles.body}>
        <BranchSidebar path={path} actions={branchActions} history={history} />
        <div className={styles.graph}>
          {conflictFile ? (
            <ConflictEditor
              key={conflictFile}
              path={path}
              file={conflictFile}
              onClose={() => {
                setConflictFile(null);
              }}
            />
          ) : fileView ? (
            <FileHistoryView
              path={path}
              view={fileView}
              onSwitch={setFileView}
              onOpenCommit={(commitId, file) => {
                setFileView(null);
                setDiff({ kind: 'commit', file, commitId });
              }}
              onClose={() => {
                setFileView(null);
              }}
            />
          ) : diff ? (
            <DiffViewer
              path={path}
              source={diff}
              onClose={() => {
                setDiff(null);
              }}
              onShowHistory={(file) => {
                setFileView({ kind: 'history', file });
              }}
              onShowBlame={(file) => {
                setFileView({ kind: 'blame', file });
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
              rowMenu={(entry) => (
                <CommitMenu entry={entry} actions={branchActions} history={history} />
              )}
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
              setConflictFile(null);
              setDiff({ kind: 'workingTree', file, side });
            }}
            onResolveFile={setConflictFile}
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
      {history.dialogs}
    </section>
  );
}

/** Ctrl+Z (Cmd+Z on macOS) undoes the last action, except while typing. */
function useUndoShortcut({ undo, undoLabel }: HistoryActions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const typing =
        target !== null &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (typing || !undoLabel) return;
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [undo, undoLabel]);
}

const RESET_MODES = [
  { mode: 'soft', label: 'Soft: keep changes staged' },
  { mode: 'mixed', label: 'Mixed: keep changes unstaged' },
  { mode: 'hard', label: 'Hard: discard all changes…' },
] as const;

/** Right-click actions for a commit in the graph. */
function CommitMenu({
  entry,
  actions,
  history,
}: {
  entry: GraphEntryDto;
  actions: BranchActions;
  history: HistoryActions;
}) {
  const switchable = entry.refs.filter((ref) => ref.kind !== 'tag' && !ref.isHead);
  const tags = entry.refs.filter((ref) => ref.kind === 'tag');
  const current = history.currentBranch ?? 'HEAD';
  const commit = { commit: entry.id, label: entry.shortId };
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
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          history.openCreateTag(entry.id, `commit ${entry.shortId}`);
        }}
      >
        Create tag here…
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
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          history.run({ action: 'checkoutCommit', ...commit });
        }}
      >
        Check out this commit (detached)
      </ContextMenu.Item>
      <ContextMenu.Separator className={menu.separator} />
      {switchable.map((ref) => (
        <ContextMenu.Item
          key={`merge-${ref.name}`}
          className={menu.item}
          onSelect={() => {
            history.run({ action: 'merge', branch: ref.name });
          }}
        >
          Merge {ref.name} into {current}
        </ContextMenu.Item>
      ))}
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          history.run({ action: 'cherryPick', ...commit });
        }}
      >
        Cherry-pick commit
      </ContextMenu.Item>
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          history.openInteractiveRebase(entry.id, `commit ${entry.shortId}`);
        }}
      >
        Interactive rebase of later commits…
      </ContextMenu.Item>
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          history.run({ action: 'revert', ...commit });
        }}
      >
        Revert commit
      </ContextMenu.Item>
      <ContextMenu.Sub>
        <ContextMenu.SubTrigger className={menu.item}>
          Reset {current} to this commit
          <ChevronRight size={14} className={menu.subIcon} aria-hidden />
        </ContextMenu.SubTrigger>
        <ContextMenu.Portal>
          <ContextMenu.SubContent className={menu.content}>
            {RESET_MODES.map(({ mode, label }) => (
              <ContextMenu.Item
                key={mode}
                className={mode === 'hard' ? `${menu.item} ${menu.danger}` : menu.item}
                onSelect={() => {
                  history.reset(entry.id, entry.shortId, mode);
                }}
              >
                {label}
              </ContextMenu.Item>
            ))}
          </ContextMenu.SubContent>
        </ContextMenu.Portal>
      </ContextMenu.Sub>
      {tags.length > 0 && <ContextMenu.Separator className={menu.separator} />}
      {tags.map((tag) => (
        <ContextMenu.Group key={tag.name}>
          <ContextMenu.Item
            className={menu.item}
            onSelect={() => {
              history.run({ action: 'pushTag', name: tag.name });
            }}
          >
            Push tag {tag.name}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={`${menu.item} ${menu.danger}`}
            onSelect={() => {
              history.run({ action: 'deleteTag', name: tag.name });
            }}
          >
            Delete tag {tag.name}
          </ContextMenu.Item>
        </ContextMenu.Group>
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
