import type { AppErrorKind } from './bindings';
import type { Branch, Result } from './backend';

const TIP = 'a'.repeat(40);

function initialBranches(): Branch[] {
  const local = (name: string, extra: Partial<Branch> = {}): Branch => ({
    name,
    kind: 'local',
    target: TIP,
    upstream: null,
    ahead: 0,
    behind: 0,
    isHead: false,
    ...extra,
  });
  const remote = (name: string): Branch => ({ ...local(name), kind: 'remote' });
  return [
    local('main', { isHead: true, upstream: 'origin/main' }),
    local('develop', { upstream: 'origin/develop', ahead: 1, behind: 2 }),
    local('feature/graph'),
    local('feature/login'),
    remote('origin/develop'),
    remote('origin/main'),
    remote('origin/release/1.0'),
  ];
}

const ok = (): Result<null> => ({ status: 'ok', data: null });
const failure = (kind: AppErrorKind, message: string): Result<null> => ({
  status: 'error',
  error: { kind, message },
});

/** In-memory branches for the browser mock. */
export function createMockBranches() {
  let branches = initialBranches();

  const local = (name: string) =>
    branches.find((branch) => branch.kind === 'local' && branch.name === name);
  const switchTo = (name: string) => {
    branches = branches.map((branch) => ({
      ...branch,
      isHead: branch.kind === 'local' && branch.name === name,
    }));
  };
  const sorted = () =>
    [...branches].sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'local' ? -1 : 1,
    );

  return {
    list: (): Result<Branch[]> => ({ status: 'ok', data: sorted() }),

    create: (name: string, start: string, checkout: boolean): Result<null> => {
      if (/\s|\.\./.test(name) || name.trim() === '') {
        return failure('invalidBranchName', `"${name}" is not a valid branch name.`);
      }
      if (local(name)) {
        return failure('branchExists', `A branch named "${name}" already exists.`);
      }
      branches.push({
        name,
        kind: 'local',
        target: start,
        upstream: null,
        ahead: 0,
        behind: 0,
        isHead: false,
      });
      if (checkout) switchTo(name);
      return ok();
    },

    checkout: (name: string): Result<null> => {
      if (local(name)) {
        switchTo(name);
        return ok();
      }
      const remote = branches.find((branch) => branch.kind === 'remote' && branch.name === name);
      if (!remote) {
        return failure('branchNotFound', `There is no branch named "${name}".`);
      }
      const localName = name.slice(name.indexOf('/') + 1);
      if (!local(localName)) {
        branches.push({ ...remote, name: localName, kind: 'local', upstream: name });
      }
      switchTo(localName);
      return ok();
    },

    rename: (from: string, to: string): Result<null> => {
      const branch = local(from);
      if (!branch) return failure('branchNotFound', `There is no branch named "${from}".`);
      if (local(to)) return failure('branchExists', `A branch named "${to}" already exists.`);
      branch.name = to;
      return ok();
    },

    delete: (name: string, force: boolean): Result<null> => {
      const branch = local(name);
      if (!branch) return failure('branchNotFound', `There is no branch named "${name}".`);
      if (branch.isHead) {
        return failure(
          'cannotDeleteCurrentBranch',
          `"${name}" is checked out. Switch to another branch before deleting it.`,
        );
      }
      if (name === 'feature/graph' && !force) {
        return failure(
          'branchNotMerged',
          `"${name}" has commits that are not merged anywhere else. Delete it anyway to lose them.`,
        );
      }
      branches = branches.filter((candidate) => candidate !== branch);
      return ok();
    },
  };
}
