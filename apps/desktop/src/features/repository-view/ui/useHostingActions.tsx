import { useState, type ReactNode } from 'react';

import type { HostingKind, PullRequest } from '../../../shared/ipc';
import { InlinePrompt } from '../../../shared/ui/InlinePrompt/InlinePrompt';
import { useBranches } from '../api/useBranches';
import { useConnectHosting, useCreatePullRequest, useHostingStatus } from '../api/useHosting';
import type { Report } from './useBranchActions';
import styles from './useBranchActions.module.css';

type Prompt = { kind: 'connect'; server: string } | { kind: 'create' };

/** Branches a merge request usually targets, most likely first. */
const USUAL_TARGETS = ['main', 'master', 'develop'];

export interface HostingActions {
  openConnect: (server: string) => void;
  /** Asks for a title and target, for a request from the current branch. */
  openCreate: () => void;
  /** Checks out a request's source branch from `origin`. */
  checkoutSource: (request: PullRequest) => void;
  prompt: ReactNode;
}

export function useHostingActions(
  path: string,
  report: Report,
  checkout: (branch: string) => void,
): HostingActions {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [kind, setKind] = useState<HostingKind>('gitLab');
  const connect = useConnectHosting();
  const create = useCreatePullRequest(path);
  const branches = useBranches(path);
  // GitLab numbers merge requests !8, GitHub pull requests #8.
  const prefix = useHostingStatus(path).data?.kind === 'gitLab' ? '!' : '#';
  const head = branches.data?.find((branch) => branch.kind === 'local' && branch.isHead);
  const locals = (branches.data ?? []).filter((branch) => branch.kind === 'local');
  const target =
    USUAL_TARGETS.find(
      (name) => name !== head?.name && locals.some((branch) => branch.name === name),
    ) ?? 'main';

  const close = () => {
    setPrompt(null);
    connect.reset();
    create.reset();
  };

  const bar = (() => {
    switch (prompt?.kind) {
      case undefined:
        return null;
      case 'connect':
        return (
          <InlinePrompt
            key={`connect:${prompt.server}`}
            title={`Connect ${prompt.server} with an access token (API scope)`}
            fields={[{ label: 'Access token', initial: '', placeholder: 'glpat-…' }]}
            extra={
              <select
                className={styles.switch}
                aria-label="Server type"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value === 'gitHub' ? 'gitHub' : 'gitLab');
                }}
              >
                <option value="gitLab">GitLab</option>
                <option value="gitHub">GitHub Enterprise</option>
              </select>
            }
            submitLabel="Connect"
            error={connect.error?.message ?? null}
            isPending={connect.isPending}
            onCancel={close}
            onSubmit={([token = '']) => {
              connect.mutate(
                { server: prompt.server, kind, token },
                {
                  onSuccess: () => {
                    report('done', `Connected ${prompt.server}`);
                    setPrompt(null);
                  },
                },
              );
            }}
          />
        );
      case 'create':
        return (
          <InlinePrompt
            key="create"
            title={`New request from ${head?.name ?? 'HEAD'}`}
            fields={[
              { label: 'Title', initial: head?.name.replace(/[-_/]+/g, ' ') ?? '' },
              { label: 'Target branch', initial: target },
            ]}
            submitLabel="Open request"
            error={create.error?.message ?? null}
            isPending={create.isPending}
            onCancel={close}
            onSubmit={([title = '', into = '']) => {
              if (!head) return;
              create.mutate(
                { source: head.name, target: into, title },
                {
                  onSuccess: (request) => {
                    void navigator.clipboard.writeText(request.url).catch(() => undefined);
                    report('done', `Opened ${prefix}${String(request.number)} — link copied`);
                    setPrompt(null);
                  },
                },
              );
            }}
          />
        );
    }
  })();

  return {
    openConnect: (server) => {
      connect.reset();
      setPrompt({ kind: 'connect', server });
    },
    openCreate: () => {
      create.reset();
      setPrompt({ kind: 'create' });
    },
    checkoutSource: (request) => {
      checkout(`origin/${request.sourceBranch}`);
    },
    prompt: bar,
  };
}
