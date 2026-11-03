import { describe, expect, it } from 'vitest';

import type { Branch } from '../../../shared/ipc';
import { buildBranchTree, filterBranches, type BranchNode } from './branchTree';

const branch = (name: string): Branch => ({
  name,
  kind: 'local',
  target: 'a'.repeat(40),
  upstream: null,
  ahead: 0,
  behind: 0,
  isHead: false,
});

/** A compact text picture of the tree, e.g. `feature/[login]`. */
function outline(nodes: BranchNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'branch'
      ? [`[${node.label}]`]
      : [node.label + '/', ...outline(node.children).map((line) => `  ${line}`)],
  );
}

describe('buildBranchTree', () => {
  it('groups by prefix with folders first', () => {
    const tree = buildBranchTree(
      ['main', 'feature/login', 'feature/ui/graph', 'develop'].map(branch),
    );
    expect(outline(tree)).toEqual([
      'feature/',
      '  ui/',
      '    [graph]',
      '  [login]',
      '[develop]',
      '[main]',
    ]);
  });
});

describe('filterBranches', () => {
  it('matches anywhere in the full name, ignoring case', () => {
    const names = filterBranches(
      ['main', 'feature/Login', 'fix/login-bug'].map(branch),
      'LOGIN',
    ).map((match) => match.name);
    expect(names).toEqual(['feature/Login', 'fix/login-bug']);
  });
});
