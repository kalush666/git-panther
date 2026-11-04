import { Filter, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { useCommitFilter } from '../api/useGraph';
import styles from './GraphFilter.module.css';

/** How far back the graph may reach; days, `null` for any time. */
const SINCE_CHOICES: ReadonlyArray<{ days: number | null; label: string }> = [
  { days: null, label: 'Any time' },
  { days: 1, label: 'Last day' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last year' },
];

const DAY_SECONDS = 86_400;

interface GraphFilterProps {
  path: string;
  /** The rows that pass, or `null` when no filter is set (every row passes). */
  onRowsChange: (rows: ReadonlySet<number> | null) => void;
}

/**
 * Dims commits by other authors or older than a time, keeping the graph's
 * shape so lines between the remaining commits still make sense.
 */
export function GraphFilter({ path, onRowsChange }: GraphFilterProps) {
  const [open, setOpen] = useState(false);
  const [author, setAuthor] = useState('');
  /** The chosen range and the moment it starts, fixed when chosen so the query stays put. */
  const [range, setRange] = useState<{ days: number; since: number } | null>(null);
  const deferredAuthor = useDeferredValue(author);
  const since = range?.since ?? null;
  const filter = useCommitFilter(path, deferredAuthor, since);
  const active = deferredAuthor.trim() !== '' || since !== null;
  const rows = useMemo(
    () => (active && filter.data ? new Set(filter.data) : null),
    [active, filter.data],
  );

  useEffect(() => {
    onRowsChange(rows);
  }, [rows, onRowsChange]);

  const clear = () => {
    setAuthor('');
    setRange(null);
  };

  return (
    <div className={styles.filter} role="group" aria-label="Filter commits">
      <button
        type="button"
        className={styles.toggle}
        aria-pressed={open}
        data-active={active}
        title="Show only commits by an author or since a date"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Filter size={13} aria-hidden />
        Filter
      </button>
      {open && (
        <>
          <input
            className={`${styles.field} ${styles.author}`}
            aria-label="Author"
            placeholder="Author name or email"
            value={author}
            spellCheck={false}
            autoFocus
            onChange={(event) => {
              setAuthor(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') clear();
            }}
          />
          <select
            className={styles.field}
            aria-label="Since"
            value={range?.days ?? ''}
            onChange={(event) => {
              const days = event.target.value === '' ? null : Number(event.target.value);
              setRange(
                days === null
                  ? null
                  : { days, since: Math.floor(Date.now() / 1000) - days * DAY_SECONDS },
              );
            }}
          >
            {SINCE_CHOICES.map(({ days: value, label }) => (
              <option key={label} value={value ?? ''}>
                {label}
              </option>
            ))}
          </select>
        </>
      )}
      {active && (
        <>
          <span className={styles.status} role="status">
            {filter.data ? `${String(filter.data.length)} shown` : 'Filtering…'}
          </span>
          <button type="button" className={styles.toggle} aria-label="Clear filter" onClick={clear}>
            <X size={13} aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
