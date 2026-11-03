import * as ContextMenu from '@radix-ui/react-context-menu';
import { Archive, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { Stash } from '../../../shared/ipc';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog/ConfirmDialog';
import { useApplyStash, useDropStash, useStashes } from '../api/useStashes';
import styles from './BranchSidebar.module.css';
import menu from './menu.module.css';

/** The sidebar's Stashes section: apply, pop or drop entries from their menu. */
export function StashList({ path }: { path: string }) {
  const stashes = useStashes(path);
  const apply = useApplyStash(path);
  const drop = useDropStash(path);
  const [open, setOpen] = useState(true);
  const [pendingDrop, setPendingDrop] = useState<Stash | null>(null);
  const entries = stashes.data ?? [];
  const error = stashes.error ?? apply.error ?? drop.error;

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        <Archive size={13} aria-hidden />
        <span className={styles.sectionTitle}>Stashes</span>
        <span className={styles.count}>{entries.length}</span>
      </button>
      {open && (
        <ul className={styles.tree} aria-label="Stashes">
          {entries.map((stash) => (
            <li key={stash.id}>
              <ContextMenu.Root>
                <ContextMenu.Trigger asChild>
                  <button
                    type="button"
                    className={styles.row}
                    title={`${stash.message}\nDouble-click to apply`}
                    onDoubleClick={() => {
                      apply.mutate({ index: stash.index, pop: false });
                    }}
                  >
                    <span className={styles.name}>{stash.message}</span>
                  </button>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content className={menu.content}>
                    <ContextMenu.Item
                      className={menu.item}
                      onSelect={() => {
                        apply.mutate({ index: stash.index, pop: false });
                      }}
                    >
                      Apply stash
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className={menu.item}
                      onSelect={() => {
                        apply.mutate({ index: stash.index, pop: true });
                      }}
                    >
                      Pop stash
                    </ContextMenu.Item>
                    <ContextMenu.Separator className={menu.separator} />
                    <ContextMenu.Item
                      className={`${menu.item} ${menu.danger}`}
                      onSelect={() => {
                        setPendingDrop(stash);
                      }}
                    >
                      Drop stash…
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      )}
      <ConfirmDialog
        open={pendingDrop !== null}
        title="Drop stash?"
        description={
          <>
            <strong>{pendingDrop?.message}</strong> will be deleted. Its changes are lost unless you
            applied them.
          </>
        }
        confirmLabel="Drop"
        onCancel={() => {
          setPendingDrop(null);
        }}
        onConfirm={() => {
          if (pendingDrop) drop.mutate(pendingDrop.index);
          setPendingDrop(null);
        }}
      />
    </section>
  );
}
