import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';

import type { ReflogEntry } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { useReflog } from '../api/useGraph';
import { formatCommitTime } from '../model/formatTime';
import list from './FileHistoryView.module.css';
import styles from './RecoverView.module.css';

interface RecoverViewProps {
  path: string;
  onCreateBranch: (entry: ReflogEntry) => void;
  onCheckout: (entry: ReflogEntry) => void;
  onClose: () => void;
}

/**
 * Where HEAD pointed recently (git's reflog): commits a reset, rebase or
 * deleted branch left on no branch can be put on a new branch again.
 */
export function RecoverView({ path, onCreateBranch, onCheckout, onClose }: RecoverViewProps) {
  const reflog = useReflog(path);
  const [onlyLost, setOnlyLost] = useState(true);
  const entries = (reflog.data ?? []).filter((entry) => !onlyLost || entry.lost);

  return (
    <section className={list.view} aria-label="Recover lost commits">
      <header className={list.toolbar}>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <ArrowLeft size={14} aria-hidden />
          Graph
        </Button>
        <span className={list.file}>Where HEAD was recently</span>
        <label className={styles.filter}>
          <input
            type="checkbox"
            checked={onlyLost}
            onChange={(event) => {
              setOnlyLost(event.target.checked);
            }}
          />
          Only lost commits
        </label>
      </header>
      <div className={list.body}>
        {reflog.isError ? (
          <p className={list.notice} role="alert">
            {reflog.error.message}
          </p>
        ) : reflog.data && entries.length === 0 ? (
          <p className={list.notice}>
            {onlyLost
              ? 'Nothing is lost: every recent commit is still on a branch or tag.'
              : 'HEAD has not moved yet.'}
          </p>
        ) : (
          <ul className={list.commits} aria-label="Recent HEAD positions">
            {entries.map((entry, index) => (
              <li key={`${entry.id} ${String(index)}`} className={styles.entry}>
                <span className={list.sha}>{entry.shortId}</span>
                <span className={styles.text}>
                  <span className={styles.summary}>
                    {entry.lost && <span className={styles.lost}>Lost</span>}
                    {entry.summary}
                  </span>
                  <span className={styles.action}>{entry.action}</span>
                </span>
                <span className={list.meta}>{formatCommitTime(entry.time)}</span>
                <span className={styles.buttons}>
                  <Button
                    size="sm"
                    variant={entry.lost ? 'secondary' : 'ghost'}
                    onClick={() => {
                      onCreateBranch(entry);
                    }}
                  >
                    Create branch
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onCheckout(entry);
                    }}
                  >
                    Check out
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
