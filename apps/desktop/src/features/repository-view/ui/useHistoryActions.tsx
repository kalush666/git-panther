import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect, useState, type ReactNode } from 'react';

import { ipc, unwrap, type RebaseAction, type ResetMode } from '../../../shared/ipc';
import { InlinePrompt } from '../../../shared/ui/InlinePrompt/InlinePrompt';
import { useBranches } from '../api/useBranches';
import {
  describeDone,
  describeRunning,
  useHistoryAction,
  usePendingUndo,
  useUndo,
  type HistoryRequest,
} from '../api/useHistory';
import menu from './menu.module.css';
import type { Outcome } from './OutcomeBanner';
import type { Report } from './useBranchActions';

/** How long a success message stays; errors stay until dismissed. */
const OUTCOME_MS = 8_000;

type Prompt =
  | { kind: 'hardReset'; commit: string; label: string }
  | { kind: 'tag'; target: string; label: string }
  | { kind: 'reword'; commit: string; label: string; summary: string };

/** One commit rewritten in place: its message changed, or melded into its parent. */
type Rewrite = { kind: 'squash' } | { kind: 'fixup' } | { kind: 'reword'; summary: string };

/** A branch dropped on the checked-out one, and where the pointer was. */
interface Drop {
  source: string;
  target: string;
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
  /**
   * Offers merge and rebase for `source` dropped on `target`, in a menu at
   * the drop point; checks out first when the action needs another branch.
   */
  openCombine: (source: string, target: string, x: number, y: number) => void;
  /** The commit whose later commits the rebase panel is planning, if open. */
  rebaseTarget: RebaseTarget | null;
  openInteractiveRebase: (base: string, label: string) => void;
  closeInteractiveRebase: () => void;
  /** Asks for a new summary line in the bar, keeping the rest of the message. */
  openReword: (commit: string, label: string, summary: string) => void;
  /** Melds a commit into its parent, joining the messages. */
  squash: (commit: string, label: string) => void;
  /** Melds a commit into its parent, keeping only the parent's message. */
  fixup: (commit: string, label: string) => void;
  /** Whether a graph action is running. */
  isRunning: boolean;
  /** What Undo would revert, e.g. "Merge topic". */
  undoLabel: string | null;
  undo: () => void;
  report: Report;
  /** The last result to show under the header. */
  outcome: Outcome | null;
  /** What is running now, for the banner, e.g. "Rebasing onto develop…". */
  running: string | null;
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

  const report: Report = (tone, message, next) => {
    setOutcome({ tone, message, action: next });
  };

  /**
   * Rewrites one commit with an interactive rebase planned here: every
   * commit after the base is kept as it is, except `commit`.
   */
  const rewrite = async (commit: string, label: string, change: Rewrite) => {
    try {
      const details = unwrap(await ipc.commitDetails(path, commit));
      if (details.parents.length > 1) {
        throw new Error(`${label} is a merge commit; use Interactive rebase instead.`);
      }
      const parent = details.parents[0];
      if (parent === undefined) {
        throw new Error(`${label} is the first commit; it has no parent to change it on.`);
      }
      // A reword replays from the parent; a squash also rewrites the parent.
      const base =
        change.kind === 'reword'
          ? parent
          : unwrap(await ipc.commitDetails(path, parent)).parents[0];
      if (base === undefined) {
        throw new Error(`${label} sits on the first commit, which cannot be squashed into.`);
      }
      const plan = unwrap(await ipc.rebasePlan(path, base));
      if (!plan.some((step) => step.id === commit)) {
        throw new Error(`${label} is not on ${current}, so it cannot be changed here.`);
      }
      const action: RebaseAction =
        change.kind === 'reword'
          ? { kind: 'reword', message: replaceSummary(details.message, change.summary) }
          : { kind: change.kind };
      run({
        action: 'rebaseInteractive',
        base,
        label,
        steps: plan.map((step) => ({
          commit: step.id,
          action: step.id === commit ? action : { kind: 'pick' },
        })),
        done:
          change.kind === 'reword'
            ? `Reworded ${label}`
            : `${change.kind === 'squash' ? 'Squashed' : 'Fixed up'} ${label} into its parent`,
      });
    } catch (error) {
      report('error', error instanceof Error ? error.message : String(error));
    }
  };
  useEffect(() => {
    // A result with a next step waits for it; errors wait to be read.
    if (outcome?.tone !== 'done' || outcome.action) return;
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
      case 'reword':
        return (
          <InlinePrompt
            key={`reword:${prompt.commit}`}
            title={`Reword ${prompt.label}`}
            fields={[{ label: 'Summary', initial: prompt.summary }]}
            submitLabel="Reword"
            error={null}
            isPending={action.isPending}
            onCancel={() => {
              setPrompt(null);
            }}
            onSubmit={([summary = '']) => {
              setPrompt(null);
              void rewrite(prompt.commit, prompt.label, { kind: 'reword', summary });
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

  /**
   * Checks out `branch` first when it is not the current one, then runs
   * `request`; uncommitted changes in the way can be stashed with one click.
   */
  const runOn = async (branch: string, request: HistoryRequest, stashFirst = false) => {
    if (branch !== currentBranch) {
      if (stashFirst) {
        const stashed = await ipc.saveStash(path, `Before switching to ${branch}`, true);
        if (stashed.status === 'error') {
          report('error', stashed.error.message);
          return;
        }
      }
      const switched = await ipc.checkoutBranch(path, branch);
      if (switched.status === 'error') {
        report(
          'error',
          switched.error.message,
          switched.error.kind === 'checkoutConflict'
            ? {
                label: 'Stash changes and continue',
                run: () => {
                  void runOn(branch, request, true);
                },
              }
            : undefined,
        );
        return;
      }
    }
    run(request);
  };

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
          {dropChoices(drop, branches.data ?? []).map((choice) => (
            <DropdownMenu.Item
              key={choice.label}
              className={menu.item}
              onSelect={() => {
                if (choice.kind === 'interactive') {
                  openInteractive(choice.base, choice.on);
                } else {
                  void runOn(choice.on, choice.request);
                }
              }}
            >
              {choice.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  /** Interactive rebase of `branch` onto `onto`, once `branch` is checked out. */
  const openInteractive = (onto: string, branch: string) => {
    void (async () => {
      if (branch !== currentBranch) {
        const switched = await ipc.checkoutBranch(path, branch);
        if (switched.status === 'error') {
          report('error', switched.error.message);
          return;
        }
      }
      const base = (branches.data ?? []).find((candidate) => candidate.name === onto)?.target;
      if (!base) return;
      action.reset();
      setRebaseTarget({ base, label: onto });
    })();
  };

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
    openCombine: (source, target, x, y) => {
      setDrop({ source, target, x, y });
    },
    rebaseTarget,
    openInteractiveRebase: (base, label) => {
      action.reset();
      setRebaseTarget({ base, label });
    },
    openReword: (commit, label, summary) => {
      setPrompt({ kind: 'reword', commit, label, summary });
    },
    squash: (commit, label) => {
      void rewrite(commit, label, { kind: 'squash' });
    },
    fixup: (commit, label) => {
      void rewrite(commit, label, { kind: 'fixup' });
    },
    closeInteractiveRebase: () => {
      setRebaseTarget(null);
    },
    isRunning: action.isPending,
    running: action.isPending ? describeRunning(action.variables) : null,
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

/** `message` with its first line replaced by `summary`; the body stays. */
function replaceSummary(message: string, summary: string): string {
  const newline = message.indexOf('\n');
  return newline === -1 ? summary : `${summary}${message.slice(newline)}`;
}

type DropChoice =
  | { kind: 'run'; label: string; on: string; request: HistoryRequest }
  | { kind: 'interactive'; label: string; on: string; base: string };

/**
 * What dropping `source` on `target` can do, the target's view first: merge
 * the dragged branch into the one it landed on, or replay one onto the other.
 * Remote branches can be merged or rebased onto, never changed themselves.
 */
export function dropChoices(
  { source, target }: { source: string; target: string },
  branches: readonly { name: string; kind: string }[],
): DropChoice[] {
  const isLocal = (name: string) =>
    branches.some((branch) => branch.name === name && branch.kind === 'local');
  const choices: DropChoice[] = [];
  if (isLocal(target)) {
    choices.push({
      kind: 'run',
      label: `Merge ${source} into ${target}`,
      on: target,
      request: { action: 'merge', branch: source },
    });
    choices.push({
      kind: 'run',
      label: `Rebase ${target} onto ${source}`,
      on: target,
      request: { action: 'rebase', onto: source },
    });
  }
  if (isLocal(source)) {
    choices.push({
      kind: 'run',
      label: `Rebase ${source} onto ${target}`,
      on: source,
      request: { action: 'rebase', onto: target },
    });
    choices.push({
      kind: 'interactive',
      label: `Interactive rebase ${source} onto ${target}…`,
      on: source,
      base: target,
    });
  }
  return choices;
}
