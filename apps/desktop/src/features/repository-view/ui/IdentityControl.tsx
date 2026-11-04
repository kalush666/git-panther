import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, KeyRound, UserRound } from 'lucide-react';
import { useState } from 'react';

import { ipc, unwrap, type Identity } from '../../../shared/ipc';
import { signingFor, useIdentityProfiles } from '../../../shared/preferences/identities';
import { Button } from '../../../shared/ui/Button/Button';
import { repositoryQueryKey } from '../api/useRepository';
import { useRepositoryMutation } from '../api/useRepositoryMutation';
import menu from './menu.module.css';
import styles from './IdentityControl.module.css';

const describe = (identity: Identity) => `${identity.name} <${identity.email}>`;

/** Who the next commit is by: switch profiles in one click, or edit in place. */
export function IdentityControl({ path }: { path: string }) {
  const identity = useQuery({
    queryKey: [...repositoryQueryKey(path), 'identity'],
    queryFn: async () => unwrap(await ipc.getIdentity(path)),
  });
  const apply = useRepositoryMutation(path, (next: Identity) => ipc.setIdentity(path, next));
  const profiles = useIdentityProfiles((state) => state.profiles);
  const saveProfile = useIdentityProfiles((state) => state.save);
  const [editing, setEditing] = useState(false);
  const current = identity.data ?? null;

  if (editing || (identity.isSuccess && current === null)) {
    return (
      <IdentityEditor
        initial={current}
        error={apply.error?.message ?? null}
        isPending={apply.isPending}
        onCancel={
          current
            ? () => {
                setEditing(false);
                apply.reset();
              }
            : undefined
        }
        onSave={(next, remember) => {
          apply.mutate(next, {
            onSuccess: () => {
              if (remember) saveProfile(next);
              setEditing(false);
            },
          });
        }}
      />
    );
  }

  return (
    <div className={styles.line}>
      <UserRound size={13} aria-hidden className={styles.icon} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={styles.trigger} aria-label="Commit as">
          <span className={styles.who} title={current ? describe(current) : undefined}>
            {current ? describe(current) : '…'}
          </span>
          {current?.signing && <KeyRound size={12} aria-label="signed" />}
          <ChevronDown size={12} aria-hidden />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menu.content} align="start" sideOffset={4}>
            {profiles.map((profile) => {
              const active = current?.email === profile.email && current.name === profile.name;
              return (
                <DropdownMenu.Item
                  key={profile.id}
                  className={menu.item}
                  onSelect={() => {
                    apply.mutate(profile);
                  }}
                >
                  <span className={styles.check}>{active && <Check size={13} />}</span>
                  {describe(profile)}
                  {profile.signing && <KeyRound size={12} aria-label="signed" />}
                </DropdownMenu.Item>
              );
            })}
            {profiles.length > 0 && <DropdownMenu.Separator className={menu.separator} />}
            <DropdownMenu.Item
              className={menu.item}
              onSelect={() => {
                setEditing(true);
              }}
            >
              Edit identity for this repository…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

interface IdentityEditorProps {
  initial: Identity | null;
  error: string | null;
  isPending: boolean;
  /** Absent while git has no identity yet: one must be set to commit. */
  onCancel?: () => void;
  onSave: (identity: Identity, remember: boolean) => void;
}

function IdentityEditor({ initial, error, isPending, onCancel, onSave }: IdentityEditorProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [key, setKey] = useState(initial?.signing?.key ?? '');
  const [remember, setRemember] = useState(true);
  return (
    <form
      className={styles.editor}
      aria-label="Commit identity"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ name: name.trim(), email: email.trim(), signing: signingFor(key) }, remember);
      }}
    >
      {!initial && <p className={styles.hint}>Git needs a name and email before you can commit.</p>}
      <input
        className={styles.input}
        aria-label="Name"
        placeholder="Name"
        value={name}
        autoFocus
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <input
        className={styles.input}
        aria-label="Email"
        placeholder="Email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
      />
      <input
        className={styles.input}
        aria-label="Signing key (optional)"
        placeholder="Signing key: GPG key id or SSH key path (optional)"
        value={key}
        spellCheck={false}
        onChange={(event) => {
          setKey(event.target.value);
        }}
      />
      <label className={styles.remember}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => {
            setRemember(event.target.checked);
          }}
        />
        Save as a profile
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={isPending || !name.trim() || !email.trim()}
        >
          Use for this repository
        </Button>
      </div>
    </form>
  );
}
