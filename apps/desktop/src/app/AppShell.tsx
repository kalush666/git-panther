import { Settings } from 'lucide-react';
import { useState } from 'react';

import { GitRequiredScreen, GitVersionBadge, useGitInstallation } from '../features/git-check';
import { TabBar, useTabsStore } from '../features/repository-tabs';
import { RepositoryView } from '../features/repository-view';
import { SettingsView } from '../features/settings';
import { ThemeMenu } from '../features/theme';
import { WelcomeScreen } from '../features/welcome';
import { Button } from '../shared/ui/Button/Button';
import styles from './AppShell.module.css';

export function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => {
    setSettingsOpen(true);
  };
  return (
    <div className={styles.shell}>
      <header className={styles.titleBar}>
        <span className={styles.productName}>Git Panther</span>
        <div className={styles.tabs}>
          <TabBar />
        </div>
        <div className={styles.titleBarActions}>
          <ThemeMenu />
          <Button
            size="sm"
            variant="ghost"
            aria-label="Settings"
            aria-pressed={settingsOpen}
            title="Settings"
            onClick={() => {
              setSettingsOpen(!settingsOpen);
            }}
          >
            <Settings size={16} strokeWidth={1.75} />
          </Button>
        </div>
      </header>
      <main className={styles.content}>
        {settingsOpen ? (
          <SettingsView
            onClose={() => {
              setSettingsOpen(false);
            }}
          />
        ) : (
          <MainContent onOpenSettings={openSettings} />
        )}
      </main>
      <footer className={styles.statusBar}>
        <GitVersionBadge />
      </footer>
    </div>
  );
}

function MainContent({ onOpenSettings }: { onOpenSettings: () => void }) {
  const installation = useGitInstallation();
  const activePath = useTabsStore((state) => state.activePath);
  const openTab = useTabsStore((state) => state.openTab);
  const closeTab = useTabsStore((state) => state.closeTab);

  if (installation.isPending) {
    return null;
  }
  if (installation.isError || installation.data.status !== 'supported') {
    return <GitRequiredScreen onOpenSettings={onOpenSettings} />;
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
