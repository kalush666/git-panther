import { ArrowLeft, Columns2, History, Rows3, ScanText } from 'lucide-react';
import { useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { DiffHunk, DiffLine, HunkAction } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog/ConfirmDialog';
import { useApplyHunk, useFileDiff, type DiffSource } from '../api/useWorkingTree';
import { pairChangedLines, splitRows, wordDiff, type WordSegment } from '../model/wordDiff';
import styles from './DiffViewer.module.css';

type DiffLayout = 'unified' | 'split';

const useDiffLayout = create<{ layout: DiffLayout; setLayout: (layout: DiffLayout) => void }>()(
  persist(
    (set) => ({
      layout: 'unified',
      setLayout: (layout) => {
        set({ layout });
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
  const diff = useFileDiff(path, source);
  const layout = useDiffLayout((state) => state.layout);
  const setLayout = useDiffLayout((state) => state.setLayout);
  const applyHunk = useApplyHunk(path);
  const [pendingDiscard, setPendingDiscard] = useState<number | null>(null);
  const [selection, setSelection] = useState<LineSelection>({});
  // Lines are picked in the unified view, on uncommitted changes only.
  const canPickLines = source.kind === 'workingTree' && layout === 'unified';
  const sideLabel =
    source.kind === 'commit'
      ? `in ${source.commitId.slice(0, 7)}`
      : source.side === 'staged'
        ? 'staged'
        : 'unstaged';

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
        <div className={styles.layoutToggle} role="radiogroup" aria-label="Diff layout">
          <LayoutButton current={layout} value="unified" label="Unified" onSelect={setLayout}>
            <Rows3 size={14} aria-hidden />
          </LayoutButton>
          <LayoutButton current={layout} value="split" label="Split" onSelect={setLayout}>
            <Columns2 size={14} aria-hidden />
          </LayoutButton>
        </div>
      </header>

      <div className={styles.body}>
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
            >
              <header className={styles.hunkHeader}>
                <span className={styles.hunkTitle}>{hunk.header}</span>
                {source.kind === 'workingTree' && (
                  <span className={styles.hunkActions}>
                    {source.side === 'unstaged' ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPendingDiscard(index);
                          }}
                        >
                          Discard {scope}
                        </Button>
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

      <ConfirmDialog
        open={pendingDiscard !== null}
        title={
          pendingDiscard !== null && (selection[pendingDiscard]?.length ?? 0) > 0
            ? `Discard ${lineCount(selection[pendingDiscard]?.length ?? 0)}?`
            : 'Discard this hunk?'
        }
        description="These unstaged changes will be lost. This cannot be undone."
        confirmLabel="Discard"
        onCancel={() => {
          setPendingDiscard(null);
        }}
        onConfirm={() => {
          if (pendingDiscard !== null) {
            runHunk(pendingDiscard, 'discard');
          }
          setPendingDiscard(null);
        }}
      />
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
