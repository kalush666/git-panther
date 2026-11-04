import { KeyRound, Trash2 } from 'lucide-react';

import { useIdentityProfiles } from '../../../shared/preferences/identities';
import styles from './SettingsView.module.css';

/** Saved identities; new ones are saved from the commit box of any repository. */
export function IdentitiesSetting() {
  const profiles = useIdentityProfiles((state) => state.profiles);
  const remove = useIdentityProfiles((state) => state.remove);
  if (profiles.length === 0) {
    return (
      <p className={styles.hint}>
        None yet. Edit the identity in a repository&apos;s commit box and keep “Save as a profile”
        ticked.
      </p>
    );
  }
  return (
    <ul className={styles.accounts} aria-label="Identities">
      {profiles.map((profile) => (
        <li key={profile.id} className={styles.account}>
          <span className={styles.accountName}>
            <strong>{profile.name}</strong>
            <span className={styles.hint}>
              {profile.email}
              {profile.signing && (
                <>
                  {' · '}
                  <KeyRound size={11} aria-hidden /> signs with {profile.signing.key}
                </>
              )}
            </span>
          </span>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Remove ${profile.name} <${profile.email}>`}
            onClick={() => {
              remove(profile.id);
            }}
          >
            <Trash2 size={13} aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
