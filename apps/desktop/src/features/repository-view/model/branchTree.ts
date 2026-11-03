import type { Branch } from '../../../shared/ipc';

export interface BranchFolder {
  kind: 'folder';
  /** Path of the folder, e.g. `feature` or `origin/release`. */
  path: string;
  label: string;
  children: BranchNode[];
}

export interface BranchLeaf {
  kind: 'branch';
  label: string;
  branch: Branch;
}

export type BranchNode = BranchFolder | BranchLeaf;

/**
 * Groups branch names by their `/`-separated prefixes, so `feature/login`
 * appears as `login` inside a `feature` folder. Folders come before branches.
 */
export function buildBranchTree(branches: readonly Branch[]): BranchNode[] {
  const root: BranchFolder = { kind: 'folder', path: '', label: '', children: [] };
  for (const branch of branches) {
    const parts = branch.name.split('/');
    let folder = root;
    parts.slice(0, -1).forEach((part, depth) => {
      const path = parts.slice(0, depth + 1).join('/');
      let next = folder.children.find(
        (child): child is BranchFolder => child.kind === 'folder' && child.path === path,
      );
      if (!next) {
        next = { kind: 'folder', path, label: part, children: [] };
        folder.children.push(next);
      }
      folder = next;
    });
    folder.children.push({ kind: 'branch', label: parts.at(-1) ?? branch.name, branch });
  }
  sortTree(root);
  return root.children;
}

function sortTree(folder: BranchFolder) {
  folder.children.sort((a, b) =>
    a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === 'folder' ? -1 : 1,
  );
  for (const child of folder.children) {
    if (child.kind === 'folder') sortTree(child);
  }
}

/** Keeps branches whose full name contains `filter` (case-insensitive). */
export function filterBranches(branches: readonly Branch[], filter: string): Branch[] {
  const needle = filter.trim().toLowerCase();
  return needle
    ? branches.filter((branch) => branch.name.toLowerCase().includes(needle))
    : [...branches];
}
