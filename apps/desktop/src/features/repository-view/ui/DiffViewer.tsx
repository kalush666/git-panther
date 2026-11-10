import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Columns2,
  History,
  Rows3,
  ScanText,
  Space,
  WrapText,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { DiffHunk, DiffLine, HunkAction } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { ConfirmButton } from '../../../shared/ui/ConfirmButton/ConfirmButton';
import { useApplyHunk, useFileDiff, type DiffSource } from '../api/useWorkingTree';
import { pairChangedLines, splitRows, wordDiff, type WordSegment } from '../model/wordDiff';
import styles from './DiffViewer.module.css';

type DiffLayout = 'unified' | 'split';

interface DiffViewState {
  layout: DiffLayout;
  /** Leave out changes in spacing alone (git diff -w). */
  ignoreWhitespace: boolean;
  /** Wrap long lines instead of scrolling sideways. */
  wrap: boolean;
  setLayout: (layout: DiffLayout) => void;
  toggle: (option: 'ignoreWhitespace' | 'wrap') => void;
}

const useDiffLayout = create<DiffViewState>()(
  persist(
    (set) => ({
      layout: 'unified',
      ignoreWhitespace: false,
      wrap: true,
      setLayout: (layout) => {
        set({ layout });
      },
      toggle: (option) => {
        set((state) => ({ [option]: !state[option] }));
      },
    }),
    { name: 'git-panther.diff-layout' },
  ),
);

interface DiffViewerProps {
  path: string;
  source: DiffSource;
  onClose: () => void;
  onShowHistory: (file: string) => void;
  onShowBlame: (file: string) => void;
}

/** Selected line indexes per hunk index. */
type LineSelection = Record<number, number[]>;

/** "1 line" / "3 lines". */
const lineCount = (count: number) => `${count} ${count === 1 ? 'line' : 'lines'}`;

export function DiffViewer({ path, source, onClose, onShowHistory, onShowBlame }: DiffViewerProps) {
  const layout = useDiffLayout((state) => state.layout);
  const setLayout = useDiffLayout((state) => state.setLayout);
  const ignoreWhitespace = useDiffLayout((state) => state.ignoreWhitespace);
  const wrap = useDiffLayout((state) => state.wrap);
  const toggle = useDiffLayout((state) => state.toggle);
  const diff = useFileDiff(path, source, ignoreWhitespace);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [currentHunk, setCurrentHunk] = useState(-1);
  const hunkCount = diff.data?.hunks.length ?? 0;
  /** Scrolls to the change `step` hunks away (wrapping around), F7 / Shift+F7. */
  const goToChange = (step: 1 | -1) => {
    if (hunkCount === 0) return;
    const next = (currentHunk + step + hunkCount) % hunkCount;
    setCurrentHunk(next);
    bodyRef.current
      ?.querySelector(`[data-hunk="${String(next)}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const applyHunk = useApplyHunk(path);
  const [selection, setSelection] = useState<LineSelection>({});
  // Hunks are staged as git sees them; with spacing hidden they would not match.
  const canStage = source.kind === 'workingTree' && !ignoreWhitespace;
  // Lines are picked in the unified view, on uncommitted changes only.
  const canPickLines = canStage && layout === 'unified';
  const sideLabel = describeSource(source);

  const runHunk = (index: number, action: HunkAction) => {
    const hunk = diff.data?.hunks[index];
    if (!hunk) return;
    const lines = selection[index];
    applyHunk.mutate(
      {
        hunk: {
          file: source.file,
          index,
          header: hunk.header,
          ...(lines?.length ? { lines } : {}),
        },
        action,
      },
      {
        onSuccess: () => {
          setSelection({});
        },
      },
    );
  };

  const toggleLine = (hunkIndex: number, lineIndex: number) => {
    setSelection((current) => {
      const lines = current[hunkIndex] ?? [];
      const next = lines.includes(lineIndex)
        ? lines.filter((line) => line !== lineIndex)
        : [...lines, lineIndex];
      return { ...current, [hunkIndex]: next };
    });
  };

  return (
    <section className={styles.viewer} aria-label={`Diff of ${source.file}`}>
      <header className={styles.toolbar}>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <ArrowLeft size={14} aria-hidden />
          Graph
        </Button>
        <span className={styles.file} title={source.file}>
          {diff.data?.oldPath ? `${diff.data.oldPath} → ` : ''}
          {source.file}
        </span>
        <span className={styles.side}>{sideLabel}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onShowHistory(source.file);
          }}
        >
          <History size={14} aria-hidden />
          History
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onShowBlame(source.file);
          }}
        >
          <ScanText size={14} aria-hidden />
          Blame
        </Button>
        <div className={styles.changeNav}>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Previous change"
            title="Previous change (Shift+F7)"
            disabled={hunkCount === 0}
            onClick={() => {
              goToChange(-1);
            }}
          >
            <ChevronUp size={14} aria-hidden />
          </Button>
          <span className={styles.side} aria-live="polite">
            {hunkCount === 0
              ? 'No changes'
              : `${String(Math.max(currentHunk, 0) + 1)} / ${String(hunkCount)}`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Next change"
            title="Next change (F7)"
            disabled={hunkCount === 0}
            onClick={() => {
              goToChange(1);
            }}
          >
            <ChevronDown size={14} aria-hidden />
          </Button>
        </div>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={ignoreWhitespace}
          title="Leave out changes in spacing alone"
          onClick={() => {
            toggle('ignoreWhitespace');
          }}
        >
          <Space size={14} aria-hidden />
          Ignore whitespace
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={wrap}
          title="Wrap long lines"
          onClick={() => {
            toggle('wrap');
          }}
        >
          <WrapText size={14} aria-hidden />
          Wrap
        </Button>
        <div className={styles.layoutToggle} role="radiogroup" aria-label="Diff layout">
          <LayoutButton current={layout} value="unified" label="Unified" onSelect={setLayout}>
            <Rows3 size={14} aria-hidden />
          </LayoutButton>
          <LayoutButton current={layout} value="split" label="Split" onSelect={setLayout}>
            <Columns2 size={14} aria-hidden />
          </LayoutButton>
        </div>
      </header>

      <div
        ref={bodyRef}
        className={styles.body}
        data-wrap={wrap}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'F7') {
            event.preventDefault();
            goToChange(event.shiftKey ? -1 : 1);
          }
        }}
      >
        {ignoreWhitespace && source.kind === 'workingTree' && (
          <p className={styles.hint}>
            Spacing changes are hidden, so staging hunks is off. Turn off Ignore whitespace to
            stage.
          </p>
        )}
        {diff.isError && (
          <p className={styles.notice} role="alert">
            {diff.error.message}
          </p>
        )}
        {applyHunk.error && (
          <p className={styles.notice} role="alert">
            {applyHunk.error.message}
          </p>
        )}
        {diff.data?.isBinary && (
          <p className={styles.notice}>Binary file — no text diff to show.</p>
        )}
        {diff.data?.isTruncated && (
          <p className={styles.notice}>This diff is too large to display.</p>
        )}
        {diff.data &&
          !diff.data.isBinary &&
          !diff.data.isTruncated &&
          diff.data.hunks.length === 0 && <p className={styles.notice}>No changes in this file.</p>}
        {canPickLines && diff.data && diff.data.hunks.length > 0 && (
          <p className={styles.hint}>Click a + or − sign to pick single lines of a hunk.</p>
        )}
        {diff.data?.hunks.map((hunk, index) => {
          const picked = selection[index]?.length ?? 0;
          const scope = picked > 0 ? lineCount(picked) : 'hunk';
          return (
            <section
              key={`${index}:${hunk.header}`}
              className={styles.hunk}
              aria-label={hunk.header}
              data-hunk={index}
              data-current={index === currentHunk}
            >
              <header className={styles.hunkHeader}>
                <span className={styles.hunkTitle}>{hunk.header}</span>
                {canStage && (
                  <span className={styles.hunkActions}>
                    {source.side === 'unstaged' ? (
                      <>
                        <ConfirmButton
                          confirmLabel={`Discard ${scope}? Click again`}
                          onConfirm={() => {
                            runHunk(index, 'discard');
                          }}
                        >
                          Discard {scope}
                        </ConfirmButton>
                        <Button
                          size="sm"
                          onClick={() => {
                            runHunk(index, 'stage');
                          }}
                        >
                          Stage {scope}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => {
                          runHunk(index, 'unstage');
                        }}
                      >
                        Unstage {scope}
                      </Button>
                    )}
                  </span>
                )}
              </header>
              {layout === 'unified' ? (
                <UnifiedHunk
                  hunk={hunk}
                  picked={canPickLines ? (selection[index] ?? []) : null}
                  onPick={(line) => {
                    toggleLine(index, line);
                  }}
                />
              ) : (
                <SplitHunk hunk={hunk} />
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function LayoutButton({
  current,
  value,
  label,
  onSelect,
  children,
}: {
  current: DiffLayout;
  value: DiffLayout;
  label: string;
  onSelect: (layout: DiffLayout) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={current === value}
      className={styles.layoutButton}
      onClick={() => {
        onSelect(value);
      }}
    >
      {children}
      {label}
    </button>
  );
}

const SIGNS: Record<DiffLine['kind'], string> = { context: ' ', added: '+', removed: '-' };

/** Word-level segments for a changed line paired with its counterpart. */
function segmentsFor(lines: readonly DiffLine[], index: number, partners: Map<number, number>) {
  const line = lines[index];
  const partnerIndex = partners.get(index);
  const partner = partnerIndex === undefined ? undefined : lines[partnerIndex];
  if (!line || !partner || line.kind === 'context') {
    return null;
  }
  const { before, after } =
    line.kind === 'removed'
      ? wordDiff(line.content, partner.content)
      : wordDiff(partner.content, line.content);
  return line.kind === 'removed' ? before : after;
}

function Content({ text, segments }: { text: string; segments: WordSegment[] | null }) {
  if (!segments) {
    return <>{text}</>;
  }
  return (
    <>
      {segments.map((segment, index) =>
        segment.changed ? (
          <mark key={index} className={styles.word}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

interface UnifiedHunkProps {
  hunk: DiffHunk;
  /** Picked line indexes, or `null` when lines cannot be picked. */
  picked: readonly number[] | null;
  onPick: (line: number) => void;
}

function UnifiedHunk({ hunk, picked, onPick }: UnifiedHunkProps) {
  const partners = pairChangedLines(hunk.lines);
  return (
    <table className={styles.table}>
      <tbody>
        {hunk.lines.map((line, index) => (
          <tr
            key={index}
            className={styles.line}
            data-kind={line.kind}
            data-picked={picked?.includes(index) ?? false}
          >
            <td className={styles.number}>{line.oldNumber ?? ''}</td>
            <td className={styles.number}>{line.newNumber ?? ''}</td>
            {picked && line.kind !== 'context' ? (
              <td className={styles.sign}>
                <button
                  type="button"
                  className={styles.pick}
                  aria-pressed={picked.includes(index)}
                  aria-label={`Pick line ${String(line.newNumber ?? line.oldNumber ?? '')}: ${line.content}`}
                  onClick={() => {
                    onPick(index);
                  }}
                >
                  {SIGNS[line.kind]}
                </button>
              </td>
            ) : (
              <td className={styles.sign} aria-hidden>
                {SIGNS[line.kind]}
              </td>
            )}
            <td className={styles.code}>
              <Content text={line.content} segments={segmentsFor(hunk.lines, index, partners)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SplitHunk({ hunk }: { hunk: DiffHunk }) {
  const partners = pairChangedLines(hunk.lines);
  return (
    <table className={styles.table} data-layout="split">
      <tbody>
        {splitRows(hunk.lines).map((row, rowIndex) => (
          <tr key={rowIndex} className={styles.line}>
            {[row.left, row.right].map((cell, side) => {
              const kind = cell?.line.kind ?? 'empty';
              const number = side === 0 ? cell?.line.oldNumber : cell?.line.newNumber;
              return (
                <SplitCell
                  key={side}
                  kind={kind}
                  number={number ?? null}
                  sign={cell ? SIGNS[cell.line.kind] : ''}
                  content={
                    cell ? (
                      <Content
                        text={cell.line.content}
                        segments={segmentsFor(hunk.lines, cell.index, partners)}
                      />
                    ) : null
                  }
                />
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SplitCell({
  kind,
  number,
  sign,
  content,
}: {
  kind: string;
  number: number | null;
  sign: string;
  content: React.ReactNode;
}) {
  return (
    <>
      <td className={styles.number} data-kind={kind}>
        {number ?? ''}
      </td>
      <td className={styles.sign} data-kind={kind} aria-hidden>
        {sign}
      </td>
      <td className={styles.code} data-kind={kind}>
        {content}
      </td>
    </>
  );
}

/** Where the diff comes from, e.g. "in 1a2b3c4" or "staged". */
function describeSource(source: DiffSource): string {
  switch (source.kind) {
    case 'commit':
      return `in ${source.commitId.slice(0, 7)}`;
    case 'compare':
      return `${source.from.slice(0, 7)}..${source.to.slice(0, 7)}`;
    case 'workingTree':
      return source.side;
  }
}
