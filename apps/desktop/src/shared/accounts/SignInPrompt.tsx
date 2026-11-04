import { InlinePrompt } from '../ui/InlinePrompt/InlinePrompt';
import { hostOf, useLastUsername, useSignIn } from './useAccounts';

interface SignInPromptProps {
  /** The HTTPS server that refused, taken from the remote or the clone URL. */
  server: string;
  /** What signing in is for, e.g. "to push". */
  purpose: string;
  /** Tries the credentials against this repository's remote before keeping them. */
  repository?: string;
  onSignedIn: () => void;
  onCancel: () => void;
}

/**
 * Asks only for the personal number and password, like a git server's own
 * login: the server is already known. The password goes to the git
 * credential manager, never to Git Panther.
 */
export function SignInPrompt({
  server,
  purpose,
  repository,
  onSignedIn,
  onCancel,
}: SignInPromptProps) {
  const signIn = useSignIn();
  const lastUsername = useLastUsername();
  return (
    <InlinePrompt
      title={`Sign in to ${hostOf(server)} ${purpose}`}
      fields={[
        {
          label: 'Personal number or user name',
          initial: lastUsername,
          placeholder: 'p1234567',
          autoComplete: 'username',
        },
        { label: 'Password', initial: '', secret: true, autoComplete: 'current-password' },
      ]}
      submitLabel={signIn.isPending ? 'Signing in…' : 'Sign in'}
      error={signIn.error?.message ?? null}
      isPending={signIn.isPending}
      onSubmit={([username = '', password = '']) => {
        signIn.mutate(
          { server, username, password, repository: repository ?? null },
          { onSuccess: onSignedIn },
        );
      }}
      onCancel={onCancel}
    />
  );
}
