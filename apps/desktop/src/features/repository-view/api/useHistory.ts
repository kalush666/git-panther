import { useQuery } from '@tanstack/react-query';

import { ipc, unwrap, type RebaseStep, type ResetMode } from '../../../shared/ipc';
import { repositoryQueryKey } from './useRepository';
import { useRepositoryMutation } from './useRepositoryMutation';

/** One graph action, as the menus and drag-and-drop ask for it. */
export type HistoryRequest =
  | { action: 'merge'; branch: string }
  | { action: 'rebase'; onto: string; label?: string }
  | { action: 'fastForward'; target: string; source: string }
  /** Pushes local `source` to branch `target` on `remote`. */
  | { action: 'pushTo'; source: string; remote: string; target: string }
  | {
      action: 'rebaseInteractive';
      base: string;
      label: string;
      steps: RebaseStep[];
      /** What to report instead of the generic rebase message. */
      done?: string;
    }
  | { action: 'cherryPick'; commit: string; label: string }
  /** Oldest first. */
  | { action: 'cherryPickMany'; commits: string[] }
  | { action: 'revert'; commit: string; label: string }
  | { action: 'reset'; commit: string; label: string; mode: ResetMode }
  | { action: 'checkoutCommit'; commit: string; label: string }
  | { action: 'createTag'; name: string; target: string; message: string | null }
  | { action: 'deleteTag'; name: string }
  | { action: 'deleteRemoteTag'; name: string }
  | { action: 'pushTag'; name: string };

function send(path: string, request: HistoryRequest) {
  switch (request.action) {
    case 'merge':
      return ipc.mergeBranch(path, request.branch);
    case 'rebase':
      return ipc.rebaseOnto(path, request.onto);
    case 'fastForward':
      return ipc.fastForwardBranch(path, request.target, request.source);
    case 'pushTo':
      return ipc.pushBranch(
        path,
        { remote: request.remote, source: request.source, target: request.target },
        crypto.randomUUID(),
        () => undefined,
      );
    case 'rebaseInteractive':
      return ipc.rebaseInteractive(path, request.base, request.steps);
    case 'cherryPick':
      return ipc.cherryPick(path, request.commit);
    case 'cherryPickMany':
      return ipc.cherryPickMany(path, request.commits);
    case 'revert':
      return ipc.revertCommit(path, request.commit);
    case 'reset':
      return ipc.resetToCommit(path, request.commit, request.mode);
    case 'checkoutCommit':
      return ipc.checkoutCommit(path, request.commit);
    case 'createTag':
      return ipc.createTag(path, request.name, request.target, request.message);
    case 'deleteTag':
      return ipc.deleteTag(path, request.name);
    case 'deleteRemoteTag':
      return ipc.deleteRemoteTag(path, request.name);
    case 'pushTag':
      return ipc.pushTag(path, request.name);
  }
}

/** What a finished request did, in words for the status line. */
/** What the banner says while `request` runs. */
export function describeRunning(request: HistoryRequest): string {
  switch (request.action) {
    case 'merge':
      return `Merging ${request.branch}…`;
    case 'rebase':
      return `Rebasing onto ${request.label ?? request.onto}…`;
    case 'fastForward':
      return `Fast-forwarding ${request.target} to ${request.source}…`;
    case 'pushTo':
      return `Pushing ${request.source} to ${request.remote}/${request.target}…`;
    case 'rebaseInteractive':
      return `Rewriting the commits after ${request.label}…`;
    case 'cherryPick':
      return `Cherry-picking ${request.label}…`;
    case 'cherryPickMany':
      return `Cherry-picking ${String(request.commits.length)} commits…`;
    case 'revert':
      return `Reverting ${request.label}…`;
    case 'reset':
      return `Resetting to ${request.label}…`;
    case 'checkoutCommit':
      return `Checking out ${request.label}…`;
    case 'createTag':
      return `Creating tag ${request.name}…`;
    case 'deleteTag':
      return `Deleting tag ${request.name}…`;
    case 'deleteRemoteTag':
      return `Deleting tag ${request.name} from the remote…`;
    case 'pushTag':
      return `Pushing tag ${request.name}…`;
  }
}

export function describeDone(request: HistoryRequest): string {
  switch (request.action) {
    case 'merge':
      return `Merged ${request.branch}`;
    case 'rebase':
      return `Rebased onto ${request.label ?? request.onto}`;
    case 'fastForward':
      return `Fast-forwarded ${request.target} to ${request.source}`;
    case 'pushTo':
      return `Pushed ${request.source} to ${request.remote}/${request.target}`;
    case 'rebaseInteractive':
      return request.done ?? `Rebased the commits after ${request.label}`;
    case 'cherryPick':
      return `Cherry-picked ${request.label}`;
    case 'cherryPickMany':
      return `Cherry-picked ${String(request.commits.length)} commits`;
    case 'revert':
      return `Reverted ${request.label}`;
    case 'reset':
      return `Reset to ${request.label} (${request.mode})`;
    case 'checkoutCommit':
      return `Checked out ${request.label}`;
    case 'createTag':
      return `Created tag ${request.name}`;
    case 'deleteTag':
      return `Deleted tag ${request.name}`;
    case 'deleteRemoteTag':
      return `Deleted tag ${request.name} from the remote`;
    case 'pushTag':
      return `Pushed tag ${request.name}`;
  }
}

export function useHistoryAction(path: string) {
  return useRepositoryMutation(path, (request: HistoryRequest) => send(path, request));
}

/** What Undo would revert, e.g. "Merge topic". */
export function usePendingUndo(path: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'undo'],
    queryFn: async () => unwrap(await ipc.pendingUndo(path)),
  });
}

export function useUndo(path: string) {
  return useRepositoryMutation(path, () => ipc.undo(path));
}

/** What Redo would do again, e.g. "Merge topic". */
export function usePendingRedo(path: string) {
  return useQuery({
    queryKey: [...repositoryQueryKey(path), 'redo'],
    queryFn: async () => unwrap(await ipc.pendingRedo(path)),
  });
}

export function useRedo(path: string) {
  return useRepositoryMutation(path, () => ipc.redo(path));
}
