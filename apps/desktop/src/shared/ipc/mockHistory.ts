import type { Result } from './backend';
import type { AppErrorKind } from './bindings';
import type { createMockBranches } from './mockBranches';
import type { createMockWorkingTree } from './mockWorkingTree';

/** Merging this branch stops with conflicts, to show the conflict view. */
const CONFLICTING_BRANCH = 'feature/graph';

const ok = (): Result<null> => ({ status: 'ok', data: null });
const failure = (kind: AppErrorKind, message: string): Result<never> => ({
  status: 'error',
  error: { kind, message },
});

const short = (id: string) => id.slice(0, 7);

/**
 * In-memory graph actions and undo for the browser mock. The mock graph is
 * fixed, so actions change branches and tags but not the drawn history.
 */
export function createMockHistory(
  branches: ReturnType<typeof createMockBranches>,
  workingTree: ReturnType<typeof createMockWorkingTree>,
) {
  let last: { label: string; revert: () => void } | null = null;
  const tags = new Set(['v1.0.0']);

  /** The last undone action; redoing it only brings back its label in the mock. */
  let undone: { label: string } | null = null;
  const remember = (label: string, revert: () => void = () => undefined) => {
    undone = null;
    last = { label, revert };
    return ok();
  };

  return {
    /** Remembers how to undo an action done elsewhere in the mock. */
    remember,
    /** `result`, remembered for Undo under `label` when it succeeded. */
    track: <T>(label: string, result: Result<T>): Result<T> => {
      if (result.status === 'ok') remember(label);
      return result;
    },

    /** Records a checkout so Undo can switch back. */
    trackCheckout: (run: () => Result<null>, name: string): Result<null> => {
      const previous = branches.headName();
      const result = run();
      if (result.status === 'ok' && previous !== name) {
        remember(`Check out ${name}`, () => branches.checkout(previous));
      }
      return result;
    },

    /** Records a branch deletion so Undo can bring it back. */
    trackDelete: (run: () => Result<null>, name: string): Result<null> => {
      const target = branches.targetOf(name);
      const result = run();
      if (result.status === 'ok' && target) {
        remember(`Delete branch ${name}`, () => branches.create(name, target, false));
      }
      return result;
    },

    merge: (branch: string): Result<null> => {
      if (branch === CONFLICTING_BRANCH) {
        workingTree.startConflict('merge');
        return failure(
          'operationConflict',
          'The merge stopped with conflicts. Resolve them in the working copy panel, then continue (or abort).',
        );
      }
      return remember(`Merge ${branch}`);
    },
    rebase: (onto: string) => remember(`Rebase onto ${onto}`),
    rebaseInteractive: (base: string, steps: number): Result<null> =>
      steps === 0
        ? failure('invalidRebasePlan', 'There are no commits to rebase.')
        : remember(`Interactive rebase onto ${short(base)}`),
    cherryPick: (commit: string) => remember(`Cherry-pick ${short(commit)}`),
    cherryPickMany: (commits: readonly string[]) =>
      remember(`Cherry-pick ${String(commits.length)} commits`),
    revert: (commit: string) => remember(`Revert ${short(commit)}`),
    reset: (commit: string) => remember(`Reset to ${short(commit)}`),
    checkoutCommit: (commit: string) => remember(`Check out ${short(commit)}`),

    createTag: (name: string): Result<null> => {
      if (!/^[\w./-]+$/.test(name) || name.includes('..')) {
        return failure('invalidTagName', `"${name}" is not a valid tag name.`);
      }
      if (tags.has(name)) return failure('tagExists', `A tag named "${name}" already exists.`);
      tags.add(name);
      return ok();
    },
    deleteTag: (name: string): Result<null> =>
      tags.delete(name) ? ok() : failure('tagNotFound', `There is no tag named "${name}".`),
    pushTag: (): Result<null> => ok(),

    pendingUndo: (): Result<string | null> => ({ status: 'ok', data: last?.label ?? null }),
    undo: (): Result<string> => {
      if (!last) return failure('nothingToUndo', 'There is nothing to undo.');
      const { label, revert } = last;
      last = null;
      revert();
      undone = { label };
      return { status: 'ok', data: label };
    },
    pendingRedo: (): Result<string | null> => ({ status: 'ok', data: undone?.label ?? null }),
    redo: (): Result<string> => {
      if (!undone) return failure('nothingToRedo', 'There is nothing to redo.');
      const { label } = undone;
      undone = null;
      last = { label, revert: () => undefined };
      return { status: 'ok', data: label };
    },
  };
}
