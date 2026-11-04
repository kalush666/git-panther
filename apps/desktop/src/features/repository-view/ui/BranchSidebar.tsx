import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  EyeOff,
  Folder,
  GitBranch,
  Search,
} from 'lucide-react';
import { useState, type DragEvent } from 'react';

import type { Branch } from '../../../shared/ipc';
import { useBranches } from '../api/useBranches';
import { buildBranchTree, filterBranches, type BranchNode } from '../model/branchTree';
import { useHiddenRefs, useHiddenRefsStore } from '../model/hiddenRefs';
import menu from './menu.module.css';
import styles from './BranchSidebar.module.css';
import { StashList } from './StashList';
import type { BranchActions } from './useBranchActions';
import type { HistoryActions } from './useHistoryActions';

/** Drag-and-drop payload: the dragged branch's name. */
const BRANCH_DRAG_TYPE = 'application/x-git-panther-branch';

interface BranchSidebarProps {
  path: string;
  actions: BranchActions;
  history: HistoryActions;
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
}

export function BranchSidebar({ path, actions, history }: BranchSidebarProps) {
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
        />
        <Section
          title="Remote"
          icon={<Cloud size={13} aria-hidden />}
          branches={remote}
          actions={actions}
          history={history}
          visibility={visibility}
        />
        <StashList path={path} />
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
}: {
  title: string;
  icon: React.ReactNode;
  branches: Branch[];
} & RowActions) {
  const [open, setOpen] = useState(true);
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
        {icon}
        <span className={styles.sectionTitle}>{title}</span>
        <span className={styles.count}>{branches.length}</span>
      </button>
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
            />
          ))}
        </ul>
      )}
    </section>
  );
}

const nodeKey = (node: BranchNode) =>
  node.kind === 'folder' ? `dir:${node.path}` : node.branch.name;

function TreeNode({
  node,
  depth,
  actions,
  history,
  visibility,
}: {
  node: BranchNode;
  depth: number;
} & RowActions) {
  const [open, setOpen] = useState(true);
  const indent = { paddingLeft: `calc(var(--gp-space-3) + ${depth} * var(--gp-space-4))` };
  if (node.kind === 'folder') {
    return (
      <li role="treeitem" aria-expanded={open} aria-selected={false}>
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
                history.openCombine(source);
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
          <ContextMenu.Content className={menu.content}>
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
                    actions.openDelete(branch.name);
                  }}
                >
                  Delete…
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </li>
  );
}
