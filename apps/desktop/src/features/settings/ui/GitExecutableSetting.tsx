import { useState } from 'react';

import { ipc, type GitInstallationDto } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { useCheckGitExecutable, useSetGitExecutable, useSettings } from '../api/useSettings';
import styles from './SettingsView.module.css';

function describe(installation: GitInstallationDto): string {
  switch (installation.status) {
    case 'supported':
      return `git ${installation.version} found.`;
    case 'unsupported':
      return `git ${installation.found} is too old; ${installation.minimum} or newer is needed.`;
    case 'missing':
      return 'No git was found there.';
  }
}

/** Chooses which git to run; empty means git from `PATH`. */
export function GitExecutableSetting() {
  const settings = useSettings();
  const check = useCheckGitExecutable();
  const save = useSetGitExecutable();
  const [draft, setDraft] = useState<string | null>(null);
  const saved = settings.data?.gitExecutable ?? '';
  const value = draft ?? saved;
  const candidate = value.trim() || null;
  const restartNeeded =
    settings.data !== undefined &&
    (settings.data.gitExecutable ?? 'git') !== settings.data.activeGitExecutable;

  const edit = (next: string) => {
    setDraft(next);
    check.reset();
    save.reset();
  };

  return (
    <div className={styles.gitSetting}>
      <div className={styles.pathRow}>
        <input
          className={styles.input}
          aria-label="Git executable"
          placeholder="git (from PATH)"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            edit(event.target.value);
          }}
        />
        <Button
          size="sm"
          onClick={() => {
            void ipc.pickExecutable('Choose git').then((picked) => {
              if (picked) edit(picked);
            });
          }}
        >
          Browse…
        </Button>
      </div>
      <div className={styles.pathRow}>
        <Button
          size="sm"
          variant="ghost"
          disabled={check.isPending}
          onClick={() => {
            check.mutate(candidate);
          }}
        >
          Check
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={save.isPending || candidate === (settings.data?.gitExecutable ?? null)}
          onClick={() => {
            save.mutate(candidate, {
              onSuccess: () => {
                setDraft(null);
              },
            });
          }}
        >
          Save
        </Button>
        {candidate !== null && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              edit('');
            }}
          >
            Use git from PATH
          </Button>
        )}
      </div>
      {check.data && (
        <p
          className={styles.status}
          data-tone={check.data.status === 'supported' ? 'ok' : 'error'}
          role="status"
        >
          {describe(check.data)}
        </p>
      )}
      {(save.error ?? check.error) && (
        <p className={styles.status} data-tone="error" role="alert">
          {(save.error ?? check.error)?.message}
        </p>
      )}
      {restartNeeded && (
        <div className={styles.restart} role="status">
          <span>Restart Git Panther to use the new git.</span>
          <Button
            size="sm"
            onClick={() => {
              void ipc.restartApp();
            }}
          >
            Restart now
          </Button>
        </div>
      )}
    </div>
  );
}
