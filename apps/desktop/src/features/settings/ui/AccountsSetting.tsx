import { useState } from 'react';

import { SignInDialog, useAccounts, useSignOut } from '../../../shared/accounts';
import { Button } from '../../../shared/ui/Button/Button';
import styles from './SettingsView.module.css';

/** Servers the user signed in to, with sign-in and sign-out. */
export function AccountsSetting() {
  const accounts = useAccounts();
  const signOut = useSignOut();
  const [signingIn, setSigningIn] = useState(false);
  const list = accounts.data ?? [];

  return (
    <div className={styles.gitSetting}>
      {list.length === 0 ? (
        <p className={styles.hint}>Not signed in to any server.</p>
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
      <div className={styles.pathRow}>
        <Button
          size="sm"
          onClick={() => {
            setSigningIn(true);
          }}
        >
          Sign in…
        </Button>
      </div>
      {signingIn && (
        <SignInDialog
          onCancel={() => {
            setSigningIn(false);
          }}
          onSignedIn={() => {
            setSigningIn(false);
          }}
        />
      )}
    </div>
  );
}
