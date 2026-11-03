import { GitRequiredScreen, GitVersionBadge, useGitInstallation } from '../features/git-check';
import { TabBar, useTabsStore } from '../features/repository-tabs';
import { RepositoryView } from '../features/repository-view';
import { ThemeMenu } from '../features/theme';
import { WelcomeScreen } from '../features/welcome';
import styles from './AppShell.module.css';

export function AppShell() {
  return (
    <div className={styles.shell}>
      <header className={styles.titleBar}>
        <span className={styles.productName}>Git Panther</span>
        <div className={styles.tabs}>
          <TabBar />
        </div>
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
  const activePath = useTabsStore((state) => state.activePath);
  const openTab = useTabsStore((state) => state.openTab);
  const closeTab = useTabsStore((state) => state.closeTab);

  if (installation.isPending) {
    return null;
  }
  if (installation.isError || installation.data.status !== 'supported') {
    return <GitRequiredScreen />;
  }
  if (activePath === null) {
    return (
      <WelcomeScreen
        onOpened={(repository) => {
          openTab({ path: repository.path, name: repository.name });
        }}
      />
    );
  }
  return (
    <RepositoryView
      key={activePath}
      path={activePath}
      onClose={() => {
        closeTab(activePath);
      }}
    />
  );
}
