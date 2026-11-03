import { GitRequiredScreen, GitVersionBadge, useGitInstallation } from '../features/git-check';
import { ThemeMenu } from '../features/theme';
import { WelcomeScreen } from '../features/welcome';
import styles from './AppShell.module.css';

export function AppShell() {
  return (
    <div className={styles.shell}>
      <header className={styles.titleBar}>
        <span className={styles.productName}>Git Panther</span>
        <div className={styles.titleBarActions}>
          <ThemeMenu />
        </div>
      </header>
      <main className={styles.content}>
        <MainContent />
      </main>
      <footer className={styles.statusBar}>
        <GitVersionBadge />
      </footer>
    </div>
  );
}

function MainContent() {
  const installation = useGitInstallation();

  if (installation.isPending) {
    return null;
  }
  if (installation.isError || installation.data.status !== 'supported') {
    return <GitRequiredScreen />;
  }
  return <WelcomeScreen />;
}
