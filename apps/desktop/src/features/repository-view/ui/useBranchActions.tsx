import { useState, type ReactNode } from 'react';

import { ipc, isIpcError } from '../../../shared/ipc';
import { InlinePrompt } from '../../../shared/ui/InlinePrompt/InlinePrompt';
import {
  useCheckoutBranch,
  useCreateBranch,
  useDeleteBranch,
  useRenameBranch,
} from '../api/useBranches';
import type { OutcomeAction } from './OutcomeBanner';
import styles from './useBranchActions.module.css';

type Prompt =
  | { kind: 'create'; start: string; startLabel: string }
  | { kind: 'rename'; from: string }
  | { kind: 'compare'; base: string; head: string };

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
