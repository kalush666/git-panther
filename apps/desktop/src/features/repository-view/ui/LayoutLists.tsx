import * as ContextMenu from '@radix-ui/react-context-menu';
import { Boxes, ChevronDown, ChevronRight, FolderGit2, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type { Submodule } from '../../../shared/ipc';
import { useSubmodules, useUpdateSubmodules, useWorktrees } from '../api/useLayout';
import styles from './BranchSidebar.module.css';
import menu from './menu.module.css';
import type { RemoteActions } from './useRemoteActions';

const STATE_LABEL: Record<Submodule['state'], string> = {
  current: 'up to date',
  notInitialized: 'not cloned',
  outOfDate: 'different commit',
  conflicted: 'conflicted',
};

/** A collapsible sidebar section with an optional action in its header. */
function SidebarSection({
  title,
  icon,
  count,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  count: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <button
          type="button"
          className={styles.sectionHeader}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
          {icon}
          <span className={styles.sectionTitle}>{title}</span>
          <span className={styles.count}>{count}</span>
        </button>
        {action}
      </div>
      {open && children}
    </section>
  );
}

/** Linked worktrees: double-click opens one in a tab. Hidden while there is only the main one. */
export function WorktreeList({
  path,
  actions,
  onOpenRepository,
}: {
  path: string;
  actions: RemoteActions;
  onOpenRepository: (path: string) => void;
}) {
  const worktrees = useWorktrees(path);
  const linked = (worktrees.data ?? []).filter((worktree) => !worktree.isMain);
  if (linked.length === 0) return null;
  return (
    <SidebarSection
      title="Worktrees"
      icon={<FolderGit2 size={13} aria-hidden />}
      count={linked.length}
    >
      <ul className={styles.tree} aria-label="Worktrees">
        {linked.map((worktree) => (
          <li key={worktree.path}>
            <ContextMenu.Root>
              <ContextMenu.Trigger asChild>
                <button
                  type="button"
                  className={styles.row}
                  title={`${worktree.path}\nDouble-click to open`}
                  onDoubleClick={() => {
                    onOpenRepository(worktree.path);
                  }}
                >
                  <span className={styles.name}>{worktree.branch ?? 'detached'}</span>
                </button>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content
                  className={menu.content}
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                  }}
                >
                  <ContextMenu.Item
                    className={menu.item}
                    onSelect={() => {
                      onOpenRepository(worktree.path);
                    }}
                  >
                    Open in a tab
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={`${menu.item} ${menu.danger}`}
                    onSelect={() => {
                      actions.openRemoveWorktree(worktree.path);
                    }}
                  >
                    Remove worktree…
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          </li>
        ))}
      </ul>
    </SidebarSection>
  );
}

/** Submodules with their state, and one click to bring them all up to date. */
export function SubmoduleList({
  path,
  onOpenRepository,
}: {
  path: string;
  onOpenRepository: (path: string) => void;
}) {
  const submodules = useSubmodules(path);
  const update = useUpdateSubmodules(path);
  const list = submodules.data ?? [];
  if (list.length === 0) return null;
  const stale = list.some((submodule) => submodule.state !== 'current');
  return (
    <SidebarSection
      title="Submodules"
      icon={<Boxes size={13} aria-hidden />}
      count={list.length}
      action={
        <button
          type="button"
          className={styles.sectionAction}
          aria-label="Update submodules"
          title={
            stale ? 'Clone and check out every submodule at its recorded commit' : 'All up to date'
          }
          disabled={update.isPending}
          data-attention={stale}
          onClick={() => {
            update.mutate();
          }}
        >
          <RefreshCw size={13} aria-hidden />
        </button>
      }
    >
      <ul className={styles.tree} aria-label="Submodules">
        {list.map((submodule) => (
          <li key={submodule.path}>
            <button
              type="button"
              className={styles.row}
              title={`${submodule.path}: ${STATE_LABEL[submodule.state]}\nDouble-click to open`}
              onDoubleClick={() => {
                if (submodule.state !== 'notInitialized') {
                  onOpenRepository(`${path}/${submodule.path}`);
                }
              }}
            >
              <span className={styles.name}>{submodule.path}</span>
              {submodule.state !== 'current' && (
                <span className={styles.badge}>{STATE_LABEL[submodule.state]}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {update.error && (
        <p className={styles.error} role="alert">
          {update.error.message}
        </p>
      )}
    </SidebarSection>
  );
}
