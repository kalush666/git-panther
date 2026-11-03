import { useState, type ReactNode } from 'react';

import { isIpcError } from '../../../shared/ipc';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog/ConfirmDialog';
import {
  useCheckoutBranch,
  useCreateBranch,
  useDeleteBranch,
  useRenameBranch,
} from '../api/useBranches';
import { BranchNameDialog } from './BranchNameDialog';

type Dialog =
  | { kind: 'create'; start: string; startLabel: string }
  | { kind: 'rename'; from: string }
  | { kind: 'delete'; name: string };

export interface BranchActions {
  checkout: (name: string) => void;
  openCreate: (start: string, startLabel: string) => void;
  openRename: (name: string) => void;
  openDelete: (name: string) => void;
  /** The last checkout error, shown next to the branch list. */
  checkoutError: string | null;
  dialogs: ReactNode;
}

/** Branch commands plus the dialogs that collect their input. */
export function useBranchActions(path: string): BranchActions {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const create = useCreateBranch(path);
  const checkout = useCheckoutBranch(path);
  const rename = useRenameBranch(path);
  const remove = useDeleteBranch(path);

  const close = () => {
    setDialog(null);
    create.reset();
    rename.reset();
    remove.reset();
  };

  const dialogs = (() => {
    switch (dialog?.kind) {
      case undefined:
        return null;
      case 'create':
        return (
          <BranchNameDialog
            title="Create branch"
            description={<>New branch starting at {dialog.startLabel}.</>}
            initialName=""
            confirmLabel="Create branch"
            offerCheckout
            error={create.error?.message ?? null}
            isPending={create.isPending}
            onCancel={close}
            onSubmit={(name, switchTo) => {
              create.mutate(
                { name, start: dialog.start, checkout: switchTo },
                { onSuccess: close },
              );
            }}
          />
        );
      case 'rename':
        return (
          <BranchNameDialog
            title="Rename branch"
            description={<>Rename “{dialog.from}”.</>}
            initialName={dialog.from}
            confirmLabel="Rename"
            offerCheckout={false}
            error={rename.error?.message ?? null}
            isPending={rename.isPending}
            onCancel={close}
            onSubmit={(to) => {
              rename.mutate({ from: dialog.from, to }, { onSuccess: close });
            }}
          />
        );
      case 'delete': {
        const notMerged = isIpcError(remove.error, 'branchNotMerged');
        const failed = remove.error && !notMerged ? remove.error.message : null;
        return (
          <ConfirmDialog
            open
            title={notMerged ? 'Delete unmerged branch?' : 'Delete branch?'}
            description={
              notMerged
                ? `“${dialog.name}” has commits that exist nowhere else. Deleting it loses them.`
                : (failed ??
                  `Delete the local branch “${dialog.name}”? Remote branches are not affected.`)
            }
            confirmLabel={notMerged ? 'Delete anyway' : 'Delete'}
            onCancel={close}
            onConfirm={() => {
              remove.mutate({ name: dialog.name, force: notMerged }, { onSuccess: close });
            }}
          />
        );
      }
    }
  })();

  return {
    checkout: (name) => {
      checkout.mutate(name);
    },
    openCreate: (start, startLabel) => {
      setDialog({ kind: 'create', start, startLabel });
    },
    openRename: (from) => {
      setDialog({ kind: 'rename', from });
    },
    openDelete: (name) => {
      setDialog({ kind: 'delete', name });
    },
    checkoutError: checkout.error?.message ?? null,
    dialogs,
  };
}
