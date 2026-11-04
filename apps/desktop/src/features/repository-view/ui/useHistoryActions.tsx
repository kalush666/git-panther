import { useState, type ReactNode } from 'react';

import { isIpcError, type ResetMode } from '../../../shared/ipc';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog/ConfirmDialog';
import { useBranches } from '../api/useBranches';
import {
  describeDone,
  useHistoryAction,
  usePendingUndo,
  useUndo,
  type HistoryRequest,
} from '../api/useHistory';
import { CombineBranchesDialog } from './CombineBranchesDialog';
import { InteractiveRebaseDialog } from './InteractiveRebaseDialog';
import { TagDialog } from './TagDialog';

type Dialog =
  | { kind: 'hardReset'; commit: string; label: string }
  | { kind: 'tag'; target: string; label: string }
  | { kind: 'combine'; source: string }
  | { kind: 'rebase'; base: string; label: string };

export interface HistoryActions {
  /** The checked-out branch, or `null` when HEAD is detached. */
  currentBranch: string | null;
  run: (request: HistoryRequest) => void;
  /** Resets, asking first for a hard reset that throws away changes. */
  reset: (commit: string, label: string, mode: ResetMode) => void;
  openCreateTag: (target: string, label: string) => void;
  /** Asks whether to merge `source` into the current branch or rebase onto it. */
  openCombine: (source: string) => void;
  /** Plans an interactive rebase of the commits after `base`. */
  openInteractiveRebase: (base: string, label: string) => void;
  /** What Undo would revert, e.g. "Merge topic". */
  undoLabel: string | null;
  undo: () => void;
  /** The last result to show under the header. */
  outcome: { tone: 'done' | 'error'; message: string } | null;
  dismiss: () => void;
  dialogs: ReactNode;
}

/** Graph actions, undo, and the dialogs that confirm or collect their input. */
export function useHistoryActions(path: string): HistoryActions {
  const action = useHistoryAction(path);
  const undoAction = useUndo(path);
  const pendingUndo = usePendingUndo(path);
  const branches = useBranches(path);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [outcome, setOutcome] = useState<HistoryActions['outcome']>(null);
  const currentBranch =
    branches.data?.find((branch) => branch.kind === 'local' && branch.isHead)?.name ?? null;

  const run = (request: HistoryRequest) => {
    setOutcome(null);
    action.mutate(request, {
      onSuccess: () => {
        setOutcome({ tone: 'done', message: describeDone(request) });
      },
      onError: (error) => {
        setOutcome({ tone: 'error', message: error.message });
      },
    });
  };

  const close = () => {
    setDialog(null);
  };

  const dialogs = (() => {
    switch (dialog?.kind) {
      case undefined:
        return null;
      case 'hardReset':
        return (
          <ConfirmDialog
            open
            title="Hard reset?"
            description={
              <>
                {currentBranch ?? 'HEAD'} moves to {dialog.label}, and{' '}
                <strong>all uncommitted changes are thrown away</strong>. Undo can bring the commits
                back, but not the uncommitted changes.
              </>
            }
            confirmLabel="Reset hard"
            onCancel={close}
            onConfirm={() => {
              run({ action: 'reset', commit: dialog.commit, label: dialog.label, mode: 'hard' });
              close();
            }}
          />
        );
      case 'tag':
        return (
          <TagDialog
            targetLabel={dialog.label}
            error={
              action.isError && action.variables.action === 'createTag'
                ? action.error.message
                : null
            }
            isPending={action.isPending}
            onCancel={() => {
              action.reset();
              close();
            }}
            onSubmit={(name, message) => {
              action.mutate(
                { action: 'createTag', name, target: dialog.target, message },
                {
                  onSuccess: () => {
                    setOutcome({ tone: 'done', message: `Created tag ${name}` });
                    close();
                  },
                },
              );
            }}
          />
        );
      case 'rebase':
        return (
          <InteractiveRebaseDialog
            path={path}
            base={dialog.base}
            baseLabel={dialog.label}
            error={
              action.isError && action.variables.action === 'rebaseInteractive'
                ? action.error.message
                : null
            }
            isPending={action.isPending}
            onCancel={() => {
              action.reset();
              close();
            }}
            onStart={(steps) => {
              const request: HistoryRequest = {
                action: 'rebaseInteractive',
                base: dialog.base,
                label: dialog.label,
                steps,
              };
              action.mutate(request, {
                onSuccess: () => {
                  setOutcome({ tone: 'done', message: describeDone(request) });
                  close();
                },
                onError: (error) => {
                  // A conflict leaves the rebase open; the conflict view takes over.
                  if (isIpcError(error, 'operationConflict')) {
                    setOutcome({ tone: 'error', message: error.message });
                    close();
                  }
                },
              });
            }}
          />
        );
      case 'combine':
        return (
          <CombineBranchesDialog
            source={dialog.source}
            target={currentBranch}
            onCancel={close}
            onChoose={(request) => {
              run(request);
              close();
            }}
          />
        );
    }
  })();

  return {
    currentBranch,
    run,
    reset: (commit, label, mode) => {
      if (mode === 'hard') setDialog({ kind: 'hardReset', commit, label });
      else run({ action: 'reset', commit, label, mode });
    },
    openCreateTag: (target, label) => {
      action.reset();
      setDialog({ kind: 'tag', target, label });
    },
    openCombine: (source) => {
      setDialog({ kind: 'combine', source });
    },
    openInteractiveRebase: (base, label) => {
      action.reset();
      setDialog({ kind: 'rebase', base, label });
    },
    undoLabel: pendingUndo.data ?? null,
    undo: () => {
      if (undoAction.isPending) return;
      setOutcome(null);
      undoAction.mutate(undefined, {
        onSuccess: (label) => {
          setOutcome({ tone: 'done', message: `Undid: ${label}` });
        },
        onError: (error) => {
          setOutcome({ tone: 'error', message: error.message });
        },
      });
    },
    outcome,
    dismiss: () => {
      setOutcome(null);
    },
    dialogs,
  };
}
