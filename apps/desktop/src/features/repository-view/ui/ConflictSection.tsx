import { TriangleAlert } from 'lucide-react';

import type { Operation } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { ConfirmButton } from '../../../shared/ui/ConfirmButton/ConfirmButton';
import {
  useAbortOperation,
  useContinueOperation,
  useMarkResolved,
  useOperation,
  useResolveConflict,
} from '../api/useConflicts';
import styles from './ConflictSection.module.css';

const OPERATION_NAME: Record<Operation, string> = {
  merge: 'merge',
  rebase: 'rebase',
  cherryPick: 'cherry-pick',
  revert: 'revert',
};

interface ConflictSectionProps {
  path: string;
  conflicted: string[];
  onOpenFile: (file: string) => void;
}

/**
 * Conflicted files with one-click resolutions, and the interrupted operation
 * with Continue / Abort. Renders nothing when there is nothing to resolve.
 */
export function ConflictSection({ path, conflicted, onOpenFile }: ConflictSectionProps) {
  const operation = useOperation(path);
  const resolve = useResolveConflict(path);
  const markResolved = useMarkResolved(path);
  const continueOperation = useContinueOperation(path);
  const abort = useAbortOperation(path);
  const current = operation.data ?? null;
  const busy = resolve.isPending || markResolved.isPending || continueOperation.isPending;
  const error = resolve.error ?? markResolved.error ?? continueOperation.error ?? abort.error;

  if (!current && conflicted.length === 0) {
    return null;
  }
  const name = current ? OPERATION_NAME[current] : null;

  return (
    <section className={styles.section} aria-labelledby="conflicts-title">
      <header className={styles.header}>
        <TriangleAlert size={14} className={styles.icon} aria-hidden />
        <h2 id="conflicts-title" className={styles.title}>
          {name ? `${capitalize(name)} in progress` : 'Conflicts'}
        </h2>
      </header>
      <p className={styles.summary}>
        {conflicted.length === 0
          ? 'All conflicts are resolved.'
          : `${conflicted.length} conflicted ${conflicted.length === 1 ? 'file' : 'files'}. Keep one side, or edit the file and mark it resolved.`}
      </p>
      {conflicted.length > 0 && (
        <ul className={styles.files} aria-label="Conflicted files">
          {conflicted.map((file) => (
            <li key={file} className={styles.file}>
              <button
                type="button"
                className={styles.path}
                title={file}
                onClick={() => {
                  onOpenFile(file);
                }}
              >
                {file}
              </button>
              <div className={styles.choices} role="group" aria-label={`Resolve ${file}`}>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  title="Keep your version of the whole file"
                  onClick={() => {
                    resolve.mutate({ file, side: 'mine' });
                  }}
                >
                  Keep mine
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  title="Take the incoming version of the whole file"
                  onClick={() => {
                    resolve.mutate({ file, side: 'incoming' });
                  }}
                >
                  Take incoming
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  title="Stage the file as you edited it"
                  onClick={() => {
                    markResolved.mutate([file]);
                  }}
                >
                  Mark resolved
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      )}
      {name && (
        <div className={styles.actions}>
          <ConfirmButton
            confirmLabel={`Really abort the ${name}?`}
            disabled={abort.isPending}
            onConfirm={() => {
              abort.mutate();
            }}
          >
            Abort {name}
          </ConfirmButton>
          <Button
            size="sm"
            variant="primary"
            disabled={conflicted.length > 0 || busy}
            onClick={() => {
              continueOperation.mutate();
            }}
          >
            Continue {name}
          </Button>
        </div>
      )}
    </section>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
