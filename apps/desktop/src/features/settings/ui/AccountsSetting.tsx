import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccounts, useSignOut } from '../../../shared/accounts';
import { ipc, unwrap } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import styles from './SettingsView.module.css';

/** Servers the user signed in to, with sign-in and sign-out. */
export function AccountsSetting() {
  const accounts = useAccounts();
  const signOut = useSignOut();
  const list = accounts.data ?? [];

  return (
    <div className={styles.gitSetting}>
      {list.length === 0 ? (
        <p className={styles.hint}>
          Not signed in to any server. Git Panther asks for your personal number and password the
          first time a server needs them.
        </p>
      ) : (
        <ul className={styles.accounts} aria-label="Accounts">
          {list.map((account) => (
            <li key={`${account.server} ${account.username}`} className={styles.account}>
              <span className={styles.accountName}>
                <strong>{account.username}</strong>
                <span className={styles.hint}>{account.server}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={signOut.isPending}
                onClick={() => {
                  signOut.mutate(account);
                }}
              >
                Sign out
              </Button>
            </li>
          ))}
        </ul>
      )}
      {(accounts.error ?? signOut.error) && (
        <p className={styles.status} data-tone="error" role="alert">
          {(accounts.error ?? signOut.error)?.message}
        </p>
      )}
      <HostingConnections />
    </div>
  );
}

/** Code review servers connected with an access token, for merge requests and issues. */
function HostingConnections() {
  const queryClient = useQueryClient();
  const connections = useQuery({
    queryKey: ['hosting', 'connections'],
    queryFn: async () => unwrap(await ipc.listHosting()),
  });
  const disconnect = useMutation({
    mutationFn: async (server: string) => unwrap(await ipc.disconnectHosting(server)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['hosting'] }),
  });
  const list = connections.data ?? [];
  if (list.length === 0) return null;
  return (
    <ul className={styles.accounts} aria-label="Code review servers">
      {list.map((access) => (
        <li key={access.server} className={styles.account}>
          <span className={styles.accountName}>
            <strong>{access.kind === 'gitLab' ? 'GitLab' : 'GitHub Enterprise'}</strong>
            <span className={styles.hint}>{access.server} · access token</span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={disconnect.isPending}
            onClick={() => {
              disconnect.mutate(access.server);
            }}
          >
            Disconnect
          </Button>
        </li>
      ))}
    </ul>
  );
}
