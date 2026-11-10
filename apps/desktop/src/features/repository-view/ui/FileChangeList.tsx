import * as ContextMenu from '@radix-ui/react-context-menu';
import type { ReactNode } from 'react';

import type { FileChangeDto } from '../../../shared/ipc';
import styles from './CommitDetailsPanel.module.css';
import menuStyles from './menu.module.css';

const CHANGE_LABELS: Record<FileChangeDto['kind'], { letter: string; label: string }> = {
  added: { letter: 'A', label: 'Added' },
  modified: { letter: 'M', label: 'Modified' },
  deleted: { letter: 'D', label: 'Deleted' },
  renamed: { letter: 'R', label: 'Renamed' },
  typeChanged: { letter: 'T', label: 'Type changed' },
};

/**
 * Changed files with their kind letter; a click opens the file's diff, and
 * `fileMenu` (when given) is the file's right-click menu.
 */
export function FileChangeList({
  changes,
  label,
  onOpenFile,
  fileMenu,
}: {
  changes: FileChangeDto[];
  label?: string;
  onOpenFile: (file: string) => void;
  fileMenu?: (change: FileChangeDto) => ReactNode;
}) {
  return (
    <ul className={styles.changes} aria-label={label}>
      {changes.map((change) => {
        const { letter, label: kind } = CHANGE_LABELS[change.kind];
        const row = (
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
        );
        return (
          <li key={`${change.kind}:${change.path}`}>
            {fileMenu ? (
              <ContextMenu.Root>
                <ContextMenu.Trigger asChild>{row}</ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content className={menuStyles.content}>
                    {fileMenu(change)}
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
