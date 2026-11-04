import { ArrowLeft } from 'lucide-react';

import { Button } from '../../../shared/ui/Button/Button';
import { useBlame, useFileHistory } from '../api/useGraph';
import { formatCommitTime } from '../model/formatTime';
import styles from './FileHistoryView.module.css';

/** What the main area shows about one file. */
export type FileView = { kind: 'history'; file: string } | { kind: 'blame'; file: string };

interface FileHistoryViewProps {
  path: string;
  view: FileView;
  onSwitch: (view: FileView) => void;
  /** Opens how `file` changed in `commitId`. */
  onOpenCommit: (commitId: string, file: string) => void;
  onClose: () => void;
}

/** A file's history (commits that changed it) or its blame (who changed each line). */
export function FileHistoryView({
  path,
  view,
  onSwitch,
  onOpenCommit,
  onClose,
}: FileHistoryViewProps) {
  return (
    <section
      className={styles.view}
      aria-label={`${view.kind === 'history' ? 'History' : 'Blame'} of ${view.file}`}
    >
      <header className={styles.toolbar}>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <ArrowLeft size={14} aria-hidden />
          Graph
        </Button>
        <span className={styles.file} title={view.file}>
          {view.file}
        </span>
        <div className={styles.tabs} role="tablist" aria-label="File view">
          {(['history', 'blame'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={view.kind === kind}
              className={styles.tab}
              onClick={() => {
                onSwitch({ kind, file: view.file });
              }}
            >
              {kind === 'history' ? 'History' : 'Blame'}
            </button>
          ))}
        </div>
      </header>
      <div className={styles.body}>
        {view.kind === 'history' ? (
          <HistoryList path={path} file={view.file} onOpenCommit={onOpenCommit} />
        ) : (
          <BlameTable path={path} file={view.file} onOpenCommit={onOpenCommit} />
        )}
      </div>
    </section>
  );
}

interface ListProps {
  path: string;
  file: string;
  onOpenCommit: (commitId: string, file: string) => void;
}

function HistoryList({ path, file, onOpenCommit }: ListProps) {
  const history = useFileHistory(path, file);
  if (history.isError) {
    return (
      <p className={styles.notice} role="alert">
        {history.error.message}
      </p>
    );
  }
  if (history.data?.length === 0) {
    return <p className={styles.notice}>No commit has changed this file yet.</p>;
  }
  return (
    <ul className={styles.commits} aria-label="Commits that changed this file">
      {history.data?.map((commit) => (
        <li key={commit.id}>
          <button
            type="button"
            className={styles.commit}
            onClick={() => {
              onOpenCommit(commit.id, file);
            }}
          >
            <span className={styles.sha}>{commit.shortId}</span>
            <span className={styles.summary}>{commit.summary}</span>
            <span className={styles.meta}>
              {commit.author.name} · {formatCommitTime(commit.author.time)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function BlameTable({ path, file, onOpenCommit }: ListProps) {
  const blame = useBlame(path, file);
  if (blame.isError) {
    return (
      <p className={styles.notice} role="alert">
        {blame.error.message}
      </p>
    );
  }
  const lines = blame.data ?? [];
  return (
    <table className={styles.blame}>
      <tbody>
        {lines.map((line, index) => {
          // Name the commit only where a run of its lines starts.
          const startsRun = lines[index - 1]?.commit !== line.commit;
          return (
            <tr key={line.line} data-run-start={startsRun}>
              <td className={styles.blameCommit}>
                {startsRun && (
                  <button
                    type="button"
                    className={styles.blameLink}
                    title={`${line.summary}\n${line.author}, ${formatCommitTime(line.time)}`}
                    onClick={() => {
                      onOpenCommit(line.commit, file);
                    }}
                  >
                    <span className={styles.sha}>{line.shortId}</span> {line.author}
                  </button>
                )}
              </td>
              <td className={styles.lineNumber}>{line.line}</td>
              <td className={styles.code}>{line.content}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
