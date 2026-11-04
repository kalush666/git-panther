import * as Dialog from '@radix-ui/react-dialog';

import { Button } from '../../../shared/ui/Button/Button';
import type { HistoryRequest } from '../api/useHistory';
import styles from './BranchNameDialog.module.css';

interface CombineBranchesDialogProps {
  /** The branch that was dropped. */
  source: string;
  /** The checked-out branch it was dropped on. */
  target: string | null;
  onChoose: (request: HistoryRequest) => void;
  onCancel: () => void;
}

/** After dropping a branch on the checked-out one: merge it in, or rebase onto it. */
export function CombineBranchesDialog({
  source,
  target,
  onChoose,
  onCancel,
}: CombineBranchesDialogProps) {
  const current = target ?? 'HEAD';
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>
            Combine {source} and {current}
          </Dialog.Title>
          <Dialog.Description className={styles.description}>
            A merge keeps both histories and adds a merge commit. A rebase replays the commits of{' '}
            {current} on top of {source} for a straight history.
          </Dialog.Description>
          <div className={styles.actions}>
            <Button onClick={onCancel}>Cancel</Button>
            <Button
              onClick={() => {
                onChoose({ action: 'rebase', onto: source });
              }}
            >
              Rebase {current} onto {source}
            </Button>
            <Button
              variant="primary"
              autoFocus
              onClick={() => {
                onChoose({ action: 'merge', branch: source });
              }}
            >
              Merge {source} into {current}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
