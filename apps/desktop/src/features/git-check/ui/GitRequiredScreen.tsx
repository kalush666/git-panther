import { TriangleAlert } from 'lucide-react';

import type { GitInstallationDto } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { useGitInstallation } from '../api/useGitInstallation';
import styles from './GitRequiredScreen.module.css';

function describeProblem(installation: GitInstallationDto | undefined): string {
  switch (installation?.status) {
    case 'missing':
      return `Git Panther uses the git installed on your computer, but none was found on your PATH. Install git ${installation.minimum} or newer (from your organization's software catalog or git-scm.com), then retry.`;
    case 'unsupported':
      return `Git ${installation.found} is installed, but Git Panther needs ${installation.minimum} or newer. Update git (from your organization's software catalog or git-scm.com), then retry.`;
    default:
      return 'Git Panther could not check your git installation.';
  }
}

export function GitRequiredScreen() {
  const installation = useGitInstallation();
  const details = installation.error?.message;

  return (
    <section className={styles.screen} aria-labelledby="git-required-title">
      <TriangleAlert className={styles.icon} size={32} strokeWidth={1.75} aria-hidden />
      <h1 id="git-required-title" className={styles.title}>
        Git is required
      </h1>
      <p className={styles.message}>{describeProblem(installation.data)}</p>
      {details && <p className={styles.details}>{details}</p>}
      <Button
        variant="primary"
        onClick={() => void installation.refetch()}
        disabled={installation.isFetching}
      >
        {installation.isFetching ? 'Checking…' : 'Retry'}
      </Button>
    </section>
  );
}
