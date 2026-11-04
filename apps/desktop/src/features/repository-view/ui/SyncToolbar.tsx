import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, RefreshCw, X } from 'lucide-react';

import { useState } from 'react';

import { serverOf, SignInDialog } from '../../../shared/accounts';
import { isIpcError } from '../../../shared/ipc';
import { PULL_STRATEGIES, usePullStrategyStore } from '../../../shared/preferences/pullStrategy';
import { Button } from '../../../shared/ui/Button/Button';
import { useBranches } from '../api/useBranches';
import { useRemotes } from '../api/useRemotes';
import { useSync, type SyncAction } from '../api/useSync';
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

/** Fetch, Pull and Push for the open repository, with progress and errors. */
export function SyncToolbar({ path }: { path: string }) {
  const sync = useSync(path);
  const branches = useBranches(path);
  const strategy = usePullStrategyStore((state) => state.strategy);
  const setStrategy = usePullStrategyStore((state) => state.setStrategy);
  const head = branches.data?.find((branch) => branch.isHead);
  const busy = sync.running !== null;

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
      </div>
      <SyncStatus path={path} sync={sync} />
    </div>
  );
}

function SyncStatus({ path, sync }: { path: string; sync: ReturnType<typeof useSync> }) {
  const remotes = useRemotes(path);
  const [signingIn, setSigningIn] = useState(false);
  const server =
    remotes.data?.map((remote) => serverOf(remote.url)).find((found) => found !== null) ?? '';

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
  if (sync.error && !isIpcError(sync.error, 'cancelled')) {
    return (
      <div className={styles.error} role="alert">
        <span className={styles.errorText} title={sync.error.message}>
          {sync.error.message}
        </span>
        {isIpcError(sync.error, 'authenticationFailed') && (
          <Button
            size="sm"
            variant="secondary"
            className={styles.errorAction}
            onClick={() => {
              setSigningIn(true);
            }}
          >
            Sign in…
          </Button>
        )}
        {signingIn && (
          <SignInDialog
            initialServer={server}
            repository={path}
            onCancel={() => {
              setSigningIn(false);
            }}
            onSignedIn={() => {
              setSigningIn(false);
              sync.retry();
            }}
          />
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
      <p className={styles.done} role="status">
        {DONE_LABEL[sync.succeeded]}
      </p>
    );
  }
  return null;
}
