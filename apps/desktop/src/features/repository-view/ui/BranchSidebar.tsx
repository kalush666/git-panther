import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  EyeOff,
  Folder,
  GitBranch,
  Plus,
  Search,
} from 'lucide-react';
import { useState, type DragEvent } from 'react';

import type { Branch } from '../../../shared/ipc';
import { useBranches } from '../api/useBranches';
import { buildBranchTree, filterBranches, type BranchNode } from '../model/branchTree';
import { useHiddenRefs, useHiddenRefsStore } from '../model/hiddenRefs';
import menu from './menu.module.css';
import styles from './BranchSidebar.module.css';
import { SubmoduleList, WorktreeList } from './LayoutLists';
import { ReviewLists } from './ReviewLists';
import { StashList } from './StashList';
import type { BranchActions } from './useBranchActions';
import type { HistoryActions } from './useHistoryActions';
import type { HostingActions } from './useHostingActions';
import type { RemoteActions } from './useRemoteActions';

/** Drag-and-drop payload: the dragged branch's name. */
const BRANCH_DRAG_TYPE = 'application/x-git-panther-branch';

interface BranchSidebarProps {
  path: string;
  actions: BranchActions;
  history: HistoryActions;
  remoteActions: RemoteActions;
  hostingActions: HostingActions;
  onOpenRepository: (path: string) => void;
}

/** Which branches the graph shows. */
interface Visibility {
  isHidden: (name: string) => boolean;
  toggle: (name: string) => void;
  /** Hides every other branch. */
  solo: (name: string) => void;
}

/** What every branch row can do. */
interface RowActions {
  actions: BranchActions;
  history: HistoryActions;
  visibility: Visibility;
  remoteActions: RemoteActions;
}

export function BranchSidebar({
  path,
  actions,
  history,
  remoteActions,
  hostingActions,
  onOpenRepository,
}: BranchSidebarProps) {
  const branches = useBranches(path);
  const [filter, setFilter] = useState('');
  const all = filterBranches(branches.data ?? [], filter);
  const local = all.filter((branch) => branch.kind === 'local');
  const remote = all.filter((branch) => branch.kind === 'remote');
  const hidden = useHiddenRefs(path);
  const toggleHidden = useHiddenRefsStore((state) => state.toggle);
  const soloBranch = useHiddenRefsStore((state) => state.solo);
  const showAll = useHiddenRefsStore((state) => state.showAll);
  const visibility: Visibility = {
    isHidden: (name) => hidden.includes(name),
    toggle: (name) => {
      toggleHidden(path, name);
    },
    solo: (name) => {
      soloBranch(
        path,
        name,
        (branches.data ?? []).map((branch) => branch.name),
      );
    },
  };

  return (
    <nav className={styles.sidebar} aria-label="Branches">
      <label className={styles.filter}>
        <Search size={13} aria-hidden />
        <input
          className={styles.filterInput}
          placeholder="Filter branches"
          aria-label="Filter branches"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
          }}
        />
      </label>
      {hidden.length > 0 && (
        <button
          type="button"
          className={styles.showAll}
          onClick={() => {
            showAll(path);
          }}
        >
          <EyeOff size={13} aria-hidden />
          {hidden.length} hidden · Show all branches
        </button>
      )}
      <div className={styles.sections}>
        <Section
          title="Local"
          icon={<GitBranch size={13} aria-hidden />}
          branches={local}
          actions={actions}
          history={history}
          visibility={visibility}
          remoteActions={remoteActions}
        />
        <Section
          action={
            <button
              type="button"
              className={styles.sectionAction}
              aria-label="Add remote"
              title="Add remote"
              onClick={remoteActions.openAddRemote}
            >
              <Plus size={13} aria-hidden />
            </button>
          }
          title="Remote"
          icon={<Cloud size={13} aria-hidden />}
          branches={remote}
          actions={actions}
          history={history}
          visibility={visibility}
          remoteActions={remoteActions}
        />
        <ReviewLists path={path} actions={hostingActions} />
        <StashList path={path} />
        <WorktreeList path={path} actions={remoteActions} onOpenRepository={onOpenRepository} />
        <SubmoduleList path={path} onOpenRepository={onOpenRepository} />
      </div>
      {(branches.error ?? actions.checkoutError) && (
        <p className={styles.error} role="alert">
          {branches.error?.message ?? actions.checkoutError}
        </p>
      )}
    </nav>
  );
}

function Section({
  title,
  icon,
  branches,
  actions,
  history,
  visibility,
  remoteActions,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  branches: Branch[];
  /** A button next to the section title, e.g. "Add remote". */
  action?: React.ReactNode;
} & RowActions) {
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
          <span className={styles.count}>{branches.length}</span>
        </button>
        {action}
      </div>
      {open && (
        <ul className={styles.tree} role="tree" aria-label={`${title} branches`}>
          {buildBranchTree(branches).map((node) => (
            <TreeNode
              key={nodeKey(node)}
              node={node}
              depth={0}
              actions={actions}
              history={history}
              visibility={visibility}
              remoteActions={remoteActions}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The first branch inside a folder node, to tell local from remote folders. */
function firstBranch(node: BranchNode): Branch | undefined {
  if (node.kind === 'branch') return node.branch;
  for (const child of node.children) {
    const found = firstBranch(child);
    if (found) return found;
  }
  return undefined;
}

const nodeKey = (node: BranchNode) =>
  node.kind === 'folder' ? `dir:${node.path}` : node.branch.name;

function TreeNode({
  node,
  depth,
  actions,
  history,
  visibility,
  remoteActions,
}: {
  node: BranchNode;
  depth: number;
} & RowActions) {
  const [open, setOpen] = useState(true);
  const indent = { paddingLeft: `calc(var(--gp-space-3) + ${depth} * var(--gp-space-4))` };
  if (node.kind === 'folder') {
    const folderButton = (
      <button
        type="button"
        className={styles.row}
        style={indent}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
        <Folder size={13} aria-hidden />
        <span className={styles.name}>{node.label}</span>
      </button>
    );
    // A top-level folder of remote branches is the remote itself.
    const isRemote = depth === 0 && firstBranch(node)?.kind === 'remote';
    return (
      <li role="treeitem" aria-expanded={open} aria-selected={false}>
        {isRemote ? (
          <ContextMenu.Root>
            <ContextMenu.Trigger asChild>{folderButton}</ContextMenu.Trigger>
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
                    remoteActions.openSetUrl(node.label);
                  }}
                >
                  Edit URL…
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={`${menu.item} ${menu.danger}`}
                  onSelect={() => {
                    remoteActions.openRemove(node.label);
                  }}
                >
                  Remove remote…
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        ) : (
          folderButton
        )}
        {open && (
          <ul role="group" className={styles.tree}>
            {node.children.map((child) => (
              <TreeNode
                key={nodeKey(child)}
                node={child}
                depth={depth + 1}
                actions={actions}
                history={history}
                visibility={visibility}
                remoteActions={remoteActions}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }
  return (
    <BranchRow
      branch={node.branch}
      label={node.label}
      indent={indent}
      actions={actions}
      history={history}
      visibility={visibility}
      remoteActions={remoteActions}
    />
  );
}

function BranchRow({
  branch,
  label,
  indent,
  actions,
  history,
  visibility,
  remoteActions,
}: {
  branch: Branch;
  label: string;
  indent: React.CSSProperties;
} & RowActions) {
  const isLocal = branch.kind === 'local';
  const isHidden = visibility.isHidden(branch.name);
  const [dropTarget, setDropTarget] = useState(false);
  const current = history.currentBranch;
  // Only the checked-out branch accepts drops: merge and rebase act on it.
  const acceptsDrop = (event: DragEvent) =>
    branch.isHead && event.dataTransfer.types.includes(BRANCH_DRAG_TYPE);
  return (
    <li role="treeitem" aria-selected={branch.isHead}>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button
            type="button"
            className={styles.row}
            data-head={branch.isHead}
            data-drop-target={dropTarget}
            data-hidden={isHidden}
            style={indent}
            draggable={!branch.isHead}
            onDragStart={(event) => {
              event.dataTransfer.setData(BRANCH_DRAG_TYPE, branch.name);
              event.dataTransfer.effectAllowed = 'link';
            }}
            onDragOver={(event) => {
              if (!acceptsDrop(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'link';
              setDropTarget(true);
            }}
            onDragLeave={() => {
              setDropTarget(false);
            }}
            onDrop={(event) => {
              setDropTarget(false);
              const source = event.dataTransfer.getData(BRANCH_DRAG_TYPE);
              if (source && source !== branch.name) {
                event.preventDefault();
                history.openCombine(source, event.clientX, event.clientY);
              }
            }}
            title={`${branch.name}${branch.upstream ? ` → ${branch.upstream}` : ''} (double-click to check out)`}
            onDoubleClick={() => {
              actions.checkout(branch.name);
            }}
          >
            <span className={styles.headMark}>
              {branch.isHead && <Check size={12} strokeWidth={2.5} aria-label="checked out" />}
            </span>
            <span className={styles.name}>{label}</span>
            {isHidden && (
              <EyeOff size={12} aria-label="hidden in graph" className={styles.hiddenMark} />
            )}
            {branch.ahead > 0 && (
              <span className={styles.badge} title={`${branch.ahead} to push`}>
                ↑{branch.ahead}
              </span>
            )}
            {branch.behind > 0 && (
              <span className={styles.badge} title={`${branch.behind} to pull`}>
                ↓{branch.behind}
              </span>
            )}
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className={menu.content}
            // Actions may open an input bar; keep focus there, not on the row.
            onCloseAutoFocus={(event) => {
              event.preventDefault();
            }}
          >
            <ContextMenu.Item
              className={menu.item}
              disabled={branch.isHead}
              onSelect={() => {
                actions.checkout(branch.name);
              }}
            >
              Check out {branch.name}
            </ContextMenu.Item>
            <ContextMenu.Item
              className={menu.item}
              onSelect={() => {
                actions.openCreate(branch.target, branch.name);
              }}
            >
              Create branch from here…
            </ContextMenu.Item>
            <ContextMenu.Separator className={menu.separator} />
            <ContextMenu.Item
              className={menu.item}
              onSelect={() => {
                visibility.toggle(branch.name);
              }}
            >
              {isHidden ? 'Show in graph' : 'Hide in graph'}
            </ContextMenu.Item>
            <ContextMenu.Item
              className={menu.item}
              onSelect={() => {
                visibility.solo(branch.name);
              }}
            >
              Show only this branch
            </ContextMenu.Item>
            {!branch.isHead && current && (
              <>
                <ContextMenu.Separator className={menu.separator} />
                <ContextMenu.Item
                  className={menu.item}
                  onSelect={() => {
                    history.run({ action: 'merge', branch: branch.name });
                  }}
                >
                  Merge {branch.name} into {current}
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={menu.item}
                  onSelect={() => {
                    history.run({ action: 'rebase', onto: branch.name });
                  }}
                >
                  Rebase {current} onto {branch.name}
                </ContextMenu.Item>
              </>
            )}
            {isLocal && !branch.isHead && (
              <ContextMenu.Item
                className={menu.item}
                onSelect={() => {
                  remoteActions.addWorktree(branch.name);
                }}
              >
                Open in a new worktree
              </ContextMenu.Item>
            )}
            {!isLocal && (
              <ContextMenu.Item
                className={`${menu.item} ${menu.danger}`}
                onSelect={() => {
                  remoteActions.openDeleteBranch(branch.name);
                }}
              >
                Delete on remote…
              </ContextMenu.Item>
            )}
            {isLocal && (
              <>
                <ContextMenu.Separator className={menu.separator} />
                <ContextMenu.Item
                  className={menu.item}
                  onSelect={() => {
                    actions.openRename(branch.name);
                  }}
                >
                  Rename…
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={`${menu.item} ${menu.danger}`}
                  disabled={branch.isHead}
                  onSelect={() => {
                    actions.remove(branch.name);
                  }}
                >
                  Delete
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </li>
  );
}
