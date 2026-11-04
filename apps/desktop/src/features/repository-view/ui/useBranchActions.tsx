import { useState, type ReactNode } from 'react';

import { InlinePrompt } from '../../../shared/ui/InlinePrompt/InlinePrompt';
import {
  useCheckoutBranch,
  useCreateBranch,
  useDeleteBranch,
  useRenameBranch,
} from '../api/useBranches';
import styles from './useBranchActions.module.css';

type Prompt =
  | { kind: 'create'; start: string; startLabel: string }
  | { kind: 'rename'; from: string }
  | { kind: 'compare'; base: string; head: string };

/** Reports a finished action in the banner under the header. */
export type Report = (tone: 'done' | 'error', message: string) => void;

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
  /** The last checkout error, shown next to the branch list. */
  checkoutError: string | null;
  /** The name bar, when one is open. */
  prompt: ReactNode;
}

/** Branch commands, asking for names in a bar under the header. */
export function useBranchActions(
  path: string,
  report: Report,
  compare: (base: string, head: string) => void,
): BranchActions {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [switchTo, setSwitchTo] = useState(true);
  const create = useCreateBranch(path);
  const checkout = useCheckoutBranch(path);
  const rename = useRenameBranch(path);
  const remove = useDeleteBranch(path);

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
    checkout: (name) => {
      checkout.mutate(name);
    },
    openCreate: (start, startLabel) => {
      create.reset();
      setPrompt({ kind: 'create', start, startLabel });
    },
    compare,
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
    checkoutError: checkout.error?.message ?? null,
    prompt: bar,
  };
}
