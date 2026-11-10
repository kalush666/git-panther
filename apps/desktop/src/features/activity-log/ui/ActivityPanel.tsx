import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, X } from 'lucide-react';
import { useState } from 'react';

import { ipc, unwrap, type GitActivity } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import styles from './ActivityPanel.module.css';

/** How often the open log refreshes. */
const REFRESH_MS = 2_000;

interface ActivityPanelProps {
  /** The repository in front, offered as a filter. */
  activePath: string | null;
  onClose: () => void;
}

/**
 * Every git command Git Panther ran, newest first: when, how long, whether it
 * worked, and what git (and your hooks) printed.
 */
export function ActivityPanel({ activePath, onClose }: ActivityPanelProps) {
  const [changesOnly, setChangesOnly] = useState(true);
  const [thisRepository, setThisRepository] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const scope = thisRepository ? activePath : null;
  const log = useQuery({
    queryKey: ['activityLog', scope],
    queryFn: async () => unwrap(await ipc.activityLog(scope)),
    refetchInterval: REFRESH_MS,
  });
  const entries = (log.data ?? []).filter((entry) => !changesOnly || entry.changes);

  return (
    <section className={styles.panel} aria-label="Activity log">
      <header className={styles.header}>
        <h2 className={styles.title}>Activity</h2>
        <label className={styles.filter}>
          <input
            type="checkbox"
            checked={changesOnly}
            onChange={(event) => {
              setChangesOnly(event.target.checked);
            }}
          />
          Only commands that change something
        </label>
        {activePath && (
          <label className={styles.filter}>
            <input
              type="checkbox"
              checked={thisRepository}
              onChange={(event) => {
                setThisRepository(event.target.checked);
              }}
            />
            This repository only
          </label>
        )}
        <span className={styles.spacer} />
        <Button size="sm" variant="ghost" aria-label="Close the activity log" onClick={onClose}>
          <X size={14} aria-hidden />
        </Button>
      </header>
      {entries.length === 0 ? (
        <p className={styles.empty}>{log.data ? 'No git commands yet.' : 'Loading…'}</p>
      ) : (
        <ul className={styles.list} aria-label="Git commands">
          {entries.map((entry, index) => {
            const key = `${String(entry.started)} ${entry.command} ${String(index)}`;
            return (
              <li key={key} className={styles.entry}>
                <Row
                  entry={entry}
                  expanded={open === key}
                  onToggle={() => {
                    setOpen(open === key ? null : key);
                  }}
                />
                {open === key && (
                  <pre className={styles.output}>{entry.output || 'git printed nothing.'}</pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Row({
  entry,
  expanded,
  onToggle,
}: {
  entry: GitActivity;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = entry.succeeded ? CircleCheck : CircleX;
  return (
    <button
      type="button"
      className={styles.row}
      aria-expanded={expanded}
      title={entry.repository}
      onClick={onToggle}
    >
      <Icon
        size={14}
        className={styles.status}
        data-ok={entry.succeeded}
        aria-label={entry.succeeded ? 'Succeeded' : 'Failed'}
      />
      <span className={styles.time}>{new Date(entry.started * 1000).toLocaleTimeString()}</span>
      <span className={styles.command}>{entry.command}</span>
      <span className={styles.duration}>{formatDuration(entry.durationMs)}</span>
    </button>
  );
}

/** "12 ms" or "1.8 s". */
function formatDuration(ms: number): string {
  return ms < 1000 ? `${String(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
