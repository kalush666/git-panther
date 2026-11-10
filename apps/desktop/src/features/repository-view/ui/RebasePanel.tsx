import { useQuery } from '@tanstack/react-query';
import { GripVertical } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import { ipc, unwrap, type CommitSummary, type RebaseStep } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { repositoryQueryKey } from '../api/useRepository';
import styles from './RebasePanel.module.css';
import type { HistoryActions, RebaseTarget } from './useHistoryActions';

type Kind = RebaseStep['action']['kind'];

/** Each action with the key that picks it. */
const ACTIONS: ReadonlyArray<{ kind: Kind; key: string; label: string; hint: string }> = [
  { kind: 'pick', key: 'p', label: 'Pick', hint: 'Keep the commit' },
  { kind: 'reword', key: 'r', label: 'Reword', hint: 'Keep it with a new message' },
  {
    kind: 'squash',
    key: 's',
    label: 'Squash',
    hint: 'Meld into the commit above, joining messages',
  },
  {
    kind: 'fixup',
    key: 'f',
    label: 'Fixup',
    hint: 'Meld into the commit above, keeping its message',
  },
  { kind: 'drop', key: 'd', label: 'Drop', hint: 'Remove the commit' },
];

const ROW_DRAG_TYPE = 'application/x-git-panther-rebase-row';

interface Row {
  commit: CommitSummary;
  kind: Kind;
  message: string;
}

function toStep({ commit, kind, message }: Row): RebaseStep {
  return { commit: commit.id, action: kind === 'reword' ? { kind, message } : { kind } };
}

interface RebasePanelProps {
  path: string;
  target: RebaseTarget;
  history: HistoryActions;
}

/**
 * Plans an interactive rebase in place of the graph. Click an action letter
 * or press P / R / S / F / D on a row; drag rows or use Alt+↑ / Alt+↓ to
 * reorder.
 */
export function RebasePanel({ path, target, history }: RebasePanelProps) {
  const plan = useQuery({
    queryKey: [...repositoryQueryKey(path), 'rebasePlan', target.base],
    queryFn: async () => unwrap(await ipc.rebasePlan(path, target.base)),
  });
  const [edited, setEdited] = useState<Row[] | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const planned = (): Row[] =>
    (plan.data ?? []).map((commit) => ({ commit, kind: 'pick', message: commit.summary }));
  const rows: Row[] = edited ?? planned();
  const changed = rows.some(
    (row, index) => row.kind !== 'pick' || row.commit.id !== plan.data?.[index]?.id,
  );
  /** The commit whose row should have focus once a move is on screen. */
  const focusAfterMove = useRef<string | null>(null);
  // Runs in the same commit as the move, before any later key or click, so
  // it can never pull focus back from a row the user went to meanwhile.
  useLayoutEffect(() => {
    const commit = focusAfterMove.current;
    if (commit === null) return;
    focusAfterMove.current = null;
    const index = rows.findIndex((row) => row.commit.id === commit);
    if (index >= 0) document.getElementById(rowId(index))?.focus();
  });

  // Each change builds on the latest rows, so quick changes in a row never undo each other.
  const update = (index: number, change: Partial<Row>) => {
    setEdited((current) =>
      (current ?? planned()).map((row, at) => (at === index ? { ...row, ...change } : row)),
    );
  };
  const move = (from: number, to: number) => {
    setEdited((current) => {
      const next = [...(current ?? planned())];
      if (to < 0 || to >= next.length || from === to) return current;
      const [row] = next.splice(from, 1);
      if (row) next.splice(to, 0, row);
      return next;
    });
  };

  const onRowKey = (event: KeyboardEvent<HTMLLIElement>, index: number) => {
    if (event.target !== event.currentTarget) return;
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const to = index + (event.key === 'ArrowUp' ? -1 : 1);
      // Keep focus on the moved row.
      focusAfterMove.current = rows[index]?.commit.id ?? null;
      move(index, to);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      document.getElementById(rowId(index + (event.key === 'ArrowUp' ? -1 : 1)))?.focus();
      return;
    }
    const chosen = ACTIONS.find(({ key }) => key === event.key.toLowerCase());
    if (chosen && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      update(index, { kind: chosen.kind });
    }
  };

  return (
    <section className={styles.panel} aria-label="Interactive rebase">
      <header className={styles.header}>
        <div className={styles.titles}>
          <h2 className={styles.title}>Interactive rebase after {target.label}</h2>
          <p className={styles.hint}>
            Oldest at the top. Click a letter or press P R S F D · drag or Alt+↑↓ to reorder ·
            Squash and Fixup meld into the row above.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={history.closeInteractiveRebase}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={rows.length === 0 || history.isRunning}
          title={changed ? undefined : 'Nothing changed yet'}
          onClick={() => {
            history.run({
              action: 'rebaseInteractive',
              base: target.base,
              label: target.label,
              steps: rows.map(toStep),
            });
          }}
        >
          {history.isRunning ? 'Rebasing…' : 'Start rebase'}
        </Button>
      </header>
      {plan.isError && (
        <p className={styles.notice} role="alert">
          {plan.error.message}
        </p>
      )}
      {plan.data?.length === 0 && (
        <p className={styles.notice}>There are no commits after {target.label} to rewrite.</p>
      )}
      <ol className={styles.rows} aria-label="Rebase steps">
        {rows.map((row, index) => (
          <li
            key={row.commit.id}
            id={rowId(index)}
            className={styles.row}
            data-kind={row.kind}
            data-dragging={dragging === index}
            tabIndex={0}
            aria-label={`${row.kind} ${row.commit.shortId} ${row.commit.summary}`}
            draggable
            onKeyDown={(event) => {
              onRowKey(event, index);
            }}
            onDragStart={(event) => {
              event.dataTransfer.setData(ROW_DRAG_TYPE, String(index));
              event.dataTransfer.effectAllowed = 'move';
              setDragging(index);
            }}
            onDragEnd={() => {
              setDragging(null);
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(ROW_DRAG_TYPE)) event.preventDefault();
            }}
            onDrop={(event) => {
              const from = Number(event.dataTransfer.getData(ROW_DRAG_TYPE));
              if (Number.isInteger(from)) move(from, index);
              setDragging(null);
            }}
          >
            <GripVertical size={14} className={styles.grip} aria-hidden />
            <div
              className={styles.actions}
              role="radiogroup"
              aria-label={`Action for ${row.commit.shortId}`}
            >
              {ACTIONS.map(({ kind, key, label, hint }) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={row.kind === kind}
                  aria-label={label}
                  title={`${label} (${key.toUpperCase()}): ${hint}`}
                  className={styles.action}
                  data-kind={kind}
                  onClick={() => {
                    update(index, { kind });
                  }}
                >
                  {key.toUpperCase()}
                </button>
              ))}
            </div>
            <span className={styles.sha}>{row.commit.shortId}</span>
            {row.kind === 'reword' ? (
              <input
                className={styles.message}
                aria-label={`New message for ${row.commit.shortId}`}
                value={row.message}
                autoFocus
                onChange={(event) => {
                  update(index, { message: event.target.value });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === 'Escape') {
                    event.preventDefault();
                    document.getElementById(rowId(index))?.focus();
                  }
                }}
              />
            ) : (
              <span className={styles.summary}>{row.commit.summary}</span>
            )}
            <span className={styles.author}>{row.commit.author.name}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const rowId = (index: number) => `rebase-row-${index}`;
