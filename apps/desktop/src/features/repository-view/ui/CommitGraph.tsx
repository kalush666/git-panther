import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { GraphEntryDto, RefLabelDto } from '../../../shared/ipc';
import { useGraphPages } from '../api/useGraph';
import { drawGraph, readPalette, type VisibleRow } from '../model/drawGraph';
import { formatCommitTime } from '../model/formatTime';
import { ROW_HEIGHT, graphColumnWidth } from '../model/graphGeometry';
import styles from './CommitGraph.module.css';

const OVERSCAN_ROWS = 20;

interface CommitGraphProps {
  path: string;
  selectedIndex: number | null;
  onSelectIndex: (index: number) => void;
  /** Reports the selected commit once its row has loaded. */
  onSelectedCommitChange: (commitId: string | null) => void;
}

/**
 * Re-renders (and so redraws the canvas) when the theme switches, since lane
 * colors are theme tokens read at draw time.
 */
function useRedrawOnThemeChange(): void {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setVersion((current) => current + 1);
    });
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
    return () => {
      observer.disconnect();
    };
  }, []);
}

export function CommitGraph({
  path,
  selectedIndex,
  onSelectIndex,
  onSelectedCommitChange,
}: CommitGraphProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const widestGraph = useRef(1);
  const [total, setTotal] = useState(0);
  // TanStack Virtual returns a mutable instance the React Compiler cannot
  // memoize; we do not use the compiler, so this only disables an optimization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
  });
  const items = virtualizer.getVirtualItems();
  const firstIndex = items[0]?.index ?? 0;
  const lastIndex = items.at(-1)?.index ?? 0;
  const graph = useGraphPages(path, firstIndex, lastIndex);
  useRedrawOnThemeChange();

  useEffect(() => {
    setTotal(graph.total ?? 0);
  }, [graph.total]);

  const visibleRows: VisibleRow[] = items.flatMap((item) => {
    const entry = graph.entryAt(item.index);
    return entry ? [{ index: item.index, row: entry.graph }] : [];
  });
  for (const { row } of visibleRows) {
    widestGraph.current = Math.max(widestGraph.current, row.width);
  }
  const graphWidth = graphColumnWidth(widestGraph.current);
  const scrollTop = virtualizer.scrollOffset ?? 0;
  const viewportHeight = scrollRef.current?.clientHeight ?? 0;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    canvas.width = graphWidth * ratio;
    canvas.height = viewportHeight * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, graphWidth, viewportHeight);
    drawGraph(context, visibleRows, scrollTop, readPalette(canvas));
  });

  // A keyboard jump can land on a row whose page is still loading, so the
  // selection is an index and the commit id follows once the row arrives.
  const selectedCommitId =
    selectedIndex === null ? null : (graph.entryAt(selectedIndex)?.id ?? null);
  useEffect(() => {
    if (selectedIndex === null || selectedCommitId !== null) {
      onSelectedCommitChange(selectedCommitId);
    }
  }, [selectedIndex, selectedCommitId, onSelectedCommitChange]);

  const select = (index: number) => {
    onSelectIndex(index);
    virtualizer.scrollToIndex(index, { align: 'auto' });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const pageRows = Math.max(1, Math.floor(viewportHeight / ROW_HEIGHT) - 1);
    const current = selectedIndex ?? -1;
    const targets: Record<string, number> = {
      ArrowDown: current + 1,
      ArrowUp: current - 1,
      PageDown: current + pageRows,
      PageUp: current - pageRows,
      Home: 0,
      End: total - 1,
    };
    const target = targets[event.key];
    if (target !== undefined && total > 0) {
      event.preventDefault();
      select(Math.min(Math.max(target, 0), total - 1));
    }
  };

  if (graph.error) {
    return (
      <p className={styles.message} role="alert">
        {graph.error.message}
      </p>
    );
  }
  if (graph.total === 0) {
    return <p className={styles.message}>This repository has no commits yet.</p>;
  }

  return (
    <div className={styles.graph}>
      <div className={styles.header} style={{ gridTemplateColumns: columns(graphWidth) }}>
        <span className={styles.headerCell}>Graph</span>
        <span className={styles.headerCell}>Message</span>
        <span className={styles.headerCell}>Author</span>
        <span className={styles.headerCell}>Date</span>
        <span className={styles.headerCell}>Commit</span>
      </div>
      <div
        ref={scrollRef}
        className={styles.scroller}
        role="listbox"
        aria-label="Commits"
        tabIndex={0}
        aria-activedescendant={selectedIndex === null ? undefined : rowId(selectedIndex)}
        onKeyDown={onKeyDown}
      >
        <div className={styles.canvas} style={{ height: virtualizer.getTotalSize() }}>
          <canvas
            ref={canvasRef}
            className={styles.lanes}
            aria-hidden
            style={{
              width: graphWidth,
              height: viewportHeight,
              transform: `translateY(${scrollTop}px)`,
            }}
          />
          {items.map((item) => (
            <CommitRow
              key={item.key}
              index={item.index}
              start={item.start}
              entry={graph.entryAt(item.index)}
              graphWidth={graphWidth}
              isSelected={item.index === selectedIndex}
              onSelect={select}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const columns = (graphWidth: number) =>
  `${graphWidth}px minmax(0, 1fr) var(--gp-col-author) var(--gp-col-date) var(--gp-col-sha)`;
const rowId = (index: number) => `commit-row-${index}`;

interface CommitRowProps {
  index: number;
  start: number;
  entry: GraphEntryDto | undefined;
  graphWidth: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
}

function CommitRow({ index, start, entry, graphWidth, isSelected, onSelect }: CommitRowProps) {
  return (
    <div
      id={rowId(index)}
      role="option"
      aria-selected={isSelected}
      className={styles.row}
      data-selected={isSelected}
      style={{ transform: `translateY(${start}px)`, gridTemplateColumns: columns(graphWidth) }}
      onClick={() => {
        onSelect(index);
      }}
    >
      <span />
      {entry ? (
        <>
          <span className={styles.summary}>
            {entry.refs.map((label) => (
              <RefBadge key={`${label.kind}:${label.name}`} label={label} />
            ))}
            <span className={styles.summaryText}>{entry.summary}</span>
          </span>
          <span className={styles.muted}>{entry.author.name}</span>
          <span className={styles.muted}>{formatCommitTime(entry.author.time)}</span>
          <span className={styles.sha}>{entry.shortId}</span>
        </>
      ) : (
        <span className={styles.placeholder} />
      )}
    </div>
  );
}

function RefBadge({ label }: { label: RefLabelDto }) {
  return (
    <span className={styles.badge} data-kind={label.kind} data-head={label.isHead}>
      {label.name}
    </span>
  );
}
