import type { FileChangeDto } from '../../../shared/ipc';
import styles from './CommitDetailsPanel.module.css';

const CHANGE_LABELS: Record<FileChangeDto['kind'], { letter: string; label: string }> = {
  added: { letter: 'A', label: 'Added' },
  modified: { letter: 'M', label: 'Modified' },
  deleted: { letter: 'D', label: 'Deleted' },
  renamed: { letter: 'R', label: 'Renamed' },
  typeChanged: { letter: 'T', label: 'Type changed' },
};

/** Changed files with their kind letter; a click opens the file's diff. */
export function FileChangeList({
  changes,
  label,
  onOpenFile,
}: {
  changes: FileChangeDto[];
  label?: string;
  onOpenFile: (file: string) => void;
}) {
  return (
    <ul className={styles.changes} aria-label={label}>
      {changes.map((change) => {
        const { letter, label: kind } = CHANGE_LABELS[change.kind];
        return (
          <li key={`${change.kind}:${change.path}`}>
            <button
              type="button"
              className={styles.change}
              onClick={() => {
                onOpenFile(change.path);
              }}
            >
              <span className={styles.changeKind} data-kind={change.kind} title={kind}>
                {letter}
              </span>
              <span className={styles.changePath}>
                {change.kind === 'renamed' ? `${change.from} → ${change.path}` : change.path}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
