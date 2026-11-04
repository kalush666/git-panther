import { useState, type ReactNode } from 'react';

import { SignInPrompt } from '../../../shared/accounts';
import { isIpcError, type HostingKind, type PullRequest } from '../../../shared/ipc';
import { InlinePrompt } from '../../../shared/ui/InlinePrompt/InlinePrompt';
import { useBranches } from '../api/useBranches';
import {
  useConnectHosting,
  useConnectHostingWithLogin,
  useCreatePullRequest,
  useHostingStatus,
  usePullRequests,
} from '../api/useHosting';
import type { Report } from './useBranchActions';
import styles from './useBranchActions.module.css';

type Prompt =
  /** An access token, when the server takes no passwords; `reason` says why. */
  | { kind: 'connect'; server: string; reason: string | null }
  /** The git sign-in, when there is none for the server yet. */
  | { kind: 'signIn'; server: string }
  | { kind: 'create' };

/** Servers already tried with the git sign-in, so a refusal is not retried on every render. */
const triedWithLogin = new Set<string>();

/** Branches a merge request usually targets, most likely first. */
const USUAL_TARGETS = ['main', 'master', 'develop'];

export interface HostingActions {
  /**
   * Connects with the git sign-in; asks for the password when there is no
   * sign-in yet, or for an access token when the server takes no passwords.
   */
  openConnect: (server: string) => void;
  /** Tries the git sign-in without asking anything if it does not work. */
  connectQuietly: (server: string) => void;
  /** Asks for a title and target, for a request from the current branch. */
  openCreate: () => void;
  /** Checks out a request's source branch from `origin`. */
  checkoutSource: (request: PullRequest) => void;
  /** Shows a request's changes and conversation in place of the graph. */
  openReview: (request: PullRequest) => void;
  /**
   * "Open merge request" after pushing a branch that has none yet, on a
   * connected server; `null` otherwise.
   */
  offer: { label: string; open: () => void } | null;
  prompt: ReactNode;
}

export function useHostingActions(
  path: string,
  report: Report,
  checkout: (branch: string) => void,
  openReview: (request: PullRequest) => void,
): HostingActions {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [kind, setKind] = useState<HostingKind>('gitLab');
  const connect = useConnectHosting();
  const connectWithLogin = useConnectHostingWithLogin();
  const create = useCreatePullRequest(path);
  const branches = useBranches(path);
  const hostingKind = useHostingStatus(path).data?.kind ?? null;
  const requests = usePullRequests(path, hostingKind !== null);
  // GitLab numbers merge requests !8, GitHub pull requests #8.
  const prefix = hostingKind === 'gitLab' ? '!' : '#';
  const head = branches.data?.find((branch) => branch.kind === 'local' && branch.isHead);
  const locals = (branches.data ?? []).filter((branch) => branch.kind === 'local');
  const target =
    USUAL_TARGETS.find(
      (name) => name !== head?.name && locals.some((branch) => branch.name === name),
    ) ?? 'main';

  const offersRequest =
    hostingKind !== null &&
    head !== undefined &&
    !USUAL_TARGETS.includes(head.name) &&
    requests.data !== undefined &&
    !requests.data.some((request) => request.sourceBranch === head.name);

  const close = () => {
    setPrompt(null);
    connect.reset();
    create.reset();
  };

  const openConnect = (server: string) => {
    triedWithLogin.add(server);
    connect.reset();
    setPrompt(null);
    connectWithLogin.mutate(server, {
      onSuccess: () => {
        report('done', `Connected ${server} with your sign-in`);
      },
      onError: (error) => {
        setPrompt(
          isIpcError(error, 'authenticationFailed')
            ? { kind: 'signIn', server }
            : { kind: 'connect', server, reason: error.message },
        );
      },
    });
  };

  const bar = (() => {
    switch (prompt?.kind) {
      case undefined:
        return null;
      case 'signIn':
        return (
          <SignInPrompt
            key={`signIn:${prompt.server}`}
            server={prompt.server}
            purpose="to see its merge requests"
            repository={path}
            onCancel={close}
            onSignedIn={() => {
              openConnect(prompt.server);
            }}
          />
        );
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
            error={connect.error?.message ?? prompt.reason}
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
    openConnect,
    connectQuietly: (server) => {
      if (triedWithLogin.has(server)) return;
      triedWithLogin.add(server);
      connectWithLogin.mutate(server);
    },
    openCreate: () => {
      create.reset();
      setPrompt({ kind: 'create' });
    },
    checkoutSource: (request) => {
      checkout(`origin/${request.sourceBranch}`);
    },
    openReview,
    offer: offersRequest
      ? {
          label: hostingKind === 'gitLab' ? 'Open merge request' : 'Open pull request',
          open: () => {
            create.reset();
            setPrompt({ kind: 'create' });
          },
        }
      : null,
    prompt: bar,
  };
}
