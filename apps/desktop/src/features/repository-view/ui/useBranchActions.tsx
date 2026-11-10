import { useState, type ReactNode } from 'react';

import { ipc, isIpcError } from '../../../shared/ipc';
import { InlinePrompt } from '../../../shared/ui/InlinePrompt/InlinePrompt';
import {
  useCheckoutBranch,
  useCreateBranch,
  useDeleteBranch,
  useRenameBranch,
  useSetUpstream,
} from '../api/useBranches';
import { usePinned, usePinnedBranches } from '../model/workspace';
import type { OutcomeAction } from './OutcomeBanner';
import styles from './useBranchActions.module.css';

type Prompt =
  | { kind: 'create'; start: string; startLabel: string }
  | { kind: 'rename'; from: string }
  | { kind: 'compare'; base: string; head: string }
  | { kind: 'upstream'; branch: string; upstream: string };

/** Reports a finished action in the banner under the header, with an optional next step. */
export type Report = (tone: 'done' | 'error', message: string, action?: OutcomeAction) => void;

export interface BranchActions {
  checkout: (name: string) => void;
  openCreate: (start: string, startLabel: string) => void;
  openRename: (name: string) => void;
  /** Deletes right away: Undo brings the branch back. */
  remove: (name: string) => void;
  /** Shows what `head` changes since it forked from `base`, in place of the graph. */
  compare: (base: string, head: string) => void;
  /** Asks which two branches, tags or commits to compare, prefilled. */
  openCompare: (base: string, head: string) => void;
  /** Asks to finish a git flow branch (feature/, release/, hotfix/). */
  finishFlow: (branch: string) => void;
  /** Branches pinned to the top of the list. */
  pinned: string[];
  togglePin: (branch: string) => void;
  /** Asks which remote branch `branch` should track, prefilled. */
  openSetUpstream: (branch: string, upstream: string) => void;
  /** Stops `branch` tracking a remote branch. */
  unsetUpstream: (branch: string) => void;
  /** What is running now, for the banner, e.g. "Switching to develop…". */
  running: string | null;
  /** The name bar, when one is open. */
  prompt: ReactNode;
}

/** Branch commands, asking for names in a bar under the header. */
export function useBranchActions(
  path: string,
  report: Report,
  compare: (base: string, head: string) => void,
  finishFlow: (branch: string) => void,
): BranchActions {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [switchTo, setSwitchTo] = useState(true);
  const create = useCreateBranch(path);
  const checkout = useCheckoutBranch(path);
  const upstream = useSetUpstream(path);
  const pinned = usePinned(path);
  const togglePin = usePinnedBranches((state) => state.toggle);
  const rename = useRenameBranch(path);
  const remove = useDeleteBranch(path);

  /** Switches branch; when uncommitted changes are in the way, offers to stash them first. */
  const checkoutBranch = (name: string) => {
    checkout.mutate(name, {
      onSuccess: () => {
        report('done', `Switched to ${name}`);
      },
      onError: (error) => {
        report(
          'error',
          error.message,
          isIpcError(error, 'checkoutConflict')
            ? {
                label: 'Stash changes and switch',
                run: () => {
                  void stashThenSwitch(name);
                },
              }
            : undefined,
        );
      },
    });
  };

  const stashThenSwitch = async (name: string) => {
    const stashed = await ipc.saveStash(path, `Before switching to ${name}`, true);
    if (stashed.status === 'error') {
      report('error', stashed.error.message);
      return;
    }
    checkout.mutate(name, {
      onSuccess: () => {
        report('done', `Stashed your changes and switched to ${name}`);
      },
      onError: (error) => {
        report('error', error.message);
      },
    });
  };

  const close = () => {
    setPrompt(null);
    create.reset();
    rename.reset();
  };

  const bar = (() => {
    switch (prompt?.kind) {
      case undefined:
        return null;
      case 'upstream':
        return (
          <InlinePrompt
            key={`upstream:${prompt.branch}`}
            title={`Track a remote branch with ${prompt.branch}`}
            fields={[{ label: 'Upstream', initial: prompt.upstream, placeholder: 'origin/main' }]}
            submitLabel="Set upstream"
            error={upstream.error?.message ?? null}
            isPending={upstream.isPending}
            onCancel={close}
            onSubmit={([value = '']) => {
              upstream.mutate(
                { branch: prompt.branch, upstream: value },
                {
                  onSuccess: () => {
                    report('done', `${prompt.branch} now tracks ${value}`);
                    close();
                  },
                },
              );
            }}
          />
        );
      case 'compare':
        return (
          <InlinePrompt
            key="compare"
            title="Compare"
            fields={[
              { label: 'Base', initial: prompt.base, placeholder: 'main' },
              { label: 'Compare', initial: prompt.head, placeholder: 'feature/my-change' },
            ]}
            submitLabel="Compare"
            error={null}
            isPending={false}
            onCancel={close}
            onSubmit={([base = '', head = '']) => {
              close();
              compare(base, head);
            }}
          />
        );
      case 'create':
        return (
          <InlinePrompt
            key={`create:${prompt.start}`}
            title={`New branch at ${prompt.startLabel}`}
            fields={[{ label: 'Branch name', initial: '', placeholder: 'feature/my-change' }]}
            submitLabel="Create branch"
            extra={
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={switchTo}
                  onChange={(event) => {
                    setSwitchTo(event.target.checked);
                  }}
                />
                Switch to it
              </label>
            }
            error={create.error?.message ?? null}
            isPending={create.isPending}
            onCancel={close}
            onSubmit={([name = '']) => {
              create.mutate(
                { name, start: prompt.start, checkout: switchTo },
                {
                  onSuccess: () => {
                    report('done', `Created branch ${name}`);
                    close();
                  },
                },
              );
            }}
          />
        );
      case 'rename':
        return (
          <InlinePrompt
            key={`rename:${prompt.from}`}
            title={`Rename ${prompt.from} to`}
            fields={[{ label: 'Branch name', initial: prompt.from }]}
            submitLabel="Rename"
            error={rename.error?.message ?? null}
            isPending={rename.isPending}
            onCancel={close}
            onSubmit={([to = '']) => {
              rename.mutate(
                { from: prompt.from, to },
                {
                  onSuccess: () => {
                    report('done', `Renamed ${prompt.from} to ${to}`);
                    close();
                  },
                },
              );
            }}
          />
        );
    }
  })();

  return {
    checkout: checkoutBranch,
    openCreate: (start, startLabel) => {
      create.reset();
      setPrompt({ kind: 'create', start, startLabel });
    },
    compare,
    finishFlow,
    pinned,
    togglePin: (branch) => {
      togglePin(path, branch);
    },
    openSetUpstream: (branch, current) => {
      upstream.reset();
      setPrompt({ kind: 'upstream', branch, upstream: current });
    },
    unsetUpstream: (branch) => {
      upstream.mutate(
        { branch, upstream: null },
        {
          onSuccess: () => {
            report('done', `${branch} no longer tracks a remote branch`);
          },
          onError: (error) => {
            report('error', error.message);
          },
        },
      );
    },
    openCompare: (base, head) => {
      setPrompt({ kind: 'compare', base, head });
    },
    openRename: (from) => {
      rename.reset();
      setPrompt({ kind: 'rename', from });
    },
    remove: (name) => {
      remove.mutate(
        { name, force: true },
        {
          onSuccess: () => {
            report('done', `Deleted branch ${name}`);
          },
          onError: (error) => {
            report('error', error.message);
          },
        },
      );
    },
    running: checkout.isPending ? `Switching to ${checkout.variables}…` : null,
    prompt: bar,
  };
}
