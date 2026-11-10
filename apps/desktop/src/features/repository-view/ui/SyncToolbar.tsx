import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, RefreshCw, X } from 'lucide-react';

import { useEffect } from 'react';

import { serverOf, SignInPrompt } from '../../../shared/accounts';
import { useCommands } from '../../../shared/commands';
import { ipc, isIpcError } from '../../../shared/ipc';
import { useAutoFetchStore } from '../../../shared/preferences/autoFetch';
import { PULL_STRATEGIES, usePullStrategyStore } from '../../../shared/preferences/pullStrategy';
import { Button } from '../../../shared/ui/Button/Button';
import { ConfirmButton } from '../../../shared/ui/ConfirmButton/ConfirmButton';
import { useBranches } from '../api/useBranches';
import { useRemotes } from '../api/useRemotes';
import { repositoryQueryKey } from '../api/useRepository';
import type { useSync, SyncAction } from '../api/useSync';
import menu from './menu.module.css';
import styles from './SyncToolbar.module.css';

const RUNNING_LABEL: Record<SyncAction, string> = {
  fetch: 'Fetching',
  pull: 'Pulling',
  push: 'Pushing',
};

const DONE_LABEL: Record<SyncAction, string> = {
  fetch: 'Fetched',
  pull: 'Pulled',
  push: 'Pushed',
};

const ICON_SIZE = 14;

type Sync = ReturnType<typeof useSync>;

/** Fetch, Pull and Push for the open repository, with progress and errors. */
/** Offered after a push of a branch that has no open request yet. */
export interface RequestOffer {
  label: string;
  open: () => void;
}

export function SyncToolbar({
  path,
  sync,
  offer,
}: {
  path: string;
  sync: Sync;
  offer: RequestOffer | null;
}) {
  useAutoFetch(path, sync.running === null);
  const branches = useBranches(path);
  const strategy = usePullStrategyStore((state) => state.strategy);
  const setStrategy = usePullStrategyStore((state) => state.setStrategy);
  const head = branches.data?.find((branch) => branch.isHead);
  const remotes = useRemotes(path);
  const busy = sync.running !== null;
  useCommands(`sync:${path}`, [
    {
      id: 'repository.fetch',
      title: 'Fetch',
      group: 'Repository',
      enabled: !busy,
      run: () => {
        sync.run({ action: 'fetch' });
      },
    },
    {
      id: 'repository.pull',
      title: 'Pull',
      group: 'Repository',
      enabled: !busy,
      run: () => {
        sync.run({ action: 'pull', strategy: usePullStrategyStore.getState().strategy });
      },
    },
    {
      id: 'repository.push',
      title: 'Push',
      group: 'Repository',
      enabled: !busy,
      run: () => {
        sync.run({ action: 'push' });
      },
    },
    {
      id: 'repository.forcePush',
      title: 'Force push (safe, with lease)',
      group: 'Repository',
      enabled: !busy,
      run: () => {
        sync.run({ action: 'push', options: { forceWithLease: true } });
      },
    },
  ]);

  return (
    <div className={styles.toolbar}>
      <div className={styles.actions} role="group" aria-label="Sync with remotes">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            sync.run({ action: 'fetch' });
          }}
        >
          <RefreshCw size={ICON_SIZE} aria-hidden />
          Fetch
        </Button>
        <div className={styles.split}>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            title={`Pull (${PULL_STRATEGIES.find(({ id }) => id === strategy)?.label ?? ''})`}
            onClick={() => {
              sync.run({ action: 'pull', strategy });
            }}
          >
            <ArrowDownToLine size={ICON_SIZE} aria-hidden />
            Pull
            {head && head.behind > 0 ? (
              <span className={styles.count} aria-label={`${head.behind} to pull`}>
                {head.behind}
              </span>
            ) : null}
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className={styles.splitTrigger}
              disabled={busy}
              aria-label="Choose how to pull"
            >
              <ChevronDown size={ICON_SIZE} aria-hidden />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className={menu.content} align="start" sideOffset={6}>
                <DropdownMenu.RadioGroup
                  value={strategy}
                  onValueChange={(value) => {
                    const chosen = PULL_STRATEGIES.find(({ id }) => id === value);
                    if (chosen) setStrategy(chosen.id);
                  }}
                >
                  {PULL_STRATEGIES.map(({ id, label, hint }) => (
                    <DropdownMenu.RadioItem key={id} value={id} className={menu.item} title={hint}>
                      <span className={styles.check}>
                        <DropdownMenu.ItemIndicator>
                          <Check size={ICON_SIZE} strokeWidth={2} />
                        </DropdownMenu.ItemIndicator>
                      </span>
                      {label}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
        <div className={styles.split}>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              sync.run({ action: 'push' });
            }}
          >
            <ArrowUpFromLine size={ICON_SIZE} aria-hidden />
            Push
            {head && head.ahead > 0 ? (
              <span className={styles.count} aria-label={`${head.ahead} to push`}>
                {head.ahead}
              </span>
            ) : null}
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className={styles.splitTrigger}
              disabled={busy}
              aria-label="More ways to push"
            >
              <ChevronDown size={ICON_SIZE} aria-hidden />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className={menu.content} align="end" sideOffset={6}>
                <DropdownMenu.Item
                  className={menu.item}
                  title="Overwrites the remote branch, but only if nobody pushed to it since your last fetch"
                  onSelect={() => {
                    sync.run({ action: 'push', options: { forceWithLease: true } });
                  }}
                >
                  Force push (safe, with lease)
                </DropdownMenu.Item>
                {(remotes.data ?? []).map((remote) => (
                  <DropdownMenu.Item
                    key={remote.name}
                    className={menu.item}
                    onSelect={() => {
                      sync.run({ action: 'push', options: { remote: remote.name } });
                    }}
                  >
                    Push to {remote.name}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
      <SyncStatus path={path} sync={sync} offer={offer} />
    </div>
  );
}

/** The HTTPS server of the repository's remotes, if it has one. */
function useRemoteServer(path: string): string | null {
  const remotes = useRemotes(path);
  return (
    remotes.data?.map((remote) => serverOf(remote.url)).find((found) => found !== null) ?? null
  );
}

/** True when the last sync was refused and the sign-in bar is asking instead. */
function asksToSignIn(sync: Sync, server: string | null): server is string {
  return server !== null && sync.running === null && isIpcError(sync.error, 'authenticationFailed');
}

/**
 * Shown under the header when the server refused a fetch, pull or push: just
 * the personal number and password, then the same sync runs again.
 */
export function SyncSignIn({ path, sync }: { path: string; sync: Sync }) {
  const server = useRemoteServer(path);
  const action = sync.error ? sync.attempted : null;
  if (!asksToSignIn(sync, server) || action === null) return null;
  return (
    <SignInPrompt
      key={server}
      server={server}
      purpose={`to ${action}`}
      repository={path}
      onCancel={sync.dismiss}
      onSignedIn={sync.retry}
    />
  );
}

function SyncStatus({
  path,
  sync,
  offer,
}: {
  path: string;
  sync: Sync;
  offer: RequestOffer | null;
}) {
  const server = useRemoteServer(path);

  if (sync.running) {
    const percent = sync.progress?.percent;
    return (
      <div className={styles.status} role="status">
        <span>
          {RUNNING_LABEL[sync.running]}
          {sync.progress ? ` · ${sync.progress.phase}` : '…'}
          {percent != null ? ` ${percent}%` : ''}
        </span>
        <Button size="sm" variant="ghost" onClick={sync.cancel}>
          Cancel
        </Button>
      </div>
    );
  }
  if (asksToSignIn(sync, server)) return null;
  if (sync.error && !isIpcError(sync.error, 'cancelled')) {
    return (
      <div className={styles.error} role="alert">
        <span className={styles.errorText} title={sync.error.message}>
          {sync.error.message}
        </span>
        {isIpcError(sync.error, 'pushRejected') && (
          <ConfirmButton
            variant="secondary"
            confirmLabel="Overwrite the remote branch?"
            onConfirm={() => {
              sync.run({ action: 'push', options: { forceWithLease: true } });
            }}
          >
            Force push
          </ConfirmButton>
        )}
        <button
          type="button"
          className={styles.dismiss}
          aria-label="Dismiss"
          onClick={() => {
            sync.dismiss();
          }}
        >
          <X size={ICON_SIZE} aria-hidden />
        </button>
      </div>
    );
  }
  if (sync.succeeded) {
    return (
      <SyncDone
        label={DONE_LABEL[sync.succeeded]}
        offer={sync.succeeded === 'push' ? offer : null}
        onDone={sync.dismiss}
      />
    );
  }
  return null;
}

/** How long "Fetched" / "Pushed" stays before it clears itself. */
const DONE_MS = 4_000;
/** Longer when it offers to open a request, so there is time to click. */
const OFFER_MS = 12_000;

function SyncDone({
  label,
  offer,
  onDone,
}: {
  label: string;
  offer: RequestOffer | null;
  onDone: () => void;
}) {
  const hasOffer = offer !== null;
  useEffect(() => {
    const timer = setTimeout(onDone, hasOffer ? OFFER_MS : DONE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [onDone, hasOffer]);
  return (
    <>
      <p className={styles.done} role="status">
        {label}
      </p>
      {offer && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            onDone();
            offer.open();
          }}
        >
          {offer.label}
        </Button>
      )}
    </>
  );
}

/**
 * Fetches quietly every few minutes (as set in Settings) while the window is
 * visible, so to-pull counts stay current without a click.
 */
function useAutoFetch(path: string, idle: boolean) {
  const minutes = useAutoFetchStore((state) => state.minutes);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (minutes === 0 || !idle) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void ipc
        .fetchRemotes(path, crypto.randomUUID(), () => undefined)
        .then((result) => {
          if (result.status === 'ok') {
            void queryClient.invalidateQueries({ queryKey: repositoryQueryKey(path) });
          }
        });
    }, minutes * 60_000);
    return () => {
      clearInterval(timer);
    };
  }, [path, minutes, idle, queryClient]);
}
