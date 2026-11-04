import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { useCommitSearch } from '../api/useGraph';
import styles from './GraphSearch.module.css';

interface GraphSearchProps {
  path: string;
  /** Called with a matching row to select and scroll to. */
  onGoTo: (row: number) => void;
  /** Reports the rows that match, so the graph can highlight them. */
  onMatchesChange: (rows: ReadonlySet<number>) => void;
}

const NO_ROWS: ReadonlySet<number> = new Set();

/** Finds commits by message, author or SHA; Ctrl+F focuses it, Enter goes to the next match. */
export function GraphSearch({ path, onGoTo, onMatchesChange }: GraphSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  /** The match last gone to, or -1 before the first. */
  const [current, setCurrent] = useState(-1);
  const deferredQuery = useDeferredValue(query);
  const search = useCommitSearch(path, deferredQuery);
  const matches = useMemo(
    () => (deferredQuery.trim() ? (search.data ?? []) : []),
    [deferredQuery, search.data],
  );

  useEffect(() => {
    onMatchesChange(matches.length > 0 ? new Set(matches) : NO_ROWS);
  }, [matches, onMatchesChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const goTo = (position: number) => {
    if (matches.length === 0) return;
    const wrapped = (position + matches.length) % matches.length;
    setCurrent(wrapped);
    const row = matches[wrapped];
    if (row !== undefined) onGoTo(row);
  };

  const status =
    deferredQuery.trim() === ''
      ? null
      : search.isPending
        ? 'Searching…'
        : matches.length === 0
          ? 'No matches'
          : `${Math.max(Math.min(current, matches.length - 1), 0) + 1} of ${matches.length}`;

  return (
    <div className={styles.search} role="search">
      <Search size={13} aria-hidden className={styles.icon} />
      <input
        ref={inputRef}
        className={styles.input}
        aria-label="Search commits"
        placeholder="Search commits — message, author or SHA (Ctrl+F)"
        value={query}
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value);
          setCurrent(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            goTo(event.shiftKey ? current - 1 : current + 1);
          } else if (event.key === 'Escape') {
            setQuery('');
          }
        }}
      />
      {status && (
        <span className={styles.status} role="status">
          {status}
        </span>
      )}
      {matches.length > 0 && (
        <>
          <button
            type="button"
            className={styles.button}
            aria-label="Previous match"
            onClick={() => {
              goTo(current - 1);
            }}
          >
            <ChevronUp size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.button}
            aria-label="Next match"
            onClick={() => {
              goTo(current + 1);
            }}
          >
            <ChevronDown size={14} aria-hidden />
          </button>
        </>
      )}
      {query && (
        <button
          type="button"
          className={styles.button}
          aria-label="Clear search"
          onClick={() => {
            setQuery('');
          }}
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
