import * as ContextMenu from '@radix-ui/react-context-menu';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, Cloud, Laptop, Tag } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import type { GraphEntryDto, Pipeline } from '../../../shared/ipc';
import { useGraphPages } from '../api/useGraph';
import { columnTemplate, useColumnsStore, type ColumnVisibility } from '../model/columns';
import { drawGraph, readPalette, type VisibleRow } from '../model/drawGraph';
import { formatCommitTime } from '../model/formatTime';
import { ROW_HEIGHT, graphColumnWidth, paletteIndex } from '../model/graphGeometry';
import { groupRefs, initialsOf, type RefPill } from '../model/refPills';
import { ColumnMenu } from './ColumnMenu';
import { GraphFilter } from './GraphFilter';
import { GraphSearch } from './GraphSearch';
import { PipelineBadge } from './PipelineBadge';
import styles from './CommitGraph.module.css';
import menuStyles from './menu.module.css';

const OVERSCAN_ROWS = 20;
/** Labels beyond this count collapse into a "+N" chip. */
const VISIBLE_PILLS = 1;

interface CommitGraphProps {
  path: string;
  selectedIndex: number | null;
  onSelectIndex: (index: number) => void;
  /** Reports the selected commit once its row has loaded. */
  onSelectedCommitChange: (commitId: string | null) => void;
  /** Shown above the first commit, e.g. the working-copy row. */
  leadingRow?: ReactNode;
  /** Context-menu items for a commit row (right-click). */
  rowMenu?: (entry: GraphEntryDto) => ReactNode;
  /** Double-clicking a branch label checks the branch out. */
  onCheckoutRef?: (name: string) => void;
  /** CI results by commit id, when the server is connected. */
  pipelines?: ReadonlyMap<string, Pipeline>;
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

function visibleRow(index: number, entry: GraphEntryDto, showRefsColumn: boolean): VisibleRow {
  return {
    index,
    row: entry.graph,
    initials: initialsOf(entry.author.name),
    hasRefs: showRefsColumn && entry.refs.length > 0,
    isHead: entry.refs.some((ref) => ref.isHead),
  };
}

export function CommitGraph({
  path,
  selectedIndex,
  onSelectIndex,
  onSelectedCommitChange,
  leadingRow,
  rowMenu,
  onCheckoutRef,
  pipelines,
}: CommitGraphProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const widestGraph = useRef(1);
  const [total, setTotal] = useState(0);
  const [matches, setMatches] = useState<ReadonlySet<number>>(new Set());
  /** Rows the author / date filter lets through; `null` without a filter. */
  const [passing, setPassing] = useState<ReadonlySet<number> | null>(null);
  const keepMatches = useCallback((rows: ReadonlySet<number>) => {
    setMatches(rows);
  }, []);
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
  const columns = useColumnsStore((state) => state.visible);
  useRedrawOnThemeChange();

  useEffect(() => {
    setTotal(graph.total ?? 0);
  }, [graph.total]);

  const visibleRows: VisibleRow[] = items.flatMap((item) => {
    const entry = graph.entryAt(item.index);
    return entry ? [visibleRow(item.index, entry, columns.refs)] : [];
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

  const gridTemplateColumns = columnTemplate(columns, graphWidth);
  return (
    <div className={styles.graph}>
      <div className={styles.toolbar}>
        <GraphSearch
          path={path}
          onMatchesChange={keepMatches}
          onGoTo={(row) => {
            onSelectIndex(row);
            virtualizer.scrollToIndex(row, { align: 'center' });
          }}
        />
        <GraphFilter path={path} onRowsChange={setPassing} />
      </div>
      <div className={styles.header} style={{ gridTemplateColumns }}>
        {columns.refs && <span className={styles.headerCell}>Branch / Tag</span>}
        <span className={styles.headerCell}>Graph</span>
        <span className={styles.headerCell}>Commit message</span>
        {columns.author && <span className={styles.headerCell}>Author</span>}
        {columns.date && <span className={styles.headerCell}>Date</span>}
        {columns.sha && <span className={styles.headerCell}>SHA</span>}
        <span className={styles.columnMenu}>
          <ColumnMenu />
        </span>
      </div>
      {leadingRow}
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
              left: columns.refs ? 'var(--gp-refs-col-width)' : 0,
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
              gridTemplateColumns={gridTemplateColumns}
              columns={columns}
              menu={rowMenu}
              onCheckoutRef={onCheckoutRef}
              isSelected={item.index === selectedIndex}
              isMatch={matches.has(item.index)}
              isDimmed={passing !== null && !passing.has(item.index)}
              pipeline={pipelines?.get(graph.entryAt(item.index)?.id ?? '')}
              onSelect={select}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const rowId = (index: number) => `commit-row-${index}`;

interface CommitRowProps {
  index: number;
  start: number;
  entry: GraphEntryDto | undefined;
  gridTemplateColumns: string;
  columns: ColumnVisibility;
  menu: CommitGraphProps['rowMenu'];
  onCheckoutRef: CommitGraphProps['onCheckoutRef'];
  isSelected: boolean;
  /** Matches the current search. */
  isMatch: boolean;
  /** Left out by the author / date filter. */
  isDimmed: boolean;
  pipeline: Pipeline | undefined;
  onSelect: (index: number) => void;
}

function CommitRow({
  index,
  start,
  entry,
  gridTemplateColumns,
  columns,
  menu,
  onCheckoutRef,
  isSelected,
  isMatch,
  isDimmed,
  pipeline,
  onSelect,
}: CommitRowProps) {
  const row = (
    <div
      id={rowId(index)}
      role="option"
      aria-selected={isSelected}
      className={styles.row}
      data-selected={isSelected}
      data-match={isMatch}
      data-dimmed={isDimmed}
      style={{ transform: `translateY(${start}px)`, gridTemplateColumns }}
      onClick={() => {
        onSelect(index);
      }}
    >
      {entry ? (
        <>
          {columns.refs && <RefPills entry={entry} onCheckout={onCheckoutRef} />}
          <span className={styles.graphCell} />
          <span className={styles.summary}>
            {/* With the label column hidden, labels lead the message instead. */}
            {!columns.refs && entry.refs.length > 0 && (
              <RefPills entry={entry} onCheckout={onCheckoutRef} />
            )}
            {pipeline && <PipelineBadge pipeline={pipeline} />}
            <span className={styles.summaryText}>{entry.summary}</span>
            {entry.bodyPreview && <span className={styles.preview}>{entry.bodyPreview}</span>}
          </span>
          {columns.author && <span className={styles.muted}>{entry.author.name}</span>}
          {columns.date && (
            <span className={styles.muted}>{formatCommitTime(entry.author.time)}</span>
          )}
          {columns.sha && <span className={styles.sha}>{entry.shortId}</span>}
        </>
      ) : (
        <>
          {columns.refs && <span />}
          <span className={styles.graphCell} />
          <span className={styles.placeholder} />
        </>
      )}
    </div>
  );
  if (!menu || !entry) {
    return row;
  }
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{row}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={menuStyles.content}
          // Actions may open an input bar; keep focus there, not on the row.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          {menu(entry)}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function RefPills({
  entry,
  onCheckout,
}: {
  entry: GraphEntryDto;
  onCheckout: CommitGraphProps['onCheckoutRef'];
}) {
  const pills = groupRefs(entry.refs);
  const shown = pills.slice(0, VISIBLE_PILLS);
  const hidden = pills.slice(VISIBLE_PILLS);
  // Pills take the color of their commit's lane, tying label and node together.
  const laneColor = {
    '--gp-pill-lane': `var(--gp-lane-${paletteIndex(entry.graph.color)})`,
  } as CSSProperties;
  return (
    <span className={styles.refs} style={laneColor}>
      {shown.map((pill) => (
        <RefPillLabel key={`${pill.kind}:${pill.name}`} pill={pill} onCheckout={onCheckout} />
      ))}
      {hidden.length > 0 && (
        <span className={styles.more} title={hidden.map((pill) => pill.name).join('\n')}>
          +{hidden.length}
        </span>
      )}
    </span>
  );
}

function RefPillLabel({
  pill,
  onCheckout,
}: {
  pill: RefPill;
  onCheckout: CommitGraphProps['onCheckoutRef'];
}) {
  // A local branch checks out as is; a remote-only one through its remote.
  const target =
    pill.kind === 'tag' || pill.isHead
      ? null
      : pill.isLocal
        ? pill.name
        : pill.remotes[0]
          ? `${pill.remotes[0]}/${pill.name}`
          : null;
  const where = [pill.isLocal ? 'local' : null, ...pill.remotes].filter(Boolean).join(', ');
  return (
    <span
      className={styles.pill}
      data-kind={pill.kind}
      data-head={pill.isHead}
      title={
        pill.kind === 'tag'
          ? `Tag ${pill.name}`
          : `${pill.name} (${where})${target ? '\nDouble-click to check out' : ''}`
      }
      onDoubleClick={(event) => {
        if (!target || !onCheckout) return;
        event.stopPropagation();
        onCheckout(target);
      }}
    >
      {pill.isHead && <Check size={12} strokeWidth={2.5} aria-label="checked out" />}
      {pill.kind === 'tag' && <Tag size={12} strokeWidth={2} aria-hidden />}
      <span className={styles.pillName}>{pill.name}</span>
      {pill.isLocal && <Laptop size={12} strokeWidth={2} aria-label="local" />}
      {pill.remotes.length > 0 && <Cloud size={12} strokeWidth={2} aria-label="remote" />}
    </span>
  );
}
