import { useState, type ReactNode } from 'react';

import { InlinePrompt } from '../../../shared/ui/InlinePrompt/InlinePrompt';
import {
  useAddWorktree,
  useRemoteChange,
  useRemoveWorktree,
  type RemoteRequest,
} from '../api/useLayout';
import { useRemotes } from '../api/useRemotes';
import type { Report } from './useBranchActions';

type Prompt =
  | { kind: 'add' }
  | { kind: 'setUrl'; name: string }
  | { kind: 'remove'; name: string }
  | { kind: 'deleteBranch'; branch: string }
  | { kind: 'removeWorktree'; worktree: string };

export interface RemoteActions {
  openAddRemote: () => void;
  openSetUrl: (name: string) => void;
  /** Asks in the bar first: the remote-tracking branches go with it. */
  openRemove: (name: string) => void;
  /** Asks in the bar first: a deleted remote branch cannot be undone here. */
  openDeleteBranch: (branch: string) => void;
  /** Checks `branch` out in a new worktree and opens it in a tab. */
  addWorktree: (branch: string) => void;
  openRemoveWorktree: (worktree: string) => void;
  prompt: ReactNode;
}

const DONE: Record<RemoteRequest['action'], (request: RemoteRequest) => string> = {
  add: (request) => `Added remote ${'name' in request ? request.name : ''}`,
  setUrl: (request) => `Updated ${'name' in request ? request.name : ''}`,
  remove: (request) => `Removed remote ${'name' in request ? request.name : ''}`,
  deleteBranch: (request) => `Deleted ${'branch' in request ? request.branch : ''} on the remote`,
};

/** Remote and worktree commands, asking in the bar under the header. */
export function useRemoteActions(
  path: string,
  report: Report,
  onOpenRepository: (path: string) => void,
): RemoteActions {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const change = useRemoteChange(path);
  const addWorktree = useAddWorktree(path);
  const removeWorktree = useRemoveWorktree(path);
  const remotes = useRemotes(path);

  const close = () => {
    setPrompt(null);
    change.reset();
    removeWorktree.reset();
  };
  const submit = (request: RemoteRequest) => {
    change.mutate(request, {
      onSuccess: () => {
        report('done', DONE[request.action](request));
        setPrompt(null);
      },
    });
  };
  const error = change.error?.message ?? removeWorktree.error?.message ?? null;

  const bar = (() => {
    switch (prompt?.kind) {
      case undefined:
        return null;
      case 'add': {
        const taken = new Set((remotes.data ?? []).map((remote) => remote.name));
        return (
          <InlinePrompt
            key="add"
            title="Add remote"
            fields={[
              { label: 'Remote name', initial: taken.has('origin') ? 'upstream' : 'origin' },
              {
                label: 'Remote URL',
                initial: '',
                placeholder: 'git@git.example.internal:team/app.git',
              },
            ]}
            submitLabel="Add remote"
            error={error}
            isPending={change.isPending}
            onCancel={close}
            onSubmit={([name = '', url = '']) => {
              submit({ action: 'add', name, url });
            }}
          />
        );
      }
      case 'setUrl': {
        const current = remotes.data?.find((remote) => remote.name === prompt.name)?.url ?? '';
        return (
          <InlinePrompt
            key={`url:${prompt.name}`}
            title={`URL of ${prompt.name}`}
            fields={[{ label: 'Remote URL', initial: current }]}
            submitLabel="Save"
            error={error}
            isPending={change.isPending}
            onCancel={close}
            onSubmit={([url = '']) => {
              submit({ action: 'setUrl', name: prompt.name, url });
            }}
          />
        );
      }
      case 'remove':
        return (
          <InlinePrompt
            key={`remove:${prompt.name}`}
            title={`Remove remote ${prompt.name} and its remote branches from this repository? Nothing changes on the server.`}
            submitLabel="Remove remote"
            danger
            error={error}
            isPending={change.isPending}
            onCancel={close}
            onSubmit={() => {
              submit({ action: 'remove', name: prompt.name });
            }}
          />
        );
      case 'deleteBranch':
        return (
          <InlinePrompt
            key={`delete:${prompt.branch}`}
            title={`Delete ${prompt.branch} on the server for everyone?`}
            submitLabel="Delete on remote"
            danger
            error={error}
            isPending={change.isPending}
            onCancel={close}
            onSubmit={() => {
              submit({ action: 'deleteBranch', branch: prompt.branch });
            }}
          />
        );
      case 'removeWorktree':
        return (
          <InlinePrompt
            key={`worktree:${prompt.worktree}`}
            title={`Remove the worktree at ${prompt.worktree}? Its branch stays.`}
            submitLabel="Remove worktree"
            danger
            error={error}
            isPending={removeWorktree.isPending}
            onCancel={close}
            onSubmit={() => {
              removeWorktree.mutate(prompt.worktree, {
                onSuccess: () => {
                  report('done', `Removed the worktree at ${prompt.worktree}`);
                  setPrompt(null);
                },
              });
            }}
          />
        );
    }
  })();

  return {
    openAddRemote: () => {
      change.reset();
      setPrompt({ kind: 'add' });
    },
    openSetUrl: (name) => {
      change.reset();
      setPrompt({ kind: 'setUrl', name });
    },
    openRemove: (name) => {
      change.reset();
      setPrompt({ kind: 'remove', name });
    },
    openDeleteBranch: (branch) => {
      change.reset();
      setPrompt({ kind: 'deleteBranch', branch });
    },
    addWorktree: (branch) => {
      addWorktree.mutate(branch, {
        onSuccess: (worktree) => {
          report('done', `Checked out ${branch} in ${worktree}`);
          onOpenRepository(worktree);
        },
        onError: (failure) => {
          report('error', failure.message);
        },
      });
    },
    openRemoveWorktree: (worktree) => {
      removeWorktree.reset();
      setPrompt({ kind: 'removeWorktree', worktree });
    },
    prompt: bar,
  };
}
