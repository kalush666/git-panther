import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect, useState, type ReactNode } from 'react';

import type { ResetMode } from '../../../shared/ipc';
import { InlinePrompt } from '../../../shared/ui/InlinePrompt/InlinePrompt';
import { useBranches } from '../api/useBranches';
import {
  describeDone,
  useHistoryAction,
  usePendingUndo,
  useUndo,
  type HistoryRequest,
} from '../api/useHistory';
import menu from './menu.module.css';
import type { Report } from './useBranchActions';

/** How long a success message stays; errors stay until dismissed. */
const OUTCOME_MS = 8_000;

type Prompt =
  | { kind: 'hardReset'; commit: string; label: string }
  | { kind: 'tag'; target: string; label: string };

/** A branch dropped on the checked-out one, and where the pointer was. */
interface Drop {
  source: string;
  x: number;
  y: number;
}

export interface RebaseTarget {
  base: string;
  label: string;
}

export interface HistoryActions {
  /** The checked-out branch, or `null` when HEAD is detached. */
  currentBranch: string | null;
  run: (request: HistoryRequest) => void;
  /** Resets; a hard reset asks first, in the bar under the header. */
  reset: (commit: string, label: string, mode: ResetMode) => void;
  openCreateTag: (target: string, label: string) => void;
  /** Offers merge or rebase in a menu at the drop point. */
  openCombine: (source: string, x: number, y: number) => void;
  /** The commit whose later commits the rebase panel is planning, if open. */
  rebaseTarget: RebaseTarget | null;
  openInteractiveRebase: (base: string, label: string) => void;
  closeInteractiveRebase: () => void;
  /** Whether a graph action is running. */
  isRunning: boolean;
  /** What Undo would revert, e.g. "Merge topic". */
  undoLabel: string | null;
  undo: () => void;
  report: Report;
  /** The last result to show under the header. */
  outcome: { tone: 'done' | 'error'; message: string } | null;
  dismiss: () => void;
  /** The bar asking for a tag name or a confirmation, when open. */
  prompt: ReactNode;
  /** The menu shown after a drop, when open. */
  dropMenu: ReactNode;
}

/** Graph actions, undo and the bars and menus that collect their input. */
export function useHistoryActions(path: string): HistoryActions {
  const action = useHistoryAction(path);
  const undoAction = useUndo(path);
  const pendingUndo = usePendingUndo(path);
  const branches = useBranches(path);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [rebaseTarget, setRebaseTarget] = useState<RebaseTarget | null>(null);
  const [outcome, setOutcome] = useState<HistoryActions['outcome']>(null);
  const currentBranch =
    branches.data?.find((branch) => branch.kind === 'local' && branch.isHead)?.name ?? null;
  const current = currentBranch ?? 'HEAD';

  const report: Report = (tone, message) => {
    setOutcome({ tone, message });
  };
  useEffect(() => {
    if (outcome?.tone !== 'done') return;
    const timer = setTimeout(() => {
      setOutcome((current) => (current === outcome ? null : current));
    }, OUTCOME_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [outcome]);

  const run = (request: HistoryRequest) => {
    setOutcome(null);
    action.mutate(request, {
      onSuccess: () => {
        report('done', describeDone(request));
        if (request.action === 'rebaseInteractive') setRebaseTarget(null);
      },
      onError: (error) => {
        report('error', error.message);
      },
    });
  };

  const closePrompt = () => {
    setPrompt(null);
    action.reset();
  };

  const bar = (() => {
    switch (prompt?.kind) {
      case undefined:
        return null;
      case 'hardReset':
        return (
          <InlinePrompt
            key={`reset:${prompt.commit}`}
            title={`Reset ${current} to ${prompt.label} and throw away all uncommitted changes? Undo brings the commits back, not the changes.`}
            submitLabel="Reset hard"
            danger
            error={null}
            isPending={action.isPending}
            onCancel={closePrompt}
            onSubmit={() => {
              run({ action: 'reset', commit: prompt.commit, label: prompt.label, mode: 'hard' });
              setPrompt(null);
            }}
          />
        );
      case 'tag':
        return (
          <InlinePrompt
            key={`tag:${prompt.target}`}
            title={`New tag at ${prompt.label}`}
            fields={[{ label: 'Tag name', initial: '', placeholder: 'v1.2.0' }]}
            submitLabel="Create tag"
            error={
              action.isError && action.variables.action === 'createTag'
                ? action.error.message
                : null
            }
            isPending={action.isPending}
            onCancel={closePrompt}
            onSubmit={([name = '']) => {
              const request: HistoryRequest = {
                action: 'createTag',
                name,
                target: prompt.target,
                message: null,
              };
              action.mutate(request, {
                onSuccess: () => {
                  report('done', describeDone(request));
                  setPrompt(null);
                },
              });
            }}
          />
        );
    }
  })();

  const dropMenu = drop && (
    <DropdownMenu.Root
      open
      onOpenChange={(open) => {
        if (!open) setDrop(null);
      }}
    >
      <DropdownMenu.Trigger asChild>
        <span
          aria-hidden
          style={{ position: 'fixed', left: drop.x, top: drop.y, width: 0, height: 0 }}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menu.content} align="start" sideOffset={4}>
          <DropdownMenu.Item
            className={menu.item}
            onSelect={() => {
              run({ action: 'merge', branch: drop.source });
            }}
          >
            Merge {drop.source} into {current}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menu.item}
            onSelect={() => {
              run({ action: 'rebase', onto: drop.source });
            }}
          >
            Rebase {current} onto {drop.source}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  return {
    currentBranch,
    run,
    reset: (commit, label, mode) => {
      if (mode === 'hard') setPrompt({ kind: 'hardReset', commit, label });
      else run({ action: 'reset', commit, label, mode });
    },
    openCreateTag: (target, label) => {
      action.reset();
      setPrompt({ kind: 'tag', target, label });
    },
    openCombine: (source, x, y) => {
      setDrop({ source, x, y });
    },
    rebaseTarget,
    openInteractiveRebase: (base, label) => {
      action.reset();
      setRebaseTarget({ base, label });
    },
    closeInteractiveRebase: () => {
      setRebaseTarget(null);
    },
    isRunning: action.isPending,
    undoLabel: pendingUndo.data ?? null,
    undo: () => {
      if (undoAction.isPending) return;
      setOutcome(null);
      undoAction.mutate(undefined, {
        onSuccess: (label) => {
          report('done', `Undid: ${label}`);
        },
        onError: (error) => {
          report('error', error.message);
        },
      });
    },
    report,
    outcome,
    dismiss: () => {
      setOutcome(null);
    },
    prompt: bar,
    dropMenu,
  };
}
