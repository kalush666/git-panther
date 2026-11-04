import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';

import { ipc, unwrap, type CommitSummary, type RebaseStep } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { repositoryQueryKey } from '../api/useRepository';
import styles from './InteractiveRebaseDialog.module.css';

type Kind = RebaseStep['action']['kind'];

const ACTIONS: ReadonlyArray<{ kind: Kind; label: string }> = [
  { kind: 'pick', label: 'Pick' },
  { kind: 'reword', label: 'Reword' },
  { kind: 'squash', label: 'Squash into previous' },
  { kind: 'fixup', label: 'Fixup into previous' },
  { kind: 'drop', label: 'Drop' },
];

interface Row {
  commit: CommitSummary;
  kind: Kind;
  message: string;
}

interface InteractiveRebaseDialogProps {
  path: string;
  /** The commit the rewritten ones are replayed on. */
  base: string;
  baseLabel: string;
  error: string | null;
  isPending: boolean;
  onStart: (steps: RebaseStep[]) => void;
  onCancel: () => void;
}

function toStep({ commit, kind, message }: Row): RebaseStep {
  return {
    commit: commit.id,
    action: kind === 'reword' ? { kind, message } : { kind },
  };
}

/** Reorders, rewords, squashes and drops the commits after `base`. */
export function InteractiveRebaseDialog({
  path,
  base,
  baseLabel,
  error,
  isPending,
  onStart,
  onCancel,
}: InteractiveRebaseDialogProps) {
  const plan = useQuery({
    queryKey: [...repositoryQueryKey(path), 'rebasePlan', base],
    queryFn: async () => unwrap(await ipc.rebasePlan(path, base)),
  });
  // Edits start from the loaded plan; until then there is nothing to edit.
  const [edited, setEdited] = useState<Row[] | null>(null);
  const rows: Row[] =
    edited ??
    (plan.data ?? []).map((commit) => ({ commit, kind: 'pick', message: commit.summary }));

  const update = (index: number, change: Partial<Row>) => {
    setEdited(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));
  };
  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [row] = next.splice(index, 1);
    if (row) next.splice(target, 0, row);
    setEdited(next);
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>Interactive rebase</Dialog.Title>
          <Dialog.Description className={styles.description}>
            Rewrites the commits after {baseLabel}, oldest at the top. Reorder them, edit messages,
            meld them into the commit above, or drop them. Merge commits are flattened.
          </Dialog.Description>
          {plan.isError && (
            <p className={styles.error} role="alert">
              {plan.error.message}
            </p>
          )}
          {plan.data?.length === 0 && (
            <p className={styles.empty}>There are no commits after {baseLabel} to rewrite.</p>
          )}
          <ol className={styles.steps} aria-label="Rebase steps">
            {rows.map((row, index) => (
              <li key={row.commit.id} className={styles.step} data-kind={row.kind}>
                <div className={styles.stepRow}>
                  <select
                    className={styles.action}
                    aria-label={`Action for ${row.commit.shortId}`}
                    value={row.kind}
                    onChange={(event) => {
                      update(index, { kind: event.target.value as Kind });
                    }}
                  >
                    {ACTIONS.map(({ kind, label }) => (
                      <option key={kind} value={kind}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span className={styles.sha}>{row.commit.shortId}</span>
                  <span className={styles.summary}>{row.commit.summary}</span>
                  <button
                    type="button"
                    className={styles.move}
                    aria-label={`Move ${row.commit.shortId} up`}
                    disabled={index === 0}
                    onClick={() => {
                      move(index, -1);
                    }}
                  >
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={styles.move}
                    aria-label={`Move ${row.commit.shortId} down`}
                    disabled={index === rows.length - 1}
                    onClick={() => {
                      move(index, 1);
                    }}
                  >
                    <ArrowDown size={14} aria-hidden />
                  </button>
                </div>
                {row.kind === 'reword' && (
                  <textarea
                    className={styles.message}
                    aria-label={`New message for ${row.commit.shortId}`}
                    rows={3}
                    value={row.message}
                    onChange={(event) => {
                      update(index, { message: event.target.value });
                    }}
                  />
                )}
              </li>
            ))}
          </ol>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <Button disabled={isPending} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={rows.length === 0 || isPending}
              onClick={() => {
                onStart(rows.map(toStep));
              }}
            >
              {isPending ? 'Rebasing…' : 'Start rebase'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
