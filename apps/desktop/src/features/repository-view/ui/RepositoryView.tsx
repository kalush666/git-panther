import * as ContextMenu from '@radix-ui/react-context-menu';
import { ChevronRight, GitBranch, TriangleAlert, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';

import { useCommands } from '../../../shared/commands';
import type { GraphEntryDto } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { useBranches } from '../api/useBranches';
import { useHostingStatus, usePipelines } from '../api/useHosting';
import { useLfsStatus } from '../api/useLayout';
import { useRepository } from '../api/useRepository';
import { usePatches, type PatchActions } from '../api/usePatches';
import { useSync } from '../api/useSync';
import { useStageFiles, useWorkingTreeStatus, type DiffSource } from '../api/useWorkingTree';
import { describeHead } from '../model/describeHead';
import { usePanelWidths } from '../model/workspace';
import { BranchSidebar } from './BranchSidebar';
import { CommitDetailsPanel } from './CommitDetailsPanel';
import { CommitGraph } from './CommitGraph';
import { ConflictEditor } from './ConflictEditor';
import { DiffViewer } from './DiffViewer';
import { FileHistoryView, type FileView } from './FileHistoryView';
import { RebasePanel } from './RebasePanel';
import { RecoverView } from './RecoverView';
import { requestTarget, ReviewPanel, type ReviewTarget } from './ReviewPanel';
import { ResizeHandle } from './ResizeHandle';
import { StagingPanel } from './StagingPanel';
import { StashActions } from './StashActions';
import { SyncSignIn, SyncToolbar } from './SyncToolbar';
import { WorkingCopyRow } from './WorkingCopyRow';
import menu from './menu.module.css';
import styles from './RepositoryView.module.css';
import { useBranchActions, type BranchActions } from './useBranchActions';
import { FLOW_KINDS, flowKindOf, useGitflowActions } from './useGitflowActions';
import { useHistoryActions, type HistoryActions } from './useHistoryActions';
import { useHostingActions } from './useHostingActions';
import { useRemoteActions } from './useRemoteActions';

interface RepositoryViewProps {
  path: string;
  onClose: () => void;
  /** Opens another repository (a worktree or submodule) in a tab. */
  onOpenRepository: (path: string) => void;
}

/** What the right-hand panel shows. */
type Selection = { kind: 'workingCopy' } | { kind: 'commit'; index: number };

export function RepositoryView({ path, onClose, onOpenRepository }: RepositoryViewProps) {
  const repository = useRepository(path);
  const status = useWorkingTreeStatus(path);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffSource | null>(null);
  const [fileView, setFileView] = useState<FileView | null>(null);
  const [conflictFile, setConflictFile] = useState<string | null>(null);
  const history = useHistoryActions(path);
  const sync = useSync(path);
  const patches = usePatches(path, history.report);
  const [review, setReview] = useState<ReviewTarget | null>(null);
  const [recovering, setRecovering] = useState(false);
  const showReview = (target: ReviewTarget) => {
    setDiff(null);
    setFileView(null);
    setRecovering(false);
    setReview(target);
  };
  const gitflow = useGitflowActions(path, history.report);
  const branchActions = useBranchActions(
    path,
    history.report,
    (base, head) => {
      showReview({ base, head, request: null });
    },
    gitflow.openFinish,
  );
  const remoteActions = useRemoteActions(path, history.report, onOpenRepository);
  const hostingActions = useHostingActions(
    path,
    history.report,
    branchActions.checkout,
    (request) => {
      showReview(requestTarget(request));
    },
  );
  const hostingKind = useHostingStatus(path).data?.kind;
  const pipelines = usePipelines(path, hostingKind != null);
  const lfs = useLfsStatus(path);
  const branches = useBranches(path);
  const stage = useStageFiles(path);
  const headBranch = branches.data?.find((branch) => branch.kind === 'local' && branch.isHead);
  useCommands(`repository:${path}`, [
    {
      id: 'repository.undo',
      title: history.undoLabel ? `Undo: ${history.undoLabel}` : 'Undo',
      group: 'Repository',
      enabled: history.undoLabel !== null,
      run: history.undo,
    },
    {
      id: 'repository.newBranch',
      title: 'New branch here',
      group: 'Repository',
      enabled: headBranch !== undefined,
      run: () => {
        if (headBranch) branchActions.openCreate(headBranch.target, headBranch.name);
      },
    },
    ...FLOW_KINDS.map((kind) => ({
      id: `repository.gitflow.start.${kind}`,
      title: `Start ${kind}…`,
      group: 'Git flow',
      enabled: true,
      run: () => {
        gitflow.openStart(kind);
      },
    })),
    {
      id: 'repository.gitflow.finish',
      title: headBranch ? `Finish ${headBranch.name}` : 'Finish the flow branch',
      group: 'Git flow',
      enabled: headBranch !== undefined && flowKindOf(headBranch.name) !== null,
      run: () => {
        if (headBranch) gitflow.openFinish(headBranch.name);
      },
    },
    {
      id: 'repository.applyPatchFile',
      title: 'Apply patch from file…',
      group: 'Repository',
      enabled: true,
      run: patches.applyFile,
    },
    {
      id: 'repository.applyPatchClipboard',
      title: 'Apply patch from clipboard',
      group: 'Repository',
      enabled: true,
      run: patches.applyClipboard,
    },
    {
      id: 'repository.recover',
      title: 'Recover lost commits…',
      group: 'Repository',
      enabled: true,
      run: () => {
        setDiff(null);
        setFileView(null);
        setReview(null);
        setRecovering(true);
      },
    },
    {
      id: 'repository.compare',
      title: 'Compare branches…',
      group: 'Repository',
      enabled: true,
      run: () => {
        branchActions.openCompare(
          headBranch?.name === 'main' ? 'origin/main' : 'main',
          headBranch?.name ?? 'HEAD',
        );
      },
    },
    {
      id: 'repository.stageAll',
      title: 'Stage all changes',
      group: 'Repository',
      enabled: (status.data?.unstaged.length ?? 0) > 0,
      run: () => {
        stage.mutate(status.data?.unstaged.map((file) => file.path) ?? []);
      },
    },
    {
      id: 'repository.commit',
      title: 'Go to the commit message',
      group: 'Repository',
      run: () => {
        setSelection({ kind: 'workingCopy' });
        requestAnimationFrame(() => {
          document.getElementById('commit-summary')?.focus();
        });
      },
    },
    ...(branches.data ?? [])
      .filter((branch) => !branch.isHead)
      .map((branch) => ({
        id: `checkout:${branch.kind}:${branch.name}`,
        title: branch.name,
        group: branch.kind === 'local' ? 'Check out' : 'Check out remote',
        run: () => {
          branchActions.checkout(branch.name);
        },
      })),
  ]);
  const sidebarWidth = usePanelWidths((state) => state.sidebar);
  const detailsWidth = usePanelWidths((state) => state.details);
  // Escape steps back from a diff, history, blame, conflict or rebase view.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Escape in a text field belongs to that field; a checkbox has no use for it.
      const target = event.target;
      const typing =
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLInputElement && !['checkbox', 'radio'].includes(target.type));
      if (typing) return;
      if (history.rebaseTarget) history.closeInteractiveRebase();
      else if (conflictFile) setConflictFile(null);
      else if (fileView) setFileView(null);
      else if (diff) setDiff(null);
      else if (review) setReview(null);
      else if (recovering) setRecovering(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [history, conflictFile, fileView, diff, review, recovering]);
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
    <section
      className={styles.view}
      aria-labelledby="repository-title"
      style={
        {
          ...(sidebarWidth ? { '--gp-sidebar-width': `${String(sidebarWidth)}px` } : {}),
          ...(detailsWidth ? { '--gp-details-width': `${String(detailsWidth)}px` } : {}),
        } as CSSProperties
      }
    >
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
        <SyncToolbar path={path} sync={sync} offer={hostingActions.offer} />
      </header>
      {history.outcome && (
        <div
          className={styles.outcome}
          data-tone={history.outcome.tone}
          role={history.outcome.tone === 'error' ? 'alert' : 'status'}
        >
          <span className={styles.outcomeText}>{history.outcome.message}</span>
          {history.outcome.tone === 'done' && history.undoLabel && (
            <Button size="sm" variant="ghost" onClick={history.undo}>
              <Undo2 size={14} aria-hidden />
              Undo
            </Button>
          )}
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
      {lfs.data?.used && !lfs.data.installed && (
        <p className={styles.notice} role="status">
          This repository stores large files with Git LFS, but git-lfs is not installed, so those
          files show as small pointer files. Install Git LFS (it ships with Git for Windows) and
          restart Git Panther.
        </p>
      )}
      <SyncSignIn path={path} sync={sync} />
      {branchActions.prompt}
      {gitflow.prompt}
      {history.prompt}
      {remoteActions.prompt}
      {hostingActions.prompt}
      <div className={styles.body}>
        <BranchSidebar
          path={path}
          actions={branchActions}
          history={history}
          remoteActions={remoteActions}
          hostingActions={hostingActions}
          onOpenRepository={onOpenRepository}
        />
        <ResizeHandle
          panel="sidebar"
          label="Resize the branch list"
          direction={1}
          currentWidth={() => panelWidth('sidebar')}
        />
        <div className={styles.graph}>
          {history.rebaseTarget ? (
            <RebasePanel path={path} target={history.rebaseTarget} history={history} />
          ) : conflictFile ? (
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
          ) : recovering ? (
            <RecoverView
              path={path}
              onCreateBranch={(entry) => {
                branchActions.openCreate(entry.id, `commit ${entry.shortId}`);
              }}
              onCheckout={(entry) => {
                history.run({
                  action: 'checkoutCommit',
                  commit: entry.id,
                  label: entry.shortId,
                });
              }}
              onClose={() => {
                setRecovering(false);
              }}
            />
          ) : review ? (
            <ReviewPanel
              key={`${review.base}...${review.head}`}
              path={path}
              target={review}
              prefix={hostingKind === 'gitHub' ? '#' : '!'}
              report={history.report}
              onOpenDiff={setDiff}
              onCheckout={hostingActions.checkoutSource}
              onClose={() => {
                setReview(null);
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
              onCheckoutRef={branchActions.checkout}
              pipelines={pipelines.data}
              rowMenu={(entry) => (
                <CommitMenu
                  entry={entry}
                  actions={branchActions}
                  history={history}
                  patches={patches}
                />
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
        <ResizeHandle
          panel="details"
          label="Resize the side panel"
          direction={-1}
          currentWidth={() => panelWidth('details')}
        />
        {isWorkingCopy ? (
          <StagingPanel
            path={path}
            openFile={diff?.kind === 'workingTree' ? { file: diff.file, side: diff.side } : null}
            onOpenFile={(file, side) => {
              setConflictFile(null);
              setDiff({ kind: 'workingTree', file, side });
            }}
            onResolveFile={setConflictFile}
            onShowHistory={(file) => {
              setFileView({ kind: 'history', file });
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
      {history.dropMenu}
    </section>
  );
}

/** The rendered width of a panel, to start a resize from. */
function panelWidth(panel: 'sidebar' | 'details'): number {
  return document.querySelector(`[data-panel="${panel}"]`)?.getBoundingClientRect().width ?? 0;
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
  patches,
}: {
  entry: GraphEntryDto;
  actions: BranchActions;
  history: HistoryActions;
  patches: PatchActions;
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
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          actions.compare(entry.id, current);
        }}
      >
        Compare {current} with this commit
      </ContextMenu.Item>
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          patches.copy(entry.id, `commit ${entry.shortId}`);
        }}
      >
        Copy as patch
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
      <ContextMenu.Separator className={menu.separator} />
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          history.openReword(entry.id, `commit ${entry.shortId}`, entry.summary);
        }}
      >
        Reword…
      </ContextMenu.Item>
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          history.squash(entry.id, `commit ${entry.shortId}`);
        }}
      >
        Squash into parent
      </ContextMenu.Item>
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          history.fixup(entry.id, `commit ${entry.shortId}`);
        }}
      >
        Fixup into parent (drop this message)
      </ContextMenu.Item>
      <ContextMenu.Item
        className={menu.item}
        onSelect={() => {
          history.openInteractiveRebase(entry.id, `commit ${entry.shortId}`);
        }}
      >
        Interactive rebase of later commits…
      </ContextMenu.Item>
      <ContextMenu.Separator className={menu.separator} />
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
